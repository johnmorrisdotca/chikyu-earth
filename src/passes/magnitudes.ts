// How bright a satellite looks, from its standard magnitude (its brightness at 1000 km with half of it lit) and where the Sun, the satellite and the watcher stand. Pure: no dependency.

const RAD = Math.PI / 180;
/** The Sun's apparent magnitude, from the IAU's 2015 resolution on nominal solar values (-26.74 at 1 AU). */
const SUN_MAGNITUDE = -26.74;

/**
 * The standard magnitude of a satellite worked out from its size: the brightness, from 1000 km away with half of it lit by the Sun, of a sphere with the same average cross-section that reflects `albedo` of the light that
 * falls on it evenly in every direction. It is the model of this package's own, from the Sun's magnitude, and not a measurement: a real satellite is not a sphere (a station is mostly solar panels, which can flash when they catch the Sun), and its
 * albedo is a guess, so the answer can be a magnitude or two off.
 *
 * @param crossSectionM2 - The average area the satellite shows to someone looking at it, in square metres (for a shape with no hollows, a quarter of its whole surface).
 * @param albedo - The share of the light that falls on it that it sends back, 0 to 1 (0.2 by default, about what dull metal and solar cells do).
 * @returns The standard magnitude: smaller is brighter.
 *
 * @example
 * ```ts
 * import { standardMagnitude } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * // a 10 square metre satellite
 * console.log(standardMagnitude(10).toFixed(1));
 * ```
 */
export function standardMagnitude(crossSectionM2: number, albedo = 0.2): number {
  const distance = 1_000_000;
  // a diffuse sphere of cross-section A and albedo p at distance d and a right-angle phase sends back p * A / (pi * d^2) * (1 / pi) of the Sun's light
  return SUN_MAGNITUDE - 2.5 * Math.log10(((albedo * crossSectionM2) / (Math.PI * distance * distance)) * (1 / Math.PI));
}

/**
 * The average cross-sections, in square metres, that this package assumes for the bright satellites it names by NORAD number: the ISS (25544), China's Tianhe (48274) and the Hubble Space Telescope (20580). They are rough
 * working figures from the sizes space agencies publish (the ISS's solar array length of 73 m and wingspan of 109 m, Hubble's 13.2 m long and 4.2 m wide body with two solar arrays, Tianhe's core module about 17 m long and 4.2 m wide with two solar wings), not measurements: good to a factor of two or so, which is
 * about a magnitude. Give your own, or a standard magnitude, to `findPasses` through its `magnitudes` option.
 *
 * @example
 * ```ts
 * import { ESTIMATED_CROSS_SECTIONS } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * console.log(ESTIMATED_CROSS_SECTIONS[25544]);
 * ```
 */
export const ESTIMATED_CROSS_SECTIONS: Readonly<Record<number, number>> = {
  25544: 2000,
  48274: 200,
  20580: 70,
};

/**
 * The standard magnitudes this package assumes for the satellites in `ESTIMATED_CROSS_SECTIONS` (`standardMagnitude` of each, with the default albedo). They are estimates, and a satellite's real brightness changes with how it
 * is turned, so a magnitude worked out from them is good to a magnitude or two. Pass your own to `findPasses` through its `magnitudes` option.
 *
 * @example
 * ```ts
 * import { STANDARD_MAGNITUDES } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * console.log(STANDARD_MAGNITUDES[25544]?.toFixed(1));
 * ```
 */
export const STANDARD_MAGNITUDES: Readonly<Record<number, number>> = Object.fromEntries(Object.entries(ESTIMATED_CROSS_SECTIONS).map(([id, area]) => [Number(id), standardMagnitude(area)]));

/**
 * The apparent magnitude of a satellite, treating it as a sphere that reflects light evenly: the standard magnitude, dimmed by the distance (5 magnitudes for every tenfold) and by how little of
 * it the Sun lights from where the watcher stands (the phase angle, 0 when the Sun is behind the watcher and the satellite is fully lit, 180 degrees when it is all dark). A smaller number is brighter; Sirius, the brightest star, is about
 * -1.5 and the naked eye reaches about 6. The standard magnitude is the brightness from 1000 km with half of the satellite lit, the convention satellite observers use, and the phase function is that of a diffuse sphere.
 *
 * @param standard - The standard magnitude (at 1000 km, half lit).
 * @param rangeKm - The distance from the watcher to the satellite.
 * @param phaseDeg - The angle, in degrees, at the satellite between the Sun and the watcher (0 to 180).
 * @returns The magnitude (positive infinity when the satellite is unlit: a phase of 180 degrees).
 *
 * @example
 * ```ts
 * import { magnitude } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * // a satellite of standard magnitude -1 straight overhead (420 km) with the Sun at right angles to the view
 * console.log(magnitude(-1, 420, 90).toFixed(1));
 * ```
 */
export function magnitude(standard: number, rangeKm: number, phaseDeg: number): number {
  const beta = Math.min(Math.PI, Math.max(0, phaseDeg * RAD));
  const light = Math.sin(beta) + (Math.PI - beta) * Math.cos(beta);
  if (light <= 1e-9) return Number.POSITIVE_INFINITY;
  return standard - 15 + 5 * Math.log10(rangeKm) - 2.5 * Math.log10(light);
}
