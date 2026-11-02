---
title: With a bundler: Vite, webpack and ES modules
section: how-to
order: 3
description: Install the package and import the element in a Vite or webpack project, or in any ES module setup.
---

Install it:

```sh
npm install @johnmorrisdotca/chikyu-earth
# or: pnpm add @johnmorrisdotca/chikyu-earth
# or: yarn add @johnmorrisdotca/chikyu-earth
```

Everything is an ES module with its own entry point, so a bundler includes only what you import: `@johnmorrisdotca/chikyu-earth` (the SVG string and the helpers), `/element` (the `<chikyu-earth>` tag), `/markers`, `/realistic` and `/realistic/element`. Importing `/element` registers the tag, once.

## Vite

The page:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth with Vite</title>
  </head>
  <body>
    <chikyu-earth id="earth" center="139.7,35.7" look="thick"></chikyu-earth>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

And its script. Importing the element registers the tag; the rest is plain DOM:

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import { globe } from "@johnmorrisdotca/chikyu-earth";

const earth = document.querySelector("chikyu-earth")!;
earth.setAttribute("graticule", "");
console.log(globe({ size: 64 }).startsWith("<svg"));
```

`npm create vite@latest` gives you the project; these two files are all the globe needs. Vite builds the entry with no configuration. The package's pictures for the realistic Earth are copied by you, see [the realistic Earth and markers](realistic-and-markers.md).

## webpack

The entry:

```js no-run
import "@johnmorrisdotca/chikyu-earth/element";

const earth = document.createElement("chikyu-earth");
earth.setAttribute("center", "139.7,35.7");
earth.setAttribute("look", "thick");
document.body.append(earth);
```

and `webpack.config.mjs`. webpack 5 needs nothing special for a package with `exports`:

```mjs no-run
import { fileURLToPath } from "node:url";

export default {
  mode: "production",
  entry: "./src/index.js",
  output: { path: fileURLToPath(new URL("./dist", import.meta.url)), filename: "main.js" },
};
```

Run `npx webpack`, and load `dist/main.js` from a page.

## Other tools

Anything that reads `package.json`'s `exports` works the same: Rollup, esbuild, Parcel, Bun, Deno (`npm:@johnmorrisdotca/chikyu-earth/element`). The package is plain ES2022 with no side effects except the `./element` entries, which `sideEffects` in `package.json` names, so tree-shaking keeps the rest out.
