// The fleets a page offers as filters: Starlink, OneWeb, GPS, Galileo, GLONASS, BeiDou, Iridium and the space stations, found from an object's name and kind. Pure: facts about names, no data.
import type { ObjectKind } from "./kinds.ts";

/**
 * A fleet: a group of satellites that belong together, found by the pattern its members' names follow.
 *
 * @example
 * ```ts
 * import type { Fleet } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const fleet: Fleet = { id: "starlink", label: { en: "Starlink", ja: "スターリンク" }, pattern: /^STARLINK/ };
 * console.log(fleet.pattern.test("STARLINK-1007"));
 * ```
 */
export interface Fleet {
  /** A short name for an address or a button, lower case. */
  id: string;
  label: { en: string; ja: string };
  /** What the name of a member matches (the name as the catalogue writes it, upper case). */
  pattern: RegExp;
}

/**
 * The fleets, in the order a filter lists them. Only payloads belong to one: the spent rocket bodies and the debris that carry a fleet's name (`IRIDIUM 33 DEB`, `STARLINK-1234 R/B`) are not part of it. A satellite whose
 * name does not say which fleet it is (many of GLONASS's are named `COSMOS` and a number) is not matched.
 *
 * @example
 * ```ts
 * import { FLEETS } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(FLEETS.map((fleet) => fleet.id).join(" "));
 * ```
 */
export const FLEETS: readonly Fleet[] = [
  { id: "starlink", label: { en: "Starlink", ja: "スターリンク" }, pattern: /^STARLINK/ },
  { id: "oneweb", label: { en: "OneWeb", ja: "ワンウェブ" }, pattern: /^ONEWEB/ },
  { id: "gps", label: { en: "GPS", ja: "GPS" }, pattern: /^(NAVSTAR|GPS) / },
  { id: "galileo", label: { en: "Galileo", ja: "ガリレオ" }, pattern: /GALILEO/ },
  { id: "glonass", label: { en: "GLONASS", ja: "グロナス" }, pattern: /GLONASS/ },
  { id: "beidou", label: { en: "BeiDou", ja: "北斗" }, pattern: /^(BEIDOU|COMPASS)/ },
  { id: "iridium", label: { en: "Iridium", ja: "イリジウム" }, pattern: /^IRIDIUM/ },
  { id: "stations", label: { en: "Space stations", ja: "宇宙ステーション" }, pattern: /^(ISS|CSS|TIANHE|WENTIAN|MENGTIAN)( |$)/ },
];

/**
 * The fleet an object belongs to, from its name and kind, or `undefined`.
 *
 * @param name - The object's name as the catalogue writes it, in any case.
 * @param kind - Its kind; a rocket body, debris or unknown object is in no fleet. Left out, the name alone decides.
 * @returns The fleet's id, or `undefined` when the object belongs to none.
 *
 * @example
 * ```ts
 * import { fleetOf } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(fleetOf("STARLINK-1007", "PAY"), fleetOf("IRIDIUM 33 DEB", "DEB"), fleetOf("NAVSTAR 48 (USA 151)"), fleetOf("HST"));
 * ```
 */
export function fleetOf(name: string, kind?: ObjectKind): string | undefined {
  if (kind !== undefined && kind !== "PAY") return undefined;
  const upper = name.trim().toUpperCase();
  return FLEETS.find((fleet) => fleet.pattern.test(upper))?.id;
}

/**
 * How many of each fleet a list of objects holds, and how many objects there are in all: what a filter shows as "N of M".
 *
 * @param objects - The objects' names and kinds.
 * @returns The count in each fleet (every fleet, 0 included) and the total.
 *
 * @example
 * ```ts
 * import { countFleets } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const { total, fleets } = countFleets([{ name: "STARLINK-1007", kind: "PAY" }, { name: "STARLINK-1008", kind: "PAY" }, { name: "HST", kind: "PAY" }]);
 * console.log(fleets["starlink"], total);
 * ```
 */
export function countFleets(objects: Iterable<{ name: string; kind?: ObjectKind }>): { fleets: Record<string, number>; total: number } {
  const fleets = Object.fromEntries(FLEETS.map((fleet) => [fleet.id, 0]));
  let total = 0;
  for (const object of objects) {
    total += 1;
    const id = fleetOf(object.name, object.kind);
    if (id) fleets[id] = (fleets[id] ?? 0) + 1;
  }
  return { fleets, total };
}
