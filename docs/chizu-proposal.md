# A chizu longitude/latitude export for chikyu-earth

**Status: done.** chizu 1.6.0 shipped `@johnmorrisdotca/chizu/world-geo` (177 features, the four extra places included,
so there was no count difference to reconcile), and chikyu-earth 0.4.0 uses it. What follows is the record from before.

## Decision

Chikyu-earth keeps its own Natural Earth 1:110m GeoJSON and d3-geo for now. Chizu 1.5.1 cannot replace that data:
its world export is already projected onto a flat canvas, while an orthographic globe needs spherical
longitude/latitude geometry. Kuni remains codes, names and facts; no shapes move there.

## What the npm package actually holds

This was checked from `npm pack @johnmorrisdotca/chizu@1.5.1`, not from another working repository.

- `dist/world-entry.d.ts` describes Natural Earth 1:110m in **Miller's projection centred on 155°E**.
- `dist/data/world.data.js` has `projection: { kind: "miller", centre: 155, scale: 159.15, ... }`, a
  `0 0 1000 489` viewBox, and each region's outline as an SVG canvas `path`.
- Its source line is `Natural Earth 5.1.2 admin-0 countries, 1:110m, Miller cylindrical centred on 155°E`.
- The file is 201,950 bytes (62,607 gzipped) and contains 173 regions. Chikyu's baked module is 154,472 bytes
  (43,754 gzipped) and contains 177 GeoJSON features, so a shared export also needs to reconcile that region-count
  difference rather than silently changing the globe's coverage.
- `projectPoint`/`unprojectPoint` can convert individual canvas points, but repeatedly unprojecting rounded,
  clipped, date-line-cut SVG paths is lossy and is not a sound source of spherical polygons. There is no exported
  longitude/latitude FeatureCollection in the package.

## Proposed export: `@johnmorrisdotca/chizu/world-geo`

Add a data-only entry beside `world`, generated from the same Natural Earth source before the Miller projection:

```ts
import WORLD_GEO, { WORLD_GEO as worldGeo } from "@johnmorrisdotca/chizu/world-geo";

WORLD_GEO.source;                    // "Natural Earth 5.1.2 admin-0 countries, 1:110m"
WORLD_GEO.features[0].properties;   // { code, name, nameJa, iso3 }
WORLD_GEO.features[0].geometry;     // GeoJSON Polygon | MultiPolygon, [lon, lat] in degrees
```

The entry should default-export and named-export a GeoJSON `FeatureCollection` with:

- WGS84 longitude/latitude coordinates in degrees, in `[longitude, latitude]` order; no Miller coordinates, canvas
  units, 155°E rotation, projection metadata or SVG path strings.
- `Polygon`/`MultiPolygon` geometry suitable for `d3-geo`'s orthographic projection and spherical clipping. Preserve
  rings through the date line and poles rather than cutting them to the flat map's seam.
- `properties.code` as ISO 3166-1 alpha-2, `properties.iso3` as alpha-3, `properties.name` in English and
  `properties.nameJa` in Japanese from kuni, matching chizu's existing identities.
- Top-level `source`, including the Natural Earth version and scale, so provenance and a later data update are
  explicit. Optional per-feature numeric ISO ids are fine but not required.
- No runtime dependency and no network read: the geometry is baked into the ES module, like chizu's existing maps.

### Size and packaging

At chikyu's current one-decimal coordinate rounding, the module should be about **150–210 KB uncompressed and
44–63 KB gzipped**, using the two measured files above as the bounds. Publish the actual byte and gzip sizes in
chizu's package checks. Keep it a separate subpath so flat-map consumers do not download a second copy of the world.

## Later migration in chikyu-earth

1. Reconcile chizu's 173 regions with chikyu's 177 features and record any additions or omissions.
2. Replace `src/data/countries.ts` with a small adapter from `WORLD_GEO` to chikyu's `CountryProps` (`name`, `ja`,
   `alpha2`), keeping `COUNTRIES` and `countryList()` unchanged for callers.
3. Compare the rendered globe at the home view, both poles, the date line and 2× zoom; run the unit and browser
   suites.
4. Remove the `world-atlas`/`topojson-client` build tooling only after the new data has passed those checks. Keep
   d3-geo and all kazoku-ui controls unchanged.
