# Notice

Chikyu Earth is original work by John Morris, under the MIT licence in `LICENSE`.

## Country outlines

The country boundaries are **Natural Earth** (https://www.naturalearthdata.com), the 1:110m
admin-0 countries, which Natural Earth places in the **public domain**
(https://www.naturalearthdata.com/about/terms-of-use/). They reach this package through
**world-atlas** (https://github.com/topojson/world-atlas), converted from TopoJSON to GeoJSON at
build time by `scripts/make-countries.ts` and baked into the package, so nothing is fetched at runtime.

## Country names and codes

Each outline's English name, Japanese name and ISO 3166-1 alpha-2 code come from **kuni**
(https://github.com/johnmorrisdotca/kuni), also by John Morris, matched by ISO numeric id at build time.

## Projection

The orthographic projection, the spherical clipping and the SVG path generation are **d3-geo**
(https://github.com/d3/d3-geo), by Mike Bostock, under the ISC licence (see `LICENSES/d3-geo.txt`).
d3-geo is the package's one runtime dependency.

## Marks

No country flags, emblems, coats of arms or other official marks are drawn. Country names appear only
as plain descriptive words. All trademarks belong to their owners; this project is not affiliated with,
sponsored by or endorsed by any of them.
