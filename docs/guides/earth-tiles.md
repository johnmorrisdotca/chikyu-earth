---
title: Sharp Earth maps, cut into tiles
section: how-to
order: 11
description: How the realistic Earth stays sharp when you zoom right in, from a pyramid of small map tiles that is built from NASA's big maps, served beside the demo and never shipped in the npm package.
---

The pictures in the package (`dist/textures/`) stop at 4096 pixels across, so the realistic Earth blurs past about three times zoom. One bigger picture is not the answer: a 16384 by 8192 picture is about 700 MB of graphics memory on a phone. The answer is a **tile pyramid**: the map cut into 512 pixel squares at several sizes, of which a view loads only the few it can see, at the size it needs.

This page says how the tiles are made and where they live. The package ships none of them, only the loader and a `tiles` base-URL option that says where they are.

## What the pyramid is

Every map is 2:1 equirectangular: longitude -180 to 180 across, latitude 90 down to -90. Level `L` is `1024 × 2^L` pixels wide, in `2^(L+1)` columns and `2^L` rows of 512 pixel WebP tiles. Column 0 is at -180 and row 0 is at 90. A tile is `<layer>/<level>/<column>/<row>.webp`, and `manifest.json` lists every layer, level, tile count and size.

| Layer | Source | Levels | Top level |
|---|---|---|---|
| `day` | NASA Blue Marble: Next Generation with topography and bathymetry, September 2004 (the month of `day-*.webp`), 21600 × 10800 | 0 to 4 | 16384 × 8192 |
| `night` | NASA Black Marble 2016 colour map at 3 km, 13500 × 6750 | 0 to 3 | 8192 × 4096 |

A layer stops at the largest level its source can fill without being enlarged, so the day map reaches level 4 (a 21600 pixel source is cut down to 16384, not enlarged to 32768) and the night map level 3. The clouds stay at the package's 2048 picture: NASA's own sharper cloud files are no longer served, and clouds are soft.

| Level | Day tiles | Day size | Night tiles | Night size |
|---|---|---|---|---|
| 0 (1024) | 2 | 0.06 MB | 2 | 0.02 MB |
| 1 (2048) | 8 | 0.18 MB | 8 | 0.06 MB |
| 2 (4096) | 32 | 0.60 MB | 32 | 0.22 MB |
| 3 (8192) | 128 | 1.98 MB | 128 | 0.79 MB |
| 4 (16384) | 512 | 6.40 MB | | |
| All | 682 | 9.2 MB | 170 | 1.1 MB |

That is 852 files and 10.3 MB for the whole pyramid. A view never loads it all: a tile decodes to about 1 MB of graphics memory, so a full screen at the right level is a few dozen tiles.

## Making them

```sh
python3 -m venv .cache/venv && .cache/venv/bin/pip install pillow
.cache/venv/bin/python -I scripts/make-earth-tiles.py build
```

`pnpm tiles` runs the second line. The script downloads the two sources once into `.cache/earth-tiles/` (git-ignored), refuses a file whose SHA-256 is not the one written in the script, and writes `.cache/earth-tiles-out/`. It takes about 20 seconds. Each level is resized from the whole source in one go, never from tile to tile, so neighbouring tiles agree along their shared edge. The source is padded with its own far edge before the resize, so the antimeridian (-180 and 180 are the same line) has no seam; at the poles, the top and bottom rows, nothing lies beyond, so the resize stops there.

`pnpm test:tiles` (also a CI step, and part of `pnpm test` where Pillow is installed) cuts a made-up 256 × 128 map into 32 pixel tiles and checks the tile count and size of every level, that no tile edge shows a seam, and that every level matches the same picture cut with the antimeridian rolled to the middle.

## Where they live

Not in git: tile images in the history would weigh the repository down for ever. And not in the npm package.

- **The demo site.** `pages.yml` builds the tiles in CI (the result is kept between runs while `scripts/make-earth-tiles.py` is unchanged, so most runs download nothing) and `pnpm site` copies them to `site/tiles/`. They are served by GitHub Pages beside the demo, at https://johnmorrisdotca.github.io/chikyu-earth/tiles/, which sends `access-control-allow-origin: *`. This costs nothing on a public repository and adds 10.3 MB to the site.
- **Your own site.** Run the script (or copy the folder from the demo) and serve it as static files; give the loader its URL with the `tiles` option. Without the option, or when a tile cannot be fetched, the realistic Earth keeps drawing its package pictures.

The sources and their terms are in NOTICE.md.
