#!/usr/bin/env python3
"""Where the finer ground has a picture, and where it does not (MODULES-1367): a survey of the Landsat layer that `tiles-finer="gibs"` draws over the land.

    python3 -I scripts/finer-coverage.py survey [--layer ID] [--year YYYY-MM-DD] [--level 5] [--cell 0.5] [--sample all|centre] [--cache DIR] [--out DIR]
    python3 -I scripts/finer-coverage.py selftest

Needs Python 3 and Pillow (the same as scripts/make-earth-tiles.py: python3 -m venv .cache/venv && .cache/venv/bin/pip install pillow, then the venv's python with -I).

`survey` reads one level of NASA's tiles for the layer (default: the annual Landsat true-colour mosaic at level 5, tiles 9 degrees across, 800 of them, about 25 MB, kept in the cache dir so a second
run asks NASA for nothing), and says for every cell of the globe (default 0.5 degree) what the layer gives there, the way the package reads it (src/door/gibs.ts `clear`: a pixel under a luminance of 20
is left clear, from 32 it is opaque, between the two it is a share of both):

  * `sea`      the package's own water mask (textures/water-1024.webp) says water: the layer is not asked to cover it (it is made clear, and the package's blue sea shows).
  * `covered`  land where at least 70 per cent of the layer's picture is opaque: the finer ground is there.
  * `thin`     land where 15 to 70 per cent is opaque: patchy (dark forest and shadow read as clear, and some ice and cloud).
  * `none`     land where under 15 per cent is: the picture shows the package's own coarser ground (pure black, the service's mark for no data, is counted here too: `nodata` says how much of it).

Two surveys are kept. `--level 5 --cell 0.5` reads every tile of a coarse level: where the mosaic has a picture at all (about 550 m a pixel). `--level 11 --cell 2 --sample centre` asks for the finest tile (30 m a
pixel, 0.14 degree across) at the middle of every land cell of 2 degrees and says what that one tile holds: where the picture a close view draws exists, which is smaller than the coarse level's (a coarse level is
made from the finer ones where they exist and from elsewhere where they do not, and a missing finest tile is a 404 or all black). The 2 degree cell is one sample, not the whole cell.

It writes OUT/finer-coverage-level<L>.json (the numbers: the shares, by 10 degree band of latitude, and the largest places with no finer ground), OUT/finer-coverage-level<L>.png (the map, equirectangular, a pixel to a cell:
dark blue sea, green covered, yellow thin, red none) and OUT/finer-coverage-level<L>.md (the same in words). The pictures and the numbers are the layer on the day it is read: NASA can add or move data, so the
survey is run again when the layer or the package's reading of it changes, and the date is in the report.
"""
import argparse
import concurrent.futures
import io
import json
import math
import os
import sys
import time
import urllib.request

from PIL import Image

TILE_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best"
DEFAULT_LAYER = "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual"
DEFAULT_YEAR = "2000-12-01"  # the newest picture the layer has (src/door/gibs.ts GIBS_LAYERS)
MATRIX = "31.25m"
EDGE = 1e-6
CLEAR_BELOW, OPAQUE_FROM = 20.0, 32.0  # the package's own reading of the Landsat layer (gibs.ts `clear`)
COVERED_FROM, THIN_FROM = 0.70, 0.15
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
RETRY_WAITS = (3, 10, 30)


def tile_degrees(level: int) -> float:
    """The degrees a tile of the matrix is across at a level (512 pixels of 0.5625 / 2^level degrees, as gibsGrid has it)."""
    return 512 * 0.5625 / 2**level


def tile_grid(level: int) -> tuple[int, int]:
    """Columns and rows of the matrix at a level."""
    tile = tile_degrees(level)
    return math.ceil((360 - EDGE) / tile), math.ceil((180 - EDGE) / tile)


def opaque_share(luma: float) -> float:
    """How much of a pixel the layer keeps: 0 under CLEAR_BELOW, 1 from OPAQUE_FROM, linear between (the package's rule for the Landsat layer's dark sea)."""
    if luma <= CLEAR_BELOW:
        return 0.0
    if luma >= OPAQUE_FROM:
        return 1.0
    return (luma - CLEAR_BELOW) / (OPAQUE_FROM - CLEAR_BELOW)


def classify(share: float) -> str:
    """The word for a land cell given the share of its pixels the layer keeps."""
    if share >= COVERED_FROM:
        return "covered"
    if share >= THIN_FROM:
        return "thin"
    return "none"


def download(url: str, opener=urllib.request.urlopen, sleep=time.sleep) -> bytes | None:
    """One tile's bytes, or None where the service has none (a 404: nothing there), with a few retries for the rest."""
    for wait in (*RETRY_WAITS, None):
        try:
            with opener(urllib.request.Request(url, headers={"User-Agent": "chikyu-earth-coverage"}), timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code in (400, 404):
                return None
            if wait is None:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if wait is None:
                raise
        sleep(wait)
    return None


def fetch_tile(layer: str, year: str, level: int, row: int, col: int, cache: str) -> bytes | None:
    path = os.path.join(cache, layer, year, str(level), str(row), f"{col}.jpg")
    if os.path.exists(path):
        data = open(path, "rb").read()
        return data or None
    data = download(f"{TILE_URL}/{layer}/default/{year}/{MATRIX}/{level}/{row}/{col}.jpg")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as out:
        out.write(data or b"")
    return data


def water_mask() -> Image.Image:
    """The package's water mask as a grey picture (white is water), 2:1 equirectangular."""
    return Image.open(os.path.join(ROOT, "textures", "water-1024.webp")).convert("L")


def is_land(mask: Image.Image, lat: float, lon: float) -> bool:
    """Whether the package's water mask says land at a point."""
    return mask.getpixel((min(mask.width - 1, int((lon + 180) / 360 * mask.width)), min(mask.height - 1, int((90 - lat) / 180 * mask.height)))) < 128


def survey(layer: str, year: str, level: int, cell: float, cache: str, sample: str = "all") -> dict:
    """Every cell of the globe: its word, from the layer's tiles and the package's water mask."""
    columns, rows = tile_grid(level)
    tile = tile_degrees(level)
    mask = water_mask()
    mw, mh = mask.size
    nlon, nlat = round(360 / cell), round(180 / cell)
    if sample == "centre":
        # one tile for each land cell: the one at its middle
        def at_centre(j: int, i: int):
            lat_c, lon_c = 90 - (j + 0.5) * cell, -180 + (i + 0.5) * cell
            return min(rows - 1, int((90 - lat_c) / tile)), min(columns - 1, int((lon_c + 180) / tile))
        wanted = sorted({at_centre(j, i) for j in range(nlat) for i in range(nlon) if is_land(mask, 90 - (j + 0.5) * cell, -180 + (i + 0.5) * cell)})
    else:
        wanted = [(row, col) for row in range(rows) for col in range(columns)]
    tiles: dict[tuple[int, int], Image.Image | None] = {}

    def one(rc: tuple[int, int]):
        data = fetch_tile(layer, year, level, rc[0], rc[1], cache)
        return rc, (Image.open(io.BytesIO(data)).convert("RGB") if data else None)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for count, (rc, image) in enumerate(pool.map(one, wanted), 1):
            tiles[rc] = image
            if count % 200 == 0:
                print(f"  {count} of {len(wanted)} tiles", file=sys.stderr)
    grid = [["sea"] * nlon for _ in range(nlat)]
    nodata = [[0.0] * nlon for _ in range(nlat)]
    for j in range(nlat):
        lat_hi = 90 - j * cell
        for i in range(nlon):
            lon_lo = -180 + i * cell
            lat_c, lon_c = lat_hi - cell / 2, lon_lo + cell / 2
            if not is_land(mask, lat_c, lon_c):
                continue
            row, col = min(rows - 1, int((90 - lat_c) / tile)), min(columns - 1, int((lon_c + 180) / tile))
            image = tiles.get((row, col))
            if image is None:
                grid[j][i] = "none"
                nodata[j][i] = 1.0
                continue
            if sample == "centre":
                pixels = list(image.getdata())
                grid[j][i] = classify(sum(opaque_share(0.2126 * r + 0.7152 * g + 0.0722 * b) for r, g, b in pixels) / len(pixels))
                nodata[j][i] = sum(1 for r, g, b in pixels if r <= 1 and g <= 1 and b <= 1) / len(pixels)
                continue
            # the cell's pixels in the tile: the share the layer keeps, and how much of it is the service's pure black
            x0, x1 = (lon_lo - (-180 + col * tile)) / tile * image.width, (lon_lo + cell - (-180 + col * tile)) / tile * image.width
            north = 90 - row * tile
            y0, y1 = (north - lat_hi) / tile * image.height, (north - (lat_hi - cell)) / tile * image.height
            box = (max(0, int(x0)), max(0, int(y0)), min(image.width, max(int(x0) + 1, int(x1))), min(image.height, max(int(y0) + 1, int(y1))))
            pixels = list(image.crop(box).getdata())
            if not pixels:
                continue
            kept = sum(opaque_share(0.2126 * r + 0.7152 * g + 0.0722 * b) for r, g, b in pixels) / len(pixels)
            black = sum(1 for r, g, b in pixels if r <= 1 and g <= 1 and b <= 1) / len(pixels)
            grid[j][i] = classify(kept)
            nodata[j][i] = black
    return {"cell": cell, "grid": grid, "nodata": nodata}


def summarise(result: dict) -> dict:
    """The numbers: shares of the land by word, by 10 degree band of latitude, and the largest connected places with no finer ground."""
    grid, nodata, cell = result["grid"], result["nodata"], result["cell"]
    nlat, nlon = len(grid), len(grid[0])
    weight = lambda j: math.cos(math.radians(90 - (j + 0.5) * cell))  # a cell's area, in units of one at the equator
    land = {"covered": 0.0, "thin": 0.0, "none": 0.0}
    black = 0.0
    bands: dict[int, dict[str, float]] = {}
    for j in range(nlat):
        band = bands.setdefault(int(math.floor((90 - (j + 0.5) * cell) / 10) * 10), {"covered": 0.0, "thin": 0.0, "none": 0.0})
        for i in range(nlon):
            word = grid[j][i]
            if word == "sea":
                continue
            area = weight(j)
            land[word] += area
            band[word] += area
            black += area * nodata[j][i]
    total = sum(land.values()) or 1.0
    # connected places of cells with no finer ground (4-connected, the antimeridian joined)
    seen = [[False] * nlon for _ in range(nlat)]
    places = []
    for j in range(nlat):
        for i in range(nlon):
            if grid[j][i] != "none" or seen[j][i]:
                continue
            stack, members = [(j, i)], []
            seen[j][i] = True
            while stack:
                y, x = stack.pop()
                members.append((y, x))
                for yy, xx in ((y - 1, x), (y + 1, x), (y, (x - 1) % nlon), (y, (x + 1) % nlon)):
                    if 0 <= yy < nlat and grid[yy][xx] == "none" and not seen[yy][xx]:
                        seen[yy][xx] = True
                        stack.append((yy, xx))
            ys, xs = [m[0] for m in members], [m[1] for m in members]
            area = sum(weight(m[0]) for m in members) * cell * cell * 111.32**2
            places.append({"cells": len(members), "areaKm2": round(area), "latMax": round(90 - min(ys) * cell, 2), "latMin": round(90 - (max(ys) + 1) * cell, 2), "lonMin": round(-180 + min(xs) * cell, 2), "lonMax": round(-180 + (max(xs) + 1) * cell, 2), "centre": [round(90 - (sum(ys) / len(ys) + 0.5) * cell, 2), round(-180 + (sum(xs) / len(xs) + 0.5) * cell, 2)]})
    places.sort(key=lambda p: -p["areaKm2"])
    return {
        "landShare": {word: round(value / total, 4) for word, value in land.items()},
        "pureBlackShareOfLand": round(black / total, 4),
        "byLatitudeBand": {str(low): {word: round(value / (sum(share.values()) or 1), 3) for word, value in share.items()} for low, share in sorted(bands.items(), reverse=True) if sum(share.values()) > 0},
        "largestNone": places[:12],
    }


COLOURS = {"sea": (11, 20, 42), "covered": (70, 150, 80), "thin": (214, 190, 70), "none": (200, 60, 50)}


def draw(result: dict) -> Image.Image:
    """The map: a pixel to a cell, doubled, with a line every 30 degrees."""
    grid = result["grid"]
    nlat, nlon = len(grid), len(grid[0])
    image = Image.new("RGB", (nlon, nlat))
    image.putdata([COLOURS[word] for row in grid for word in row])
    scale = max(2, 1440 // nlon)  # a map about 1440 pixels across whatever the cell
    image = image.resize((nlon * scale, nlat * scale), Image.NEAREST)
    cell = result["cell"]
    for degrees in range(-150, 181, 30):
        x = round((degrees + 180) / cell) * scale - 1
        for y in range(0, image.height, 4):
            if 0 <= x < image.width:
                image.putpixel((x, y), (255, 255, 255))
    for degrees in range(-60, 90, 30):
        y = round((90 - degrees) / cell) * scale - 1
        for x in range(0, image.width, 4):
            image.putpixel((x, y), (255, 255, 255))
    return image


def write_report(summary: dict, layer: str, year: str, level: int, read: str, out: str, cell: float, sample: str) -> None:
    share = summary["landShare"]
    lines = [
        "# Where the finer ground has a picture",
        "",
        f"Read on {read}: the layer `{layer}` ({year}) at level {level} of NASA's GIBS tiles ({'one tile, 0.14 degree across, at the middle of each land cell of ' + str(cell) + ' degrees' if sample == 'centre' else 'every tile, a cell of ' + str(cell) + ' degrees'}), against the package's own water mask. See `scripts/finer-coverage.py` for how, and what the words mean.",
        "",
        f"Of the land, **{share['covered']:.1%} is covered** (at least 70 per cent of the layer's picture is opaque), **{share['thin']:.1%} is thin** (15 to 70 per cent: dark forest and shadow read as clear, and some ice) and **{share['none']:.1%} has none** (the package's coarser ground shows). Pure black, the service's mark for no data, is {summary['pureBlackShareOfLand']:.1%} of the land.",
        "",
        f"![The land the finer layer covers: green covered, yellow thin, red none, dark blue sea](finer-coverage-level{level}.png)",
        "",
        "## By latitude",
        "",
        "| Band | Covered | Thin | None |",
        "|---|---|---|---|",
    ]
    for low, words in summary["byLatitudeBand"].items():
        lines.append(f"| {int(low)} to {int(low) + 10} | {words['covered']:.0%} | {words['thin']:.0%} | {words['none']:.0%} |")
    lines += ["", "## The largest places with no finer ground", "", "| Area (km2, about) | Latitude | Longitude | Middle |", "|---|---|---|---|"]
    for place in summary["largestNone"]:
        lines.append(f"| {place['areaKm2']:,} | {place['latMin']} to {place['latMax']} | {place['lonMin']} to {place['lonMax']} | {place['centre'][0]}, {place['centre'][1]} |")
    lines.append("")
    with open(os.path.join(out, f"finer-coverage-level{level}.md"), "w", encoding="utf8") as handle:
        handle.write("\n".join(lines))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["survey", "selftest"])
    parser.add_argument("--layer", default=DEFAULT_LAYER)
    parser.add_argument("--year", default=DEFAULT_YEAR)
    parser.add_argument("--level", type=int, default=5)
    parser.add_argument("--cell", type=float, default=0.5)
    parser.add_argument("--sample", choices=["all", "centre"], default="all")
    parser.add_argument("--cache", default=os.path.join(ROOT, ".cache", "finer-coverage"))
    parser.add_argument("--out", default=os.path.join(ROOT, "docs", "coverage"))
    args = parser.parse_args(argv)
    if args.command == "selftest":
        return selftest()
    os.makedirs(args.out, exist_ok=True)
    result = survey(args.layer, args.year, args.level, args.cell, args.cache, args.sample)
    summary = summarise(result)
    read = time.strftime("%Y-%m-%d", time.gmtime())
    draw(result).save(os.path.join(args.out, f"finer-coverage-level{args.level}.png"), optimize=True)
    with open(os.path.join(args.out, f"finer-coverage-level{args.level}.json"), "w", encoding="utf8") as handle:
        json.dump({"read": read, "layer": args.layer, "year": args.year, "level": args.level, "cell": args.cell, "sample": args.sample, **summary}, handle, indent=1)
        handle.write("\n")
    write_report(summary, args.layer, args.year, args.level, read, args.out, args.cell, args.sample)
    print(json.dumps(summary["landShare"]))
    return 0


def selftest() -> int:
    """The pure parts, no network: the tile grid, the package's reading of a pixel, the words, the summary of a tiny map."""
    assert tile_grid(5) == (40, 20) and abs(tile_degrees(5) - 9.0) < 1e-9 and abs(tile_degrees(0) - 288) < 1e-9
    assert opaque_share(0) == 0 and opaque_share(20) == 0 and opaque_share(32) == 1 and abs(opaque_share(26) - 0.5) < 1e-9
    assert [classify(s) for s in (0.9, 0.7, 0.4, 0.15, 0.1, 0)] == ["covered", "covered", "thin", "thin", "none", "none"]
    tiny = {"cell": 90.0, "grid": [["sea", "covered", "none", "none"], ["none", "thin", "sea", "none"]], "nodata": [[0, 0, 1, 1], [1, 0, 0, 0]]}
    summary = summarise(tiny)
    assert set(summary["landShare"]) == {"covered", "thin", "none"} and abs(sum(summary["landShare"].values()) - 1) < 0.001
    # the three none cells at the right and the one at the far left are one place across the antimeridian? (row 0: x2, x3; row 1: x3 and x0 joined to x3 across the edge)
    assert summary["largestNone"][0]["cells"] >= 3
    assert draw(tiny).size == (4 * 360, 2 * 360)
    print("selftest ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
