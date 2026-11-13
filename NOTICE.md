# Notice

Chikyu Earth is original work by John Morris, under the MIT licence in `LICENSE`.

## Country outlines

The country boundaries are **Natural Earth** (https://www.naturalearthdata.com), the 1:110m
admin-0 countries, which Natural Earth places in the **public domain**
(https://www.naturalearthdata.com/about/terms-of-use/). They reach this package through **chizu**
(https://github.com/johnmorrisdotca/chizu, MIT, by John Morris), whose `world-geo` entry
(`@johnmorrisdotca/chizu/world-geo`) holds them as longitude and latitude; nothing is fetched at runtime. The demo's passes page draws its small world map
from a simplified copy of the same outlines (each ring thinned in the browser to within half a map unit, about half the points): a derived drawing of the same public-domain data.

## Borders

The borders on the realistic Earth and the space view (`borders`, `src/borders/`) are drawn from the same data: chizu's
`world-geo`, Natural Earth 5.1.2's admin-0 countries at 1:110m, credited as chizu credits them. chizu's NOTICE.md quotes
Natural Earth's terms of use (https://www.naturalearthdata.com/about/terms-of-use/, read by chizu on 2026-10-01): the data
"are in the public domain" and "Crediting the authors is unnecessary"; it is done here anyway: Natural Earth, made by
volunteers and supported by the North American Cartographic Information Society. Only the edges two countries share are
drawn; the code that finds them is this package's own and MIT. Natural Earth draws borders as they are held on the ground
(de facto), and so do these lines. The regions (provinces, states) are the page's own data, handed over through
`borderData.regions`, with the page's own licence; this package ships none (2026-11-11).

## The grid and the country names on the 3D Earth

The grid (`grid`, `src/grid/`) is drawn from numbers alone: meridians and parallels every 15 degrees, the tropics and polar circles at the Earth's tilt of 23.4393 degrees (the IAU's obliquity of the ecliptic at J2000, as under "The printable sheets"). The country names on the realistic Earth and the space view (`country-names`, `src/country-names/`) are chizu's `world-geo` names (see "Country names and codes" below), loaded only when asked for; where each name goes is worked out by this package's own code (MIT) from the same Natural Earth outlines (see "Borders"), and no label positions are taken from any other map (2026-11-12).

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

`scripts/make-earth-tiles.py` cuts NASA's bigger maps (the 21600 and 13500 pixel pictures, and the full-resolution 500 m maps, 86400 × 43200, published as eight 21600 × 21600 panels each) into a pyramid of 512 px WebP tiles (docs/guides/earth-tiles.md). The tiles are built in CI and served by GitHub Pages beside the demo at `/tiles/`; they are not in git and not in the npm package. Terms, read on 2026-11-08 and again on 2026-11-13 (the same words, which cover the 500 m maps too) at https://www.nasa.gov/nasa-brand-center/images-and-media/ (NASA Images and Media Usage Guidelines): "NASA content – images, audio, video, and media files used in the rendition of 3-dimensional models, such as texture maps and polygon data in any format – generally are not subject to copyright in the United States." and "NASA should be acknowledged as the source of the material." The same page says third-party material NASA uses with permission is marked as copyright protected with the holder's name; neither source below is marked so. Not endorsed by NASA; no NASA insignia or logotype is used.

| Layer | Source | Credit |
|---|---|---|
| `day` (levels 0 to 5, up to 32768 x 16384) | Blue Marble: Next Generation with topography and bathymetry, September 2004: levels 0 to 4 from the 21600 x 10800 picture (https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/september/world.topo.bathy.200409.3x21600x10800.jpg, SHA-256 863036b622ba3dab4eb4ffb7149730b02cfa433ce49672e9b7267022051e04a2), level 5 from its full-resolution 500 m map, 86400 x 43200 (https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ says "very high resolution (500 meters/pixel)", read 2026-11-13), eight panels https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/september/world.topo.bathy.200409.3x21600x21600.<A1 to D2>.jpg (21600 x 21600 each, 436 MB in all; the SHA-256 of each is in `scripts/earth-tiles-sources.json`); the same month as `day-*.webp` | "NASA Earth Observatory": the page https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ (read 2026-11-08) says "Anyone using or republishing Blue Marble: Next Generation please credit “NASA Earth Observatory.”" It was produced by Reto Stöckli, NASA Earth Observatory (NASA Goddard Space Flight Center). |
| `night` (levels 0 to 4, up to 16384 x 8192) | Earth at Night, Black Marble 2016 colour map: levels 0 to 3 from the 3 km picture, 13500 x 6750 (https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg, SHA-256 230aac448ae68c358be433dd518888cccb3a85ccf66f7b44326441c324ad6725; page https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/, read 2026-11-08), level 4 from its 500 m map, 86400 x 43200 (the Visible Earth page https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps, read 2026-11-13, says "in three different resolutions: 0.1 degrees (3600x1800), 3km (13500x6750), and 500m (86400x43200). The 500m global map is divided into tiles (21600x21600)"), eight panels https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_<A1 to D2>.jpg (206 MB in all; the SHA-256 of each is in `scripts/earth-tiles-sources.json`) | NASA Earth Observatory, Suomi NPP VIIRS data (the page names no further credit line in its text; check it for print) |

The bathymetry-free Blue Marble maps (base map, and base map with topography, on the same Blue Marble page) fall under the same NASA terms; the tiles use the one with bathymetry, as `day-*.webp` does. The clouds are not tiled: NASA's sharper cloud files (Visible Earth 57747, once at eoimages.gsfc.nasa.gov) are no longer served, and the Blue Marble 2002 page (https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) offers only the 2048 picture already in `clouds-2048.webp`.

The 500 m maps could fill one more level (65536 across for the day map); the pyramid stops at level 5 (day) and level 4 (night) for now. Where the pyramid is hosted: GitHub Pages of this public repository, which costs nothing (docs/guides/earth-tiles.md). It adds 3,412 files and 35.4 MB to the site (852 files and 10.3 MB before the 500 m levels). The source files are downloaded by the build (688 MB, once, kept by CI's cache) and are not part of the site.

## The Moon's picture

`moon-*.webp` is made by `scripts/make-textures.py` from NASA's Scientific Visualization Studio item 4720, "Moon: LROC colour mosaic" (https://svs.gsfc.nasa.gov/4720/,
`lroc_color_2k.jpg`), a natural-colour mosaic of the Lunar Reconnaissance Orbiter's wide-angle camera (Arizona State University and NASA/GSFC). NASA's page asks: "Please give credit for this
item to: NASA's Scientific Visualization Studio" (Visualizer Ernie Wright, USRA; Scientist Noah Petro, NASA/GSFC). Same NASA terms as above.

## The planets' places

`<chikyu-space>` computes positions with **astronomy-engine** (https://github.com/cosinekitty/astronomy, MIT, copyright Don Cross), the page's own optional peer dependency: this package does not
bundle or ship it. In this package the planets are drawn as plain colours, from no picture: a page that wants their pictures hands the view a painter (`setBodyPainter`), and the painter's pictures are the page's, with their own credit, which the view writes under the picture when the painter carries one (`credit`).

The demo site's space views paint the Sun, the planets, Pluto, their moons and the Moon with the pictures of **wakusei-planets** (https://github.com/johnmorrisdotca/wakusei-planets, MIT, by John Morris), a separate optional package. Its 512 and 1024 pixel pictures are copied from its npm package and served beside the demo (`planets/`); its finer map tiles are read from its own site (https://johnmorrisdotca.github.io/wakusei-planets/tiles/) when a planet or the Moon is big on the screen. None of them is in this package. Their sources and licences, as wakusei-planets' NOTICE.md gives them (read 2026-11-11, version 0.36.0):

- Mars, Pluto, the Moon, the moons of Jupiter and Saturn, Triton, Charon, the Earth and Saturn's rings, and the finer tiles: maps by NASA, the USGS, JPL and the missions' teams, public domain (NASA asks to be acknowledged as the source).
- Venus, Saturn's bands, Neptune and the Sun: **Solar System Scope** (https://www.solarsystemscope.com/textures/), whose page says (read 2026-11-11): "Distributed under Attribution 4.0 International license: You may use, adapt, and share these textures for any purpose, even commercially." Mercury: "Mercury Realistic 8K" by **Shady Tex** (https://sketchfab.com/3d-models/mercury-realistic-8k-215f364627054d25ae03bcd72afda714), the same map as Solar System Scope's. Jupiter, Uranus and Saturn's poles: "Jupiter", "Uranus" and "Saturn" by **Nestaeric** (https://sketchfab.com/Nestaeric). Each Sketchfab page shows the licence "CC Attribution" (read 2026-11-11). All of these are **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/: "You must give appropriate credit, provide a link to the license, and indicate if changes were made"). wakusei-planets resized and reprojected them; its NOTICE.md says what was done to each.

The demo credits them on the screen: the space view writes "Planet and Moon pictures: NASA, USGS and JPL (public domain); Solar System Scope, Shady Tex and Nestaeric (CC BY 4.0), by way of Wakusei Planets." under the picture (in Japanese on a Japanese page), the full-screen page writes it under its title, and the demo's credit links lead here.

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

## Satellite owners' countries

`src/satellites/owners.ts` gives each owner code of the satellite catalogue the country it stands for, as an ISO 3166-1 alpha-2 code, or none for an organisation, several countries, an unknown owner, or a code the list does not give to one country. The codes and what each stands for were typed from CelesTrak's list of SATCAT sources (https://celestrak.org/satcat/sources.php, T.S. Kelso, read 2026-11-12, 132 codes); a code and the name of a country are facts. The two-letter codes are ISO 3166-1's, also facts. `CIS` is left unset: the list calls it "Commonwealth of Independent States (former USSR)" and does not name Russia. `ISRO` is India, that country's space agency. No flag is drawn or shipped.

## Meteor showers

`src/data/meteor-showers.ts` (in the package, the `./meteors` entry point) is the **International Meteor Organization**'s Working List of Visual Meteor Showers: Table 5 of the *2026 Meteor Shower Calendar*, edited by Jürgen Rendtel (IMO INFO(3-25), https://www.imo.net/files/meteor-shower/cal2026.pdf, read 2026-11-10), typed by hand: each shower's code and number, dates of activity, date and solar longitude of the maximum, radiant, speed, population index and zenithal hourly rate. The table says its details "were correct according to the best information available in June 2025, with maximum dates accurate only for 2026". The Antihelion Source is left out. The Calendar states no licence or reuse terms; these are facts from a published list, credited here and in the guide, and will be removed on request. On 2026-11-11 every row was checked against the **IAU Meteor Data Center** (https://www.ta3.sk/IAUC22DB/MDC2022/, kept by the Astronomical Institute of the Slovak Academy of Sciences under Division F of the International Astronomical Union): its list of all showers and its list of established showers (`streamfulldata2026.txt` and `streamestablisheddata2026.txt`, last update 2026-11-10 20:00 UTC, read 2026-11-11). **The MDC states no licence or reuse terms**, on its pages or in its data files; the files ask, in their headers, that the shower database be cited as Jenniskens, Jopek, Janches, Hajdukova, Kokhirova and Rudawska (2020), *Planetary and Space Science* 182, 104821, and Jopek and Kanuchova (2017), *Planetary and Space Science* 143, 3-6, which is done here, in `IAU_MDC` and in the guide. What is taken is facts from a published list, credited and removed on request: each shower's IAU name, number and status, its parent body from the MDC's origin column (the 26 showers whose solutions name one; the delta-Aquariids' name two different bodies and are given none), and the check of the table's radiants and speeds against the MDC's solutions (rule and result in `src/data/meteor-iau.ts`; three rows took the MDC's figures: the April Lyrids' and alpha-Monocerotids' speeds and the eta-Eridanids' radiant). The MDC lists no maximum date and no zenithal hourly rate, so the dates and rates stay the IMO's. `test/recorded/iau-mdc-showers-2026-11-11.json` holds the MDC's solutions of the 37 showers as read, for the tests. The parent bodies agree with the ones the Calendar's own text names (Lyrids, June Bootids, Perseids, Draconids, Taurids, Leonids) and with **NASA**'s pages on the shower (Quadrantids, eta Aquariids, Orionids, Geminids; https://science.nasa.gov/solar-system/meteors-meteorites/, read 2026-11-10); the other 15 are the MDC's alone. The Japanese names are the names in use in Japan. The heights between which meteors shine (80 to 120 km) and the range of their speeds are as the American Meteor Society's FAQ gives them (https://www.amsmeteors.org/faq/, read 2026-11-10), as figures only; none of its text is copied.

Not from any list, and said so where it is used (`src/meteors/rate.ts`, `src/meteors/layer.ts`, the guide): the sporadic background of 8 meteors an hour, its lean towards the morning side, each shower's curve between its first day, its maximum and its last day, and how many streaks are drawn. The Sun's longitude is Meeus's low-precision formula (as under "Sun position").

## The data door

`src/data-door.ts` is kazoku-ui's `templates/data-door.ts`, copied unchanged (the same file in every package of the family; MIT, by John Morris). `src/door/own.ts` writes the package's own data as the door's sources from the rows above: `chikyu-pictures` (the whole-Earth pictures, "The realistic Earth's pictures") and `chikyu-tiles` (the finer map tiles, "The Earth tiles"), both NASA Earth Observatory images under the NASA terms quoted there, so "Public domain" with credit; a test holds that neither is non-commercial or share-alike. Any other source is a caller's: it brings its own licence and credit, and the door prints both (and "non-commercial" or "share-alike" where it says so); the package bundles none and ships no data through the door.

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

## The Earth-orbit catalogue

The package ships no orbital elements and no catalogue data (`src/catalogue/` is code: the class of an orbit from Kepler's third law, the kinds, colours, fleet name patterns and a packed file format of this package's own). The demo's site hosts files made by `scripts/catalogue.ts` and published by `.github/workflows/catalogue.yml`, once a day, **once the repository variable `CATALOGUE_PUBLISH` is `yes`**; until then nothing is made or published.

Those files hold **Space-Track.org** (https://www.space-track.org, U.S. Space Command) basic SSA data: the GP class for every object on orbit (the elements, `OBJECT_TYPE`, `COUNTRY_CODE`, `LAUNCH_DATE`, `RCS_SIZE`) and the SATCAT, through John Morris's own account (the login is a repository secret, never in a file). Terms: the documentation page https://www.space-track.org/documentation, section "Redistribution of Basic SSA Information", read through a page-reading tool on 2026-11-11: "USSPACECOM has provided express blanket approval for transfer/redistribution of basic SSA data and services accessed via www.Space-Track.org conditioned on appropriate citation." Basic SSA data are "TLEs and OMMs; SATCAT; and Satellite Decay and Reentry Data." The citation, which is this package's own wording because the page gives none, is **"Data from Space-Track.org (USSPACECOM)"**, in each file's header, in `manifest.json` and wherever the demo shows the data. The User Agreement's own sentence stays true for everything else: the user "agrees not to transfer any data ... to any other entity without prior express approval", and the blanket approval is the approval. TODO before the first publish: the section's wording is to be read once in a real browser (the page needs one), and its sentence and that date written here. **The repository variable `CATALOGUE_PUBLISH` stays unset (the workflow does nothing) until this TODO is done.** The asks: one login, one GP request with the documented on-orbit filter and one SATCAT request after 17:00 UTC, a pause between them, nothing retried and nothing asked at a visitor's request; the API rule is "less than 30 requests per 1 minute(s) and 300 requests per 1 hour(s)".

Space-Track has no field that says whether a payload still works. **Until CelesTrak's list is approved, the files hold one `payloads` group and CelesTrak is never asked**; the split into working and inactive payloads is a switch (the repository variable `CATALOGUE_WORKING_LIST` set to `celestrak`), off unless set. When it is on, it uses the catalogue numbers in **CelesTrak**'s list of active satellites (https://celestrak.org/NORAD/elements/gp.php?GROUP=active, one request a day within CelesTrak's usage policy, https://celestrak.org/usage-policy.php, read 2026-11-03: a list is downloaded once per update and nothing at a visitor's request). Only the numbers are used, as a set, and nothing else of that list is kept or published; CelesTrak states no licence for the data (the "grey" tier, as above). The numbers are facts; the split they make is this package's own.

