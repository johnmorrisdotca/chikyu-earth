# Changelog

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
