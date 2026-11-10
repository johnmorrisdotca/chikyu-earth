// Where the Sun is overhead for a given moment: the point on the Earth where it stands at the zenith. Pure, no dependency.
// The low-precision formulas of NOAA's solar calculator (Meeus, Astronomical Algorithms, ch. 25), good to about 0.01 degree
// of declination and 0.02 degree of longitude for the years 1900 to 2100: far finer than a screen shows.
import type { GeoPoint } from "../types.ts";

const RAD = Math.PI / 180;
const wrap360 = (degrees: number): number => ((degrees % 360) + 360) % 360;

/**
 * Julian day number of a moment in milliseconds since the Unix epoch.
 *
 * @param ms - Milliseconds since 1970-01-01T00:00Z.
 * @returns The Julian day number, with its fraction.
 *
 * @example
 * ```ts
 * import { julianDay } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(julianDay(Date.UTC(2000, 0, 1, 12)));
 * ```
 */
export const julianDay = (ms: number): number => ms / 86_400_000 + 2_440_587.5;

/**
 * How far the Earth has turned against the stars at `ms`: Greenwich mean sidereal time, in degrees from 0 to 360. The longitude that faces a direction fixed in space goes west at this rate (about 361 degrees a day).
 *
 * @param ms - A moment, in milliseconds since the Unix epoch.
 * @returns The angle in degrees.
 *
 * @example
 * ```ts
 * import { greenwichSidereal } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(greenwichSidereal(Date.UTC(2000, 0, 1, 12)).toFixed(2));
 * ```
 */
export function greenwichSidereal(ms: number): number {
  const days = julianDay(ms) - 2_451_545;
  const t = days / 36_525;
  return wrap360(280.46061837 + 360.98564736629 * days + 0.000387933 * t * t);
}

/**
 * The point where the Sun is at the zenith at `ms`: latitude is the Sun's declination, longitude runs west at 15 degrees an hour.
 *
 * @param ms - A moment, in milliseconds since the Unix epoch.
 * @returns The longitude and latitude on the Earth that has the Sun straight overhead.
 *
 * @example
 * ```ts
 * import { subsolarPoint } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const sun = subsolarPoint(Date.UTC(2026, 5, 21, 12));
 * console.log(sun.lat.toFixed(1), sun.lon.toFixed(1));
 * ```
 */
export function subsolarPoint(ms: number): GeoPoint {
  const jd = julianDay(ms);
  const t = (jd - 2_451_545) / 36_525;
  const meanLongitude = wrap360(280.46646 + t * (36_000.76983 + t * 0.0003032));
  const meanAnomaly = wrap360(357.52911 + t * (35_999.05029 - t * 0.0001537)) * RAD;
  const centre =
    (1.914602 - t * (0.004817 + 0.000014 * t)) * Math.sin(meanAnomaly) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly) +
    0.000289 * Math.sin(3 * meanAnomaly);
  const node = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = (meanLongitude + centre - 0.00569 - 0.00478 * Math.sin(node)) * RAD;
  const obliquity = (23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(node)) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(apparentLongitude), Math.cos(apparentLongitude)) / RAD;
  const siderealGreenwich = greenwichSidereal(ms);
  const lon = ((wrap360(rightAscension - siderealGreenwich) + 180) % 360) - 180;
  return { lon, lat: declination / RAD };
}

/**
 * A point on the globe as a unit vector: +z is longitude 0 on the equator, +x east, +y north.
 *
 * @param point - A longitude and latitude in degrees.
 * @returns The `[x, y, z]` of the point on a sphere of radius 1.
 *
 * @example
 * ```ts
 * import { unitVector } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(unitVector({ lon: 90, lat: 0 }).map((n) => Math.round(n)));
 * ```
 */
export function unitVector(point: GeoPoint): [number, number, number] {
  const lon = point.lon * RAD;
  const lat = point.lat * RAD;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}
