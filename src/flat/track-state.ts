// Which way a satellite is going over the ground, and whether the Sun lights it: from its place and velocity alone. Pure: no DOM, no clock and no dependency (not even satellite.js), so a page, a build step or a server can write "heading SE 128 degrees, in sunlight" from numbers it already has.
// `groundTrackState(elements, ms)` in `@johnmorrisdotca/chikyu-earth/passes` runs SGP4 for you and hands the result here.
import { greenwichSidereal, subsolarPoint } from "../realistic/sun.ts";

const RAD = Math.PI / 180;
/** The Earth's equatorial radius, kilometres (WGS84). */
const A = 6378.137;
/** The Earth's flattening (WGS84). */
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
/** The Earth's turn, radians a second. */
const OMEGA = 7.292115e-5;
/** One Earth radius of the package's scene units, kilometres (the satellites' places are in these). */
const SCENE_KM = 6371;

/**
 * The radius of the Earth's shadow, kilometres: the Earth's equatorial radius (6,378.137 km). The shadow is a cylinder of this radius along the line from the Sun through the Earth's centre (the cylindrical model: the edge of a conical umbra
 * leans in by about 0.26 degrees, so where a satellite at 400 km enters the shadow the cylinder's edge is about 11 km outside the cone's, a few seconds of an orbit, and no penumbra is drawn). A satellite is in shadow when it is on the night side of the centre and inside the cylinder.
 *
 * @example
 * ```ts
 * import { SHADOW_RADIUS_KM } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(SHADOW_RADIUS_KM);
 * ```
 */
export const SHADOW_RADIUS_KM = A;

/**
 * Where a satellite is over the ground at one moment and how it is going.
 *
 * @example
 * ```ts
 * import type { GroundTrackState } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const say = (s: GroundTrackState): string => `${s.bearingDeg.toFixed(0)} degrees, ${s.ascending ? "ascending" : "descending"}, ${s.sunlit ? "sunlit" : "in shadow"}`;
 * console.log(typeof say);
 * ```
 */
export interface GroundTrackState {
  /** Degrees north of the equator, geodetic (on the WGS84 ellipsoid), -90 to 90. */
  lat: number;
  /** Degrees east of Greenwich, -180 to 180. */
  lon: number;
  /** Height above the WGS84 ellipsoid, kilometres. */
  heightKm: number;
  /** The way the point under the satellite is going over the ground, degrees clockwise from north (0 north, 90 east, 180 south, 270 west), 0 up to 360. The Earth's turn is taken out: this is the direction of the ground track, not of the satellite's path through space. 0 when the satellite is not moving over the ground. */
  bearingDeg: number;
  /** True when it is going north (its latitude is rising), false when going south. */
  ascending: boolean;
  /** True when the Sun lights it, false when it is in the Earth's shadow (the cylindrical model, {@link SHADOW_RADIUS_KM}). */
  sunlit: boolean;
}

/**
 * The Sun as a unit vector in the Earth-fixed axes (x through longitude 0 on the equator, y east, z north) at `ms`, from the same low-precision Sun as the night side of the maps.
 *
 * @param ms - A moment, in milliseconds since the Unix epoch.
 * @returns The unit vector from the Earth's centre towards the Sun.
 *
 * @example
 * ```ts
 * import { sunDirection } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const sun = sunDirection(Date.UTC(2026, 5, 21, 12));
 * console.log(sun.map((n) => n.toFixed(2)));
 * ```
 */
export function sunDirection(ms: number): [number, number, number] {
  const sun = subsolarPoint(ms);
  const lat = sun.lat * RAD;
  const lon = sun.lon * RAD;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/**
 * Is a point in the Earth's shadow? Cylindrical model: behind the Earth's centre from the Sun and nearer the Sun-Earth line than {@link SHADOW_RADIUS_KM}.
 *
 * @param position - The point, kilometres from the Earth's centre, in any axes.
 * @param sun - The unit vector towards the Sun, in the same axes.
 * @returns True in shadow, false in sunlight (a point exactly on the terminator plane is sunlit).
 *
 * @example
 * ```ts
 * import { inEarthShadow } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * // the Sun along +x: a satellite 7,000 km out on the far side is in shadow, one at the same distance beside the Earth is not
 * console.log(inEarthShadow([-7000, 0, 0], [1, 0, 0]), inEarthShadow([0, 7000, 0], [1, 0, 0]));
 * ```
 */
export function inEarthShadow(position: readonly [number, number, number], sun: readonly [number, number, number]): boolean {
  const along = position[0] * sun[0] + position[1] * sun[1] + position[2] * sun[2];
  if (along >= 0) return false;
  const r2 = position[0] * position[0] + position[1] * position[1] + position[2] * position[2];
  return r2 - along * along < A * A;
}

/**
 * Where a satellite is over the ground, how it is going and whether the Sun lights it, from its place and velocity in the axes SGP4 uses (TEME: x to the vernal equinox, z north, y a quarter turn east of x) and the moment. The
 * velocity is turned into the ground's frame by taking the Earth's turn out of it, so the bearing is the way the ground track runs, as a map draws it.
 *
 * @param position - Kilometres from the Earth's centre, TEME.
 * @param velocity - Kilometres a second, TEME.
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @returns Latitude, longitude, height, bearing, ascending or descending, and sunlit.
 *
 * @example
 * ```ts
 * import { trackStateOf } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * // 420 km over the equator going north at 7.66 km a second
 * const at = Date.UTC(2026, 10, 3, 12);
 * const state = trackStateOf([6798, 0, 0], [0, 0, 7.66], at);
 * console.log(state.ascending, Math.round(state.heightKm));
 * ```
 */
export function trackStateOf(position: readonly [number, number, number], velocity: readonly [number, number, number], ms: number): GroundTrackState {
  const theta = greenwichSidereal(ms) * RAD;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // the Earth-fixed axes: turn by the sidereal angle about the pole
  const x = c * position[0] + s * position[1];
  const y = -s * position[0] + c * position[1];
  const z = position[2];
  // the velocity as the ground sees it: turned the same way, less the ground's own motion (omega x r)
  const vx = c * velocity[0] + s * velocity[1] + OMEGA * y;
  const vy = -s * velocity[0] + c * velocity[1] - OMEGA * x;
  const vz = velocity[2];
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  // the geodetic latitude and height, by iteration (a few steps settle it to well under a metre)
  let lat = Math.atan2(z, p * (1 - E2));
  let n = A;
  for (let i = 0; i < 6; i += 1) {
    const sin = Math.sin(lat);
    n = A / Math.sqrt(1 - E2 * sin * sin);
    lat = Math.atan2(z + E2 * n * sin, p);
  }
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  const heightKm = Math.abs(cosLat) > 1e-9 ? p / cosLat - n : Math.abs(z) / Math.abs(sinLat) - n * (1 - E2);
  const cosLon = Math.cos(lon);
  const sinLon = Math.sin(lon);
  const east = -sinLon * vx + cosLon * vy;
  const north = -sinLat * cosLon * vx - sinLat * sinLon * vy + cosLat * vz;
  const moving = Math.hypot(east, north) > 1e-9;
  const bearing = moving ? ((Math.atan2(east, north) / RAD) % 360 + 360) % 360 : 0;
  return {
    lat: lat / RAD,
    lon: ((((lon / RAD) % 360) + 540) % 360) - 180,
    heightKm,
    bearingDeg: bearing,
    ascending: north > 0,
    sunlit: !inEarthShadow([x, y, z], sunDirection(ms)),
  };
}

/**
 * The same as {@link trackStateOf}, for a place and velocity in the package's own satellite axes (what `createSatellites(...).exact` and the space view give): Earth radii of 6,371 km, x to the vernal equinox, y north, z the other way from TEME's y; the velocity in kilometres a second in the same axes.
 *
 * @param place - Earth radii from the Earth's centre.
 * @param velocity - Kilometres a second.
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @returns Latitude, longitude, height, bearing, ascending or descending, and sunlit.
 *
 * @example
 * ```ts
 * import { trackStateOfScene } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const state = trackStateOfScene([1.0665, 0, 0], [0, 7.66, 0], Date.UTC(2026, 10, 3, 12));
 * console.log(state.ascending);
 * ```
 */
export function trackStateOfScene(place: readonly [number, number, number], velocity: readonly [number, number, number], ms: number): GroundTrackState {
  return trackStateOf([place[0] * SCENE_KM, -place[2] * SCENE_KM, place[1] * SCENE_KM], [velocity[0], -velocity[2], velocity[1]], ms);
}

/**
 * The eight points of the compass, from north clockwise.
 *
 * @example
 * ```ts
 * import { COMPASS_POINTS } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(COMPASS_POINTS.join(" "));
 * ```
 */
export const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/**
 * One of the eight points of the compass.
 *
 * @example
 * ```ts
 * import type { CompassPoint } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const point: CompassPoint = "SE";
 * console.log(point);
 * ```
 */
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * The point of the compass a bearing is nearest to: 0 is N, 45 NE, 90 E, 135 SE, 180 S and so on, each point taking 45 degrees (22.5 either side).
 *
 * @param bearingDeg - Degrees clockwise from north.
 * @returns N, NE, E, SE, S, SW, W or NW.
 *
 * @example
 * ```ts
 * import { compassPoint } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(compassPoint(128), compassPoint(350));
 * ```
 */
export function compassPoint(bearingDeg: number): CompassPoint {
  return COMPASS_POINTS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8]!;
}

/**
 * The Sun as a unit vector in the satellites' own axes (x to the vernal equinox, y north, z the other way from TEME's y: what `createSatellites` and the space view use) at `ms`.
 *
 * @param ms - A moment, in milliseconds since the Unix epoch.
 * @returns The unit vector from the Earth's centre towards the Sun.
 *
 * @example
 * ```ts
 * import { sunDirectionScene } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(sunDirectionScene(Date.UTC(2026, 2, 20, 9)).map((n) => n.toFixed(2)));
 * ```
 */
export function sunDirectionScene(ms: number): [number, number, number] {
  const fixed = sunDirection(ms);
  const theta = greenwichSidereal(ms) * RAD;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // Earth-fixed back to the stars (TEME), then into the satellites' axes
  const x = c * fixed[0] - s * fixed[1];
  const y = s * fixed[0] + c * fixed[1];
  return [x, fixed[2], -y];
}

/**
 * Which points of a path are in the Earth's shadow: 1 for in shadow, 0 for in sunlight (the cylindrical model, {@link SHADOW_RADIUS_KM}), for places in the satellites' own axes in Earth radii of 6,371 km. The Sun is taken as fixed over the path, which holds for the one revolution a path is (the Sun moves a quarter of a degree in that time).
 *
 * @param positions - Three numbers a point, Earth radii.
 * @param count - How many points.
 * @param sun - The unit vector towards the Sun in the same axes (`sunDirectionScene`).
 * @param out - Where to put the flags, one a point.
 * @returns `out`.
 *
 * @example
 * ```ts
 * import { shadowFlags } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * // the Sun along +x: the point behind the Earth is in shadow, the one in front of it is not
 * console.log(shadowFlags(new Float32Array([-1.1, 0, 0, 1.1, 0, 0]), 2, [1, 0, 0], new Uint8Array(2)));
 * ```
 */
export function shadowFlags(positions: ArrayLike<number>, count: number, sun: readonly [number, number, number], out: Uint8Array): Uint8Array {
  const radius = SHADOW_RADIUS_KM / SCENE_KM;
  for (let i = 0; i < count; i += 1) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const along = x * sun[0] + y * sun[1] + z * sun[2];
    out[i] = along < 0 && x * x + y * y + z * z - along * along < radius * radius ? 1 : 0;
  }
  return out;
}
