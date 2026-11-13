---
title: Upgrading
section: upgrading
order: 12
description: "What changed between versions and what to do about it. The package is 0.x: read this before a minor version."
---

The package is at 0.x, so a minor version (0.5 to 0.6) may change behaviour. Each release's notes are in the [changelog](../../CHANGELOG.md); this page lists what needs your action.

## To 0.48: the chosen orbit is thicker, and paths of your own

- The orbit the package draws for the chosen satellite (and the ridden one) is now 2 px wide, where it was 1 px: it is the `selected` look of the new table of path looks. To have the old line, `setPathStyles({ selected: { width: 1 } })`; to draw it yourself, set `selected-path="off"` (the property `selectedPath`), and ring, name and ride stay.
- New, and nothing to do: `setPaths` draws up to 16 orbits of your own in one call, `setPathStyles` changes their looks, `path-hit` and the events `chikyu-path-hover` and `chikyu-path-click` say which path the pointer is on. A press on a path is no longer heard by the sky (a star or a figure under it), as a press on a satellite's dot never was.

## To 0.47: names and a faint orbit on hover, hidden satellites dimmed

Two new attributes of `<chikyu-space>` and `<chikyu-earth-realistic>` are on by default, so a page that sets nothing changes in two ways.

- A mouse resting on a satellite now shows its name and draws its orbit faintly (`hover-path` and `names-on-hover`, both on). A touch does not rest, so it changes nothing. You do not want it: set `names-on-hover="off"` (the faint orbit follows it unless `hover-path` is set) or `hover-path="off"`.
- The name of a satellite the Earth hides is now drawn dimmed, with no ring (`dim-occluded`, on). Before, that name was left out. You want the old behaviour: set `dim-occluded="off"`.
- `follow` on `<chikyu-space>` is 0 by default, which is how the camera always held the stars: nothing changes unless you set it.
- Ride along: the satellite's model is drawn a little larger and a little higher by default (radius 0.22 of the picture's height, centre at 0.86 of it, was 0.17 and 0.90) so the body and a good part of a wing are in view; `ride-model-share="0.17"` and `ride-model-seat="0.9"` give the old framing.

## To 0.46.5: a satellite seen from above shrinks as the ride rises

In a ride above a satellite (`view: "above"`) the model of the satellite was drawn at 17 per cent of the picture's height from any height, so from 6,000 km it was a block hundreds of kilometres across. It now keeps that size up to 150 km, shrinks as the camera rises and is gone by 2,000 km, where the ordinary mark (ring and name) takes over.

- You want the old size at every height: set `ride-model-size="fixed"` on the element (property `rideModelSize`), or pass `{ modelSize: "fixed" }` to `ride`.
- A painter's own model is told the smaller size through `update({ radiusPx })`; a model that picks its detail from `radiusPx` follows without a change.
- The package's own drawings by kind are redrawn (framed panels, a bus with a radiator and camera, a dish, a cubesat kind for FLOCK, DOVE, LEMUR and similar names): nothing else changes.

## To 0.44: a ride shows the satellite

A ride of a satellite (`ride(ref)`) now has the camera a little outside the satellite, behind and above it, with the satellite in the picture. It was at the satellite.

- You want the camera at the satellite, as before: set `ride-viewpoint="inside"` on the element (property `rideViewpoint`), or pass `{ viewpoint: "inside" }` to `ride`.
- You ride a body (the Moon, a planet), or have not looked at the picture: nothing changes there.
- You use `view: "follow"` or `"above"` and have no satellite model: the satellite is now a small drawing of the package's own, not a dot. `viewpoint: "inside"` keeps the dot.

## To 0.34: no location asked for on load

`<chikyu-earth>` and `<chikyu-earth-realistic>` no longer ask the browser where the reader is when they open with no `center`: they open on 0,0. A page asks only after the reader asks for it.

- You left out `center` to have the globe open on the reader: add a button, ask on its press and set `center` from the answer:

```js no-run
button.addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition((position) => {
    earth.setAttribute("center", `${position.coords.longitude},${position.coords.latitude}`);
  });
});
```

- You set `center` already: nothing changes.

## To 0.18: every view zooms and turns by itself

`<chikyu-earth>`, `<chikyu-earth-realistic>` and `<chikyu-space>` now carry kazoku-ui's controls: drag, pinch, Ctrl and the wheel, the keys. A page that did not wire them gets them, and a plain wheel at Fit still scrolls the page. Act on it if:

- You put `<kazoku-view-controls for="...">` on a wrapper around the element. Point `for` at the element itself (give it an `id` and a `tabindex`), or add `controls="none"` to the element, or a drag is handled by both.
- You do not want the hands (a thumbnail, a background): add `controls="none"`.
- You set `zoom-min` and `zoom-max` on the bar to keep a range: the element's own range is now 0.1 to 20 (line), 0.1 to 5 or 40 with tiles (realistic; 20 for a tile set that stops at level 4) and a millionth to 2.5 (space); the bar's attributes still win. See [zoom, pan and turn](zoom-and-pan.md).
- You install without kazoku-ui: it is now a dependency (it was an optional peer), because the elements import its `view-controls`.

The embed page (`embed.html`) now takes the hands by default, so an iframe you already have can be dragged and zoomed (a plain wheel at Fit still scrolls your page). Add `hands=0` to the address for a still picture; `turn=auto` still turns it by itself, and `turn=1` is accepted and does nothing more.

## To 0.9: riding along, and a quieter Auto-turn

New: `element.ride(...)` and `ridePose` (in `/space`). One change you may notice: `<chikyu-space>`'s `setView(view, final = true)` takes a second argument. Passing the shared controls' `detail.final` (as the demo does) lets the Auto-turn at the Earth's own rate stop drawing thirty times a second; passing nothing draws on every change, as before.

## To 0.8: satellites

A new optional entry point, `/satellites` (the pure parts) and new methods on `<chikyu-space>` (`setSatellites` and friends). `satellite.js` (version 6) is an optional peer dependency: install it only for satellites. Nothing you have changes. The demo's space controls and the embed's `look=space` are new.

## To 0.7: the `look` attribute

`<chikyu-earth look="thick">` is the new name of the `style` attribute. `style="thick"` still works in plain HTML, and nothing you have breaks. In React, Vue and Angular `style` does not work (they read it as CSS), so use `look` there.

## To 0.6: the Sun, the Moon and the planets

A new optional entry point, `/space` (the pure parts) and `/space/element` (`<chikyu-space>`). `astronomy-engine` is an optional peer dependency: install it only for the space view. Nothing changed in the flat globe or the Earth from space.

## To 0.5: the realistic Earth and markers

New entry points, `/realistic`, `/realistic/element` and `/markers`; nothing changed in the flat globe. `three` and `@johnmorrisdotca/kazoku-ui` are optional peer dependencies: install them only for the realistic Earth.

## To 0.4: outlines from chizu

The outlines, names and codes come from `@johnmorrisdotca/chizu/world-geo`: 177 countries, with `alpha2` null for the three places that have no code. A `COUNTRIES` consumer should expect the new count.
