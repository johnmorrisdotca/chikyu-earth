---
title: The real Sun, planets, Pluto and moons
section: how-to
order: 10
description: Draw the Sun, the planets, Pluto and their moons in the space view with wakusei-planets, in a realistic or a painted look, with one WebGL context for the page.
---

Left alone, `<chikyu-space>` draws the Sun, the planets and Pluto as plain spheres in the right colours. With [wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets) (an optional peer, 0.5.0 or later) they are the real ones: banded Jupiter, Saturn with its rings, Mars with its dark and light ground, the Sun with its glow, and, when you zoom in on a planet, its moons where they are on the date shown.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { setBodyPainter } from "@johnmorrisdotca/chikyu-earth/space/element";
import { painter } from "@johnmorrisdotca/wakusei-planets/painter";

setBodyPainter(painter);
```

Call `setBodyPainter` before the first `<chikyu-space>` connects. Then choose the look with `bodies`:

```html
<chikyu-space time="2026-11-02T12:00Z" speed="0" bodies="painted"></chikyu-space>
```

- `bodies="realistic"` (the default with the painter): each body shaded from its real colours and features.
- `bodies="painted"`: NASA, USGS and JPL surface pictures, public domain, with Saturn's rings from Cassini. A body shows the shaded look until its picture arrives.
- `bodies="plain"`: the plain spheres, and no moons, even with the painter.

The moons appear round a planet once it is a few pixels across and leave when the camera goes away. `element.zoomFor("Jupiter-moons")` is the zoom that shows a planet with its nearer moons (also `Saturn-moons`, `Mars-moons`, `Uranus-moons`, `Neptune-moons`, `Pluto-moons`); set `element.body = "Jupiter"` first. The Earth's own Moon is drawn as before, from its NASA map. Riding along a planet or the Moon shows the same bodies.

The view keeps its budget: the painter makes its objects with the three.js the page already handed over (the shared renderer, one WebGL context), draws only when the view asks, fetches a sharper picture only for a body that is big on the screen and lets it go when it is not, lets the moons go four seconds after they leave the view, and frees everything when the element leaves. `element.stats.bodies` says how many bodies the painter has made (`painted`) and how many moons are showing (`moons`). The three.js subset you hand over with `setThreeLoader` needs the parts wakusei-planets uses (`AdditiveBlending`, `DataTexture`, `NoColorSpace`, `PlaneGeometry`, `RGBAFormat`, `RingGeometry`, `SphereGeometry`, `TextureLoader`, `Vector2`, as well as the ones the space view uses); the demo's `three-subset.ts` has the list.

## Your own painter

`setBodyPainter` takes any `BodyPainter`: `make(three, name, context)` returns an object of radius 1 (or a promise of one) with an optional `update({ toSun, ms, radiusPx })`, `billboard` and `dispose`; the optional `moons(planet, ms)` says where a planet's moons are in planet radii and `looks` names what `bodies` may be. The view places, sizes and lights; the painter only draws.
