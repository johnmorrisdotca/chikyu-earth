# Changelog

## 0.15.0 - 2026-11-04

"Put it in your page" is the family's embed panel, on the demo and on the code builder (MODULES-348). No change to the package's drawings.

- **The demo's "Put it in your page" and the code builder are kazoku-ui's `<kazoku-embed-panel>`** (kazoku-ui ^0.15.1). Nothing they had is gone, and a test counts it: the ten places, the three looks, the graticule, the four sizes (240, 320, 420, 560), HTML, module, React and iframe tabs with the same code, Copy (now "Copy code"), Open the embed page, Read the docs, the credit line, and the picture of the globe beside the code (on the builder the realistic look is shown by the embed page in a frame, as before).
- **Added by the panel**: Vue, Angular and Svelte tabs, a picker for the places, and a note on the iframe tab ("One iframe, no script of your own"). The demo's page, which had one fixed iframe and no Copy button, now has the whole panel; the realistic look shows there as the flat globe, so the page never runs a second WebGL view.
- **The code**: `demo/embed-code.ts` writes every tab (the shared snippets with this package's element and attributes) and `test/embed-code.test.ts` runs the module against a stand-in page, compiles the React, Vue, Angular and Svelte code, and holds every import to the package's exports and every attribute to ones the element reads. The HTML tab is now the script tags and the tag (it was a whole page), and the CDN address carries the version.
- `scripts/check-standard.mjs` is kazoku-ui 0.15's (the `embed-panel` item); the demo moves to `@johnmorrisdotca/kazoku-ui` ^0.15.1.

## 0.14.0 - 2026-11-03

The family's speed buttons, in the demo's two places that run time (KAZOKU-UI-46).

- **Auto-turn has 0.5×, 1× and 2×.** The demo's view controls come from kazoku-ui 0.14: under More, the Earth's Auto-turn takes the shared speed buttons (they were Slow, Medium and Fast), 1× being the Earth's own rate of 0.004178 degrees a second. The choice is the controls' `pace` attribute and the address' `pace`.
- **The space view's Time row is `<kazoku-speed-buttons>`**: `0 1 3600 86400 -3600`, read as multiples of real time (0× holds it still, 3600× is an hour a second, 86400× a day a second, −3600× runs back), in the same look as Auto-turn's. It replaces the page's own five buttons ("Paused", "Real time", ...); `?speed=` still keeps the choice and Now still puts it back to 1×.
- `kazoku-ui` is `^0.14.0` for the demo (the optional peer is unchanged). Tests: `e2e/speed.demo.ts` (the controls' buttons and the time row, desk and phone, Chromium and WebKit, with the config's reduced motion) and `e2e/speed.gl.ts` (a press sets the clock and the address; Now returns to 1×).

## 0.13.0 - 2026-11-03

The demo's elements refresh by themselves, every satellite shows its age, and you can bring your own source (MODULES-261, steps 3 and 4).

- **A scheduled build refreshes the demo's element files every six hours** (`.github/workflows/pages.yml`, `scripts/elements.ts fetch`): one download of each of CelesTrak's 13 lists and 5 single satellites, a six-second pause between asks, a user agent that names the repository and a contact, a list not asked for again within 110 minutes, and a stop at the first answer that is not 200 (CelesTrak's rules for software, read 2026-11-03), keeping every other group's last file. A push carries over the files already on the live site and asks CelesTrak for nothing. A check refuses to publish a set with an empty or missing group or one older than 30 days. No server runs per view: the browser reads files on Pages. The embed page reads the same files, and takes any group (`&satellites=gps,weather`).
- **Age and dimming.** The page says how long ago the files were downloaded and each satellite's age. A satellite whose elements are more than 14 days from the time shown is placed but drawn dimmer (`createSatellites` option `dimAfterDays`, `Satellites.dimmed` and `dimVersion`, `DEFAULT_DIM_AFTER_DAYS`), and the page says why (its place is less exact); one more than 30 days away is left out. **`DEFAULT_MAX_AGE_DAYS` is now 30** (it was 14, where the satellite was left out): the 14 days is the dimming now. Still one instanced draw for a group, and the dimming costs one number a satellite, copied to the graphics card only when one changes.
- **Tests on recorded and made-up elements, never a live request.** The browser tests are served the recorded stations and Starlink of 2026-11-02 (`test/recorded/`, `e2e/recorded.ts`) so no position moves as the demo's files are refreshed; the file maker, the polite downloader (a made-up CelesTrak that answers 200, then 403), the age check and the dimming are unit-tested (`test/elements.test.ts`, `test/satellites.test.ts`), and the demo's dimming and notes in `e2e/groups.gl.ts`.
- **`fetchElements(url, options)`** (`@johnmorrisdotca/chikyu-earth/satellites`) asks an address you choose, in the visitor's browser, for OMM JSON, OMM CSV or TLE text and returns element sets for `createSatellites`, with `skipped` (what it left out, and why), `retrievedAt` and `fromCache`. It has no address of its own, and it is polite by design: https only (http on localhost), no cookies or referrer, no redirects; the same address is not asked again within two hours (the answer already read is returned from the page or from `localStorage`); any answer that is not 200, or none, leaves the address alone for an hour and throws an **`ElementSourceError`** (`status`, `retryAt`), using the answer already read meanwhile; at most 20 million bytes and 50,000 sets. `forgetElements()` is for tests.
- **`parseElements(text)`** reads the three formats with no request (so it runs on a server): OMM JSON (an array or one object, numbers as numbers or text), OMM CSV (quoted names) and TLE (two lines or three, checksums checked, the epoch, the implied decimals and the designator turned into OMM's fields); a TLE read this way flies to within half a kilometre of the OMM it was written from.
- **The demo has "Your own source"**: paste an address, press Load; the satellites become a "Yours" group you can show, find by name and ride. Nothing is asked until the visitor presses the button (an address in the page's own address only fills the box). It says how many were read and from where, what was left out and why, whether the answer was just asked for or kept (and for how long it will not be asked again), or why it could not be used. English and Japanese.
- Tests: made-up fetch and made-up TLE with real checksums (`test/source.test.ts`); in the browser a made-up address that the test serves, a refusal, something that is not elements and an http address, with a check that the page asked nothing else (`e2e/groups.gl.ts`).

## 0.12.0 - 2026-11-03

More satellites to follow and ride (MODULES-261, steps 1 and 2): where the data may come from, a curated catalogue, and fourteen groups in the demo.

- **`docs/satellite-sources.md`: every source's terms read and quoted** (CelesTrak, Space-Track, SatNOGS DB, N2YO, AMSAT, NASA and ESA, Wikidata), each with a tier (green, grey, red) and whether it may be fetched by the visitor's own browser, snapshotted on the demo site, or redistributed in the package. CelesTrak stays grey; Space-Track's blanket approval for passing on basic data (TLEs, OMMs) with a citation is noted; the decisions that are John's are one ticket (MODULES-333). The package still ships no orbital elements.
- **A curated catalogue** in `@johnmorrisdotca/chikyu-earth/satellites`: `SATELLITE_GROUPS` (fourteen groups: stations, famous, science, Earth observation, weather, geostationary, GPS, GLONASS, Galileo, BeiDou, amateur radio, OneWeb, Iridium, Starlink, each with its CelesTrak list or catalogue numbers, an orbit kind, whether it sits still, and a line in English and Japanese), `CATALOGUE` (about forty satellites by NORAD number, from the ISS and Tiangong to Hubble and Vanguard 1, the oldest satellite still in orbit, each with a line in English and Japanese), `findInCatalogue` and `catalogueEntry`. JWST is left out on purpose: it is not in Earth orbit. No elements in it.
- **The demo's groups are buttons** (a coloured dot each; a group switched on says what it is, and the demo zooms out to a group that goes far from the Earth), with **Find** (a search box over the catalogue and the names of every satellite in the demo's files, plus ISS and Tiangong) and two new rides, **The chosen satellite** and **One from the last group**. The address keeps the groups (`sats=gps,weather`), the chosen satellite (`sat=<NORAD number>`) and the ride (`ride=chosen`). A chosen satellite shows its catalogue line beside its height, speed and age.
- **`demo/elements/`** (demo site only): one file for each group, made from one download of each CelesTrak list on 2026-11-03, `manifest.json` and `index.json`; `scripts/elements.ts` makes them from downloaded lists and fetches nothing. Starlink stays at every fifth satellite (about 2,200 dots in one draw call); the others are whole (the geostationary list has 569).
- **Moons that have left the view are let go even when nothing else is drawn.** The space view let go of a moon four seconds after it left the view, but only when the next draw happened; a view at rest draws nothing, so the moons of Jupiter and Saturn were kept (their shaders and pictures) until someone touched the view. It now asks for one more draw when the first of them is due. Test: `e2e/space.gl.ts`. This is why the space soak failed in CI on "programs" since 0.11.0 (the count was never growing: the moons kept after leaving the view made it differ from one moment to the next); the soak now also looks at the Earth, on the day the view opened on (which moons of Saturn and Jupiter are in the view depends on the day), in sight and drawing, before it counts; the count came back to what it was in three of three local runs and the one-minute soak in CI.
- Tests: the catalogue and the file maker (`test/catalogue.test.ts`, `test/elements.test.ts`) and the demo's groups, Find and Ride on **made-up** element files served in place of the demo's own, with a check that nothing is asked of any other site (`e2e/groups.gl.ts`).

## 0.11.0 - 2026-11-03

The real Sun, planets, Pluto and moons in the space view.

- **`<chikyu-space>` draws the real bodies through its `BodyPainter` seam with [wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets) 0.5.0** (an optional peer): `setBodyPainter(painter)` with `painter` from `@johnmorrisdotca/wakusei-planets/painter`, and `bodies="realistic"` or `bodies="painted"` (`plain` for the old spheres) on the element, the Sun with its glow, banded Jupiter, Saturn with Cassini's rings, Mars, Venus, Mercury, Uranus, Neptune and Pluto, lit from the Sun in the scene's own axes. One WebGL context, nothing drawn at rest, bodies drawn at the view's rate cap; a picture arriving later asks for a redraw; sharper pictures are fetched only for a body that is big on the screen and let go when it is not. The demo draws them by default (Planets: Shaded, Painted, Plain), the ride along too; the embed takes `&bodies=painted`.
- **Pluto** joins the planets: `PLANETS`, `BODY_NAMES` (the names beside the bodies and `body = "Pluto"`), its orbit, its size in both scales.
- **The moons, at their planets, when the camera is near.** A painter's optional `moons(planet, ms)` says where they are (wakusei-planets: Mars's two, Jupiter's four, Saturn's seven, Uranus's five, Neptune's three, Pluto's three, from JPL's mean elements); the view shows them once the planet is 4 pixels across, at least 2 pixels each, in their order round it, and lets them go four seconds after they leave the view. `zoomFor("Jupiter-moons")` is the zoom that frames a planet with its nearer moons. `stats.bodies` counts what the painter made.
- **The seam grew, and kept its old shape**: `make(three, name, context)` may return a promise; a drawing may have `update({ toSun, ms, radiusPx })` and `dispose`; `BodyPainter` has optional `moons` and `looks`; new types `BodyMoon` and `PaintContext`. A painter written for 0.10 still works.
- **The embed page shows the space view** when asked for it: the globe it hides stayed in the page (an author `display: block` beat the `hidden` attribute), so `embed.html?look=space` and `look=realistic` showed the line globe and left the real view below it, out of sight.
- **kazoku-ui 0.11.0** for the demo: the Centre button and the zoom slider.
- **A drag turns the globe while it is going on** (MODULES-254). The line and thick globe redrew its projection only when the pointer was let go (a move made only a cheap transform), so it stayed still and jumped on release. `setView(view, final, live)`: with `live` (a hand is on the view, which is anything but the Auto-turn) the projection is also redrawn while it turns, at most 30 times a second. The demo, the embed page and the guides pass `event.detail.reason !== "auto"`. Test: `e2e/hold.gl.ts`, a real pointer that goes down, moves and is not let go, in the line, thick, realistic and space looks with the Auto-turn on and off.
- **kazoku-ui 0.12.0** for the demo (MODULES-234): the horizontal layout with the zoom slider, the **Centre** button (zoom in, drag the globe far off, press Centre and it is back in the middle at Fit and the default angle; the pan is held so the globe cannot be lost, and because the globe fills its square the controls' default hold, "the picture keeps covering the view", is the right one, so `object-size` is left out), and **exact grab**: `grab-radius="fit"` on the flat globe, the Earth from space with its disc's radius (the demo and the embed page set it; the guides and the README's examples carry `grab-radius="fit"`), so the touched point stays under the pointer (a drag of 31 px moves the ground at the middle by 31 px). The space view keeps the fixed angle, because its radius changes with the body and the scale. On a phone the horizontal layout's readout is Fit. Tests: `e2e/follows.gl.ts` runs kazoku-ui's shared `checkFollowsTheHand` (drag, arrow keys, Auto-turn west to east) and `checkExactGrab` in the line, thick, realistic and space looks (`e2e/ground.mjs` is kazoku-ui's `templates/e2e-ground.mjs`, unchanged); `e2e/centre.gl.ts` drags the globe far off, presses Centre and checks it is back, picture and all.
- **Always lit and Night boost** (MODULES-259): a ride on the night side is no longer a black frame. `light="sun"` (the true light, the default), `light="lit"` (the Earth lit as if by daylight from the camera's side, the day picture and no city lights) or `light="boost"` (the true terminator, with the night side raised so land and coasts read), on `<chikyu-space>` and `<chikyu-earth-realistic>`, as `element.light`, as three buttons in the demo (Light: Sun, Always lit, Night boost; English and Japanese) and in the address (`?light=lit`; the embed takes it too). The Sun, the Moon and the planets keep their true places. One uniform each and no extra pass. Tests: a night-side view is dark with the Sun and bright with Always lit and Night boost, and a ride on the ISS at a moment of its orbit in the Earth's shadow goes from nearly black (mean brightness 12 of 255) to 33 with Always lit and 18 with Night boost (`e2e/ride.gl.ts`).
- A guide, "The real Sun, planets, Pluto and moons", in English and Japanese.
- Documentation: an architecture guide with its Japanese twin, a code builder page (`builder.html`), a longer README whose examples run (`pnpm test:readme`), and every release of this changelog dated. No behaviour changed.
- The README opens with the package's thumbnail, and the demo carries it as its link preview (og:image) and publishes the card, a dark card and an icon on Pages at `thumbnail.png`, `thumbnail-dark.png` and `icon.png`.

## 0.10.0 - 2026-11-03

Three fixes for a page that puts the Earth behind something else.

- **A time and a view changed together are one draw** (MODULES-177). `time` and `setView` in one task each asked the rate gate; the first drew at once and the second 33 ms later, so a page moving the Sun and the camera on every tick drew twice. `Gate.soon()` makes every ask of one task a single ask, made when the task ends, and the realistic element uses it. Measured before: 2 draws for the two changes, now 1 (`e2e/realistic.gl.ts`).
- **`max-ratio`** on `<chikyu-earth-realistic>`: the most device pixels to a CSS pixel the canvas is drawn at (2 at most; `0.5` draws at half the size and scales it up). It is read when the element connects and is the shared renderer's cap for the page; the textures are chosen for it too. Test: at a device ratio of 2, `max-ratio="1"` draws a canvas under a third of the pixels.
- **A strict Content-Security-Policy no longer refuses the elements' styles** (MODULES-180). `<chikyu-earth>`, `<chikyu-earth-realistic>` and `<chikyu-space>` wrote a `<style>` into their shadow roots, which `style-src 'self'` blocks. They now adopt a constructable stylesheet (shared by every element with the same text), and where a browser has none, a `<style>` carrying the element's `nonce`. Test (`e2e/csp.gl.ts`): each element in a page served with `style-src 'self'` reports no violation, its styles apply, and no `<style>` is written.
- **`setSharedRenderer(renderer)`** (`@johnmorrisdotca/chikyu-earth/realistic/element`; MODULES-171): the page hands the Earth and the space view a renderer made with kazoku-ui's `createSharedRenderer`, so a page that draws other things with it keeps one WebGL context. The page owns it: its `maxRatio` and `onContext` apply and the elements never dispose it. Call it before the first element connects (it throws while one is in the page). Unit-tested (`test/shared.test.ts`).

## 0.9.1 - 2026-11-02

The ground now follows the pointer, in every look and when riding.

- **The Earth turned the wrong way up and down** (MODULES-200). A drag up made the ground go down in the line, thick, realistic and space looks, and the up arrow did the same: the controls' tilt was added to the latitude of the view, and it should be subtracted (the top of the globe tips away as the tilt grows, as the controls say). It is now one sign in `lookAt` and `projectionView` (`src/view.ts`) and one in the space view, so the flat globe, the realistic Earth and the space view agree. **A tilt in an address or a call now tips the other way.**
  Left and right were right already. Auto-turn turns the real way: the Earth goes round west to east, so with north up the ground moves from left to right, the same way as a drag right and the right arrow.
- **A ride could not be dragged** (MODULES-199). Riding at a body, a drag turned the camera's head round the straight-down line, which from the ISS only spun the picture, and tilt could not go the other way past the straight-down look, so a drag seemed to do nothing. `ridePose` now looks about from the base look as a head on a pivot does: yaw turns the camera to its left and tilt tips it towards the bottom of its picture, so a drag right moves the ground right and a drag up moves it up, about one and a half pixels a pixel, the pace of the line globe and the Earth from space. The angle for a pixel follows the field of view, so zooming in does not make the ground race. Behind a satellite (`view: "follow"`) the drag is mirrored, because the Earth is behind what the camera looks at, and the Earth follows the pointer.
- **The demo keeps the address's yaw and tilt when it opens on a ride** (it set both to 0 as the ride began), and **an address with `ride` and no `look` opens the space look**, so the reported address rides the ISS.
- **Tests**: `e2e/drag.gl.ts` drags with a real pointer, presses the arrow keys and runs Auto-turn in the line, thick, realistic and space looks, riding the ISS (down and at the horizon) and the Moon, and behind the ISS and the Moon, and checks which way the ground moved by sliding the first picture over the second; and that a ride opens with the address's turn, a drag writes it back and the address brings the same picture back; and the reported address. All fail on 0.9.0. Unit tests for `ridePose` and the view's signs.

## 0.9.0 - 2026-11-02

Ride along: the camera on the ISS, a Starlink satellite, the Moon or a planet, looking at the Earth.

- **`element.ride(target, options)`** on `<chikyu-space>`: the camera sits at a moving body at its real place for the moment shown and looks at the Earth, with the way the body is going at the top of the picture; the Earth turns and slides beneath it as the body goes along its orbit
  (an ISS view goes round in about 93 minutes). `target` is a body name (`"Moon"`, `"Mars"`, ...) or a satellite of a group (`{ group, index }`). Options: `view: "from"` (the default) or `"follow"` (a fixed distance from the body, looking at it; `distanceKm` for a satellite), `look: "down"` (the default) or
  `"horizon"` (tipped forward until the horizon is a little above the middle), and `smooth`. The shared controls' tilt tips the camera further, their yaw turns it round the straight-down line, their zoom narrows the 60 degree field of view. Time is the page's clock, forwards, backwards, faster or slower.
  `element.riding`, the `chikyu-ride` event, and `chikyu-ride-lost` (the satellite could not be placed on this date: its elements are too old; the ordinary camera comes back). A ridden satellite is placed exactly, one SGP4 call a frame, at any speed, even where its group is hidden.
- **Switching is smooth**: another `ride` call glides the camera's place, its turn (spherical interpolation) and its field of view from where the last draw left them to the new camera over 1.2 seconds, eased; reduced motion jumps. `ride(null)` stops.
- **`ridePose(input)`** (`@johnmorrisdotca/chikyu-earth/space`, pure, no browser): where the camera looks, for a place, a way of travel, a look and the controls' yaw, tilt and zoom. Unit-tested (looking down at the Earth's centre, the way it goes at the top, the horizon look, tilt, yaw, zoom, no way of travel).
- **Budget, each line tested** (`e2e/ride.gl.ts`): the camera is within 1 km of satellite.js's own place for the ISS and 420 km up; at 60 times real time it goes round the Earth at the ISS's rate (301 game seconds: 19.4 degrees, 19.4 expected); riding the Moon puts it 10 Earth radii away in the compressed scale and 55 to 66 in the true one;
  it animates continuously but at most 30 frames a second (the ISS at real time 6.5 a second, at 60 times 28.5, Mars at a day a second 28.5); paused, 0 GL draws and 0 frame requests; scrolled away or in a hidden tab, 0 GL draws at 60 times; reduced motion 1.00 frames a second at 60 times, and a jump instead of a glide; the glide from the ISS to the Moon takes 1.4 s
  and then rests; a satellite too old for the date gives `chikyu-ride-lost`; two more rounds of six switches add no buffers, textures or vertex arrays; a lost context comes back with the ride. The freeze test has a fourth look, the space view riding the ISS (and the look-changing rounds ride the ISS and the Moon). The ten-minute soak rides every
  way (the ISS, Tiangong, a Starlink satellite, the Moon, Mars, from it and behind it, down and at the horizon) while it adds, removes and chooses satellites: 965 steps, JS heap 14.35 to 14.51 MB after garbage collection, GPU objects 123 to 123, one WebGL context, no error.
- **The Auto-turn of the controls no longer draws thirty times a second in the space view.** Its turn at the Earth's own rate moves nothing visible in seconds, but every frame of it asked the space view for a draw. `setView(view, final = true)` now keeps a turn that moves less than half a pixel for the next draw and does not draw for it unless `final` is true:
  8 seconds of Auto-turn now make 0 draws (the controls ask for 480 animation frames in that time). This holds for the Earth's views, for riding, and for satellites.
- **Demo**: a "Ride along" row in the space look (ISS, Tiangong, a Starlink satellite, Moon, Mars, Stop; View: From it or Behind it; Looking: Straight down or At the horizon), with a line saying what is ridden, in English and Japanese (the Japanese page is tested for English words left in a control). The choices are kept in the address (`ride`, `rview`, `rlook`).
  The embed takes `ride=iss|css|starlink|Moon|Mars`, `rview=follow` and `rlook=horizon`; its test: one context, the ISS's height, nothing drawn at rest, a Moon ride at a day a second capped.
- **Docs**: a ride-along guide in English and Japanese, a page for it (docs/ride-along.md) and every new export with TSDoc and an example, usage examples run by `pnpm test:usage` (a Vite page that rides the ISS and is opened in a browser; `ridePose` in Node), README section, screenshots. The space view has no markers (those belong to the flat and the realistic globes), so the ticket's "markers stay on the ground" has nothing to do here.
- The names beside the bodies are not drawn for the body being ridden (the camera is inside it) and the Earth's is not drawn when riding at a body.

## 0.8.0 - 2026-11-02

Satellites on the space view, the space view in the embed, and the demo's space controls in Japanese.

- **Satellites** (`@johnmorrisdotca/chikyu-earth/satellites`, new, and `<chikyu-space>`): `createSatellites(elements)` turns orbital elements into positions with SGP4, and `space.setSatellites("stations", group)` draws them: a group is **one draw call** however many it holds
  (`THREE.Points`), each shown or hidden by name (`showSatellites`), with their orbits (`orbits: true` for a group of 40 or fewer), a ring and an orbit for a chosen one (`selectSatellite`, `satelliteInfo`) and `chikyu-satellite-click` for a press on one
  (not on one behind the Earth). **The package fetches nothing and ships no orbital data**: your page passes in elements in CelesTrak's GP JSON format (`ElementSet`), and the guide has the rules for getting them (CelesTrak's usage policy; Space-Track's
  agreement does not let an account holder pass data on, so it is not used). Elements more than 14 days from the moment shown (`maxAgeDays`) are left out. [docs/satellites.md](docs/satellites.md), the [satellites guide](docs/guides/satellites.md) (and in Japanese).
- **SGP4 about once a second, not once a frame**: satellite.js 6.0.2 (MIT, a new optional peer dependency; 10 KB gzipped, plain JavaScript; version 7 pulls WASM helper files that bundlers choke on) is run for the whole group at two moments a step apart, and every
  position between is an interpolation (a metre at 1 second, a few kilometres at 60). Above 60 times real time the groups are hidden and SGP4 does not run (`MAX_SATELLITE_SPEED`); a chosen satellite is still placed exactly. The package's own part is 2.7 KB minified
  for the maths and 5.1 KB for the drawing (3.6 KB gzipped together). A unit test checks that a satellite's longitude from the scene's axes and sidereal time agrees with satellite.js's own within 0.02 degree, and an end-to-end test centres the view under the ISS (worked
  out in the test) and finds it in the middle of the Earth's disc.
- **Budget, each line tested** (`e2e/satellites.gl.ts`, 6,000 made-up satellites spread round their orbits, together with the demo's 2,252 real ones): paused, 0 GL draw calls, 0 frame requests and 0 SGP4 calls in 3.5 s; at 60 times real time 29.0 frames a second, 8,242 SGP4 calls a second (one for
  each satellite), 34.2 GL draw calls a frame against 33.4 without the 6,000 (the group is one), 0.09 ms of JavaScript a frame on average and 2.6 ms for the longest SGP4 batch of 8,252; at real time 1.00 frames a second and 2,249 SGP4 calls a second for 2,252
  satellites; at 3,600 times real time the groups are hidden, 0 SGP4 calls and 29 frames a second; with reduced motion 1.00 frames a second at 60 times; nothing drawn out of sight or in a hidden tab; a group taken away frees its buffer; a lost context comes back with the
  satellites. The freeze test has a third look, the space view with satellites on, and its look-changing rounds show the stations and Starlink every time (GPU objects flat at 85 after the warm-up round). The ten-minute soak adds and removes the 6,000, chooses satellites and runs
  past the speed limit: 964 steps, JS heap 13.73 to 14.04 MB after garbage collection (while the 6,000 are on it is 20.4 MB, and it returns), GPU objects 123 to 123, 28.5 frames a second on average, one WebGL context. The soak and the new tests now run with no motion preference, at the full 30 frames a second.
- **Demo**: a "Satellites" row (Stations, Starlink, and Find: ISS, Tiangong) in the space look, and a line about what is chosen (name, height, speed, period, age of its elements). It uses **one snapshot of CelesTrak's lists from 2 November 2026** in a file of the demo site's own
  (`demo/celestrak-snapshot.json`, 330 KB, 105 KB gzipped, fetched only when a group is asked for): all 20 stations and every fifth Starlink satellite (2,232 of 11,156), credited on the page and in NOTICE.md. A snapshot more than 14 days old shows the day it was taken instead of today.
  `scripts/make-satellite-snapshot.mjs` makes the file from two downloaded lists and fetches nothing.
- **The space view in the embed** (`embed.html?look=space`): `time`, `speed` (still by default), `scale`, `body`, `zoom` (earth, moon, sun, inner, solar-system), `orbits`, `labels`, and `satellites=stations,starlink` with `sat=25544`. One context, a capped canvas, no controls, nothing but its own files, 0 draws at rest,
  at most 30 a second at a day a second, nothing in a hidden tab (`e2e/embed.gl.ts`). The embed guide, in both languages, lists them.
- **Japanese for the demo's space controls**: Space, Time, Scale, Go to, Look at, every body's name, Orbits, Names, the scale note, the body and satellite facts and the notices, through `demo/words.js`; the names drawn beside the bodies change too (`element.bodyNames`, `element.bodyHint`). A browser test opens the Japanese
  page and fails on any English word left in a control, apart from ISS, Starlink, CelesTrak, SGP4 and km.
- **Docs**: a satellites guide in English and Japanese, a page for the new entry point and every export (TSDoc and an example each), a usage example run by `pnpm test:usage` (a Vite page with the ISS on the space view, opened in a browser and made to place it; and the same elements in Node), README section, and screenshots.
- `ThreeParts` has an optional `Points`: a three.js subset handed over by `setThreeLoader` needs it only for satellites (the demo's `three-subset.ts` has it).
- The CHANGELOG of 0.7.0, whose published tarball showed the family-parts notes under the 0.6.0 heading, is as fixed in 6f26012; this entry is under its own heading.

## 0.7.0 - 2026-11-02

The space view can look at any body, bodies can be chosen, and how the Sun and the planets are drawn is a seam another package can fill.

- **Look at a body**: `element.body = "Mars"` (any of Earth, Moon, Sun and the seven planets) points the camera at it; at zoom 1 it fills the view, and the shared controls turn the camera round it and zoom in and out from it. The demo's "Look at" row does it.
- **Bodies can be chosen**: each name beside a body is a real button (Tab and Enter), and a press on a body (not a drag) fires `chikyu-body-click`; `chikyu-body-focus` for the keyboard. The event carries `name`, `radiusKm` and `distanceKm` (`element.bodyInfo(name)` gives the same for a caption); the demo prints "Jupiter: radius 69,911 km, 666,000,000 km from the Earth".
- **A seam for drawing the bodies** (`BodyPainter`, `setBodyPainter`, `plainPainter` from `@johnmorrisdotca/chikyu-earth/space`): the space view keeps each body's place, size, light direction, name and orbit, and asks a painter only for what to draw there (an object of radius 1; `light(toSun)` each draw; the Sun's turns to face the camera). The default is what 0.6.0 drew: spheres in the planets' colours and a glow for the Sun. John chose a separate package (wakusei-planets) for the bodies' own looks, so chikyu ships no planet pictures and no rings; the Earth and the Moon keep theirs.
- Tests: e2e (a body looked at, its name chosen by keyboard, a press on it chooses it, a drag that turns the view does not) and a unit test of the default painter.

### The family's published parts: demo, embed, docs and usage

Chikyu Earth now has what every package of the family has, and it was missing from 0.3.0 to 0.5.0.

- **Demo on GitHub Pages**, set as the repository's and the package's homepage: <https://johnmorrisdotca.github.io/chikyu-earth/>, with the family header (the kazoku-ui language picker, English and Japanese, and theme switch, the table cloths and the Help switch), light and dark, and the family footer. `pnpm site` builds it, and the Pages workflow publishes it on every push to `main`.
- **An embed page**, `embed.html`, for an `<iframe>` with no script of your own: `?look=line|thick|realistic`, `center`, `graticule`, `turn=0|1|auto`, `time`, `clouds`, `lights`. Still by default, no controls, no location prompt; it draws only when something changes and nothing while hidden. Tested in Chromium and WebKit, and on the realistic look: one WebGL context, canvas inside its budget, nothing drawn at rest.
- **A documentation site** at `/docs/`: a page for every export (from its TSDoc, with an example that is run when the site is built), ten guides in English and in Japanese, one language to a page, search, `llms.txt` and the family's header. Every export of every entry point has a summary, `@param`, `@returns` and an `@example` that imports the package by its name; `pnpm check` fails when one does not.
- **Every way to use it, written down and tested** (`pnpm test:usage`): a script tag from jsDelivr and from unpkg, the realistic Earth from a CDN, the shared controls, Vite, webpack, React (and a server render of it), Vue, Svelte, Angular, an iframe, TypeScript types and Node. Each example is built or run against the package as npm packs it, opened in a browser and made to show a globe; the guides and the README must hold the same text word for word.
- **`look` attribute**: `<chikyu-earth look="thick">` is the new name of `style`, which frameworks read as CSS (React refuses a string `style`). `style` still works.
- **Types for the tags**: `document.querySelector("chikyu-earth")` is a `ChikyuEarth` (and `"chikyu-earth-realistic"`, `"chikyu-space"`) once the element's entry is imported.
- **A freeze test in the release** (`e2e/freeze.demo.ts`, `pnpm test:freeze`): at rest nothing is drawn and no frame asked for, turning draws at most once for each frame of the page and asks for one frame at a time, out of sight or in a hidden tab nothing is drawn, the canvas stays inside 6 million pixels and 4096 a side on a 5K screen at a pixel ratio of 2 in the Earth from space and the space view, and six rounds of changing the look leave the GPU objects flat in one WebGL context and let the context go at the end. Every Chromium project draws WebGL in software, never on the machine's graphics card. The release workflow runs it (`freeze-command`, kazoku-ui 0.9.1).
- **The family's must-have list**, checked: `scripts/check-standard.mjs` (kazoku-ui's, unchanged) fails `pnpm check` when a package lacks its demo, embed page, docs site with Japanese twins, family files or tested usage.
- **Family files**: `family-template.mjs` and `family-readme.mjs` of 2026-11-02 with Chikyu Earth added to the family's list (33 packages), `family.css`, and the README's "The family" block. Added to the list here only; the other packages take the new files when they are next touched.

## 0.6.0 - 2026-11-02 (never published on its own: it ships in 0.7.0)

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

## 0.5.0 - 2026-11-02

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

## 0.4.0 - 2026-11-02

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

## 0.3.0 - 2026-11-01

The shared-controls integration is documented and covered in every motion preference, and the future of the
country data is written down.

- The README's new Controls section has the kazoku-ui snippet and the exact yaw/tilt/zoom/pan mapping. The browser
  suite now proves reduced motion leaves the globe still, as well as Auto-turn continuing after a zoom.
- Inspected chizu 1.5.1 from npm: `@johnmorrisdotca/chizu/world` is Miller-projected canvas data centred on 155°E,
  not longitude/latitude, so chikyu keeps its own Natural Earth 1:110m outlines and d3-geo.
  [docs/chizu-proposal.md](docs/chizu-proposal.md) proposes the `world-geo` export that would let it share chizu's
  data later.
- The demo and test servers move to this work's port block, 8200–8299.

## 0.2.0 - 2026-11-01

The globe now uses the family's shared view controls.

- `<kazoku-view-controls>` supplies turn, tilt, Auto-turn, Front, zoom, pan and touch gestures; the custom Rotate ¼
  button and the element's private rotation timer are gone.
- `projectionView()` maps yaw and tilt to the orthographic rotation, zoom to its scale and pan to its translation,
  always relative to the reader's home centre. `<chikyu-earth>.setView()` applies that state.
- Auto-turn runs at `0.004178` degrees a second, the Earth's own sidereal rate, and keeps running through zoom,
  pan, Fit and Front. Reduced motion is respected by kazoku-ui.
- Browser tests now cover Chromium and WebKit at desk and phone sizes, including drag, pinch, zoom, Fit and the
  continuing Earth-rate turn.

## 0.1.0 - 2026-11-01

The first scaffold, and the first working globe.

- `globe()` draws an orthographic globe as an SVG string: an ocean disc, the country outlines and the rim,
  in two line styles (`line`, `thick`), with an optional graticule.
- `<chikyu-earth>` puts that globe on a page as a web component. It opens centred on where you are
  (the `center` attribute wins over geolocation) and turns at the Earth's own rate — one sidereal day,
  23 h 56 min 4.0905 s, per revolution.
- Country outlines are Natural Earth's, baked into the package at build time; each carries its English and
  Japanese name and ISO alpha-2 code from kuni. d3-geo does the projection, the only runtime dependency.
- A demo (`pnpm dev`), unit tests, a package check and a Playwright demo test, with CI to run them.
