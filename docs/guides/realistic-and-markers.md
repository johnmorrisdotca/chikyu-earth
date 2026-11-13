---
title: The realistic Earth and markers
section: how-to
order: 7
description: Show the Earth from space and mark any place on either globe, with the budgets that keep both light.
---

Both are optional and cost nothing unless you import them: they are their own entry points.

## The Earth from space

`<chikyu-earth-realistic>` draws the day and night sides by the real Sun at a moment you choose, with city lights, a sun glint on the sea, clouds and the atmosphere at the rim. It uses [three.js](https://threejs.org) through kazoku-ui's shared renderer, which keeps one WebGL context for the whole page, so install the optional peers:

```sh
npm install three @johnmorrisdotca/kazoku-ui
```

```ts no-run
import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
earth.setAttribute("center", "139.7,35.7");
earth.setAttribute("time", "2026-06-21T03:00Z");
earth.setAttribute("texture-base", "/textures/");
document.body.append(earth);
```

`texture-base` is the folder holding the package's pictures: copy `node_modules/@johnmorrisdotca/chikyu-earth/dist/textures/` to your site (1.6 MB in all; each picture is loaded at the size the zoom needs and freed when it does not). From a CDN: [in a plain HTML page](html-and-cdn.md#the-realistic-earth).

To zoom in past about 5 times without blur, add `tiles` (a folder of map tiles, see [Sharp Earth maps, cut into tiles](earth-tiles.md)): the element then loads only the tiles in view and the page may allow a zoom of 40.

To ship less JavaScript, give the element only the parts of three.js it uses:

```ts no-check
import { setThreeLoader } from "@johnmorrisdotca/chikyu-earth/realistic/element";

setThreeLoader(() => import("./three-subset"));
```

where `three-subset.ts` re-exports `BackSide`, `BufferAttribute`, `BufferGeometry`, `ClampToEdgeWrapping`, `Group`, `LinearFilter`, `LinearMipmapLinearFilter`, `Mesh`, `OrthographicCamera`, `RepeatWrapping`, `Scene`, `ShaderMaterial`, `Texture`, `Vector3` and `WebGLRenderer` from `"three"`. The details and the budget: [docs/realistic.md](../realistic.md).

On a background, draw it no finer than the screen needs: `max-ratio="1"` (or `0.5`, which draws at half the size and scales it up) caps the canvas for the whole page, and is read when the element connects.

The elements write their styles as constructable stylesheets, so a page with `style-src 'self'` needs no hash for them. If your page already draws other things with kazoku-ui's shared renderer, hand it over before the first element connects and the page keeps one WebGL context:

```ts no-run
import { createSharedRenderer } from "@johnmorrisdotca/kazoku-ui/renderer";
import { setSharedRenderer } from "@johnmorrisdotca/chikyu-earth/realistic/element";

setSharedRenderer(createSharedRenderer({ load: () => import("three") }));
```

## Markers

Mark any place at `[lon, lat]` on either look, with a label, colour or icon, in groups you can show or hide. Chikyu ships no places: yours move with the globe, fade on the far side, make room for their labels, gather into clusters when crowded, and fire hover, click and keyboard events with your own data.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import { attachMarkers, type MarkerEventDetail } from "@johnmorrisdotca/chikyu-earth/markers";

const earth = document.querySelector("chikyu-earth")!;
const markers = attachMarkers(earth);
markers.add({ id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo", group: "Cities" });
earth.addEventListener("chikyu-marker-click", (event) => {
  const { marker } = (event as CustomEvent<MarkerEventDetail>).detail;
  console.log("chose", marker?.label);
});
```

Markers are one canvas pass for thousands of places and a pool of at most 24 buttons for the labels. On the realistic Earth the markers' labels keep clear of the element's own places' names and markers, and the cities', stars' and constellations' names keep clear of the markers' labels. See [attachMarkers](api:attachMarkers) in the reference and [docs/markers.md](../markers.md).
