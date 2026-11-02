#!/usr/bin/env python3
"""Make textures/*.webp for the realistic Earth from NASA's public-domain images (see NOTICE.md).

    python3 scripts/make-textures.py [cache-dir]     # needs Python 3 and Pillow (pip install pillow)

Downloads the four source images once into the cache dir (default .cache/textures, git-ignored), then writes each layer at its
sizes: day 1024, 2048 and 4096 wide, night 1024 and 2048, clouds 1024 and 2048, water mask 1024 and 2048. Every picture is
2:1 equirectangular (longitude -180 to 180 across, latitude 90 down to -90). Nothing is fetched at runtime.
"""
import os
import sys
import urllib.request

from PIL import Image, ImageChops, ImageFilter

Image.MAX_IMAGE_PIXELS = None
BASE = "https://eoimages.gsfc.nasa.gov/images/imagerecords"
SOURCES = {
    # Blue Marble Next Generation with topography and bathymetry, September 2004, 5400 x 2700 (Visible Earth 73801)
    "day": f"{BASE}/73000/73801/world.topo.bathy.200409.3x5400x2700.jpg",
    # Earth at Night, Black Marble 2016, colour map at 0.1 degree, 3600 x 1800 (Visible Earth 144898)
    "night": f"{BASE}/144000/144898/BlackMarble_2016_01deg.jpg",
    # Blue Marble clouds, 2048 x 1024 (Visible Earth 57747)
    "clouds": f"{BASE}/57000/57747/cloud_combined_2048.jpg",
}
OUT = os.path.join(os.path.dirname(__file__), "..", "textures")


def fetch(name: str, cache: str) -> Image.Image:
    path = os.path.join(cache, f"{name}.jpg")
    if not os.path.exists(path):
        os.makedirs(cache, exist_ok=True)
        req = urllib.request.Request(SOURCES[name], headers={"User-Agent": "chikyu-earth make-textures"})
        with urllib.request.urlopen(req, timeout=120) as response, open(path, "wb") as file:
            file.write(response.read())
    return Image.open(path).convert("RGB")


def save(image: Image.Image, name: str, width: int, quality: int) -> None:
    resized = image if image.width == width else image.resize((width, width // 2), Image.LANCZOS)
    path = os.path.join(OUT, f"{name}-{width}.webp")
    resized.save(path, "WEBP", quality=quality, method=6)
    print(f"{name}-{width}.webp {os.path.getsize(path) / 1024:.0f} KB")


def water_mask(day: Image.Image) -> Image.Image:
    """Ocean and lakes are blue (B above R and G) and not bright (snow and ice are); a small median and blur soften the edge."""
    r, g, b = day.split()
    over = lambda channel, floor: channel.point(lambda v: 255 if v >= floor else 0)
    blue_over_red = over(ImageChops.subtract(b, r), 8)
    blue_over_green = over(ImageChops.subtract(b, g), 3)
    not_bright = b.point(lambda v: 255 if v < 215 else 0)
    mask = ImageChops.darker(ImageChops.darker(blue_over_red, blue_over_green), not_bright)
    return mask.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(1.0))


def main() -> None:
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", ".cache", "textures")
    os.makedirs(OUT, exist_ok=True)
    day, night, clouds = fetch("day", cache), fetch("night", cache), fetch("clouds", cache)
    for width in (1024, 2048, 4096):
        save(day, "day", width, 82)
    for width in (1024, 2048):
        save(night, "night", width, 80)
        save(clouds.convert("L"), "clouds", width, 80)
    mask = water_mask(day.resize((2048, 1024), Image.LANCZOS))
    for width in (1024, 2048):
        save(mask, "water", width, 75)


if __name__ == "__main__":
    main()
