// The shape of an orbit from its mean motion and eccentricity, and the class it falls in. Pure.
import type { OrbitClass } from "./kinds.ts";

const MU = 398_600.4418;
const EARTH_RADIUS_KM = 6371;

/**
 * The height of the geostationary orbit above the mean Earth radius, in kilometres: the radius of a circular orbit that goes round once a sidereal day, less 6,371 km.
 *
 * @example
 * ```ts
 * import { GEO_ALTITUDE_KM } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(GEO_ALTITUDE_KM);
 * ```
 */
export const GEO_ALTITUDE_KM = 35_786;

/**
 * The size and shape of an orbit.
 *
 * @example
 * ```ts
 * import type { OrbitShape } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const show = (shape: OrbitShape): string => `${shape.perigeeKm.toFixed(0)} to ${shape.apogeeKm.toFixed(0)} km`;
 * console.log(typeof show);
 * ```
 */
export interface OrbitShape {
  /** Half the longest width of the ellipse, kilometres from the Earth's centre. */
  semiMajorKm: number;
  /** One revolution, minutes. */
  periodMinutes: number;
  /** Height of the lowest point above the mean Earth radius (6371 km), kilometres. */
  perigeeKm: number;
  /** Height of the highest point, kilometres. */
  apogeeKm: number;
  eccentricity: number;
}

/**
 * The shape of an orbit from the two numbers every element set has: its mean motion (revolutions a day) by Kepler's third law, and its eccentricity. Heights are above the mean Earth radius (6371 km), the same as the satellites' own readout.
 *
 * @param meanMotion - Revolutions a day, above 0.
 * @param eccentricity - 0 up to (not including) 1.
 * @returns The shape; `null` for a mean motion or an eccentricity that is not an orbit.
 *
 * @example
 * ```ts
 * import { orbitShape } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const iss = orbitShape(15.4915, 0.0007139);
 * console.log(iss && Math.round(iss.perigeeKm), iss && Math.round(iss.periodMinutes), orbitShape(0, 0));
 * ```
 */
export function orbitShape(meanMotion: number, eccentricity: number): OrbitShape | null {
  if (!(meanMotion > 0) || !(eccentricity >= 0) || !(eccentricity < 1) || !Number.isFinite(meanMotion)) return null;
  const n = (meanMotion * 2 * Math.PI) / 86_400;
  const a = Math.cbrt(MU / (n * n));
  return { semiMajorKm: a, periodMinutes: 1440 / meanMotion, perigeeKm: a * (1 - eccentricity) - EARTH_RADIUS_KM, apogeeKm: a * (1 + eccentricity) - EARTH_RADIUS_KM, eccentricity };
}

/**
 * The numbers behind the classes: the highest point a low orbit may have (2,000 km), the eccentricity from which an orbit is highly elliptical (0.25), and how far from 35,786 km the lowest and highest points of a geostationary orbit may be (1,500 km).
 *
 * @example
 * ```ts
 * import { CLASS_LIMITS } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(CLASS_LIMITS.leoApogeeKm, CLASS_LIMITS.heoEccentricity, CLASS_LIMITS.geoBandKm);
 * ```
 */
export const CLASS_LIMITS = { leoApogeeKm: 2_000, heoEccentricity: 0.25, geoBandKm: 1_500 } as const;

/**
 * The class an orbit falls in. `heo` when the eccentricity is 0.25 or more; otherwise `leo` when the highest point is under 2,000 km, `geo` when both points are within 1,500 km of 35,786 km, `meo` when the lowest point is 2,000 km or more and the highest is under that band, and `other` for what is left (above the geostationary belt, or between the classes).
 *
 * @param shape - The orbit's shape, from `orbitShape`.
 * @returns The class.
 *
 * @example
 * ```ts
 * import { orbitClass, orbitShape } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const of = (n: number, e: number): string => orbitClass(orbitShape(n, e)!);
 * console.log(of(15.49, 0.0007), of(2.0056, 0.0001), of(1.0027, 0.0002), of(2.0, 0.72), of(0.9, 0.001));
 * ```
 */
export function orbitClass(shape: OrbitShape): OrbitClass {
  if (shape.eccentricity >= CLASS_LIMITS.heoEccentricity) return "heo";
  if (shape.apogeeKm < CLASS_LIMITS.leoApogeeKm) return "leo";
  const low = GEO_ALTITUDE_KM - CLASS_LIMITS.geoBandKm;
  const high = GEO_ALTITUDE_KM + CLASS_LIMITS.geoBandKm;
  if (shape.perigeeKm >= low && shape.apogeeKm <= high) return "geo";
  if (shape.perigeeKm >= CLASS_LIMITS.leoApogeeKm && shape.apogeeKm < low) return "meo";
  return "other";
}

/**
 * The class of an orbit straight from the two numbers every element set has, its mean motion (revolutions a day) and its eccentricity; `null` when they are not an orbit.
 *
 * @param meanMotion - Revolutions a day, above 0.
 * @param eccentricity - 0 up to (not including) 1.
 * @returns The class, or `null`.
 *
 * @example
 * ```ts
 * import { classOfElements } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(classOfElements(15.49, 0.0007), classOfElements(1.0027, 0.0002), classOfElements(0, 0));
 * ```
 */
export function classOfElements(meanMotion: number, eccentricity: number): OrbitClass | null {
  const shape = orbitShape(meanMotion, eccentricity);
  return shape ? orbitClass(shape) : null;
}
