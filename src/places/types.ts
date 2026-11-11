// Places on the Earth (MODULES-927 and MODULES-942): the list a page hands to `<chikyu-earth-realistic>` or `<chikyu-space>` as `places`, each one drawn as a marker standing out of the surface, with its name beside it.
// The package never asks where anybody is and stores nothing: the page hands the list in, and is told of a click. Pure: no DOM, no three.js.

/**
 * What a place is: `here` is the visitor's own place (the marker that stands out), `favourite` is any other place the page marks, drawn quieter.
 *
 * @example
 * ```ts
 * import type { PlaceKind } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const kinds: PlaceKind[] = ["here", "favourite"];
 * console.log(kinds.join(", "));
 * ```
 */
export type PlaceKind = "here" | "favourite";

/**
 * One place: where it is, its name (optional) and what kind of place it is (`favourite` where left out). `id` is the page's own name for it and is what a click reports.
 *
 * @example
 * ```ts
 * import type { Place } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const tokyo: Place = { id: "tokyo", lat: 35.68, lon: 139.69, label: "Tokyo", kind: "favourite" };
 * console.log(tokyo.label);
 * ```
 */
export interface Place {
  id: string;
  lat: number;
  lon: number;
  label?: string;
  kind?: PlaceKind;
}

/**
 * The most places drawn: more than this are left out (and counted), so a page cannot ask for a thousand markers.
 *
 * @example
 * ```ts
 * import { MAX_PLACES } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * console.log(MAX_PLACES);
 * ```
 */
export const MAX_PLACES = 200;

/** The longest label kept, in characters. */
const MAX_LABEL = 60;

/**
 * What `readPlaces` made of a list.
 *
 * @example
 * ```ts
 * import type { PlacesRead } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const say = (read: PlacesRead): string => `${read.places.length} kept, ${read.skipped} left out`;
 * console.log(typeof say);
 * ```
 */
export interface PlacesRead {
  /** The places that can be drawn, each one a copy with its longitude in -180 to 180 and its `kind` set. */
  places: Place[];
  /** How many were left out: not an object, no text id, an id already used, a latitude or longitude that is not a number or a latitude over 90 degrees, or past `MAX_PLACES`. */
  skipped: number;
}

/**
 * Reads a list of places a page handed in: each one is checked and copied (the page's own objects are never kept or changed), and one that cannot be drawn is left out and counted, never thrown at the page. The longitude is brought into -180 to 180,
 * a label is trimmed and kept to 60 characters, a `kind` that is not `here` is `favourite`, and the first of two places with the same id wins.
 *
 * @param input - A list of places, or anything: what is not a list is no places.
 * @returns The places that can be drawn and how many were left out.
 *
 * @example
 * ```ts
 * import { readPlaces } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const read = readPlaces([{ id: "a", lat: 35.7, lon: 190, label: " Tokyo " }, { id: "b", lat: 120, lon: 0 }, { id: "a", lat: 1, lon: 1 }]);
 * console.log(read.places, read.skipped);
 * ```
 */
export function readPlaces(input: unknown): PlacesRead {
  const places: Place[] = [];
  let skipped = 0;
  if (!Array.isArray(input)) return { places, skipped: 0 };
  const seen = new Set<string>();
  for (const given of input as unknown[]) {
    const one = given as Partial<Place> | null;
    const ok =
      typeof one === "object" &&
      one !== null &&
      typeof one.id === "string" &&
      one.id !== "" &&
      !seen.has(one.id) &&
      typeof one.lat === "number" &&
      Number.isFinite(one.lat) &&
      Math.abs(one.lat) <= 90 &&
      typeof one.lon === "number" &&
      Number.isFinite(one.lon);
    if (!ok || places.length >= MAX_PLACES) {
      skipped += 1;
      continue;
    }
    const made = given as Place;
    seen.add(made.id);
    const label = typeof made.label === "string" ? made.label.trim().slice(0, MAX_LABEL) : "";
    places.push({ id: made.id, lat: made.lat, lon: ((((made.lon + 180) % 360) + 360) % 360) - 180, ...(label === "" ? {} : { label }), kind: made.kind === "here" ? "here" : "favourite" });
  }
  return { places, skipped };
}

/**
 * Reads the `places` attribute: a JSON list of places. Text that is not JSON, or not a list, is no places.
 *
 * @param text - The attribute's value, or `null` when there is none.
 * @returns The places that can be drawn and how many were left out.
 *
 * @example
 * ```ts
 * import { readPlacesAttribute } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * console.log(readPlacesAttribute('[{"id":"tokyo","lat":35.68,"lon":139.69,"label":"Tokyo"}]').places.length);
 * ```
 */
export function readPlacesAttribute(text: string | null): PlacesRead {
  if (text === null || text.trim() === "") return { places: [], skipped: 0 };
  try {
    return readPlaces(JSON.parse(text) as unknown);
  } catch {
    return { places: [], skipped: 0 };
  }
}
