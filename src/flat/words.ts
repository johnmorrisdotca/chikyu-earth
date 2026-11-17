// The flat map's own words, in English and Japanese. The names of the groups come from `SATELLITE_GROUPS` and the satellites' short names from `SHORT_NAMES`.
/**
 * The two languages the flat map has words for.
 *
 * @example
 * ```ts
 * import type { FlatLang } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const lang: FlatLang = "ja";
 * console.log(lang);
 * ```
 */
export type FlatLang = "en" | "ja";

/**
 * The words the flat map writes, one table for each language: `{count}`, `{id}`, `{name}` and the like are filled in. The Japanese is standard, polite Japanese.
 *
 * @example
 * ```ts
 * import { FLAT_WORDS } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(FLAT_WORDS.en.footprint, FLAT_WORDS.ja.footprint);
 * ```
 */
export const FLAT_WORDS: Readonly<Record<FlatLang, Readonly<Record<string, string>>>> = {
  en: {
    map: "Satellites on a flat map of the world",
    controls: "Map controls",
    greenwich: "Greenwich",
    myPlace: "My place",
    centreGreenwich: "Centre the map on Greenwich",
    centreHome: "Centre the map on my place",
    home: "My place",
    all: "All",
    other: "Other",
    plane: "Plane {id}",
    planeChip: "Plane {id}, {count} satellites",
    groupsFilter: "Groups to show",
    planesFilter: "Orbital plane to show",
    footprint: "Footprint",
    groundTrack: "Ground track",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    count: "{count} satellites",
    announce: "{name}, {group}, {altitude} km up",
    announcePlane: ", plane {id}",
    waiting: "Waiting for orbit data.",
    unreadable: "The orbit data could not be read: {why}",
    nothing: "No satellite to show.",
    help: "Arrow keys move from one satellite to the next, Enter chooses it, plus and minus zoom.",
    shown: "{count} satellites shown",
  },
  ja: {
    map: "世界の平面地図の上の衛星",
    controls: "地図の操作",
    greenwich: "グリニッジ",
    myPlace: "自分の場所",
    centreGreenwich: "地図の中心をグリニッジにする",
    centreHome: "地図の中心を自分の場所にする",
    home: "自分の場所",
    all: "すべて",
    other: "その他",
    plane: "軌道面 {id}",
    planeChip: "軌道面 {id}、{count} 機",
    groupsFilter: "表示するグループ",
    planesFilter: "表示する軌道面",
    footprint: "可視範囲",
    groundTrack: "地上軌跡",
    zoomIn: "拡大",
    zoomOut: "縮小",
    count: "{count} 機",
    announce: "{name}、{group}、高さ {altitude} km",
    announcePlane: "、軌道面 {id}",
    waiting: "軌道データを待っています。",
    unreadable: "軌道データを読み取れませんでした: {why}",
    nothing: "表示する衛星がありません。",
    help: "矢印キーで次の衛星へ移り、Enter キーで選びます。プラスとマイナスで拡大・縮小します。",
    shown: "{count} 機を表示中",
  },
};

/** The words with their `{name}` places filled in. */
export const say = (lang: FlatLang, key: string, values: Record<string, string | number> = {}): string =>
  (FLAT_WORDS[lang][key] ?? FLAT_WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
