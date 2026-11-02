// Where the Sun, the Moon and the planets are, as seen from the centre of the Earth, for any date. astronomy-engine (MIT) does the sums; this file asks it
// for a handful of vectors, keeps them in the scene's axes, and lets a draw interpolate between two answers a second apart instead of asking at every frame.
import { Body, GeoVector, HelioVector, SiderealTime } from "astronomy-engine";

/**
 * A position or direction as `[x, y, z]`, in the scene's axes (x toward the vernal equinox, y north).
 *
 * @example
 * ```ts
 * import type { Vec3 } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const origin: Vec3 = [0, 0, 0];
 * console.log(origin);
 * ```
 */
export type Vec3 = [number, number, number];

/**
 * The planets drawn, nearest the Sun first.
 *
 * @example
 * ```ts
 * import { PLANETS } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(PLANETS.join(", "));
 * ```
 */
export const PLANETS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"] as const;
/**
 * One of the seven planets drawn, by name.
 *
 * @example
 * ```ts
 * import { orbitPath, type PlanetName } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const planet: PlanetName = "Mars";
 * console.log(orbitPath(planet, Date.UTC(2026, 10, 2), 8).length);
 * ```
 */
export type PlanetName = (typeof PLANETS)[number];

/**
 * Where everything is at one moment: positions in astronomical units from the Earth's centre, in scene axes (x to the vernal equinox, y north, z toward -y of the equator).
 *
 * @example
 * ```ts
 * import { frameAt, type Frame } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const frame: Frame = frameAt(Date.UTC(2026, 10, 2, 12));
 * console.log(Object.keys(frame.planets).length, frame.spin.toFixed(0));
 * ```
 */
export interface Frame {
  ms: number;
  sun: Vec3;
  moon: Vec3;
  planets: Record<PlanetName, Vec3>;
  /** Greenwich sidereal time, in degrees: how far the Earth has turned against the stars. */
  spin: number;
}

/** Equatorial J2000 axes (x to the vernal equinox, z to the north pole) to the scene's (y up). */
const scene = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.z, -v.y];

const AU_KM = 149_597_870.7;
/**
 * The Earth's radius in kilometres, the unit of the scene's distances.
 *
 * @example
 * ```ts
 * import { EARTH_RADIUS_KM } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(EARTH_RADIUS_KM);
 * ```
 */
export const EARTH_RADIUS_KM = 6371;
/**
 * Earth radii in one astronomical unit.
 *
 * @example
 * ```ts
 * import { AU_IN_EARTH_RADII } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(Math.round(AU_IN_EARTH_RADII));
 * ```
 */
export const AU_IN_EARTH_RADII = AU_KM / EARTH_RADIUS_KM;

/**
 * The state of the sky at `ms`: nine vectors and an angle, in a few tenths of a millisecond. It needs astronomy-engine (an optional peer dependency).
 *
 * @param ms - A moment, in milliseconds since the Unix epoch.
 * @returns The Sun, the Moon and the planets as seen from the Earth's centre, and how far the Earth has turned.
 *
 * @example
 * ```ts
 * import { frameAt } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const frame = frameAt(Date.UTC(2026, 10, 2, 12));
 * console.log(frame.moon.map((n) => n.toFixed(4)));
 * ```
 */
export function frameAt(ms: number): Frame {
  const date = new Date(ms);
  const planets = {} as Record<PlanetName, Vec3>;
  for (const name of PLANETS) planets[name] = scene(GeoVector(Body[name], date, true));
  return {
    ms,
    sun: scene(GeoVector(Body.Sun, date, true)),
    moon: scene(GeoVector(Body.Moon, date, true)),
    planets,
    spin: SiderealTime(date) * 15,
  };
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * A frame between two others, `t` from 0 to 1. The spin goes the short way round, so a step under half a turn is right.
 *
 * @param a - The earlier frame.
 * @param b - The later frame.
 * @param t - How far from `a` to `b`, from 0 to 1.
 * @returns The frame at that fraction.
 *
 * @example
 * ```ts
 * import { blend, frameAt } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const start = Date.UTC(2026, 10, 2);
 * const middle = blend(frameAt(start), frameAt(start + 1000), 0.5);
 * console.log(middle.ms - start);
 * ```
 */
export function blend(a: Frame, b: Frame, t: number): Frame {
  const planets = {} as Record<PlanetName, Vec3>;
  for (const name of PLANETS) planets[name] = lerp3(a.planets[name], b.planets[name], t);
  let turn = b.spin - a.spin;
  turn -= 360 * Math.round(turn / 360);
  return { ms: a.ms + (b.ms - a.ms) * t, sun: lerp3(a.sun, b.sun, t), moon: lerp3(a.moon, b.moon, t), planets, spin: a.spin + turn * t };
}

/**
 * Answers for any moment from two real ones: `at(ms)` asks astronomy-engine only when `ms` leaves the span the last two answers cover, and then looks
 * `stepMs` ahead, so playing time at a steady rate costs one pair of lookups every `stepMs` and every draw in between is arithmetic.
 *
 * @param initialStepMs - How far ahead the second answer looks, in milliseconds.
 * @returns A track: `at(ms)` for a frame, `lookups` for how many times the ephemeris was asked, `ends()` for the two answers it is between (undefined before the first `at`), `reset()` and `setStep(ms)`.
 *
 * @example
 * ```ts
 * import { createTrack } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const track = createTrack(1000);
 * const start = Date.UTC(2026, 10, 2);
 * for (let step = 0; step < 10; step += 1) track.at(start + step * 50);
 * console.log(track.lookups);
 * ```
 */
export function createTrack(initialStepMs = 1000) {
  let stepMs = initialStepMs;
  let a: Frame | undefined;
  let b: Frame | undefined;
  let lookups = 0;
  return {
    at(ms: number): Frame {
      if (!a || !b || ms < a.ms || ms > b.ms) {
        a = frameAt(ms);
        b = frameAt(ms + stepMs);
        lookups += 2;
      }
      return blend(a, b, (ms - a.ms) / (b.ms - a.ms));
    },
    /** The two answers the track is between now (undefined before the first), for working out which way something is going. */
    ends(): [Frame, Frame] | undefined {
      return a && b ? [a, b] : undefined;
    },
    /** How many times astronomy-engine has been asked for a frame. */
    get lookups(): number {
      return lookups;
    },
    reset(): void {
      a = undefined;
      b = undefined;
    },
    /** Look further ahead (a faster game clock): the next lookup uses it. */
    setStep(ms: number): void {
      stepMs = Math.max(1, ms);
      a = undefined;
      b = undefined;
    },
  };
}

/** The path a planet takes round the Sun, as `count` points around the orbit that starts where the planet is at `ms`, relative to the Sun (scene axes, AU).
 *
 * @param name - The planet.
 * @param ms - The moment the orbit starts at, in milliseconds since the Unix epoch.
 * @param count - How many segments to cut the orbit into.
 * @returns `count + 1` points, the last on the first.
 *
 * @example
 * ```ts
 * import { orbitPath } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const points = orbitPath("Jupiter", Date.UTC(2026, 10, 2), 12);
 * console.log(points.length);
 * ```
 */
export function orbitPath(name: PlanetName, ms: number, count = 96): Vec3[] {
  const periodDays = { Mercury: 87.97, Venus: 224.7, Mars: 686.98, Jupiter: 4332.6, Saturn: 10759, Uranus: 30688, Neptune: 60182 }[name];
  const points: Vec3[] = [];
  for (let i = 0; i <= count; i += 1) points.push(scene(HelioVector(Body[name], new Date(ms + (i / count) * periodDays * 86_400_000))));
  return points;
}

/** The Earth's own place relative to the Sun, for placing the orbits round the Sun's place in the Earth-centred scene. */

