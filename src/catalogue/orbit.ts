// The shape of an orbit from its mean motion and eccentricity, and the class it falls in. Pure.
import type { OrbitClass } from "./kinds.ts";

const MU = 398_600.4418;
const EARTH_RADIUS_KM = 6371;

/**
 * The height of the geostationary orbit above the equator, in kilometres: the radius of a circular orbit that goes round once a sidereal day (42,164 km) less the equatorial radius (6,378 km). The heights in this module are above the mean Earth radius of 6,371 km, which differs by 7 km, well inside the 2,500 km band.
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
 * The numbers behind the classes, the same ones the Space Program X site puts its orbit levels at: the highest point a low orbit may have (2,000 km), the highest point of the outer edge of low orbit (8,000 km, where the medium orbits' lowest are 2,000 km or more), the highest point a medium orbit may have (32,000 km, the navigation satellites are about 20,000), and how far from 35,786 km the lowest and highest points of a geostationary orbit may be (2,500 km).
 *
 * @example
 * ```ts
 * import { CLASS_LIMITS } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(CLASS_LIMITS.leoApogeeKm, CLASS_LIMITS.outerApogeeKm, CLASS_LIMITS.meoApogeeKm, CLASS_LIMITS.geoBandKm);
 * ```
 */
export const CLASS_LIMITS = { leoApogeeKm: 2_000, outerApogeeKm: 8_000, meoApogeeKm: 32_000, geoBandKm: 2_500 } as const;

/**
 * The class an orbit falls in, by the rule the Space Program X site's orbit levels use (there is no rule on the eccentricity). `leo` when the highest point is under 2,000 km; `geo` when both points are within 2,500 km of 35,786 km; `outer` when the lowest point is 2,000 km or more and the highest is under 8,000 km (the outer edge of low orbit); `meo` when the lowest point is 2,000 km or more and the highest is under 32,000 km; `far` for every orbit those leave: the stretched ones that swing far out, and any above the belt.
 *
 * @param shape - The orbit's shape, from `orbitShape`.
 * @returns The class.
 *
 * @example
 * ```ts
 * import { orbitClass, orbitShape } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const of = (n: number, e: number): string => orbitClass(orbitShape(n, e)!);
 * console.log(of(15.49, 0.0007), of(5.0, 0.001), of(2.0056, 0.0001), of(1.0027, 0.0002), of(2.0, 0.72));
 * ```
 */
export function orbitClass(shape: OrbitShape): OrbitClass {
  if (shape.apogeeKm < CLASS_LIMITS.leoApogeeKm) return "leo";
  if (Math.abs(shape.perigeeKm - GEO_ALTITUDE_KM) < CLASS_LIMITS.geoBandKm && Math.abs(shape.apogeeKm - GEO_ALTITUDE_KM) < CLASS_LIMITS.geoBandKm) return "geo";
  if (shape.perigeeKm >= CLASS_LIMITS.leoApogeeKm && shape.apogeeKm < CLASS_LIMITS.meoApogeeKm) return shape.apogeeKm < CLASS_LIMITS.outerApogeeKm ? "outer" : "meo";
  return "far";
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
