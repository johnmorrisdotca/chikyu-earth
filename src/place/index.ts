// Where a point is on the Earth: the country, the sea or ocean, the continent, and the nearest city.
// Pure. A page that never imports this does not pay for it. The country shapes are Natural Earth 1:110m (chizu's world-geo).
// The seas and continents are the sea-names list. Cities are whoever the caller passes, the same lists here-city uses.
import { SEA_FEATURES } from "../sea-names/features.ts";
import { HERE_CITY_KM, HERE_CITY_MAX_KM, chooseHereCity, hereCountries, type HereTown } from "../markers/here-city.ts";
import { landAt, PLACE_COAST_KM, type LandHit } from "./land.ts";
import { SEA_REACH_KM, waterAt } from "./water.ts";

export { PLACE_COAST_KM, SEA_REACH_KM };

const RAD = Math.PI / 180;

const CONTINENT_ID: Record<string, string> = {
  Africa: "africa",
  Antarctica: "antarctica",
  Asia: "asia",
  Europe: "europe",
  "North America": "north-america",
  "South America": "south-america",
};

/**
 * A named place: an id, and the English and Japanese names.
 *
 * @example
 * ```ts
 * import type { PlaceName } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const pacific: PlaceName = { id: "pacific-ocean", name: "Pacific Ocean", nameJa: "太平洋" };
 * console.log(pacific.name);
 * ```
 */
export interface PlaceName {
  id: string;
  name: string;
  nameJa: string;
}

/**
 * A country from the outlines. `code` is the ISO 3166-1 alpha-2 code, or null where the outline has none.
 *
 * @example
 * ```ts
 * import type { PlaceCountry } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const japan: PlaceCountry = { code: "JP", name: "Japan", nameJa: "日本" };
 * console.log(japan.code);
 * ```
 */
export interface PlaceCountry {
  code: string | null;
  name: string;
  nameJa: string;
}

/**
 * The nearest country when the point is outside every outline and within {@link PLACE_COAST_KM} of one.
 * The 1:110m line is not trusted that close to a coast, so this is not reported as `country`.
 *
 * @example
 * ```ts
 * import type { PlaceNear } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const off: PlaceNear = { code: "JP", name: "Japan", nameJa: "日本", distanceKm: 12 };
 * console.log(off.distanceKm);
 * ```
 */
export interface PlaceNear extends PlaceCountry {
  distanceKm: number;
}

/**
 * The nearest city, from the lists the caller passed. `nameJa` is the short Japanese name, then the Japanese name, and the English name when neither is known.
 * `bearingDeg` is degrees clockwise from north, from the point to the city, or 0 when the city has no coordinates.
 *
 * @example
 * ```ts
 * import type { PlaceCity } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const paris: PlaceCity = { name: "Paris", nameJa: "パリ", countryCode: "FR", distanceKm: 1, bearingDeg: 20 };
 * console.log(paris.name);
 * ```
 */
export interface PlaceCity {
  name: string;
  nameJa: string;
  countryCode: string | null;
  distanceKm: number;
  bearingDeg: number;
}

/**
 * What {@link placeOf} returns. `country` is set only when the point is inside an outline. `near` is set only when it is not, and a country lies within {@link PLACE_COAST_KM}.
 * `sea` is set when `country` is not, and a named water is within its reach. `continent` follows the country or the nearby country, and is null over open water.
 * Oceania is not one of the seven continents in the sea-names list: an island country chizu groups there has `id` `oceania` and chizu's own names. Australia the country uses the Australia continent.
 *
 * @example
 * ```ts
 * import type { PlaceOf } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const empty: PlaceOf = { country: null, near: null, sea: null, continent: null, nearestCity: null };
 * console.log(empty.country);
 * ```
 */
export interface PlaceOf {
  country: PlaceCountry | null;
  near: PlaceNear | null;
  sea: PlaceName | null;
  continent: PlaceName | null;
  nearestCity: PlaceCity | null;
}

/**
 * The city lists for {@link placeOf}. The three tiers here-city loads (capitals, a million, 100,000) match this.
 * `towns` is read only when the caller passes it, and only for the one or two countries those tiers name, the same rule as here-city.
 *
 * @example
 * ```ts
 * import type { PlaceCities } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const cities: PlaceCities = { nearest: () => null };
 * console.log(cities.nearest({ lat: 0, lon: 0 }));
 * ```
 */
export interface PlaceCities {
  nearest(
    point: { lat: number; lon: number },
    options?: { maxKm?: number },
  ): {
    city: { id: string; name: { en: string; ja?: string; jaShort?: string }; country?: string; lat?: number; lon?: number };
    km: number;
  } | null;
  within?(point: { lat: number; lon: number }, maxKm: number): readonly { city: { country?: string }; km: number }[];
}

/**
 * Options for {@link placeOf} and {@link alongTrack}. Without `cities`, `nearestCity` is null. `maxKm` defaults to 100 and is at most 20,000.
 *
 * @example
 * ```ts
 * import type { PlaceOptions } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const options: PlaceOptions = { maxKm: 40 };
 * console.log(options.maxKm);
 * ```
 */
export interface PlaceOptions {
  cities?: PlaceCities;
  towns?: (countryCode: string) => readonly HereTown[];
  maxKm?: number;
}

/**
 * The place a ground track is in at one sample: a country, a country it is only near, or a sea or ocean.
 *
 * @example
 * ```ts
 * import type { TrackPlace } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const france: TrackPlace = { kind: "country", id: "FR", name: "France", nameJa: "フランス" };
 * console.log(france.kind);
 * ```
 */
export interface TrackPlace {
  kind: "country" | "near" | "sea";
  id: string;
  name: string;
  nameJa: string;
}

/**
 * One change along a ground track. `t` is the sample's own time, the first sample where the new place is seen, not a time guessed between samples.
 * The first sample is included, with `leaving` null. `near` is the approaching country.
 *
 * @example
 * ```ts
 * import type { TrackChange } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const change: TrackChange = { t: 0, entering: null, leaving: null };
 * console.log(change.t);
 * ```
 */
export interface TrackChange {
  t: number;
  entering: TrackPlace | null;
  leaving: TrackPlace | null;
}

const empty = (): PlaceOf => ({ country: null, near: null, sea: null, continent: null, nearestCity: null });

const clean = (lon: number, lat: number): { lon: number; lat: number } | null => {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  let x = ((lon + 180) % 360 + 360) % 360 - 180;
  if (x === -180 && lon > 0) x = 180;
  return { lon: x, lat };
};

const countryOf = (hit: LandHit): PlaceCountry => ({ code: hit.code, name: hit.name, nameJa: hit.nameJa });

const kmTo = (lon: number, lat: number, feature: { lon: number; lat: number }): number => {
  const φ1 = lat * RAD;
  const φ2 = feature.lat * RAD;
  const Δφ = (feature.lat - lat) * RAD;
  const Δλ = (feature.lon - lon) * RAD;
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** A country chizu puts in one continent can still reach into another (eastern Russia, French Guiana). Use the nearer continent point when it is this much closer. */
const CONTINENT_SHIFT_KM = 2500;

const named = (feature: { id: string; name: { en: string; ja: string } }): PlaceName => ({ id: feature.id, name: feature.name.en, nameJa: feature.name.ja });

const continentOf = (hit: LandHit, lon: number, lat: number): PlaceName | null => {
  const continents = SEA_FEATURES.filter((one) => one.kind === "continent");
  if (hit.code === "AU") {
    const australia = continents.find((one) => one.id === "australia");
    return australia ? named(australia) : null;
  }
  if (hit.group === "Oceania") return { id: "oceania", name: "Oceania", nameJa: hit.groupJa || "オセアニア" };
  let nearest = continents[0];
  let nearestKm = nearest ? kmTo(lon, lat, nearest) : Number.POSITIVE_INFINITY;
  for (const feature of continents.slice(1)) {
    const km = kmTo(lon, lat, feature);
    if (km < nearestKm) {
      nearest = feature;
      nearestKm = km;
    }
  }
  const grouped = continents.find((one) => one.id === CONTINENT_ID[hit.group]);
  if (!grouped) return nearest ? named(nearest) : null;
  const feature = kmTo(lon, lat, grouped) - nearestKm >= CONTINENT_SHIFT_KM && nearest ? nearest : grouped;
  return named(feature);
};

const bearingDeg = (fromLon: number, fromLat: number, toLon: number, toLat: number): number => {
  const φ1 = fromLat * RAD;
  const φ2 = toLat * RAD;
  const Δλ = (toLon - fromLon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
};

const cityOf = (lon: number, lat: number, options: PlaceOptions | undefined): PlaceCity | null => {
  const cities = options?.cities;
  if (!cities) return null;
  const maxKm = Math.min(HERE_CITY_MAX_KM, options?.maxKm ?? HERE_CITY_KM);
  if (!(maxKm > 0)) return null;
  const point = { lat, lon };
  const coarse = cities.nearest(point, { maxKm });
  const townsOf = options?.towns;
  const towns = townsOf ? hereCountries(point, cities, maxKm).flatMap((code) => townsOf(code) ?? []) : [];
  const chosen = chooseHereCity(point, coarse, towns, maxKm);
  if (!chosen) return null;
  const town = towns.find((one) => one.id === chosen.id);
  const at = town ?? (coarse && coarse.city.id === chosen.id ? coarse.city : undefined);
  const countryCode = (town?.country ?? coarse?.city.country ?? "").trim().toUpperCase() || null;
  const nameJa = chosen.name.jaShort || chosen.name.ja || chosen.name.en;
  const cityLat = at?.lat;
  const cityLon = at?.lon;
  const bearing = cityLat !== undefined && cityLon !== undefined && Number.isFinite(cityLat) && Number.isFinite(cityLon) ? bearingDeg(lon, lat, cityLon, cityLat) : 0;
  return { name: chosen.name.en, nameJa, countryCode, distanceKm: chosen.km, bearingDeg: bearing };
};

const headline = (place: PlaceOf): TrackPlace | null => {
  if (place.country) return { kind: "country", id: place.country.code ?? place.country.name, name: place.country.name, nameJa: place.country.nameJa };
  if (place.near) return { kind: "near", id: place.near.code ?? place.near.name, name: place.near.name, nameJa: place.near.nameJa };
  if (place.sea) return { kind: "sea", id: place.sea.id, name: place.sea.name, nameJa: place.sea.nameJa };
  return null;
};

const same = (a: TrackPlace | null, b: TrackPlace | null): boolean => a?.kind === b?.kind && a?.id === b?.id;

/**
 * The country, sea or ocean, continent and nearest city at one point.
 * Countries are the line globe's outlines, Natural Earth at 1:110m. A point inside an outline is `country`.
 * A point outside every outline and within {@link PLACE_COAST_KM} (50 km) of one is `near` instead: the coarse coast is not reported as a country.
 * The sea is the nearest named sea, gulf, bay or ocean within its reach ({@link SEA_REACH_KM}); a smaller water's point is nearer, so it wins over the ocean. It is null while `country` is set, and null when no water is within reach.
 * The continent is the country's group in the outlines, named as in the sea-names list. Australia the country uses that continent, not the Oceania group. A point whose continent point is at least 2,500 km nearer than its country's group (eastern Russia, French Guiana) uses the nearer one. The city lists are the caller's: without `cities`, `nearestCity` is null.
 * Towns under 100,000 are read only when `towns` is passed. The outlines are indexed on a 15° grid so a call is cheap enough to make about once a second.
 *
 * @param lon - Degrees east. A value outside -180 to 180 is wrapped.
 * @param lat - Degrees north, -90 to 90.
 * @param options - City lists and the kilometre limit. Omit them to skip the city.
 * @returns The place. Every field is null when `lat` is not a latitude.
 *
 * @example
 * ```ts
 * import { placeOf } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * console.log(placeOf(2.35, 48.86).country?.code);
 * console.log(placeOf(-150, 0).sea?.id);
 * console.log(placeOf(0, 90).country);
 * ```
 */
export function placeOf(lon: number, lat: number, options?: PlaceOptions): PlaceOf {
  const at = clean(lon, lat);
  if (!at) return empty();
  const land = landAt(at.lon, at.lat);
  const held = land.country ?? land.near;
  const water = land.country ? null : waterAt(at.lon, at.lat);
  return {
    country: land.country ? countryOf(land.country) : null,
    near: land.near ? { ...countryOf(land.near), distanceKm: land.near.distanceKm } : null,
    sea: water ? { id: water.id, name: water.name.en, nameJa: water.name.ja } : null,
    continent: held ? continentOf(held, at.lon, at.lat) : null,
    nearestCity: cityOf(at.lon, at.lat, options),
  };
}

/**
 * The ordered changes of place along a ground track. Each point is `{ lon, lat, t }`.
 * A change is reported at the sample that entered the new place. `near` is how a page says the track is approaching a country; the next sample inside it is the country itself.
 *
 * @param points - The track, in order. A point with no latitude is skipped.
 * @param options - The same city lists as {@link placeOf}. They do not change the country or the sea.
 * @returns One row for the first sample, then one row each time the country, the nearby country or the sea changes.
 *
 * @example
 * ```ts
 * import { alongTrack } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * const rows = alongTrack([
 *   { lon: -40, lat: 40, t: 0 },
 *   { lon: -3.7, lat: 40.4, t: 1 },
 *   { lon: 2.35, lat: 48.86, t: 2 },
 * ]);
 * console.log(rows.map((row) => row.entering?.id).join(" "));
 * ```
 */
export function alongTrack(points: readonly { lon: number; lat: number; t: number }[], options?: PlaceOptions): TrackChange[] {
  const out: TrackChange[] = [];
  let previous: TrackPlace | null = null;
  let started = false;
  for (const point of points) {
    if (!Number.isFinite(point.t)) continue;
    const place = placeOf(point.lon, point.lat, options);
    if (!Number.isFinite(point.lon) || !Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) continue;
    const next = headline(place);
    if (!started) {
      out.push({ t: point.t, entering: next, leaving: null });
      previous = next;
      started = true;
      continue;
    }
    if (same(previous, next)) continue;
    out.push({ t: point.t, entering: next, leaving: previous });
    previous = next;
  }
  return out;
}
