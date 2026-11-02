// Which size of each picture to hold on the GPU. Small first, sharper on zoom, and never past a cap. Pure.

/**
 * One of the pictures the realistic Earth and the space view draw with: `day`, `night`, `clouds`, `water` and `moon`.
 *
 * @example
 * ```ts
 * import { TIERS, type Layer } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const layer: Layer = "clouds";
 * console.log(TIERS[layer]);
 * ```
 */
export type Layer = "day" | "night" | "clouds" | "water" | "moon";

/**
 * The widths each layer is shipped in (every picture is 2:1, so the height is half).
 *
 * @example
 * ```ts
 * import { TIERS } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(TIERS.day);
 * ```
 */
export const TIERS: Record<Layer, readonly number[]> = {
  day: [1024, 2048, 4096],
  night: [1024, 2048],
  clouds: [1024, 2048],
  water: [1024, 2048],
  moon: [1024, 2048],
};

/**
 * The most pixels across a texture the package ever asks the GPU for.
 *
 * @example
 * ```ts
 * import { MAX_TEXTURE } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(MAX_TEXTURE);
 * ```
 */
export const MAX_TEXTURE = 4096;

/**
 * Texels across the whole circumference wanted per device pixel of the globe's radius: 3 is a little under 2 pi, so a texel is a little larger than a pixel.
 *
 * @example
 * ```ts
 * import { TEXELS_PER_RADIUS_PIXEL } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(TEXELS_PER_RADIUS_PIXEL);
 * ```
 */
export const TEXELS_PER_RADIUS_PIXEL = 3;

/**
 * The width to hold for a layer when the globe's disc has radius `radiusPx` device pixels: the smallest shipped width that gives
 * `TEXELS_PER_RADIUS_PIXEL` texels per pixel, else the largest, never more than `cap`, never less than the smallest.
 *
 * @param layer - Which picture.
 * @param radiusPx - The disc's radius in device pixels.
 * @param cap - The most pixels across to ask for; {@link MAX_TEXTURE} by default.
 * @returns One of the widths in {@link TIERS} for that layer.
 *
 * @example
 * ```ts
 * import { chooseTier } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(chooseTier("day", 200), chooseTier("day", 900), chooseTier("day", 900, 2048));
 * ```
 */
export function chooseTier(layer: Layer, radiusPx: number, cap: number = MAX_TEXTURE): number {
  const widths = TIERS[layer].filter((width) => width <= Math.max(cap, TIERS[layer][0]!));
  const wanted = radiusPx * TEXELS_PER_RADIUS_PIXEL;
  return widths.find((width) => width >= wanted) ?? widths[widths.length - 1]!;
}

/**
 * The cap for this device: low-memory phones stop at 2048, and the GPU's own limit and the option are never passed.
 *
 * @param options - `max` (the page's own limit), `gpuMax` (the GPU's `MAX_TEXTURE_SIZE`) and `deviceMemory` (gigabytes, from `navigator.deviceMemory`); each may be left out.
 * @returns The most pixels across any picture may have on this device.
 *
 * @example
 * ```ts
 * import { textureCap } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(textureCap(), textureCap({ deviceMemory: 2 }), textureCap({ gpuMax: 1024 }));
 * ```
 */
export function textureCap(options: { max?: number; gpuMax?: number; deviceMemory?: number } = {}): number {
  let cap = Math.min(MAX_TEXTURE, options.max ?? MAX_TEXTURE, options.gpuMax ?? MAX_TEXTURE);
  if (options.deviceMemory !== undefined && options.deviceMemory <= 2) cap = Math.min(cap, 2048);
  return cap;
}

/**
 * Bytes of GPU memory a texture of this width costs, with its mipmaps, at 4 bytes a pixel (the most it can be).
 *
 * @param width - Pixels across; the picture is 2:1.
 * @returns The bytes the GPU holds for it.
 *
 * @example
 * ```ts
 * import { textureBytes } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(textureBytes(4096));
 * ```
 */
export const textureBytes = (width: number): number => Math.round(width * (width / 2) * 4 * (4 / 3));
