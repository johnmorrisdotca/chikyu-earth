---
title: Upgrading
section: upgrading
order: 12
description: What changed between versions and what to do about it. The package is 0.x: read this before a minor version.
---

The package is at 0.x, so a minor version (0.5 to 0.6) may change behaviour. Each release's notes are in the [changelog](../../CHANGELOG.md); this page lists what needs your action.

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
