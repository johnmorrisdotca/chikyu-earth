// Map the shared view controls' camera to d3-geo's orthographic projection. Pure and tested.
import type { GeoPoint, GlobeView, Rotation } from "./types.ts";

/** The view when it opens: the home centre, upright, at 1x with no pan. */
export const HOME_VIEW: GlobeView = Object.freeze({ yaw: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 });

export interface ProjectionView {
  rotation: Rotation;
  scale: number;
  translate: [number, number];
}

/** The radius of an unzoomed globe in a square of `size` pixels. */
export const globeBaseScale = (size: number): number => size / 2 - 1;

/** yaw turns longitude, tilt tips latitude, zoom scales and pan moves the disc in CSS pixels. */
export function projectionView(centre: GeoPoint, size: number, view: GlobeView = HOME_VIEW): ProjectionView {
  return {
    rotation: [-centre.lon + view.yaw, -centre.lat - view.tilt],
    scale: globeBaseScale(size) * view.zoom,
    translate: [size / 2 + view.panX, size / 2 + view.panY],
  };
}
