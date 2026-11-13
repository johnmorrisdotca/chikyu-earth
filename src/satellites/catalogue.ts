// A small curated catalogue of satellites worth following: the groups the demo offers as buttons and the famous ones by name. Facts (names, NORAD numbers, orbit types) and our own words;
// no orbital elements are here, and nothing is fetched. The elements come from the page (see docs/satellite-sources.md for the sources and their terms).
import { SHORT_NAMES } from "./names.ts";

/**
 * What kind of orbit a satellite or a group is in: `leo` (low, below 2,000 km), `meo` (medium, up to about 35,000 km: the navigation satellites), `geo` (about 35,786 km up, where a satellite goes round once
 * a day; over the equator it sits still over one place), `heo` (a long oval that swings far out) or `mixed` (a group with more than one kind).
 *
 * @example
 * ```ts
 * import type { OrbitKind } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const sitsStill = (orbit: OrbitKind): boolean => orbit === "geo";
 * console.log(sitsStill("geo"));
 * ```
 */
export type OrbitKind = "leo" | "meo" | "geo" | "heo" | "mixed";

/**
 * A group of satellites the demo offers as one button: what it is, in English and Japanese, and where its elements come from (a CelesTrak list name, or single catalogue numbers).
 *
 * @example
 * ```ts
 * import { SATELLITE_GROUPS } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const gps = SATELLITE_GROUPS.find((group) => group.id === "gps");
 * console.log(gps?.celestrak, gps?.orbit);
 * ```
 */
export interface SatelliteGroupInfo {
  /** A short name for an address or a button, lower case with hyphens. */
  id: string;
  label: string;
  labelJa: string;
  /** A line on what the group is. */
  about: string;
  aboutJa: string;
  orbit: OrbitKind;
  /** True when the satellites of this group sit still over one place (geostationary), so a reader is not surprised that they do not move. */
  still: boolean;
  /** The name of the CelesTrak list (`GROUP=` in its address) that holds the group, when there is one. */
  celestrak?: string;
  /** Single NORAD catalogue numbers to ask for one by one, when the group has no list of its own. */
  catnr?: readonly number[];
}

/**
 * One satellite worth naming: its NORAD catalogue number (the number every source uses), its usual name, the group it is shown in, its orbit and a line on what it is.
 *
 * @example
 * ```ts
 * import { CATALOGUE } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const oldest = CATALOGUE.find((entry) => entry.noradId === 5);
 * console.log(oldest?.name, oldest?.about);
 * ```
 */
export interface CatalogueEntry {
  noradId: number;
  name: string;
  group: string;
  orbit: OrbitKind;
  about: string;
  aboutJa: string;
}

/**
 * The groups, in the order the demo shows them. Each one is a CelesTrak list or a few single numbers; the elements are fetched by the page (or the demo's scheduled build), never by the package.
 *
 * @example
 * ```ts
 * import { SATELLITE_GROUPS } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(SATELLITE_GROUPS.map((group) => group.label).join(", "));
 * ```
 */
export const SATELLITE_GROUPS: readonly SatelliteGroupInfo[] = [
  {
    id: "stations",
    label: "Stations",
    labelJa: "宇宙ステーション",
    about: "The ISS and China's Tiangong, with the craft docked to them. Both circle about 400 km up, once round in about 92 minutes.",
    aboutJa: "ISS と中国の天宮、つながっている宇宙船です。どちらも高さ約400 km を、約92分で1周します。",
    orbit: "leo",
    still: false,
    celestrak: "stations",
  },
  {
    id: "famous",
    label: "Famous",
    labelJa: "有名な衛星",
    about: "Vanguard 1 (the oldest satellite still in orbit), Hubble, the Chandra X-ray telescope, LAGEOS 1 and Envisat.",
    aboutJa: "いちばん古い現役の軌道上の衛星バンガード1、ハッブル、チャンドラ X線望遠鏡、LAGEOS 1、エンビサットです。",
    orbit: "mixed",
    still: false,
    catnr: [5, 8820, 20580, 25867, 27386],
  },
  {
    id: "science",
    label: "Science",
    labelJa: "科学衛星",
    about: "Space telescopes and research satellites: Hubble, Swift, Fermi, XMM-Newton, the four MMS craft. A few swing out far beyond the rest.",
    aboutJa: "宇宙望遠鏡や研究用の衛星です。ハッブル、Swift、Fermi、XMM-Newton、MMS の4機など。ほかよりずっと遠くまで行くものもあります。",
    orbit: "mixed",
    still: false,
    celestrak: "science",
  },
  {
    id: "earth-observation",
    label: "Earth observation",
    labelJa: "地球観測",
    about: "Satellites that photograph or measure the land, ice and seas: Landsat 8 and 9, the Sentinels, Terra, Aqua and many more. Most circle from pole to pole at about 700 km.",
    aboutJa: "陸、氷、海を撮影したり測ったりする衛星です。Landsat 8 と 9、Sentinel、Terra、Aqua など。多くは高さ約700 km で、極から極へ回ります。",
    orbit: "leo",
    still: false,
    celestrak: "resource",
  },
  {
    id: "weather",
    label: "Weather",
    labelJa: "気象衛星",
    about: "Weather satellites. The polar ones (NOAA-20 and -21, Metop, Fengyun 3) pass over each place twice a day; the others (GOES, Himawari, Meteosat, Fengyun 2 and 4) hang over the equator and sit still.",
    aboutJa: "気象衛星です。極を回るもの (NOAA-20、-21、Metop、風雲3号) は、同じ場所の上を1日に2回通ります。ほかのもの (GOES、ひまわり、Meteosat、風雲2号と4号) は赤道の上で止まって見えます。",
    orbit: "mixed",
    still: false,
    celestrak: "weather",
  },
  {
    id: "geostationary",
    label: "Geostationary",
    labelJa: "静止衛星",
    about: "Satellites 35,786 km above the equator. They go round once a day, as fast as the Earth turns, so each one sits still over one place.",
    aboutJa: "赤道の上、高さ35,786 km の衛星です。1日に1周して、地球の回る速さと同じなので、1つの場所の上で止まって見えます。",
    orbit: "geo",
    still: true,
    celestrak: "geo",
  },
  {
    id: "gps",
    label: "GPS",
    labelJa: "GPS",
    about: "The American GPS satellites, about 20,200 km up, twice round the Earth a day.",
    aboutJa: "アメリカの GPS 衛星です。高さ約20,200 km で、1日に2周します。",
    orbit: "meo",
    still: false,
    celestrak: "gps-ops",
  },
  {
    id: "glonass",
    label: "GLONASS",
    labelJa: "GLONASS",
    about: "Russia's GLONASS satellites, about 19,100 km up, once round in about 11 hours 15 minutes.",
    aboutJa: "ロシアの GLONASS 衛星です。高さ約19,100 km で、約11時間15分で1周します。",
    orbit: "meo",
    still: false,
    celestrak: "glo-ops",
  },
  {
    id: "galileo",
    label: "Galileo",
    labelJa: "ガリレオ",
    about: "Europe's Galileo satellites, about 23,200 km up, once round in about 14 hours.",
    aboutJa: "ヨーロッパのガリレオ衛星です。高さ約23,200 km で、約14時間で1周します。",
    orbit: "meo",
    still: false,
    celestrak: "galileo",
  },
  {
    id: "beidou",
    label: "BeiDou",
    labelJa: "北斗",
    about: "China's BeiDou satellites. Most are about 21,500 km up; some are geostationary or on tilted orbits that stay near one place.",
    aboutJa: "中国の北斗衛星です。多くは高さ約21,500 km にあります。静止しているものや、傾いた軌道で1つの場所の近くにとどまるものもあります。",
    orbit: "mixed",
    still: false,
    celestrak: "beidou",
  },
  {
    id: "amateur",
    label: "Amateur radio",
    labelJa: "アマチュア無線",
    about: "Satellites built or used by radio amateurs: FUNcube-1, SO-50, RS-44, the Fox satellites, and old ones like OSCAR 7 from 1974.",
    aboutJa: "アマチュア無線の人たちが作ったり使ったりする衛星です。FUNcube-1、SO-50、RS-44、Fox 衛星、1974年の OSCAR 7 などの古いものもあります。",
    orbit: "mixed",
    still: false,
    celestrak: "amateur",
  },
  {
    id: "oneweb",
    label: "OneWeb",
    labelJa: "OneWeb",
    about: "About 650 OneWeb internet satellites, 1,200 km up on orbits that pass near the poles.",
    aboutJa: "インターネット用の OneWeb 衛星、約650機です。高さ1,200 km で、極の近くを通る軌道を回ります。",
    orbit: "leo",
    still: false,
    celestrak: "oneweb",
  },
  {
    id: "iridium",
    label: "Iridium",
    labelJa: "イリジウム",
    about: "The Iridium NEXT satellites for phones and data anywhere on Earth, 780 km up on orbits that pass near the poles.",
    aboutJa: "地球のどこでも電話やデータが使える、イリジウム NEXT の衛星です。高さ780 km で、極の近くを通ります。",
    orbit: "leo",
    still: false,
    celestrak: "iridium-NEXT",
  },
  {
    id: "starlink",
    label: "Starlink",
    labelJa: "Starlink",
    about: "SpaceX's Starlink: thousands of small internet satellites, mostly about 550 km up.",
    aboutJa: "SpaceX の Starlink です。小さなインターネット衛星が何千機もあり、多くは高さ約550 km にあります。",
    orbit: "leo",
    still: false,
    celestrak: "starlink",
  },
];

/**
 * The satellites worth naming, with the NORAD number every source uses for them: the stations, the famous ones, and a few of each group.
 * JWST is not here on purpose: it is not in Earth orbit (it circles the Sun about 1.5 million km out, at the second Lagrange point).
 *
 * @example
 * ```ts
 * import { CATALOGUE } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(CATALOGUE.filter((entry) => entry.group === "stations").map((entry) => entry.name));
 * ```
 */
export const CATALOGUE: readonly CatalogueEntry[] = [
  { noradId: 25544, name: "ISS (ZARYA)", group: "stations", orbit: "leo", about: "The International Space Station, lived in without a break since November 2000, about 420 km up and tilted 51.6 degrees.", aboutJa: "国際宇宙ステーション。2000年11月から、ずっと人が滞在しています。高さ約420 km で、傾きは51.6度です。" },
  { noradId: 48274, name: "CSS (TIANHE)", group: "stations", orbit: "leo", about: "Tianhe, the core of China's Tiangong station, tilted 41.5 degrees.", aboutJa: "中国の宇宙ステーション、天宮の中心になる天和です。傾きは41.5度です。" },
  { noradId: 5, name: "VANGUARD 1", group: "famous", orbit: "heo", about: "A grapefruit-sized sphere launched on 17 March 1958: the oldest satellite still in orbit, on a long oval that takes it about 3,800 km out.", aboutJa: "1958年3月17日に打ち上げた、グレープフルーツくらいの球です。今も軌道にある、いちばん古い衛星で、いちばん遠いところは高さ約3,800 km です。" },
  { noradId: 20580, name: "HST", group: "famous", orbit: "leo", about: "The Hubble Space Telescope, in orbit since 1990, about 94 minutes round and tilted 28.5 degrees.", aboutJa: "ハッブル宇宙望遠鏡です。1990年から軌道にあり、約94分で1周します。傾きは28.5度です。" },
  { noradId: 25867, name: "CXO", group: "famous", orbit: "heo", about: "The Chandra X-ray Observatory, launched 1999, on a long oval that swings out to about a third of the way to the Moon.", aboutJa: "チャンドラ X線天文台です。1999年に打ち上げ、月までの約3分の1の遠さまで行く、細長い軌道を回ります。" },
  { noradId: 8820, name: "LAGEOS 1", group: "famous", orbit: "meo", about: "A 60 cm ball covered in mirrors that lasers on the ground bounce light off, to measure the Earth's shape and the slow drift of its continents. Launched 1976.", aboutJa: "地上のレーザーの光を返す鏡で全体をおおった、直径60 cm の球です。地球の形や、大陸のゆっくりした動きを測ります。1976年に打ち上げました。" },
  { noradId: 27386, name: "ENVISAT", group: "famous", orbit: "leo", about: "Europe's Earth-watching satellite, working from 2002 until contact was lost in 2012. Still up there, one of the biggest pieces of space junk.", aboutJa: "ヨーロッパの地球観測衛星です。2002年から働き、2012年に連絡が取れなくなりました。今も軌道にあり、大きな宇宙ごみの1つです。" },
  { noradId: 28485, name: "SWIFT", group: "science", orbit: "leo", about: "NASA's Swift, which turns within a minute to look at gamma-ray bursts, the flashes of exploding stars.", aboutJa: "NASA の Swift です。星の爆発で起こるガンマ線バーストを、1分もかからず向きを変えて見ます。" },
  { noradId: 33053, name: "FGRST (GLAST)", group: "science", orbit: "leo", about: "NASA's Fermi gamma-ray telescope, which maps the whole sky every few hours.", aboutJa: "NASA の Fermi ガンマ線望遠鏡です。数時間ごとに、空全体を調べます。" },
  { noradId: 25989, name: "XMM-NEWTON", group: "science", orbit: "heo", about: "Europe's X-ray telescope, on a long oval orbit that takes it more than 100,000 km out.", aboutJa: "ヨーロッパの X線望遠鏡です。高さ10万 km 以上まで行く、細長い軌道を回ります。" },
  { noradId: 49954, name: "IXPE", group: "science", orbit: "leo", about: "NASA's Imaging X-ray Polarimetry Explorer, which orbits right over the equator.", aboutJa: "NASA の IXPE です。赤道のすぐ上を回ります。" },
  { noradId: 57800, name: "XRISM", group: "science", orbit: "leo", about: "The X-ray satellite JAXA launched in 2023, built with NASA and ESA.", aboutJa: "NASA と ESA といっしょに作り、2023年に JAXA が打ち上げた X線天文衛星です。" },
  { noradId: 36395, name: "SDO", group: "science", orbit: "geo", about: "NASA's Solar Dynamics Observatory, which watches the Sun all day from a tilted orbit that takes a day to go round, so it draws a figure eight over one place.", aboutJa: "NASA の太陽観測衛星です。傾いた軌道を1日で1周して、1つの場所の上で8の字をえがきながら、いつも太陽を見ています。" },
  { noradId: 40482, name: "MMS 1", group: "science", orbit: "heo", about: "One of NASA's four MMS craft that fly in a tight group through the Earth's magnetic field.", aboutJa: "NASA の MMS の4機のうちの1機です。4機は近くに並んで、地球の磁場の中を飛びます。" },
  { noradId: 25994, name: "TERRA", group: "earth-observation", orbit: "leo", about: "NASA's Terra, launched 1999, which crosses the equator on the day side every morning at the same hour.", aboutJa: "1999年に打ち上げた NASA の Terra です。毎日同じ時刻の午前中に、昼間の赤道を通ります。" },
  { noradId: 27424, name: "AQUA", group: "earth-observation", orbit: "leo", about: "NASA's Aqua, Terra's partner, which crosses in the afternoon and watches water in the air, sea and ice.", aboutJa: "Terra の仲間の NASA の Aqua です。午後に通り、空気、海、氷の水を見ています。" },
  { noradId: 39084, name: "LANDSAT 8", group: "earth-observation", orbit: "leo", about: "Landsat 8, part of the longest unbroken record of the Earth's land seen from space, since 1972.", aboutJa: "Landsat 8 です。1972年から続く、宇宙から見た地球の陸の、いちばん長い記録の一部です。" },
  { noradId: 49260, name: "LANDSAT 9", group: "earth-observation", orbit: "leo", about: "Landsat 9, launched 2021, flying half an orbit apart from Landsat 8 so the pair sees any place every eight days.", aboutJa: "2021年に打ち上げた Landsat 9 です。Landsat 8 と半周ずれて飛び、2機で同じ場所を8日ごとに見ます。" },
  { noradId: 40697, name: "SENTINEL-2A", group: "earth-observation", orbit: "leo", about: "One of Europe's Copernicus Sentinel-2 pair that photograph land and coasts in colour.", aboutJa: "ヨーロッパの Copernicus の Sentinel-2 の2機のうちの1機です。陸と海岸をカラーで撮影します。" },
  { noradId: 42063, name: "SENTINEL-2B", group: "earth-observation", orbit: "leo", about: "The other of the Sentinel-2 pair.", aboutJa: "Sentinel-2 の、もう1機です。" },
  { noradId: 39634, name: "SENTINEL-1A", group: "earth-observation", orbit: "leo", about: "A Copernicus radar satellite that sees through cloud and at night.", aboutJa: "雲があっても夜でも見える、Copernicus のレーダー衛星です。" },
  { noradId: 46984, name: "SENTINEL-6A", group: "earth-observation", orbit: "leo", about: "The reference satellite for the height of the sea, higher up than most (about 1,300 km).", aboutJa: "海面の高さを測る基準の衛星です。ほかの多くより高く、約1,300 km にあります。" },
  { noradId: 43613, name: "ICESAT-2", group: "earth-observation", orbit: "leo", about: "NASA's laser satellite that measures the height of ice sheets.", aboutJa: "氷床の高さを測る、NASA のレーザー衛星です。" },
  { noradId: 54754, name: "SWOT", group: "earth-observation", orbit: "leo", about: "A NASA and CNES satellite that measures the height of the water in oceans, lakes and rivers.", aboutJa: "海、湖、川の水面の高さを測る、NASA と CNES の衛星です。" },
  { noradId: 43013, name: "NOAA 20 (JPSS-1)", group: "weather", orbit: "leo", about: "An American polar weather satellite that sees every place on Earth twice a day.", aboutJa: "アメリカの極軌道の気象衛星です。地球のどこでも、1日に2回見ます。" },
  { noradId: 54234, name: "NOAA 21 (JPSS-2)", group: "weather", orbit: "leo", about: "NOAA 20's partner, half an orbit apart.", aboutJa: "NOAA 20 の仲間で、半周ずれて飛びます。" },
  { noradId: 37849, name: "SUOMI NPP", group: "weather", orbit: "leo", about: "The satellite that took the Black Marble night pictures of the Earth's lights.", aboutJa: "地球の夜の明かりの写真、ブラックマーブルを撮った衛星です。" },
  { noradId: 38771, name: "METOP-B", group: "weather", orbit: "leo", about: "One of Europe's Metop polar weather satellites.", aboutJa: "ヨーロッパの極軌道の気象衛星 Metop の1機です。" },
  { noradId: 60133, name: "GOES 19", group: "weather", orbit: "geo", about: "An American weather satellite that sits still over the equator, watching the Americas all day.", aboutJa: "アメリカの気象衛星です。赤道の上で止まって見え、南北アメリカを1日中見ています。" },
  { noradId: 41836, name: "HIMAWARI-9", group: "weather", orbit: "geo", about: "Japan's Himawari (sunflower) weather satellite, sitting still over the western Pacific.", aboutJa: "日本の気象衛星ひまわりです。西太平洋の上で止まって見えます。" },
  { noradId: 54743, name: "METEOSAT-12 (MTG-I1)", group: "weather", orbit: "geo", about: "Europe's newest weather imager, sitting still over the Gulf of Guinea.", aboutJa: "ヨーロッパの新しい気象衛星です。ギニア湾の上で止まって見えます。" },
  { noradId: 41882, name: "FENGYUN 4A", group: "weather", orbit: "geo", about: "A Chinese weather satellite that sits still over the equator.", aboutJa: "赤道の上で止まって見える、中国の気象衛星です。" },
  { noradId: 7530, name: "OSCAR 7 (AO-7)", group: "amateur", orbit: "leo", about: "A radio-amateur satellite launched in 1974 that went silent in 1981 and came back to life in 2002.", aboutJa: "1974年に打ち上げたアマチュア無線の衛星です。1981年に止まり、2002年に動き出しました。" },
  { noradId: 39444, name: "FUNCUBE-1 (AO-73)", group: "amateur", orbit: "leo", about: "A cubesat made for schools, with a radio beacon anyone can listen to.", aboutJa: "学校のために作られた小さな衛星です。だれでも聞ける電波を出しています。" },
  { noradId: 27607, name: "SAUDISAT 1C (SO-50)", group: "amateur", orbit: "leo", about: "A long-lived FM voice repeater that hams use with a handheld radio.", aboutJa: "手持ちの無線機で使える、長く働いている FM の中継衛星です。" },
  { noradId: 44909, name: "RS-44 & BREEZE-KM R/B", group: "amateur", orbit: "leo", about: "A Russian amateur satellite on a higher orbit than most (about 1,500 km), used for long-distance calls.", aboutJa: "ほかより高い、約1,500 km の軌道を回る、ロシアのアマチュア無線の衛星です。遠くの人との交信に使います。" },
  { noradId: 40967, name: "FOX-1A (AO-85)", group: "amateur", orbit: "leo", about: "The first of AMSAT's Fox satellites, built with university students.", aboutJa: "AMSAT の Fox 衛星の1機目です。大学の学生といっしょに作りました。" },
];

/** A name made easy to compare: upper case, letters and digits only. */
const squash = (text: string): string => text.toUpperCase().replace(/[^A-Z0-9]+/g, "");

/**
 * Hiragana readings of the Japanese names already in this catalogue, for a page that indexes by sound.
 * A name that is already kana or Latin has none. These are this package's own readings (NOTICE.md).
 */
const READINGS: Readonly<Record<string, string>> = {
  宇宙ステーション: "うちゅうステーション",
  有名な衛星: "ゆうめいなえいせい",
  科学衛星: "かがくえいせい",
  地球観測: "ちきゅうかんそく",
  気象衛星: "きしょうえいせい",
  静止衛星: "せいしえいせい",
  北斗: "ほくと",
  アマチュア無線: "あまちゅあむせん",
  天宮: "てんぐう",
};

const GROUPS_BY_ID = new Map(SATELLITE_GROUPS.map((group) => [group.id, group]));

/** English and Japanese names. The reading is present only when it adds kana for a name that is not already kana. */
function rowNames(en: string, ja: string): { en: string; ja: string; reading?: string } {
  const reading = READINGS[ja];
  return reading !== undefined && reading !== ja ? { en, ja, reading } : { en, ja };
}

/**
 * Other names already written on the catalogue entry: the catalogue's own name when a short name is shown instead, and a designation written in parentheses.
 * Nothing is added that is not in that name. See NOTICE.md.
 */
function akaOf(entry: CatalogueEntry): string[] | undefined {
  const short = SHORT_NAMES[entry.noradId];
  const en = short?.en ?? entry.name;
  const ja = short?.ja ?? en;
  const extras: string[] = [];
  const add = (name: string): void => {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed === en || trimmed === ja || extras.includes(trimmed)) return;
    extras.push(trimmed);
  };
  if (short) add(entry.name);
  const paren = /\(([^)]+)\)/.exec(entry.name);
  if (paren?.[1]) add(paren[1]);
  return extras.length > 0 ? extras : undefined;
}

/**
 * One plain row a page can index, for its own search box. No DOM: a group or a satellite, with both languages on every row.
 *
 * @example
 * ```ts
 * import type { CatalogueRow } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const row: CatalogueRow = { kind: "group", id: "weather", names: { en: "Weather", ja: "気象衛星" }, orbit: "mixed" };
 * console.log(row.names.ja);
 * ```
 */
export interface CatalogueRow {
  /** `group` for a button's group, `satellite` for one named satellite. */
  kind: "satellite" | "group";
  /** The group's id, or the satellite's NORAD number as a string. */
  id: string;
  /** The NORAD catalogue number. Only a satellite has one. */
  noradId?: number;
  /**
   * Names in both languages. `ja` is the short Japanese name where {@link SHORT_NAMES} has one, and otherwise the English name:
   * a name such as Sentinel-2A is written the same way in Japanese. `reading` is hiragana for a Japanese name that is not already kana.
   */
  names: { en: string; ja: string; reading?: string };
  /** The group's id. Only a satellite has one. */
  group?: string;
  orbit: OrbitKind;
  /** Other names already written in the catalogue, such as HST for Hubble. Absent when there are none. */
  aka?: readonly string[];
}

/**
 * Plain rows for every group and every catalogue satellite, for a page to index. Both languages are on every row: `lang` says which language the page is showing and does not drop the other, so one index serves either.
 * A satellite's Japanese name comes from {@link SHORT_NAMES} where that has one, and is otherwise the English name.
 *
 * @param lang - `en` or `ja`, the language the page is showing. Omit it for the same rows.
 * @returns The groups in their own order, then the satellites in catalogue order.
 * @example
 * ```ts
 * import { catalogueRows } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const hubble = catalogueRows("ja").find((row) => row.noradId === 20580);
 * console.log(hubble?.names.ja, hubble?.aka?.join(", "));
 * ```
 */
export function catalogueRows(lang?: "en" | "ja"): CatalogueRow[] {
  if (lang !== undefined && lang !== "en" && lang !== "ja") throw new TypeError("catalogueRows lang is en or ja");
  const groups: CatalogueRow[] = SATELLITE_GROUPS.map((group) => ({
    kind: "group",
    id: group.id,
    names: rowNames(group.label, group.labelJa),
    orbit: group.orbit,
  }));
  const satellites: CatalogueRow[] = CATALOGUE.map((entry) => {
    const short = SHORT_NAMES[entry.noradId];
    const en = short?.en ?? entry.name;
    const ja = short?.ja ?? en;
    const aka = akaOf(entry);
    const row: CatalogueRow = { kind: "satellite", id: String(entry.noradId), noradId: entry.noradId, names: rowNames(en, ja), group: entry.group, orbit: entry.orbit };
    if (aka) row.aka = aka;
    return row;
  });
  return [...groups, ...satellites];
}

/**
 * Find catalogue entries by name, group name, NORAD number, Japanese name or a group's Japanese label: "hubble", "hst", "25544", "weather" or "ハッブル".
 * An English or numeric query ignores case, spaces and punctuation, as before. Kana and kanji are matched as typed: only letter case and character width are folded (NFKC), and that same width fold is applied before the English comparison.
 * A name that starts with the text comes before one that only has it inside.
 *
 * @param text - What the reader typed.
 * @param limit - The most entries to give back (8 by default).
 * @returns The matching entries, best first; none for empty text.
 * @example
 * ```ts
 * import { findInCatalogue } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(findInCatalogue("sentinel 2").map((entry) => entry.name));
 * console.log(findInCatalogue("ハッブル").map((entry) => entry.name));
 * ```
 */
export function findInCatalogue(text: string, limit = 8): CatalogueEntry[] {
  const source = text.normalize("NFKC");
  const wanted = squash(source);
  const folded = source.toLowerCase().trim();
  const japanese = /[぀-ヿ一-鿿]/.test(source);
  if (!wanted && !japanese) return [];
  const starts: CatalogueEntry[] = [];
  const inside: CatalogueEntry[] = [];
  for (const entry of CATALOGUE) {
    const name = squash(entry.name);
    const englishStart = wanted !== "" && (String(entry.noradId) === wanted || name.startsWith(wanted));
    const englishInside = wanted !== "" && (name.includes(wanted) || squash(entry.group).includes(wanted) || squash(entry.about).includes(wanted));
    const jaName = japanese ? (SHORT_NAMES[entry.noradId]?.ja ?? entry.name).normalize("NFKC").toLowerCase() : "";
    const labelJa = japanese ? (GROUPS_BY_ID.get(entry.group)?.labelJa ?? "").normalize("NFKC").toLowerCase() : "";
    const jaStart = japanese && folded !== "" && jaName.startsWith(folded);
    const jaInside = japanese && folded !== "" && (jaName.includes(folded) || labelJa.includes(folded));
    if (englishStart || jaStart) starts.push(entry);
    else if (englishInside || jaInside) inside.push(entry);
  }
  return [...starts, ...inside].slice(0, limit);
}

/**
 * The catalogue entry for a NORAD number, if there is one.
 *
 * @param noradId - The NORAD catalogue number.
 * @returns The entry, or undefined when the catalogue does not name that satellite.
 * @example
 * ```ts
 * import { catalogueEntry } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(catalogueEntry(25544)?.about);
 * ```
 */
export function catalogueEntry(noradId: number): CatalogueEntry | undefined {
  return CATALOGUE.find((entry) => entry.noradId === noradId);
}
