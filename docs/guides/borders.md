---
title: "Borders on the Earth"
section: how-to
order: 20
description: "Draw the borders between countries on the realistic Earth and the space view, from chizu's outlines, and a page's own provinces and states once the Earth is large enough to tell them apart: thin lines that turn with the Earth, by day and by night, loaded only when asked for."
---

`<chikyu-earth-realistic>` and `<chikyu-space>` can draw the borders on the land as thin lines that turn with the Earth, above the clouds and under the air, readable on the day side and the night side. Only the borders between two shapes are drawn: a coast is not, since the picture already shows it.

```html
<chikyu-earth-realistic borders="countries" style="width: 420px"></chikyu-earth-realistic>
```

| Attribute | Means |
|---|---|
| `borders="countries"` | The borders between countries, at any size. |
| `borders="regions"` | The borders between a country's regions (provinces, states, prefectures), once the Earth is large enough on the screen. |
| `borders` | Both. Absent, none. |

The property `borders` reads and writes the same as `{ countries, regions }`.

- **The countries are chizu's.** They come from [chizu](https://github.com/johnmorrisdotca/chizu)'s `world-geo` entry (`@johnmorrisdotca/chizu/world-geo`): Natural Earth's countries at 1:110m (public domain), the same outlines the line globe draws. They are loaded with a dynamic import the first time a set is switched on, so a page that never asks loads nothing for them; a page that also shows the line globe has them already.
- **The regions are the page's, for now.** chizu's regions are drawn for flat maps, each on a canvas of its own, and cannot be laid on a sphere yet. A page that has the regions of a country in longitude and latitude hands them over as `borderData.regions`: a function that takes a country's code and gives a GeoJSON `FeatureCollection` of its regions, or `null` for a country it has none for. Without it no regions are drawn. Set `borderData` before switching `borders` on.

```js no-run
const earth = document.querySelector("chikyu-earth-realistic");
earth.borderData = {
  regions: async (code) => (code === "JP" ? (await fetch("/regions/jp.json")).json() : null),
};
earth.borders = { countries: true, regions: true };
```

- **Regions when they can be told apart.** The regions are drawn once the Earth's radius on the screen is 900 CSS pixels or more (`BORDER_REGIONS_RADIUS`, about 7 km to a pixel), and only the countries near the middle of the view are asked for, each once. Zoom out and they are put away; the countries' borders stay at any size.
- **Countries without regions.** Where the page gives no regions for a country, only its border with its neighbours is drawn.
- **Borders that are disputed.** Natural Earth draws the borders as they are held on the ground (de facto), not as any one country claims them, and says so; these lines are the same. They are not a statement about any claim.
- **Not installed.** When the shapes cannot be loaded (chizu is missing, or a page's `borderData.countries` fails), `chikyu-borders-unavailable` is sent with the reason, no line is drawn, and the Earth goes on as before. A three.js handed over without `LineSegments` is told the same way.

## What it costs

Measured on 2026-11-11 with esbuild (minified, gzip level 9) and in Chromium:

| | Size |
|---|---|
| The borders' code in each element | 5.2 kB minified, 1.8 kB gzipped |
| chizu's `world-geo`, loaded when a set is first switched on | 166 kB minified, 44.3 kB gzipped |
| The countries' lines on the GPU | 3,012 segments: one vertex buffer of 72 kB |

Each set is one batch of lines: one draw call for the countries, one for the regions, whatever the number of countries. The lines are made when the shapes arrive and never again; nothing is drawn at rest, and a set arriving asks for one draw. `stats.borders` has `countries` and `regions` (segments), `shown`, `loaded` (the countries whose regions arrived), `builds` and `failed`.

The pure parts need no browser: `sharedEdges`, `shapeBoxes`, `codesNear` and `readBorders` in `@johnmorrisdotca/chikyu-earth/realistic` find the borders of any set of shapes and which of them a view can reach.
