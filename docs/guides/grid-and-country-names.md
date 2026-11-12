---
title: "The grid and country names on the Earth"
section: how-to
order: 21
description: "Draw the meridians and parallels on the realistic Earth and the space view, with the equator, the tropics, the polar circles and the prime meridian picked out, and name the countries in sight in the page's language, never over another name."
---

`<chikyu-earth-realistic>` and `<chikyu-space>` can draw a grid of meridians and parallels on the Earth, and name the countries you can see. Both are off until you ask for them, and both turn with the Earth.

```html
<chikyu-earth-realistic grid country-names borders="countries" style="width: 420px"></chikyu-earth-realistic>
```

| Attribute | Means |
|---|---|
| `grid` | The meridians and parallels. Absent (or `grid="off"`), none. |
| `country-names` | The names of the countries in sight, 40 at most. |
| `country-names="12"` | The same, 12 at most (1 to 120). Absent (or `country-names="off"`), none. |

The property `grid` reads and writes the same as `true` or `false`; `countryNamesStyle` sets the names' look.

## The grid

- **Every 15 or 30 degrees.** While the Earth is small on the screen (its radius under 220 CSS pixels, `GRID_FINE_RADIUS`) a line runs every 30 degrees; once it is larger, every 15. The parallels run from 75 degrees south to 75 north, the meridians to the poles.
- **The special lines.** The equator is the brightest line. The tropics (23.4393 degrees north and south, the Earth's tilt, `EARTH_TILT`) and the polar circles (66.5607 degrees) are bright. The prime meridian (0 degrees, through Greenwich) is in a warm colour.
- **On the ground, under the clouds.** The lines lie just above the ground and under the clouds, so a bright cloud covers them. They are light on the day side and dim on the night side, and the far side of the Earth hides them.

## The country names

- **Where the country is in view.** Each name is written at the middle of the part of the country the view shows (on the land, never out at sea), so a country cut by the edge of the view or by the horizon is named where you can see it. A country with several parts (islands) is named on the largest part in sight.
- **Sized by what you see.** The larger a country is on the screen, the larger its name (10 to 16 pixels unless you set `smallest` and `largest`), and the larger countries are named first. A country too small on the screen for its name is left out, so there are few names while the Earth is small and more as it grows.
- **In the page's language.** On a page in Japanese (the element's nearest `lang`), each country has its Japanese name; in English, its English name in capitals. The language picker of the family changes them at once.
- **Never over another name.** A name never overlaps another country's name, the names of cities (`city-names`), the names of places (`places`), the markers a page puts on the realistic Earth (`attachMarkers`, their labels and dots), or, on the space view, the names of the Sun, the Moon and the planets. Names stay inside the Earth's disc, so they never meet the names of the stars (`star-names`), which are kept off the Earth. Where a name has no room, it is left out.
- **Not on the far side.** A country on the far side of the Earth, or so close to its edge that it is seen almost side on, is not named.

```js no-run
const earth = document.querySelector("chikyu-earth-realistic");
earth.countryNamesStyle = { font: "Georgia, serif", colour: "#fff3d6", smallest: 11, largest: 18 };
earth.setAttribute("country-names", "30");
```

The CSS custom properties `--chikyu-country-font`, `--chikyu-country-weight`, `--chikyu-country-colour`, `--chikyu-country-halo` and `--chikyu-country-halo-width` set the same look from a style sheet. The names are measured in the font they are drawn in, so a fallback font with wider letters or taller lines does not make them overlap.

## Where the names come from

The outlines and the names are [chizu](https://github.com/johnmorrisdotca/chizu)'s `world-geo` entry (`@johnmorrisdotca/chizu/world-geo`): Natural Earth's countries at 1:110m (public domain), with chizu's English and Japanese names (from kuni, Unicode CLDR and Wikidata). These are the same outlines the line globe and `borders` use; they are loaded with a dynamic import the first time `country-names` is set, so a page that never asks loads nothing for them. Where the names go is worked out by this package from the outlines: about 48 points spread over each country's land, made once when the outlines arrive. When the outlines cannot be loaded, `chikyu-country-names-unavailable` is sent with the reason, no name is shown, and the Earth goes on as before. A three.js handed over without `LineSegments` cannot draw the grid: `chikyu-grid-unavailable` is sent.

## What it costs

Measured on 2026-11-12 with esbuild (minified, gzip level 9) and in Chromium:

| | Size |
|---|---|
| The grid's and the names' code in each element | 11.7 kB minified, 3.7 to 3.9 kB gzipped |
| chizu's `world-geo`, loaded when `country-names` is first set | 166 kB minified, 44.3 kB gzipped (shared with `borders` and the line globe) |
| The grid's lines on the GPU | 3,240 segments (1,800 while the Earth is small): one buffer of 95 kB (positions and colours) |
| The names' points | 4,647 points: 73 kB |

The grid is one batch of lines (one draw call) whatever its spacing: the lines every 15 degrees are the end of the same buffer, drawn or not by its draw range. The lines are made the first time `grid` is set and never again. The names are a few labels over the picture, laid out again only when the picture is drawn, which takes about a millisecond. Nothing is drawn at rest. `stats.grid` has `shown`, `fine` (every 15 degrees), `segments`, `builds` and `failed`; `stats.countryNames` has `on`, `max`, `countries`, `names`, `renders` and `failed`.

The pure parts need no browser: `gridLines`, `readGrid`, `countrySpots`, `layoutCountryNames`, `countryNameText` and `readCountryNames` in `@johnmorrisdotca/chikyu-earth/realistic` make the grid and lay the names out for any view.
