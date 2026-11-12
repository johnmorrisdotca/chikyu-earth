// SGP4 for a group of satellites, kept cheap: the whole group is run at two moments a step apart and every position in between is an interpolation, so the cost is one batch a step
// (about once a second), never one a frame. Above that step, `pin` samples about a thirtieth of the group each call and `arc` turns each satellite from its own sample.
// satellite.js (MIT) does the SGP4 itself; this file never touches the screen and imports on a server.
import { json2satrec, sgp4 } from "satellite.js";
import { CLASS_COLOURS } from "../catalogue/kinds.ts";
import { classOfElements } from "../catalogue/orbit.ts";
import { DEFAULT_DIM_AFTER_DAYS, DEFAULT_MAX_AGE_DAYS } from "./limits.ts";
import type { ElementSet, RefusedElementSet, SatelliteInfo, Satellites } from "./types.ts";

/** The Earth's mean radius in kilometres: the unit of every position here (the same as the space view's). */
const EARTH_RADIUS_KM = 6371;
const DAY_MS = 86_400_000;
const MIN_STEP_MS = 1000;
const MAX_STEP_MS = 60_000;
/**
 * From this eccentricity up, a satellite is not turned about its orbit's axis at the mean motion above the interpolation limit, because it does not go round at a steady rate or stay at one height
 * (a Molniya orbit is 10 times quicker at its lowest point than its mean): its place and its streak are SGP4 itself, two calls a frame, for the few that are this eccentric.
 */
export const ECCENTRIC_FROM = 0.02;

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
  const normal = new Float32Array(n * 3);
  const rate = new Float64Array(n);
  const classColour = new Float32Array(n * 3);
  const eccentric: number[] = [];
  let newestEpochMs = 0;
  for (let i = 0; i < n; i += 1) {
    const set = usable[i]!;
    const epoch = epochs[i]!;
    if (epoch > newestEpochMs) newestEpochMs = epoch;
    const iRad = (set.INCLINATION * Math.PI) / 180;
    const oRad = (set.RA_OF_ASC_NODE * Math.PI) / 180;
    const si = Math.sin(iRad);
    const ci = Math.cos(iRad);
    normal[i * 3] = Math.sin(oRad) * si;
    normal[i * 3 + 1] = ci;
    normal[i * 3 + 2] = Math.cos(oRad) * si;
    rate[i] = (set.MEAN_MOTION * 2 * Math.PI) / DAY_MS;
    if (set.ECCENTRICITY >= ECCENTRIC_FROM) eccentric.push(i);
    const kind = classOfElements(set.MEAN_MOTION, set.ECCENTRICITY) ?? "other";
    const hex = Number.parseInt(CLASS_COLOURS[kind].slice(1), 16);
    classColour[i * 3] = ((hex >> 16) & 255) / 255;
    classColour[i * 3 + 1] = ((hex >> 8) & 255) / 255;
    classColour[i * 3 + 2] = (hex & 255) / 255;
  }
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
  const pinned = new Float32Array(n * 3);
  const pinOk = new Uint8Array(n);
  /** The game time each satellite was last pinned at. NaN until its first pin, so a slice can be newer than its neighbour. */
  const pinAt = new Float64Array(n);
  pinAt.fill(Number.NaN);
  let pinCursor = 0;
  /** A full pin is spread over this many calls, about one a frame, so the group is refreshed about once a second at 30 frames a second. */
  const PIN_FRAMES = 30;

  /** Turn `x,y,z` about the unit axis `nx,ny,nz` by `ang` radians, into `out` at `at` (no allocation: it runs for every satellite on every frame). */
  const turn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, ang: number, out: Float32Array, at: number): void => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const dot = nx * x + ny * y + nz * z;
    const k = 1 - c;
    out[at] = x * c + (ny * z - nz * y) * s + nx * dot * k;
    out[at + 1] = y * c + (nz * x - nx * z) * s + ny * dot * k;
    out[at + 2] = z * c + (nx * y - ny * x) * s + nz * dot * k;
  };
  const place = new Float64Array(6);
  const isEccentric = new Uint8Array(n);
  for (const i of eccentric) isEccentric[i] = 1;

  /** SGP4 for one satellite at one moment, into `buffer` in the space view's axes (TEME x, z, -y: x to the vernal equinox, y north). */
  const propagate = (i: number, ms: number, buffer: Float32Array, ok: Uint8Array): void => {
    const epoch = epochs[i]!;
    if (Math.abs(ms - epoch) > maxAgeMs) {
      ok[i] = 0;
      return;
    }
    propagations += 1;
    const result = sgp4(recs[i]!, (ms - epoch) / 60_000) as Sample;
    const p = result && result.position;
    if (!p || !Number.isFinite(p.x)) {
      ok[i] = 0;
      return;
    }
    ok[i] = 1;
    buffer[i * 3] = p.x / EARTH_RADIUS_KM;
    buffer[i * 3 + 1] = p.z / EARTH_RADIUS_KM;
    buffer[i * 3 + 2] = -p.y / EARTH_RADIUS_KM;
  };
  /** SGP4 for the whole group at one moment. */
  const sample = (buffer: Float32Array, ok: Uint8Array, ms: number): void => {
    const started = performance.now();
    for (let i = 0; i < n; i += 1) propagate(i, ms, buffer, ok);
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
    newestEpochMs,
    classColour,
    get placed() {
      return placed;
    },
    pin(ms, all = false) {
      if (n === 0) return;
      if (all) {
        sample(pinned, pinOk, ms);
        for (let i = 0; i < n; i += 1) pinAt[i] = pinOk[i] === 1 ? ms : Number.NaN;
        pinCursor = 0;
        return;
      }
      const started = performance.now();
      const take = Math.max(1, Math.ceil(n / PIN_FRAMES));
      for (let k = 0; k < take; k += 1) {
        const i = (pinCursor + k) % n;
        propagate(i, ms, pinned, pinOk);
        pinAt[i] = pinOk[i] === 1 ? ms : Number.NaN;
      }
      pinCursor = (pinCursor + take) % n;
      timing.lastBatchMs = performance.now() - started;
      if (timing.lastBatchMs > timing.maxBatchMs) timing.maxBatchMs = timing.lastBatchMs;
    },
    arc(ms, spanMs, positions, segments) {
      if (n === 0) return 0;
      const span = spanMs;
      let count = 0;
      for (let i = 0; i < n; i += 1) {
        const k = i * 3;
        const dim = Math.abs(ms - epochs[i]!) > dimAfterMs ? 1 : 0;
        if (dim !== dimmed[i]) {
          dimmed[i] = dim;
          dimVersion += 1;
        }
        const w = k * 2;
        if (isEccentric[i] === 1) {
          if (!exactAt(i, ms, place)) {
            positions.fill(0, k, k + 3);
            segments.fill(0, w, w + 6);
            shown[i] = 0;
            continue;
          }
          positions[k] = place[0]!;
          positions[k + 1] = place[1]!;
          positions[k + 2] = place[2]!;
          segments[w + 3] = place[0]!;
          segments[w + 4] = place[1]!;
          segments[w + 5] = place[2]!;
          if (exactAt(i, ms - span, place)) {
            segments[w] = place[0]!;
            segments[w + 1] = place[1]!;
            segments[w + 2] = place[2]!;
          } else {
            segments[w] = positions[k]!;
            segments[w + 1] = positions[k + 1]!;
            segments[w + 2] = positions[k + 2]!;
          }
          shown[i] = 1;
          count += 1;
          continue;
        }
        if (pinOk[i] !== 1 || !Number.isFinite(pinAt[i])) {
          positions.fill(0, k, k + 3);
          segments.fill(0, w, w + 6);
          shown[i] = 0;
          continue;
        }
        const nx = normal[k]!;
        const ny = normal[k + 1]!;
        const nz = normal[k + 2]!;
        const sweep = Math.max(-Math.PI, Math.min(Math.PI, rate[i]! * span));
        const along = rate[i]! * (ms - pinAt[i]!);
        turn(pinned[k]!, pinned[k + 1]!, pinned[k + 2]!, nx, ny, nz, along, positions, k);
        turn(pinned[k]!, pinned[k + 1]!, pinned[k + 2]!, nx, ny, nz, along - sweep, segments, w);
        segments[w + 3] = positions[k]!;
        segments[w + 4] = positions[k + 1]!;
        segments[w + 5] = positions[k + 2]!;
        shown[i] = 1;
        count += 1;
      }
      placed = count;
      return count;
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
