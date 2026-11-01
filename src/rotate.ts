// The Earth's own rate of turn, so the globe on the page keeps real time. Pure, and tested.
import type { GeoPoint, Rotation } from "./types.ts";

/** One sidereal day — the Earth's turn against the stars, 23 h 56 min 4.0905 s — in milliseconds. */
export const SIDEREAL_DAY_MS = 86_164_090.5;

/** How far the Earth turns in one millisecond, in degrees. */
export const DEGREES_PER_MS = 360 / SIDEREAL_DAY_MS;

/** How far the Earth has turned after `ms` milliseconds, in degrees. */
export const spinAt = (ms: number): number => ms * DEGREES_PER_MS;

/** The rotation that puts `centre` in the middle of the disc: d3-geo's rotate is the negative of the point. */
export const centreRotation = (centre: GeoPoint): Rotation => [-centre.lon, -centre.lat];

/**
 * The rotation at `now` for a globe that was centred on `centre` at `start`. The tilt stays; the spin advances at the
 * Earth's own rate, so the disc turns as the real Earth does and the centred place drifts with it.
 */
export function rotationAt(centre: GeoPoint, now: number, start: number): Rotation {
  const [lambda, phi] = centreRotation(centre);
  return [lambda + spinAt(now - start), phi];
}
