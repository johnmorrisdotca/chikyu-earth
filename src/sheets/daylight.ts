// How long the day is, and how high the Sun stands at noon, from a latitude and the Sun's declination. The Sun is a point and the air is ignored, so an equinox is twelve hours except at a pole. Pure.
const RAD = Math.PI / 180;

function degrees(name: string, value: number): number {
  if (!Number.isFinite(value) || value < -90 || value > 90) throw new TypeError(`${name} is degrees from -90 to 90`);
  return value * RAD;
}

/**
 * Hours of daylight at a latitude when the Sun's declination is `declination` degrees.
 * @param latitude - Degrees north of the equator, from -90 to 90.
 * @param declination - The Sun's declination in degrees, from -90 to 90. Positive is north.
 * @returns Hours from 0 to 24. Twelve at an equinox, away from the poles.
 *
 * @example
 * ```ts
 * import { dayLengthHours } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(dayLengthHours(45, 0));
 * ```
 */
export function dayLengthHours(latitude: number, declination: number): number {
  degrees("latitude", latitude);
  degrees("declination", declination);
  if (Math.abs(latitude) >= 89.999) return declination === 0 ? 12 : Math.sign(latitude) === Math.sign(declination) ? 24 : 0;
  const x = -Math.tan(latitude * RAD) * Math.tan(declination * RAD);
  if (x <= -1) return 24;
  if (x >= 1) return 0;
  return (2 * Math.acos(x)) / RAD / 15;
}

/**
 * How high the Sun stands at noon, in degrees above the horizon. Negative means it stays below the horizon all day.
 * @param latitude - Degrees north of the equator, from -90 to 90.
 * @param declination - The Sun's declination in degrees, from -90 to 90. Positive is north.
 * @returns Degrees above the horizon, from -90 to 90.
 *
 * @example
 * ```ts
 * import { noonAltitude } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(noonAltitude(45, 0).toFixed(0));
 * ```
 */
export function noonAltitude(latitude: number, declination: number): number {
  const lat = degrees("latitude", latitude);
  const dec = degrees("declination", declination);
  const s = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec);
  return Math.asin(Math.min(1, Math.max(-1, s))) / RAD;
}
