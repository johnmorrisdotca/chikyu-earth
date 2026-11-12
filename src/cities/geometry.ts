// Which cities are named on the Earth, and where: tiers by how large the Earth is on the screen, the most populous first, each name beside its dot where nothing is in the way. Pure.
import { placeLabels, type LabelItem } from "../markers/labels.ts";

/**
 * The kuni tiers a view needs, in the order they are loaded: the capitals, the other cities of a million, and the others of 100,000.
 *
 * @example
 * ```ts
 * import type { CityNameTier } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const tier: CityNameTier = "1m";
 * console.log(tier);
 * ```
 */
export type CityNameTier = "capitals" | "1m" | "100k";

/**
 * What the layer needs of a city: kuni's own record has more, and any list with these fields will do.
 *
 * @example
 * ```ts
 * import type { NamedCity } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const osaka: NamedCity = { id: "Q35765", name: { en: "Osaka", ja: "大阪市" }, lat: 34.69, lon: 135.5, population: 2_700_000, capital: null };
 * console.log(osaka.name.en);
 * ```
 */
export interface NamedCity {
  id: string;
  name: { en: string; ja?: string; jaShort?: string };
  lat: number;
  lon: number;
  population: number | null;
  capital: "national" | "alternate" | "subdivision" | null;
}

/**
 * Where the Earth is on the screen at one draw: the box, the Earth's radius in pixels, and a way to find a place on it.
 *
 * @example
 * ```ts
 * import type { CityFrame } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const frame: CityFrame = { width: 400, height: 400, radius: 150, project: (lon, lat, out) => { out.x = 200 + lon; out.y = 200 - lat; return 1; } };
 * console.log(frame.radius);
 * ```
 */
export interface CityFrame {
  width: number;
  height: number;
  /** The Earth's radius on the screen, in CSS pixels. */
  radius: number;
  /** Writes where a place falls in the box and answers how squarely it faces the viewer: the cosine of the angle between the ground's upward and the line to the viewer, above 0 in sight, 1 at the middle of the disc. */
  project(lon: number, lat: number, out: { x: number; y: number }): number;
}

/**
 * What the names are laid out with: the most names, the text size in pixels and the dot's radius, and how squarely a city must face the viewer (0.12 by default).
 *
 * @example
 * ```ts
 * import type { CityLayoutOptions } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const options: CityLayoutOptions = { max: 24, size: 12, dot: 3 };
 * console.log(options.max);
 * ```
 */
export interface CityLayoutOptions {
  max: number;
  size: number;
  dot: number;
  /** Cities that face the viewer less squarely than this are left out, so none crowds the limb (0.12). */
  facing?: number;
  /**
   * The width of a name as the browser draws it, in the font the name is drawn in (a canvas's `measureText`): the estimate from the length is a floor, and the larger of the two is used. A machine whose font has wider letters than the estimate takes
   * (a fallback font for Japanese, say) would otherwise lay names over one another. Left out, the estimate alone is used, as in Node.
   */
  measure?: (text: string) => number;
  /** Boxes another layer's names, rings and marks already take (left, top, width and height from the picture's top left): no name is put over one. */
  taken?: readonly { left: number; top: number; width: number; height: number }[];
}

/**
 * A city to name: where its dot is, the text to write and where the text's box goes (its top left corner and size).
 *
 * @example
 * ```ts
 * import type { CityName } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const place = (one: CityName): string => `${one.text} at ${one.left}, ${one.top}`;
 * console.log(typeof place);
 * ```
 */
export interface CityName {
  city: NamedCity;
  text: string;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The Earth's radius on the screen, in pixels, from which each tier is shown: the capitals 60, the cities of a million 170, those of 100,000 420.
 *
 * @example
 * ```ts
 * import { TIER_RADIUS } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(TIER_RADIUS.capitals, TIER_RADIUS["1m"], TIER_RADIUS["100k"]);
 * ```
 */
export const TIER_RADIUS: Readonly<Record<CityNameTier, number>> = { capitals: 60, "1m": 170, "100k": 420 };

/** The most cities looked at at one draw: the most populous in sight; the rest cannot have room for a name. */
const CANDIDATES = 400;

/**
 * The tiers of cities a view of this size shows: none while the Earth is small, the capitals, then the cities of a million, then those of 100,000 as it grows.
 *
 * @param radius - The Earth's radius on the screen, in CSS pixels.
 * @returns The tiers, smallest first.
 *
 * @example
 * ```ts
 * import { cityTiersFor } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(cityTiersFor(30), cityTiersFor(200), cityTiersFor(900));
 * ```
 */
export function cityTiersFor(radius: number): CityNameTier[] {
  const tiers: CityNameTier[] = [];
  for (const tier of ["capitals", "1m", "100k"] as const) if (radius >= TIER_RADIUS[tier]) tiers.push(tier);
  return tiers;
}

/**
 * How much a city counts when names crowd: its people, and a bonus for the capital of a country (2 million), another seat of government (1 million) and the capital of a subdivision (100,000).
 *
 * @param city - The city.
 * @returns The rank; higher is named first.
 *
 * @example
 * ```ts
 * import { cityRank } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(cityRank({ population: 5_700, capital: "national" }), cityRank({ population: 5_700, capital: null }));
 * ```
 */
export function cityRank(city: Pick<NamedCity, "population" | "capital">): number {
  const bonus = city.capital === "national" ? 2_000_000 : city.capital === "alternate" ? 1_000_000 : city.capital === "subdivision" ? 100_000 : 0;
  return (city.population ?? 0) + bonus;
}

/**
 * The name to write for a city: Japanese on a page in Japanese where kuni has it (the short form, 東京 for 東京都, when kuni gives one), else English.
 *
 * @param city - The city.
 * @param lang - The page's language, `en` or `ja`.
 * @returns The name.
 *
 * @example
 * ```ts
 * import { cityNameText } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const osaka = { name: { en: "Osaka", ja: "大阪市" } };
 * console.log(cityNameText(osaka, "en"), cityNameText(osaka, "ja"), cityNameText({ name: { en: "Paris" } }, "ja"));
 * ```
 */
export function cityNameText(city: { name: { en: string; ja?: string; jaShort?: string } }, lang: "en" | "ja"): string {
  return (lang === "ja" ? (city.name.jaShort ?? city.name.ja) : undefined) ?? city.name.en;
}

/**
 * About how wide a name is, in pixels, without reading any layout: a Japanese character is as wide as the text is tall, any other about 0.58 of it.
 *
 * @param text - The name.
 * @param size - The text size in pixels.
 * @returns The width, in pixels.
 *
 * @example
 * ```ts
 * import { nameWidth } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(nameWidth("Tokyo", 12), nameWidth("東京", 12));
 * ```
 */
export function nameWidth(text: string, size: number): number {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? size : size * 0.58;
  return Math.ceil(width) + 4;
}

/**
 * Lays the names out for one draw: the cities in sight, the most important first, each named beside its dot (right, then left, above, below) where no earlier name is in the way; a city with no room is left out.
 *
 * @param cities - The cities of the tiers shown, the highest rank first (see {@link cityRank}).
 * @param frame - Where the Earth is on the screen.
 * @param lang - The page's language, `en` or `ja`.
 * @param options - The most names, the text size and the dot's radius.
 * @returns The names to show, the most important first.
 *
 * @example
 * ```ts
 * import { layoutCities } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const frame = { width: 300, height: 300, radius: 120, project: (lon: number, lat: number, out: { x: number; y: number }) => { out.x = 150 + (lon - 133) * 6; out.y = 150 - (lat - 36) * 6; return 1; } };
 * const tokyo = { id: "Q1490", name: { en: "Tokyo", ja: "東京都" }, lat: 35.7, lon: 139.7, population: 37_000_000, capital: "national" as const };
 * const seoul = { id: "Q8684", name: { en: "Seoul" }, lat: 37.6, lon: 127, population: 10_000_000, capital: "national" as const };
 * console.log(layoutCities([tokyo, seoul], frame, "en", { max: 10, size: 12, dot: 3 }).map((one) => one.text));
 * ```
 */
export function layoutCities(cities: readonly NamedCity[], frame: CityFrame, lang: "en" | "ja", options: CityLayoutOptions): CityName[] {
  const facing = options.facing ?? 0.12;
  const out = { x: 0, y: 0 };
  const margin = options.dot + 2;
  const seen: { city: NamedCity; x: number; y: number }[] = [];
  for (const city of cities) {
    if (seen.length >= CANDIDATES) break;
    if (frame.project(city.lon, city.lat, out) < facing) continue;
    if (out.x < margin || out.y < margin || out.x > frame.width - margin || out.y > frame.height - margin) continue;
    seen.push({ city, x: out.x, y: out.y });
  }
  const height = Math.ceil(options.size * 1.35);
  const texts = seen.map((one) => cityNameText(one.city, lang));
  const items: LabelItem[] = seen.map((one, index) => ({ x: one.x, y: one.y, r: options.dot, w: Math.max(nameWidth(texts[index]!, options.size), options.measure ? Math.ceil(options.measure(texts[index]!)) + 4 : 0), h: height, priority: seen.length - index }));
  return placeLabels(items, frame.width, frame.height, options.max, 64, options.taken).map((place) => {
    const one = seen[place.item]!;
    return { city: one.city, text: texts[place.item]!, x: one.x, y: one.y, left: place.left, top: place.top, width: items[place.item]!.w, height };
  });
}

/**
 * The most names `city-names` may ask for at once.
 *
 * @example
 * ```ts
 * import { CITY_NAMES_MAX } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(CITY_NAMES_MAX);
 * ```
 */
export const CITY_NAMES_MAX = 80;

/**
 * How many names a bare `city-names` asks for.
 *
 * @example
 * ```ts
 * import { CITY_NAMES_DEFAULT } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(CITY_NAMES_DEFAULT);
 * ```
 */
export const CITY_NAMES_DEFAULT = 24;

/**
 * Reads the `city-names` attribute: absent is off, bare is 24 names, a number is that many names (1 to 80).
 *
 * @param value - The attribute's value, or `null` when it is absent.
 * @returns How many names at most, or `null` for none.
 *
 * @example
 * ```ts
 * import { readCityNames } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(readCityNames(null), readCityNames(""), readCityNames("12"), readCityNames("500"), readCityNames("many"));
 * ```
 */
export function readCityNames(value: string | null): number | null {
  if (value === null) return null;
  const count = Number(value.trim());
  if (value.trim() === "" || !Number.isFinite(count)) return CITY_NAMES_DEFAULT;
  return Math.min(CITY_NAMES_MAX, Math.max(1, Math.round(count)));
}
