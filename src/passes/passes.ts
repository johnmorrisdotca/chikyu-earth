// When a satellite crosses the sky over a place. SGP4 (satellite.js, an optional peer) puts the satellite in the sky, this package's own Sun position says whether the watcher's sky is dark and whether
// the satellite is in sunlight, and the brightness follows from the standard magnitude. Pure: no DOM, no clock (the window is given), no state; it imports on a server.
import { ecfToLookAngles, eciToEcf, eciToGeodetic, geodeticToEcf, gstime, json2satrec, sgp4 } from "satellite.js";
import { subsolarPoint } from "../realistic/sun.ts";
import { DEFAULT_DIM_AFTER_DAYS, DEFAULT_MAX_AGE_DAYS } from "../satellites/limits.ts";
import type { ElementSet } from "../satellites/types.ts";
import { magnitude, STANDARD_MAGNITUDES } from "./magnitudes.ts";

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
/** The Earth's equatorial radius, kilometres (WGS84): the radius of the shadow's cylinder. */
const EARTH_RADIUS_KM = 6378.137;
/** The Sun's altitude at sunrise and sunset, degrees: its upper edge on the horizon, with the usual refraction. Below it begins civil twilight. */
const SUNSET = -0.833;
const SCAN_MS = 30_000;
const SAMPLE_MS = 2000;

/**
 * Where the watcher stands: degrees of latitude (north is positive) and longitude (east is positive), and the height above sea level in metres (0 by default).
 *
 * @example
 * ```ts
 * import type { Observer } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const tokyo: Observer = { latitude: 35.68, longitude: 139.69, heightM: 40 };
 * console.log(tokyo.latitude);
 * ```
 */
export interface Observer {
  latitude: number;
  longitude: number;
  heightM?: number;
}

/**
 * The sixteen points of the compass, the words a pass table uses for a direction.
 *
 * @example
 * ```ts
 * import type { Compass } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const south: Compass = "S";
 * console.log(south);
 * ```
 */
export type Compass = "N" | "NNE" | "NE" | "ENE" | "E" | "ESE" | "SE" | "SSE" | "S" | "SSW" | "SW" | "WSW" | "W" | "WNW" | "NW" | "NNW";
const COMPASS: readonly Compass[] = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/**
 * The compass word for a direction.
 *
 * @param azimuthDeg - Degrees clockwise from north: 0 is north, 90 east, 180 south, 270 west.
 * @returns One of sixteen words, "N" to "NNW".
 *
 * @example
 * ```ts
 * import { compassOf } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * console.log(compassOf(200));
 * ```
 */
export function compassOf(azimuthDeg: number): Compass {
  return COMPASS[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16]!;
}

/**
 * How dark the watcher's sky is, by the Sun's altitude: `day` (the Sun is up), `civil` twilight (the Sun is below the horizon by up to 6 degrees: the brightest stars and planets show), `nautical` (6 to 12 degrees),
 * `astronomical` (12 to 18 degrees) and `night` (more than 18 degrees below).
 *
 * @example
 * ```ts
 * import type { SkyName } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const sky: SkyName = "civil";
 * console.log(sky);
 * ```
 */
export type SkyName = "day" | "civil" | "nautical" | "astronomical" | "night";

/**
 * The name of the sky for a Sun altitude.
 *
 * @param sunAltitudeDeg - The Sun's altitude in degrees: above 0 it is up.
 * @returns `day` above -0.833 degrees (sunrise and sunset), then `civil`, `nautical`, `astronomical` and `night` at -6, -12 and -18.
 *
 * @example
 * ```ts
 * import { skyAt } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * console.log(skyAt(-8));
 * ```
 */
export function skyAt(sunAltitudeDeg: number): SkyName {
  if (sunAltitudeDeg > SUNSET) return "day";
  if (sunAltitudeDeg > -6) return "civil";
  if (sunAltitudeDeg > -12) return "nautical";
  if (sunAltitudeDeg > -18) return "astronomical";
  return "night";
}

/** The Sun's altitude (degrees) that ends each sky: the Sun must be at or below it for the sky to be that dark. */
const SKY_LIMIT: Record<Exclude<SkyName, "day">, number> = { civil: SUNSET, nautical: -6, astronomical: -12, night: -18 };

/** The direction of the Sun in the Earth-fixed frame, a unit vector (x to longitude 0 on the equator, y east, z north). */
function sunVector(ms: number): [number, number, number] {
  const sun = subsolarPoint(ms);
  const lat = sun.lat * RAD;
  const lon = sun.lon * RAD;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

const upVector = (observer: Observer): [number, number, number] => {
  const lat = observer.latitude * RAD;
  const lon = observer.longitude * RAD;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
};

/**
 * The Sun's altitude over a place at a moment, in degrees (above 0 the Sun is up). It uses the package's own low-precision Sun, good to about 0.02 degree, and does not add refraction.
 *
 * @param ms - A moment, in milliseconds since the Unix epoch.
 * @param observer - Where the watcher stands.
 * @returns The altitude of the Sun's centre, in degrees.
 *
 * @example
 * ```ts
 * import { sunAltitude } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * // Tokyo at 9 in the evening local time (12:00 UTC) on 9 November 2026
 * console.log(sunAltitude(Date.UTC(2026, 10, 9, 12), { latitude: 35.68, longitude: 139.69 }).toFixed(0));
 * ```
 */
export function sunAltitude(ms: number, observer: Observer): number {
  const s = sunVector(ms);
  const up = upVector(observer);
  return Math.asin(Math.max(-1, Math.min(1, s[0] * up[0] + s[1] * up[1] + s[2] * up[2]))) / RAD;
}

/**
 * One moment of a pass: when, which way, how high and how far.
 *
 * @example
 * ```ts
 * import type { PassPoint } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const describe = (point: PassPoint): string => `${point.compass} ${point.altitude.toFixed(0)} degrees`;
 * console.log(typeof describe);
 * ```
 */
export interface PassPoint {
  /** The moment, milliseconds since the Unix epoch (UTC; add the place's own offset for local time). */
  ms: number;
  /** Degrees clockwise from north. */
  azimuth: number;
  /** The compass word for `azimuth`. */
  compass: Compass;
  /** Degrees above the horizon (geometric: no refraction). */
  altitude: number;
  /** Distance from the watcher, kilometres. */
  rangeKm: number;
}

/**
 * Why a pass is or is not visible: `visible`; `daylight` (the watcher's sky is too bright for the whole pass); `shadow` (the sky is dark enough but the satellite is in the Earth's shadow for all of it);
 * `faint` (it is lit and the sky is dark, but it is fainter than the limiting magnitude).
 *
 * @example
 * ```ts
 * import type { PassReason } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const reason: PassReason = "shadow";
 * console.log(reason);
 * ```
 */
export type PassReason = "visible" | "daylight" | "shadow" | "faint";

/**
 * The part of a pass a person can see: from when the satellite is lit, the sky is dark enough and it is bright enough and above the lowest altitude, to when one of them stops; and the highest point of that part.
 * It is what a sky-watcher's table lists as the pass.
 *
 * @example
 * ```ts
 * import type { VisiblePart } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const seconds = (part: VisiblePart): number => (part.end.ms - part.start.ms) / 1000;
 * console.log(typeof seconds);
 * ```
 */
export interface VisiblePart {
  start: PassPoint;
  highest: PassPoint;
  end: PassPoint;
}

/**
 * One pass of a satellite over a place: it comes up through `minAltitude`, reaches its highest and goes down below `minAltitude`, with whether and how it can be seen. Times are UTC milliseconds; show them in the place's own time
 * by adding its offset.
 *
 * @example
 * ```ts
 * import type { SatellitePass } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const line = (pass: SatellitePass): string => `${pass.name}: ${pass.highest.altitude.toFixed(0)} degrees ${pass.highest.compass}, ${pass.reason}`;
 * console.log(typeof line);
 * ```
 */
export interface SatellitePass {
  noradId: number;
  name: string;
  /** The pass above `minAltitude`, lit or not. */
  start: PassPoint;
  highest: PassPoint;
  end: PassPoint;
  durationSeconds: number;
  /** The part that can be seen, or undefined when none can. */
  visible: VisiblePart | undefined;
  /** `visible`, or why not. */
  reason: PassReason;
  /** The sky at the watcher's place, at the highest point of the visible part (or of the pass when none is visible). */
  sky: SkyName;
  /** The Sun's altitude then, degrees. */
  sunAltitude: number;
  /** True when the satellite is in sunlight for at least part of the pass above `minAltitude`. */
  sunlit: boolean;
  /** The brightest it is, as a magnitude (smaller is brighter), over the visible part or, when none is visible, over the part that is lit. Undefined when it is never lit or its standard magnitude is not known. */
  magnitude: number | undefined;
  /** The moment of the elements, milliseconds since the Unix epoch. */
  elementEpochMs: number;
  /** Days between the elements' moment and the pass's highest point (negative for a pass before it). */
  elementAgeDays: number;
  /** True when the elements are older than `DEFAULT_DIM_AFTER_DAYS` at the pass: its times are less sure. */
  stale: boolean;
}

/**
 * What `findPasses` may be asked.
 *
 * @example
 * ```ts
 * import type { PassOptions } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const options: PassOptions = { minAltitude: 10, sky: "civil", all: false };
 * console.log(options.minAltitude);
 * ```
 */
export interface PassOptions {
  /** The lowest altitude, degrees, at which a pass counts as begun and ended (10 by default, as sky-watchers' tables use: below it there are trees, buildings and haze). */
  minAltitude?: number;
  /** The lightest sky a watcher may be in for a pass to count as visible: `civil` (the default: twilight or darker), `nautical`, `astronomical` or `night`. */
  sky?: Exclude<SkyName, "day">;
  /** List every pass, with the reason it cannot be seen, and not only the visible ones (false by default). */
  all?: boolean;
  /** A satellite fainter than this (a larger magnitude) counts as not visible (4 by default: a suburban sky). Only when the satellite's standard magnitude is known. */
  limitingMagnitude?: number;
  /** Standard magnitudes by NORAD number, added to (and over) `STANDARD_MAGNITUDES`. */
  magnitudes?: Readonly<Record<number, number>>;
  /** Elements older than this many days at a pass leave the pass out (30 by default, `DEFAULT_MAX_AGE_DAYS`). */
  maxAgeDays?: number;
}

/**
 * The span of time to look in: a pass is listed when its highest point is in it.
 *
 * @example
 * ```ts
 * import type { PassWindow } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const week: PassWindow = { from: Date.UTC(2026, 10, 9), to: Date.UTC(2026, 10, 16) };
 * console.log(week.to - week.from);
 * ```
 */
export interface PassWindow {
  /** The start, milliseconds since the Unix epoch. */
  from: number;
  /** The end, milliseconds since the Unix epoch. */
  to: number;
}

const epochOf = (text: string): number => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);

type Sample = { position: { x: number; y: number; z: number } | false } | null;

/** One satellite seen from one place: the elements, started once, and every question asked of them. */
function watcher(set: ElementSet, observer: Observer) {
  const rec = json2satrec(set as never);
  const epoch = epochOf(set.EPOCH);
  const here = { latitude: observer.latitude * RAD, longitude: observer.longitude * RAD, height: (observer.heightM ?? 0) / 1000 };
  const site = geodeticToEcf(here);
  const up = upVector(observer);
  /** Altitude, azimuth (degrees), range (km), and the satellite's Earth-fixed position, or undefined where SGP4 gives none. */
  const look = (ms: number) => {
    const sample = sgp4(rec, (ms - epoch) / 60_000) as Sample;
    if (!sample || !sample.position || !Number.isFinite(sample.position.x)) return undefined;
    const ecf = eciToEcf(sample.position, gstime(new Date(ms)));
    const angles = ecfToLookAngles(here, ecf);
    return { altitude: angles.elevation / RAD, azimuth: angles.azimuth / RAD, rangeKm: angles.rangeSat, ecf };
  };
  return { epoch, look, site, up };
}

/** Everything about one satellite at one moment, seen from the watcher's place; undefined where SGP4 gives no place. */
function condition(w: ReturnType<typeof watcher>, ms: number, standard: number | undefined) {
  const at = w.look(ms);
  if (!at) return undefined;
  const s = sunVector(ms);
  const r = at.ecf;
  const along = r.x * s[0] + r.y * s[1] + r.z * s[2];
  // in sunlight unless it is on the night side of the Earth and inside the cylinder of shadow behind it
  const sunlit = along >= 0 || r.x * r.x + r.y * r.y + r.z * r.z - along * along > EARTH_RADIUS_KM * EARTH_RADIUS_KM;
  const sunAltitude = Math.asin(Math.max(-1, Math.min(1, s[0] * w.up[0] + s[1] * w.up[1] + s[2] * w.up[2]))) / RAD;
  let mag: number | undefined;
  if (standard !== undefined && sunlit) {
    // the angle at the satellite between the Sun and the watcher
    const dx = w.site.x - r.x;
    const dy = w.site.y - r.y;
    const dz = w.site.z - r.z;
    const cos = (dx * s[0] + dy * s[1] + dz * s[2]) / Math.hypot(dx, dy, dz);
    mag = magnitude(standard, at.rangeKm, Math.acos(Math.max(-1, Math.min(1, cos))) / RAD);
  }
  return { azimuth: at.azimuth, altitude: at.altitude, rangeKm: at.rangeKm, sunlit, sunAltitude, magnitude: mag };
}

/**
 * Where one satellite is in the sky over a place at one moment, and what the light is like: its direction and height, its distance, whether the Sun lights it, how high the Sun is, and how bright it looks.
 *
 * @param set - The satellite's elements.
 * @param observer - Where the watcher stands.
 * @param ms - The moment, milliseconds since the Unix epoch.
 * @param options - `magnitudes` for your own standard magnitudes (the ISS, Tianhe and Hubble are known).
 * @returns Its place in the sky (`altitude` below 0 means below the horizon), `sunlit`, the Sun's altitude and the magnitude (undefined when it is in shadow or its standard magnitude is not known); undefined where SGP4 gives no place.
 *
 * @example
 * ```ts
 * import { satelliteAt } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const iss = {
 *   OBJECT_NAME: "ISS (ZARYA)",
 *   EPOCH: "2026-11-02T10:25:21.580320",
 *   MEAN_MOTION: 15.49150046,
 *   ECCENTRICITY: 0.0007139,
 *   INCLINATION: 51.6332,
 *   RA_OF_ASC_NODE: 335.9757,
 *   ARG_OF_PERICENTER: 339.3739,
 *   MEAN_ANOMALY: 20.6961,
 *   NORAD_CAT_ID: 25544,
 *   BSTAR: 0.00012,
 *   MEAN_MOTION_DOT: 0.0001,
 *   MEAN_MOTION_DDOT: 0,
 * };
 * const where = satelliteAt(iss, { latitude: 51.5, longitude: -0.13 }, Date.UTC(2026, 10, 3, 12));
 * console.log(where?.compass, where?.altitude.toFixed(0));
 * ```
 */
export function satelliteAt(set: ElementSet, observer: Observer, ms: number, options: Pick<PassOptions, "magnitudes"> = {}): (PassPoint & { sunlit: boolean; sunAltitude: number; magnitude: number | undefined }) | undefined {
  const here = condition(watcher(set, observer), ms, { ...STANDARD_MAGNITUDES, ...options.magnitudes }[set.NORAD_CAT_ID]);
  if (!here) return undefined;
  return { ms, azimuth: here.azimuth, compass: compassOf(here.azimuth), altitude: here.altitude, rangeKm: here.rangeKm, sunlit: here.sunlit, sunAltitude: here.sunAltitude, magnitude: here.magnitude };
}

/**
 * Every pass of the satellites over a place in a span of time, the ones a person can see or all of them. For each satellite the search steps through the span every 30 seconds, then narrows each rise, highest point and
 * set to a tenth of a second; for each pass it works out where the satellite is lit by the Sun, how dark the watcher's sky is, and how bright the satellite looks. It needs `satellite.js` (MIT, an optional peer dependency) and
 * imports in a browser or on a server. It is for satellites that rise and set within hours (low orbits); one that stays above the horizon (a geostationary one) has no passes.
 *
 * Passes depend on fresh elements: SGP4's error grows by about a second of time a day or two for the ISS, and a reboost (the ISS has one every month or two) moves the station by more than that all at once, so a pass is as good as the
 * elements are new. Each pass says how old they are (`elementAgeDays`) and flags `stale` after two weeks.
 *
 * @param sets - One element set or several, in CelesTrak's JSON format (`ElementSet`), fetched by your page.
 * @param observer - Where the watcher stands.
 * @param window - The span to look in, `from` to `to` in milliseconds since the Unix epoch; a pass is listed when its highest point is in it.
 * @param options - The lowest altitude, the lightest sky, whether to list the passes that cannot be seen, the limiting magnitude and your own standard magnitudes.
 * @returns The passes, earliest first, each with its start, highest point and end, the part that can be seen and why not when none can.
 *
 * @example
 * ```ts
 * import { findPasses } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const iss = {
 *   OBJECT_NAME: "ISS (ZARYA)",
 *   OBJECT_ID: "1998-067A",
 *   EPOCH: "2026-11-02T10:25:21.580320",
 *   MEAN_MOTION: 15.49150046,
 *   ECCENTRICITY: 0.0007139,
 *   INCLINATION: 51.6332,
 *   RA_OF_ASC_NODE: 335.9757,
 *   ARG_OF_PERICENTER: 339.3739,
 *   MEAN_ANOMALY: 20.6961,
 *   NORAD_CAT_ID: 25544,
 *   BSTAR: 0.00012,
 *   MEAN_MOTION_DOT: 0.0001,
 *   MEAN_MOTION_DDOT: 0,
 * };
 * const day = Date.UTC(2026, 10, 3);
 * const passes = findPasses(iss, { latitude: 51.5, longitude: -0.13 }, { from: day, to: day + 5 * 86_400_000 }, { all: true });
 * console.log(passes.length > 0, passes[0]?.highest.compass);
 * ```
 */
export function findPasses(sets: ElementSet | readonly ElementSet[], observer: Observer, window: PassWindow, options: PassOptions = {}): SatellitePass[] {
  const list: readonly ElementSet[] = Array.isArray(sets) ? sets : [sets as ElementSet];
  const minAltitude = options.minAltitude ?? 10;
  const darkest = SKY_LIMIT[options.sky ?? "civil"];
  const limit = options.limitingMagnitude ?? 4;
  const maxAgeMs = (options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * DAY_MS;
  const standards = { ...STANDARD_MAGNITUDES, ...options.magnitudes };
  const found: SatellitePass[] = [];

  for (const set of list) {
    // a satellite that goes round more slowly than once in about 7 hours (up past the GPS ring) does not rise and set in a way a pass table can use
    if (!(set.MEAN_MOTION >= 3.4)) continue;
    let w: ReturnType<typeof watcher>;
    try {
      w = watcher(set, observer);
    } catch {
      continue;
    }
    if (!Number.isFinite(w.epoch) || w.look(w.epoch) === undefined) continue;
    const standard = standards[set.NORAD_CAT_ID];
    const altitudeAt = (ms: number): number => w.look(ms)?.altitude ?? Number.NEGATIVE_INFINITY;

    /** The moment the altitude passes `level` between `inside` (above it) and `outside` (below it), to 0.01 s. */
    const crossing = (inside: number, outside: number): number => {
      let a = inside;
      let b = outside;
      for (let i = 0; i < 40 && Math.abs(b - a) > 10; i += 1) {
        const m = (a + b) / 2;
        if (altitudeAt(m) >= minAltitude) a = m;
        else b = m;
      }
      return (a + b) / 2;
    };

    const first = window.from - 20 * 60_000;
    const steps = Math.ceil((window.to + 20 * 60_000 - first) / SCAN_MS);
    const alt: number[] = [];
    for (let i = 0; i <= steps; i += 1) alt.push(altitudeAt(first + i * SCAN_MS));

    for (let i = 1; i < steps; i += 1) {
      // a rough top: a sample no lower than the one before and higher than the one after
      if (!(alt[i]! >= alt[i - 1]! && alt[i]! > alt[i + 1]! && alt[i]! > minAltitude - 3)) continue;
      // the exact top, by narrowing a ternary search between the two neighbours
      let lo = first + (i - 1) * SCAN_MS;
      let hi = first + (i + 1) * SCAN_MS;
      for (let k = 0; k < 48 && hi - lo > 10; k += 1) {
        const a = lo + (hi - lo) / 3;
        const b = hi - (hi - lo) / 3;
        if (altitudeAt(a) < altitudeAt(b)) lo = a;
        else hi = b;
      }
      const top = (lo + hi) / 2;
      if (top < window.from || top > window.to || altitudeAt(top) < minAltitude) continue;
      // the rise and the set: step out until the satellite is below the lowest altitude, then narrow
      let before = top;
      while (altitudeAt(before - 10_000) >= minAltitude && top - before < 3_600_000) before -= 10_000;
      let after = top;
      while (altitudeAt(after + 10_000) >= minAltitude && after - top < 3_600_000) after += 10_000;
      if (top - before >= 3_600_000 || after - top >= 3_600_000) continue;
      const start = crossing(before, before - 10_000);
      const end = crossing(after, after + 10_000);
      if (Math.abs(top - w.epoch) > maxAgeMs) continue;

      const point = (ms: number): PassPoint => {
        const at = w.look(ms)!;
        return { ms, azimuth: at.azimuth, compass: compassOf(at.azimuth), altitude: at.altitude, rangeKm: at.rangeKm };
      };

      /** What the watcher can tell at one moment of the pass: is the satellite in sunlight, how dark is the sky, how bright is the satellite. */
      const state = (ms: number) => {
        const at = condition(w, ms, standard)!;
        const dark = at.sunAltitude <= darkest;
        const bright = at.magnitude === undefined || at.magnitude <= limit;
        return { lit: at.sunlit, sun: at.sunAltitude, mag: at.magnitude, dark, bright, seen: at.sunlit && dark && bright && at.altitude >= minAltitude };
      };

      // the part that can be seen, found at 2 s and narrowed at each end
      const seenAt = (ms: number): boolean => w.look(ms) !== undefined && state(ms).seen;
      const edge = (inside: number, outside: number): number => {
        let a = inside;
        let b = outside;
        for (let k = 0; k < 40 && Math.abs(b - a) > 10; k += 1) {
          const m = (a + b) / 2;
          if (seenAt(m)) a = m;
          else b = m;
        }
        return (a + b) / 2;
      };
      let runStart = -1;
      let best: [number, number] | undefined;
      let brightest: number | undefined;
      let brightestLit: number | undefined;
      let anyDark = false;
      let anyLit = false;
      let anySunlit = false;
      for (let ms = start; ms <= end + SAMPLE_MS; ms += SAMPLE_MS) {
        const t = Math.min(ms, end);
        const one = state(t);
        anyDark ||= one.dark;
        if (one.dark && one.lit) anyLit = true;
        if (one.lit) anySunlit = true;
        if (one.lit && one.mag !== undefined && (brightestLit === undefined || one.mag < brightestLit)) brightestLit = one.mag;
        if (one.seen) {
          if (one.mag !== undefined && (brightest === undefined || one.mag < brightest)) brightest = one.mag;
          if (runStart < 0) runStart = t;
          if (best === undefined || t - runStart > best[1] - best[0]) best = [runStart, t];
        } else runStart = -1;
        if (t === end) break;
      }
      let visible: VisiblePart | undefined;
      if (best !== undefined) {
        let vs = best[0];
        let ve = best[1];
        // narrow the ends where they are inside the pass (the run began or ended because of the light, not the pass's own ends)
        if (vs > start + 1) vs = edge(vs, vs - SAMPLE_MS);
        if (ve < end - 1) ve = edge(ve, ve + SAMPLE_MS);
        visible = { start: point(vs), highest: point(Math.min(ve, Math.max(vs, top))), end: point(ve) };
      }
      const mid = visible ? visible.highest.ms : top;
      const here = state(mid);
      const reason: PassReason = visible ? "visible" : !anyDark ? "daylight" : !anyLit ? "shadow" : "faint";
      const pass: SatellitePass = {
        noradId: set.NORAD_CAT_ID,
        name: set.OBJECT_NAME,
        start: point(start),
        highest: point(top),
        end: point(end),
        durationSeconds: (end - start) / 1000,
        visible,
        reason,
        sky: skyAt(here.sun),
        sunAltitude: here.sun,
        sunlit: anySunlit,
        magnitude: visible ? brightest : brightestLit,
        elementEpochMs: w.epoch,
        elementAgeDays: (top - w.epoch) / DAY_MS,
        stale: Math.abs(top - w.epoch) > DEFAULT_DIM_AFTER_DAYS * DAY_MS,
      };
      if (options.all || visible) found.push(pass);
    }
  }
  return found.sort((a, b) => a.highest.ms - b.highest.ms);
}

/**
 * One sample along a pass: when, where in the sky, and whether the satellite is in sunlight (the track is drawn solid there and dashed in the shadow).
 *
 * @example
 * ```ts
 * import type { PathPoint } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const lit = (points: readonly PathPoint[]): number => points.filter((point) => point.sunlit).length;
 * console.log(typeof lit);
 * ```
 */
export interface PathPoint {
  ms: number;
  azimuth: number;
  altitude: number;
  sunlit: boolean;
}

/**
 * The satellite's track across the sky for a pass: a point every `stepSeconds` from the pass's start to its end, with the first and last on the start and the end. Draw it with `skySvg`.
 *
 * @param set - The satellite's elements (the one the pass was found from).
 * @param observer - Where the watcher stands.
 * @param pass - A pass from `findPasses`.
 * @param stepSeconds - Seconds between points (5 by default).
 * @returns The points, in time order.
 *
 * @example
 * ```ts
 * import { findPasses, passPath } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const iss = {
 *   OBJECT_NAME: "ISS (ZARYA)",
 *   EPOCH: "2026-11-02T10:25:21.580320",
 *   MEAN_MOTION: 15.49150046,
 *   ECCENTRICITY: 0.0007139,
 *   INCLINATION: 51.6332,
 *   RA_OF_ASC_NODE: 335.9757,
 *   ARG_OF_PERICENTER: 339.3739,
 *   MEAN_ANOMALY: 20.6961,
 *   NORAD_CAT_ID: 25544,
 *   BSTAR: 0.00012,
 *   MEAN_MOTION_DOT: 0.0001,
 *   MEAN_MOTION_DDOT: 0,
 * };
 * const place = { latitude: 51.5, longitude: -0.13 };
 * const day = Date.UTC(2026, 10, 3);
 * const [first] = findPasses(iss, place, { from: day, to: day + 3 * 86_400_000 }, { all: true });
 * console.log(first ? passPath(iss, place, first).length : 0);
 * ```
 */
export function passPath(set: ElementSet, observer: Observer, pass: SatellitePass, stepSeconds = 5): PathPoint[] {
  const w = watcher(set, observer);
  const out: PathPoint[] = [];
  const step = Math.max(1, stepSeconds) * 1000;
  for (let ms = pass.start.ms; ; ms += step) {
    const t = Math.min(ms, pass.end.ms);
    const at = w.look(t);
    if (at) {
      const s = sunVector(t);
      const r = at.ecf;
      const along = r.x * s[0] + r.y * s[1] + r.z * s[2];
      out.push({ ms: t, azimuth: at.azimuth, altitude: at.altitude, sunlit: along >= 0 || r.x * r.x + r.y * r.y + r.z * r.z - along * along > EARTH_RADIUS_KM * EARTH_RADIUS_KM });
    }
    if (t >= pass.end.ms) break;
  }
  return out;
}

/**
 * One point of a satellite's ground track: the place on the Earth straight under it.
 *
 * @example
 * ```ts
 * import type { GroundPoint } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const north = (points: readonly GroundPoint[]): boolean => points.every((point) => point.lat > 0);
 * console.log(typeof north);
 * ```
 */
export interface GroundPoint {
  ms: number;
  /** Degrees north. */
  lat: number;
  /** Degrees east, -180 to 180. */
  lon: number;
  /** Height above the Earth's surface, kilometres. */
  altitudeKm: number;
}

/**
 * The places straight under a satellite from one moment to another: its ground track. Use a pass's `start.ms` and `end.ms` for the track of one pass, to draw on a globe.
 *
 * @param set - The satellite's elements.
 * @param fromMs - The first moment, milliseconds since the Unix epoch.
 * @param toMs - The last moment.
 * @param stepSeconds - Seconds between points (10 by default).
 * @returns The points, in time order; a moment SGP4 gives no place for is left out.
 *
 * @example
 * ```ts
 * import { groundTrack } from "@johnmorrisdotca/chikyu-earth/passes";
 *
 * const iss = {
 *   OBJECT_NAME: "ISS (ZARYA)",
 *   EPOCH: "2026-11-02T10:25:21.580320",
 *   MEAN_MOTION: 15.49150046,
 *   ECCENTRICITY: 0.0007139,
 *   INCLINATION: 51.6332,
 *   RA_OF_ASC_NODE: 335.9757,
 *   ARG_OF_PERICENTER: 339.3739,
 *   MEAN_ANOMALY: 20.6961,
 *   NORAD_CAT_ID: 25544,
 *   BSTAR: 0.00012,
 *   MEAN_MOTION_DOT: 0.0001,
 *   MEAN_MOTION_DDOT: 0,
 * };
 * const noon = Date.UTC(2026, 10, 3, 12);
 * const track = groundTrack(iss, noon, noon + 10 * 60_000);
 * console.log(track.length, Math.abs(track[0]!.lat) < 52);
 * ```
 */
export function groundTrack(set: ElementSet, fromMs: number, toMs: number, stepSeconds = 10): GroundPoint[] {
  const rec = json2satrec(set as never);
  const epoch = epochOf(set.EPOCH);
  const out: GroundPoint[] = [];
  const step = Math.max(1, stepSeconds) * 1000;
  for (let ms = fromMs; ; ms += step) {
    const t = Math.min(ms, toMs);
    const sample = sgp4(rec, (t - epoch) / 60_000) as Sample;
    if (sample && sample.position && Number.isFinite(sample.position.x)) {
      const place = eciToGeodetic(sample.position, gstime(new Date(t)));
      out.push({ ms: t, lat: place.latitude / RAD, lon: ((((place.longitude / RAD) % 360) + 540) % 360) - 180, altitudeKm: place.height });
    }
    if (t >= toMs) break;
  }
  return out;
}
