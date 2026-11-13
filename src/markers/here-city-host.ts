// Loads kuni's cities once, when `here-city` is on and a `here` place is set, and names those places. Nothing is loaded while it is off, and nothing is asked again at rest.
import { HERE_CITY_TIERS, hereCityLabels, type HereCitySource } from "./here-city.ts";
import type { Place } from "./places.ts";

export interface HereCityHost {
  /** `false` leaves every label as the page set it. A number is the kilometre limit. */
  setLimit(limit: false | number): void;
  /** The places to draw. A `here` place whose city is known has that city's name; every other place is the one given. */
  named(places: readonly Place[]): readonly Place[];
  /** The page's language changed: name the places again from the cities already loaded. */
  refresh(): void;
  readonly stats: { on: boolean; maxKm: number; loaded: boolean; pending: boolean };
  dispose(): void;
}

export interface HereCityOptions {
  language(): "en" | "ja";
  /** Cities have arrived, or the language changed, so the element can lay the names out once. */
  onChange(): void;
  /** kuni could not be loaded. */
  onError?(error: unknown): void;
  /** The city list. The default is kuni's capitals, cities of a million and cities of 100,000, loaded only when a `here` place asks. */
  load?(): Promise<HereCitySource>;
}

const defaultLoad = async (): Promise<HereCitySource> => {
  const { loadCities } = await import("@johnmorrisdotca/kuni/cities");
  return loadCities(...HERE_CITY_TIERS);
};

/**
 * The namer for one element. `load` runs at most once, and only after `setLimit` is a number and `named` is given a `here` place.
 */
export function createHereCity(options: HereCityOptions): HereCityHost {
  const load = options.load ?? defaultLoad;
  let limit: false | number = false;
  let source: HereCitySource | null = null;
  let loading = false;
  let failed = false;
  let gone = false;
  let generation = 0;
  let cache: { places: readonly Place[]; lang: "en" | "ja"; limit: number; source: HereCitySource; out: readonly Place[] } | undefined;

  const changed = (): void => {
    cache = undefined;
    if (source && limit !== false && !gone) options.onChange();
  };
  // The family's language chooser tells the document. The name is worked out again once, and the element draws that change.
  const onLanguage = (): void => queueMicrotask(changed);
  if (typeof document !== "undefined") document.addEventListener("kazoku-languagechange", onLanguage);

  const ensure = (): void => {
    if (loading || source || failed || gone) return;
    loading = true;
    const generationNow = generation;
    let pending: Promise<HereCitySource>;
    try {
      pending = Promise.resolve(load());
    } catch (error) {
      loading = false;
      failed = true;
      options.onError?.(error);
      return;
    }
    void pending.then(
      (cities) => {
        if (gone || generationNow !== generation) return;
        source = cities;
        loading = false;
        if (limit !== false) options.onChange();
      },
      (error: unknown) => {
        if (gone || generationNow !== generation) return;
        loading = false;
        failed = true;
        options.onError?.(error);
      },
    );
  };

  return {
    setLimit(next) {
      if (next === limit) return;
      limit = next;
      cache = undefined;
      failed = false;
    },
    named(places) {
      if (gone || limit === false || !places.some((place) => place.kind === "here")) return places;
      if (!source) {
        ensure();
        return places;
      }
      const lang = options.language();
      if (cache && cache.places === places && cache.lang === lang && cache.limit === limit && cache.source === source) return cache.out;
      const hits = new Map(hereCityLabels(places, source, { lang, maxKm: limit }).map((hit) => [hit.index, hit]));
      let changed = false;
      const out = places.map((place, index) => {
        const hit = hits.get(index);
        if (!hit || place.label === hit.label) return place;
        changed = true;
        return { ...place, label: hit.label };
      });
      const labelled = changed ? out : places;
      cache = { places, lang, limit, source, out: labelled };
      return labelled;
    },
    refresh() {
      changed();
    },
    get stats() {
      return { on: limit !== false, maxKm: limit === false ? 0 : limit, loaded: source !== null, pending: loading };
    },
    dispose() {
      gone = true;
      generation += 1;
      source = null;
      cache = undefined;
      loading = false;
      if (typeof document !== "undefined") document.removeEventListener("kazoku-languagechange", onLanguage);
    },
  };
}
