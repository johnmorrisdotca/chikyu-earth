#!/usr/bin/env python3
"""Cut NASA's big Earth maps into a tile pyramid of 512 px WebP tiles (see NOTICE.md and docs/guides/earth-tiles.md).

    python3 -I scripts/make-earth-tiles.py build [--cache DIR] [--out DIR] [--layers day,night]
    python3 -I scripts/make-earth-tiles.py selftest

Needs Python 3 and Pillow (python3 -m venv .cache/venv && .cache/venv/bin/pip install pillow, then run the venv's python with -I).
`build` downloads the sources once into the cache dir (default .cache/earth-tiles, git-ignored; each file is checked against the SHA-256 below),
then writes OUT/<layer>/<level>/<column>/<row>.webp and OUT/manifest.json (default OUT: .cache/earth-tiles-out). The tiles are never committed: the Pages
workflow builds them and serves them beside the demo.

Every map is 2:1 equirectangular (longitude -180 to 180 across, latitude 90 down to -90). Level L is 1024 * 2^L pixels wide, 2^(L+1) columns by 2^L rows of
512 px tiles, so level 0 is two tiles and level 4 is 16384 x 8192 (32 x 16 = 512 tiles). A layer's top level is the largest one its source can fill without
enlarging it: the day map (21600 wide) reaches level 4, the night map (13500 wide) level 3.

Each level is resized from the whole source in one go (Lanczos), never from tile to tile, so neighbouring tiles agree on their shared edge. The source is padded
with its own far edge before resizing, so the antimeridian (column 0 and the last column are the same meridian) has no seam; the poles are the top and bottom
rows, where the resize clamps, because nothing lies beyond them.
"""
import hashlib
import json
import math
import os
import shutil
import sys
import tempfile
import urllib.request

from PIL import Image, ImageChops

Image.MAX_IMAGE_PIXELS = 400_000_000
TILE = 512
BASE = 1024
HOST = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images"
SOURCES = {
    # Blue Marble: Next Generation with topography and bathymetry, September 2004, 21600 x 10800 (the same month and layer as textures/day-*.webp)
    "day": {
        "url": f"{HOST}/bmng/bmng-topography-bathymetry/september/world.topo.bathy.200409.3x21600x10800.jpg",
        "sha256": "863036b622ba3dab4eb4ffb7149730b02cfa433ce49672e9b7267022051e04a2",
        "quality": 80,
    },
    # Earth at Night, Black Marble 2016 colour map at 3 km, 13500 x 6750
    "night": {
        "url": f"{HOST}/imagerecords/144000/144898/BlackMarble_2016_3km.jpg",
        "sha256": "230aac448ae68c358be433dd518888cccb3a85ccf66f7b44326441c324ad6725",
        "quality": 80,
    },
}
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")


def fetch(name: str, cache: str) -> str:
    """The source's path in the cache, downloaded when missing; a file whose hash differs is never used."""
    source = SOURCES[name]
    path = os.path.join(cache, f"{name}.jpg")
    if not os.path.exists(path):
        os.makedirs(cache, exist_ok=True)
        req = urllib.request.Request(source["url"], headers={"User-Agent": "chikyu-earth make-earth-tiles"})
        with urllib.request.urlopen(req, timeout=300) as response, open(path, "wb") as file:
            shutil.copyfileobj(response, file)
    with open(path, "rb") as file:
        digest = hashlib.sha256(file.read()).hexdigest()
    if digest != source["sha256"]:
        raise SystemExit(f"{path}: sha256 {digest} is not the expected {source['sha256']} (delete it to download again, or update SOURCES)")
    return path


def top_level(source_width: int, base: int) -> int:
    level = 0
    while base * 2 ** (level + 1) <= source_width:
        level += 1
    return level


def resize_wrapped(image: Image.Image, width: int, height: int) -> Image.Image:
    """Resize with Lanczos, the far edge of the picture standing beyond each side, so the antimeridian joins."""
    pad = math.ceil(3 * max(1.0, image.width / width)) + 2
    wide = Image.new(image.mode, (image.width + 2 * pad, image.height))
    wide.paste(image.crop((image.width - pad, 0, image.width, image.height)), (0, 0))
    wide.paste(image, (pad, 0))
    wide.paste(image.crop((0, 0, pad, image.height)), (pad + image.width, 0))
    return wide.resize((width, height), Image.LANCZOS, box=(pad, 0, pad + image.width, image.height))


def build_layer(image: Image.Image, name: str, out: str, quality: int, tile: int = TILE, base: int = BASE, lossless: bool = False) -> dict:
    """Write every level's tiles, return the layer's entry for the manifest."""
    levels = []
    for level in range(top_level(image.width, base) + 1):
        width = base * 2**level
        height = width // 2
        resized = image if image.size == (width, height) else resize_wrapped(image, width, height)
        columns, rows = width // tile, height // tile
        total = 0
        for column in range(columns):
            folder = os.path.join(out, name, str(level), str(column))
            os.makedirs(folder, exist_ok=True)
            for row in range(rows):
                path = os.path.join(folder, f"{row}.webp")
                box = (column * tile, row * tile, (column + 1) * tile, (row + 1) * tile)
                resized.crop(box).save(path, "WEBP", quality=quality, method=6, lossless=lossless)
                total += os.path.getsize(path)
        levels.append({"level": level, "width": width, "height": height, "columns": columns, "rows": rows, "tiles": columns * rows, "bytes": total})
        print(f"{name} level {level}: {width} x {height}, {columns * rows} tiles, {total / 1048576:.2f} MB", flush=True)
    return {"levels": levels, "tiles": sum(entry["tiles"] for entry in levels), "bytes": sum(entry["bytes"] for entry in levels)}


def write_manifest(out: str, layers: dict, tile: int = TILE) -> None:
    manifest = {
        "tileSize": tile,
        "scheme": "equirectangular, longitude -180 to 180 across, latitude 90 down to -90; level L is 2^(L+1) columns by 2^L rows; tile path <layer>/<level>/<column>/<row>.webp, column 0 at -180, row 0 at 90",
        "layers": layers,
    }
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf8") as file:
        json.dump(manifest, file, indent=1)
        file.write("\n")


def build(cache: str, out: str, names: list) -> None:
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    layers = {}
    for name in names:
        with Image.open(fetch(name, cache)) as opened:
            image = opened.convert("RGB")
        layers[name] = build_layer(image, name, out, SOURCES[name]["quality"])
        layers[name]["source"] = SOURCES[name]["url"]
        layers[name]["sourceSha256"] = SOURCES[name]["sha256"]
        layers[name]["sourceWidth"] = image.width
        del image
    write_manifest(out, layers)
    total = sum(layer["bytes"] for layer in layers.values())
    print(f"{sum(layer['tiles'] for layer in layers.values())} tiles, {total / 1048576:.1f} MB in {out}")


def synthetic(width: int, height: int) -> Image.Image:
    """A made-up 2:1 map: smooth colour bands, a white stripe just east of the antimeridian and a black one just west of it."""
    image = Image.new("RGB", (width, height))
    pixels = []
    for y in range(height):
        for x in range(width):
            red = int(127 + 120 * math.sin(2 * math.pi * x / width))
            green = int(255 * y / (height - 1))
            colour = (red, green, int(127 + 100 * math.cos(2 * math.pi * 3 * x / width)))
            pixels.append((255, 255, 255) if x < 2 else (0, 0, 0) if x >= width - 6 else colour)
    image.putdata(pixels)
    return image


def column_gap(image: Image.Image, left: int, right: int) -> int:
    pixels = image.load()
    return max(max(abs(p - q) for p, q in zip(pixels[left, y], pixels[right, y])) for y in range(image.height))


def selftest() -> None:
    """Cut a tiny made-up map with tiles of 32 px and check the counts, the sizes and the seams (lossless, so a gap is the resize's)."""
    tile, base = 32, 64
    source = synthetic(256, 128)
    out = tempfile.mkdtemp(prefix="earth-tiles-selftest-")
    try:
        layer = build_layer(source, "synthetic", out, 100, tile=tile, base=base, lossless=True)
        write_manifest(out, {"synthetic": layer}, tile=tile)
        manifest = json.load(open(os.path.join(out, "manifest.json"), encoding="utf8"))
        levels = manifest["layers"]["synthetic"]["levels"]
        assert [entry["level"] for entry in levels] == [0, 1, 2], levels
        for entry in levels:
            level = entry["level"]
            assert entry["columns"] == 2 ** (level + 1) and entry["rows"] == 2**level, entry
            assert entry["tiles"] == entry["columns"] * entry["rows"], entry
            assert (entry["width"], entry["height"]) == (base * 2**level, base * 2**level // 2), entry
            found = sorted(os.listdir(os.path.join(out, "synthetic", str(level))), key=int)
            assert found == [str(c) for c in range(entry["columns"])], (level, found)
            whole = Image.new("RGB", (entry["width"], entry["height"]))
            for column in range(entry["columns"]):
                folder = os.path.join(out, "synthetic", str(level), str(column))
                assert sorted(os.listdir(folder), key=lambda f: int(f.split(".")[0])) == [f"{r}.webp" for r in range(entry["rows"])], folder
                for row in range(entry["rows"]):
                    with Image.open(os.path.join(folder, f"{row}.webp")) as piece:
                        assert piece.size == (tile, tile), (level, column, row, piece.size)
                        whole.paste(piece.convert("RGB"), (column * tile, row * tile))
            inner = max(column_gap(whole, x, x + 1) for x in range(1, whole.width - 2) if x % tile != tile - 1)
            for column in range(1, entry["columns"]):
                seam = column_gap(whole, column * tile - 1, column * tile)
                assert seam <= inner + 8, f"level {level}: tile seam {seam} against a typical {inner}"
            # the same level with the antimeridian rolled to the middle (so the white and black stripes are neighbours in the middle of the picture), resized with no edge near it, rolled back
            half = ImageChops.offset(source, source.width // 2, 0).resize(whole.size, Image.LANCZOS)
            reference = ImageChops.offset(half, -whole.width // 2, 0)
            worst = max(high for _, high in ImageChops.difference(whole, reference).getextrema())
            assert worst <= 2, f"level {level}: differs from the rolled reference by {worst}"
        assert layer["tiles"] == 2 + 8 + 32, layer["tiles"]
    finally:
        shutil.rmtree(out, ignore_errors=True)
    print("make-earth-tiles selftest: ok")


def main(argv: list) -> None:
    command = argv[1] if len(argv) > 1 else ""
    if command == "selftest":
        selftest()
    elif command == "build":
        options = dict(zip(argv[2::2], argv[3::2]))
        cache = options.get("--cache", os.path.join(ROOT, ".cache", "earth-tiles"))
        out = options.get("--out", os.path.join(ROOT, ".cache", "earth-tiles-out"))
        names = options.get("--layers", "day,night").split(",")
        build(cache, out, names)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
