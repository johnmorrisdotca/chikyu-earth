---
title: Sharp Earth maps, cut into tiles
section: how-to
order: 11
description: How the realistic Earth stays sharp when you zoom right in, from a pyramid of small map tiles that is built from NASA's full-resolution maps (500 m a pixel), served beside the demo and never shipped in the npm package.
---

The pictures in the package (`dist/textures/`) stop at 4096 pixels across, so the realistic Earth blurs past about three times zoom. One bigger picture is not the answer: a 16384 by 8192 picture is about 700 MB of graphics memory on a phone. The answer is a **tile pyramid**: the map cut into 512 pixel squares at several sizes, of which a view loads only the few it can see, at the size it needs.

This page says how the tiles are made and where they live. The package ships none of them, only the loader and a `tiles` base-URL option that says where they are.

## What the pyramid is

Every map is 2:1 equirectangular: longitude -180 to 180 across, latitude 90 down to -90. Level `L` is `1024 × 2^L` pixels wide, in `2^(L+1)` columns and `2^L` rows of 512 pixel WebP tiles. Column 0 is at -180 and row 0 is at 90. A tile is `<layer>/<level>/<column>/<row>.webp`, and `manifest.json` lists every layer, level, tile count and size.

| Layer | Source | Levels | Top level |
|---|---|---|---|
| `day` | NASA Blue Marble: Next Generation with topography and bathymetry, September 2004 (the month of `day-*.webp`): levels 0 to 4 from the 21600 × 10800 picture, level 5 from the full-resolution 500 m map (86400 × 43200, in eight panels) | 0 to 5 | 32768 × 16384 |
| `night` | NASA Black Marble 2016 colour map: levels 0 to 3 from the 3 km picture (13500 × 6750), level 4 from the 500 m map (86400 × 43200, in eight panels) | 0 to 4 | 16384 × 8192 |

A level is built only from a source that fills it, never enlarged, and the script goes no higher than level 5 for the day map and level 4 for the night map (`maxLevel`): the 500 m maps could fill one more level, which is left for later. The clouds stay at the package's 2048 picture: NASA's own sharper cloud files are no longer served, and clouds are soft.

| Level | Day tiles | Day size | Night tiles | Night size |
|---|---|---|---|---|
| 0 (1024) | 2 | 0.06 MB | 2 | 0.02 MB |
| 1 (2048) | 8 | 0.18 MB | 8 | 0.06 MB |
| 2 (4096) | 32 | 0.60 MB | 32 | 0.22 MB |
| 3 (8192) | 128 | 1.98 MB | 128 | 0.79 MB |
| 4 (16384) | 512 | 6.40 MB | 512 | 2.30 MB |
| 5 (32768) | 2048 | 22.78 MB | | |
| All | 2730 | 32.0 MB | 682 | 3.4 MB |

That is 3,412 files and 35.4 MB for the whole pyramid (2,560 files and 25.1 MB of it are the day level 5 and night level 4). A view never loads it all: a tile decodes to about 1 MB of graphics memory, so a full screen at the right level is a few dozen tiles.

## Using them

Give the realistic Earth the folder the tiles are served from, with a slash at the end, in the `tiles` attribute (or `earth.tiles = "..."`):

```html
<chikyu-earth-realistic center="139.7,35.7" texture-base="/textures/" tiles="/tiles/"></chikyu-earth-realistic>
```

The element reads `manifest.json` once, and nothing more is fetched until the zoom needs it. The package's own pictures stay under the tiles as the far view and as the fallback: day 4096 across, night 2048. The element then:

- **Picks the level from the zoom and the canvas.** It wants about one texel to a device pixel (a texel may be a quarter wider before the next level is chosen), so it counts the disc's radius in device pixels, which grows with the zoom, the size of the box and the pixel ratio. While the package's own 4096 picture is as sharp as that, no tile is fetched. Past that, day level 3 (8192), then level 4 (16384), then level 5 (32768). Night tiles start at level 2 (4096) and stop at level 4 (16384).
- **Loads only the tiles in view.** A tile is in view when part of it is in the box on the front of the globe, a little before its edge slides in, and the middle of the box first. At most six are fetched at once. The antimeridian and the poles need nothing special: a tile is tested where it is on the sphere, and a longitude of 180 is the last column.
- **Draws them over the package's picture**, one patch of the sphere for each tile, a finer level on top of a coarser one, with the same Sun, night side and city lights as the rest of the Earth. On the dark side the night tile that goes with the day tile is read too, but only where the Sun is low enough to show it.
- **Keeps few of them.** A tile that leaves view, or is no longer the level wanted, is kept for four seconds (a drag back costs nothing) and then freed, its texture disposed on the GPU, and at once, the oldest first, when more than **48** are held: about 70 MB of graphics memory at most. If the tiles in view would be more than that, the level drops until they fit. A device that holds no 4096 picture (a `max-texture` below 4096, or a phone with 2 GB or less) uses no tiles.
- **Draws on demand.** A tile that arrives asks for one draw, batched with the others of that moment and held to 30 frames a second; at most eight new tiles go onto the sphere in a frame, and nothing is drawn at rest, out of sight, or in a hidden tab. A lost WebGL context is recovered with the tiles that were held, with no new fetch.
- **Falls back silently.** Without the option, with a manifest that cannot be read, or for a tile that cannot be fetched (it is asked for again after half a minute), the Earth is drawn as before from the package's pictures, and nothing is reported to the reader. `earth.stats.tiles` says what it is doing (`ready`, `level`, `held`, `shown`, `loading`, `failed`, `requested`), and the element fires `chikyu-tiles` once when a set has been read.

### In the space view

`<chikyu-space>` takes the same `tiles` attribute (and property) and lays the same tiles over its Earth. Its camera is in perspective and can be a few kilometres above the ground, so the level is chosen from the pixels a unit of ground takes at the nearest point under the camera, not from a disc's radius: from 3,000 km above the ISS a pixel of a 600 pixel high view is about 3 km of ground, which wants level 3 (8192), and from 150 km it is a few hundred metres, which wants the finest level, 5. A view of the whole Earth needs no tile, and none is asked for. Only the tiles under the camera are loaded, the same limit of 48 and the same four seconds apply, they turn with the Earth and are lit by the same Sun, and nothing is drawn at rest. The camera is described to the tile maths as a `TilePerspective` (its place in the Earth's own axes, where a point of the ground falls in the box, and which ground is under a place in the box), which `tilesInView` and `pointOnEarth` take in a `TileCamera`'s `perspective`. `space.stats.tiles` says what the view is doing, and the element sends `chikyu-tiles` once when a set has been read.

```html
<chikyu-space texture-base="/textures/" tiles="/tiles/"></chikyu-space>
```

### How far to zoom

The package's pictures are sharp to about 5 times; the demo's zoom limit was 5. The rule is that the limit grows as far as the finest day level is wider than the widest picture (4096). With the pyramid to level 4 (16384 across) that was four times further, 20 times. The pyramid now has level 5 (32768 across, 8 times the widest picture), so the realistic Earth goes **eight times further: 40 times**. At 40 times a 420 pixel globe has a disc 7,800 pixels in radius, and a texel is up to 1.5 CSS pixels wide on an ordinary screen, so there is still detail in it, but nothing finer than the source has (the Blue Marble is 500 m a pixel; level 5 is about 1.2 km a pixel, so the source holds one level more than the pyramid). The element reads the finest day level from `manifest.json` and raises its own zoom limit from 5 to that many times (20 for a set that stops at level 4, 40 for one that reaches level 5) when the tiles are found, and leaves it at 5 when they are not (it sets its `zoom-max` attribute, which a bar for the element reads; a `zoom-max` you set yourself is left alone). Nothing else is needed:

```html
<chikyu-earth-realistic texture-base="/textures/" tiles="/tiles/"></chikyu-earth-realistic>
```

The clouds stay at the package's 2048 picture: they are soft, and NASA's finer cloud files are no longer served. The city lights go to level 4 (16384 across), half the day map's detail, where there is little more to see.

## Making them

```sh
python3 -m venv .cache/venv && .cache/venv/bin/pip install pillow
.cache/venv/bin/python -I scripts/make-earth-tiles.py build
```

`pnpm tiles` runs the second line. The script downloads the two sources once into `.cache/earth-tiles/` (git-ignored), refuses a file whose SHA-256 is not the one written in the script, and writes `.cache/earth-tiles-out/`. It takes about 3 to 4 minutes and downloads about 690 MB the first time (the two whole pictures, 36 MB, and the 16 panels of the 500 m maps, 652 MB); every file is kept and checked, so a second run downloads nothing. The sources, with the address and SHA-256 of each file, are in `scripts/earth-tiles-sources.json`. Each level is resized from the whole source in one go, never from tile to tile, so neighbouring tiles agree along their shared edge. The source is padded with its own far edge before the resize, so the antimeridian (-180 and 180 are the same line) has no seam; at the poles, the top and bottom rows, nothing lies beyond, so the resize stops there.

The 500 m maps are 86400 × 43200 pixels, 11 GB as an uncompressed picture, so levels 5 (day) and 4 (night) are resized one panel at a time. A panel is padded with the edge rows and columns of its neighbours (the far panel across the antimeridian; nothing beyond the poles), resized to the square of the level that it covers, which is exactly 8192 × 8192 for the day map's level 5 and 4096 × 4096 for the night map's level 4 (a whole number of 512 pixel tiles), and cut. Each panel is decoded twice, once for its edges and once for its own tiles, so the script holds about 4 GB at a time, and the result is the same as resizing the whole map in one go, to the pixel.

`pnpm test:tiles` (also a CI step, and part of `pnpm test` where Pillow is installed) cuts a made-up 256 × 128 map into 32 pixel tiles and checks the tile count and size of every level, that no tile edge shows a seam, and that every level matches the same picture cut with the antimeridian rolled to the middle. It also cuts a made-up 512 × 256 map as eight panels and checks that every tile equals, to the pixel, the tile cut from the whole map, so the joins between panels, the antimeridian and the poles are exact, and that a level wider than the source is refused.

## Where they live

Not in git: tile images in the history would weigh the repository down for ever. And not in the npm package.

- **The demo site.** `pages.yml` builds the tiles in CI and `pnpm site` copies them to `site/tiles/`. Two caches keep the work between runs: the built tiles, while `scripts/make-earth-tiles.py` and `scripts/earth-tiles-sources.json` are unchanged (most runs build nothing), and NASA's 688 MB of source files, while `scripts/earth-tiles-sources.json` is unchanged (a change to the cutting script alone downloads nothing). So the 688 MB is fetched on the first run after a source changes, and not again. The tiles are served by GitHub Pages beside the demo, at https://johnmorrisdotca.github.io/chikyu-earth/tiles/, which sends `access-control-allow-origin: *`. This costs nothing on a public repository and adds 3,412 files and 35.4 MB to the site (the limit of a Pages site is 1 GB).

  The levels above day 4 and night 3 are published only when the repository variable `EARTH_TILES_ALL` is `yes` (`pnpm site` reads it of the same name; without it the site has 852 files and 10.3 MB, as before). A loader older than the one that reads the manifest's levels (chikyu-earth up to 0.43) would take a manifest with a level 5, want it, and fetch the level 4 tile for each quarter of it, which draws a wrong picture. So set the variable once the pages that read these tiles (the website's hero among them) have a release with the newer loader, and run the Pages workflow again.
- **Your own site.** Run the script (or copy the folder from the demo) and serve it as static files; give the loader its URL with the `tiles` option. Without the option, or when a tile cannot be fetched, the realistic Earth keeps drawing its package pictures.

The sources and their terms are in NOTICE.md.
