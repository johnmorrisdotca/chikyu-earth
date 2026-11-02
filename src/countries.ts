// The country outlines: chizu's world-geo (Natural Earth 1:110m, WGS84 longitude and latitude) shaped for the globe.
// Names are chizu's own English and Japanese; the alpha-2 code is its two-letter code, null for the three places with none.
import WORLD_GEO from "@johnmorrisdotca/chizu/world-geo";
import type { FeatureCollection, Geometry } from "geojson";
import type { CountryProps } from "./types.ts";

export const COUNTRIES: FeatureCollection<Geometry, CountryProps> = {
  type: "FeatureCollection",
  features: WORLD_GEO.features.map((feature) => ({
    type: "Feature",
    geometry: feature.geometry as Geometry,
    properties: {
      name: feature.properties.name,
      ja: feature.properties.nameJa || null,
      alpha2: feature.properties.code.length === 2 ? feature.properties.code : null,
    },
  })),
};
