// Which named sea or ocean a point is over. The names and their points are the sea-names list.
// A sea, gulf or bay wins when the point is within that water's reach of its point, and nearer to it than to any other such water.
// An ocean wins the same way, with a wider reach. The ocean points sit in the middle of each basin, so a point is that ocean only when it is closer to that point than to another ocean's and still inside the reach. A Voronoi of the five points would call the North Atlantic the Arctic, because the Atlantic's point is near the equator.
import type { SeaFeature } from "../sea-names/geometry.ts";
import { SEA_FEATURES } from "../sea-names/features.ts";

const RAD = Math.PI / 180;
const MEAN_RADIUS_KM = 6371.0088;

/**
 * How far from a sea, gulf or bay's own point, in kilometres, a point still counts as that water.
 * Each reach is wide enough to cover that water and short of the next named water's point.
 *
 * @example
 * ```ts
 * import { SEA_REACH_KM } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * console.log(SEA_REACH_KM["sea-of-japan"] > 0);
 * ```
 */
export const SEA_REACH_KM: Readonly<Record<string, number>> = {
  "arctic-ocean": 3500,
  "southern-ocean": 5500,
  "atlantic-ocean": 10000,
  "pacific-ocean": 12000,
  "indian-ocean": 7000,
  "black-sea": 650,
  "philippine-sea": 1600,
  "tasman-sea": 1100,
  "bay-of-bengal": 1300,
  "south-china-sea": 1400,
  "arabian-sea": 1400,
  "beaufort-sea": 800,
  "caribbean-sea": 1200,
  "gulf-of-mexico": 900,
  "labrador-sea": 800,
  "hudson-bay": 700,
  "caspian-sea": 650,
  "baffin-bay": 800,
  "gulf-of-alaska": 800,
  "red-sea": 1100,
  "sea-of-okhotsk": 900,
  "weddell-sea": 1400,
  "persian-gulf": 450,
  "mediterranean-sea": 1800,
  "ross-sea": 900,
  "coral-sea": 1200,
  "sea-of-japan": 800,
};

const waters = SEA_FEATURES.filter((one) => one.kind !== "continent");

const kmBetween = (lon: number, lat: number, feature: SeaFeature): number => {
  const φ1 = lat * RAD;
  const φ2 = feature.lat * RAD;
  const Δφ = (feature.lat - lat) * RAD;
  const Δλ = (feature.lon - lon) * RAD;
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * MEAN_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** The named sea, gulf, bay or ocean a point is over, or null when none is within its reach. A smaller water's point is nearer, so it wins over an ocean. */
export function waterAt(lon: number, lat: number): SeaFeature | null {
  let best: { feature: SeaFeature; km: number } | null = null;
  for (const feature of waters) {
    const reach = SEA_REACH_KM[feature.id] ?? 0;
    const km = kmBetween(lon, lat, feature);
    if (km <= reach && (!best || km < best.km)) best = { feature, km };
  }
  return best?.feature ?? null;
}
