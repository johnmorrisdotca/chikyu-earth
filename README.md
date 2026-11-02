<h1 align="center">Chikyu Earth <sub>地球</sub></h1>

<p align="center"><strong>A line-drawn globe that turns at the Earth's own rate, and opens centred on where you are.</strong><br>
Country outlines in the same thin-line style as Hako Devices and Uchusen Rockets: an orthographic disc, the countries drawn on it, and the rim. One SVG, no canvas.</p>

<p align="center">
  <a href="https://github.com/johnmorrisdotca/chikyu-earth/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/johnmorrisdotca/chikyu-earth/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-2f5d4a"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/types-TypeScript-3178c6">
</p>

<p align="center"><img alt="The line-drawn globe, Europe and Africa in view, with the shared control bar" src="docs/images/line-desk.png" width="640"></p>

## One minute

```sh
npm install @johnmorrisdotca/chikyu-earth
```

```html
<script type="module">
  import "@johnmorrisdotca/kazoku-ui/view-controls/define";
  import "@johnmorrisdotca/chikyu-earth/element";
</script>

<div id="globe" tabindex="0">
  <chikyu-earth size="420"></chikyu-earth>
</div>
<kazoku-view-controls id="controls" for="globe" address controls="advanced" tilt-max="90" speed="0.004178" autoplay></kazoku-view-controls>

<script type="module">
  const earth = document.querySelector("chikyu-earth");
  document.getElementById("controls").addEventListener("kazoku-viewchange", (event) => {
    earth.setView(event.detail, event.detail.final);
  });
</script>
```

The globe appears, centred on the reader (the browser asks for their location; until they answer, and if they
decline, it starts on the Greenwich meridian). The shared control bar turns, tips, zooms and pans it. Auto-turn
moves at the Earth's own rate: `0.004178` degrees a second, one sidereal day — 23 h 56 min 4.0905 s — per revolution.

Centre it yourself instead:

```html
<chikyu-earth center="139.7,35.7" style="thick" graticule></chikyu-earth>
```

## The Earth from space

An optional second look, for a page with room for a real picture: day and night by the real Sun, cities' lights, a sun glint on the sea, a cloud layer and the
atmosphere at the rim, drawn with three.js through kazoku-ui's shared renderer. It is its own entry point, so the line globe above costs nothing extra.

<p align="center"><img alt="The Earth from space: Asia and the Pacific by day, with clouds and the sun glint" src="docs/images/realistic-desk.png" width="560"></p>

```html
<script type="module">
  import "@johnmorrisdotca/chikyu-earth/realistic/element";
</script>
<chikyu-earth-realistic center="139.7,35.7" time="2026-06-21T03:00Z" texture-base="/textures/"></chikyu-earth-realistic>
```

Needs `three` and `@johnmorrisdotca/kazoku-ui` (both optional peers) and the pictures (1.6 MB, from NASA, in `dist/textures/`). It draws nothing while nothing changes,
at most 30 times a second while it does, in one WebGL context, with textures that grow as you zoom and are freed after. All of it, the budget and the tests:
[docs/realistic.md](docs/realistic.md).

## Markers

Mark any place at `[lon, lat]` with a label, colour or icon, in groups you can show or hide, on either look. Chikyu ships no places; yours move with the globe, fade on the far side, make room
for their labels, gather into clusters when crowded, and fire hover, click and keyboard events with your own data. One canvas pass for thousands, a pool of 24 buttons for the labels. [docs/markers.md](docs/markers.md).

```ts
import { attachMarkers } from "@johnmorrisdotca/chikyu-earth/markers";

const markers = attachMarkers(document.querySelector("chikyu-earth")!);
markers.add({ id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo", group: "Cities" });
```

## Controls

The shared [kazoku-ui view controls](https://github.com/johnmorrisdotca/kazoku-ui) supply every hand and button:
drag to turn, tilt up to either pole, zoom, pan, touch pinch, Front and Fit. Chikyu does not draw its own zoom,
rotate or drag controls.

```html
<div id="globe" tabindex="0"><chikyu-earth size="420"></chikyu-earth></div>
<kazoku-view-controls id="controls" for="globe" address controls="advanced" tilt-max="90" speed="0.004178" autoplay></kazoku-view-controls>
```

```ts
import "@johnmorrisdotca/kazoku-ui/view-controls/define";

const earth = document.querySelector("chikyu-earth");
document.getElementById("controls").addEventListener("kazoku-viewchange", (event) => {
  const { yaw, tilt, zoom, panX, panY, final } = event.detail;
  earth.setView({ yaw, tilt, zoom, panX, panY }, final);
});
```

The mapping is `rotate([lambda0 + yaw, phi0 - tilt])`, `scale(baseScale * zoom)` and
`translate([cx + panX, cy + panY])`, where `lambda0` and `phi0` are the home centre. Front returns to that home
view. Auto-turn's `0.004178` degrees a second is 360° per sidereal day; kazoku-ui leaves it still for a reader who
prefers reduced motion, and a drag or zoom never stops or resets it.

## Draw one as a string

`globe()` returns the SVG markup, so a server, a build step or a test can draw the same globe with no DOM:

```ts
import { globe } from "@johnmorrisdotca/chikyu-earth";

const svg = globe({ size: 320, rotation: [-139.7, -35.7], style: "line" });
```

The rotation is the pair d3-geo's `rotate` takes: `[-longitude, -latitude]` centres that place. The helpers in
`rotate.ts` do the time maths — `SIDEREAL_DAY_MS`, `spinAt(ms)`, `centreRotation(point)` and
`rotationAt(centre, now, start)`.

## The element

| Attribute | What it does | Default |
| --- | --- | --- |
| `size` | Width and height of the square SVG, in pixels. | `320` |
| `center` | `"longitude,latitude"` to centre on. Wins over geolocation. | the reader's location, else `0,0` |
| `style` | `line` or `thick`. | `line` |
| `graticule` | Draw a light graticule under the countries. | off |

`setView(view, final = true)` applies a shared controller's `{ yaw, tilt, zoom, panX, panY }`. Every call updates
the state; pass `final: false` for the cheap relative transform during a gesture and `final: true` for the full
projection redraw. `projectionView(centre, size, view)` is the same mapping as a pure function: yaw is added to the
home longitude, tilt is subtracted from its latitude, zoom multiplies the scale, and pan offsets the translation.
Front is therefore the home centre; Fit is 1x with no pan.

## The data

Every country the globe draws comes from [chizu](https://github.com/johnmorrisdotca/chizu)'s `world-geo` entry
(`@johnmorrisdotca/chizu/world-geo`): **Natural Earth** 1:110m (public domain) as longitude and latitude, with
chizu's English and Japanese names. Nothing is fetched at runtime. `COUNTRIES` is that GeoJSON (177 features,
Antarctica included); `countryList()` is just the names and codes. `alpha2` is the two-letter code, `XK` for Kosovo,
and `null` for Northern Cyprus and Somaliland, which have none:

```ts
import { countryList } from "@johnmorrisdotca/chikyu-earth";

countryList().find((c) => c.alpha2 === "JP"); // { name: "Japan", ja: "日本", alpha2: "JP" }
```

To take newer outlines, update `@johnmorrisdotca/chizu`; there is no data file in this repository.

## The rest

[CONTRIBUTING.md](CONTRIBUTING.md) · [docs/](docs/index.md) · [NOTICE.md](NOTICE.md) ·
[CHANGELOG.md](CHANGELOG.md) · MIT licence. Dependencies: d3-geo and chizu (MIT); shared view controls are
John Morris's kazoku-ui (MIT).
