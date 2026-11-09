// The day and night sheet and the seasons sheet: the Earth with the Sun's light on one half (hatched where it is night), and the Earth at four points round the Sun with its tilt. Pure: a string of SVG measured in millimetres.
import { geoCircle, geoDistance, geoOrthographic, geoPath } from "d3-geo";
import { subsolarPoint } from "../realistic/sun.ts";
import { hatchPath } from "./hatch.ts";
import { continentLines } from "./land.ts";
import { thickPath } from "./outline.ts";
import { SAY, TILT_DEGREES, TITLES, dayNightFacts, seasonsFacts } from "./text.ts";
import { TYPES, factsBlock, haloText, innerMm, labelMm, nameBlock, outlineMm, svgOpen, textWidth, type Lang } from "./common.ts";
import type { SheetOptions } from "./earth.ts";

const GAP = 5;
const RAD = Math.PI / 180;
/** How far the view of the day and night globe is tipped to show the north (degrees): the line between day and night is then a curve. */
export const DAY_NIGHT_TIP = 20;

/**
 * The turn of the globe on the day and night sheet for a moment: the Sun's longitude less 90 degrees at the middle, so the lit half is on the right, tipped to show the north.
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @returns The place at the middle of the globe, the place where the Sun is straight overhead and the roll of the globe about the line of sight, in degrees.
 *
 * @example
 * ```ts
 * import { dayNightView } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const view = dayNightView(Date.UTC(2026, 5, 21, 12));
 * console.log(view.sun.lat.toFixed(1));
 * ```
 */
export function dayNightView(ms: number): { centre: [number, number]; sun: { lon: number; lat: number }; roll: number } {
  const sun = subsolarPoint(ms);
  const centre: [number, number] = [sun.lon - 90, DAY_NIGHT_TIP];
  // the globe is rolled a little about the line of sight so the Sun is straight to the right of it (the Earth's axis then leans, as it does)
  const flat = geoOrthographic().rotate([-centre[0], -centre[1]]).translate([0, 0]).scale(1);
  const at = flat([sun.lon, sun.lat]) ?? [1, 0];
  const roll = (Math.atan2(-at[1], at[0]) * 180) / Math.PI;
  const side = (g: number): number => Math.abs(geoOrthographic().rotate([-centre[0], -centre[1], g]).translate([0, 0]).scale(1)([sun.lon, sun.lat])?.[1] ?? 1);
  return { centre, sun, roll: side(roll) <= side(-roll) ? roll : -roll };
}

/**
 * The line between day and night at a moment: the points 90 degrees from where the Sun is straight overhead, as longitude and latitude.
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @param points - How many points (at least 3, default 72).
 * @returns The points in order round the Earth.
 *
 * @example
 * ```ts
 * import { terminator } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(terminator(Date.UTC(2026, 2, 20, 12), 8).length);
 * ```
 */
export function terminator(ms: number, points = 72): [number, number][] {
  const sun = subsolarPoint(ms);
  const ring = geoCircle().center([sun.lon + 180, -sun.lat]).radius(90).precision(360 / Math.max(3, points))();
  return (ring.coordinates[0] as [number, number][]).slice(0, -1);
}

/** The Sun as a drawing: a disc with rays. */
function sunIcon(x: number, y: number, radius: number, thick: number): string {
  const rays: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI / 4) * i;
    rays.push(`M${(x + Math.cos(a) * (radius + thick * 1.6)).toFixed(2)} ${(y + Math.sin(a) * (radius + thick * 1.6)).toFixed(2)}L${(x + Math.cos(a) * (radius + thick * 1.6 + 3)).toFixed(2)} ${(y + Math.sin(a) * (radius + thick * 1.6 + 3)).toFixed(2)}`);
  }
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="#000" stroke-width="${thick}" data-sun-icon=""/><path d="${rays.join("")}" fill="none" stroke="#000" stroke-width="${thick}" stroke-linecap="round"/>`;
}

/** An arrow from (x0, y0) to (x1, y1) with a head. */
function arrow(x0: number, y0: number, x1: number, y1: number, thick: number): string {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const head = thick * 2;
  const hx = (k: number): string => (x1 - Math.cos(a + k) * head).toFixed(2);
  const hy = (k: number): string => (y1 - Math.sin(a + k) * head).toFixed(2);
  return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}M${hx(0.55)} ${hy(0.55)}L${x1.toFixed(2)} ${y1.toFixed(2)}L${hx(-0.55)} ${hy(-0.55)}" fill="none" stroke="#000" stroke-width="${thick}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * The day and night sheet: the Earth with the Sun's light coming from the right, the lit half left white (day) and the dark half hatched (night), the line between them thick, and three facts, for the date and time you give. The line is worked out from the package's own sun position.
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @param options - The room, the language and the type.
 * @returns The `<svg>` markup, carrying the place of the Sun as `data-sun`.
 *
 * @example
 * ```ts
 * import { dayNightSvg } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const svg = dayNightSvg(Date.UTC(2026, 5, 21, 12), { widthMm: 184.6, heightMm: 180 });
 * console.log(svg.includes("data-sun="), svg.includes("Night"));
 * ```
 */
export function dayNightSvg(ms: number, options: SheetOptions): string {
  const { widthMm: w, heightMm: h } = options;
  const lang: Lang = options.lang ?? "en";
  const type = options.type ?? "kid";
  const outline = outlineMm(type);
  const inner = innerMm(type);
  const facts = factsBlock(dayNightFacts(ms, lang), w, 0, type);
  const free = h - facts.height - GAP;
  const zone = type === "kid" ? 40 : 28;
  const reachOut = type === "kid" ? 22 : 14;
  const diameter = Math.min(w - zone - reachOut, free);
  const radius = diameter / 2 - outline / 2;
  const left = (w - (diameter + zone + reachOut)) / 2;
  const cx = left + diameter / 2;
  const cy = free / 2;
  const { centre, sun, roll } = dayNightView(ms);
  const projection = geoOrthographic().rotate([-centre[0], -centre[1], roll]).translate([cx, cy]).scale(radius).clipAngle(90).precision(0.3);
  const path = geoPath(projection);
  const sunAt: [number, number] = [sun.lon, sun.lat];
  const night = (x: number, y: number): boolean => {
    if (Math.hypot(x - cx, y - cy) > radius) return false;
    const place = projection.invert?.([x, y]);
    return place !== null && place !== undefined && Number.isFinite(place[0]) && geoDistance(place, sunAt) > Math.PI / 2;
  };
  const shade = hatchPath({ x0: cx - radius, y0: cy - radius, x1: cx + radius, y1: cy + radius }, type === "kid" ? 3.2 : 1.6, 45, night);
  const coast = thickPath(path({ type: "MultiLineString", coordinates: continentLines(0.0006) }) ?? "", outline * 0.4, outline * 3.5);
  const line = path(geoCircle().center([sun.lon + 180, -sun.lat]).radius(90).precision(1)()) ?? "";
  const size = labelMm(type);
  const dayWord = nameBlock([SAY[lang].day], cx + radius * 0.5, cy - radius * 0.12, size, ' data-say="day"');
  const nightWord = nameBlock([SAY[lang].night], cx - radius * 0.5, cy - radius * 0.12, size, ' data-say="night"');
  const sx = left + diameter + reachOut + zone / 2;
  const sunRadius = type === "kid" ? 11 : 7;
  const arrows = [-0.5, 0, 0.5].map((k) => arrow(sx - zone / 2 - 1, cy + k * radius * 0.7, cx + Math.sqrt(Math.max(0, 1 - (k * 0.7) ** 2)) * radius + 4, cy + k * radius * 0.7, inner)).join("");
  const sunWord = nameBlock([SAY[lang].sun], sx, cy + sunRadius + 20, size);
  const picture =
    `<path d="${shade}" fill="none" stroke="#000" stroke-width="${type === "kid" ? 0.9 : 0.35}" stroke-linecap="round" data-night=""/>` +
    `<path d="${line}" fill="none" stroke="#000" stroke-width="${inner}" data-terminator=""/>` +
    `<path d="${coast}" fill="none" stroke="#000" stroke-width="${outline}" stroke-linecap="round" stroke-linejoin="round" data-coast=""/>` +
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#000" stroke-width="${outline}" data-rim=""/>` +
    `${dayWord.markup}${nightWord.markup}${arrows}${sunIcon(sx, cy, sunRadius, inner)}${sunWord.markup}`;
  return `${svgOpen(w, h, TITLES.daynight(lang), "daynight").replace("<svg ", `<svg data-sun="${sun.lon.toFixed(3)} ${sun.lat.toFixed(3)}" data-view="${centre[0].toFixed(3)} ${centre[1]} ${roll.toFixed(3)}" data-disc="${cx.toFixed(3)} ${cy.toFixed(3)} ${radius.toFixed(3)}" `)}${picture}<g transform="translate(0 ${h - facts.height})">${facts.markup}</g></svg>`;
}

/** One Earth of the seasons sheet: a disc with the night half hatched, the equator and the tilted axis with a dot at the north. */
function earth(x: number, y: number, radius: number, towardSun: [number, number], type: "kid" | "normal"): string {
  const outline = outlineMm(type);
  const inner = innerMm(type);
  const tilt = TILT_DEGREES;
  const dark = (px: number, py: number): boolean => Math.hypot(px - x, py - y) <= radius && (px - x) * towardSun[0] + (py - y) * towardSun[1] < 0;
  const shade = hatchPath({ x0: x - radius, y0: y - radius, x1: x + radius, y1: y + radius }, type === "kid" ? 2.8 : 1.4, 45, dark);
  const sin = Math.sin(tilt * RAD);
  const cos = Math.cos(tilt * RAD);
  const reach = radius * 1.4;
  const north: [number, number] = [x + sin * reach, y - cos * reach];
  const south: [number, number] = [x - sin * reach, y + cos * reach];
  const dot = type === "kid" ? 2.6 : 1.4;
  return (
    `<path d="${shade}" fill="none" stroke="#000" stroke-width="${type === "kid" ? 0.8 : 0.3}" stroke-linecap="round" data-night=""/>` +
    `<path d="M${south[0].toFixed(2)} ${south[1].toFixed(2)}L${north[0].toFixed(2)} ${north[1].toFixed(2)}" fill="none" stroke="#000" stroke-width="${inner}" stroke-linecap="round" data-axis=""/>` +
    `<circle cx="${north[0].toFixed(2)}" cy="${north[1].toFixed(2)}" r="${dot}" fill="#000"/>` +
    `<circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="#000" stroke-width="${outline}" data-earth=""/>`
  );
}

/**
 * The seasons sheet: the Sun in the middle, the Earth's orbit as a ring, and the Earth at four points of it (March, June, September and December), each with its tilt, the dark half hatched, the season of the northern half named, and three facts.
 * The axis leans the same way at all four, so in June the north leans toward the Sun and in December away from it.
 * @param options - The room, the language and the type.
 * @returns The `<svg>` markup.
 *
 * @example
 * ```ts
 * import { seasonsSvg } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const svg = seasonsSvg({ widthMm: 184.6, heightMm: 180, lang: "en" });
 * console.log(svg.includes("Summer"), svg.includes("Winter"));
 * ```
 */
export function seasonsSvg(options: SheetOptions): string {
  const { widthMm: w, heightMm: h } = options;
  const lang: Lang = options.lang ?? "en";
  const type = options.type ?? "kid";
  const inner = innerMm(type);
  const facts = factsBlock(seasonsFacts(lang), w, 0, type);
  const free = h - facts.height - GAP;
  const size = labelMm(type);
  const month = TYPES[type].bodyMm;
  const radius = Math.max(6, Math.min(type === "kid" ? 13 : 8, free * 0.1));
  const cx = w / 2;
  const cy = free / 2;
  const ry = Math.max(radius * 2, free / 2 - radius - 4 - size * 1.15 - 2);
  const rx = Math.min(cx - radius - (type === "kid" ? 22 : 14), ry * 2.8);
  const sunRadius = Math.max(4, Math.min(type === "kid" ? 10 : 6, ry - radius - inner * 1.6 - 6));
  const say = SAY[lang];
  // the Earth at the right is December, at the top March, at the left June, at the bottom September, one way round
  const stops = [
    { angle: 0, season: say.winter, month: say.months[3] },
    { angle: 90, season: say.spring, month: say.months[0] },
    { angle: 180, season: say.summer, month: say.months[1] },
    { angle: 270, season: say.autumn, month: say.months[2] },
  ];
  const at = (angle: number): [number, number] => [cx + rx * Math.cos(angle * RAD), cy - ry * Math.sin(angle * RAD)];
  const parts: string[] = [];
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#000" stroke-width="${inner}" stroke-dasharray="${inner * 2.4} ${inner * 1.6}" data-orbit=""/>`);
  for (const angle of [60, 120, 240, 300]) {
    const [px, py] = at(angle);
    const tx = -rx * Math.sin(angle * RAD);
    const ty = -ry * Math.cos(angle * RAD);
    const length = Math.hypot(tx, ty);
    const ux = tx / length;
    const uy = ty / length;
    const head = inner * 1.8;
    parts.push(`<polygon points="${(px + ux * head).toFixed(2)},${(py + uy * head).toFixed(2)} ${(px - ux * head - uy * head * 0.8).toFixed(2)},${(py - uy * head + ux * head * 0.8).toFixed(2)} ${(px - ux * head + uy * head * 0.8).toFixed(2)},${(py - uy * head - ux * head * 0.8).toFixed(2)}" fill="#000" data-way=""/>`);
  }
  parts.push(sunIcon(cx, cy, sunRadius, inner));
  for (const stop of stops) {
    const [px, py] = at(stop.angle);
    const toSun: [number, number] = [(cx - px) / Math.hypot(cx - px, cy - py), (cy - py) / Math.hypot(cx - px, cy - py)];
    parts.push(`<g data-season="${stop.angle}">${earth(px, py, radius, toSun, type)}</g>`);
    if (stop.angle === 90 || stop.angle === 270) {
      // above the top Earth and below the bottom one the season and the month are one line
      const seasonW = textWidth(stop.season, size);
      const monthW = textWidth(stop.month, month);
      const left = px - (seasonW + 3 + monthW) / 2;
      const base = stop.angle === 90 ? py - radius - 4 : py + radius + 4 + size * 0.8;
      parts.push(haloText(left + seasonW / 2, base, size, stop.season, ' data-say="season"'));
      parts.push(haloText(left + seasonW + 3 + monthW / 2, base, month, stop.month, ' data-say="month"'));
    } else {
      const first = py + radius + 4 + size * 0.8;
      parts.push(haloText(px, first, size, stop.season, ' data-say="season"'));
      parts.push(haloText(px, first + month * 1.3, month, stop.month, ' data-say="month"'));
    }
  }
  return `${svgOpen(w, h, TITLES.seasons(lang), "seasons")}${parts.join("")}<g transform="translate(0 ${h - facts.height})">${facts.markup}</g></svg>`;
}
