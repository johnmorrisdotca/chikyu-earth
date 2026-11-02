// Map the shared view controls' camera to d3-geo's orthographic projection. Pure and tested.
import type { GeoPoint, GlobeView, Rotation } from "./types.ts";

/**
 * The view when it opens: the home centre, upright, at 1x with no pan.
 *
 * @example
 * ```ts
 * import { HOME_VIEW } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(HOME_VIEW);
 * ```
 */
export const HOME_VIEW: GlobeView = Object.freeze({ yaw: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 });

/**
 * What d3-geo's orthographic projection is given for a view: its rotation, scale and translation.
 *
 * @example
 * ```ts
 * import { projectionView, type ProjectionView } from "@johnmorrisdotca/chikyu-earth";
 *
 * const view: ProjectionView = projectionView({ lon: 0, lat: 0 }, 400);
 * console.log(view.scale, view.translate);
 * ```
 */
export interface ProjectionView {
  rotation: Rotation;
  scale: number;
  translate: [number, number];
}

/**
 * The radius of an unzoomed globe in a square of `size` pixels.
 *
 * @param size - The width and height of the square, in pixels.
 * @returns The radius in pixels, one less than half the size so the rim is not cut off.
 *
 * @example
 * ```ts
 * import { globeBaseScale } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(globeBaseScale(420));
 * ```
 */
export const globeBaseScale = (size: number): number => size / 2 - 1;

/**
 * Where the view is centred on the globe: the home centre, turned by yaw (west) and tipped by tilt (north), held to the poles.
 *
 * @param centre - The home centre.
 * @param view - The turn, tip, zoom and pan from the view controls.
 * @returns The place now in the middle of the disc.
 *
 * @example
 * ```ts
 * import { lookAt } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(lookAt({ lon: 10, lat: 80 }, { yaw: 25, tilt: 30, zoom: 1, panX: 0, panY: 0 }));
 * ```
 */
export const lookAt = (centre: GeoPoint, view: GlobeView): GeoPoint => ({
  lon: centre.lon - view.yaw,
  lat: Math.max(-90, Math.min(90, centre.lat + view.tilt)),
});

/**
 * What the projection is given for a view: yaw turns longitude, tilt tips latitude, zoom scales and pan moves the disc in CSS pixels.
 *
 * @param centre - The home centre.
 * @param size - The width and height of the square the globe is drawn in, in pixels.
 * @param view - The turn, tip, zoom and pan; the home view when left out.
 * @returns The rotation, scale and translation for d3-geo's orthographic projection.
 *
 * @example
 * ```ts
 * import { projectionView } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(projectionView({ lon: 139.7, lat: 35.7 }, 420, { yaw: 10, tilt: 5, zoom: 2, panX: 0, panY: 0 }));
 * ```
 */
export function projectionView(centre: GeoPoint, size: number, view: GlobeView = HOME_VIEW): ProjectionView {
  return {
    rotation: [-centre.lon + view.yaw, -centre.lat - view.tilt],
    scale: globeBaseScale(size) * view.zoom,
    translate: [size / 2 + view.panX, size / 2 + view.panY],
  };
}
