// What the sheets say, in English and Japanese: the names of the continents and oceans (the Japanese with its reading, for a child), the three facts of each sheet and the titles. Every number in a fact is worked out from the package's own
// outlines and sun, or is one of the few figures of the Earth written below with its source. Pure.
import { subsolarPoint } from "../realistic/sun.ts";
import { landShares, type ContinentId } from "./land.ts";
import type { Lang } from "./common.ts";

/** The Earth's size, from the IAU nominal values (mean radius 6,371 km) and WGS84 (equatorial circumference 40,075 km), rounded: kilometres across, and round the equator. */
export const EARTH_KM = { across: 12742, round: 40075 } as const;
/**
 * The tilt of the Earth's axis to its orbit, in degrees (the IAU's obliquity of the ecliptic at J2000: 23.4393).
 *
 * @example
 * ```ts
 * import { TILT_DEGREES } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(TILT_DEGREES.toFixed(1));
 * ```
 */
export const TILT_DEGREES = 23.4393;
export type PlaceKind = "continent" | "ocean";

/**
 * A continent or an ocean, with where its name is written on a globe and on the flat map.
 *
 * @example
 * ```ts
 * import { PLACES, type Place } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const africa: Place | undefined = PLACES.find((place) => place.id === "africa");
 * console.log(africa?.en, africa?.ja);
 * ```
 */
export interface Place {
  id: string;
  kind: PlaceKind;
  /** The name in lines of words that are written one under the other. */
  en: readonly string[];
  /** The Japanese name as a child reads it (the reading), and the kanji with it for a title. */
  ja: readonly string[];
  kanji: string;
  /** Longitude and latitude where the name is centred. */
  at: readonly [number, number];
  /** Where it is centred on the flat world map, when that is not `at`. */
  mapAt?: readonly [number, number];
  /** On the flat map the name is one line, for the narrow band of sea it is written in. */
  oneLine?: boolean;
}

/**
 * The seven continents and the five oceans the sheets name, with the longitude and latitude where each name is written.
 *
 * @example
 * ```ts
 * import { PLACES } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(PLACES.filter((place) => place.kind === "ocean").map((place) => place.en.join(" ")));
 * ```
 */
export const PLACES: readonly Place[] = [
  { id: "north-america", kind: "continent", en: ["North", "America"], ja: ["きた", "アメリカ"], kanji: "北アメリカ", at: [-100, 44], mapAt: [-109, 53] },
  { id: "south-america", kind: "continent", en: ["South", "America"], ja: ["みなみ", "アメリカ"], kanji: "南アメリカ", at: [-60, -13], mapAt: [-61, -14] },
  { id: "europe", kind: "continent", en: ["Europe"], ja: ["ヨーロッパ"], kanji: "ヨーロッパ", at: [14, 51], mapAt: [13, 55] },
  { id: "africa", kind: "continent", en: ["Africa"], ja: ["アフリカ"], kanji: "アフリカ", at: [20, 5], mapAt: [25, 6] },
  { id: "asia", kind: "continent", en: ["Asia"], ja: ["アジア"], kanji: "アジア", at: [90, 42], mapAt: [127, 46] },
  { id: "oceania", kind: "continent", en: ["Oceania"], ja: ["オセアニア"], kanji: "オセアニア", at: [134, -25], mapAt: [141, -19] },
  { id: "antarctica", kind: "continent", en: ["Antarctica"], ja: ["なんきょく"], kanji: "南極大陸", at: [20, -80], mapAt: [-1, -71] },
  { id: "pacific", kind: "ocean", en: ["Pacific", "Ocean"], ja: ["たいへいよう"], kanji: "太平洋", at: [-145, 8], mapAt: [-128, -6] },
  { id: "atlantic", kind: "ocean", en: ["Atlantic", "Ocean"], ja: ["たいせいよう"], kanji: "大西洋", at: [-33, 22], mapAt: [-46, 20] },
  { id: "indian", kind: "ocean", en: ["Indian", "Ocean"], ja: ["インドよう"], kanji: "インド洋", at: [78, -20], mapAt: [62, -33] },
  { id: "southern", kind: "ocean", en: ["Southern", "Ocean"], ja: ["なんきょくかい"], kanji: "南極海", at: [-30, -62], mapAt: [-39, -48], oneLine: true },
  { id: "arctic", kind: "ocean", en: ["Arctic", "Ocean"], ja: ["ほっきょくかい"], kanji: "北極海", at: [-30, 83], mapAt: [147, 73], oneLine: true },
];

/** A continent's name for a sentence, in one line; Japanese with its kanji. */
export function continentName(id: ContinentId, lang: Lang): string {
  const place = PLACES.find((one) => one.id === id)!;
  return lang === "ja" ? (place.kanji === place.ja.join("") ? place.kanji : `${place.ja.join("")} (${place.kanji})`) : place.en.join(" ");
}

/**
 * The package's name, the credits and the words a sheet carries, by language (the brand in a sheet's header is the page's to pass in).
 *
 * @example
 * ```ts
 * import { SAY } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(SAY.en.pack, SAY.ja.day);
 * ```
 */
export const SAY = {
  en: {
    pack: "Chikyu Earth",
    credits: "Outlines: Natural Earth (public domain). Names: kuni. The Sun's place: Meeus, Astronomical Algorithms.",
    day: "Day",
    night: "Night",
    sun: "Sun",
    flag: "Draw the flag!",
    star: "Capital",
    light: "Sunlight",
    spring: "Spring",
    summer: "Summer",
    autumn: "Autumn",
    winter: "Winter",
    months: ["March", "June", "September", "December"],
    colour: "Colour the continents, then the oceans.",
  },
  ja: {
    pack: "Chikyu Earth 地球",
    credits: "ちずの せん: Natural Earth (パブリックドメイン)。なまえ: kuni。たいようの いち: Meeus の けいさん。",
    day: "ひる",
    night: "よる",
    sun: "たいよう",
    flag: "はたを かこう!",
    star: "しゅと",
    light: "ひかり",
    spring: "はる",
    summer: "なつ",
    autumn: "あき",
    winter: "ふゆ",
    months: ["3がつ", "6がつ", "9がつ", "12がつ"],
    colour: "たいりくと うみに いろを ぬろう。",
  },
} as const;

/**
 * The three views of the globe sheet: the Americas, Europe and Africa, and Asia and Oceania.
 *
 * @example
 * ```ts
 * import { GLOBE_VIEWS } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(GLOBE_VIEWS.join(", "));
 * ```
 */
export const GLOBE_VIEWS = ["americas", "europe-africa", "asia-oceania"] as const;
/**
 * The name of a view of the globe sheet.
 *
 * @example
 * ```ts
 * import { globeSheetSvg, type GlobeView } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const view: GlobeView = "asia-oceania";
 * console.log(globeSheetSvg(view, { widthMm: 184.6, heightMm: 170 }).includes("Asia"));
 * ```
 */
export type GlobeView = (typeof GLOBE_VIEWS)[number];

/** The place at the middle of each view, in longitude and latitude. */
export const VIEW_CENTRES: Readonly<Record<GlobeView, readonly [number, number]>> = {
  americas: [-78, 8],
  "europe-africa": [24, 10],
  "asia-oceania": [110, 4],
};

/** Where each name is written on each view of the globe, by place; a name not listed is not on that view. */
export const VIEW_LABELS: Readonly<Record<GlobeView, Readonly<Record<string, readonly [number, number]>>>> = {
  americas: { "north-america": [-98, 40], "south-america": [-60, -14], pacific: [-104, -4], atlantic: [-52, 20] },
  "europe-africa": { europe: [14, 51], africa: [22, 4], atlantic: [-3, 1], indian: [54, -4], asia: [58, 36] },
  "asia-oceania": { asia: [92, 40], oceania: [134, -25], indian: [82, -8], pacific: [140, 8] },
};

const VIEW_NAMES: Readonly<Record<GlobeView, { en: string; ja: string }>> = {
  americas: { en: "The Americas", ja: "アメリカ" },
  "europe-africa": { en: "Europe and Africa", ja: "ヨーロッパと アフリカ" },
  "asia-oceania": { en: "Asia and Oceania", ja: "アジアと オセアニア" },
};

/**
 * The title of each kind of sheet, in a language.
 *
 * @example
 * ```ts
 * import { TITLES } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(TITLES.globe("americas", "en"), TITLES.country("Japan", "en"), TITLES.seasons("ja"));
 * ```
 */
export const TITLES = {
  globe: (view: GlobeView, lang: Lang): string => (lang === "ja" ? VIEW_NAMES[view].ja : VIEW_NAMES[view].en),
  map: (lang: Lang): string => (lang === "ja" ? "せかいちず (世界地図)" : "A map of the world"),
  country: (name: string, lang: Lang): string => (lang === "ja" ? `わたしの くに: ${name}` : `My country: ${name}`),
  daynight: (lang: Lang): string => (lang === "ja" ? "ひると よる (昼と夜)" : "Day and night"),
  seasons: (lang: Lang): string => (lang === "ja" ? "きせつ (季節)" : "The seasons"),
};

// The Pacific is about 165 million square kilometres of sea, all the land about 149 million (NOAA, the National Ocean Service).
const percent = (value: number): number => Math.round(value);
const thousands = (value: number): string => value.toLocaleString("en-US");

/**
 * The three facts of the globe sheet and of the world map, in plain words. The map's are the share of the land the biggest and the smallest continents have (from the outlines) and the Pacific.
 * @param kind - `globe` or `map`.
 * @param lang - `en` or `ja`.
 * @returns Three sentences.
 *
 * @example
 * ```ts
 * import { earthFacts } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(earthFacts("map", "en")[0]);
 * ```
 */
export function earthFacts(kind: "globe" | "map", lang: Lang): string[] {
  const { landPercent, continents } = landShares();
  const land = percent(landPercent);
  if (kind === "globe") {
    return lang === "ja"
      ? ["たいりくは 7つ、おおきな うみは 5つ。", `りくは ${land}%、うみは ${100 - land}%。`, `はばは ${thousands(EARTH_KM.across)} km、1しゅうは ${thousands(EARTH_KM.round)} km。`]
      : ["The Earth has 7 continents and 5 oceans.", `${land}% is land and ${100 - land}% is sea.`, `${thousands(EARTH_KM.across)} km across, ${thousands(EARTH_KM.round)} km round.`];
  }
  const small = continents.oceania;
  return lang === "ja"
    ? [`いちばん おおきい たいりくは アジア。りくの ${percent(continents.asia)}% です。`, `いちばん ちいさい たいりくは オセアニア。りくの ${percent(small)}% です。`, "いちばん おおきい うみは たいへいよう。りくを ぜんぶ あわせたより おおきい。"]
    : [`Asia is the biggest continent: ${percent(continents.asia)}% of the land.`, `Oceania is the smallest: ${percent(small)}% of the land.`, "The Pacific is bigger than all the land put together."];
}

/** The sun's place as words: `23.4° N, 120.1° E`. */
const place = ([lon, lat]: readonly [number, number]): string => `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? "E" : "W"}`;

/** The moment as words, in UTC: `2026-06-21 12:00 UTC`. */
export const momentText = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * The three facts of the day and night sheet for a moment, with the place the Sun is straight overhead then.
 * @param ms - The moment, in milliseconds since the Unix epoch.
 * @param lang - `en` or `ja`.
 * @returns Three sentences.
 *
 * @example
 * ```ts
 * import { dayNightFacts } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(dayNightFacts(Date.UTC(2026, 5, 21, 12), "en")[1]);
 * ```
 */
export function dayNightFacts(ms: number, lang: Lang): string[] {
  const sun = subsolarPoint(ms);
  const where = place([sun.lon, sun.lat]);
  return lang === "ja"
    ? ["たいように てらされる はんぶんが ひる、はんたいがわの はんぶんが よるです。", `${momentText(ms)} に たいようが まうえに くるのは ${where} です。`, "ちきゅうは 1にちで 1まわり するので、ひると よるの さかいは 1じかんに 15ど すすみます。"]
    : ["The Sun lights half of the Earth. There it is day. The other half has night.", `At ${momentText(ms)} the Sun is straight overhead at ${where}.`, "The Earth turns once a day, so the line between day and night moves 15 degrees every hour."];
}

/**
 * The three facts of the seasons sheet.
 * @param lang - `en` or `ja`.
 * @returns Three sentences.
 *
 * @example
 * ```ts
 * import { seasonsFacts } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(seasonsFacts("en")[0]);
 * ```
 */
export function seasonsFacts(lang: Lang): string[] {
  const tilt = TILT_DEGREES.toFixed(1);
  return lang === "ja"
    ? [`●は きたきょく。ちきゅうは 1ねんじゅう ${tilt}ど かたむいています。`, "6がつは きたが たいように かたむき、きたは なつです。", "ちきゅうは 365にちで たいようを 1しゅう します。"]
    : [`The dot is the North Pole. The Earth stays tilted ${tilt} degrees.`, "In June the north leans to the Sun, so it is summer in the north.", "The Earth goes round the Sun in about 365 days."];
}

/** Up to three names in a sentence: `A, B and C`, or `A, B, C and 2 more`. */
function nameList(names: readonly string[], lang: Lang): string {
  const shown = names.slice(0, 3);
  const more = names.length - shown.length;
  if (lang === "ja") return shown.join("、") + (more > 0 ? ` ほか ${more}` : "");
  return shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)!}` + (more > 0 ? ` (and ${more} more)` : "");
}

/**
 * The three facts of a "my country" sheet: the continent it is in, the countries it touches and its capital.
 * @param shape - The country's name and Japanese name, its continent and the names of its neighbours.
 * @param capital - The capital's name, or `undefined` for a sheet that asks the child to find it.
 * @param lang - `en` or `ja`.
 * @returns Three sentences.
 *
 * @example
 * ```ts
 * import { countryFacts, countryShape } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const france = countryShape("FR")!;
 * console.log(countryFacts(france, "Paris", "en")[1]);
 * ```
 */
export function countryFacts(shape: { name: string; ja: string; continent: ContinentId; neighbours: readonly { name: string; ja: string }[] }, capital: string | undefined, lang: Lang): string[] {
  const near = shape.neighbours.map((one) => (lang === "ja" ? one.ja : one.name));
  if (lang === "ja") {
    return [
      `${shape.ja}は ${continentName(shape.continent, "ja")} に あります。`,
      near.length === 0 ? "りくで つながっている くには ありません。まわりは うみです。" : `${near.length}つの くにと せっして います: ${nameList(near, "ja")}。`,
      capital === undefined ? "しゅとは どこかな? ★を かこう。" : `しゅとは ${capital} です。 ★の ところです。`,
    ];
  }
  return [
    `${shape.name} is in ${continentName(shape.continent, "en")}.`,
    near.length === 0 ? "No other country touches it by land. The sea is all round it." : `It touches ${near.length} ${near.length === 1 ? "country" : "countries"}: ${nameList(near, "en")}.`,
    capital === undefined ? "Where is the capital city? Draw a star on it." : `The capital city is ${capital}. It is at the star.`,
  ];
}
