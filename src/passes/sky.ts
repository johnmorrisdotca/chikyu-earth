// The sky dome of a pass, as an SVG string: the horizon as a circle, the zenith at its middle, north up and east on the left (the way a star chart is held over your head), and the satellite's track across it.
import type { PathPoint, SatellitePass } from "./passes.ts";

const RAD = Math.PI / 180;

/**
 * The words on a sky dome: the four directions and the three marks on the track. English by default; pass your own (the demo passes Japanese).
 *
 * @example
 * ```ts
 * import type { SkyLabels } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const japanese: SkyLabels = { north: "北", east: "東", south: "南", west: "西", start: "出", highest: "最高", end: "入", zenith: "真上" };
 * console.log(japanese.north);
 * ```
 */
export interface SkyLabels {
  north: string;
  east: string;
  south: string;
  west: string;
  start: string;
  highest: string;
  end: string;
  zenith: string;
}

const ENGLISH: SkyLabels = { north: "N", east: "E", south: "S", west: "W", start: "start", highest: "highest", end: "end", zenith: "overhead" };

/**
 * What `skySvg` may be asked.
 *
 * @example
 * ```ts
 * import type { SkyOptions } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const options: SkyOptions = { size: 320, times: { start: "18:21", highest: "18:24", end: "18:27" } };
 * console.log(options.size);
 * ```
 */
export interface SkyOptions {
  /** Width and height of the SVG in pixels (320 by default). */
  size?: number;
  /** The words, any of them (English where missing). */
  labels?: Partial<SkyLabels>;
  /** A time to write beside each mark, already in the place's own time. */
  times?: { start?: string; highest?: string; end?: string };
  /** The description for a screen reader (a plain sentence is made from the pass when missing). */
  description?: string;
}

const escape = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const round = (n: number): string => (Math.round(n * 10) / 10).toString();

/**
 * A pass drawn on the sky as an SVG string: the horizon as a circle, the zenith (straight overhead) in the middle with rings at 30 and 60 degrees, north up and east on the left (the way a star chart is held over your head), and
 * the satellite's track as a line that is solid and warm where the satellite is in sunlight and dashed where it is in the Earth's shadow, with its start, highest point and end marked. The dome is a dark sky whatever the page's
 * colours; the four directions are written in the page's text colour. It is pure: the same arguments give the same markup.
 *
 * @param pass - A pass from `findPasses`.
 * @param path - Its track from `passPath`.
 * @param options - The size, the words and the times to write beside the marks.
 * @returns One `<svg>` element as text.
 *
 * @example
 * ```ts
 * import { findPasses, passPath, skySvg } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const iss = {
 *   OBJECT_NAME: "ISS (ZARYA)",
 *   EPOCH: "2026-11-02T10:25:21.580320",
 *   MEAN_MOTION: 15.49150046,
 *   ECCENTRICITY: 0.0007139,
 *   INCLINATION: 51.6332,
 *   RA_OF_ASC_NODE: 335.9757,
 *   ARG_OF_PERICENTER: 339.3739,
 *   MEAN_ANOMALY: 20.6961,
 *   NORAD_CAT_ID: 25544,
 *   BSTAR: 0.00012,
 *   MEAN_MOTION_DOT: 0.0001,
 *   MEAN_MOTION_DDOT: 0,
 * };
 * const place = { latitude: 51.5, longitude: -0.13 };
 * const day = Date.UTC(2026, 10, 3);
 * const [first] = findPasses(iss, place, { from: day, to: day + 3 * 86_400_000 }, { all: true });
 * if (first) console.log(skySvg(first, passPath(iss, place, first), { size: 240 }).startsWith("<svg"));
 * ```
 */
export function skySvg(pass: SatellitePass, path: readonly PathPoint[], options: SkyOptions = {}): string {
  const size = options.size ?? 320;
  const words = { ...ENGLISH, ...options.labels };
  const margin = size * 0.09;
  const radius = size / 2 - margin;
  const c = size / 2;
  const at = (azimuth: number, altitude: number): [number, number] => {
    const r = (radius * (90 - Math.max(0, altitude))) / 90;
    return [c - r * Math.sin(azimuth * RAD), c - r * Math.cos(azimuth * RAD)];
  };
  const font = Math.max(10, size * 0.045);
  const parts: string[] = [];
  parts.push(`<circle cx="${c}" cy="${c}" r="${round(radius)}" style="fill:var(--chikyu-sky,#10192b);stroke:currentColor" stroke-width="1.5"/>`);
  for (const ring of [30, 60]) parts.push(`<circle cx="${c}" cy="${c}" r="${round((radius * (90 - ring)) / 90)}" fill="none" stroke="#8fa1b8" stroke-opacity="0.45" stroke-width="1" stroke-dasharray="2 4"/>`);
  parts.push(`<path d="M${round(c - radius)} ${c}H${round(c + radius)}M${c} ${round(c - radius)}V${round(c + radius)}" stroke="#8fa1b8" stroke-opacity="0.35" stroke-width="1"/>`);
  const edge = radius + font * 0.95;
  const letters: [string, number][] = [[words.north, 0], [words.east, 90], [words.south, 180], [words.west, 270]];
  for (const [text, azimuth] of letters) {
    const x = c - edge * Math.sin(azimuth * RAD);
    const y = c - edge * Math.cos(azimuth * RAD) + font * 0.35;
    parts.push(`<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-size="${round(font)}" fill="currentColor" font-weight="600">${escape(text)}</text>`);
  }
  parts.push(`<circle cx="${c}" cy="${c}" r="2" fill="#8fa1b8"/>`);

  // the track: runs of lit and unlit points, each its own line, the shared point joining them
  const runs: { lit: boolean; points: [number, number][] }[] = [];
  for (const point of path) {
    const xy = at(point.azimuth, point.altitude);
    const last = runs[runs.length - 1];
    if (last && last.lit === point.sunlit) last.points.push(xy);
    else {
      const join = last?.points[last.points.length - 1];
      runs.push({ lit: point.sunlit, points: join ? [join, xy] : [xy] });
    }
  }
  for (const run of runs) {
    if (run.points.length < 2) continue;
    const d = run.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`).join("");
    parts.push(
      run.lit
        ? `<path d="${d}" fill="none" style="stroke:var(--chikyu-pass-lit,#ffb454)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" data-lit="true"/>`
        : `<path d="${d}" fill="none" stroke="#8fa1b8" stroke-width="2" stroke-dasharray="4 5" stroke-linecap="round" stroke-linejoin="round" data-lit="false"/>`,
    );
  }

  // the marks: start, highest, end, each with its word and (when given) its time, set inward from the mark so they stay inside the dome
  const mark = (kind: "start" | "highest" | "end", azimuth: number, altitude: number): void => {
    const [x, y] = at(azimuth, altitude);
    const inward = kind === "highest" ? [0, -1] : [(c - x) / Math.max(1, Math.hypot(c - x, c - y)), (c - y) / Math.max(1, Math.hypot(c - x, c - y))];
    const shape =
      kind === "highest"
        ? `<circle cx="${round(x)}" cy="${round(y)}" r="5" fill="#ffffff" stroke="#10192b" stroke-width="1.5"/>`
        : kind === "start"
          ? `<circle cx="${round(x)}" cy="${round(y)}" r="4.5" fill="#6cd0ff" stroke="#10192b" stroke-width="1.5"/>`
          : `<rect x="${round(x - 4.5)}" y="${round(y - 4.5)}" width="9" height="9" fill="#ff8a65" stroke="#10192b" stroke-width="1.5"/>`;
    const tx = x + inward[0]! * (font * 1.7);
    const ty = y + inward[1]! * (font * 1.7) + font * 0.35;
    const time = options.times?.[kind];
    parts.push(
      `<g data-mark="${kind}">${shape}<text x="${round(tx)}" y="${round(ty)}" text-anchor="middle" font-size="${round(font * 0.85)}" fill="#e6edf7" stroke="#10192b" stroke-width="2.5" paint-order="stroke">${escape(words[kind])}${time ? ` ${escape(time)}` : ""}</text></g>`,
    );
  };
  mark("start", pass.start.azimuth, pass.start.altitude);
  mark("highest", pass.highest.azimuth, pass.highest.altitude);
  mark("end", pass.end.azimuth, pass.end.altitude);

  const description =
    options.description ??
    `${pass.name} crosses the sky from ${pass.start.compass} to ${pass.end.compass}, highest ${Math.round(pass.highest.altitude)} degrees up in the ${pass.highest.compass}.`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escape(description)}" ` +
    `font-family="system-ui, sans-serif">${parts.join("")}</svg>`
  );
}
