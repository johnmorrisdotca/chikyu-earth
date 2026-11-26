// The names of the regions (provinces, states, prefectures) on the Earth, over the picture of an element: the countries' names' layer, with the regions of each country handed in by the borders as they arrive.
// Nothing is loaded here and nothing is added to the shadow root until `region-names` is set and the regions are showing.
import type { BorderFeature, BorderShapes } from "../borders/lines.ts";
import { namesStyle, type NamesLayer } from "../country-names/host.ts";
import type { NamedShape } from "../country-names/geometry.ts";

/**
 * The attributes the region names read: `region-names`.
 *
 * @example
 * ```ts
 * import { REGION_NAMES_ATTRIBUTES } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(REGION_NAMES_ATTRIBUTES.join(" "));
 * ```
 */
export const REGION_NAMES_ATTRIBUTES = ["region-names"] as const;

/** What makes the regions' layer different from the countries': its attribute, box, class and variables, English names in the page's own case, and smaller text. */
export const REGION_LAYER: NamesLayer = { attribute: "region-names", id: "rg-names", className: "rg-name", word: "region", capitals: false, sizes: { smallest: 9, largest: 13 }, incremental: true };

/** The styles of the layer, for an element to add to its own (`#rg-names` and the names in its shadow root). */
export const REGION_NAMES_STYLE = namesStyle(REGION_LAYER, 500);

/**
 * Turns a country's regions, as chizu's `divisions-geo` has them (or a page's `borderData.regions` gives them), into the shapes the names are made from: each named by its own `name` and `nameJa`,
 * and told apart by its `iso` (the region's own code), since `code` is its country's. A region with no name is passed over.
 *
 * @param shapes - One country's regions.
 * @returns The shapes to name.
 *
 * @example
 * ```ts
 * import { regionShapes } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const hokkaido = { properties: { code: "JP", iso: "JP-01", name: "Hokkaido", nameJa: "北海道" }, geometry: { type: "Polygon", coordinates: [[[140, 42], [144, 42], [144, 45], [140, 45], [140, 42]]] } };
 * console.log(regionShapes({ features: [hokkaido] }).map((one) => one.properties?.code));
 * ```
 */
export function regionShapes(shapes: BorderShapes): NamedShape[] {
  const out: NamedShape[] = [];
  for (const feature of shapes.features as readonly BorderFeature[]) {
    const name = feature.properties?.name;
    if (!name) continue;
    out.push({ properties: { code: feature.properties?.iso ?? `${feature.properties?.code ?? ""}-${name}`, name, nameJa: feature.properties?.nameJa ?? null }, geometry: feature.geometry });
  }
  return out;
}
