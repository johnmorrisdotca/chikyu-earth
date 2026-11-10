// When and where meteors fall: which showers are active at a moment, how strong each is, where on the Earth its radiant stands
// overhead, and how many meteors an ideal watcher at a place would count in an hour. Pure, no DOM and no three.js: it imports
// in a browser, in Node and in another package. The numbers of the showers are the IMO's (src/data/meteor-showers.ts); what
// is assumed here, and not taken from that list, is said where it is used.
import type { GeoPoint } from "../types.ts";
import { METEOR_SHOWERS, type MeteorShower } from "../data/meteor-showers.ts";

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const wrap360 = (degrees: number): number => ((degrees % 360) + 360) % 360;
const wrap180 = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

/**
 * The heights between which most meteors shine, in kilometres above the ground: they light up near the top and have burnt out by the bottom.
 *
 * @example
 * ```ts
 * import { METEOR_HEIGHT_KM } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(METEOR_HEIGHT_KM.top, METEOR_HEIGHT_KM.bottom); // 120 80
 * ```
 */
export const METEOR_HEIGHT_KM = { top: 120, bottom: 80 } as const;

/**
 * The hourly rate taken for the meteors that belong to no shower (the sporadic background), for an ideal watcher under a perfect sky.
 * It is an assumed round figure, not one from the shower list: the real count runs from a few an hour in the evening to over ten before dawn.
 *
 * @example
 * ```ts
 * import { SPORADIC_HOURLY_RATE } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(SPORADIC_HOURLY_RATE); // 8
 * ```
 */
export const SPORADIC_HOURLY_RATE = 8;

/**
 * The Sun's longitude along the ecliptic for the equinox of 2000.0, in degrees: the measure the shower list times its maxima by.
 * Low precision (Meeus, Astronomical Algorithms, ch. 25, with the precession since 2000 taken off), good to about 0.01 degree from 1900 to 2100.
 *
 * @param ms - The moment, in milliseconds since the epoch.
 * @returns The longitude, 0 up to 360.
 *
 * @example
 * ```ts
 * import { solarLongitude } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * // The Perseids' maximum is at 140.0 degrees.
 * console.log(solarLongitude(Date.UTC(2026, 7, 13, 2)).toFixed(1));
 * ```
 */
export function solarLongitude(ms: number): number {
  const t = (ms / DAY_MS + 2_440_587.5 - 2_451_545) / 36_525;
  const meanLongitude = 280.46646 + t * (36_000.76983 + t * 0.0003032);
  const meanAnomaly = (357.52911 + t * (35_999.05029 - t * 0.0001537)) * RAD;
  const centre =
    (1.914602 - t * (0.004817 + 0.000014 * t)) * Math.sin(meanAnomaly) + (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly) + 0.000289 * Math.sin(3 * meanAnomaly);
  // the longitude of the date, taken back to the equinox of 2000.0 (the equinox slides 1.397 degrees a century)
  return wrap360(meanLongitude + centre - 1.397 * t);
}

/** Greenwich sidereal time, in degrees: how far the Earth has turned against the stars. */
function siderealGreenwich(ms: number): number {
  const days = ms / DAY_MS + 2_440_587.5 - 2_451_545;
  const t = days / 36_525;
  return wrap360(280.46061837 + 360.98564736629 * days + 0.000387933 * t * t);
}

/** How far the Sun's longitude is from a shower's maximum at the start of its first day and the end of its last, in degrees (both positive). The list's dates are right for 2026, so that year's Sun is read. */
const spans = new WeakMap<MeteorShower, { before: number; after: number }>();
function span(shower: MeteorShower): { before: number; after: number } {
  let found = spans.get(shower);
  if (!found) {
    const first = solarLongitude(Date.UTC(2026, shower.start[0] - 1, shower.start[1]));
    const last = solarLongitude(Date.UTC(2026, shower.end[0] - 1, shower.end[1] + 1));
    found = { before: Math.max(0, -wrap180(first - shower.peakSolarLongitude)), after: Math.max(0, wrap180(last - shower.peakSolarLongitude)) };
    spans.set(shower, found);
  }
  return found;
}

/**
 * How strong a shower is at a moment: its zenithal hourly rate then, 0 outside its dates.
 * The list gives the rate at the maximum and the first and last days of activity; between them this draws the simplest curve that fits:
 * the rate falls away from the maximum by the same factor for each degree the Earth moves on, down to half a meteor an hour at the start of the first day and the end of the last.
 * A real shower's curve differs (the Quadrantids' maximum lasts hours, the Taurids' weeks). A shower the list calls variable gives 0.
 *
 * @param shower - A shower of `METEOR_SHOWERS`.
 * @param ms - The moment, in milliseconds since the epoch.
 * @returns The zenithal hourly rate, in meteors an hour.
 *
 * @example
 * ```ts
 * import { METEOR_SHOWERS, showerRate } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const geminids = METEOR_SHOWERS.find((shower) => shower.code === "GEM")!;
 * console.log(showerRate(geminids, Date.UTC(2026, 11, 14, 8)).toFixed(0), showerRate(geminids, Date.UTC(2026, 5, 1))); // "150" 0
 * ```
 */
export function showerRate(shower: MeteorShower, ms: number): number {
  if (shower.zhr === null) return 0;
  const from = wrap180(solarLongitude(ms) - shower.peakSolarLongitude);
  const { before, after } = span(shower);
  const reach = from < 0 ? before : after;
  if (Math.abs(from) > reach) return 0;
  if (reach === 0 || shower.zhr <= FLOOR) return shower.zhr;
  return shower.zhr * Math.pow(FLOOR / shower.zhr, Math.abs(from) / reach);
}
/** The rate a shower is taken to have on its first and last day, in meteors an hour. */
const FLOOR = 0.5;

/**
 * The showers active at a moment, strongest first, each with its rate then.
 *
 * @param ms - The moment, in milliseconds since the epoch.
 * @returns The active showers and their zenithal hourly rates (see `showerRate`).
 *
 * @example
 * ```ts
 * import { activeShowers } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * for (const { shower, zhr } of activeShowers(Date.UTC(2026, 7, 12))) console.log(shower.name, zhr.toFixed(1));
 * ```
 */
export function activeShowers(ms: number): { shower: MeteorShower; zhr: number }[] {
  return METEOR_SHOWERS.map((shower) => ({ shower, zhr: showerRate(shower, ms) }))
    .filter((entry) => entry.zhr > 0)
    .sort((a, b) => b.zhr - a.zhr);
}

/**
 * The place on the Earth where a point of the sky stands overhead at a moment: for a shower's radiant, the middle of the half
 * of the Earth its meteors fall on.
 *
 * @param sky - Right ascension and declination, in degrees.
 * @param ms - The moment, in milliseconds since the epoch.
 * @returns The longitude and latitude of that place, in degrees.
 *
 * @example
 * ```ts
 * import { METEOR_SHOWERS, pointBeneath } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const perseids = METEOR_SHOWERS.find((shower) => shower.code === "PER")!;
 * const place = pointBeneath(perseids.radiant, Date.UTC(2026, 7, 13, 2));
 * console.log(place.lat, place.lon.toFixed(0)); // 58 and the longitude then
 * ```
 */
export function pointBeneath(sky: { ra: number; dec: number }, ms: number): GeoPoint {
  return { lon: wrap180(sky.ra - siderealGreenwich(ms)), lat: sky.dec };
}

/**
 * The place on the Earth that faces the way the Earth is travelling round the Sun (the apex of its way): it sits on the morning side,
 * which sweeps up more meteors than the evening side.
 *
 * @param ms - The moment, in milliseconds since the epoch.
 * @returns The longitude and latitude of that place, in degrees.
 *
 * @example
 * ```ts
 * import { apexPoint } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(Math.abs(apexPoint(Date.UTC(2026, 2, 20, 12)).lat) < 24); // true: it stays within the tropics
 * ```
 */
export function apexPoint(ms: number): GeoPoint {
  // the Earth moves towards the point of the ecliptic 90 degrees behind the Sun
  const longitude = (solarLongitude(ms) - 90) * RAD;
  const obliquity = 23.4393 * RAD;
  const ra = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude)) / RAD;
  const dec = Math.asin(Math.sin(obliquity) * Math.sin(longitude)) / RAD;
  return pointBeneath({ ra: wrap360(ra), dec }, ms);
}

/**
 * A place as a unit vector: x to longitude 90 east on the equator, y to the north pole, z to longitude 0 on the equator (the realistic Earth's own axes).
 *
 * @param point - Longitude and latitude, in degrees.
 * @returns The unit vector from the Earth's centre to that place.
 *
 * @example
 * ```ts
 * import { placeVector } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(placeVector({ lon: 0, lat: 90 }).map((n) => Math.round(n))); // [0, 1, 0]
 * ```
 */
export const placeVector = (point: GeoPoint): [number, number, number] => {
  const lon = point.lon * RAD;
  const lat = point.lat * RAD;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
};

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * What decides the meteors over the whole Earth at one moment, worked out once: the active showers with the places their radiants
 * stand over, and the apex. `hourlyRateAt` reads it for each place, so a caller that asks about many places does the astronomy once.
 *
 * @example
 * ```ts
 * import { meteorSky, type MeteorSky } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const sky: MeteorSky = meteorSky(Date.UTC(2026, 11, 14, 8));
 * console.log(sky.showers[0]?.shower.name); // "Geminids"
 * ```
 */
export interface MeteorSky {
  ms: number;
  /** The active showers, strongest first: the rate then, and the unit vector of the place the radiant is overhead. */
  showers: { shower: MeteorShower; zhr: number; overhead: [number, number, number] }[];
  /** The unit vector of the place that faces the Earth's way. */
  apex: [number, number, number];
}

/**
 * The meteor sky of a moment (see `MeteorSky`).
 *
 * @param ms - The moment, in milliseconds since the epoch.
 * @returns The active showers with their rates and radiant places, and the apex.
 *
 * @example
 * ```ts
 * import { hourlyRateAt, meteorSky } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const sky = meteorSky(Date.UTC(2026, 7, 13, 2));
 * console.log(hourlyRateAt(sky, { lon: 139.7, lat: 35.7 }).toFixed(1));
 * ```
 */
export function meteorSky(ms: number): MeteorSky {
  return {
    ms,
    showers: activeShowers(ms).map(({ shower, zhr }) => ({ shower, zhr, overhead: placeVector(pointBeneath(shower.radiant, ms)) })),
    apex: placeVector(apexPoint(ms)),
  };
}

/**
 * How many meteors an ideal watcher at a place would count in an hour under a perfect dark sky, whether or not it is dark there:
 * the sporadic background, a little more on the side that faces the Earth's way and a little less on the other, plus each active
 * shower's rate times the sine of its radiant's height (none where the radiant is below the horizon).
 * The lean towards the morning side (from 0.4 to 1.6 times `SPORADIC_HOURLY_RATE`) is a simple stand-in for the real daily swing.
 *
 * @param sky - The meteor sky of the moment (`meteorSky`).
 * @param place - The place, or its unit vector (`placeVector`).
 * @returns Meteors an hour.
 *
 * @example
 * ```ts
 * import { hourlyRateAt, meteorSky, pointBeneath } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const moment = Date.UTC(2026, 11, 14, 8);
 * const sky = meteorSky(moment);
 * // Under the Geminids' radiant the rate is the shower's whole rate and the background on top.
 * console.log(hourlyRateAt(sky, pointBeneath(sky.showers[0]!.shower.radiant, moment)) > 150);
 * ```
 */
export function hourlyRateAt(sky: MeteorSky, place: GeoPoint | readonly [number, number, number]): number {
  const p = Array.isArray(place) ? (place as readonly [number, number, number]) : placeVector(place as GeoPoint);
  let rate = SPORADIC_HOURLY_RATE * (1 + 0.6 * dot(p, sky.apex));
  for (const entry of sky.showers) {
    const height = dot(p, entry.overhead);
    if (height > 0) rate += entry.zhr * height;
  }
  return rate;
}

/**
 * How dark the sky is at a place, from 0 (the Sun is up) to 1 (the Sun is 6 degrees or more below the horizon, the end of civil twilight),
 * rising evenly between: meteors are counted as seen only where it is dark.
 *
 * @param place - The place's unit vector (`placeVector`).
 * @param sun - The unit vector of the place the Sun is overhead.
 * @returns 0 to 1.
 *
 * @example
 * ```ts
 * import { darkness, placeVector } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const sun = placeVector({ lon: 0, lat: 0 });
 * console.log(darkness(placeVector({ lon: 0, lat: 0 }), sun), darkness(placeVector({ lon: 180, lat: 0 }), sun)); // 0 1
 * ```
 */
export function darkness(place: readonly [number, number, number], sun: readonly [number, number, number]): number {
  const sine = dot(place, sun);
  const edge = Math.sin(6 * RAD);
  return sine >= 0 ? 0 : Math.min(1, -sine / edge);
}
