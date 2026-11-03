---
title: Architecture
section: explanation
order: 11
description: How the flat globe, the Earth from space, the markers and the space view fit together, which parts are pure, and which are optional.
---

Chikyu Earth is one small core and four optional layers. Each layer is its own entry point, so a page that wants only the line globe pays for only the line globe.

## The core: a pure function and a small element

`globe(options)` returns one SVG string: an orthographic disc, the country outlines on it and the rim. It is pure: no clock, no DOM, the same markup for the same options, so it works on a server, in a test, or inside the element.

```ts
import { COUNTRIES, globe } from "@johnmorrisdotca/chikyu-earth";

const svg = globe({ size: 240, style: "thick", centre: { lon: 139.7, lat: 35.7 }, graticule: true });
console.log(svg.startsWith("<svg"), COUNTRIES.features.length, "countries");
```

The outlines are not shipped here: they are chizu's `world-geo` (Natural Earth 1:110m, public domain), shaped once at load. Nothing is fetched at run time. The runtime dependencies are only d3-geo and chizu.

## A look is a table entry

A look changes lines and fills, never the geometry. `STYLES` holds one entry for each of `line` and `thick`, with the same colours as the family's other drawings. Anything else falls back to the default (`cleanStyle`).

```ts
import { cleanStyle, DEFAULT_STYLE, STYLE_NAMES } from "@johnmorrisdotca/chikyu-earth";

console.log(STYLE_NAMES, cleanStyle("neon"), DEFAULT_STYLE);
```

## The view is a camera, mapped to a projection

The shared view controls (kazoku-ui) report a camera: `{ yaw, tilt, zoom, panX, panY }`. `projectionView` maps it to d3-geo's orthographic projection: yaw turns the globe about its axis from the home longitude, tilt tips it toward a pole from the home latitude, zoom multiplies the scale and pan offsets the translation. With no yaw, tilt or pan, the view is the home centre, and Fit is a zoom of 1. The mapping is pure and tested on its own.

```ts
import { HOME_VIEW, projectionView } from "@johnmorrisdotca/chikyu-earth";

const view = projectionView({ lon: 139.7, lat: 35.7 }, 420, { ...HOME_VIEW, yaw: 30, zoom: 2 });
console.log(view.rotation, view.scale, view.translate);
```

## The Earth's own rate

Auto-turn does not pick a speed: it uses the Earth's. One sidereal day is 23 h 56 min 4.0905 s, so the globe turns at 0.004178 degrees a second and keeps real time.

```ts
import { DEGREES_PER_MS, SIDEREAL_DAY_MS, spinAt } from "@johnmorrisdotca/chikyu-earth";

console.log((SIDEREAL_DAY_MS / 3_600_000).toFixed(4), "hours;", (DEGREES_PER_MS * 1000).toFixed(6), "degrees a second;", spinAt(SIDEREAL_DAY_MS / 4), "degrees in a quarter day");
```

## The element draws on demand

`<chikyu-earth>` holds the state and asks for a redraw only when something changes. During a gesture it moves one transform; when the gesture settles it redraws the SVG in full. Its styles go into the shadow root as a constructable stylesheet, so a strict content security policy (`style-src 'self'`) allows them.

## The four optional layers

| Entry point | What it adds | Needs |
| --- | --- | --- |
| `/realistic` and `/realistic/element` | The Earth from space: day and night by the real Sun, city lights, a sun glint, clouds and the atmosphere. | `three` |
| `/markers` | `attachMarkers`: markers, clusters and labels on either globe. The projection, clustering and label placement are pure. | nothing extra |
| `/space` and `/space/element` | `<chikyu-space>`: the Earth, the Moon, the Sun and the planets where they are at a date and time. | `three`, `astronomy-engine` |
| `/satellites` | Satellite positions from orbital elements (SGP4), and riding along with a body. | `satellite.js` |

Every pure part imports on a server. The three.js parts go through kazoku-ui's **shared renderer**: one WebGL context for the page, whichever element draws, released a second after the last one leaves. The space view and the satellites interpolate between two answers a second apart instead of asking at every frame.

## What it never does

- Fetch outlines, names or any data at run time.
- Run a frame loop while nothing changes, draw out of sight or on a hidden tab, or make a canvas bigger than 4096 pixels a side and six million pixels in all.
- Read a style from the `style` attribute: it is real CSS in HTML and breaks in React, so the look is `look`. See [how it stays light](how-it-works.md).

[How it stays light](how-it-works.md) has the budget in full, and [the realistic Earth and markers](realistic-and-markers.md) the layers one by one.
