// SGP4 for a group of satellites, kept cheap: the whole group is run at two moments a step apart and every position in between is an interpolation, so the cost is one batch a step
// (about once a second), never one a frame. satellite.js (MIT) does the SGP4 itself; this file never touches the screen and imports on a server.
import { constants, json2satrec, sgp4 } from "satellite.js";
import { CLASS_COLOURS } from "../catalogue/kinds.ts";
import { classOfElements } from "../catalogue/orbit.ts";
import { DEFAULT_DIM_AFTER_DAYS, DEFAULT_MAX_AGE_DAYS } from "./limits.ts";
import { ownerCountry } from "./owners.ts";
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
  /**
   * Keep placing a satellite beyond `maxAgeDays` from its element set, as an estimate (off by default): the same elements carried forward or back by the same SGP4 code, where the satellite would be had its orbit not changed.
   * Never before its launch date or after its decay date when the elements carry them (`LAUNCH_DATE`, `DECAY_DATE`; else the launch year in `OBJECT_ID` marks the earliest), and a satellite that SGP4 cannot carry that far, or brings down below about 120 km, is left out.
   *
   * `true` carries the elements on with their air drag left in, so with nobody to boost it a low satellite sinks in the model and is left out some months or years on. `"steady"` switches the drag off beyond `maxAgeDays`: the satellite keeps the height and
   * shape its orbit had on that day, for as long as the clock runs, while the orbit's plane and low point go on turning as the Earth's flattening turns them. It is the satellite's usual orbit, not a prediction. Up to `maxAgeDays` the two are the same, and the place does not jump where one hands over to the other.
   */
  estimateFar?: boolean | "steady";
}

type Rec = ReturnType<typeof json2satrec>;
type Sample = { position: { x: number; y: number; z: number } | false; velocity: { x: number; y: number; z: number } | false; meanElements: { em: number; im: number; Om: number; om: number; mm: number; nm: number } } | null;
/** A satellite's orbit with the drag off, for `estimateFar: "steady"`: the record, the moment it starts from, and how far its first place is from the place the elements give at that moment (kilometres, TEME). */
type Steady = { rec: Rec; startMs: number; dx: number; dy: number; dz: number };

/** A date from the catalogue (`2026-11-02`, or with a time), in milliseconds, or NaN. A bare date is taken as the start of that day UTC. */
const dateOf = (text: string | undefined): number => {
  const t = typeof text === "string" ? text.trim() : "";
  if (t === "") return Number.NaN;
  if (t.length <= 10) return Date.parse(`${t}T00:00:00Z`);
  const iso = t.replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
};
/** The height, in kilometres above the mean Earth radius, below which a satellite carried far from its elements is taken to have come down: SGP4 has nothing true to say there, and it is never drawn inside the Earth. */
const LOWEST_ESTIMATE_KM = 120;
/** How long after the hand-over to a steady orbit what is left of the gap between the two records is faded out, so the place never jumps. The gap is nothing for a low orbit and a few kilometres for a high one that carries a drag term. */
const STEADY_FADE_MS = DAY_MS;
/**
 * How far the mean motion SGP4 has reached at the hand-over may be from the elements' own, as a ratio either way, for a steady orbit to be made from it. Thirty days of real drag or of an engine raising an orbit change it by a few hundredths;
 * a large drag term run that long can run away to an orbit many times higher, which is the arithmetic and not the satellite, and is never held.
 */
const STEADY_MOST_CHANGE = 1.25;
const DEGREES = 180 / Math.PI;
const wholeTurn = (radians: number): number => (((radians * DEGREES) % 360) + 360) % 360;

/**
 * The mean motion an element set must state (Kozai's, radians a minute) for SGP4 to start from the mean motion `nm` (Brouwer's, which is what SGP4 itself works in and gives back).
 * SGP4 turns the first into the second when it starts; this is that step run backwards, and it settles in a few rounds because the difference is about a thousandth.
 */
const statedMeanMotion = (nm: number, eccentricity: number, inclination: number): number => {
  const flat = 1 - eccentricity * eccentricity;
  const cos = Math.cos(inclination);
  const d1 = (0.75 * constants.j2 * (3 * cos * cos - 1)) / (Math.sqrt(flat) * flat);
  let stated = nm;
  for (let round = 0; round < 6; round += 1) {
    const ak = Math.pow(constants.xke / stated, 2 / 3);
    const del = d1 / (ak * ak);
    const adel = ak * (1 - del * del - del * (1 / 3 + (134 * del * del) / 81));
    stated = nm * (1 + d1 / (adel * adel));
  }
  return stated;
};

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
  const launchOf: number[] = [];
  const decayOf: number[] = [];
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
      // the earliest moment it can have been in orbit: its launch date, else the start of the year in its international designator; the latest: the end of its decay day
      const launch = dateOf(set.LAUNCH_DATE);
      const year = /^(\d{4})-\d{3}/.exec(set.OBJECT_ID ?? "");
      launchOf.push(Number.isFinite(launch) ? launch : year ? Date.UTC(Number(year[1]), 0, 1) : Number.NEGATIVE_INFINITY);
      const decay = dateOf(set.DECAY_DATE);
      decayOf.push(Number.isFinite(decay) ? decay + ((set.DECAY_DATE ?? "").trim().length <= 10 ? DAY_MS - 1 : 0) : Number.POSITIVE_INFINITY);
    } catch (error) {
      refuse(error instanceof Error ? error.message : "SGP4 could not start from these elements");
    }
  }

  const n = recs.length;
  const rate = new Float64Array(n);
  const classColour = new Float32Array(n * 3);
  const eccentric: number[] = [];
  let newestEpochMs = 0;
  for (let i = 0; i < n; i += 1) {
    const set = usable[i]!;
    const epoch = epochs[i]!;
    if (epoch > newestEpochMs) newestEpochMs = epoch;
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
  // the quickest satellite between the two samples now held, in Earth radii for each second of game time, worked out once for each pair (see `at`) and not at every frame
  let fastest = 0;
  let fastestAt = Number.NaN;
  let fastestTo = Number.NaN;
  let propagations = 0;
  let placed = 0;
  const timing = { lastBatchMs: 0, maxBatchMs: 0 };
  let steady = options.estimateFar === "steady";
  let estimate = steady || options.estimateFar === true;
  let estimatedCount = 0;
  /** Whether a satellite is placed at a moment: within `maxAgeDays` of its elements, or, when far moments are estimated, inside the time it was in orbit. */
  const usableAt = (i: number, ms: number): boolean => {
    if (estimate) return ms >= launchOf[i]! && ms <= decayOf[i]!;
    return Math.abs(ms - epochs[i]!) <= maxAgeMs;
  };
  const isFar = (i: number, ms: number): boolean => estimate && Math.abs(ms - epochs[i]!) > maxAgeMs;
  /** A carried-far position that is down in the air or inside the Earth is no estimate (Earth radii). */
  const tooLow = (x: number, y: number, z: number): boolean => Math.hypot(x, y, z) < 1 + LOWEST_ESTIMATE_KM / EARTH_RADIUS_KM;
  // each satellite's steady orbit after and before its elements, made the first time it is asked for (null: it cannot be made)
  const steadyAfter: (Steady | null | undefined)[] = [];
  const steadyBefore: (Steady | null | undefined)[] = [];
  /**
   * The orbit satellite `i` keeps beyond `maxAgeDays` with the drag off. It starts at that day from the mean elements SGP4 itself has reached there, so the two records give the same place at the hand-over
   * (far under a millimetre for a low orbit; a high orbit starts its Sun and Moon terms again, which leaves a few kilometres, faded out over `STEADY_FADE_MS`).
   * Elements with no drag term are already steady and are used as they are. Null when the elements cannot be carried to that day, or have run away by then (`STEADY_MOST_CHANGE`).
   */
  const makeSteady = (i: number, after: boolean): Steady | null => {
    const rec = recs[i]!;
    const epoch = epochs[i]!;
    if (rec.bstar === 0) return { rec, startMs: epoch, dx: 0, dy: 0, dz: 0 };
    const startMs = Math.round(epoch + (after ? maxAgeMs : -maxAgeMs));
    const last = sgp4(rec, (startMs - epoch) / 60_000) as Sample;
    if (!last || !last.position || !Number.isFinite(last.position.x)) return null;
    const mean = last.meanElements;
    const change = mean.nm / rec.no;
    if (!(change <= STEADY_MOST_CHANGE && change >= 1 / STEADY_MOST_CHANGE)) return null;
    try {
      const held = json2satrec({
        ...usable[i]!,
        EPOCH: new Date(startMs).toISOString(),
        MEAN_MOTION: statedMeanMotion(mean.nm, mean.em, mean.im) * constants.xpdotp,
        ECCENTRICITY: mean.em,
        INCLINATION: mean.im * DEGREES,
        RA_OF_ASC_NODE: wholeTurn(mean.Om),
        ARG_OF_PERICENTER: wholeTurn(mean.om),
        MEAN_ANOMALY: wholeTurn(mean.mm),
        BSTAR: 0,
        MEAN_MOTION_DOT: 0,
        MEAN_MOTION_DDOT: 0,
      } as never);
      const first = sgp4(held, 0) as Sample;
      if (!first || !first.position || held.error !== 0 || !Number.isFinite(first.position.x)) return null;
      return { rec: held, startMs, dx: last.position.x - first.position.x, dy: last.position.y - first.position.y, dz: last.position.z - first.position.z };
    } catch {
      return null;
    }
  };
  /** SGP4 for satellite `i` at one moment: from its elements, or, beyond `maxAgeDays` with `estimateFar: "steady"`, from its steady orbit. Null, or no position, when it cannot be placed. */
  const carried = (i: number, ms: number): Sample => {
    const away = ms - epochs[i]!;
    if (!steady || Math.abs(away) <= maxAgeMs) return sgp4(recs[i]!, away / 60_000) as Sample;
    const made = away > 0 ? steadyAfter : steadyBefore;
    const held = made[i] === undefined ? (made[i] = makeSteady(i, away > 0)) : made[i]!;
    if (held === null) return null;
    const result = sgp4(held.rec, (ms - held.startMs) / 60_000) as Sample;
    const fade = 1 - Math.abs(ms - held.startMs) / STEADY_FADE_MS;
    if (fade > 0 && result && result.position) {
      result.position.x += held.dx * fade;
      result.position.y += held.dy * fade;
      result.position.z += held.dz * fade;
    }
    return result;
  };
  const pinned = new Float32Array(n * 3);
  const pinOk = new Uint8Array(n);
  // the unit normal of the orbit plane at each satellite's pin, from the pinned place and SGP4's velocity there (the plane of the moment pinned, not the plane of the elements: a low orbit's plane turns about 5 degrees a day).
  // Worked out once for each pin, in `sample`, and only read by `arc`.
  const pinNormal = new Float32Array(n * 3);
  // when each satellite was last pinned (NaN: never), so a group can be pinned a slice at a time and `arc` turns each from its own pin
  const pinMsOf = new Float64Array(n).fill(Number.NaN);
  let pinnedCount = 0;

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

  /** SGP4 for satellites `from` up to (not including) `to` at one moment (the whole group by default), into `buffer` in the space view's axes (TEME x, z, -y: x to the vernal equinox, y north). */
  const sample = (buffer: Float32Array, ok: Uint8Array, ms: number, from = 0, to = n, skipEccentric = false, axis?: Float32Array): void => {
    const started = performance.now();
    for (let i = from; i < to; i += 1) {
      // an eccentric orbit is placed by SGP4 at every frame by `arc` and never read from a pin
      if (skipEccentric && isEccentric[i] === 1) continue;
      if (!usableAt(i, ms)) {
        ok[i] = 0;
        continue;
      }
      propagations += 1;
      const result = carried(i, ms);
      const p = result && result.position;
      if (!p || !Number.isFinite(p.x) || (isFar(i, ms) && tooLow(p.x / EARTH_RADIUS_KM, p.y / EARTH_RADIUS_KM, p.z / EARTH_RADIUS_KM))) {
        ok[i] = 0;
        continue;
      }
      ok[i] = 1;
      buffer[i * 3] = p.x / EARTH_RADIUS_KM;
      buffer[i * 3 + 1] = p.z / EARTH_RADIUS_KM;
      buffer[i * 3 + 2] = -p.y / EARTH_RADIUS_KM;
      if (axis) {
        // the orbit's normal is the place crossed with the velocity (both in the scene's axes: x, z, -y)
        const v = result!.velocity;
        if (!v) {
          ok[i] = 0;
          continue;
        }
        const rx = p.x;
        const ry = p.z;
        const rz = -p.y;
        const vx = v.x;
        const vy = v.z;
        const vz = -v.y;
        const cx = ry * vz - rz * vy;
        const cy = rz * vx - rx * vz;
        const cz = rx * vy - ry * vx;
        const length = Math.hypot(cx, cy, cz);
        if (!(length > 0)) {
          ok[i] = 0;
          continue;
        }
        axis[i * 3] = cx / length;
        axis[i * 3 + 1] = cy / length;
        axis[i * 3 + 2] = cz / length;
      }
    }
    timing.lastBatchMs = performance.now() - started;
    if (timing.lastBatchMs > timing.maxBatchMs) timing.maxBatchMs = timing.lastBatchMs;
  };

  const exactAt = (index: number, ms: number, out: Float64Array): boolean => {
    if (epochs[index] === undefined || !usableAt(index, ms)) return false;
    propagations += 1;
    const result = carried(index, ms);
    if (!result || !result.position || !result.velocity || !Number.isFinite(result.position.x)) return false;
    if (isFar(index, ms) && tooLow(result.position.x / EARTH_RADIUS_KM, result.position.y / EARTH_RADIUS_KM, result.position.z / EARTH_RADIUS_KM)) return false;
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
    get fastest() {
      return fastest;
    },
    get estimateFar() {
      return steady ? "steady" : estimate;
    },
    set estimateFar(value) {
      if (value === (steady ? "steady" : estimate)) return;
      steady = value === "steady";
      estimate = steady || value === true;
      // what was placed was placed under the other rule: place everything again, and draw each satellite's look again
      ready = false;
      pinnedCount = 0;
      pinMsOf.fill(Number.NaN);
      dimmed.fill(0);
      dimVersion += 1;
    },
    get estimatedCount() {
      return estimatedCount;
    },
    estimated: (index) => dimmed[index] === 2 && shown[index] === 1,
    pin(ms, first = 0, count = n) {
      if (n === 0) return;
      const from = Math.max(0, Math.min(n, Math.floor(first)));
      const to = Math.max(from, Math.min(n, from + Math.floor(count)));
      if (to === from) return;
      sample(pinned, pinOk, ms, from, to, true, pinNormal);
      for (let i = from; i < to; i += 1) {
        if (Number.isNaN(pinMsOf[i])) pinnedCount += 1;
        pinMsOf[i] = ms;
      }
    },
    arc(ms, spanMs, positions, segments, maxLength = 0) {
      if (n === 0) return 0;
      // the longest a streak may be, in Earth radii along the orbit; 0, or anything that is not a positive number, leaves the stretch as long as the span makes it
      const cap = maxLength > 0 && Number.isFinite(maxLength) ? maxLength : 0;
      // a satellite never pinned is pinned now, all together
      if (pinnedCount < n) {
        sample(pinned, pinOk, ms, 0, n, true, pinNormal);
        pinMsOf.fill(ms);
        pinnedCount = n;
      }
      const span = spanMs;
      let count = 0;
      for (let i = 0; i < n; i += 1) {
        const k = i * 3;
        const dim = isFar(i, ms) ? 2 : Math.abs(ms - epochs[i]!) > dimAfterMs ? 1 : 0;
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
          // SGP4 gave the speed here (km/s), so the cap in Earth radii becomes a stretch of time for this satellite and the start is placed by SGP4 that much earlier
          let own = span;
          if (cap > 0) {
            const reach = (Math.hypot(place[3]!, place[4]!, place[5]!) / EARTH_RADIUS_KM) * (Math.abs(span) / 1000);
            if (reach > cap) own = (span * cap) / reach;
          }
          if (exactAt(i, ms - own, place)) {
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
        if (pinOk[i] !== 1) {
          positions.fill(0, k, k + 3);
          segments.fill(0, w, w + 6);
          shown[i] = 0;
          continue;
        }
        const nx = pinNormal[k]!;
        const ny = pinNormal[k + 1]!;
        const nz = pinNormal[k + 2]!;
        let sweep = Math.max(-Math.PI, Math.min(Math.PI, rate[i]! * span));
        if (cap > 0) {
          // along the orbit a turn of `sweep` is `sweep` times the height in Earth radii, so the cap is a turn of cap / height
          const height = Math.hypot(pinned[k]!, pinned[k + 1]!, pinned[k + 2]!);
          if (height > 0 && Math.abs(sweep) * height > cap) sweep = Math.sign(sweep) * (cap / height);
        }
        const along = rate[i]! * (ms - pinMsOf[i]!);
        turn(pinned[k]!, pinned[k + 1]!, pinned[k + 2]!, nx, ny, nz, along, positions, k);
        turn(pinned[k]!, pinned[k + 1]!, pinned[k + 2]!, nx, ny, nz, along - sweep, segments, w);
        segments[w + 3] = positions[k]!;
        segments[w + 4] = positions[k + 1]!;
        segments[w + 5] = positions[k + 2]!;
        shown[i] = 1;
        count += 1;
      }
      placed = count;
      estimatedCount = 0;
      for (let i = 0; i < n; i += 1) if (dimmed[i] === 2 && shown[i] === 1) estimatedCount += 1;
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
      // how far the quickest one went between the two samples: once for each pair of samples (about once a second), never at a frame, so it costs one pass over the group a second
      if (fastestAt !== aMs || fastestTo !== bMs) {
        fastestAt = aMs;
        fastestTo = bMs;
        let most = 0;
        for (let i = 0; i < n; i += 1) {
          if (okA[i] !== 1 || okB[i] !== 1) continue;
          const k = i * 3;
          const dx = b[k]! - a[k]!;
          const dy = b[k + 1]! - a[k + 1]!;
          const dz = b[k + 2]! - a[k + 2]!;
          const squared = dx * dx + dy * dy + dz * dz;
          if (squared > most) most = squared;
        }
        fastest = Math.sqrt(most) / ((bMs - aMs) / 1000);
      }
      const t = (ms - aMs) / (bMs - aMs);
      let count = 0;
      for (let i = 0; i < n; i += 1) {
        const k = i * 3;
        const dim = isFar(i, ms) ? 2 : Math.abs(ms - epochs[i]!) > dimAfterMs ? 1 : 0;
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
      estimatedCount = 0;
      for (let i = 0; i < n; i += 1) if (dimmed[i] === 2 && shown[i] === 1) estimatedCount += 1;
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
        estimated: isFar(index, ms),
        estimatedDays: Math.abs(ms - epochs[index]!) / DAY_MS,
        altitudeKm: Math.hypot(one[0]!, one[1]!, one[2]!) * EARTH_RADIUS_KM - EARTH_RADIUS_KM,
        speedKmS: Math.hypot(one[3]!, one[4]!, one[5]!),
        periodMinutes: 1440 / set.MEAN_MOTION,
        inclinationDeg: set.INCLINATION,
      };
      const country = ownerCountry(set.COUNTRY_CODE ?? set.OWNER);
      if (country) info.ownerCountry = country;
      return info;
    },
  };
}
