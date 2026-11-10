# Chikyu Earth — docs

The documentation site, with every export's page, the guides in English and Japanese and search, is at <https://johnmorrisdotca.github.io/chikyu-earth/docs/>. Its guides are the files in [guides/](guides/getting-started.md) (Japanese: [guides/ja/](guides/ja/getting-started.md)). The pages below are the feature notes.

- **The Earth from space** — [realistic.md](realistic.md): `<chikyu-earth-realistic>`, its pictures, the Sun, the budget and how each part of it is tested; [guides/full-screen-and-camera.md](guides/full-screen-and-camera.md) for the full-screen mode, the camera held in the stars and every satellite group on it.
- **Two packages** — [guides/two-packages.md](guides/two-packages.md): why the Earth is here and the rest of the solar system is in wakusei-planets, and how to use one or both (Japanese: [guides/ja/two-packages.md](guides/ja/two-packages.md)).
- **The space view** — [space.md](space.md): `<chikyu-space>`, the Sun, the Moon and the planets, both scales, time, and the budget. [satellite-sources.md](satellite-sources.md) is the research on satellite and launch data (no code).
- **Satellites** — [satellites.md](satellites.md): `createSatellites(elements)` and `setSatellites` on the space view, the catalogue of groups and famous satellites, `fetchElements` and `parseElements` for a source of your own, the demo's six-hourly refresh, the budget and how each part is tested; [guides/satellites.md](guides/satellites.md) is the guide, and [satellite-sources.md](satellite-sources.md) has every source's terms read and quoted.
- **Passes** — [guides/passes.md](guides/passes.md): `findPasses`, `skySvg`, `groundTrack` and `<chikyu-passes>`: when a satellite crosses the sky over a place, how it was checked against Skyfield, and why passes need fresh elements (Japanese: [guides/ja/passes.md](guides/ja/passes.md)).
- **Riding along** — [ride-along.md](ride-along.md): `element.ride(target)`, the camera at a satellite, the Moon or a planet; [guides/ride-along.md](guides/ride-along.md) is the guide.
- **Markers** — [markers.md](markers.md): `attachMarkers(element)`, groups, clusters, labels, events and the budget.
- **The element** — `<chikyu-earth>` and its attributes are in the [README](../README.md#the-element).
- **Drawing a string** — `globe(options)` returns the SVG. Options: `size`, `rotation`, `style`, `graticule`,
  or `centre` and `view` for the shared controls' camera.
- **The shared view** — `src/view.ts` maps `{ yaw, tilt, zoom, panX, panY }` to d3-geo. If the home centre is
  `(lon, lat)`, the rotation is `[-lon + yaw, -lat + tilt]`, the scale is the base scale times `zoom`, and the
  translation is the view's middle plus `(panX, panY)`. `HOME_VIEW` is yaw and tilt zero, 1x and no pan, so kazoku's
  Front returns to the home centre and Fit returns to 1x. The element carries the drag, pinch, wheel and keys itself (see
  [zoom, pan and turn](guides/zoom-and-pan.md)); the demo adds `<kazoku-view-controls>` with `speed="0.004178"` and
  `autoplay` for the Earth's rate. `setView` redraws intermediate Auto-turn frames once a second and other settled views immediately.
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
