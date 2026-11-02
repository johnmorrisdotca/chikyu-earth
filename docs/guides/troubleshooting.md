---
title: Troubleshooting and questions
section: troubleshooting
order: 9
description: Why nothing appears, why the browser asks for the location, and the errors people meet in frameworks and on servers.
---

## Nothing appears

- **A plain page with `import "@johnmorrisdotca/chikyu-earth/element"` in a script tag.** A browser cannot resolve a package name. Use a CDN address ([plain HTML](html-and-cdn.md)), an import map, or a bundler ([bundlers](bundlers.md)).
- **The tag has no size.** `<chikyu-earth>` is `display: block` and as wide as its `size` attribute (320 by default); inside a flex or grid container give it a width.
- **The script is not a module.** Use `<script type="module">`.
- **The console says the tag is not defined.** The import has not run, or a framework removed an unknown tag before the element was registered: see [frameworks](frameworks.md).

## The browser asks to know my location

With no `center`, the element centres on the reader, so the browser asks. Set `center="lon,lat"` and it never asks. The iframe embed never asks unless you write `center=me`.

## "HTMLElement is not defined", or a server render fails

The element was imported on a server. Import `/element` only in code that runs in a browser ([frameworks](frameworks.md)); on a server draw with `globe()` ([TypeScript and Node](typescript-and-node.md)).

## React: "The `style` prop expects a mapping"

Use `look`, not `style`.

## Vue: "Maximum call stack size exceeded"

A component file called `ChikyuEarth.vue` renders itself when its template says `<chikyu-earth>`. Rename the file.

## Vue says "Failed to resolve component: chikyu-earth"

Tell the compiler the tag is a custom element: `isCustomElement` in [frameworks](frameworks.md).

## The realistic Earth says it needs WebGL, or stays blank

The browser or the GPU gave no WebGL context (a blocklisted GPU, a remote desktop, a privacy setting). The element fires `chikyu-unavailable`; the demo shows the line globe instead. If the picture is blank and the console shows 404s, `texture-base` is wrong: it must be the folder that holds `day-1024.webp` and the other pictures.

## Two realistic globes, and one shows an old picture

One WebGL context is shared by design. Press or focus a globe to give it the context; the other keeps its last picture until then.

## The package is large in my bundle

Import the entry point you use, not the whole package: `/element` for the tag, the main entry for `globe()`. The outlines are about 100 KB of data in either; the realistic Earth adds its pictures only when a page shows one.
