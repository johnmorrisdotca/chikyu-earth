---
title: TypeScript, Node and servers
section: how-to
order: 6
description: Use the package's types, draw the globe as an SVG string on a server, and render pages that include it.
---

## Types

The package ships its own declarations; nothing else to install. The browser parts need the DOM library (`"lib": ["dom"]` in `tsconfig.json`).

```ts
import { COUNTRIES, countryList, globe, type CountryProps, type GlobeOptions } from "@johnmorrisdotca/chikyu-earth";
import type { ChikyuEarth } from "@johnmorrisdotca/chikyu-earth/element";
import { attachMarkers, type MarkerInput } from "@johnmorrisdotca/chikyu-earth/markers";

const options: GlobeOptions = { size: 240, style: "thick", centre: { lon: 139.7, lat: 35.7 } };
const svg: string = globe(options);
const japan: CountryProps | undefined = countryList().find((country) => country.alpha2 === "JP");
console.log(svg.length, japan?.name, COUNTRIES.features.length);

export function mark(earth: ChikyuEarth): void {
  const tokyo: MarkerInput = { id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo" };
  attachMarkers(earth).add(tokyo);
}

// @ts-expect-error "neon" is not a look
globe({ style: "neon" });
```

The `@ts-expect-error` line shows the types at work: a look the package does not have is an error at build time. At run time an unknown look is never an error, because a value from outside (an attribute, a query parameter) falls back to the default through `cleanStyle`.

## On a server, with no DOM

`globe()` is pure: the same options always give the same markup, with no DOM and no browser globals, so a server, a build step or a test can draw the same globe the browser does. This is the example that the package's tests run in Node:

```mjs
import { countryList, globe } from "@johnmorrisdotca/chikyu-earth";

// A server draws the same SVG a browser does: pure, no DOM, no browser globals.
const svg = globe({ size: 240, rotation: [-139.7, -35.7], style: "thick" });
const page = `<!doctype html><title>The Earth</title>${svg}`;
console.log(page.length, countryList().length);
```

Put the SVG string into any page. It is about 130 KB of markup with every country; a page that wants less draws a smaller `size` or a closer view, or uses the element in the browser and sends nothing.

## Which entry points work on a server

| Entry point | On a server |
|---|---|
| `@johnmorrisdotca/chikyu-earth` | Yes: `globe()`, the rotation and view maths, `COUNTRIES`, `countryList()` |
| `/realistic` | Yes: the Sun's position, the texture sizes, the frame gate |
| `/markers` | Importable; `attachMarkers` needs a browser's element. The projection, clustering and label placement are pure |
| `/element`, `/realistic/element` | No: they extend `HTMLElement` and must be imported in a browser |

## Server-rendered pages

A page that a framework renders on a server and then hydrates must not import the element on the server. [Frameworks](frameworks.md) shows the import inside the client-only hook of React, Vue, Svelte and Angular.
