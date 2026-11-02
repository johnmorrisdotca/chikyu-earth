# Changelog

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
