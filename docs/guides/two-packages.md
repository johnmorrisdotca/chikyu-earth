---
title: Why two packages
section: explanation
order: 12
description: What chikyu-earth does and what wakusei-planets does, which one to install, and how they work alone and together.
---

The Earth as a place to live is here, in chikyu-earth: its countries, day and night, city lights, clouds, markers for places, and the satellites going round it. The Sun, the other planets and the moons are in [wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets). Each package works on its own, and they fit together when a page wants both.

## The rule

- **chikyu-earth is for someone who cares about the Earth only.** Everything that is about the Earth in detail lives here: the countries, the day and night, the city lights, the clouds, markers and the satellites.
- **wakusei-planets is for any other body, and for the solar system.** The Sun, the planets, the dwarf planets, the moons, where each one is on a date, and the space between them. The Earth is there too, but as one body among the others: its size, its tilt, its turn and a picture of it from space.
- **The dependency runs one way.** wakusei-planets may use chikyu-earth (an optional peer). chikyu-earth never needs wakusei-planets: no entry point of this package imports it.

The test for where a new feature goes: would someone install only one of the two packages and still want it? A map of the world's countries is wanted by people who never think about Jupiter, so it is chikyu-earth's. Where Mars is tonight is wanted by people who never draw a country, so it is wakusei-planets'.

## What lives where

| You want | Package |
|---|---|
| A globe with the countries, turning at the Earth's own rate | chikyu-earth |
| The Earth from space: day and night, city lights, clouds, sun glint | chikyu-earth |
| Markers for places, a camera that rides along over the Earth | chikyu-earth |
| Satellites, stations and Space Shuttle flights round the Earth | chikyu-earth |
| Country names and codes as data | chikyu-earth |
| The Sun, the planets, the dwarf planets and the moons, in three looks | wakusei-planets |
| Where each body is on a date, its pole, its phase, its rings | wakusei-planets |
| Sunrise, moonrise and the Moon's phase from a place | wakusei-planets |
| The Earth as one planet among the others, in the same looks | wakusei-planets |
| The solar system as a scene you fly through | wakusei-planets (moving from chikyu-earth's space view) |

## Would someone install only one?

Yes, and that is the point.

- A site with a place on it (a venue, a flight, a team) wants chikyu-earth and has no use for the planets.
- A school page about Saturn's rings, or a chart of tonight's sky, wants wakusei-planets and has no use for the world's country outlines or a satellite propagator.
- A page about the Earth in its place in the solar system wants both.

Two packages keep each one small for the people who want only it. The shared parts (the renderer, the view controls, the theme and language) come from kazoku-ui, so using both costs no more than each alone.

## Using only chikyu-earth

Install this package alone. It does not import wakusei-planets, so a build never asks for it, and nothing here needs it:

```sh
npm install @johnmorrisdotca/chikyu-earth
```

Everything in the other guides works as it is. For example, with a bundler:

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import { globe } from "@johnmorrisdotca/chikyu-earth";

const earth = document.querySelector("chikyu-earth")!;
earth.setAttribute("graticule", "");
console.log(globe({ size: 64 }).startsWith("<svg"));
```

A check in `pnpm test:usage` bundles every entry point with wakusei-planets missing and fails if any of them reaches for it.

## Using only wakusei-planets

Install [wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets) alone for the Sun, the planets and the moons. It draws the Earth too, like every other body, so you do not need chikyu-earth for that. Its README and its guide "Why two packages" cover it.

## Using them together

Install both:

```sh
npm install @johnmorrisdotca/chikyu-earth @johnmorrisdotca/wakusei-planets
```

Import chikyu-earth's element beside wakusei-planets' `/earth`, and every `<wakusei-body body="earth" look="line">` on the page is chikyu-earth's globe with the countries. The other bodies stay wakusei-planets' own drawings.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth and Wakusei Planets together</title>
  </head>
  <body>
    <wakusei-body body="earth" look="line" size="260"></wakusei-body>
    <wakusei-body body="mars" look="line" size="160"></wakusei-body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import "@johnmorrisdotca/wakusei-planets/element";
import "@johnmorrisdotca/wakusei-planets/earth";
```

`pnpm test:usage` builds this page with Vite from the packages as npm packs them, and checks that the Earth is the globe with its countries and Mars is not.

- **The realistic and painted Earth stay wakusei-planets'**, so the Earth looks like the other planets beside it. The Earth from space in this package, with its day and night and its clouds, is `<chikyu-earth-realistic>`: [the realistic Earth and markers](realistic-and-markers.md).
- **One WebGL context for the page.** Both packages draw through kazoku-ui's shared renderer, so a page with a planet and a globe still has one context and one budget.
- **The space view.** Today `<chikyu-space>` draws the Sun and the planets with wakusei-planets' painter, which you hand it with `setBodyPainter` ([the real Sun, planets, Pluto and moons](the-real-planets.md)). That is the one place this package takes something from wakusei-planets, and you pass it in yourself. The view is moving into wakusei-planets so the solar system lives in one place; [upgrading](upgrading.md) will say how to switch when it lands, and this package keeps the Earth and its satellites.
