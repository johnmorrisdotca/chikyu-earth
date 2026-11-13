// Which satellites are nearest a place, a direction in the sky, or another satellite. Positions come from the group's SGP4 (`exact`), once per call, never on a timer.
// The Earth-fixed frame is the same turn `groundUnder` uses (src/paint/math.ts): the view's x, y, z, then Greenwich sidereal time.
import { greenwichSidereal } from "../realistic/sun.ts";
import type { GeoPoint } from "../types.ts";
import type { Satellites } from "./types.ts";

/** The sphere the positions use, kilometres, the same one `groundUnder` uses. */
const EARTH_KM = 6371;
const RAD = Math.PI / 180;
/** A rough uncertainty: 1 km at the epoch, and 1 km more for each day the elements have aged. Not a published covariance. */
const uncertaintyOf = (ageDays: number): number => 1 + Math.max(0, ageDays);

/**
 * How many neighbours `nearest` returns when `count` is left out.
 *
 * @example
 * ```ts
 * import { NEAREST_COUNT } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(NEAREST_COUNT);
 * ```
 */
export const NEAREST_COUNT = 5;

/**
 * One satellite and how near it is. `angle` is degrees, for `by: "sky"`. `distance` is kilometres, for `by: "space"`.
 *
 * @example
 * ```ts
 * import type { Neighbour } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const one: Neighbour = { index: 0, name: "ISS (ZARYA)", noradId: 25544, distance: { kilometres: 420, uncertaintyKm: 1, unit: "km" } };
 * console.log(one.distance?.unit);
 * ```
 */
export interface Neighbour {
  index: number;
  name: string;
  noradId: number;
  /** Degrees, when asked `by: "sky"`. */
  angle?: number;
  /** Kilometres, when asked `by: "space"`. */
  distance?: { kilometres: number; uncertaintyKm: number; unit: "km" };
}

/**
 * A place on the ground, a direction in the sky from an observer, or another satellite of the same group.
 *
 * @example
 * ```ts
 * import type { NearestTarget } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const target: NearestTarget = { place: { lon: -0.13, lat: 51.51 } };
 * console.log("place" in target);
 * ```
 */
export type NearestTarget = { place: GeoPoint; heightM?: number } | { azimuth: number; elevation: number; observer: GeoPoint & { heightM?: number } } | { satellite: number };

/**
 * What `nearest` may be asked. `date` is required.
 *
 * @example
 * ```ts
 * import type { NearestOptions } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const options: NearestOptions = { date: Date.UTC(2026, 10, 2), by: "space", count: 5 };
 * console.log(options.by);
 * ```
 */
export interface NearestOptions {
  /** How many to return, nearest first. {@link NEAREST_COUNT} when left out. */
  count?: number;
  /** Drop anything further than this: kilometres for `by: "space"`, degrees for `by: "sky"`. No limit when left out. */
  within?: number;
  /** `"space"` (kilometres, the default) or `"sky"` (the angle at the observer). */
  by?: "sky" | "space";
  /** The moment, milliseconds since the Unix epoch. */
  date: number;
  /** Where the sky is seen from, when the target is a satellite and `by` is `"sky"`. */
  observer?: GeoPoint & { heightM?: number };
}

interface Vec {
  x: number;
  y: number;
  z: number;
}

const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (a: Vec): Vec => {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};
const hypot = (a: Vec): number => Math.hypot(a.x, a.y, a.z);

/** A place on the sphere, in kilometres, in the Earth-fixed frame (x east of Greenwich, y north, z the meridian of 0). */
function groundKm(place: GeoPoint, heightM = 0): Vec {
  const lat = place.lat * RAD;
  const lon = place.lon * RAD;
  const radius = EARTH_KM + heightM / 1000;
  const c = Math.cos(lat);
  return { x: c * Math.sin(lon) * radius, y: Math.sin(lat) * radius, z: c * Math.cos(lon) * radius };
}

/** `exact`'s position (Earth radii, the view's axes) as kilometres fixed to the Earth. The same turn as `groundUnder`. */
function fixedKm(x: number, y: number, z: number, ms: number): Vec {
  const theta = greenwichSidereal(ms) * RAD;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const temeX = x;
  const temeY = -z;
  const temeZ = y;
  const east = -temeX * sin + temeY * cos;
  const north = temeZ;
  const prime = temeX * cos + temeY * sin;
  return { x: east * EARTH_KM, y: north * EARTH_KM, z: prime * EARTH_KM };
}

/** A direction in the sky, as a unit vector in the Earth-fixed frame. Azimuth is degrees clockwise from north. */
function skyDirection(observer: GeoPoint, azimuth: number, elevation: number): Vec {
  const lat = observer.lat * RAD;
  const lon = observer.lon * RAD;
  const east: Vec = { x: Math.cos(lon), y: 0, z: -Math.sin(lon) };
  const north: Vec = { x: -Math.sin(lat) * Math.sin(lon), y: Math.cos(lat), z: -Math.sin(lat) * Math.cos(lon) };
  const up: Vec = { x: Math.cos(lat) * Math.sin(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.cos(lon) };
  const el = elevation * RAD;
  const az = azimuth * RAD;
  const ce = Math.cos(el);
  return norm({
    x: north.x * ce * Math.cos(az) + east.x * ce * Math.sin(az) + up.x * Math.sin(el),
    y: north.y * ce * Math.cos(az) + east.y * ce * Math.sin(az) + up.y * Math.sin(el),
    z: north.z * ce * Math.cos(az) + east.z * ce * Math.sin(az) + up.z * Math.sin(el),
  });
}

interface Placed {
  index: number;
  name: string;
  noradId: number;
  at: Vec;
  uncertaintyKm: number;
}

/** An element set's epoch, milliseconds since the Unix epoch; a text with no zone is read as UTC. */
const epochOf = (text: string): number => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);

function placedAt(group: Satellites, ms: number): Placed[] {
  const out: Placed[] = [];
  const buf = new Float64Array(6);
  for (let index = 0; index < group.count; index += 1) {
    if (!group.exact(index, ms, buf)) continue;
    const set = group.sets[index]!;
    out.push({ index, name: set.OBJECT_NAME, noradId: set.NORAD_CAT_ID, at: fixedKm(buf[0]!, buf[1]!, buf[2]!, ms), uncertaintyKm: uncertaintyOf((ms - epochOf(set.EPOCH)) / 86_400_000) });
  }
  return out;
}

const scoreOf = (placed: Placed, target: NearestTarget, by: "sky" | "space", observer?: GeoPoint & { heightM?: number }, others?: Placed): { angle?: number; kilometres?: number } | null => {
  if ("satellite" in target) {
    if (!others || placed.index === target.satellite) return null;
    if (by === "space") return { kilometres: hypot(sub(placed.at, others.at)) };
    const eye = observer ? groundKm(observer, observer.heightM) : { x: norm(others.at).x * EARTH_KM, y: norm(others.at).y * EARTH_KM, z: norm(others.at).z * EARTH_KM };
    const a = norm(sub(others.at, eye));
    const b = norm(sub(placed.at, eye));
    return { angle: (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) / RAD) };
  }
  if ("azimuth" in target) {
    const eye = groundKm(target.observer, target.observer.heightM);
    const toward = skyDirection(target.observer, target.azimuth, target.elevation);
    const seen = norm(sub(placed.at, eye));
    return { angle: (Math.acos(Math.max(-1, Math.min(1, dot(toward, seen)))) / RAD) };
  }
  const eye = groundKm(target.place, target.heightM);
  if (by === "sky") {
    const up = norm(eye);
    const seen = norm(sub(placed.at, eye));
    return { angle: (Math.acos(Math.max(-1, Math.min(1, dot(up, seen)))) / RAD) };
  }
  return { kilometres: hypot(sub(placed.at, eye)) };
};

function rank(rows: Placed[], target: NearestTarget, options: NearestOptions): Neighbour[] {
  const by = options.by ?? "space";
  const count = options.count ?? NEAREST_COUNT;
  const self = "satellite" in target ? rows.find((row) => row.index === target.satellite) : undefined;
  const hits: Neighbour[] = [];
  for (const row of rows) {
    const score = scoreOf(row, target, by, options.observer, self);
    if (!score) continue;
    const measure = by === "sky" ? score.angle : score.kilometres;
    if (measure === undefined) continue;
    if (options.within !== undefined && measure > options.within) continue;
    const neighbour: Neighbour = { index: row.index, name: row.name, noradId: row.noradId };
    if (by === "sky") neighbour.angle = score.angle;
    else neighbour.distance = { kilometres: score.kilometres!, uncertaintyKm: row.uncertaintyKm, unit: "km" };
    hits.push(neighbour);
  }
  hits.sort((a, b) => (a.angle ?? a.distance?.kilometres ?? 0) - (b.angle ?? b.distance?.kilometres ?? 0));
  return hits.slice(0, Math.max(0, count));
}

/**
 * The satellites nearest a place, a direction in the sky, or another satellite, at one moment. One SGP4 call (`exact`) for each satellite that can be placed.
 * It does not run again by itself. `by: "space"` answers with kilometres; `by: "sky"` with the angle in degrees. Nearest first.
 *
 * @param group - The satellites, from `createSatellites`.
 * @param target - A place, a direction (`azimuth`, `elevation`, `observer`), or `{ satellite: index }`.
 * @param options - `date` (required), `count` (5), `within`, `by` (`"space"`), and `observer` for a satellite seen in the sky.
 * @returns The neighbours, nearest first.
 *
 * @example
 * ```ts
 * import { createSatellites, nearest } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const group = createSatellites([]);
 * console.log(nearest(group, { place: { lon: 0, lat: 0 } }, { date: Date.UTC(2026, 10, 2) }).length);
 * ```
 */
export function nearest(group: Satellites, target: NearestTarget, options: NearestOptions): Neighbour[] {
  return rank(placedAt(group, options.date), target, options);
}

/**
 * Every satellite within `radius` of a target, nearest first. Kilometres for `by: "space"`, degrees for `by: "sky"`. The same one pass as `nearest`.
 *
 * @param group - The satellites.
 * @param target - A place, a direction, or a satellite.
 * @param radius - The limit, in the unit `by` uses.
 * @param options - As `nearest`, without `count` and `within`.
 * @returns The neighbours inside the limit.
 *
 * @example
 * ```ts
 * import { createSatellites, within } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const group = createSatellites([]);
 * console.log(within(group, { place: { lon: 0, lat: 0 } }, 1000, { date: Date.UTC(2026, 10, 2) }).length);
 * ```
 */
export function within(group: Satellites, target: NearestTarget, radius: number, options: Omit<NearestOptions, "count" | "within">): Neighbour[] {
  return nearest(group, target, { ...options, count: group.count, within: radius });
}

/**
 * The closest the two satellites come between `from` and `to`. The span is sampled every `stepMs` (60 seconds when left out), and the moment of the closest sample is then refined between its two neighbours,
 * to a tenth of a second, because two satellites close in at several kilometres a second and the closest sample alone can be hundreds of kilometres too far. The uncertainty is the elements' own: the
 * square root of the sum of the squares of the two satellites' rough uncertainties (1 km, and 1 km more for each day the elements have aged at that moment), not a published covariance.
 * Two SGP4 calls a sample, and about 20 more for the refinement. It does not run again by itself.
 *
 * @param group - The satellites.
 * @param a - The index of one satellite.
 * @param b - The index of the other.
 * @param from - The start, milliseconds since the Unix epoch.
 * @param to - The end.
 * @param stepMs - The sample step, at least 1000.
 * @returns The closest moment, or null when either satellite cannot be placed.
 *
 * @example
 * ```ts
 * import { closeApproach, createSatellites } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const group = createSatellites([]);
 * console.log(closeApproach(group, 0, 1, 0, 60_000));
 * ```
 */
export function closeApproach(group: Satellites, a: number, b: number, from: number, to: number, stepMs = 60_000): { at: number; kilometres: number; uncertaintyKm: number } | null {
  const step = Math.max(1000, stepMs);
  const bufA = new Float64Array(6);
  const bufB = new Float64Array(6);
  const apart = (at: number): number | null => (group.exact(a, at, bufA) && group.exact(b, at, bufB) ? hypot(sub(fixedKm(bufA[0]!, bufA[1]!, bufA[2]!, at), fixedKm(bufB[0]!, bufB[1]!, bufB[2]!, at))) : null);
  const samples: { at: number; kilometres: number }[] = [];
  for (let at = from; at <= to; at += step) {
    const kilometres = apart(at);
    if (kilometres !== null) samples.push({ at, kilometres });
  }
  if (samples.length === 0) return null;
  let atBest = 0;
  for (const [i, sample] of samples.entries()) if (sample.kilometres < samples[atBest]!.kilometres) atBest = i;
  let best = samples[atBest]!;
  // between the neighbours of the closest sample the distance falls and then rises: a ternary search for the lowest point
  let low = Math.max(from, (samples[atBest - 1] ?? best).at);
  let high = Math.min(to, (samples[atBest + 1] ?? best).at);
  while (high - low > 100) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    const dl = apart(left);
    const dr = apart(right);
    if (dl === null || dr === null) break;
    if (dl < dr) high = right;
    else low = left;
  }
  const mid = Math.round((low + high) / 2);
  const refined = apart(mid);
  if (refined !== null && refined < best.kilometres) best = { at: mid, kilometres: refined };
  const age = (index: number): number => {
    const epoch = epochOf(group.sets[index]!.EPOCH);
    return uncertaintyOf((best.at - epoch) / 86_400_000);
  };
  return { at: best.at, kilometres: best.kilometres, uncertaintyKm: Math.hypot(age(a), age(b)) };
}

/**
 * The slant range from a place to a satellite that is straight overhead, for a test or a page: it is the satellite's height. Positions are kilometres in one frame.
 *
 * @param heightKm - How far above the ground the satellite is.
 * @returns The distance, which is `heightKm`.
 *
 * @example
 * ```ts
 * import { overheadKm } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(overheadKm(420));
 * ```
 */
export function overheadKm(heightKm: number): number {
  const ground = groundKm({ lon: 0, lat: 0 });
  const up = norm(ground);
  const sat = { x: up.x * (EARTH_KM + heightKm), y: up.y * (EARTH_KM + heightKm), z: up.z * (EARTH_KM + heightKm) };
  return hypot(sub(sat, ground));
}
