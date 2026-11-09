---
title: Upgrading
section: upgrading
order: 12
description: What changed between versions and what to do about it. The package is 0.x: read this before a minor version.
---

The package is at 0.x, so a minor version (0.5 to 0.6) may change behaviour. Each release's notes are in the [changelog](../../CHANGELOG.md); this page lists what needs your action.

## To 0.18: every view zooms and turns by itself

`<chikyu-earth>`, `<chikyu-earth-realistic>` and `<chikyu-space>` now carry kazoku-ui's controls: drag, pinch, Ctrl and the wheel, the keys. A page that did not wire them gets them, and a plain wheel at Fit still scrolls the page. Act on it if:

- You put `<kazoku-view-controls for="...">` on a wrapper around the element. Point `for` at the element itself (give it an `id` and a `tabindex`), or add `controls="none"` to the element, or a drag is handled by both.
- You do not want the hands (a thumbnail, a background): add `controls="none"`.
- You set `zoom-min` and `zoom-max` on the bar to keep a range: the element's own range is now 0.1 to 20 (line), 0.1 to 5 or 20 with tiles (realistic) and a millionth to 2.5 (space); the bar's attributes still win. See [zoom, pan and turn](zoom-and-pan.md).
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
