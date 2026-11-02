// The Earth's own rate of turn, so the globe on the page keeps real time. Pure, and tested.
import type { GeoPoint, Rotation } from "./types.ts";

/**
 * One sidereal day — the Earth's turn against the stars, 23 h 56 min 4.0905 s — in milliseconds.
 *
 * @example
 * ```ts
 * import { SIDEREAL_DAY_MS } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(SIDEREAL_DAY_MS / 3_600_000, "hours");
 * ```
 */
export const SIDEREAL_DAY_MS = 86_164_090.5;

/**
 * How far the Earth turns in one millisecond, in degrees.
 *
 * @example
 * ```ts
 * import { DEGREES_PER_MS } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(DEGREES_PER_MS * 1000, "degrees a second");
 * ```
 */
export const DEGREES_PER_MS = 360 / SIDEREAL_DAY_MS;

/**
 * How far the Earth has turned after `ms` milliseconds, in degrees.
 *
 * @param ms - A time span in milliseconds.
 * @returns The turn in degrees; a whole {@link SIDEREAL_DAY_MS} is 360.
 *
 * @example
 * ```ts
 * import { SIDEREAL_DAY_MS, spinAt } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(spinAt(SIDEREAL_DAY_MS / 4));
 * ```
 */
export const spinAt = (ms: number): number => ms * DEGREES_PER_MS;

/**
 * The rotation that puts `centre` in the middle of the disc: d3-geo's rotate is the negative of the point.
 *
 * @param centre - The place to centre on.
 * @returns The `[lambda, phi]` pair for `globe()`'s `rotation` option.
 *
 * @example
 * ```ts
 * import { centreRotation } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(centreRotation({ lon: 139.7, lat: 35.7 }));
 * ```
 */
export const centreRotation = (centre: GeoPoint): Rotation => [-centre.lon, -centre.lat];

/**
 * The rotation at `now` for a globe that was centred on `centre` at `start`. The tilt stays; the spin advances at the
 * Earth's own rate, so the disc turns as the real Earth does and the centred place drifts with it.
 *
 * @param centre - The place the globe was centred on at `start`.
 * @param now - The time to draw for, in milliseconds.
 * @param start - The time the globe was centred, in the same milliseconds as `now`.
 * @returns The `[lambda, phi]` rotation at `now`.
 *
 * @example
 * ```ts
 * import { rotationAt, SIDEREAL_DAY_MS } from "@johnmorrisdotca/chikyu-earth";
 *
 * const tokyo = { lon: 139.7, lat: 35.7 };
 * console.log(rotationAt(tokyo, SIDEREAL_DAY_MS / 2, 0));
 * ```
 */
export function rotationAt(centre: GeoPoint, now: number, start: number): Rotation {
  const [lambda, phi] = centreRotation(centre);
  return [lambda + spinAt(now - start), phi];
}
