---
title: In a plain HTML page, from a CDN
section: how-to
order: 2
description: Add the globe to any page with one script tag from jsDelivr or unpkg, and the realistic Earth the same way.
---

A page with no build step loads the package from a CDN. Both snippets below were run in a browser by the package's tests, and the live addresses were checked against the published package.

## From jsDelivr

jsDelivr bundles the package and its dependencies into one module when an address ends in `/+esm`, so one tag is enough:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth from jsDelivr</title>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/element/+esm"></script>
  </head>
  <body>
    <chikyu-earth center="139.7,35.7" look="thick" graticule size="320"></chikyu-earth>
  </body>
</html>
```

The address names the package's entry point: `.../chikyu-earth/element/+esm` is the `./element` entry, which registers `<chikyu-earth>`. With no version in the address you get the latest; pin one for a page that must not change under you, as in `@johnmorrisdotca/chikyu-earth@0.7.0/element/+esm`.

## From unpkg

unpkg serves each file as it is; add `?module` and it rewrites the file's imports to unpkg addresses, so the browser fetches the package's few files and its dependencies, one request each:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth from unpkg</title>
    <script type="module" src="https://unpkg.com/@johnmorrisdotca/chikyu-earth/dist/element.js?module"></script>
  </head>
  <body>
    <chikyu-earth center="139.7,35.7" look="thick" graticule size="320"></chikyu-earth>
  </body>
</html>
```

jsDelivr is one request and the better choice for a page; unpkg is useful when you want to read the files the browser gets.

## The realistic Earth

The Earth from space is its own entry point and needs its pictures (1.6 MB, NASA's, in the package's `dist/textures/`). From a CDN, say where they are with `texture-base`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The realistic Earth from jsDelivr</title>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/realistic/element/+esm"></script>
  </head>
  <body>
    <chikyu-earth-realistic
      center="139.7,35.7"
      time="2026-06-21T03:00Z"
      texture-base="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/dist/textures/"
      style="display: block; width: 360px"
    ></chikyu-earth-realistic>
  </body>
</html>
```

jsDelivr bundles three.js into the module for you. To ship less, hand over only the parts the Earth uses with `setThreeLoader` (see [the realistic Earth and markers](realistic-and-markers.md)).

## Choosing a CDN version

A CDN address without a version follows the latest release, and this package is 0.x, where a minor version may change things ([upgrading](upgrading.md)). Write `@0.7.0` (an exact version) in anything you publish.

## Content-Security-Policy

A page with a strict policy needs the CDN's host in `script-src`. The globe sets no inline style or script of its own; the shared controls have their own notes in kazoku-ui's CSP guide.
