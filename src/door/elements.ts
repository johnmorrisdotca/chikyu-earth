// The record sources of the data door: lists of satellites' orbital elements (`ElementSet`s, the OMM "GP" shape CelesTrak and Space-Track serve), for `<chikyu-passes>`. A page that already reads elements from an address
// (`fetchElements`) hands the result in as a source by `elementsFrom`, which says whose data it is. Pure: no DOM, no three.js, no satellite.js.
import { loadRecords, type RecordSource, type RecordsRead, type SourceInfo } from "../data-door.ts";
import { fetchElements, type FetchElementsOptions } from "../satellites/source.ts";
import type { ElementSet } from "../satellites/types.ts";

/**
 * A source of satellites' orbital elements: a list that fits in memory (at most 200,000 sets), read once when the source is added, each an `ElementSet`.
 *
 * @example
 * ```ts
 * import type { ElementRecordSource } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const names = (sources: readonly ElementRecordSource[]): string[] => sources.map((source) => source.info.id);
 * console.log(names([]));
 * ```
 */
export type ElementRecordSource = RecordSource<ElementSet>;

/** The numbers of an element set that must be finite for it to be drawn. */
export const elementNumbers = (set: ElementSet): readonly number[] => [
  set.MEAN_MOTION,
  set.ECCENTRICITY,
  set.INCLINATION,
  set.RA_OF_ASC_NODE,
  set.ARG_OF_PERICENTER,
  set.MEAN_ANOMALY,
  set.NORAD_CAT_ID,
  set.BSTAR,
  set.MEAN_MOTION_DOT,
  set.MEAN_MOTION_DDOT,
  Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(set.EPOCH) ? set.EPOCH : `${set.EPOCH}Z`),
];

/** Whether a record is an element set the passes can work from: a name and an epoch that are text, a mean motion above zero and an orbit that is an ellipse. */
export const isElementSet = (set: unknown): set is ElementSet => {
  if (typeof set !== "object" || set === null) return false;
  const one = set as Partial<ElementSet>;
  return typeof one.OBJECT_NAME === "string" && typeof one.EPOCH === "string" && typeof one.MEAN_MOTION === "number" && one.MEAN_MOTION > 0 && typeof one.ECCENTRICITY === "number" && one.ECCENTRICITY >= 0 && one.ECCENTRICITY < 1;
};

/**
 * What `readElementSets` found: the frozen element sets that can be used, and `skipped`, the ones left out for a number that is not finite, a name that is not text or an orbit that is not an ellipse.
 *
 * @example
 * ```ts
 * import type { ElementSetsRead } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const say = (read: ElementSetsRead): string => `${read.status}: ${read.records.length} kept, ${read.skipped} skipped`;
 * console.log(typeof say);
 * ```
 */
export type ElementSetsRead = RecordsRead<ElementSet>;

/**
 * Reads a source of element sets once: the list is frozen, a set that cannot be used is left out and counted, and a list of more than 200,000 is refused whole. It never throws: a source that fails is a failed read, and one the
 * signal aborted is `aborted`.
 *
 * @param source - The source.
 * @param signal - Aborts the read.
 * @returns The element sets and the count left out.
 *
 * @example
 * ```ts no-run
 * import { readElementSets, type ElementRecordSource } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * declare const source: ElementRecordSource;
 * const read = await readElementSets(source, new AbortController().signal);
 * console.log(read.records.length, read.skipped);
 * ```
 */
export async function readElementSets(source: ElementRecordSource, signal: AbortSignal): Promise<ElementSetsRead> {
  const read = await loadRecords(source, signal, (set) => (isElementSet(set) ? elementNumbers(set) : [Number.NaN]));
  return read;
}

/**
 * A source of element sets read from an address of your choosing, with whose data it is. The address is read through `fetchElements`, so its politeness rules apply (one request in two hours, a refusal is left alone for an hour,
 * nothing at rest); the sets are read once, when the source is added. The package has no address of its own and never asks one by itself.
 *
 * @param url - The address of OMM JSON, OMM CSV or TLE text.
 * @param info - Who the data is: its id, credit, licence and page.
 * @param options - What `fetchElements` takes.
 * @returns The source, for `addSource` or `sources`.
 *
 * @example
 * ```ts no-run
 * import { elementsFrom } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const mine = elementsFrom("https://example.org/elements/bright.json", {
 *   id: "my-elements",
 *   name: { en: "My elements", ja: "私の軌道要素" },
 *   credit: { en: "Orbit data: my own mirror", ja: "軌道データ：私のミラー" },
 *   licence: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
 *   url: "https://example.org/elements/",
 *   retrieved: "2026-11-11",
 * });
 * console.log(mine.info.id);
 * ```
 */
export function elementsFrom(url: string, info: SourceInfo, options: FetchElementsOptions = {}): ElementRecordSource {
  return {
    kind: "records",
    info,
    async records(signal) {
      return (await fetchElements(url, { ...options, signal })).sets;
    },
  };
}

/** A newer epoch wins: the milliseconds of an element set's epoch, or `-Infinity` for one that does not parse. */
export const epochOf = (set: ElementSet): number => {
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(set.EPOCH) ? set.EPOCH : `${set.EPOCH}Z`);
  return Number.isFinite(ms) ? ms : -Infinity;
};

/**
 * The element sets of several lists as one, one set for each satellite: where two lists have the same NORAD number the set with the newer epoch wins, and a tie goes to the list that came first.
 *
 * @param lists - Each list's sets, with the id of the source they came from (`null` for sets the page set itself).
 * @returns The sets, each with the id of the source it came from (an `id` of `null` means a set the page set itself, not one from a source).
 *
 * @example
 * ```ts
 * import { mergeElementSets } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(mergeElementSets([]).length);
 * ```
 */
export function mergeElementSets(lists: readonly { id: string | null; sets: readonly ElementSet[] }[]): { set: ElementSet; id: string | null }[] {
  const best = new Map<number, { set: ElementSet; id: string | null }>();
  for (const list of lists) {
    for (const set of list.sets) {
      const held = best.get(set.NORAD_CAT_ID);
      if (held === undefined || epochOf(set) > epochOf(held.set)) best.set(set.NORAD_CAT_ID, { set, id: list.id });
    }
  }
  return [...best.values()];
}
