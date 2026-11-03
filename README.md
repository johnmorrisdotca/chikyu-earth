<h1 align="center">Chikyu Earth <sub>地球</sub></h1>

<p align="center"><strong>A line-drawn globe that turns at the Earth's own rate, and opens centred on where you are.</strong><br>
Country outlines in the same thin-line style as Hako Devices and Uchusen Rockets: an orthographic disc, the countries drawn on it, and the rim. One SVG, no canvas.</p>

<p align="center">
  <a href="https://github.com/johnmorrisdotca/chikyu-earth/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/johnmorrisdotca/chikyu-earth/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-2f5d4a"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/types-TypeScript-3178c6">
</p>

<p align="center"><a href="https://johnmorrisdotca.github.io/chikyu-earth/"><strong>Open the demo →</strong></a> · <a href="https://johnmorrisdotca.github.io/chikyu-earth/embed.html">Embed page</a> · <a href="https://johnmorrisdotca.github.io/chikyu-earth/docs/">Docs</a></p>

<p align="center"><img alt="The line-drawn globe, Europe and Africa in view, with the shared control bar" src="docs/images/line-desk.png" width="640"></p>

## Install and use

```sh
npm install @johnmorrisdotca/chikyu-earth
```

Or use no install at all: every example below was run in a browser, built or type-checked by `pnpm test:usage` against the package as npm packs it, and the guides hold the same text.

### In a plain HTML page

One script tag from [jsDelivr](https://www.jsdelivr.com/package/npm/@johnmorrisdotca/chikyu-earth) and the tag. (From unpkg, with the realistic Earth, and pinning a version: [the CDN guide](docs/guides/html-and-cdn.md).)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth from jsDelivr</title>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/element/+esm"></script>
  </head>
  <body>
    <chikyu-earth center="139.7,35.7" look="thick" graticule size="320"></chikyu-earth>
  </body>
</html>
```

The globe appears centred where you say; with no `center` it centres on the reader (the browser asks for their location; until they answer, and if they decline, it starts on the Greenwich meridian). `look` is `line` or `thick`.

### With the shared controls

The [kazoku-ui](https://github.com/johnmorrisdotca/kazoku-ui) view controls turn, tip, zoom and pan it, and keep the view in the address. One listener passes their camera on:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth with the shared controls</title>
    <script type="module">
      import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/kazoku-ui/view-controls/define/+esm";
      import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/element/+esm";

      const earth = document.querySelector("chikyu-earth");
      document.querySelector("kazoku-view-controls").addEventListener("kazoku-viewchange", (event) => {
        earth.setView(event.detail, event.detail.final);
      });
    </script>
  </head>
  <body>
    <div id="globe" tabindex="0">
      <chikyu-earth size="420" look="thick" center="139.7,35.7"></chikyu-earth>
    </div>
    <kazoku-view-controls for="globe" address controls="advanced" tilt-max="90" speed="0.004178"></kazoku-view-controls>
  </body>
</html>
```

Auto-turn (add `autoplay`) moves at the Earth's own rate: `0.004178` degrees a second, one sidereal day — 23 h 56 min 4.0905 s — per revolution.

### In React

The element needs a browser, so it is imported inside the effect, never at the top of the file; that keeps a server render working. (Vue, Svelte and Angular do the same: [the frameworks guide](docs/guides/frameworks.md).)

```tsx
import { useEffect, useRef } from "react";

export function ChikyuEarth({ center = "139.7,35.7", look = "thick" }: { center?: string; look?: "line" | "thick" }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The element needs a browser, so it is imported here, never at the top of the file: a server render never reaches an effect.
    void import("@johnmorrisdotca/chikyu-earth/element");
  }, []);
  return (
    <div ref={host}>
      <chikyu-earth center={center} look={look} graticule />
    </div>
  );
}
```

### Every other way

| How | Where |
|---|---|
| A script tag from jsDelivr or unpkg, the realistic Earth from a CDN | [CDN guide](docs/guides/html-and-cdn.md) |
| An ES module in Vite or webpack | [bundlers guide](docs/guides/bundlers.md) |
| React, Vue, Svelte, Angular; Next.js, Nuxt, SvelteKit | [frameworks guide](docs/guides/frameworks.md) |
| An `<iframe>` of the embed page, no script of your own | [iframe guide](docs/guides/embed-in-an-iframe.md) |
| TypeScript types, an SVG string on a server, Node | [TypeScript and Node guide](docs/guides/typescript-and-node.md) |
| The web component (`<chikyu-earth>`, `<chikyu-earth-realistic>`) | every one of the above; its attributes are in [The element](#the-element) |
| Something does not appear | [troubleshooting](docs/guides/troubleshooting.md) |

The guides are also in Japanese (日本語), one language to a page: [docs/guides/ja/](docs/guides/ja/getting-started.md).

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

## The Sun, the Moon and the planets

`<chikyu-space>` (`@johnmorrisdotca/chikyu-earth/space/element`) places the Earth, the Moon, the Sun and the planets where they are at a date and time, with the Moon's phase and the Earth's day side
from the light, a compressed scale you can read (and a true one that shows how empty it is), time that runs forwards or backwards, and a zoom from the Earth to the solar system. Positions are
computed in the browser by astronomy-engine (MIT), nothing is fetched. [docs/space.md](docs/space.md).

<p align="center"><img alt="The solar system on 2 November 2026 in the compressed scale: orbits round the Sun, the planets named" src="docs/images/space-solar.png" width="420"></p>

## Satellites

The ISS, a space station or thousands of Starlink satellites at the places SGP4 puts them for the date and time shown, on `<chikyu-space>`: a group is one draw call however many it holds, press one to get its name, height and speed, and its orbit is drawn. Chikyu fetches nothing: your page passes in orbital elements (CelesTrak's JSON, within its usage policy), and satellite.js (MIT, an optional peer) does the maths about once a second, with every frame between interpolated. A group is hidden while the clock runs faster than 60 times real time. The guide has the rules for getting elements and the budget, each line tested: [satellites guide](docs/guides/satellites.md), [docs/satellites.md](docs/satellites.md).

<p align="center"><img alt="The ISS, ringed, over South Africa on 3 November 2026, with its orbit and the stations' orbits" src="docs/images/space-sat-iss.png" width="420"></p>

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

const elements: ElementSet[] = await (await fetch("/my-celestrak-copy.json")).json();
document.querySelector("chikyu-space")!.setSatellites("stations", createSatellites(elements), { orbits: true });
```

## Riding along

<p align="center"><img alt="Riding along with the ISS, tipped towards the horizon: the Earth's curve and atmosphere, and the orbits of the other stations in the sky" src="docs/images/space-ride-horizon.png" width="420"></p>

`space.ride({ group: "stations", index: 0 }, { look: "horizon" })` puts the camera on the ISS (or a Starlink satellite, the Moon, a planet) at its real place for the moment shown and looks at the Earth, which goes by beneath
as the body moves along its orbit; switch to another body and the camera glides there. Straight down or toward the horizon, from the body or following it at a distance, time faster or slower. It animates continuously, so it keeps to the
same budget: at most 30 frames a second (one a second for reduced motion), nothing drawn while paused, out of sight or hidden. [Ride along guide](docs/guides/ride-along.md), [docs/ride-along.md](docs/ride-along.md).

## Markers

Mark any place at `[lon, lat]` with a label, colour or icon, in groups you can show or hide, on either look. Chikyu ships no places; yours move with the globe, fade on the far side, make room
for their labels, gather into clusters when crowded, and fire hover, click and keyboard events with your own data. One canvas pass for thousands, a pool of 24 buttons for the labels. [docs/markers.md](docs/markers.md).

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
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

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import "@johnmorrisdotca/kazoku-ui/view-controls/define";
import type { ViewChangeDetail } from "@johnmorrisdotca/kazoku-ui/view-controls/element";

const earth = document.querySelector("chikyu-earth")!;
document.getElementById("controls")!.addEventListener("kazoku-viewchange", (event) => {
  const { yaw, tilt, zoom, panX, panY, final } = (event as CustomEvent<ViewChangeDetail>).detail;
  earth.setView({ yaw, tilt, zoom, panX, panY }, final);
});
```

The mapping is `rotate([lambda0 + yaw, phi0 + tilt])`, `scale(baseScale * zoom)` and
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
| `look` | `line` or `thick`. (`style` is the older name for it: a framework reads `style` as CSS, so use `look` there.) | `line` |
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

## The name

Chikyu (地球, ちきゅう) is Japanese for the Earth.

## The family

<!-- family:start (made by scripts/family-readme.mjs from scripts/family-template.mjs; change those, not this) -->
Chikyu Earth is one of thirty-three packages, each made for the same site, each at
[github.com/johnmorrisdotca](https://github.com/johnmorrisdotca) or [github.com/spxis](https://github.com/spxis). The code of every one is MIT.

**Games — board**

- [Domino](https://github.com/johnmorrisdotca/domino) (ドミノ): dominoes and Mexican Train. [Demo](https://johnmorrisdotca.github.io/domino/).
- [Gunjin](https://github.com/johnmorrisdotca/gunjin) (軍人): five hidden-rank strategy games with pass-the-device play. [Demo](https://johnmorrisdotca.github.io/gunjin/).
- [Narabe](https://github.com/johnmorrisdotca/narabe) (並べ): one rules engine for abstract board games, from gomoku and Reversi to Go and checkers. [Demo](https://johnmorrisdotca.github.io/narabe/).
- [Sugoroku](https://github.com/johnmorrisdotca/sugoroku) (双六): backgammon and its variants, with the doubling cube and match play. [Demo](https://johnmorrisdotca.github.io/sugoroku/).
- [Tenka](https://github.com/johnmorrisdotca/tenka) (天下): world conquest for two to six, on a map of the real world. [Demo](https://johnmorrisdotca.github.io/tenka/).

**Games — cards & tiles**

- [Hitotsu](https://github.com/johnmorrisdotca/hitotsu) (一つ): a colour-card shedding game for two to eight, with the house rules people play. [Demo](https://johnmorrisdotca.github.io/hitotsu/).
- [Jarajara](https://github.com/johnmorrisdotca/jarajara) (ジャラジャラ): mahjong tiles drawn as SVG, stacked layouts, and the matching solitaire Awase. [Demo](https://johnmorrisdotca.github.io/jarajara/).
- [Kumimoji](https://github.com/johnmorrisdotca/kumimoji) (組み文字): a crossword tile race, in English and Japanese kana. [Demo](https://johnmorrisdotca.github.io/kumimoji/).
- [Toranpu](https://github.com/johnmorrisdotca/toranpu) (トランプ): a deck of playing cards, card games with computer players, and solitaires. [Demo](https://johnmorrisdotca.github.io/toranpu/).

**Games — puzzles**

- [Houseki](https://github.com/johnmorrisdotca/houseki) (宝石): gem and stone matching puzzles: falling triplets, stone collapse, colour chains and gem swap. [Demo](https://johnmorrisdotca.github.io/houseki/).
- [Jirai](https://github.com/johnmorrisdotca/jirai) (地雷): minesweeper on shaped grids with verified no-guess boards. [Demo](https://johnmorrisdotca.github.io/jirai/).
- [Karakuri](https://github.com/johnmorrisdotca/karakuri) (からくり): eight hyper-casual puzzle games, some of them physics: draw a shield, pull pins, cut ropes, slide blocks, pour tubes. [Demo](https://johnmorrisdotca.github.io/karakuri/).
- [Kazu](https://github.com/johnmorrisdotca/kazu) (数): grid number puzzles: Sudoku and its variants, Futoshiki and Skyscrapers. [Demo](https://johnmorrisdotca.github.io/kazu/).
- [Kyuubu](https://github.com/johnmorrisdotca/kyuubu) (キューブ): a turning cube for the browser, 2×2 to 7×7, with record solves to replay. [Demo](https://johnmorrisdotca.github.io/kyuubu/).
- [Meikyuu](https://github.com/johnmorrisdotca/meikyuu) (迷宮): mazes on squares, hexagons, triangles and circles, made from a seed and drawn through with a finger or the mouse. [Demo](https://johnmorrisdotca.github.io/meikyuu/).
- [Suido](https://github.com/johnmorrisdotca/suido) (水道): a pipe puzzle: turn the pieces until the water reaches every drain. [Demo](https://johnmorrisdotca.github.io/suido/).
- [Tobiishi](https://github.com/johnmorrisdotca/tobiishi) (飛び石): peg solitaire with nine boards and seeded solvable challenges. [Demo](https://johnmorrisdotca.github.io/tobiishi/).
- [Tsunagi](https://github.com/johnmorrisdotca/tsunagi) (繋ぎ): a line-joining logic puzzle whose every level has exactly one answer. [Demo](https://johnmorrisdotca.github.io/tsunagi/).

**Games — dice & random**

- [Korokoro](https://github.com/johnmorrisdotca/korokoro) (コロコロ): dice, with notation, exact odds, real sounds and the dice of many games. [Demo](https://johnmorrisdotca.github.io/korokoro/).
- [Tane](https://github.com/johnmorrisdotca/tane) (種): seeded random numbers and daily seeds, the same in every browser and on every server. [Demo](https://johnmorrisdotca.github.io/tane/).

**Language**

- [Bushu](https://github.com/johnmorrisdotca/bushu) (部首): find a kanji by the parts it is made of. [Demo](https://johnmorrisdotca.github.io/bushu/).
- [Hikidashi](https://github.com/johnmorrisdotca/hikidashi) (引き出し): a drawer of small Japanese text tools: era dates, kanji numerals, readings and sentence difficulty. [Demo](https://johnmorrisdotca.github.io/hikidashi/).
- [Kotoba](https://github.com/johnmorrisdotca/kotoba) (言葉): word lists and word-game rules in English, French, German and Japanese. [Demo](https://johnmorrisdotca.github.io/kotoba/).

**Geography & data**

- [address-plus](https://github.com/johnmorrisdotca/address-plus) (アドレスプラス): parse and format addresses in the United States, Canada, Japan, Australia, France, Germany and the United Kingdom. [Demo](https://johnmorrisdotca.github.io/address-plus/).
- [Chikyu Earth](https://github.com/johnmorrisdotca/chikyu-earth) (地球): a line-drawn globe that turns at the Earth's own rate, with an optional realistic Earth from space and markers for any place. [Demo](https://johnmorrisdotca.github.io/chikyu-earth/).
- [Chizu](https://github.com/johnmorrisdotca/chizu) (地図): maps of the world and of countries' regions, in English and Japanese, with a quiz and callouts. [Demo](https://johnmorrisdotca.github.io/chizu/).
- [Hata](https://github.com/johnmorrisdotca/hata) (旗): country and regional flags as SVG, at their true proportions and keyed by ISO code. [Demo](https://johnmorrisdotca.github.io/hata/).
- [Kuni](https://github.com/johnmorrisdotca/kuni) (国): countries and their regions, with ISO codes and names in English and Japanese. [Demo](https://johnmorrisdotca.github.io/kuni/).

**Sports**

- [Dougu Sports](https://github.com/johnmorrisdotca/dougu-sports) (道具): sports emblems as SVG: trophies, medals, crests, and the ball and gear of every sport, with optional 3D turning. [Demo](https://johnmorrisdotca.github.io/dougu-sports/).
- [Kyogijo Stadiums](https://github.com/johnmorrisdotca/kyogijo-stadiums) (競技場): sports fields, rinks, courts and ballparks drawn to scale as SVG, with each team and the score on them. [Demo](https://johnmorrisdotca.github.io/kyogijo-stadiums/).
- [Senshu Jerseys](https://github.com/johnmorrisdotca/senshu-jerseys) (選手): sports jerseys, sweaters, kits, caps, helmets and retired-number banners as SVG, front and back, with optional 2.5D turning. [Demo](https://johnmorrisdotca.github.io/senshu-jerseys/).
- [Taisen Brackets](https://github.com/johnmorrisdotca/taisen-brackets) (対戦): a sport-agnostic tournament bracket, drawn as SVG, from a list of ties. [Demo](https://johnmorrisdotca.github.io/taisen-brackets/).

**Developer tools**

- [REST in Pieces](https://github.com/spxis/rest-in-pieces) (レスト・イン・ピーシーズ): seeded test data and REST APIs for frontend development, with latency and error drills. [Demo](https://spxis.github.io/rest-in-pieces/).


**This package is Chikyu Earth.** The demos of all thirty-three share one header and footer, so each links the rest.
<!-- family:end -->

## The rest

[CONTRIBUTING.md](CONTRIBUTING.md) · [docs/](docs/index.md) · [NOTICE.md](NOTICE.md) ·
[CHANGELOG.md](CHANGELOG.md) · MIT licence. Dependencies: d3-geo and chizu (MIT); shared view controls are
John Morris's kazoku-ui (MIT).
