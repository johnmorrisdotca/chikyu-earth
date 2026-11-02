---
title: Embed it with an iframe
section: how-to
order: 5
description: Put the globe in any page with one iframe and no script, and choose what it shows in the address.
---

The demo site has a page made to be framed, `embed.html`. It draws what its address says and fetches nothing but its own files, so it needs no script, no build and no package on your side:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth in an iframe</title>
  </head>
  <body>
    <iframe
      src="https://johnmorrisdotca.github.io/chikyu-earth/embed.html?look=thick&center=139.7,35.7&turn=1"
      title="The Earth, centred on Tokyo"
      width="420"
      height="420"
      loading="lazy"
      style="border: 0"
    ></iframe>
  </body>
</html>
```

The globe fills the frame (square, at the smaller of its width and height), with a transparent background, so it sits on your page's colour.

## What the address can say

| Parameter | Values | Default |
|---|---|---|
| `look` | `line`, `thick`, `realistic` (needs WebGL; falls back to `thick` without it) | `line` |
| `center` | `lon,lat`, or `me` to ask the browser for the reader's place | `0,20` |
| `graticule` | `1` | off |
| `turn` | `0` still, `1` turned by hand (drag, wheel, pinch, arrow keys), `auto` turns by itself at the Earth's own rate | `0` |
| `time` | the realistic look's moment, for example `2026-06-21T12:00Z` | now |
| `clouds`, `lights` | `off` to hide that layer on the realistic look | on |

By default the frame is still, has no controls and never asks for the reader's location. It draws only when something changes, and nothing while it is off screen or its tab is hidden.

## Size and accessibility

Give the iframe a `title` (the example does), a `width` and `height`, and `loading="lazy"` so it costs nothing until it is near the screen. The frame is a square: a frame wider than it is tall leaves empty space at the sides.

## Hosting the frame yourself

The frame is `embed.html` with `embed.js` (and the chunks it loads) and the `textures/` folder for `look=realistic`. `pnpm site` builds them into `site/`; copy those files to your own host if you do not want to use the demo site's.
