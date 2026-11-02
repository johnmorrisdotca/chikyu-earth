# Chikyu Earth — docs

- **The Earth from space** — [realistic.md](realistic.md): `<chikyu-earth-realistic>`, its pictures, the Sun, the budget and how each part of it is tested.
- **Markers** — [markers.md](markers.md): `attachMarkers(element)`, groups, clusters, labels, events and the budget.
- **The element** — `<chikyu-earth>` and its attributes are in the [README](../README.md#the-element).
- **Drawing a string** — `globe(options)` returns the SVG. Options: `size`, `rotation`, `style`, `graticule`,
  or `centre` and `view` for the shared controls' camera.
- **The shared view** — `src/view.ts` maps `{ yaw, tilt, zoom, panX, panY }` to d3-geo. If the home centre is
  `(lon, lat)`, the rotation is `[-lon + yaw, -lat - tilt]`, the scale is the base scale times `zoom`, and the
  translation is the view's middle plus `(panX, panY)`. `HOME_VIEW` is yaw and tilt zero, 1x and no pan, so kazoku's
  Front returns to the home centre and Fit returns to 1x. The demo uses `<kazoku-view-controls>` with
  `speed="0.004178"` and `autoplay` for the Earth's rate; it redraws intermediate Auto-turn frames once a second
  and other settled views immediately.
- **The turn** — `src/rotate.ts` holds the Earth's rate. `SIDEREAL_DAY_MS` is one sidereal day
  (86,164,090.5 ms); `spinAt(ms)` is degrees turned; `centreRotation(point)` centres a place;
  `rotationAt(centre, now, start)` is a globe that started centred and keeps turning. The tilt is held and only
  the spin advances, so a centred place drifts exactly as the real Earth turns under it.
- **The looks** — `src/styles.ts`: `line` and `thick`, the same line colours as Hako Devices and Uchusen Rockets.
- **The data** — `src/countries.ts` shapes `@johnmorrisdotca/chizu/world-geo` (Natural Earth 1:110m, 177 features)
  into `COUNTRIES`; chizu holds the names and codes. See [NOTICE.md](../NOTICE.md) for provenance and licences.
- **chizu's outlines** — done in 0.4.0 with chizu 1.6.0's `world-geo`; [chizu-proposal.md](chizu-proposal.md) keeps
  the record of why 1.5.1 could not feed this globe.

## How the drawing works

`globe()` builds a d3-geo `geoOrthographic` projection, rotated to `[lambda, phi]`, scaled to the disc. d3-geo clips
every country to the visible hemisphere and returns an SVG path; the ocean disc is the same path of the whole
sphere, drawn first, and the rim is that path stroked on top. No canvas, no image, no runtime fetch.
