// The nearest city's name on a "you are here" marker. Pure: kuni does the lookup (`CitySet.nearest`); this only decides which places are named, in which language, and how far is too far.
import type { Place } from "./places.ts";

/**
 * How far, in kilometres, a `here` marker looks for a city when `here-city` is set with no number.
 *
 * @example
 * ```ts
 * import { HERE_CITY_KM } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(HERE_CITY_KM); // 100
 * ```
 */
export const HERE_CITY_KM = 100;

/**
 * The furthest `here-city` will look, in kilometres. A larger number is read as this.
 *
 * @example
 * ```ts
 * import { HERE_CITY_MAX_KM, readHereCity } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(readHereCity("999999") === HERE_CITY_MAX_KM);
 * ```
 */
export const HERE_CITY_MAX_KM = 20_000;

/**
 * The kuni tiers a `here` marker's city is chosen from. A city of fewer than 100,000 people is in none of them.
 *
 * @example
 * ```ts
 * import { HERE_CITY_TIERS } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(HERE_CITY_TIERS.join(" "));
 * ```
 */
export const HERE_CITY_TIERS = ["capitals", "1m", "100k"] as const;

/**
 * What `here-city` needs of a city list: `nearest`, as kuni's `CitySet` has it. Any list with that method will do.
 *
 * @example
 * ```ts
 * import type { HereCitySource } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const source: HereCitySource = { nearest: () => null };
 * console.log(source.nearest({ lat: 0, lon: 0 }));
 * ```
 */
export interface HereCitySource {
  nearest(
    point: { lat: number; lon: number },
    options?: { maxKm?: number },
  ): { city: { id: string; name: { en: string; ja?: string; jaShort?: string } }; km: number } | null;
}

/**
 * The city chosen for one `here` place.
 *
 * @example
 * ```ts
 * import type { HereCityHit } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const hit: HereCityHit = { index: 0, id: "Q90", label: "Paris", km: 2 };
 * console.log(hit.label);
 * ```
 */
export interface HereCityHit {
  /** Where the place is in the list given. */
  index: number;
  /** The city's id. */
  id: string;
  /** The name to draw, in the page's language. */
  label: string;
  /** The great-circle distance kuni reported, in kilometres. */
  km: number;
}

/** The name to write, the same rule as the city names: the short Japanese name, then the Japanese name, else English. */
const cityText = (name: { en: string; ja?: string; jaShort?: string }, lang: "en" | "ja"): string => {
  const ja = lang === "ja" ? (name.jaShort || name.ja) : undefined;
  return ja || name.en;
};

/**
 * Read the `here-city` attribute. Absent, `off`, or anything that is not a positive number of kilometres: off (`false`).
 * Present with no value, or `on`: {@link HERE_CITY_KM}. A positive number: that many kilometres, at most {@link HERE_CITY_MAX_KM}.
 *
 * @param value - The attribute's text, or null when it is not set.
 * @returns `false` when the marker keeps the page's label, or the kilometre limit.
 *
 * @example
 * ```ts
 * import { HERE_CITY_KM, readHereCity } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(readHereCity(null), readHereCity(""), readHereCity("40"), readHereCity("off"), HERE_CITY_KM);
 * ```
 */
export function readHereCity(value: string | null | undefined): false | number {
  if (value == null) return false;
  const text = value.trim().toLowerCase();
  if (text === "" || text === "on") return HERE_CITY_KM;
  if (text === "off") return false;
  const km = Number(text);
  if (!Number.isFinite(km) || km <= 0) return false;
  return Math.min(km, HERE_CITY_MAX_KM);
}

/**
 * The city for each `here` place, nearest first within `maxKm`, named in `lang`. A favourite is left out. A place with no city inside the limit is left out, so the page's own label stays.
 * The lookup is the source's: this adds none.
 *
 * @param places - The places, as the element holds them.
 * @param source - A city list with `nearest` (kuni's `CitySet`).
 * @param options - `lang` (`en` or `ja`) and `maxKm`.
 * @returns One hit for each `here` place that has a city inside the limit, in the list's order.
 *
 * @example
 * ```ts
 * import { hereCityLabels } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const paris = { id: "Q90", name: { en: "Paris", ja: "パリ" } };
 * const source = {
 *   nearest(_point: { lat: number; lon: number }, options?: { maxKm?: number }) {
 *     return options?.maxKm !== undefined && options.maxKm < 5 ? null : { city: paris, km: 2 };
 *   },
 * };
 * const places = [{ lon: 2.35, lat: 48.86, kind: "here" as const }, { lon: 4.84, lat: 45.76, kind: "favourite" as const }];
 * console.log(hereCityLabels(places, source, { lang: "en", maxKm: 100 })[0]?.label);
 * console.log(hereCityLabels(places, source, { lang: "ja", maxKm: 100 })[0]?.label);
 * console.log(hereCityLabels(places, source, { lang: "en", maxKm: 1 }).length);
 * ```
 */
export function hereCityLabels(places: readonly Pick<Place, "lon" | "lat" | "kind">[], source: HereCitySource, options: { lang: "en" | "ja"; maxKm: number }): HereCityHit[] {
  if (!(options.maxKm > 0)) return [];
  const out: HereCityHit[] = [];
  for (const [index, place] of places.entries()) {
    if (place.kind !== "here") continue;
    const found = source.nearest({ lat: place.lat, lon: place.lon }, { maxKm: options.maxKm });
    if (!found || !(found.km <= options.maxKm)) continue;
    const label = cityText(found.city.name, options.lang).trim().slice(0, 80);
    if (!label) continue;
    out.push({ index, id: found.city.id, label, km: found.km });
  }
  return out;
}
