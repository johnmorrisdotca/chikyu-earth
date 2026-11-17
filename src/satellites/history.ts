// A satellite's history: a series of element sets, the launch and decay dates, and where it was at any moment from the set nearest that moment. SGP4 is satellite.js (MIT, an optional peer);
// nothing here fetches anything (the page brings the sets) and nothing touches the screen, so it imports on a server. The space view takes `createHistoryGroup(history)` like any other group.
import { json2satrec, sgp4 } from "satellite.js";
import { createSatellites } from "./track.ts";
import type { ElementSet, SatelliteInfo, Satellites } from "./types.ts";

const EARTH_RADIUS_KM = 6371;
const DAY_MS = 86_400_000;

/**
 * What a moment is, for a satellite with a history.
 *
 * - `before-launch`: the moment is before its launch; it is not drawn.
 * - `backcast`: after the launch but before its oldest element set; placed from that set, carried back.
 * - `tracked`: between its oldest and its newest element set; placed from the set nearest the moment.
 * - `predicted`: after its newest element set; a prediction, drawn shaded, with an uncertainty that grows.
 * - `decayed`: after its decay date; it has come down and is not drawn.
 * - `unplaceable`: SGP4 could not place it (bad numbers, or it fell below the air from its own elements).
 *
 * @example
 * ```ts
 * import type { HistoryStatus } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const drawn = (status: HistoryStatus): boolean => status === "tracked" || status === "backcast" || status === "predicted";
 * console.log(drawn("predicted"));
 * ```
 */
export type HistoryStatus = "before-launch" | "backcast" | "tracked" | "predicted" | "decayed" | "unplaceable";

/**
 * How fast the stated uncertainty of a place grows with its distance in time from the nearest element set: `baseKm + kmPerDay * d + kmPerDaySquared * d * d`, `d` in days.
 *
 * @example
 * ```ts
 * import type { UncertaintyModel } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const calm: UncertaintyModel = { baseKm: 1, kmPerDay: 1, kmPerDaySquared: 0.2 };
 * console.log(calm.kmPerDay);
 * ```
 */
export interface UncertaintyModel {
  baseKm: number;
  kmPerDay: number;
  kmPerDaySquared: number;
}

/**
 * The package's stated uncertainty for a low orbit: 1 km, 3 km a day and 1.5 km a day squared from the nearest element set. It was set from what was measured against NASA/JPL Horizons
 * (the ISS from one element set: 25, 59, 108 and 168 km at 5.6, 7.6, 9.6 and 11.6 days) with a margin; a higher orbit, with less drag, is better than this, so it is a ceiling, not a forecast.
 *
 * @example
 * ```ts
 * import { DEFAULT_UNCERTAINTY } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(DEFAULT_UNCERTAINTY.kmPerDay);
 * ```
 */
export const DEFAULT_UNCERTAINTY: Readonly<UncertaintyModel> = { baseKm: 1, kmPerDay: 3, kmPerDaySquared: 1.5 };

/**
 * The stated uncertainty, in kilometres, of a satellite's place `days` from its nearest element set (either side).
 *
 * @param days - The distance in days from the nearest set's epoch (the sign is ignored).
 * @param model - The growth to state (`DEFAULT_UNCERTAINTY` when left out).
 * @returns Kilometres, never less than `model.baseKm`.
 *
 * @example
 * ```ts
 * import { predictionUncertaintyKm } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(predictionUncertaintyKm(0).toFixed(0), predictionUncertaintyKm(10).toFixed(0)); // 1 181
 * ```
 */
export function predictionUncertaintyKm(days: number, model: Readonly<UncertaintyModel> = DEFAULT_UNCERTAINTY): number {
  const d = Math.abs(Number.isFinite(days) ? days : 0);
  return model.baseKm + model.kmPerDay * d + model.kmPerDaySquared * d * d;
}

/**
 * What can be told to `createSatelliteHistory`.
 *
 * @example
 * ```ts
 * import type { HistoryOptions } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const options: HistoryOptions = { launch: "1998-11-20", decay: "2031-01-01" };
 * console.log(options.launch);
 * ```
 */
export interface HistoryOptions {
  /** The launch: a date (`2026-11-02`, the start of that day UTC), a date and time, or milliseconds. Left out, `LAUNCH_DATE` of the sets, else the start of the launch year in `OBJECT_ID`, else no limit. */
  launch?: string | number;
  /** The decay: as `launch` (a bare date is the end of that day). Left out, `DECAY_DATE` of the sets, else none. */
  decay?: string | number;
  /** How the stated uncertainty grows (`DEFAULT_UNCERTAINTY` when left out). */
  uncertainty?: UncertaintyModel;
}

/**
 * Where a satellite stands in its history at one moment: what to tell a reader.
 *
 * @example
 * ```ts
 * import type { HistoryMoment } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const say = (m: HistoryMoment): string => (m.status === "decayed" ? `came down ${new Date(m.decayedMs!).toISOString().slice(0, 10)}` : m.status);
 * console.log(typeof say);
 * ```
 */
export interface HistoryMoment {
  status: HistoryStatus;
  /** The set used, as its place in `history.sets` (sorted by epoch); -1 when there are none. */
  setIndex: number;
  /** The epoch of that set, ms. */
  epochMs: number;
  /** The distance in days from that set's epoch, whichever way (0 or more). */
  distanceDays: number;
  /** The stated uncertainty of the place, kilometres (`predictionUncertaintyKm` of `distanceDays`); 0 when it is not placed. */
  uncertaintyKm: number;
  /** The launch, ms, or null when it is not known. */
  launchedMs: number | null;
  /** True when `launchedMs` is a date the sets or the options give, not just the start of the launch year. */
  launchExact: boolean;
  /** The decay, ms (the end of the day when a bare date was given), or null when it has not come down. */
  decayedMs: number | null;
}

/**
 * One point of `altitudeSeries`: the mean height of a satellite at the epoch of one element set.
 *
 * @example
 * ```ts
 * import type { AltitudePoint } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const label = (p: AltitudePoint): string => `${new Date(p.epochMs).toISOString().slice(0, 10)}: ${p.altitudeKm.toFixed(1)} km`;
 * console.log(typeof label);
 * ```
 */
export interface AltitudePoint {
  /** The epoch of the set, ms. */
  epochMs: number;
  /** The mean height over one revolution about that moment, kilometres above the mean Earth radius (6371 km). */
  altitudeKm: number;
  /** The NORAD catalogue number. */
  noradId: number;
}

/**
 * A satellite with a history: its element sets in order, its launch and decay, and where it was at any moment.
 *
 * @example
 * ```ts
 * import type { SatelliteHistory } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const first = (h: SatelliteHistory): number => h.sets[0]?.NORAD_CAT_ID ?? 0;
 * console.log(typeof first);
 * ```
 */
export interface SatelliteHistory {
  /** The NORAD catalogue number. */
  readonly noradId: number;
  /** The name, from the newest set. */
  readonly name: string;
  /** The sets SGP4 could start from, oldest epoch first. */
  readonly sets: readonly ElementSet[];
  /** Their epochs, ms, in the same order. */
  readonly epochs: readonly number[];
  /** The sets that were left out, with the reason. */
  readonly refused: readonly { noradId: number; epoch: string; reason: string }[];
  /** The newest set's epoch, ms, or 0 when there are none: after it a place is a prediction. */
  readonly newestEpochMs: number;
  /** Where it stands at `ms`: no SGP4 call. */
  describe(ms: number): HistoryMoment;
  /**
   * The place and velocity at `ms` from the set nearest it (Earth radii in the space view's axes, km/s), into `out` (6 numbers). Returns the status: only `backcast`, `tracked` and `predicted` write `out`.
   */
  exact(ms: number, out: Float64Array): HistoryStatus;
  /**
   * The last `orbits` revolutions of its path before `ms`, oldest first, into `out` (3 numbers a point, as many points as fit, at least 2), each point placed from the set nearest its own moment.
   * No allocation. Returns how many points are valid: points before its launch or after its decay are left out of the front and the back, and 0 when it is not placed at `ms`.
   */
  trailInto(ms: number, orbits: number, out: Float32Array): number;
  /** The same, in a new array of `points` points (`trailInto` for a frame). */
  trail(ms: number, orbits: number, points?: number): Float32Array;
  /** The group the space view draws: one satellite, placed from the nearest set at each moment, shaded while predicted. */
  readonly group: Satellites;
}

/** A date or a number as milliseconds, and whether it was a bare date (then a decay is the end of that day). */
const moment = (value: string | number | undefined, end: boolean): number => {
  if (value === undefined) return Number.NaN;
  if (typeof value === "number") return value;
  const t = value.trim();
  if (t === "") return Number.NaN;
  if (t.length <= 10) return Date.parse(`${t}T00:00:00Z`) + (end ? DAY_MS - 1 : 0);
  const iso = t.replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
};
const epochOf = (text: string): number => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
const placedStatus = (s: HistoryStatus): boolean => s === "backcast" || s === "tracked" || s === "predicted";

/**
 * Make the history of one satellite from its element sets (any number, any order, all of one satellite). A set that SGP4 cannot start from is listed in `refused` and left out.
 * It needs satellite.js and imports in a browser or on a server. The sets are the page's: nothing is fetched.
 *
 * @param sets - Element sets in CelesTrak's JSON format, one satellite, as many epochs as the page has.
 * @param options - `launch`, `decay` (else the sets' own `LAUNCH_DATE`, `DECAY_DATE`) and `uncertainty`.
 * @returns The history: `describe(ms)`, `exact(ms, out)`, `trail`, and `group` for the space view.
 *
 * @example
 * ```ts
 * import { createSatelliteHistory, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const set = (epoch: string, meanAnomaly: number): ElementSet => ({
 *   OBJECT_NAME: "ISS (ZARYA)",
 *   OBJECT_ID: "1998-067A",
 *   EPOCH: epoch,
 *   MEAN_MOTION: 15.49150046,
 *   ECCENTRICITY: 0.0007139,
 *   INCLINATION: 51.6332,
 *   RA_OF_ASC_NODE: 335.9757,
 *   ARG_OF_PERICENTER: 339.3739,
 *   MEAN_ANOMALY: meanAnomaly,
 *   NORAD_CAT_ID: 25544,
 *   BSTAR: 0.00012,
 *   MEAN_MOTION_DOT: 0.0001,
 *   MEAN_MOTION_DDOT: 0,
 *   LAUNCH_DATE: "1998-11-20",
 * });
 * const history = createSatelliteHistory([set("2026-11-02T10:25:21.580320", 20.6961)]);
 * console.log(history.describe(Date.UTC(1990, 0, 1)).status, history.describe(Date.UTC(2026, 10, 3)).status, history.describe(Date.UTC(2026, 10, 20)).status);
 * ```
 */
export function createSatelliteHistory(sets: readonly ElementSet[], options: HistoryOptions = {}): SatelliteHistory {
  const model = options.uncertainty ?? DEFAULT_UNCERTAINTY;
  const refused: { noradId: number; epoch: string; reason: string }[] = [];
  const good: { set: ElementSet; epoch: number }[] = [];
  for (const set of sets) {
    const epoch = epochOf(set.EPOCH);
    if (!Number.isFinite(epoch)) {
      refused.push({ noradId: set.NORAD_CAT_ID, epoch: set.EPOCH, reason: "the epoch is not a date" });
      continue;
    }
    try {
      const rec = json2satrec(set as never);
      const start = sgp4(rec, 0);
      if (!start || !start.position || rec.error !== 0) {
        refused.push({ noradId: set.NORAD_CAT_ID, epoch: set.EPOCH, reason: "SGP4 could not start from these elements" });
        continue;
      }
      good.push({ set, epoch });
    } catch (error) {
      refused.push({ noradId: set.NORAD_CAT_ID, epoch: set.EPOCH, reason: error instanceof Error ? error.message : "SGP4 could not start from these elements" });
    }
  }
  good.sort((a, b) => a.epoch - b.epoch);
  const list = good.map((one) => one.set);
  const epochs = good.map((one) => one.epoch);
  const count = list.length;
  const last = list[count - 1];

  // the launch and the decay: the options, else any set that carries them, else (the launch only) the start of the launch year
  const fromSets = (field: "LAUNCH_DATE" | "DECAY_DATE", end: boolean): number => {
    for (let i = count - 1; i >= 0; i -= 1) {
      const m = moment(list[i]![field], end);
      if (Number.isFinite(m)) return m;
    }
    return Number.NaN;
  };
  let launch = moment(options.launch, false);
  let launchExact = Number.isFinite(launch);
  if (!launchExact) {
    launch = fromSets("LAUNCH_DATE", false);
    launchExact = Number.isFinite(launch);
  }
  if (!launchExact) {
    const year = /^(\d{4})-\d{3}/.exec(list.find((set) => set.OBJECT_ID)?.OBJECT_ID ?? "");
    launch = year ? Date.UTC(Number(year[1]), 0, 1) : Number.NaN;
  }
  let decay = moment(options.decay, true);
  if (!Number.isFinite(decay)) decay = fromSets("DECAY_DATE", true);
  const launchedMs = Number.isFinite(launch) ? launch : null;
  const decayedMs = Number.isFinite(decay) ? decay : null;
  const launchAt = launchedMs ?? Number.NEGATIVE_INFINITY;
  const decayAt = decayedMs ?? Number.POSITIVE_INFINITY;

  /** The index of the set whose epoch is nearest `ms` (-1 when there are none): a binary search, no allocation. */
  const nearest = (ms: number): number => {
    if (count === 0) return -1;
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (epochs[mid]! < ms) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(epochs[lo - 1]! - ms) <= Math.abs(epochs[lo]! - ms)) return lo - 1;
    return lo;
  };

  // one SGP4 group for each set, made when it is first needed (a series of years is a long list and most of it is never asked for); the launch and decay are held here, so the group is given none of its own
  const groups: (Satellites | null | undefined)[] = new Array<Satellites | null | undefined>(count);
  const groupFor = (i: number): Satellites | null => {
    let g = groups[i];
    if (g === undefined) {
      const { LAUNCH_DATE: _launch, DECAY_DATE: _decay, ...rest } = list[i]!;
      void _launch;
      void _decay;
      const made = createSatellites([rest as ElementSet], { estimateFar: true });
      g = made.count === 1 ? made : null;
      groups[i] = g;
    }
    return g;
  };

  const out6 = new Float64Array(6);
  const describe = (ms: number): HistoryMoment => {
    const i = nearest(ms);
    const epochMs = i < 0 ? 0 : epochs[i]!;
    const distanceDays = i < 0 ? 0 : Math.abs(ms - epochMs) / DAY_MS;
    let status: HistoryStatus;
    if (i < 0) status = "unplaceable";
    else if (ms < launchAt) status = "before-launch";
    else if (ms > decayAt) status = "decayed";
    else if (ms > epochs[count - 1]!) status = "predicted";
    else if (ms < epochs[0]!) status = "backcast";
    else status = "tracked";
    return { status, setIndex: i, epochMs, distanceDays, uncertaintyKm: placedStatus(status) ? predictionUncertaintyKm(distanceDays, model) : 0, launchedMs, launchExact, decayedMs };
  };
  const place = (ms: number, out: Float64Array): HistoryStatus => {
    const m = describe(ms);
    if (!placedStatus(m.status)) return m.status;
    const g = groupFor(m.setIndex);
    if (!g || !g.exact(0, ms, out)) return "unplaceable";
    return m.status;
  };
  const period = (ms: number): number => {
    const i = nearest(ms);
    return (1440 / (list[i]?.MEAN_MOTION || 15)) * 60_000;
  };
  const trailInto = (ms: number, orbits: number, out: Float32Array): number => {
    const points = Math.floor(out.length / 3);
    if (points < 2 || !placedStatus(place(ms, out6))) return 0;
    const span = Math.max(0, orbits) * period(ms);
    let first = -1;
    let lastAt = -1;
    for (let k = 0; k < points; k += 1) {
      const at = ms - span * (1 - k / (points - 1));
      if (!placedStatus(place(at, out6))) continue;
      if (first < 0) first = k;
      lastAt = k;
      out[k * 3] = out6[0]!;
      out[k * 3 + 1] = out6[1]!;
      out[k * 3 + 2] = out6[2]!;
    }
    if (first < 0) return 0;
    // the points before the launch (or after the decay) are not there: the valid ones are moved to the front
    if (first > 0) out.copyWithin(0, first * 3, (lastAt + 1) * 3);
    return lastAt - first + 1;
  };

  const history: SatelliteHistory = {
    noradId: last?.NORAD_CAT_ID ?? 0,
    name: last?.OBJECT_NAME ?? "",
    sets: list,
    epochs,
    refused,
    newestEpochMs: count > 0 ? epochs[count - 1]! : 0,
    describe,
    exact: place,
    trailInto,
    trail(ms, orbits, points = 120) {
      const path = new Float32Array(Math.max(2, Math.floor(points)) * 3);
      const valid = trailInto(ms, orbits, path);
      return valid === path.length / 3 ? path : path.slice(0, valid * 3);
    },
    get group() {
      return (group ??= createHistoryGroup(history, { count, list, nearest, groupFor, describe }));
    },
  };
  let group: Satellites | undefined;
  return history;
}

interface Inner {
  count: number;
  list: ElementSet[];
  nearest: (ms: number) => number;
  groupFor: (i: number) => Satellites | null;
  describe: (ms: number) => HistoryMoment;
}

/** The `Satellites` of a history: one satellite, with every method that takes a moment delegated to the group of the set nearest that moment. */
function createHistoryGroup(history: SatelliteHistory, inner: Inner): Satellites {
  const dimmed = new Float32Array(1);
  const shown = new Uint8Array(1);
  const timing = { lastBatchMs: 0, maxBatchMs: 0 };
  const colour = new Float32Array(3);
  let dimVersion = 0;
  let placed = 0;
  let current = Math.max(0, inner.count - 1);
  let pinnedWith: Satellites | null = null;
  let estimate = true;
  let step = 1000;
  const refs = (): Satellites | null => inner.groupFor(current);
  const choose = (ms: number): HistoryMoment => {
    const m = inner.describe(ms);
    if (m.setIndex >= 0) current = m.setIndex;
    const dim = m.status === "predicted" ? 2 : m.distanceDays > 14 ? 1 : 0;
    if (dim !== dimmed[0]) {
      dimmed[0] = dim;
      dimVersion += 1;
    }
    return m;
  };
  const sets = inner.list.length > 0 ? [inner.list[inner.list.length - 1]!] : [];
  const group: Satellites = {
    count: inner.count > 0 ? 1 : 0,
    get sets() {
      const set = inner.list[current];
      sets[0] = set ?? sets[0]!;
      return sets;
    },
    refused: [],
    maxAgeDays: Number.POSITIVE_INFINITY,
    dimAfterDays: 14,
    dimmed,
    get dimVersion() {
      return dimVersion;
    },
    get propagations() {
      return refs()?.propagations ?? 0;
    },
    timing,
    newestEpochMs: history.newestEpochMs,
    classColour: colour,
    get placed() {
      return placed;
    },
    get fastest() {
      return refs()?.fastest ?? 0;
    },
    get estimateFar() {
      return estimate;
    },
    set estimateFar(value) {
      estimate = value;
    },
    get estimatedCount() {
      return dimmed[0] === 2 && shown[0] === 1 ? 1 : 0;
    },
    estimated: () => dimmed[0] === 2 && shown[0] === 1,
    setStep(ms) {
      step = ms;
      for (let i = 0; i < inner.count; i += 1) inner.groupFor(i)?.setStep(ms);
    },
    at(ms, out) {
      const m = choose(ms);
      const g = placedStatus(m.status) ? inner.groupFor(m.setIndex) : null;
      if (!g) {
        out[0] = out[1] = out[2] = 0;
        shown[0] = 0;
        placed = 0;
        return;
      }
      g.setStep(step);
      g.at(ms, out);
      shown[0] = g.visible(0) ? 1 : 0;
      placed = shown[0];
      colour.set(g.classColour);
    },
    visible: () => shown[0] === 1,
    pin(ms) {
      const m = choose(ms);
      const g = placedStatus(m.status) ? inner.groupFor(m.setIndex) : null;
      pinnedWith = g;
      g?.pin(ms);
    },
    arc(ms, spanMs, positions, segments, maxLength = 0) {
      const m = choose(ms);
      const g = placedStatus(m.status) ? inner.groupFor(m.setIndex) : null;
      if (!g) {
        positions.fill(0, 0, 3);
        segments.fill(0, 0, 6);
        shown[0] = 0;
        placed = 0;
        return 0;
      }
      // a satellite that changed set (or came back from before its launch) is pinned again from the set it is now placed by
      if (pinnedWith !== g) {
        g.pin(ms);
        pinnedWith = g;
      }
      const count = g.arc(ms, spanMs, positions, segments, maxLength);
      shown[0] = count;
      placed = count;
      colour.set(g.classColour);
      return count;
    },
    exact(_index, ms, out) {
      return placedStatus(history.exact(ms, out));
    },
    orbit(_index, ms, points) {
      const m = choose(ms);
      const g = placedStatus(m.status) ? inner.groupFor(m.setIndex) : null;
      return g ? g.orbit(0, ms, points) : new Float32Array((points + 1) * 3);
    },
    info(_index, ms) {
      const m = choose(ms);
      if (!placedStatus(m.status)) return undefined;
      const g = inner.groupFor(m.setIndex);
      const base = g?.info(0, ms);
      if (!base) return undefined;
      const info: SatelliteInfo = { ...base, estimated: m.status === "predicted", estimatedDays: m.distanceDays };
      return info;
    },
  };
  return group;
}

/**
 * The mean height of a satellite at the epoch of each of its element sets, for a chart of how its orbit rose and fell (a station reboosted, a satellite coming down).
 * The height is averaged over one revolution about the epoch (SGP4 at 24 moments), above the mean Earth radius (6371 km); a set SGP4 cannot start from is left out. Oldest epoch first.
 *
 * @param sets - Element sets of one satellite (or several: each is a point, with its `noradId`).
 * @returns One point for each usable set, sorted by epoch.
 *
 * @example
 * ```ts
 * import { altitudeSeries, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const set = (epoch: string, motion: number): ElementSet => ({
 *   OBJECT_NAME: "ISS (ZARYA)",
 *   OBJECT_ID: "1998-067A",
 *   EPOCH: epoch,
 *   MEAN_MOTION: motion,
 *   ECCENTRICITY: 0.0007139,
 *   INCLINATION: 51.6332,
 *   RA_OF_ASC_NODE: 335.9757,
 *   ARG_OF_PERICENTER: 339.3739,
 *   MEAN_ANOMALY: 20.6961,
 *   NORAD_CAT_ID: 25544,
 *   BSTAR: 0.00012,
 *   MEAN_MOTION_DOT: 0.0001,
 *   MEAN_MOTION_DDOT: 0,
 * });
 * const series = altitudeSeries([set("2026-11-02T10:25:21", 15.49), set("2026-10-02T10:25:21", 15.52)]);
 * console.log(series.map((p) => p.altitudeKm.toFixed(0)));
 * ```
 */
export function altitudeSeries(sets: readonly ElementSet[]): AltitudePoint[] {
  const series: AltitudePoint[] = [];
  const SAMPLES = 24;
  for (const set of sets) {
    const epochMs = epochOf(set.EPOCH);
    if (!Number.isFinite(epochMs)) continue;
    try {
      const rec = json2satrec(set as never);
      if (rec.error !== 0) continue;
      const periodMin = 1440 / set.MEAN_MOTION;
      let sum = 0;
      let used = 0;
      for (let k = 0; k < SAMPLES; k += 1) {
        const result = sgp4(rec, (k / SAMPLES - 0.5) * periodMin);
        if (!result || !result.position || !Number.isFinite(result.position.x)) continue;
        sum += Math.hypot(result.position.x, result.position.y, result.position.z);
        used += 1;
      }
      if (used < SAMPLES) continue;
      series.push({ epochMs, altitudeKm: sum / used - EARTH_RADIUS_KM, noradId: set.NORAD_CAT_ID });
    } catch {
      // a set SGP4 cannot start from is left out
    }
  }
  return series.sort((a, b) => a.epochMs - b.epochMs);
}
