// The numbers for a small flat map of one satellite: where it is, the ground track of one orbit split at the date line, and the night side at one moment.
// The land is chizu's. This file does not draw, and it does not import chizu.
import { groundTrack, groundTrackState } from "../passes/passes.ts";
import { subsolarPoint } from "../realistic/sun.ts";
import type { ElementSet } from "../satellites/types.ts";

const RAD = Math.PI / 180;
/** Degrees of longitude between samples of the day-night boundary. */
const NIGHT_STEP = 3;
/** Below this many degrees of solar declination the boundary is the two meridians, not a single curve. */
const FLAT_SUN = 2;
/** Seconds between ground-track samples. A small map does not need a point every ten seconds. */
const TRACK_STEP = 30;
/** The longest window, minutes: a day. Longer would be a second map of the same orbit. */
const MAX_SPAN = 24 * 60;

/**
 * One thing the small map draws: part of the ground track, the point under the satellite, or the night side. Latitudes and longitudes are degrees. A line's longitudes stay on one side of the date line. The night ring's longitudes run on without a jump.
 *
 * @example
 * ```ts
 * import type { TrackPiece } from "@johnmorrisdotca/chikyu-earth/track";
 *
 * const piece: TrackPiece = { kind: "mark", at: [0, 0] };
 * console.log(piece.kind);
 * ```
 */
export type TrackPiece =
  | { kind: "line"; part: "past" | "coming"; points: readonly (readonly [number, number])[] }
  | { kind: "mark"; at: readonly [number, number] }
  | { kind: "night"; ring: readonly (readonly [number, number])[] };

/**
 * The day-night boundary at one moment, as a ring whose inside is the night side. Longitudes run on (170 then 190, not 170 then -170), and the ring closes along the edge of the night pole, so a flat map can fill it without covering the day.
 *
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @returns The ring, latitude then longitude, in degrees.
 *
 * @example
 * ```ts
 * import { nightSide } from "@johnmorrisdotca/chikyu-earth/track";
 *
 * const ring = nightSide(Date.UTC(2026, 10, 3, 12));
 * console.log(ring.length > 3);
 * ```
 */
export function nightSide(ms: number): readonly (readonly [number, number])[] {
  const sun = subsolarPoint(ms);
  if (Math.abs(sun.lat) < FLAT_SUN) {
    const west = sun.lon + 90;
    const east = sun.lon + 270;
    return [
      [90, west],
      [-90, west],
      [-90, east],
      [90, east],
    ];
  }
  const pole = sun.lat >= 0 ? -90 : 90;
  const start = sun.lon - 180;
  const end = sun.lon + 180;
  const ring: (readonly [number, number])[] = [];
  for (let lon = start; lon < end; lon += NIGHT_STEP) ring.push([terminatorLat(sun.lat, lon - sun.lon), lon]);
  ring.push([terminatorLat(sun.lat, 180), end], [pole, end], [pole, start]);
  return ring;
}

/** The latitude where the Sun's zenith distance is 90 degrees, at `dlon` degrees east of the subsolar point. `atan` keeps it between -90 and 90; `atan2` would run past a pole when the Sun is in the other hemisphere. */
function terminatorLat(sunLat: number, dlon: number): number {
  return Math.atan((-Math.cos(dlon * RAD) * Math.cos(sunLat * RAD)) / Math.sin(sunLat * RAD)) / RAD;
}

/**
 * What the small map draws for one satellite at one moment: the night side, the ground track for `spanMinutes` (half of it already flown, half still to come) split into a line each time it crosses the date line, and the point under the satellite.
 * With no span, the window is one orbit, from the mean motion. A moment SGP4 cannot place is left out; the night side is still returned.
 *
 * @param set - The satellite's elements.
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @param spanMinutes - The window, in minutes, centred on `ms`. One orbit when omitted.
 * @returns The pieces, night first, then the lines, then the mark.
 *
 * @example
 * ```ts
 * import { trackPicture } from "@johnmorrisdotca/chikyu-earth/track";
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
 * const picture = trackPicture(iss, Date.UTC(2026, 10, 3, 12), 90);
 * console.log(picture.some((piece) => piece.kind === "mark"));
 * ```
 */
export function trackPicture(set: ElementSet, ms: number, spanMinutes?: number): TrackPiece[] {
  const pieces: TrackPiece[] = [{ kind: "night", ring: nightSide(ms) }];
  const span = spanOf(set, spanMinutes);
  const half = (span * 60_000) / 2;
  const samples = groundTrack(set, ms - half, ms + half, TRACK_STEP);
  const past = samples.filter((point) => point.ms <= ms);
  const coming = samples.filter((point) => point.ms >= ms);
  if (past.length > 0 && coming.length > 0 && past[past.length - 1]!.ms < coming[0]!.ms) {
    past.push(coming[0]!);
    coming.unshift(past[past.length - 2]!);
  }
  for (const part of splitDateLine(past)) pieces.push({ kind: "line", part: "past", points: part });
  for (const part of splitDateLine(coming)) pieces.push({ kind: "line", part: "coming", points: part });
  const state = groundTrackState(set, ms);
  if (state) pieces.push({ kind: "mark", at: [state.lat, state.lon] });
  return pieces;
}

/** Minutes of track. A given span wins; otherwise one orbit; never more than a day. */
function spanOf(set: ElementSet, spanMinutes: number | undefined): number {
  if (spanMinutes !== undefined && Number.isFinite(spanMinutes) && spanMinutes > 0) return Math.min(spanMinutes, MAX_SPAN);
  const motion = set.MEAN_MOTION;
  if (Number.isFinite(motion) && motion > 0) return Math.min(1440 / motion, MAX_SPAN);
  return 96;
}

/**
 * Break a ground track wherever the folded longitude jumps across the date line, and end each piece on the line itself (±180) so the two pieces meet at the edge of the map.
 *
 * @param points - Points in time order, longitude folded into -180 to 180.
 * @returns One run of `[lat, lon]` per piece. A run of one point is left out.
 */
function splitDateLine(points: readonly { lat: number; lon: number }[]): (readonly [number, number])[][] {
  const parts: [number, number][][] = [];
  let current: [number, number][] = [];
  const push = (): void => {
    if (current.length >= 2) parts.push(current);
  };
  for (const point of points) {
    const prev = current[current.length - 1];
    if (prev && Math.abs(point.lon - prev[1]) > 180) {
      const raw = point.lon - prev[1];
      const short = raw > 180 ? raw - 360 : raw + 360;
      const edge = short > 0 ? 180 : -180;
      const distance = Math.abs(short);
      const toEdge = short > 0 ? 180 - prev[1] : prev[1] + 180;
      const fraction = distance === 0 ? 0 : toEdge / distance;
      const lat = prev[0] + (point.lat - prev[0]) * fraction;
      current.push([lat, edge]);
      push();
      current = [[lat, -edge]];
    }
    current.push([point.lat, point.lon]);
  }
  push();
  return parts;
}
