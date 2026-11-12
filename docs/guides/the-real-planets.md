---
title: The real Sun, planets, Pluto and moons
section: how-to
order: 10
description: Draw the Sun, the planets, Pluto and their moons in the space view with wakusei-planets, in a realistic or a painted look, with one WebGL context for the page.
---

Left alone, `<chikyu-space>` draws the Sun, the planets and Pluto as plain spheres in the right colours. With [wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets) (an optional peer, 0.5.0 or later; 0.31.0 or later for everything below) they are the real ones, each drawn from its own surface picture at every zoom: banded Jupiter, Saturn with its rings, Mars with its dark and light ground, the Sun with its glow, the Moon, and, when you zoom in on a planet, its moons where they are on the date shown.

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

- `bodies="realistic"` (the default with the painter): every body that has a surface picture is drawn from it (the view asks the painter for that with `mapped`), and the few that have none (Phobos, Deimos, the moons of Uranus) are shaded from their real colours and features.
- `bodies="painted"`: the surface pictures too, with Saturn's rings from Cassini. A body shows the shaded look until its picture arrives.
- `bodies="plain"`: the plain spheres, and no moons, even with the painter.

**Finer tiles close up.** The view tells each drawing which camera sees it and how big the view is, so a planet or the Moon that is big on the screen gets wakusei-planets' finer map tiles for the part in view, where it has them (Mars and the Moon), and lets them go a few seconds after it is small again. Give the painter the folder: `createPainter({ textureBase: "/planets/", tiles: "https://johnmorrisdotca.github.io/wakusei-planets/tiles/" })` (its own site, which any page may read), or your own copy. `element.stats.bodies.tiles` says how many bodies have tiles on them.

**The Moon** is the painter's too when there is one, so it is drawn like the planets and gets its tiles; until it arrives, with `bodies="plain"`, and with no painter, it is the view's own Moon from its NASA map.

**The credit.** Some of the pictures are CC BY 4.0, so they must be credited where they are seen. A painter may carry `credit: { en, ja }`, and the view writes it under the picture while the painter draws the bodies, in the element's or the page's language; `bodies-credit="off"` takes the line away for a page that writes the credit itself. wakusei-planets' painter (0.39 and later) carries `credit` itself, for exactly the pictures on the screen now, so pass it as it is. The view reads it again whenever a body it drew asks for a redraw (a picture arrived, a window of finer tiles changed) and writes the line under the picture only when its text changed, never at every frame, so the line follows the bodies drawn: Jupiter shows Nestaeric's credit, and a view with no CC BY picture shows none. Spreading the painter into a new object (`{ ...painter }`) would read `credit` once, so give the view the painter itself. A page that writes the credit itself (`bodies-credit="off"`) hears `chikyu-bodies-credit` when the painter's credit changed, with `detail` `{ en, ja }` or `null`, and writes it where it likes:

```ts no-run
import { setBodyPainter } from "@johnmorrisdotca/chikyu-earth/space/element";
import { createPainter } from "@johnmorrisdotca/wakusei-planets/painter";

setBodyPainter(createPainter({ textureBase: "/planets/" }));
```

The moons appear round a planet once it is a few pixels across and leave when the camera goes away. `element.zoomFor("Jupiter-moons")` is the zoom that shows a planet with its nearer moons (also `Saturn-moons`, `Mars-moons`, `Uranus-moons`, `Neptune-moons`, `Pluto-moons`); set `element.body = "Jupiter"` first. Riding along a planet or the Moon shows the same bodies.

The view keeps its budget: the painter makes its objects with the three.js the page already handed over (the shared renderer, one WebGL context), draws only when the view asks, fetches a sharper picture only for a body that is big on the screen and lets it go when it is not, lets the moons go four seconds after they leave the view, and frees everything when the element leaves. `element.stats.bodies` says how many bodies the painter has made (`painted`), how many moons are showing (`moons`) and held (`held`: shown, or gone for less than four seconds), whether the Moon is the painter's (`moon`) and how many bodies have finer tiles on them (`tiles`). The three.js subset you hand over with `setThreeLoader` needs the parts wakusei-planets uses (`AdditiveBlending`, `DataTexture`, `NoColorSpace`, `PlaneGeometry`, `RGBAFormat`, `RingGeometry`, `SphereGeometry`, `TextureLoader`, `Vector2`, as well as the ones the space view uses); the demo's `three-subset.ts` has the list.

## Your own painter

`setBodyPainter` takes any `BodyPainter`: `make(three, name, context)` returns an object of radius 1 (or a promise of one) with an optional `update({ toSun, ms, radiusPx, view })` (`view` is the camera and the view's size, a `BodyView`), `tiles`, `billboard` and `dispose`; `context.mapped` asks for the surface picture in every look; the optional `moons(planet, ms)` says where a planet's moons are in planet radii and `looks` names what `bodies` may be, and `credit` is written under the picture. The view places, sizes and lights; the painter only draws.
