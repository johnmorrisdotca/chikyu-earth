// The flat map's photo look: NASA's day picture of the Earth laid on the map, the night picture (city lights) blended in across the terminator. The pictures are the ones the realistic Earth uses
// (`textures/`), loaded only when the look is asked for, one size of each at a time, and let go when the look goes. The pure parts (which size, where each piece of the picture lands, how dark each place is) have no DOM.
import { TIERS, MAX_TEXTURE } from "../realistic/tiers.ts";
import { pixelsPerDegree, type FlatView } from "./geometry.ts";

const RAD = Math.PI / 180;

/**
 * The two looks of the flat map: `map`, the drawn map of countries (the default), and `photo`, NASA's picture of the Earth.
 *
 * @example
 * ```ts
 * import type { FlatLook } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const look: FlatLook = "photo";
 * console.log(look);
 * ```
 */
export type FlatLook = "map" | "photo";

/**
 * Which look an attribute value asks for: `photo`, in any case, else the drawn map.
 *
 * @param value - The `look` attribute, or null.
 * @returns `photo` or `map`.
 *
 * @example
 * ```ts
 * import { readLook } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(readLook("Photo"), readLook(null), readLook("satellite"));
 * ```
 */
export const readLook = (value: string | null): FlatLook => (value !== null && value.trim().toLowerCase() === "photo" ? "photo" : "map");

/**
 * Which width of a picture to hold: the smallest shipped width (`TIERS`) with a texel for each pixel the whole world is across, else the largest, never more than `cap` (4096 at most), never less than the smallest.
 *
 * @param layer - `day` or `night`.
 * @param worldPx - Device pixels across the whole world (360 degrees) at this zoom.
 * @param cap - The most pixels across to ask for.
 * @returns One of the widths of `TIERS[layer]`.
 *
 * @example
 * ```ts
 * import { photoWidth } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(photoWidth("day", 900), photoWidth("day", 3000), photoWidth("day", 3000, 2048), photoWidth("night", 9000));
 * ```
 */
export function photoWidth(layer: "day" | "night", worldPx: number, cap: number = MAX_TEXTURE): number {
  const widths = TIERS[layer].filter((width) => width <= Math.max(Math.min(cap, MAX_TEXTURE), TIERS[layer][0]!));
  return widths.find((width) => width >= worldPx) ?? widths[widths.length - 1]!;
}

/**
 * One piece of a picture and where it lands in the map's box: `s*` is the rectangle of the picture's own pixels, `d*` the rectangle of the box, in CSS pixels from its top left.
 *
 * @example
 * ```ts
 * import type { PhotoPiece } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const area = (piece: PhotoPiece): number => piece.dw * piece.dh;
 * console.log(typeof area);
 * ```
 */
export interface PhotoPiece {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * The pieces that draw a whole-world picture (longitude -180 at its left edge, 90 degrees north at its top, 2 to 1) on the map: one for each turn of the world that shows in the box, cut to what shows, so that a point of the picture lands where `projectFlat` puts that longitude and latitude.
 *
 * @param view - The view.
 * @param width - The picture's width in pixels.
 * @param height - The picture's height in pixels.
 * @returns The pieces, left to right.
 *
 * @example
 * ```ts
 * import { photoPieces } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(photoPieces({ width: 720, height: 360, centerLon: 0, centerLat: 0, zoom: 1 }, 2048, 1024));
 * ```
 */
export function photoPieces(view: FlatView, width: number, height: number): PhotoPiece[] {
  const k = pixelsPerDegree(view);
  const w = 360 * k;
  const h = 180 * k;
  const x0 = view.width / 2 - (view.centerLon + 180) * k;
  const y0 = view.height / 2 - (90 - view.centerLat) * k;
  const top = Math.max(0, y0);
  const bottom = Math.min(view.height, y0 + h);
  const out: PhotoPiece[] = [];
  if (!(bottom > top) || !(w > 0)) return out;
  for (let turn = Math.floor(-x0 / w); x0 + turn * w < view.width; turn += 1) {
    const left = x0 + turn * w;
    const from = Math.max(0, left);
    const to = Math.min(view.width, left + w);
    if (!(to > from)) continue;
    out.push({ sx: ((from - left) / w) * width, sy: ((top - y0) / h) * height, sw: ((to - from) / w) * width, sh: ((bottom - top) / h) * height, dx: from, dy: top, dw: to - from, dh: bottom - top });
  }
  return out;
}

/** The mask's size: one cell a degree. */
export const MASK_COLS = 360;
export const MASK_ROWS = 180;

const smooth = (low: number, high: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/**
 * How dark and how lit with city lights each degree of the world is, for a Sun over a place: two grids of 360 by 180 (a cell a degree, longitude -180 at the left, 90 north at the top), each 0 to 255. `veil` is how far the day picture is darkened (0 in the day, 219 at most, in the middle of the night, so the land can still be made out),
 * `lights` is how much of the night picture shows. The change runs from the Sun 15 degrees up the sky to 7 degrees below the horizon, soft like the light itself.
 *
 * @param sunLon - Degrees east of the point under the Sun.
 * @param sunLat - Degrees north of the point under the Sun.
 * @returns The two grids.
 *
 * @example
 * ```ts
 * import { nightWeights } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const { veil, lights } = nightWeights(0, 0);
 * console.log(veil[90 * 360 + 180], lights[90 * 360 + 180], veil[90 * 360], lights[90 * 360]);
 * ```
 */
export function nightWeights(sunLon: number, sunLat: number): { veil: Uint8ClampedArray; lights: Uint8ClampedArray } {
  const veil = new Uint8ClampedArray(MASK_COLS * MASK_ROWS);
  const lights = new Uint8ClampedArray(MASK_COLS * MASK_ROWS);
  const sinS = Math.sin(sunLat * RAD);
  const cosS = Math.cos(sunLat * RAD);
  for (let row = 0; row < MASK_ROWS; row += 1) {
    const lat = (90 - (row + 0.5)) * RAD;
    const a = Math.sin(lat) * sinS;
    const b = Math.cos(lat) * cosS;
    for (let col = 0; col < MASK_COLS; col += 1) {
      // the sine of the Sun's height above the horizon there
      const height = a + b * Math.cos((-180 + col + 0.5 - sunLon) * RAD);
      veil[row * MASK_COLS + col] = Math.round(0.86 * 255 * (1 - smooth(-0.12, 0.26, height)));
      lights[row * MASK_COLS + col] = Math.round(255 * (1 - smooth(-0.12, 0.0, height)));
    }
  }
  return { veil, lights };
}

interface Held {
  width: number;
  bitmap: ImageBitmap;
}
interface Slot {
  layer: "day" | "night";
  held: Held | null;
  loading: number;
  abort: AbortController | null;
  lower: ReturnType<typeof setTimeout> | undefined;
}

/** Milliseconds a smaller size must be enough before the larger one is let go. */
const DOWNGRADE_MS = 4000;

export interface PhotoDeps {
  /** Where the pictures are served from; ends with a slash. */
  base: () => string;
  /** The widest picture to hold, 4096 at most. */
  cap: () => number;
  /** A picture arrived or was let go: draw the map again. */
  changed: () => void;
  failed: (error: unknown) => void;
}

/** The pictures the photo look holds: the day picture and the night picture, each one size at a time, fetched when `want` first asks and freed by `dispose`. */
export class PhotoPictures {
  #slots: Slot[] = [
    { layer: "day", held: null, loading: 0, abort: null, lower: undefined },
    { layer: "night", held: null, loading: 0, abort: null, lower: undefined },
  ];
  #deps: PhotoDeps;
  #dead = false;
  /** A canvas of the box's size for the night picture, which is masked before it is added; made when first needed. */
  scratch: HTMLCanvasElement | null = null;
  /** The mask's canvas, 360 by 180. */
  mask: HTMLCanvasElement | null = null;

  constructor(deps: PhotoDeps) {
    this.#deps = deps;
  }

  get day(): Held | null {
    return this.#slots[0]!.held;
  }
  get night(): Held | null {
    return this.#slots[1]!.held;
  }
  /** True while a picture is on its way. */
  get loading(): boolean {
    return this.#slots.some((slot) => slot.loading > 0);
  }

  /** Ask for the sizes that `worldPx` device pixels across the world need: a larger one is fetched at once, a smaller one only once the zoom has stayed out for a few seconds. */
  want(worldPx: number): void {
    if (this.#dead) return;
    for (const slot of this.#slots) {
      const wanted = photoWidth(slot.layer, worldPx, this.#deps.cap());
      const have = slot.held?.width ?? 0;
      if (wanted === have || slot.loading === wanted) {
        clearTimeout(slot.lower);
        slot.lower = undefined;
        continue;
      }
      if (wanted > have) {
        clearTimeout(slot.lower);
        slot.lower = undefined;
        this.#load(slot, wanted);
      } else if (slot.lower === undefined) {
        slot.lower = setTimeout(() => {
          slot.lower = undefined;
          this.#load(slot, photoWidth(slot.layer, worldPx, this.#deps.cap()));
        }, DOWNGRADE_MS);
      }
    }
  }

  #load(slot: Slot, width: number): void {
    slot.abort?.abort();
    const abort = new AbortController();
    slot.abort = abort;
    slot.loading = width;
    fetch(`${this.#deps.base()}${slot.layer}-${width}.webp`, { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`${slot.layer}-${width}.webp: ${response.status}`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        if (this.#dead || abort.signal.aborted) {
          bitmap.close();
          return;
        }
        const old = slot.held;
        slot.held = { width, bitmap };
        slot.loading = 0;
        slot.abort = null;
        old?.bitmap.close();
        this.#deps.changed();
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted || this.#dead) return;
        slot.loading = 0;
        slot.abort = null;
        // the night picture is a finishing touch: the map is shown without it. Without the day picture there is no photo
        if (slot.layer === "day") this.#deps.failed(error);
      });
  }

  /** Free everything: the pictures, the canvases and the requests on their way. */
  dispose(): void {
    this.#dead = true;
    for (const slot of this.#slots) {
      clearTimeout(slot.lower);
      slot.abort?.abort();
      slot.held?.bitmap.close();
      slot.held = null;
    }
    for (const canvas of [this.scratch, this.mask]) if (canvas) canvas.width = canvas.height = 0;
    this.scratch = this.mask = null;
  }
}

/**
 * Lay the photo on a canvas already scaled to CSS pixels: the day picture, then `lines` (the borders), then the night darkening and the city lights for a Sun over `sun` (nothing of the night when `sun` is null). Returns false when there is no day picture yet and nothing was drawn.
 *
 * @param ctx - The map canvas's context, its transform set to the device pixel ratio.
 * @param view - The view.
 * @param pictures - The pictures held.
 * @param sun - The point under the Sun, or null for all day.
 * @param lines - Draws the borders on `ctx`, or null.
 * @returns Whether the photo was drawn.
 */
export function paintPhoto(ctx: CanvasRenderingContext2D, view: FlatView, pictures: PhotoPictures, sun: { lon: number; lat: number } | null, lines: (() => void) | null): boolean {
  const day = pictures.day;
  if (!day) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const p of photoPieces(view, day.width, day.width / 2)) ctx.drawImage(day.bitmap, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
  lines?.();
  if (!sun) return true;
  const weights = nightWeights(sun.lon, sun.lat);
  const mask = (pictures.mask ??= Object.assign(document.createElement("canvas"), { width: MASK_COLS, height: MASK_ROWS }));
  const maskCtx = mask.getContext("2d")!;
  const image = maskCtx.createImageData(MASK_COLS, MASK_ROWS);
  const fill = (alpha: Uint8ClampedArray, rgb: readonly [number, number, number]): ImageData => {
    for (let i = 0; i < alpha.length; i += 1) {
      image.data[i * 4] = rgb[0];
      image.data[i * 4 + 1] = rgb[1];
      image.data[i * 4 + 2] = rgb[2];
      image.data[i * 4 + 3] = alpha[i]!;
    }
    return image;
  };
  const lay = (target: CanvasRenderingContext2D): void => {
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = "high";
    for (const p of photoPieces(view, MASK_COLS, MASK_ROWS)) target.drawImage(mask, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
  };
  maskCtx.putImageData(fill(weights.veil, [3, 9, 24]), 0, 0);
  lay(ctx);
  const night = pictures.night;
  if (!night) return true;
  const scratch = (pictures.scratch ??= document.createElement("canvas"));
  const target = ctx.canvas;
  if (scratch.width !== target.width || scratch.height !== target.height) {
    scratch.width = target.width;
    scratch.height = target.height;
  }
  const s = scratch.getContext("2d")!;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.clearRect(0, 0, scratch.width, scratch.height);
  s.setTransform(target.width / view.width, 0, 0, target.height / view.height, 0, 0);
  s.globalCompositeOperation = "source-over";
  s.imageSmoothingEnabled = true;
  s.imageSmoothingQuality = "high";
  for (const p of photoPieces(view, night.width, night.width / 2)) s.drawImage(night.bitmap, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
  s.globalCompositeOperation = "destination-in";
  maskCtx.putImageData(fill(weights.lights, [255, 255, 255]), 0, 0);
  lay(s);
  // the picture times itself: the dim glow of the land under the lights drops away and the lights stay
  s.globalCompositeOperation = "multiply";
  s.drawImage(scratch, 0, 0, view.width, view.height);
  s.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let pass = 0; pass < 3; pass += 1) ctx.drawImage(scratch, 0, 0, view.width, view.height);
  ctx.restore();
  return true;
}
