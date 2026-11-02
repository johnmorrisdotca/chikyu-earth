# Changelog

## 0.7.0

The space view can look at any body, bodies can be chosen, and how the Sun and the planets are drawn is a seam another package can fill.

- **Look at a body**: `element.body = "Mars"` (any of Earth, Moon, Sun and the seven planets) points the camera at it; at zoom 1 it fills the view, and the shared controls turn the camera round it and zoom in and out from it. The demo's "Look at" row does it.
- **Bodies can be chosen**: each name beside a body is a real button (Tab and Enter), and a press on a body (not a drag) fires `chikyu-body-click`; `chikyu-body-focus` for the keyboard. The event carries `name`, `radiusKm` and `distanceKm` (`element.bodyInfo(name)` gives the same for a caption); the demo prints "Jupiter: radius 69,911 km, 666,000,000 km from the Earth".
- **A seam for drawing the bodies** (`BodyPainter`, `setBodyPainter`, `plainPainter` from `@johnmorrisdotca/chikyu-earth/space`): the space view keeps each body's place, size, light direction, name and orbit, and asks a painter only for what to draw there (an object of radius 1; `light(toSun)` each draw; the Sun's turns to face the camera). The default is what 0.6.0 drew: spheres in the planets' colours and a glow for the Sun. John chose a separate package (wakusei-planets) for the bodies' own looks, so chikyu ships no planet pictures and no rings; the Earth and the Moon keep theirs.
- Tests: e2e (a body looked at, its name chosen by keyboard, a press on it chooses it, a drag that turns the view does not) and a unit test of the default painter.

## 0.6.0

The Sun, the Moon and the planets: `<chikyu-space>`, an optional entry point, under the same performance budget as the Earth from space.

- **`<chikyu-space>`** (`@johnmorrisdotca/chikyu-earth/space/element`) places the Earth, the Moon, the Sun and the planets (Mercury to Neptune) in their positions for a date and time, with the Moon's
  phase and the Earth's sunlit side coming out of the light (the Moon is half lit on 2 November 2026, last quarter). Positions are computed in the browser by **astronomy-engine** (MIT, a new optional peer dependency;
  nothing is fetched). Time controls: `time` (an ISO date or `now`), `speed` (1 real time, 0 held, 3600 an hour a second, 86400 a day a second, negative backwards). Zoom from the Earth out to the solar system and back with
  the shared controls (`zoom-min`, `zoom-max`), and `zoomFor("moon" | "sun" | "inner" | "solar-system" | "earth")` for the jumps. Names beside the bodies and the planets' orbits can be switched off.
- **Two scales, and it says which**: `compressed` (default; every direction real, the Moon 10 Earth radii away instead of 60, the Sun 44, the planets round the Sun at 44 radii times their distance in astronomical
  units to the power 0.45, sizes enlarged) and `true` (real distances and sizes, where the planets are specks). The demo says "Compressed scale: ..." whenever it is on. [docs/space.md](docs/space.md).
- **Budget, each line tested** (`e2e/space.gl.ts`): paused, 0 draw calls and 0 frame requests in 4 s; real time, 0 draw calls in 6 s (a draw a minute); a day a second: 1.00 days a second of game time, 29.4 draws a second,
  and 2.0 ephemeris lookups a second (the ephemeris is looked up once a game-second span and interpolated, within 0.1 degree of the Moon's true place); nothing drawn out of sight at a day a second; the textures follow the zoom and
  are freed after it; removal frees what it held; a lost context is recovered. The space soak (10 minutes, 945 steps from the Earth to the solar system and back, at every speed, both scales, orbits and names toggled): JS heap 8.05 to 8.45 MB after garbage collection (flat from the fifth minute), GPU objects 46 to 46, textures, buffers and programs equal to the start, the average 76 GL draw calls a second (about 25 a frame, so 3 frames a second), one WebGL context, no error.
- **Pictures**: the Moon (NASA SVS 4720, LROC colour mosaic, 1024 and 2048 wide, 306 KB) joins the Earth's; the package's textures are 1.85 MB. The planets are plain colours.
- **Shared parts**: the texture loader (`src/realistic/textures.ts`) and the page's one renderer (`src/realistic/shared.ts`) now serve both the Earth from space and the space view, so a page keeps one WebGL context between them. The
  Earth's shaders look at the camera instead of assuming one, so they work from any angle.
- **Research, no code** ([docs/satellite-sources.md](docs/satellite-sources.md), MODULES-85): CelesTrak (grey), Space-Track (red for a package), the r/SpaceX API (archived, offline), Launch Library 2 (grey), Wikipedia and Wikidata
  (green) for launches; the recommendation is a satellite view that takes elements the page supplies. John chooses before MODULES-86 and MODULES-87 start.

### The family's published parts: demo, embed, docs and usage

Chikyu Earth now has what every package of the family has, and it was missing from 0.3.0 to 0.5.0.

- **Demo on GitHub Pages**, set as the repository's and the package's homepage: <https://johnmorrisdotca.github.io/chikyu-earth/>, with the family header (the kazoku-ui language picker, English and Japanese, and theme switch, the table cloths and the Help switch), light and dark, and the family footer. `pnpm site` builds it, and the Pages workflow publishes it on every push to `main`.
- **An embed page**, `embed.html`, for an `<iframe>` with no script of your own: `?look=line|thick|realistic`, `center`, `graticule`, `turn=0|1|auto`, `time`, `clouds`, `lights`. Still by default, no controls, no location prompt; it draws only when something changes and nothing while hidden. Tested in Chromium and WebKit, and on the realistic look: one WebGL context, canvas inside its budget, nothing drawn at rest.
- **A documentation site** at `/docs/`: a page for every export (from its TSDoc, with an example that is run when the site is built), ten guides in English and in Japanese, one language to a page, search, `llms.txt` and the family's header. Every export of every entry point has a summary, `@param`, `@returns` and an `@example` that imports the package by its name; `pnpm check` fails when one does not.
- **Every way to use it, written down and tested** (`pnpm test:usage`): a script tag from jsDelivr and from unpkg, the realistic Earth from a CDN, the shared controls, Vite, webpack, React (and a server render of it), Vue, Svelte, Angular, an iframe, TypeScript types and Node. Each example is built or run against the package as npm packs it, opened in a browser and made to show a globe; the guides and the README must hold the same text word for word.
- **`look` attribute**: `<chikyu-earth look="thick">` is the new name of `style`, which frameworks read as CSS (React refuses a string `style`). `style` still works.
- **Types for the tags**: `document.querySelector("chikyu-earth")` is a `ChikyuEarth` (and `"chikyu-earth-realistic"`, `"chikyu-space"`) once the element's entry is imported.
- **Family files**: `family-template.mjs` and `family-readme.mjs` of 2026-11-02 with Chikyu Earth added to the family's list (33 packages), `family.css`, and the README's "The family" block. Added to the list here only; the other packages take the new files when they are next touched.

## 0.5.0

The Earth from space, and markers for any place on either globe, both under a hard performance budget.

### Markers

- **`attachMarkers(element)`** (`@johnmorrisdotca/chikyu-earth/markers`) puts your places on `<chikyu-earth>` or `<chikyu-earth-realistic>`: add, update and remove markers at `[lon, lat]` with a label, colour, icon and size; groups (cities, stadiums) shown or hidden together; markers that turn, zoom and pan with the globe and fade on the far side; crowded places gathered into clusters; labels that make room for each other; `chikyu-marker-hover`, `-click` and `-focus` events carrying your own `data`; a button for each shown label (Tab and Enter work) and a hidden list of every place for a screen reader. Chikyu ships no places; the demo shows 22 cities and 10 stadiums (Wikidata coordinates, CC0). [docs/markers.md](docs/markers.md).
- **Budget**, each line tested: all dots in one 2D canvas pass, and a pool of 24 label buttons, never an element per place; 5,000 markers cost 0.36 ms a view change on the flat globe; a 5,000-marker drag on the Earth from space made 117 draws in 4 s (29 a second), the markers drawn with them one for one and not at all at rest or out of sight; the overlay canvas holds the same 4096-a-side, 6 MP limit.
- The flat element's picture now sits in a holder beside the markers' overlay (a redraw replaces only the picture), and `lookAt` moves to `view.ts`.

### The Earth from space

An optional realistic look, drawn with three.js through kazoku-ui's shared renderer.

- **`<chikyu-earth-realistic>`** (`@johnmorrisdotca/chikyu-earth/realistic/element`): day side from NASA's Blue Marble, the cities' lights on the night side, a cloud
  layer that drifts with the date, a sun glint on the sea, an atmosphere at the rim, and the day and night line placed by the real Sun for a date and time (now by
  default). The same shared controls (turn, tilt, zoom, pan) and the same `setView(view, final)` as the flat globe. `time`, `clouds`, `lights`, `center`,
  `texture-base`, `max-texture` and `live-seconds` attributes; `chikyu-ready`, `chikyu-unavailable` and `chikyu-tier` events. [docs/realistic.md](docs/realistic.md).
- **The flat look stays**: `<chikyu-earth>` is unchanged (and gains a `centre` getter); the demo's Line, Thick and Realistic buttons choose between them, keep the
  camera, and keep the choice, the graticule, the clouds, the lights and the time in the address (kazoku-ui's address state). Without WebGL the demo says so and
  shows the line globe.
- **Optional, so the base install stays small**: `three` and `@johnmorrisdotca/kazoku-ui` are optional peer dependencies; the base entry and `<chikyu-earth>` need neither.
  The realistic element, its Sun, its scene and its shaders, with kazoku-ui's renderer, are 22.6 KB minified (9.2 KB gzipped); three.js is the page's, and the demo's
  subset of it (`demo/three-subset.ts`) is 188 KB gzipped. Sun position: `subsolarPoint(ms)` in `@johnmorrisdotca/chikyu-earth/realistic`, tested against the almanac
  (declination within 0.05 degree, the equation of time in the longitude).
- **Pictures** (1.55 MB in `dist/textures/`, WebP, all NASA public domain, credited in NOTICE.md): day at 1024, 2048 and 4096; night, clouds and a water mask at 1024 and 2048.
  The 1024 ones load first; a larger one loads when the zoom needs it (about 3 texels per pixel of the disc's radius), replaces the smaller, and is freed 4 s after the
  zoom drops. No texture is wider than 4096 (2048 on a device with 2 GB or less); `pnpm textures` rebuilds them.
- **Performance, each proved by `e2e/realistic.gl.ts` (Chromium, software WebGL)**: 0 draw calls and 0 animation frames in 4 s at rest; a drag at 125 moves a second
  draws 29.3 times a second, and 2,700 `setView` calls in 2 s make 59 draws; an Auto-turn at the Earth's rate draws 0 times in 6 s; one WebGL context; the canvas on a
  5K screen at ratio 2 is 3264 x 1835 = 5.99 MP; the textures alive grow one a layer with the zoom and return to the start after it; 0 draws and 0 frames while out of
  sight or in a hidden tab; after removal 0 buffers, 0 programs and none of our textures remain, and the element can come back; a lost context draws nothing and then
  recovers, not black; no WebGL gives `chikyu-unavailable`. The soak (10 minutes, 976 moves, 2,000 markers on): JS heap 7.29 to 7.80 MB after garbage collection, GPU objects 20 to 20, textures, buffers and programs the same as at the start, the draw rate 5.4 a second on average, one WebGL context, no error.
- `pnpm test:soak` (`SOAK_MINUTES`, 10 by default; CI runs 1) turns, zooms, re-times and toggles for that long and compares the heap, the GPU objects and the draw rate with the start.
- `pnpm screenshots` also makes the realistic pictures; `scripts/make-textures.py` makes the textures from NASA's sources.

## 0.4.0

The outlines now come from chizu, the controls from kazoku-ui 0.9, and the release from the family's shared workflow.

- **chizu's `world-geo` replaces our own country data.** `src/data/countries.ts` (154 KB) and `scripts/make-countries.ts`
  are gone; `src/countries.ts` is a small adapter over `@johnmorrisdotca/chizu/world-geo` (chizu 1.6.0, now a
  dependency). The globe looks the same and `COUNTRIES` and `countryList()` keep their shape. Region count: 177 before,
  177 now, so nothing to reconcile (chizu's 173 `WORLD` countries plus Antarctica, the French Southern Lands, Northern
  Cyprus and Somaliland). One difference: Kosovo's `alpha2` is `XK` (it was `null`); Northern Cyprus and Somaliland
  stay `null`. The demo bundle goes from 207 KB to 220 KB (chizu's data is a little larger than ours was, and
  kazoku-ui 0.9's bar has more in it). `world-atlas`, `topojson-client` and kuni are no longer dev dependencies.
- **kazoku-ui ^0.9.0** (was ^0.1.0, which could not move past 0.1.x), now a dev dependency: the package itself
  imports none of it, only the demo does. The demo asks for `controls="advanced"` so Front, 2x, tilt and the pan pad
  stay on the bar; the idle turn stops when the view is out of sight (kazoku-ui 0.7.1) and the demo's one redraw a
  second stays.
- **Shared release workflow.** `release.yml` now calls kazoku-ui's `reusable-release.yml` (pinned to v0.9.0) with
  `pnpm check && pnpm test:package`; the npm trusted-publisher entry still names `release.yml`.
- **AGENTS.md** is kazoku-ui's template (Facts: board `modules`, area `chikyu-earth`, ports 8200 to 8299).
- A still picture of the demo opens the README; `pnpm screenshots` makes the pictures in `docs/images/`.

## 0.3.0

The shared-controls integration is documented and covered in every motion preference, and the future of the
country data is written down.

- The README's new Controls section has the kazoku-ui snippet and the exact yaw/tilt/zoom/pan mapping. The browser
  suite now proves reduced motion leaves the globe still, as well as Auto-turn continuing after a zoom.
- Inspected chizu 1.5.1 from npm: `@johnmorrisdotca/chizu/world` is Miller-projected canvas data centred on 155°E,
  not longitude/latitude, so chikyu keeps its own Natural Earth 1:110m outlines and d3-geo.
  [docs/chizu-proposal.md](docs/chizu-proposal.md) proposes the `world-geo` export that would let it share chizu's
  data later.
- The demo and test servers move to this work's port block, 8200–8299.

## 0.2.0

The globe now uses the family's shared view controls.

- `<kazoku-view-controls>` supplies turn, tilt, Auto-turn, Front, zoom, pan and touch gestures; the custom Rotate ¼
  button and the element's private rotation timer are gone.
- `projectionView()` maps yaw and tilt to the orthographic rotation, zoom to its scale and pan to its translation,
  always relative to the reader's home centre. `<chikyu-earth>.setView()` applies that state.
- Auto-turn runs at `0.004178` degrees a second, the Earth's own sidereal rate, and keeps running through zoom,
  pan, Fit and Front. Reduced motion is respected by kazoku-ui.
- Browser tests now cover Chromium and WebKit at desk and phone sizes, including drag, pinch, zoom, Fit and the
  continuing Earth-rate turn.

## 0.1.0

The first scaffold, and the first working globe.

- `globe()` draws an orthographic globe as an SVG string: an ocean disc, the country outlines and the rim,
  in two line styles (`line`, `thick`), with an optional graticule.
- `<chikyu-earth>` puts that globe on a page as a web component. It opens centred on where you are
  (the `center` attribute wins over geolocation) and turns at the Earth's own rate — one sidereal day,
  23 h 56 min 4.0905 s, per revolution.
- Country outlines are Natural Earth's, baked into the package at build time; each carries its English and
  Japanese name and ISO alpha-2 code from kuni. d3-geo does the projection, the only runtime dependency.
- A demo (`pnpm dev`), unit tests, a package check and a Playwright demo test, with CI to run them.
