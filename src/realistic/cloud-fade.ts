// The clouds give way to the ground when the view is close. The cloud picture is one whole-Earth map at most 2048 pixels across (about 20 km a texel), so from a few hundred kilometres
// up its texels are many pixels wide and it blurs the sharp ground under it. Its strength goes from 1 to 0 as a texel grows from a few device pixels to many. The figure is the one the
// map tiles use (`tileLevel`): the disc's radius in device pixels, so a texel is `2 * PI * radiusPx / width` pixels. A state of the view, not of time: it changes only when the view does.
// The realistic Earth is orthographic, so one radius serves the whole disc and the clouds' opacity is set from it. The space view is in perspective: the cloud shader does the same sum for each fragment with
// `radiusPx = focal / distance` from the camera to that fragment, so the ground under the camera goes sharp while the far ground and the horizon keep their clouds.
import { TIERS } from "./tiers.ts";

/** The `cloud-fade` default: the texel width in device pixels at which the clouds are gone. 32 pixels of a 2048 texel is 0.6 km of ground a pixel, and the fade starts at 2.4 km a pixel; it keeps the clouds on the horizon seen from a low orbit. */
export const CLOUD_FADE_DEFAULT = 32;
/** The fade starts at this share of the width that ends it. */
export const CLOUD_FADE_START = 0.25;
/** The width of the finest cloud picture, in texels round the Earth. */
export const CLOUD_WIDTH = TIERS.clouds[TIERS.clouds.length - 1]!;

/**
 * A `cloud-fade` attribute: `off` or `0` is 0 (no fade), a number is the texel width in device pixels at which the clouds are gone (1 to 1000), anything else or leaving it out is the default.
 *
 * @param value - The attribute's text, or null.
 * @returns The width, or 0 for off.
 */
export function readCloudFade(value: string | null): number {
  if (value === null) return CLOUD_FADE_DEFAULT;
  if (value.trim() === "off") return 0;
  const width = Number(value);
  if (value.trim() === "" || !Number.isFinite(width) || width < 0) return CLOUD_FADE_DEFAULT;
  return width === 0 ? 0 : Math.min(1000, Math.max(1, width));
}

/**
 * How much of the clouds to show: 1 while a texel of the cloud picture is no wider than a quarter of `gone` device pixels, 0 from `gone` on, a smooth step between.
 *
 * @param radiusPx - The Earth's radius in device pixels at the nearest ground, as the map tiles read it.
 * @param gone - The texel width in device pixels at which the clouds are gone; 0 or less turns the fade off.
 * @param width - Texels round the Earth in the cloud picture.
 * @returns A strength from 0 to 1.
 */
export function cloudFade(radiusPx: number, gone: number, width: number = CLOUD_WIDTH): number {
  if (!(gone > 0)) return 1;
  const texel = (2 * Math.PI * radiusPx) / width;
  const from = gone * CLOUD_FADE_START;
  const t = Math.min(1, Math.max(0, (texel - from) / (gone - from)));
  return 1 - t * t * (3 - 2 * t);
}
