// The airports on the flat map: which of them to draw at a view (the greater ones when the whole world is in sight, more as the map is zoomed in, never two in one small cell) and what to call one.
// Pure: no DOM and no dependency. The rows themselves (`airports-data.ts`, from OurAirports) are loaded only when a map asks for the airports.
import { pixelsPerDegree, projectFlat, type FlatView } from "./geometry.ts";
import type { FlatLang } from "./words.ts";

/**
 * An airport as the flat map holds it: where it is, its IATA code, its name (OurAirports', in English), its country's ISO code and its tier (1 a large airport, 2 a medium one).
 *
 * @example
 * ```ts
 * import type { Airport } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const narita: Airport = { lon: 140.39, lat: 35.77, iata: "NRT", name: "Narita International Airport", country: "JP", tier: 1 };
 * console.log(narita.iata);
 * ```
 */
export interface Airport {
  lon: number;
  lat: number;
  iata: string;
  name: string;
  country: string;
  tier: 1 | 2;
}

/**
 * The zoom from which the medium airports are drawn as well as the large ones.
 *
 * @example
 * ```ts
 * import { MEDIUM_FROM_ZOOM } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(MEDIUM_FROM_ZOOM);
 * ```
 */
export const MEDIUM_FROM_ZOOM = 3;
/**
 * The zoom from which an airport's code is written beside it.
 *
 * @example
 * ```ts
 * import { CODES_FROM_ZOOM } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(CODES_FROM_ZOOM);
 * ```
 */
export const CODES_FROM_ZOOM = 4;

/**
 * An airport placed on the map: where it falls in the box, in CSS pixels from its top left, and the airport.
 *
 * @example
 * ```ts
 * import type { PlacedAirport } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const at = (one: PlacedAirport): string => `${one.airport.iata} at ${one.x}, ${one.y}`;
 * console.log(typeof at);
 * ```
 */
export interface PlacedAirport {
  x: number;
  y: number;
  airport: Airport;
}

/**
 * The airports to draw for a view: the large ones, and the medium ones from zoom 3, greater first, with no two in one small cell of the box (so the whole world shows its greater airports and a closer map more of them). A world wider than the box shows an airport at the other turn of it too.
 *
 * @param view - The view.
 * @param airports - Every airport, the greater first within a tier (`AIRPORT_ROWS` as `Airport`s).
 * @returns The airports placed in the box.
 *
 * @example
 * ```ts
 * import { placeAirports } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const view = { width: 720, height: 360, centerLon: 0, centerLat: 0, zoom: 1 };
 * const airports = [{ lon: 139.78, lat: 35.55, iata: "HND", name: "Tokyo Haneda Airport", country: "JP", tier: 1 as const }];
 * console.log(placeAirports(view, airports).map((one) => one.airport.iata));
 * ```
 */
export function placeAirports(view: FlatView, airports: readonly Airport[]): PlacedAirport[] {
  const out: PlacedAirport[] = [];
  const codes = view.zoom >= CODES_FROM_ZOOM;
  const cell = codes ? 46 : 16;
  const taken = new Set<number>();
  const turn = 360 * pixelsPerDegree(view);
  const pad = 6;
  for (const airport of airports) {
    if (airport.tier === 2 && view.zoom < MEDIUM_FROM_ZOOM) break;
    const at = projectFlat(view, airport.lon, airport.lat);
    if (at.y < -pad || at.y > view.height + pad) continue;
    for (const x of [at.x - turn, at.x, at.x + turn]) {
      if (x < -pad || x > view.width + pad) continue;
      const key = Math.floor(x / cell) * 4096 + Math.floor(at.y / cell);
      if (taken.has(key)) continue;
      taken.add(key);
      out.push({ x, y: at.y, airport });
    }
  }
  return out;
}

/**
 * What to call an airport: its name, its IATA code and its country, in the page's language (the airport's name is OurAirports', in English; the country's is the package's own, in English or Japanese).
 *
 * @param airport - The airport.
 * @param countryName - The name of its country in the language, or null.
 * @param lang - `en` or `ja`.
 * @returns The line, such as `Narita International Airport (NRT), Japan`.
 *
 * @example
 * ```ts
 * import { airportLine } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const narita = { lon: 140.39, lat: 35.77, iata: "NRT", name: "Narita International Airport", country: "JP", tier: 1 as const };
 * console.log(airportLine(narita, "Japan", "en"), airportLine(narita, "日本", "ja"));
 * ```
 */
export function airportLine(airport: Airport, countryName: string | null, lang: FlatLang): string {
  const country = countryName ?? airport.country;
  return lang === "ja" ? `${airport.name}（${airport.iata}）、${country}` : `${airport.name} (${airport.iata}), ${country}`;
}
