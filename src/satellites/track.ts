// SGP4 for a group of satellites, kept cheap: the whole group is run at two moments a step apart and every position in between is an interpolation, so the cost is one batch a step
// (about once a second), never one a frame. satellite.js (MIT) does the SGP4 itself; this file never touches the screen and imports on a server.
import { json2satrec, sgp4 } from "satellite.js";
import { DEFAULT_DIM_AFTER_DAYS, DEFAULT_MAX_AGE_DAYS } from "./limits.ts";
import type { ElementSet, RefusedElementSet, SatelliteInfo, Satellites } from "./types.ts";

/** The Earth's mean radius in kilometres: the unit of every position here (the same as the space view's). */
const EARTH_RADIUS_KM = 6371;
const DAY_MS = 86_400_000;
const MIN_STEP_MS = 1000;
const MAX_STEP_MS = 60_000;

/**
 * What `createSatellites` can be told.
 *
 * @example
 * ```ts
 * import type { SatellitesOptions } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const options: SatellitesOptions = { dimAfterDays: 7, maxAgeDays: 21 };
 * console.log(options.maxAgeDays);
 * ```
 */
export interface SatellitesOptions {
  /** The oldest an element set may be at the moment shown, in days, before the satellite is left out (30 by default). */
  maxAgeDays?: number;
  /** The age, in days, past which a satellite is drawn dimmer because its place is less exact (14 by default). */
  dimAfterDays?: number;
}

type Rec = ReturnType<typeof json2satrec>;
type Sample = { position: { x: number; y: number; z: number } | false; velocity: { x: number; y: number; z: number } | false } | null;

const epochOf = (text: string): number => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);

/**
 * Make a group of satellites from their element sets. Each starts SGP4 once here; one that does not (bad numbers, decayed at its own epoch) is listed in `refused` and left out.
 * It needs satellite.js (MIT, an optional peer dependency) and imports in a browser or on a server.
 *
 * @param sets - Element sets in CelesTrak's JSON format (`ElementSet`), fetched by your page.
 * @param options - `maxAgeDays`: the oldest an element set may be at the moment shown; `dimAfterDays`: the age past which it is drawn dimmer.
 * @returns The group: `at(ms, out)` for positions, `exact`, `orbit`, `info`, and counters.
 *
 * @example
 * ```ts
 * import { createSatellites } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const group = createSatellites([
 *   {
 *     OBJECT_NAME: "ISS (ZARYA)",
 *     OBJECT_ID: "1998-067A",
 *     EPOCH: "2026-11-02T10:25:21.580320",
 *     MEAN_MOTION: 15.49150046,
 *     ECCENTRICITY: 0.0007139,
 *     INCLINATION: 51.6332,
 *     RA_OF_ASC_NODE: 335.9757,
 *     ARG_OF_PERICENTER: 339.3739,
 *     MEAN_ANOMALY: 20.6961,
 *     NORAD_CAT_ID: 25544,
 *     BSTAR: 0.00012,
 *     MEAN_MOTION_DOT: 0.0001,
 *     MEAN_MOTION_DDOT: 0,
 *   },
 * ]);
 * const noon = Date.UTC(2026, 10, 2, 12);
 * console.log(group.count, group.info(0, noon)?.altitudeKm.toFixed(0));
 * ```
 */
export function createSatellites(sets: readonly ElementSet[], options: SatellitesOptions = {}): Satellites {
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const maxAgeMs = maxAgeDays * DAY_MS;
  const dimAfterDays = options.dimAfterDays ?? DEFAULT_DIM_AFTER_DAYS;
  const dimAfterMs = dimAfterDays * DAY_MS;
  const recs: Rec[] = [];
  const usable: ElementSet[] = [];
  const epochs: number[] = [];
  const refused: RefusedElementSet[] = [];
  for (const set of sets) {
    const epoch = epochOf(set.EPOCH);
    const refuse = (reason: string): void => void refused.push({ name: set.OBJECT_NAME, noradId: set.NORAD_CAT_ID, reason });
    if (!Number.isFinite(epoch)) {
      refuse("the epoch is not a date");
      continue;
    }
    try {
      const rec = json2satrec(set as never);
      const start = sgp4(rec, 0) as Sample;
      if (!start || !start.position || !start.velocity || rec.error !== 0) {
        refuse("SGP4 could not start from these elements");
        continue;
      }
      recs.push(rec);
      usable.push(set);
      epochs.push(epoch);
    } catch (error) {
      refuse(error instanceof Error ? error.message : "SGP4 could not start from these elements");
    }
  }

  const n = recs.length;
  let a = new Float32Array(n * 3);
  let b = new Float32Array(n * 3);
  let okA = new Uint8Array(n);
  let okB = new Uint8Array(n);
  const shown = new Uint8Array(n);
  const dimmed = new Float32Array(n);
  let dimVersion = 0;
  let aMs = 0;
  let bMs = 0;
  let ready = false;
  let stepMs = MIN_STEP_MS;
  let propagations = 0;
  let placed = 0;
  const timing = { lastBatchMs: 0, maxBatchMs: 0 };

  /** SGP4 for the whole group at one moment, into `buffer` in the space view's axes (TEME x, z, -y: x to the vernal equinox, y north). */
  const sample = (buffer: Float32Array, ok: Uint8Array, ms: number): void => {
    const started = performance.now();
    for (let i = 0; i < n; i += 1) {
      const epoch = epochs[i]!;
      if (Math.abs(ms - epoch) > maxAgeMs) {
        ok[i] = 0;
        continue;
      }
      propagations += 1;
      const result = sgp4(recs[i]!, (ms - epoch) / 60_000) as Sample;
      const p = result && result.position;
      if (!p || !Number.isFinite(p.x)) {
        ok[i] = 0;
        continue;
      }
      ok[i] = 1;
      buffer[i * 3] = p.x / EARTH_RADIUS_KM;
      buffer[i * 3 + 1] = p.z / EARTH_RADIUS_KM;
      buffer[i * 3 + 2] = -p.y / EARTH_RADIUS_KM;
    }
    timing.lastBatchMs = performance.now() - started;
    if (timing.lastBatchMs > timing.maxBatchMs) timing.maxBatchMs = timing.lastBatchMs;
  };

  const exactAt = (index: number, ms: number, out: Float64Array): boolean => {
    const epoch = epochs[index];
    if (epoch === undefined || Math.abs(ms - epoch) > maxAgeMs) return false;
    propagations += 1;
    const result = sgp4(recs[index]!, (ms - epoch) / 60_000) as Sample;
    if (!result || !result.position || !result.velocity || !Number.isFinite(result.position.x)) return false;
    out[0] = result.position.x / EARTH_RADIUS_KM;
    out[1] = result.position.z / EARTH_RADIUS_KM;
    out[2] = -result.position.y / EARTH_RADIUS_KM;
    out[3] = result.velocity.x;
    out[4] = result.velocity.z;
    out[5] = -result.velocity.y;
    return true;
  };

  return {
    count: n,
    sets: usable,
    refused,
    maxAgeDays,
    dimAfterDays,
    dimmed,
    get dimVersion() {
      return dimVersion;
    },
    get propagations() {
      return propagations;
    },
    timing,
    get placed() {
      return placed;
    },
    setStep(ms) {
      const next = Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, Math.round(ms)));
      if (next !== stepMs) {
        stepMs = next;
        ready = false;
      }
    },
    at(ms, out) {
      if (n === 0) return;
      if (!ready || ms < aMs || ms > bMs) {
        if (ready && ms > bMs && ms - bMs < stepMs) {
          [a, b] = [b, a];
          [okA, okB] = [okB, okA];
          aMs = bMs;
          bMs = aMs + stepMs;
          sample(b, okB, bMs);
        } else if (ready && ms < aMs && aMs - ms < stepMs) {
          [a, b] = [b, a];
          [okA, okB] = [okB, okA];
          bMs = aMs;
          aMs = bMs - stepMs;
          sample(a, okA, aMs);
        } else {
          aMs = ms;
          bMs = ms + stepMs;
          sample(a, okA, aMs);
          sample(b, okB, bMs);
          ready = true;
        }
      }
      const t = (ms - aMs) / (bMs - aMs);
      let count = 0;
      for (let i = 0; i < n; i += 1) {
        const k = i * 3;
        const dim = Math.abs(ms - epochs[i]!) > dimAfterMs ? 1 : 0;
        if (dim !== dimmed[i]) {
          dimmed[i] = dim;
          dimVersion += 1;
        }
        if (okA[i] === 1 && okB[i] === 1) {
          out[k] = a[k]! + (b[k]! - a[k]!) * t;
          out[k + 1] = a[k + 1]! + (b[k + 1]! - a[k + 1]!) * t;
          out[k + 2] = a[k + 2]! + (b[k + 2]! - a[k + 2]!) * t;
          shown[i] = 1;
          count += 1;
        } else {
          out[k] = 0;
          out[k + 1] = 0;
          out[k + 2] = 0;
          shown[i] = 0;
        }
      }
      placed = count;
    },
    visible: (index) => shown[index] === 1,
    exact: exactAt,
    orbit(index, ms, points) {
      const path = new Float32Array((points + 1) * 3);
      const period = 1440 / (usable[index]?.MEAN_MOTION || 15);
      const one = new Float64Array(6);
      for (let k = 0; k < points; k += 1) {
        if (exactAt(index, ms + (k / points) * period * 60_000, one)) path.set(one.subarray(0, 3), k * 3);
        else if (k > 0) path.copyWithin(k * 3, (k - 1) * 3, k * 3);
      }
      path.copyWithin(points * 3, 0, 3);
      return path;
    },
    info(index, ms) {
      const set = usable[index];
      const one = new Float64Array(6);
      if (!set || !exactAt(index, ms, one)) return undefined;
      const info: SatelliteInfo = {
        index,
        name: set.OBJECT_NAME,
        noradId: set.NORAD_CAT_ID,
        objectId: set.OBJECT_ID,
        epochMs: epochs[index]!,
        ageDays: (ms - epochs[index]!) / DAY_MS,
        altitudeKm: Math.hypot(one[0]!, one[1]!, one[2]!) * EARTH_RADIUS_KM - EARTH_RADIUS_KM,
        speedKmS: Math.hypot(one[3]!, one[4]!, one[5]!),
        periodMinutes: 1440 / set.MEAN_MOTION,
        inclinationDeg: set.INCLINATION,
      };
      return info;
    },
  };
}
