# Changelog

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
