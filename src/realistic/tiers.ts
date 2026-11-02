// Which size of each picture to hold on the GPU. Small first, sharper on zoom, and never past a cap. Pure.

export type Layer = "day" | "night" | "clouds" | "water";

/** The widths each layer is shipped in (every picture is 2:1, so the height is half). */
export const TIERS: Record<Layer, readonly number[]> = {
  day: [1024, 2048, 4096],
  night: [1024, 2048],
  clouds: [1024, 2048],
  water: [1024, 2048],
};

/** The most pixels across a texture the package ever asks the GPU for. */
export const MAX_TEXTURE = 4096;

/** Texels across the whole circumference wanted per device pixel of the globe's radius: 3 is a little under 2 pi, so a texel is a little larger than a pixel. */
export const TEXELS_PER_RADIUS_PIXEL = 3;

/**
 * The width to hold for a layer when the globe's disc has radius `radiusPx` device pixels: the smallest shipped width that gives
 * `TEXELS_PER_RADIUS_PIXEL` texels per pixel, else the largest, never more than `cap`, never less than the smallest.
 */
export function chooseTier(layer: Layer, radiusPx: number, cap: number = MAX_TEXTURE): number {
  const widths = TIERS[layer].filter((width) => width <= Math.max(cap, TIERS[layer][0]!));
  const wanted = radiusPx * TEXELS_PER_RADIUS_PIXEL;
  return widths.find((width) => width >= wanted) ?? widths[widths.length - 1]!;
}

/** The cap for this device: low-memory phones stop at 2048, and the GPU's own limit and the option are never passed. */
export function textureCap(options: { max?: number; gpuMax?: number; deviceMemory?: number } = {}): number {
  let cap = Math.min(MAX_TEXTURE, options.max ?? MAX_TEXTURE, options.gpuMax ?? MAX_TEXTURE);
  if (options.deviceMemory !== undefined && options.deviceMemory <= 2) cap = Math.min(cap, 2048);
  return cap;
}

/** Bytes of GPU memory a texture of this width costs, with its mipmaps, at 4 bytes a pixel (the most it can be). */
export const textureBytes = (width: number): number => Math.round(width * (width / 2) * 4 * (4 / 3));
