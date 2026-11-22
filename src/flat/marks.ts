// What the flat map's own marks (the Sun overhead, the reader's place) say about themselves: where a point is, in words. Pure: numbers in, text out.
import { geoContains } from "d3-geo";
import { COUNTRIES } from "../countries.ts";
import { SEA_FEATURES } from "../sea-names/features.ts";
import type { FlatLang } from "./words.ts";

const RAD = Math.PI / 180;

/**
 * A place on the Earth in words that a reader can find on the map: `23°S 15°W`, in Japanese `南緯23° 西経15°`. Whole degrees; the equator and the Greenwich meridian are `0°`.
 *
 * @param lon - Degrees east.
 * @param lat - Degrees north.
 * @param lang - `en` or `ja`.
 * @returns The text.
 *
 * @example
 * ```ts
 * import { pointText } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(pointText(-15, -23, "en"), pointText(139.7, 35.7, "ja"));
 * ```
 */
export function pointText(lon: number, lat: number, lang: FlatLang): string {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  const la = Math.round(Math.abs(lat));
  const lo = Math.round(Math.abs(wrapped));
  const south = la !== 0 && lat < 0;
  const north = la !== 0 && lat >= 0;
  const east = lo !== 0 && lo !== 180 && wrapped > 0;
  const west = lo !== 0 && lo !== 180 && wrapped <= 0;
  if (lang === "ja") return `${south ? "南緯" : north ? "北緯" : ""}${la}° ${east ? "東経" : west ? "西経" : ""}${lo}°`;
  return `${la}°${south ? "S" : north ? "N" : ""} ${lo}°${east ? "E" : west ? "W" : ""}`;
}

/** How far (degrees) from its label point a name is taken to reach, by what it names: an ocean reaches further than a gulf. */
const REACH: Readonly<Record<string, number>> = { ocean: 40, sea: 14, gulf: 9, bay: 9 };

/** The great-circle distance between two points, degrees. */
const apart = (lon1: number, lat1: number, lon2: number, lat2: number): number => {
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / RAD;
};

/**
 * What a point is over, as a name: the country it is in (Natural Earth's outlines, as the map draws them), else the ocean, sea, gulf or bay whose label point is nearest in proportion to how far that kind of name reaches. Null when there is none within reach (the polar caps).
 *
 * @param lon - Degrees east.
 * @param lat - Degrees north.
 * @param lang - `en` or `ja`.
 * @returns The name, or null.
 *
 * @example
 * ```ts
 * import { placeOver } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(placeOver(139.7, 35.7, "en"), placeOver(-15, -23, "en"), placeOver(-15, -23, "ja"));
 * ```
 */
export function placeOver(lon: number, lat: number, lang: FlatLang): string | null {
  for (const feature of COUNTRIES.features) {
    if (geoContains(feature, [lon, lat])) return (lang === "ja" ? feature.properties.ja : null) ?? feature.properties.name;
  }
  let best: { name: string; score: number } | null = null;
  for (const one of SEA_FEATURES) {
    const reach = REACH[one.kind];
    if (reach === undefined) continue;
    const score = apart(lon, lat, one.lon, one.lat) / reach;
    if (score <= 1 && (best === null || score < best.score)) best = { name: one.name[lang] || one.name.en, score };
  }
  return best?.name ?? null;
}
