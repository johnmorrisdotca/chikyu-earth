// What the satellites are made of and what the space view asks of them. Types only: nothing here imports satellite.js, so the space element can use them
// without needing it.

/**
 * One satellite's orbital elements in the "GP" format that CelesTrak and Space-Track both serve as JSON (CCSDS OMM, one object per satellite). Only these fields are read.
 * The package fetches nothing: your page gets the elements (see the satellites guide for the rules of the sources) and passes them in.
 *
 * @example
 * ```ts
 * import type { ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const iss: ElementSet = {
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
 * console.log(iss.OBJECT_NAME);
 * ```
 */
export interface ElementSet {
  OBJECT_NAME: string;
  OBJECT_ID?: string;
  /** The moment the elements describe, ISO 8601 in UTC (a trailing `Z` is optional). */
  EPOCH: string;
  /** Revolutions a day. */
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  /** Degrees. */
  INCLINATION: number;
  /** Degrees. */
  RA_OF_ASC_NODE: number;
  /** Degrees. */
  ARG_OF_PERICENTER: number;
  /** Degrees. */
  MEAN_ANOMALY: number;
  NORAD_CAT_ID: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
  EPHEMERIS_TYPE?: number;
  CLASSIFICATION_TYPE?: string;
  ELEMENT_SET_NO?: number;
  REV_AT_EPOCH?: number;
  /** The owner's code, as Space-Track's catalogue writes it (`US`, `PRC`, `ESA`), when the source carries it. */
  COUNTRY_CODE?: string;
  /** The owner's code, as CelesTrak's SATCAT writes it (the same codes), when the source carries it. */
  OWNER?: string;
}

/**
 * What a page can tell a reader about one satellite at a moment: its name, its number, how old its elements are, how high and how fast it is.
 *
 * @example
 * ```ts
 * import type { SatelliteInfo } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const describe = (info: SatelliteInfo): string => `${info.name}: ${info.altitudeKm.toFixed(0)} km up, ${info.speedKmS.toFixed(2)} km/s`;
 * console.log(typeof describe);
 * ```
 */
export interface SatelliteInfo {
  /** Where it is in its group. */
  index: number;
  name: string;
  /** The NORAD catalogue number. */
  noradId: number;
  /** The international designator (for example `1998-067A`), when the elements carry one. */
  objectId: string | undefined;
  /** The moment of its elements, in milliseconds since the Unix epoch. */
  epochMs: number;
  /** Days between the elements' moment and the moment asked about (negative before it). */
  ageDays: number;
  /** Height above the mean Earth radius (6371 km) at that moment. */
  altitudeKm: number;
  /** Speed against the stars, kilometres a second. */
  speedKmS: number;
  /** One revolution, minutes. */
  periodMinutes: number;
  /** Degrees. */
  inclinationDeg: number;
  /** The owner's country as an ISO 3166-1 alpha-2 code (`ownerCountry`), when the elements carry an owner code (`COUNTRY_CODE` or `OWNER`) and the owner is one country; absent for an organisation, several countries or an unknown owner. */
  ownerCountry?: string;
}

/**
 * A satellite chosen from a group: which group and which place in it.
 *
 * @example
 * ```ts
 * import type { SatelliteRef } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const first: SatelliteRef = { group: "stations", index: 0 };
 * console.log(first.group);
 * ```
 */
export interface SatelliteRef {
  group: string;
  index: number;
}

/**
 * A satellite the group could not use, and why: its elements did not start SGP4 (bad numbers), or it had decayed at its own epoch.
 *
 * @example
 * ```ts
 * import type { RefusedElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const show = (one: RefusedElementSet): string => `${one.name}: ${one.reason}`;
 * console.log(typeof show);
 * ```
 */
export interface RefusedElementSet {
  name: string;
  noradId: number;
  reason: string;
}

/**
 * A group of satellites, ready to give positions for any moment: what `createSatellites` returns, and what `<chikyu-space>` takes in `setSatellites`.
 * Positions are in Earth radii (6371 km) from the Earth's centre, in the space view's axes (x to the vernal equinox, y north); a satellite whose elements
 * are older than `maxAgeDays` at the moment asked about is not placed (its place stays at the centre and `visible(index)` is false); one older than `dimAfterDays` is placed and flagged in `dimmed`.
 *
 * @example
 * ```ts
 * import type { Satellites } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const first = (group: Satellites): string => group.sets[0]?.OBJECT_NAME ?? "none";
 * console.log(typeof first);
 * ```
 */
export interface Satellites {
  /** Satellites that started SGP4. */
  readonly count: number;
  /** Their elements, in the order of their places. */
  readonly sets: readonly ElementSet[];
  /** The ones left out, with the reason. */
  readonly refused: readonly RefusedElementSet[];
  /** The oldest an element set may be at the moment shown, in days. */
  readonly maxAgeDays: number;
  /** The age, in days, past which a satellite is drawn dimmer. */
  readonly dimAfterDays: number;
  /** One number for each satellite, set by `at`: 1 when its elements are more than `dimAfterDays` from the moment shown (draw it dimmer), 0 when not. */
  readonly dimmed: Float32Array;
  /** Goes up each time `at` changes any of `dimmed`, so a drawing can copy the numbers only when they changed. */
  readonly dimVersion: number;
  /** SGP4 calls made so far, for a page or a test to count. */
  readonly propagations: number;
  /** Milliseconds the last batch of SGP4 took, and the longest so far. */
  readonly timing: { lastBatchMs: number; maxBatchMs: number };
  /**
   * Fill `out` (3 numbers a satellite) with the positions at `ms`: SGP4 is run for the whole group at two moments `step` apart and the positions between are interpolated, so a
   * steady clock costs one batch a step and every call in between is arithmetic.
   */
  at(ms: number, out: Float32Array): void;
  /** True if satellite `index` was placed by the last `at` (its elements are not too old at that moment). */
  visible(index: number): boolean;
  /** How many of them the last `at` placed. */
  readonly placed: number;
  /** The game time between the two moments SGP4 is run at (1000 to 60000 ms); the space view sets it from the clock's speed. */
  setStep(ms: number): void;
  /** One satellite at exactly `ms` (no interpolation): position in Earth radii and velocity in km/s into `out` (6 numbers). False if its elements are too old or SGP4 gave up. */
  exact(index: number, ms: number, out: Float64Array): boolean;
  /** The path of satellite `index` for one revolution from `ms`, `points` + 1 points in order along it (the last on the first), into a new array of Earth radii. */
  orbit(index: number, ms: number, points: number): Float32Array;
  /** Facts about one satellite at `ms`; undefined if it cannot be placed then. */
  info(index: number, ms: number): SatelliteInfo | undefined;
}
