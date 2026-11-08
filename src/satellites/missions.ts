// Historic Earth-orbit missions: the facts of each Space Shuttle flight (src/satellites/missions-data.ts) and where its craft was at any moment of the flight, from the element sets Space-Track kept
// at the time. The positions come from the same SGP4 as the rest of the satellites (createSatellites); the elements are passed in by the page, like all elements here.
import { eciToGeodetic, gstime } from "satellite.js";
import { MISSIONS } from "./missions-data.ts";
import { createSatellites } from "./track.ts";
import type { ElementSet, Satellites } from "./types.ts";

const EARTH_RADIUS_KM = 6371;
const DAY_MS = 86_400_000;
const MAX_AGE_DAYS = 2;

/**
 * The five orbiters that flew.
 *
 * @example
 * ```ts
 * import type { Orbiter } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const first: Orbiter = "Columbia";
 * console.log(first);
 * ```
 */
export type Orbiter = "Columbia" | "Challenger" | "Discovery" | "Atlantis" | "Endeavour";

/**
 * Which visit to the Hubble Space Telescope a flight was: `deployment` (STS-31) or a servicing mission (`SM1` to `SM4`; `SM3A` and `SM3B` are the two parts of the third).
 *
 * @example
 * ```ts
 * import { missions } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(missions().filter((one) => one.hubble).map((one) => `${one.name} ${one.hubble}`));
 * ```
 */
export type HubbleVisit = "deployment" | "SM1" | "SM2" | "SM3A" | "SM3B" | "SM4";

/**
 * One Space Shuttle flight, with the facts NASA's mission page gives (public domain; the pages and the day they were read are in NOTICE.md).
 *
 * @example
 * ```ts
 * import { missionOf } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const flight = missionOf("STS-31");
 * console.log(flight?.orbiter, flight?.launch, flight?.crew, flight?.payload);
 * ```
 */
export interface Mission {
  /** A short name for an address, lower case: `sts-31`, `sts-41b`. */
  id: string;
  /** The flight's name as NASA writes it without the dash in the middle: `STS-31`, `STS-41B`. */
  name: string;
  orbiter: Orbiter;
  /** The liftoff, ISO 8601 in UTC (`1990-04-24T12:33:51Z`). */
  launch: string;
  /** The landing, in the same form; null for STS-51-L, which broke up 73 seconds after liftoff. */
  landing: string | null;
  /** The number of people NASA's page lists for the flight. */
  crew: number;
  /** The main payload or job, in a few words. */
  payload: string;
  payloadJa: string;
  /** The NORAD catalogue number the flight's craft was given while in orbit (what Space-Track's element sets are filed under); null when it was given none. */
  noradId: number | null;
  /** Set on the flights that deployed or serviced the Hubble Space Telescope (catalogue number 20580), which the flight's element file holds too. */
  hubble?: HubbleVisit;
  /** NASA's page for the flight. */
  url: string;
}

/**
 * Where a craft was at a moment: over the ground (WGS 84), how high, how fast, and which element set the place came from.
 *
 * @example
 * ```ts
 * import type { MissionPosition } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const describe = (place: MissionPosition): string => `${place.latitude.toFixed(1)}, ${place.longitude.toFixed(1)}, ${place.altitudeKm.toFixed(0)} km`;
 * console.log(describe({ latitude: 28.5, longitude: -80.6, altitudeKm: 300, speedKmS: 7.7, epochMs: 0 }));
 * ```
 */
export interface MissionPosition {
  /** Degrees north. */
  latitude: number;
  /** Degrees east, -180 to 180. */
  longitude: number;
  /** Height above the WGS 84 ellipsoid, kilometres. */
  altitudeKm: number;
  /** Speed against the stars, kilometres a second. */
  speedKmS: number;
  /** The moment of the element set used, milliseconds since the Unix epoch. */
  epochMs: number;
}

/**
 * What a mission's element file on the demo site holds (`missions/<id>.json`): for each craft, its name and a row of numbers for each element set Space-Track kept, in `fields` order.
 *
 * @example
 * ```ts
 * import type { MissionFile } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const count = (file: MissionFile): number => Object.values(file.objects).reduce((sum, craft) => sum + craft.rows.length, 0);
 * console.log(count({ id: "sts-1", retrieved: "2026-11-08T12:18Z", source: "Space-Track.org (USSPACECOM)", fields: ["EPOCH"], objects: {} }));
 * ```
 */
export interface MissionFile {
  id: string;
  retrieved: string;
  source: string;
  fields: readonly string[];
  /** By NORAD catalogue number. */
  objects: Record<string, { name: string; designator: string; rows: (string | number)[][] }>;
}

const INDEX = new Map(MISSIONS.map((one) => [one.id, one]));

/**
 * Every Space Shuttle flight, STS-1 to STS-135, in the order they launched.
 *
 * @returns The 135 flights.
 *
 * @example
 * ```ts
 * import { missions } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const all = missions();
 * console.log(all.length, all[0]?.name, all.at(-1)?.name);
 * ```
 */
export function missions(): readonly Mission[] {
  return MISSIONS;
}

/**
 * One flight by its name or number: `"STS-31"`, `"sts-31"`, `"31"`, `31` and `"STS-41B"` all work (STS-51-L is `"51L"` or `"STS-51-L"`).
 *
 * @param id - The flight's name or number.
 * @returns The flight, or undefined when there was none by that name.
 *
 * @example
 * ```ts
 * import { missionOf } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(missionOf("STS-125")?.hubble, missionOf(135)?.orbiter, missionOf("STS-136"));
 * ```
 */
export function missionOf(id: string | number): Mission | undefined {
  const key = String(id).toLowerCase().replace(/^sts/, "").replace(/[\s-]/g, "");
  return INDEX.get(`sts-${key}`);
}

/**
 * The element sets in a mission's file, as `missionPosition` and `createSatellites` take them, by NORAD catalogue number.
 *
 * @param file - A mission's file from the demo site (`missions/<id>.json`).
 * @returns The sets of each craft, in time order.
 *
 * @example
 * ```ts
 * import { missionElements } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const sets = missionElements({
 *   id: "sts-1",
 *   retrieved: "2026-11-08T12:18Z",
 *   source: "Space-Track.org (USSPACECOM)",
 *   fields: ["EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"],
 *   objects: { "12399": { name: "STS 1 (OFT-1)", designator: "1981-034A", rows: [["1981-04-12T11:53:25.728288", 16.10930225, 0.0008761, 40.3505, 262.129, 212.5283, 147.5016, 0.002351, 0.02496602, 0.0000043266]] } },
 * });
 * console.log(sets[12399]?.length);
 * ```
 */
export function missionElements(file: MissionFile): Record<number, ElementSet[]> {
  const out: Record<number, ElementSet[]> = {};
  for (const [number, craft] of Object.entries(file.objects)) {
    out[Number(number)] = craft.rows.map((row) => ({ ...Object.fromEntries(file.fields.map((field, index) => [field, row[index]])), OBJECT_NAME: craft.name, OBJECT_ID: craft.designator, NORAD_CAT_ID: Number(number) }) as unknown as ElementSet);
  }
  return out;
}

interface Track {
  sets: ElementSet[];
  epochs: number[];
  satellites: Satellites[];
}
const tracks = new WeakMap<readonly ElementSet[], Track>();
const epochOf = (set: ElementSet): number => Date.parse(/[zZ]$/.test(set.EPOCH) ? set.EPOCH : `${set.EPOCH}Z`);

function trackOf(sets: readonly ElementSet[]): Track {
  let found = tracks.get(sets);
  if (!found) {
    const sorted = [...sets].sort((x, y) => epochOf(x) - epochOf(y));
    found = { sets: sorted, epochs: sorted.map(epochOf), satellites: sorted.map((set) => createSatellites([set], { maxAgeDays: MAX_AGE_DAYS })) };
    tracks.set(sets, found);
  }
  return found;
}

/**
 * Where a craft was at a moment, from the element set nearest in time (SGP4, the same as `createSatellites`). Elements more than two days from the moment give nothing, and so does a moment outside a flight when you pass its
 * mission (the orbiter is on the ground before liftoff and after landing). The sets of one craft are read once and kept for the next call.
 *
 * @param sets - The craft's element sets (from `missionElements`).
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @param mission - The flight, to hold the moment between its liftoff and landing when the sets are the flight's own craft (its `noradId`).
 * @returns The place, or undefined when there is none at that moment.
 *
 * @example
 * ```ts
 * import { missionPosition } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const sets = [
 *   {
 *     OBJECT_NAME: "STS 1 (OFT-1)",
 *     EPOCH: "1981-04-12T11:53:25.728288",
 *     MEAN_MOTION: 16.10930225,
 *     ECCENTRICITY: 0.0008761,
 *     INCLINATION: 40.3505,
 *     RA_OF_ASC_NODE: 262.129,
 *     ARG_OF_PERICENTER: 212.5283,
 *     MEAN_ANOMALY: 147.5016,
 *     NORAD_CAT_ID: 12399,
 *     BSTAR: 0.002351,
 *     MEAN_MOTION_DOT: 0.02496602,
 *     MEAN_MOTION_DDOT: 0.0000043266,
 *   },
 * ];
 * const place = missionPosition(sets, Date.UTC(1981, 3, 12, 14));
 * console.log(place?.latitude.toFixed(1), place?.longitude.toFixed(1), place?.altitudeKm.toFixed(0));
 * ```
 */
export function missionPosition(sets: readonly ElementSet[], ms: number, mission?: Mission): MissionPosition | undefined {
  if (sets.length === 0) return undefined;
  if (mission && mission.noradId === sets[0]!.NORAD_CAT_ID) {
    if (ms < Date.parse(mission.launch) || (mission.landing !== null && ms > Date.parse(mission.landing))) return undefined;
  }
  const track = trackOf(sets);
  let best = 0;
  for (let i = 1; i < track.epochs.length; i += 1) if (Math.abs(track.epochs[i]! - ms) < Math.abs(track.epochs[best]! - ms)) best = i;
  if (Math.abs(track.epochs[best]! - ms) > MAX_AGE_DAYS * DAY_MS) return undefined;
  const out = new Float64Array(6);
  if (!track.satellites[best]!.exact(0, ms, out)) return undefined;
  const eci = { x: out[0]! * EARTH_RADIUS_KM, y: -out[2]! * EARTH_RADIUS_KM, z: out[1]! * EARTH_RADIUS_KM };
  const place = eciToGeodetic(eci, gstime(new Date(ms)));
  return {
    latitude: (place.latitude * 180) / Math.PI,
    longitude: ((((place.longitude * 180) / Math.PI + 540) % 360) + 360) % 360 - 180,
    altitudeKm: place.height,
    speedKmS: Math.hypot(out[3]!, out[4]!, out[5]!),
    epochMs: track.epochs[best]!,
  };
}
