---
title: "Borders on the Earth"
section: how-to
order: 20
description: "Draw the borders between countries on the realistic Earth and the space view, from chizu's outlines (finer when the Earth is large), and chizu's provinces and states once the Earth is large enough to tell them apart, with the regions' names: thin lines that turn with the Earth, by day and by night, loaded only when asked for."
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
| `region-names` | The names of the regions, while the regions are drawn (see "Names" below). |

The property `borders` reads and writes the same as `{ countries, regions }`.

- **The countries are chizu's.** They come from [chizu](https://github.com/johnmorrisdotca/chizu)'s `world-geo` entry (`@johnmorrisdotca/chizu/world-geo`): Natural Earth's countries at 1:110m (public domain), the same outlines the line globe draws. They are loaded with a dynamic import the first time a set is switched on, so a page that never asks loads nothing for them; a page that also shows the line globe has them already.
- **Finer once the Earth is large.** The 1:110m lines can lie several kilometres off, which shows when the Earth is large. From a radius of 600 CSS pixels on the screen (`BORDER_DETAIL_RADIUS`, about 10 km to a pixel) the countries' borders are drawn from chizu's `world-geo-detail` (Natural Earth 1:50m) instead, loaded the first time the Earth is that large and never before; the coarse lines are put away, so no border is drawn twice, and come back when the Earth is smaller.
- **The regions are chizu's, too.** The regions of 32 countries (Natural Earth's admin-1 at 1:10m) come from chizu's `divisions-geo` entry, one country's file at a time, so a page needs no loader of its own and the demo's Borders button shows them. A country chizu has none for is drawn with its border with its neighbours only. A page that has better regions, or the regions of another country, hands them over as `borderData.regions`, which takes the place of chizu's: a function that takes a country's code and gives a GeoJSON `FeatureCollection` of its regions in longitude and latitude, or `null` for a country it has none for. `borderData.countries` and `borderData.detail` do the same for the two sets of countries. Set `borderData` before switching `borders` on.

```js no-run
const earth = document.querySelector("chikyu-earth-realistic");
earth.borderData = {
  regions: async (code) => (code === "JP" ? (await fetch("/regions/jp.json")).json() : null),
};
earth.borders = { countries: true, regions: true };
```

- **Regions when they can be told apart.** The regions are drawn once the Earth's radius on the screen is 900 CSS pixels or more (`BORDER_REGIONS_RADIUS`, about 7 km to a pixel), and only the countries the view shows are asked for (on the space view, those within its horizon), each once. Zoom out and they are put away; the countries' borders stay at any size.
- **Borders that are disputed.** Natural Earth draws the borders as they are held on the ground (de facto), not as any one country claims them, and says so; these lines are the same. They are not a statement about any claim.
- **Not installed.** When the shapes cannot be loaded (chizu is missing, or a page's `borderData.countries` fails), `chikyu-borders-unavailable` is sent with the reason, no line is drawn, and the Earth goes on as before. A three.js handed over without `LineSegments` is told the same way.

## Names

The countries' names are `country-names` (see [the grid and the country names](grid-and-country-names.md)); the regions' names are `region-names`, the same layer for the regions:

```html
<chikyu-earth-realistic borders region-names country-names style="width: 420px"></chikyu-earth-realistic>
```

- **Only while the regions are drawn.** `region-names` names the regions of the countries that have arrived, so it shows nothing until `borders` has regions and the Earth is large enough for them (900 CSS pixels, as above), and puts its names away with the lines when the Earth is zoomed out or the regions are switched off. It loads nothing of its own: it names what the borders loaded. Bare, it names 40 regions at most; a number (1 to 120) names that many.
- **The page's language.** Each region is written in the page's language, in Japanese on a page in Japanese where chizu has the name, else in English as Natural Earth spells it (not in capitals, as the countries' are).
- **Kept off each other.** A name is put at the middle of the part of its region in view, sized by that part, only where it fits there; the largest regions first. The regions' names are laid out after the places', the cities', the seas' and the countries' names and keep off all of them, and off the page's `keepOut` boxes, so a name is moved to another point of its region or left out rather than put over another name.
- **The look.** `--chikyu-region-font`, `--chikyu-region-weight`, `--chikyu-region-colour`, `--chikyu-region-halo` and `--chikyu-region-halo-width` set it; where a page sets none of them the countries' (`--chikyu-country-*`) apply, so the two look alike until the page says otherwise. The text is smaller, 9 to 13 pixels.
- **The state.** `stats.regionNames` has `on`, `max`, `countries` (the regions handed in), `names` (shown at the last draw) and `renders` (how many times they were laid out).

The pure parts need no browser: `regionShapes` turns a country's regions into the shapes the names are made from, and `countrySpots` and `layoutCountryNames` (with `capitals: false`) lay them out.

## What it costs

Measured on 2026-11-26 with chizu 1.17.1 (minified and gzipped, level 9) and in Chromium over Germany:

| | Size |
|---|---|
| The borders' code in each element | 4.4 kB minified, 2.1 kB gzipped |
| The region names' code, on top of the country names' that it shares | 1.3 kB minified, 0.8 kB gzipped |
| chizu's `world-geo`, loaded when a set is first switched on | 166 kB minified, 44.3 kB gzipped |
| chizu's `world-geo-detail`, loaded once the Earth is 600 pixels in radius | 1.38 MB minified, 410 kB gzipped |
| chizu's regions of one country, loaded when the view first shows it | 4 to 176 kB gzipped: Germany 14 kB, Japan 21 kB, Russia 176 kB |
| The countries' lines on the GPU | 3,012 segments (72 kB); from the finer world 16,823 segments (404 kB, instead of the coarse ones) |
| The regions' lines on the GPU | 31,472 segments (755 kB) with the 14 countries round Germany loaded |

Each set is one batch of lines: one draw call for the countries (coarse or fine), one for the regions, whatever the number of countries. The lines are made when the shapes arrive and never again; nothing is drawn at rest, and a set arriving asks for one draw. The names are a few text boxes (40 at most by default) moved with a transform, laid out again when a draw has moved the view and when regions arrive, never at rest. `stats.borders` has `countries`, `detail` and `regions` (segments), `shown`, `loaded` (the countries whose regions arrived), `builds` and `failed`. The freeze test (`e2e/freeze.demo.ts`) holds the regions and their names to no draw and no layout at rest, one context, and nothing left when the Earth is zoomed out again.

The pure parts need no browser: `sharedEdges`, `shapeBoxes`, `codesNear` and `readBorders` in `@johnmorrisdotca/chikyu-earth/realistic` find the borders of any set of shapes and which of them a view can reach.
