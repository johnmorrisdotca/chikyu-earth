---
title: Getting started
section: tutorial
order: 1
description: Put a globe on a page, centre it, and let the reader turn it, in about five minutes.
---

This guide puts a globe on a page, centres it on Tokyo, and lets the reader turn, tip and zoom it. You need a text editor and a browser. Nothing is installed: the page loads the package from a CDN.

## 1. A page with a globe

Save this as `globe.html` and open it. The `<chikyu-earth>` tag is the globe; the script above it is what makes the tag work.

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

The globe is an SVG drawn from Natural Earth country outlines. It is centred where you tell it: the `center` attribute is `"longitude,latitude"`. Leave `center` out and the page asks the browser where the reader is, and centres there; until the reader answers, and if they decline, it starts on the Greenwich meridian.

`look` is `line` (thin outlines, the default) or `thick`. `graticule` adds the lines of longitude and latitude. `size` is the width and height in pixels.

## 2. Let the reader turn it

The package draws; the shared [kazoku-ui](https://github.com/johnmorrisdotca/kazoku-ui) view controls supply every hand and button: drag to turn, tilt to either pole, zoom, pinch, pan, a speed choice and Fit. Add them, and pass what they say to the globe with one listener:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth with the shared controls</title>
    <script type="module">
      import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/kazoku-ui/view-controls/define/+esm";
      import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/element/+esm";

      const earth = document.querySelector("chikyu-earth");
      document.querySelector("kazoku-view-controls").addEventListener("kazoku-viewchange", (event) => {
        earth.setView(event.detail, event.detail.final);
      });
    </script>
  </head>
  <body>
    <div id="globe" tabindex="0">
      <chikyu-earth size="420" look="thick" center="139.7,35.7"></chikyu-earth>
    </div>
    <kazoku-view-controls for="globe" address controls="advanced" tilt-max="90" speed="0.004178"></kazoku-view-controls>
  </body>
</html>
```

`setView(view, final)` takes the controls' camera. `final` is false while a gesture is moving, which makes only a cheap transform, and true when it settles, which redraws the orthographic projection. Auto-turn runs at the Earth's own rate, `0.004178` degrees a second: one revolution per sidereal day. The controls leave it still for a reader who prefers reduced motion.

## 3. Where next

- Use it from a bundler or a framework: [bundlers](bundlers.md) and [frameworks](frameworks.md).
- Show it in someone else's page without a script of your own: [embed in an iframe](embed-in-an-iframe.md).
- Draw it on a server, or with types: [TypeScript and Node](typescript-and-node.md).
- The Earth from space, and markers for your own places: [the realistic Earth and markers](realistic-and-markers.md).
- Something does not appear: [troubleshooting](troubleshooting.md).
