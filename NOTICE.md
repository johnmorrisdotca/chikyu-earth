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

## The Earth tiles

`scripts/make-earth-tiles.py` cuts two bigger NASA maps into a pyramid of 512 px WebP tiles (docs/guides/earth-tiles.md). The tiles are built in CI and served by GitHub Pages beside the demo at `/tiles/`; they are not in git and not in the npm package. Terms, read on 2026-11-08 at https://www.nasa.gov/nasa-brand-center/images-and-media/ (NASA Images and Media Usage Guidelines): "NASA content – images, audio, video, and media files used in the rendition of 3-dimensional models, such as texture maps and polygon data in any format – generally are not subject to copyright in the United States." and "NASA should be acknowledged as the source of the material." The same page says third-party material NASA uses with permission is marked as copyright protected with the holder's name; neither source below is marked so. Not endorsed by NASA; no NASA insignia or logotype is used.

| Layer | Source | Credit |
|---|---|---|
| `day` (levels 0 to 4, up to 16384 x 8192) | Blue Marble: Next Generation with topography and bathymetry, September 2004, 21600 x 10800 (https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/september/world.topo.bathy.200409.3x21600x10800.jpg, SHA-256 863036b622ba3dab4eb4ffb7149730b02cfa433ce49672e9b7267022051e04a2); the same month as `day-*.webp` | "NASA Earth Observatory": the page https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ (read 2026-11-08) says "Anyone using or republishing Blue Marble: Next Generation please credit “NASA Earth Observatory.”" It was produced by Reto Stöckli, NASA Earth Observatory (NASA Goddard Space Flight Center). |
| `night` (levels 0 to 3, up to 8192 x 4096) | Earth at Night, Black Marble 2016 colour map at 3 km, 13500 x 6750 (https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg, SHA-256 230aac448ae68c358be433dd518888cccb3a85ccf66f7b44326441c324ad6725; page https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/, read 2026-11-08) | NASA Earth Observatory, Suomi NPP VIIRS data (the page names no further credit line in its text; check it for print) |

The bathymetry-free Blue Marble maps (base map, and base map with topography, on the same Blue Marble page) fall under the same NASA terms; the tiles use the one with bathymetry, as `day-*.webp` does. The clouds are not tiled: NASA's sharper cloud files (Visible Earth 57747, once at eoimages.gsfc.nasa.gov) are no longer served, and the Blue Marble 2002 page (https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) offers only the 2048 picture already in `clouds-2048.webp`.

Where the pyramid is hosted: GitHub Pages of this public repository, which costs nothing (docs/guides/earth-tiles.md). It adds 852 files and 10.3 MB to the site.

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
Starlink satellite kept (2,231 of 11,155), within the same usage policy, credited the same way and with the same grey tier. The files are refreshed by a scheduled build every six hours (`.github/workflows/pages.yml`, `scripts/elements.ts`), one download of each list each time, within the same policy; `test/recorded/celestrak-snapshot-2026-11-02.json` below is the older snapshot of 2026-11-02, kept only for the tests. It holds element sets from **CelesTrak** (https://celestrak.org, T.S. Kelso), which serves the U.S. Space Force's
18th Space Defense Squadron's general-perturbation (GP) data and, for Starlink, SpaceX's own supplemental elements. It is one download of the `stations` list and one of the `starlink` list on 2026-11-02
(about 17:07 UTC), within CelesTrak's usage policy (https://celestrak.org/usage-policy.php, read 2026-11-02: one download per update per list, nothing fetched at a visitor's request), with every fifth Starlink satellite
kept (2,232 of 11,156), as numbers only. CelesTrak states no licence or credit rule for the data; it is credited on the demo page, and the demo shows the age of the elements. The tier is "grey" in John's
terms: a snapshot with credit, never a live fetch. The catalogue (`src/satellites/catalogue.ts`) holds names, NORAD numbers and orbit kinds, which are facts, and lines written for this package in its own words (English and Japanese); nothing is copied from NASA, ESA, Wikipedia or any other page. docs/satellite-sources.md has every source's terms, read 2026-11-03.

The same build may take a group's element sets from **Space-Track.org** (https://www.space-track.org, U.S. Space Command) when CelesTrak has left the group more than 12 hours old, at most once a day, through its API with John Morris's own account (the login is a repository secret, never in a file). The group's file and `manifest.json` say `"source": "spacetrack"` and the demo says so under the globe. The citation is **"Data from Space-Track.org (USSPACECOM)"**. Terms: the documentation page https://www.space-track.org/documentation, section "Redistribution of Basic SSA Information", read 2026-11-08: "USSPACECOM has provided express blanket approval for transfer/redistribution of basic SSA data and services accessed via www.Space-Track.org conditioned on appropriate citation." Basic SSA data are "Two-Line Elements (TLEs) and Orbital Mean-element Messages (OMMs); SATCAT; and Satellite Decay and Reentry Data." (The page needs a browser; the section was read through a page-reading tool, which returned each sentence in quoted pieces. TODO: John or a browser check of the section's wording.) The page gives no citation form, so this sentence is the package's own. The package ships none of these element sets.

## Satellite passes

`src/passes/` (the `/passes` entry and `<chikyu-passes>`) works out passes with SGP4 by **satellite.js** (see Satellites above), this package's own Sun position (see Sun position above) and a cylinder of the Earth's shadow; the code is this package's own and MIT. The brightness is a model of this package's own: the phase function of a diffuse (Lambertian) sphere, a textbook result, with the standard magnitude (brightness from 1000 km with half of the satellite lit, the convention satellite observers use) worked out from the Sun's apparent magnitude of -26.74 (the IAU's 2015 nominal solar values), an assumed albedo of 0.2 and a rough average cross-section for each of the ISS (2,000 square metres), Tianhe (200) and the Hubble Space Telescope (70). The cross-sections are this package's own rough estimates, made from the sizes the space agencies publish (for the ISS, NASA's "Space Station Facts and Figures" page, read 2026-11-09: solar array length 73 m, wingspan 109 m, truss 94 m); they are not measurements, and no observer's table of standard magnitudes is used or kept.

The tests' references (`test/recorded/`, never in the npm package; `scripts/passes-reference.py` makes the first):

- `passes-skyfield-2026-11-09.json`: times, directions, heights, distances, Sun altitudes and sunlight computed on 2026-11-09 with **Skyfield** (https://rhodesmill.org/skyfield/, MIT, by Brandon Rhodes), the Python **sgp4** package (MIT, by the same author, from David Vallado's reference code) and NASA JPL's DE421 planetary ephemeris (public domain, https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de421.bsp, not kept in the repository). Numbers only.
- `passes-elements-2026-11-09.json`: one element set each of the ISS, Tianhe and Hubble from **CelesTrak** (https://celestrak.org), one download of each on 2026-11-09 about 17:01 UTC, within its usage policy (see Satellites above).

The guide says that the results were also compared by hand on 2026-11-09 with the published predictions of a sky-watching site. None of that site's data, text or design is in this repository: the figures were read once for the comparison and kept outside it.

The demo's `elements/bright.json` is made by the scheduled build from the files described under Satellites, with the same source, citation and grey tier.

## Space Shuttle missions

`src/satellites/missions-data.ts` (in the package) holds the 135 Space Shuttle flights, STS-1 to STS-135: the orbiter, the liftoff and landing, the number of people NASA's page lists, and a few words on the main payload, in English and Japanese. The facts are read from **NASA's mission pages**, `https://www.nasa.gov/mission/sts-<id>/` with `<id>` one of `1   2   3   4   5   6   7   8   9   4 1 b   4 1 c   4 1 d   4 1 g   5 1 a   5 1 c   5 1 d   5 1 b   5 1 g   5 1 f   5 1 i   5 1 j   6 1 a   6 1 b   6 1 c   5 1 l   2 6   2 7   2 9   3 0   2 8   3 4   3 3   3 2   3 6   3 1   4 1   3 8   3 5   3 7   3 9   4 0   4 3   4 8   4 4   4 2   4 5   4 9   5 0   4 6   4 7   5 2   5 3   5 4   5 6   5 5   5 7   5 1   5 8   6 1   6 0   6 2   5 9   6 5   6 4   6 8   6 6   6 3   6 7   7 1   7 0   6 9   7 3   7 4   7 2   7 5   7 6   7 7   7 8   7 9   8 0   8 1   8 2   8 3   8 4   9 4   8 5   8 6   8 7   8 9   9 0   9 1   9 5   8 8   9 6   9 3   1 0 3   9 9   1 0 1   1 0 6   9 2   9 7   9 8   1 0 2   1 0 0   1 0 4   1 0 5   1 0 8   1 0 9   1 1 0   1 1 1   1 1 2   1 1 3   1 0 7   1 1 4   1 2 1   1 1 5   1 1 6   1 1 7   1 1 8   1 2 0   1 2 2   1 2 3   1 2 4   1 2 6   1 1 9   1 2 5   1 2 7   1 2 8   1 2 9   1 3 0   1 3 1   1 3 2   1 3 3   1 3 4   1 3 5`, each read once on 2026-11-08 (a two-second pause between pages; the source list as read is `test/recorded/nasa-sts-2026-11-08.json`, made by `scripts/missions.ts facts`, and `test/missions.test.ts` holds the package's facts to it). NASA content "generally are not subject to copyright in the United States" and NASA is acknowledged as the source; no NASA insignia, logotype or picture is used, and the payload lines are our own words from the pages. STS-107's landing time is the page's "about 9 a.m. EST" on 2003-02-01; the page gives STS-51L no time of liftoff, so it has the date alone.

`demo/missions/*.json` (the demo site only, never in the npm package) hold the historical element sets of each flight's craft, 134 files (STS-51L was given none), about 3,100 element sets, 410 kB (180 kB compressed). They are **Space-Track.org** (U.S. Space Command) basic SSA data (SATCAT for the catalogue numbers and dates, `gp_history` for the element sets), asked once on 2026-11-08 with John Morris's own Space-Track account (`scripts/missions.ts elements`; the `gp_history` class is for one ask per object in its lifetime), thinned to one set in three hours at most and cleaned of dated-out-of-flight and typed-over sets (`scripts/missions.ts clean`). Space-Track's "Redistribution of Basic SSA Information" (documentation page, read 2026-11-08, quoted above) allows passing basic SSA data on "conditioned on appropriate citation": **Data from Space-Track.org (USSPACECOM)**, in each file's `source`, the demo's replay note and here. They are site files and not package data, as the package ships no elements (docs/satellite-sources.md).

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

## The printable sheets

The sheets (`src/sheets/`) are drawn from the package's own data: the outlines above, the Sun's place by `subsolarPoint` (the low-precision formulas of NOAA's solar calculator, Meeus, Astronomical Algorithms, chapter 25) and the Earth's tilt (23.4393 degrees, the IAU's obliquity of the ecliptic at J2000). Nothing is traced from a map or a flag. The few figures written into the facts are the Earth's mean diameter (12,742 km, the IAU's nominal radius 6,371 km) and equatorial circumference (40,075 km, WGS84), and that the Pacific Ocean (about 165 million square kilometres, NOAA's National Ocean Service) is bigger than all the land (about 149 million). The share of the land each continent has is worked out from the outlines. The demo's sheets page takes each country's capital from kuni (MIT, by John Morris) and a flag, to check a drawing against, from hata (MIT, by John Morris; each flag's own licence is in hata's NOTICE.md); neither is on a sheet and neither is a dependency of the package.
