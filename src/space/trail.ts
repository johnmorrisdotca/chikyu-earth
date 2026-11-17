// The Observe view's trail: the last N orbits of a satellite's path as points in the space view's axes. Pure numbers and no allocation in a frame: the points of the past are worked out once, on a grid a
// forty-eighth of an orbit apart, and kept, so a frame costs one SGP4 call for the satellite's own place and the points that have come into the window since the last frame.
import { PATH_POINTS } from "./path-ribbons.ts";

/**
 * How many orbits the Observe view's trail reaches back when the page does not say (3).
 *
 * @example
 * ```ts
 * import { TRAIL_DEFAULT_ORBITS } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(TRAIL_DEFAULT_ORBITS); // 3
 * ```
 */
export const TRAIL_DEFAULT_ORBITS = 3;
/**
 * The most orbits a trail reaches back (20): about 31 hours for the ISS.
 *
 * @example
 * ```ts
 * import { TRAIL_MAX_ORBITS } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(TRAIL_MAX_ORBITS); // 20
 * ```
 */
export const TRAIL_MAX_ORBITS = 20;
/**
 * Points to an orbit on the trail's grid: 3.75 degrees of the orbit between two.
 *
 * @example
 * ```ts
 * import { TRAIL_POINTS_PER_ORBIT } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(TRAIL_POINTS_PER_ORBIT); // 96
 * ```
 */
export const TRAIL_POINTS_PER_ORBIT = 96;
/**
 * The most points a trail holds: the grid points of the longest window, the satellite's own place and one over. The size of the array `TrailBuilder.build` writes into is this many points of 3 numbers.
 *
 * @example
 * ```ts
 * import { TRAIL_MAX_POINTS } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(new Float32Array(TRAIL_MAX_POINTS * 3).length); // 5766
 * ```
 */
export const TRAIL_MAX_POINTS = TRAIL_MAX_ORBITS * TRAIL_POINTS_PER_ORBIT + 2;
/** The ribbon slots a trail needs, 120 points each with one shared between neighbours. */
export const TRAIL_SLOTS = Math.ceil((TRAIL_MAX_POINTS - 1) / (PATH_POINTS - 1));

/**
 * The number of orbits a trail reaches back, read from what a page gave: a number from a quarter of an orbit to {@link TRAIL_MAX_ORBITS} (anything else is {@link TRAIL_DEFAULT_ORBITS}).
 *
 * @param value - A number, a numeric string, or anything else.
 * @returns Orbits, 0.25 to 20.
 *
 * @example
 * ```ts
 * import { trailOrbits } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(trailOrbits(5), trailOrbits(100), trailOrbits("x")); // 5 20 3
 * ```
 */
export function trailOrbits(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return TRAIL_DEFAULT_ORBITS;
  return Math.min(TRAIL_MAX_ORBITS, Math.max(0.25, n));
}

/**
 * Where a satellite is at a moment (Earth radii in the space view's axes into `out[0..2]`; km/s in `out[3..5]`): false when it is not placed then.
 *
 * @example
 * ```ts
 * import type { PlaceAt } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const nowhere: PlaceAt = () => false;
 * console.log(nowhere(0, new Float64Array(6))); // false
 * ```
 */
export type PlaceAt = (ms: number, out: Float64Array) => boolean;

/**
 * A builder of the Observe view's trail: it keeps the points of the past between calls, so a frame costs only what is new.
 *
 * @example
 * ```ts
 * import { createTrailBuilder, type TrailBuilder } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const builder: TrailBuilder = createTrailBuilder();
 * console.log(builder.calls); // 0
 * ```
 */
export interface TrailBuilder {
  /**
   * Work out the trail for `orbits` orbits (one is `periodMs`) ending at `ms` into `out` (3 numbers a point, at least {@link TRAIL_MAX_POINTS} points of room): the kept grid points inside the window, oldest first,
   * then the satellite's own place at `ms`. Returns how many points are valid, 0 when the satellite is not placed at `ms`. A grid point where it was not placed (before its launch) is left out.
   */
  build(place: PlaceAt, periodMs: number, orbits: number, ms: number, out: Float32Array): number;
  /** Forget the kept points: the satellite changed. */
  reset(): void;
  /** SGP4 calls (calls of `place`) made so far, for a test to count. */
  readonly calls: number;
}

const RING = 1024;

/**
 * A builder of trails. It keeps the points of the past between calls; give it a satellite's `place` and call `reset()` when the satellite is another.
 *
 * @returns The builder.
 *
 * @example
 * ```ts
 * import { createTrailBuilder, TRAIL_MAX_POINTS } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const builder = createTrailBuilder();
 * const out = new Float32Array(TRAIL_MAX_POINTS * 3);
 * // a satellite going round the Earth's equator once in 90 minutes
 * const place = (ms: number, o: Float64Array): boolean => {
 *   const a = (ms / 5_400_000) * 2 * Math.PI;
 *   o[0] = 1.07 * Math.cos(a);
 *   o[1] = 0;
 *   o[2] = -1.07 * Math.sin(a);
 *   return true;
 * };
 * console.log(builder.build(place, 5_400_000, 2, 10_000_000, out)); // 98
 * ```
 */
export function createTrailBuilder(): TrailBuilder {
  const keys = new Float64Array(RING).fill(Number.NaN);
  const kept = new Float32Array(RING * 3);
  const good = new Uint8Array(RING);
  const here = new Float64Array(6);
  let step = Number.NaN;
  let calls = 0;
  const slot = (g: number): number => ((g % RING) + RING) % RING;
  const reset = (): void => {
    keys.fill(Number.NaN);
    step = Number.NaN;
  };
  return {
    build(place, periodMs, orbits, ms, out) {
      if (!(periodMs > 0) || !(orbits > 0)) return 0;
      const dt = periodMs / TRAIL_POINTS_PER_ORBIT;
      if (dt !== step) {
        keys.fill(Number.NaN);
        step = dt;
      }
      calls += 1;
      if (!place(ms, here)) return 0;
      const live0 = here[0]!;
      const live1 = here[1]!;
      const live2 = here[2]!;
      const last = Math.floor(ms / dt);
      const first = Math.max(last - (TRAIL_MAX_POINTS - 3), Math.ceil((ms - Math.min(orbits, TRAIL_MAX_ORBITS) * periodMs) / dt));
      let count = 0;
      for (let g = first; g <= last; g += 1) {
        const s = slot(g);
        if (keys[s] !== g) {
          keys[s] = g;
          calls += 1;
          const ok = place(g * dt, here);
          good[s] = ok ? 1 : 0;
          if (ok) {
            kept[s * 3] = here[0]!;
            kept[s * 3 + 1] = here[1]!;
            kept[s * 3 + 2] = here[2]!;
          }
        }
        if (good[s] !== 1) continue;
        out[count * 3] = kept[s * 3]!;
        out[count * 3 + 1] = kept[s * 3 + 1]!;
        out[count * 3 + 2] = kept[s * 3 + 2]!;
        count += 1;
      }
      out[count * 3] = live0;
      out[count * 3 + 1] = live1;
      out[count * 3 + 2] = live2;
      return count + 1;
    },
    reset,
    get calls() {
      return calls;
    },
  };
}
