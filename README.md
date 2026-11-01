<h1 align="center">Chikyu Earth <sub>地球</sub></h1>

<p align="center"><strong>A line-drawn globe that turns at the Earth's own rate, and opens centred on where you are.</strong><br>
Country outlines in the same thin-line style as Hako Devices and Uchusen Rockets: an orthographic disc, the countries drawn on it, and the rim. One SVG, no canvas.</p>

<p align="center">
  <a href="https://github.com/johnmorrisdotca/chikyu-earth/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/johnmorrisdotca/chikyu-earth/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-2f5d4a"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/types-TypeScript-3178c6">
</p>

## One minute

```sh
npm install @johnmorrisdotca/chikyu-earth
```

```html
<script type="module">
  import "@johnmorrisdotca/chikyu-earth/element";
</script>

<chikyu-earth size="420"></chikyu-earth>
```

The globe appears, centred on the reader (the browser asks for their location; until they answer, and if they
decline, it starts on the Greenwich meridian). It then turns at the Earth's own rate: one sidereal day —
23 h 56 min 4.0905 s — per revolution, so it keeps real time.

Centre it yourself instead, and it still turns:

```html
<chikyu-earth center="139.7,35.7" style="thick" graticule></chikyu-earth>
```

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
| `rotate` | `off` holds the globe still on its centre. | turns at the Earth's rate |

## The data

Every country the globe draws is in the package, baked in at build time — nothing is fetched at runtime.
The outlines are **Natural Earth**'s (public domain), and each carries its English and Japanese name and ISO
alpha-2 code from **kuni**. `COUNTRIES` is the GeoJSON, and `countryList()` is just the names and codes:

```ts
import { countryList } from "@johnmorrisdotca/chikyu-earth";

countryList().find((c) => c.alpha2 === "JP"); // { name: "Japan", ja: "日本", alpha2: "JP" }
```

To refresh the outlines after a Natural Earth or kuni update, run `pnpm countries` and commit
`src/data/countries.ts`.

## The rest

[CONTRIBUTING.md](CONTRIBUTING.md) · [docs/](docs/index.md) · [NOTICE.md](NOTICE.md) ·
[CHANGELOG.md](CHANGELOG.md) · MIT licence. Projection by d3-geo, the one runtime dependency.
