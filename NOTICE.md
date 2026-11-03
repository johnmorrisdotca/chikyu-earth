# Notice

Chikyu Earth is original work by John Morris, under the MIT licence in `LICENSE`.

## Country outlines

The country boundaries are **Natural Earth** (https://www.naturalearthdata.com), the 1:110m
admin-0 countries, which Natural Earth places in the **public domain**
(https://www.naturalearthdata.com/about/terms-of-use/). They reach this package through **chizu**
(https://github.com/johnmorrisdotca/chizu, MIT, by John Morris), whose `world-geo` entry
(`@johnmorrisdotca/chizu/world-geo`) holds them as longitude and latitude; nothing is fetched at runtime.

## Country names and codes

Each outline's English name, Japanese name and country code come from **chizu**'s `world-geo`, whose names are
**kuni**'s (https://github.com/johnmorrisdotca/kuni, also by John Morris) and Unicode CLDR's
(https://www.unicode.org/license.txt) and Wikidata's (CC0). chizu's own NOTICE.md has the terms.

## The realistic Earth's pictures

The pictures in `textures/` (and `dist/textures/`) are made by `scripts/make-textures.py` from four NASA Earth Observatory images, resized and
re-encoded as WebP. NASA says its content "generally are not subject to copyright in the United States" and asks that "NASA should be acknowledged as the
source of the material" (https://www.nasa.gov/nasa-brand-center/images-and-media/, read 2026-11-02). These are NASA's own images, not third-party
material, so no other licence applies. This package is not endorsed by NASA and uses none of NASA's insignia or logotype.

| Picture | Source | Credit |
|---|---|---|
| `day-*.webp` | Blue Marble: Next Generation with topography and bathymetry, September 2004, 5400 x 2700 (https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73801/world.topo.bathy.200409.3x5400x2700.jpg, Visible Earth 73801) | NASA Earth Observatory (Reto Stöckli, Blue Marble Next Generation) |
| `water-*.webp` | made by `scripts/make-textures.py` from the day picture: where it is blue and dark | as above |
| `night-*.webp` | Earth at Night, Black Marble 2016 color map at 0.1 degree, 3600 x 1800 (https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg, Visible Earth 144898) | NASA Earth Observatory, Suomi NPP VIIRS data (Miguel Roman, NASA's Goddard Space Flight Center) |
| `clouds-*.webp` | Blue Marble clouds, 2048 x 1024 (https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg, Visible Earth 57747) | NASA Earth Observatory (Reto Stöckli) |

The credit names are NASA's usual lines for these series; the Visible Earth pages (now at science.nasa.gov/earth/earth-observatory) did not show a credit line in the
text read on 2026-11-02, so check them if you need the exact wording for print.

## The Moon's picture

`moon-*.webp` is made by `scripts/make-textures.py` from NASA's Scientific Visualization Studio item 4720, "Moon: LROC colour mosaic" (https://svs.gsfc.nasa.gov/4720/,
`lroc_color_2k.jpg`), a natural-colour mosaic of the Lunar Reconnaissance Orbiter's wide-angle camera (Arizona State University and NASA/GSFC). NASA's page asks: "Please give credit for this
item to: NASA's Scientific Visualization Studio" (Visualizer Ernie Wright, USRA; Scientist Noah Petro, NASA/GSFC). Same NASA terms as above.

## The planets' places

`<chikyu-space>` computes positions with **astronomy-engine** (https://github.com/cosinekitty/astronomy, MIT, copyright Don Cross), the page's own optional peer dependency: this package does not
bundle or ship it. The planets are drawn as plain colours, from no picture.

## Satellites

`<chikyu-space>` draws satellites from orbital elements that **your page** passes in; this package fetches and ships none. SGP4 is run by **satellite.js** (https://github.com/shashwatak/satellite-js, MIT, by
Shashwat Kandadai and contributors), the page's own optional peer dependency: this package does not bundle or ship it.

The demo's files `demo/elements/*.json` (the demo site only, not the npm package) hold element sets, one file for each of fourteen groups, from one download of each of CelesTrak's lists on 2026-11-03 (about 16:00 UTC), with every fifth
Starlink satellite kept (2,231 of 11,155), within the same usage policy, credited the same way and with the same grey tier. `demo/celestrak-snapshot.json` below is the older snapshot of 2026-11-02 that the embed page and some tests still read. It holds element sets from **CelesTrak** (https://celestrak.org, T.S. Kelso), which serves the U.S. Space Force's
18th Space Defense Squadron's general-perturbation (GP) data and, for Starlink, SpaceX's own supplemental elements. It is one download of the `stations` list and one of the `starlink` list on 2026-11-02
(about 17:07 UTC), within CelesTrak's usage policy (https://celestrak.org/usage-policy.php, read 2026-11-02: one download per update per list, nothing fetched at a visitor's request), with every fifth Starlink satellite
kept (2,232 of 11,156), as numbers only. CelesTrak states no licence or credit rule for the data; it is credited on the demo page, and the demo shows the age of the elements. The tier is "grey" in John's
terms: a snapshot with credit, never a live fetch. The catalogue (`src/satellites/catalogue.ts`) holds names, NORAD numbers and orbit kinds, which are facts, and lines written for this package in its own words (English and Japanese); nothing is copied from NASA, ESA, Wikipedia or any other page. Space-Track's data are not used (it needs an account; its user agreement allows passing on basic data such as TLEs and OMMs only with a citation). docs/satellite-sources.md has every source's terms, read 2026-11-03.

## Sun position

`src/realistic/sun.ts` uses the low-precision solar position formulas of NOAA's solar calculator (https://gml.noaa.gov/grad/solcalc/, after Jean Meeus,
*Astronomical Algorithms*). Formulas are not copyrightable; the code is this package's own and MIT.

## three.js

The realistic look draws with three.js (https://threejs.org, MIT, copyright the three.js authors), the page's own optional peer dependency; this package
does not bundle or ship it.

## Projection

The orthographic projection, the spherical clipping and the SVG path generation are **d3-geo**
(https://github.com/d3/d3-geo), by Mike Bostock, under the ISC licence (see `LICENSES/d3-geo.txt`).
d3-geo is the package's projection dependency.

## Shared view controls

The turn, tilt, zoom, pan and touch controls are **kazoku-ui** (https://github.com/johnmorrisdotca/kazoku-ui),
also by John Morris, under the MIT licence. Its shared 3D renderer draws the realistic Earth.

## Marks

No country flags, emblems, coats of arms or other official marks are drawn. Country names appear only
as plain descriptive words. All trademarks belong to their owners; this project is not affiliated with,
sponsored by or endorsed by any of them.
