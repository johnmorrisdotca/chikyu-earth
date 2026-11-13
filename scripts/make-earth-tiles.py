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
enlarging it. The whole-picture sources reach level 4 (the day map, 21600 wide) and level 3 (the night map, 13500 wide). The full-resolution maps (500 m, 86400 x 43200)
are published as eight panels, A1 to D2 (four across, two down, 21600 x 21600 each), and the levels above the whole picture come from them: day level 5 (32768 wide),
night level 4 (16384 wide). Neither goes higher (`maxLevel`), and a level is never built from a source that does not fill it.

Each level is resized from the whole source in one go (Lanczos), never from tile to tile, so neighbouring tiles agree on their shared edge. The source is padded
with its own far edge before resizing, so the antimeridian (column 0 and the last column are the same meridian) has no seam; the poles are the top and bottom
rows, where the resize clamps, because nothing lies beyond them.

A level from the panels is resized one panel at a time, so the 86400 x 43200 map (11 GB as pixels) is never held whole: a panel is padded with the edge rows and
columns of its neighbours (and across the antimeridian, from the far panel), resized to the exact square of the level it covers (21600 / 8192 for day level 5, which is
exact in binary), and that square is a whole number of tiles. The result is the same as resizing the whole map in one go, to the pixel (`selftest` checks it), with about
3 GB in memory at a time.
"""
import hashlib
import json
import math
import os
import shutil
import sys
import tempfile
import time
import urllib.request

from PIL import Image, ImageChops

Image.MAX_IMAGE_PIXELS = 500_000_000  # a 21600 x 21600 panel is 466,560,000 pixels
TILE = 512
BASE = 1024
PANEL_COLUMNS = ("A", "B", "C", "D")
PANEL_ROWS = ("1", "2")
PANEL_SIZE = 21600


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
# The sources, each with its URL and SHA-256 (the whole picture, and the eight panels of the full-resolution map: NASA's own file names A1 to D1 along the top, A2 to D2 below),
# are in their own file so that CI can keep the downloads between runs for as long as that file is the same.
with open(os.path.join(HERE, "earth-tiles-sources.json"), encoding="utf8") as sources_file:
    SOURCES = json.load(sources_file)


def download(url: str, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    partial = path + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": "chikyu-earth make-earth-tiles"})
    with urllib.request.urlopen(req, timeout=300) as response, open(partial, "wb") as file:
        shutil.copyfileobj(response, file)
    os.replace(partial, path)


def fetch(name: str, cache: str, panel: str = "") -> str:
    """The source's (or one of its panels') path in the cache, downloaded when missing; a file whose hash differs is never used."""
    source = SOURCES[name]["panels"][panel] if panel else SOURCES[name]
    path = os.path.join(cache, f"{name}-{panel}.jpg" if panel else f"{name}.jpg")
    if not os.path.exists(path):
        download(source["url"], path)
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    if digest.hexdigest() != source["sha256"]:
        raise SystemExit(f"{path}: sha256 {digest.hexdigest()} is not the expected {source['sha256']} (delete it to download again, or update SOURCES)")
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


def cut_tiles(piece: Image.Image, out: str, name: str, level: int, column0: int, row0: int, quality: int, tile: int, lossless: bool) -> int:
    """Write the tiles of a piece of a level whose top left is tile (column0, row0); the piece is a whole number of tiles. Returns the bytes written."""
    total = 0
    for column in range(piece.width // tile):
        folder = os.path.join(out, name, str(level), str(column0 + column))
        os.makedirs(folder, exist_ok=True)
        for row in range(piece.height // tile):
            path = os.path.join(folder, f"{row0 + row}.webp")
            box = (column * tile, row * tile, (column + 1) * tile, (row + 1) * tile)
            piece.crop(box).save(path, "WEBP", quality=quality, method=6, lossless=lossless)
            total += os.path.getsize(path)
    return total


def level_entry(level: int, base: int, tile: int, total: int) -> dict:
    width = base * 2**level
    height = width // 2
    columns, rows = width // tile, height // tile
    print(f"  level {level}: {width} x {height}, {columns * rows} tiles, {total / 1048576:.2f} MB", flush=True)
    return {"level": level, "width": width, "height": height, "columns": columns, "rows": rows, "tiles": columns * rows, "bytes": total}


def build_layer(image: Image.Image, name: str, out: str, quality: int, tile: int = TILE, base: int = BASE, lossless: bool = False, max_level: int = 99) -> list:
    """Write every level the whole picture can fill, resized from the whole of it. Returns the levels' manifest entries."""
    entries = []
    for level in range(min(top_level(image.width, base), max_level) + 1):
        width = base * 2**level
        height = width // 2
        resized = image if image.size == (width, height) else resize_wrapped(image, width, height)
        entries.append(level_entry(level, base, tile, cut_tiles(resized, out, name, level, 0, 0, quality, tile, lossless)))
    return entries


def load_rgb(path: str) -> Image.Image:
    with Image.open(path) as opened:
        opened.load()
        return opened if opened.mode == "RGB" else opened.convert("RGB")


def panel_edges(paths: dict, pad: int) -> dict:
    """The outer `pad` rows and columns of every panel (top, bottom, left, right), which its neighbours are padded with. Each panel is decoded once and let go."""
    edges = {}
    for key, path in paths.items():
        panel = load_rgb(path)
        w, h = panel.size
        edges[key] = {
            "top": panel.crop((0, 0, w, pad)),
            "bottom": panel.crop((0, h - pad, w, h)),
            "left": panel.crop((0, 0, pad, h)),
            "right": panel.crop((w - pad, 0, w, h)),
        }
        del panel
    return edges


def padded_panel(panel: Image.Image, key: str, edges: dict, pad: int) -> tuple:
    """The panel with its neighbours' edges around it (the far panel across the antimeridian; nothing above the top row or below the bottom one, where the resize clamps at the pole). Returns the canvas and the box of the panel in it."""
    w, h = panel.size
    column, row = PANEL_COLUMNS.index(key[0]), PANEL_ROWS.index(key[1])
    west = PANEL_COLUMNS[(column - 1) % len(PANEL_COLUMNS)]
    east = PANEL_COLUMNS[(column + 1) % len(PANEL_COLUMNS)]
    top = pad if row > 0 else 0
    bottom = pad if row < len(PANEL_ROWS) - 1 else 0
    canvas = Image.new("RGB", (w + 2 * pad, h + top + bottom))
    canvas.paste(panel, (pad, top))
    canvas.paste(edges[west + key[1]]["right"], (0, top))
    canvas.paste(edges[east + key[1]]["left"], (pad + w, top))
    if top:
        above = PANEL_ROWS[row - 1]
        canvas.paste(edges[key[0] + above]["bottom"], (pad, 0))
        canvas.paste(edges[west + above]["bottom"].crop((w - pad, 0, w, pad)), (0, 0))
        canvas.paste(edges[east + above]["bottom"].crop((0, 0, pad, pad)), (pad + w, 0))
    if bottom:
        below = PANEL_ROWS[row + 1]
        canvas.paste(edges[key[0] + below]["top"], (pad, top + h))
        canvas.paste(edges[west + below]["top"].crop((w - pad, 0, w, pad)), (0, top + h))
        canvas.paste(edges[east + below]["top"].crop((0, 0, pad, pad)), (pad + w, top + h))
    return canvas, (pad, top, pad + w, top + h)


def build_panel_levels(paths: dict, name: str, out: str, quality: int, levels: list, tile: int = TILE, base: int = BASE, lossless: bool = False) -> list:
    """Write the given levels from a map published as panels (a grid of PANEL_COLUMNS x PANEL_ROWS square panels), one panel at a time, so the whole map is never in memory.

    A panel is resized to the exact square of the level it covers, which is a whole number of tiles, so the tiles come out where a resize of the whole map would put them."""
    columns, rows = len(PANEL_COLUMNS), len(PANEL_ROWS)
    first = next(iter(paths.values()))
    with Image.open(first) as opened:
        size = opened.width
    wide = size * columns
    assert size == opened.height, "a panel is square"
    totals = {}
    for level in levels:
        width = base * 2**level
        assert width <= wide, f"level {level} ({width} wide) is wider than the {wide} pixel source: it would be enlarged"
        assert width % columns == 0 and (width // columns) % tile == 0, f"level {level}: a panel is not a whole number of {tile} px tiles"
        totals[level] = 0
    pad = max(math.ceil(3 * max(1.0, wide / (base * 2**level))) + 2 for level in levels)
    edges = panel_edges(paths, pad)
    for key, path in paths.items():
        column, row = PANEL_COLUMNS.index(key[0]), PANEL_ROWS.index(key[1])
        panel = load_rgb(path)
        canvas, box = padded_panel(panel, key, edges, pad)
        del panel
        for level in levels:
            square = base * 2**level // columns
            piece = canvas.resize((square, square), Image.LANCZOS, box=box)
            per = square // tile
            totals[level] += cut_tiles(piece, out, name, level, column * per, row * per, quality, tile, lossless)
        del canvas
        print(f"  {name} panel {key} cut", flush=True)
    return [level_entry(level, base, tile, totals[level]) for level in levels]


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
    started = time.time()
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    layers = {}
    for name in names:
        source = SOURCES[name]
        print(f"{name}: levels from the whole picture", flush=True)
        with Image.open(fetch(name, cache)) as opened:
            image = opened.convert("RGB")
        entries = build_layer(image, name, out, source["quality"], max_level=source["maxLevel"])
        whole = image.width
        del image
        above = [level for level in range(len(entries), source["maxLevel"] + 1)]
        if above:
            print(f"{name}: levels {above[0]} to {above[-1]} from the eight panels", flush=True)
            paths = {key: fetch(name, cache, key) for key in source["panels"]}
            entries += build_panel_levels(paths, name, out, source["quality"], above)
        layers[name] = {"levels": entries, "tiles": sum(entry["tiles"] for entry in entries), "bytes": sum(entry["bytes"] for entry in entries)}
        layers[name]["source"] = source["url"]
        layers[name]["sourceSha256"] = source["sha256"]
        layers[name]["sourceWidth"] = whole
        layers[name]["panelSources"] = {key: {"url": panel["url"], "sha256": panel["sha256"]} for key, panel in source["panels"].items()}
        layers[name]["panelWidth"] = PANEL_SIZE * len(PANEL_COLUMNS)
        print(f"{name}: {layers[name]['tiles']} tiles, {layers[name]['bytes'] / 1048576:.1f} MB", flush=True)
    write_manifest(out, layers)
    total = sum(layer["bytes"] for layer in layers.values())
    print(f"{sum(layer['tiles'] for layer in layers.values())} tiles, {total / 1048576:.1f} MB in {out}, {time.time() - started:.0f} s")


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
        entries = build_layer(source, "synthetic", out, 100, tile=tile, base=base, lossless=True)
        layer = {"levels": entries, "tiles": sum(entry["tiles"] for entry in entries), "bytes": sum(entry["bytes"] for entry in entries)}
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
        panels_selftest(tile, base)
    finally:
        shutil.rmtree(out, ignore_errors=True)
    print("make-earth-tiles selftest: ok")


def panels_selftest(tile: int, base: int) -> None:
    """A made-up 512 x 256 map split into eight 128 px panels and cut from them one panel at a time must give, to the pixel, the tiles that a resize of the whole map gives:
    across every panel join, the antimeridian (the white and black stripes) and the poles."""
    source = synthetic(512, 256)
    folder = tempfile.mkdtemp(prefix="earth-tiles-panels-selftest-")
    out = tempfile.mkdtemp(prefix="earth-tiles-panels-out-")
    try:
        size = source.width // len(PANEL_COLUMNS)
        paths = {}
        for column, letter in enumerate(PANEL_COLUMNS):
            for row, number in enumerate(PANEL_ROWS):
                paths[letter + number] = os.path.join(folder, f"{letter}{number}.png")
                source.crop((column * size, row * size, (column + 1) * size, (row + 1) * size)).save(paths[letter + number])
        levels = [1, 2]
        entries = build_panel_levels(paths, "panels", out, 100, levels, tile=tile, base=base, lossless=True)
        for entry in entries:
            width, height = entry["width"], entry["height"]
            assert entry["tiles"] == (width // tile) * (height // tile), entry
            reference = resize_wrapped(source, width, height)
            for column in range(width // tile):
                for row in range(height // tile):
                    with Image.open(os.path.join(out, "panels", str(entry["level"]), str(column), f"{row}.webp")) as piece:
                        made = piece.convert("RGB")
                    wanted = reference.crop((column * tile, row * tile, (column + 1) * tile, (row + 1) * tile))
                    worst = max(high for _, high in ImageChops.difference(made, wanted).getextrema())
                    assert worst == 0, f"panel level {entry['level']} tile {column}/{row} differs from the whole-map resize by {worst}"
        try:
            build_panel_levels(paths, "panels", out, 100, [4], tile=tile, base=base, lossless=True)
        except AssertionError:
            pass
        else:
            raise AssertionError("a level wider than the panels' map was built (it would be enlarged)")
    finally:
        shutil.rmtree(folder, ignore_errors=True)
        shutil.rmtree(out, ignore_errors=True)


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
