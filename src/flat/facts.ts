// The facts of a group of satellites, worked out from their orbital elements alone: how many, how high, how steep, how quick, and which orbital planes they share. Pure: no DOM, no clock and
// no dependency (not even satellite.js), so a build step or a server can write "GPS: 6 planes, 20,200 km, 55 degrees" into a page before any script runs.
import { orbitShape } from "../catalogue/orbit.ts";

const MU = 398_600.4418;

/**
 * The part of an element set the facts read: the mean motion (revolutions a day), the eccentricity, the inclination and the right ascension of the ascending node (both degrees). Every `ElementSet` has them.
 *
 * @example
 * ```ts
 * import type { FlatElements } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const gps: FlatElements = { MEAN_MOTION: 2.0056, ECCENTRICITY: 0.0102, INCLINATION: 55.1, RA_OF_ASC_NODE: 24.3 };
 * console.log(gps.INCLINATION);
 * ```
 */
export interface FlatElements {
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  /** Read only when present: the newest one is `newestEpochMs`. */
  EPOCH?: string;
}

/**
 * What decides which satellites share an orbital plane.
 *
 * @example
 * ```ts
 * import type { PlaneOptions } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const options: PlaneOptions = { gapDeg: 10, minShare: 0.25 };
 * console.log(options.gapDeg);
 * ```
 */
export interface PlaneOptions {
  /** Two satellites are in one plane when no gap in right ascension of more than this many degrees lies between them (10 by default: GPS, Galileo, GLONASS, Iridium and OneWeb come out as their real planes). */
  gapDeg?: number;
  /** A cluster is a plane when it holds at least this share of the biggest cluster's satellites (0.25 by default); a smaller one is a spare or a stray and is left in `other`. */
  minShare?: number;
  /** ...and at least this many satellites (2 by default). */
  minSize?: number;
  /** Satellites at or under this inclination, in degrees, are left out of the planes (5 by default): on an orbit that is nearly round the equator the node is not defined, and a geostationary belt has no planes. */
  minInclination?: number;
}

/**
 * One orbital plane: the satellites whose orbits cross the equator, going north, within a narrow stretch of longitude.
 *
 * @example
 * ```ts
 * import type { Plane } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const describe = (plane: Plane): string => `Plane ${plane.id}: ${plane.count} satellites at ${plane.raanDeg.toFixed(0)} degrees`;
 * console.log(typeof describe);
 * ```
 */
export interface Plane {
  /** The letter: `A` for the first plane going east from 0 degrees of right ascension, then `B`, `C`; after `Z`, `AA`. */
  id: string;
  /** Its place in the list of planes, from 0. */
  index: number;
  count: number;
  /** The middle of the plane's right ascension of the ascending node, degrees from 0 up to 360. */
  raanDeg: number;
  /** How wide the plane is in right ascension, degrees (0 for one satellite). */
  spanDeg: number;
  /** Which satellites are in it: indices into the list the planes were made from. */
  members: readonly number[];
}

/**
 * The planes of a group, and the satellites that are in none.
 *
 * @example
 * ```ts
 * import type { PlaneClusters } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const count = (clusters: PlaneClusters): number => clusters.planes.length;
 * console.log(typeof count);
 * ```
 */
export interface PlaneClusters {
  /** The planes, lettered in order of right ascension. */
  planes: readonly Plane[];
  /** Satellites that belong to no plane: too few to make a plane, or on an orbit with no node (see `minInclination`). Indices into the list. */
  other: readonly number[];
  /** For each satellite of the list, the `index` of its plane, or -1 when it is in `other`. */
  planeOf: Int16Array;
  /** True when the right ascension really does fall into two or more planes. False for one blob (Starlink's 5,000 satellites are spread through every longitude: no plane to show) and for a single plane. */
  clustered: boolean;
}

/**
 * The letter of the plane at `index`: `A` to `Z`, then `AA`, `AB`.
 *
 * @param index - From 0.
 * @returns The letters.
 *
 * @example
 * ```ts
 * import { planeLetter } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(planeLetter(0), planeLetter(25), planeLetter(26));
 * ```
 */
export function planeLetter(index: number): string {
  const n = Math.max(0, Math.floor(index));
  return n < 26 ? String.fromCharCode(65 + n) : `${String.fromCharCode(65 + (Math.floor(n / 26) - 1) % 26)}${String.fromCharCode(65 + (n % 26))}`;
}

const wrap360 = (degrees: number): number => ((degrees % 360) + 360) % 360;

/**
 * Cluster satellites into orbital planes by the right ascension of their ascending node: sort the nodes round the circle, cut it at every gap wider than `gapDeg`, and keep the clusters big enough to be a plane.
 * Navigation constellations come out as their real planes (GPS 6, Galileo 3, GLONASS 3), Iridium as 6, OneWeb as 12. A group spread evenly through every longitude (Starlink) is one cluster and `clustered` is false.
 *
 * @param elements - Anything with `INCLINATION` and `RA_OF_ASC_NODE`, one for each satellite.
 * @param options - See `PlaneOptions`.
 * @returns The planes, lettered `A`, `B`, `C` going east, the satellites that are in none, and which plane each satellite is in.
 *
 * @example
 * ```ts
 * import { clusterPlanes } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const node = (RA_OF_ASC_NODE: number) => ({ MEAN_MOTION: 2, ECCENTRICITY: 0, INCLINATION: 55, RA_OF_ASC_NODE });
 * const { planes, clustered } = clusterPlanes([node(10), node(12), node(130), node(133), node(250), node(252)]);
 * console.log(planes.map((plane) => `${plane.id}:${plane.count}`).join(" "), clustered);
 * ```
 */
export function clusterPlanes(elements: readonly Pick<FlatElements, "INCLINATION" | "RA_OF_ASC_NODE">[], options: PlaneOptions = {}): PlaneClusters {
  const gap = options.gapDeg ?? 10;
  const share = options.minShare ?? 0.25;
  const least = options.minSize ?? 2;
  const flat = options.minInclination ?? 5;
  const n = elements.length;
  const planeOf = new Int16Array(n).fill(-1);
  const usable: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const e = elements[i]!;
    if (Number.isFinite(e.RA_OF_ASC_NODE) && Number.isFinite(e.INCLINATION) && e.INCLINATION > flat) usable.push(i);
  }
  const raan = (i: number): number => wrap360(elements[i]!.RA_OF_ASC_NODE);
  usable.sort((a, b) => raan(a) - raan(b));
  const m = usable.length;
  if (m === 0) return { planes: [], other: Array.from({ length: n }, (_, i) => i), planeOf, clustered: false };
  // start the walk just after the widest gap, so no cluster is cut by the point where 360 turns into 0
  let start = 0;
  let widest = -1;
  for (let k = 0; k < m; k += 1) {
    const here = raan(usable[k]!);
    const next = k + 1 < m ? raan(usable[k + 1]!) : raan(usable[0]!) + 360;
    if (next - here > widest) {
      widest = next - here;
      start = (k + 1) % m;
    }
  }
  const unrolled = (k: number): number => {
    const at = (start + k) % m;
    return raan(usable[at]!) + (at < start ? 360 : 0);
  };
  const clusters: { members: number[]; first: number; last: number }[] = [];
  let current = { members: [usable[start]!], first: unrolled(0), last: unrolled(0) };
  for (let k = 1; k < m; k += 1) {
    const value = unrolled(k);
    const index = usable[(start + k) % m]!;
    if (value - current.last > gap) {
      clusters.push(current);
      current = { members: [index], first: value, last: value };
    } else {
      current.members.push(index);
      current.last = value;
    }
  }
  clusters.push(current);
  const biggest = Math.max(...clusters.map((one) => one.members.length));
  const major = clusters.filter((one) => one.members.length >= least && one.members.length >= share * biggest);
  const planes: Plane[] = major
    .map((one) => ({ members: one.members, raanDeg: wrap360((one.first + one.last) / 2), spanDeg: one.last - one.first }))
    .sort((a, b) => a.raanDeg - b.raanDeg)
    .map((one, index): Plane => ({ id: planeLetter(index), index, count: one.members.length, raanDeg: one.raanDeg, spanDeg: one.spanDeg, members: one.members }));
  for (const plane of planes) for (const member of plane.members) planeOf[member] = plane.index;
  const other: number[] = [];
  for (let i = 0; i < n; i += 1) if (planeOf[i] === -1) other.push(i);
  return { planes, other, planeOf, clustered: planes.length >= 2 };
}

/**
 * What `groupFacts` says about a group.
 *
 * @example
 * ```ts
 * import type { GroupFacts } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const line = (facts: GroupFacts): string => `${facts.count} satellites, ${facts.meanAltitudeKm.toFixed(0)} km up`;
 * console.log(typeof line);
 * ```
 */
export interface GroupFacts {
  count: number;
  /** The mean height of the satellites' orbits (half the longest width of each ellipse less the mean Earth radius of 6,371 km), kilometres. */
  meanAltitudeKm: number;
  /** The lowest point of any orbit of the group, kilometres above 6,371 km. */
  minAltitudeKm: number;
  /** The highest point of any orbit of the group, kilometres. */
  maxAltitudeKm: number;
  /** The mean inclination, degrees, and the lowest and highest. */
  meanInclinationDeg: number;
  minInclinationDeg: number;
  maxInclinationDeg: number;
  /** The mean time to go round once, minutes. */
  periodMinutes: number;
  /** The mean speed against the stars, kilometres a second (a circle at each orbit's own size). */
  speedKmS: number;
  /** How many planes the right ascension falls into (`planes.length`). With `clustered` false a 1 here means only that nothing separates them. */
  planeCount: number;
  planes: readonly Plane[];
  /** Satellites that belong to no plane. */
  otherCount: number;
  /** See `PlaneClusters.clustered`: false for a group with no planes to show (Starlink) and for one plane. */
  clustered: boolean;
  /** The newest element set's moment in milliseconds since the Unix epoch, or 0 when no set has an `EPOCH`. */
  newestEpochMs: number;
}

/**
 * The facts of a group from its element sets: the count, mean height and the lowest and highest points, inclination, period, speed and the orbital planes. A set that is not an orbit (no mean motion) is left out, and the planes' `members` count the sets that are kept.
 * Heights are above the mean Earth radius of 6,371 km, as `orbitShape` and the satellites' own readout give them. An empty group has every number 0.
 *
 * @param elements - The group's element sets.
 * @param options - How the planes are found, see `PlaneOptions`.
 * @returns The facts.
 *
 * @example
 * ```ts
 * import { groupFacts } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const gps = (RA_OF_ASC_NODE: number) => ({ MEAN_MOTION: 2.00563, ECCENTRICITY: 0.0102, INCLINATION: 55.1, RA_OF_ASC_NODE });
 * const facts = groupFacts([gps(24), gps(26), gps(84), gps(86), gps(144), gps(146)]);
 * console.log(facts.count, Math.round(facts.meanAltitudeKm), Math.round(facts.periodMinutes), facts.planeCount);
 * ```
 */
export function groupFacts(elements: readonly FlatElements[], options: PlaneOptions = {}): GroupFacts {
  const orbits = elements.filter((one) => orbitShape(one.MEAN_MOTION, one.ECCENTRICITY) !== null);
  const count = orbits.length;
  if (count === 0) {
    return { count: 0, meanAltitudeKm: 0, minAltitudeKm: 0, maxAltitudeKm: 0, meanInclinationDeg: 0, minInclinationDeg: 0, maxInclinationDeg: 0, periodMinutes: 0, speedKmS: 0, planeCount: 0, planes: [], otherCount: 0, clustered: false, newestEpochMs: 0 };
  }
  let altitude = 0;
  let low = Infinity;
  let high = -Infinity;
  let inclination = 0;
  let lowInclination = Infinity;
  let highInclination = -Infinity;
  let period = 0;
  let speed = 0;
  let newest = 0;
  for (const one of orbits) {
    const shape = orbitShape(one.MEAN_MOTION, one.ECCENTRICITY)!;
    altitude += shape.semiMajorKm - 6371;
    low = Math.min(low, shape.perigeeKm);
    high = Math.max(high, shape.apogeeKm);
    inclination += one.INCLINATION;
    lowInclination = Math.min(lowInclination, one.INCLINATION);
    highInclination = Math.max(highInclination, one.INCLINATION);
    period += shape.periodMinutes;
    speed += Math.sqrt(MU / shape.semiMajorKm);
    if (one.EPOCH) {
      const epoch = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(one.EPOCH) ? one.EPOCH : `${one.EPOCH}Z`);
      if (Number.isFinite(epoch) && epoch > newest) newest = epoch;
    }
  }
  const clusters = clusterPlanes(orbits, options);
  return {
    count,
    meanAltitudeKm: altitude / count,
    minAltitudeKm: low,
    maxAltitudeKm: high,
    meanInclinationDeg: inclination / count,
    minInclinationDeg: lowInclination,
    maxInclinationDeg: highInclination,
    periodMinutes: period / count,
    speedKmS: speed / count,
    planeCount: clusters.planes.length,
    planes: clusters.planes,
    otherCount: clusters.other.length,
    clustered: clusters.clustered,
    newestEpochMs: newest,
  };
}
