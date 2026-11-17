// The flat map's own geometry: an equirectangular (plate carree) map that wraps round the world, with the satellites' inertial places turned into longitude and latitude. Pure: numbers in, numbers out.

const RAD = Math.PI / 180;

/**
 * Longitude brought into -180 up to (not including) 180.
 *
 * @param lon - Degrees.
 * @returns The same direction, wrapped.
 *
 * @example
 * ```ts
 * import { wrapLongitude } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(wrapLongitude(190), wrapLongitude(-181), wrapLongitude(180));
 * ```
 */
export const wrapLongitude = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * How the flat map sits in its box: the box's size in pixels, the longitude and latitude under its middle, and the zoom (1 shows the whole world, up to 8).
 *
 * @example
 * ```ts
 * import type { FlatView } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const view: FlatView = { width: 800, height: 400, centerLon: 0, centerLat: 0, zoom: 1 };
 * console.log(view.zoom);
 * ```
 */
export interface FlatView {
  width: number;
  height: number;
  centerLon: number;
  centerLat: number;
  zoom: number;
}

/**
 * The furthest the map zooms in: 8 times the whole-world view.
 *
 * @example
 * ```ts
 * import { MAX_ZOOM } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(MAX_ZOOM);
 * ```
 */
export const MAX_ZOOM = 8;

/**
 * Pixels for one degree: the world fills the box, as wide as it is, or as tall as it is when the box is taller than 2 to 1, so a phone's box is filled and the map wraps round its sides.
 *
 * @param view - The view.
 * @returns Pixels a degree, of longitude or latitude (they are the same on this map).
 *
 * @example
 * ```ts
 * import { pixelsPerDegree } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(pixelsPerDegree({ width: 720, height: 360, centerLon: 0, centerLat: 0, zoom: 1 }), pixelsPerDegree({ width: 390, height: 520, centerLon: 0, centerLat: 0, zoom: 1 }).toFixed(2));
 * ```
 */
export const pixelsPerDegree = (view: FlatView): number => Math.max(view.width / 360, view.height / 180) * view.zoom;

/**
 * Where a longitude and latitude fall in the box, in pixels from its top left. The longitude is taken the short way round from the middle, so a place wraps cleanly at the map's edges.
 *
 * @param view - The view.
 * @param lon - Degrees east.
 * @param lat - Degrees north.
 * @returns `x` and `y` in pixels.
 *
 * @example
 * ```ts
 * import { projectFlat } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const view = { width: 720, height: 360, centerLon: 155, centerLat: 0, zoom: 1 };
 * console.log(projectFlat(view, 139.7, 35.7), projectFlat(view, -170, 0));
 * ```
 */
export function projectFlat(view: FlatView, lon: number, lat: number): { x: number; y: number } {
  const k = pixelsPerDegree(view);
  return { x: view.width / 2 + wrapLongitude(lon - view.centerLon) * k, y: view.height / 2 - (lat - view.centerLat) * k };
}

/**
 * The longitude and latitude at a point of the box: the opposite of `projectFlat`. The latitude is not limited to the map (a point above the top gives more than 90).
 *
 * @param view - The view.
 * @param x - Pixels from the left.
 * @param y - Pixels from the top.
 * @returns `lon` in -180 up to 180 and `lat`.
 *
 * @example
 * ```ts
 * import { unprojectFlat } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(unprojectFlat({ width: 720, height: 360, centerLon: 0, centerLat: 0, zoom: 1 }, 360, 180));
 * ```
 */
export function unprojectFlat(view: FlatView, x: number, y: number): { lon: number; lat: number } {
  const k = pixelsPerDegree(view);
  return { lon: wrapLongitude(view.centerLon + (x - view.width / 2) / k), lat: view.centerLat - (y - view.height / 2) / k };
}

/**
 * The view kept inside what the map can show: the zoom between 1 and 8, the longitude wrapped, and the middle's latitude so that the poles are never further in than the box's edges.
 *
 * @param view - The view asked for.
 * @returns The view to use.
 *
 * @example
 * ```ts
 * import { clampView } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(clampView({ width: 720, height: 360, centerLon: 200, centerLat: 40, zoom: 1 }));
 * ```
 */
export function clampView(view: FlatView): FlatView {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Number.isFinite(view.zoom) ? view.zoom : 1));
  const next = { ...view, zoom, centerLon: wrapLongitude(Number.isFinite(view.centerLon) ? view.centerLon : 0) };
  const limit = Math.max(0, 90 - view.height / 2 / pixelsPerDegree(next));
  next.centerLat = Math.min(limit, Math.max(-limit, Number.isFinite(view.centerLat) ? view.centerLat : 0));
  return next;
}

/**
 * Zoom by a factor about a point of the box, so the place under that point stays under it.
 *
 * @param view - The view.
 * @param factor - Above 1 zooms in.
 * @param x - Pixels from the left; the middle when left out.
 * @param y - Pixels from the top; the middle when left out.
 * @returns The new view, clamped.
 *
 * @example
 * ```ts
 * import { zoomAbout } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(zoomAbout({ width: 720, height: 360, centerLon: 0, centerLat: 0, zoom: 1 }, 2, 540, 90).zoom);
 * ```
 */
export function zoomAbout(view: FlatView, factor: number, x = view.width / 2, y = view.height / 2): FlatView {
  const at = unprojectFlat(view, x, y);
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom * factor));
  const k = pixelsPerDegree({ ...view, zoom });
  return clampView({ ...view, zoom, centerLon: at.lon - (x - view.width / 2) / k, centerLat: at.lat + (y - view.height / 2) / k });
}

/**
 * Where a satellite is on the Earth, from its place in the satellites' axes (`createSatellites`: Earth radii from the Earth's centre, x to the vernal equinox, y north, z the other way from TEME's y) and how far the Earth has turned
 * (`greenwichSidereal`). The latitude is geodetic (the Earth's flattening is applied to the geocentric one), the height is above 6,371 km.
 *
 * @param x - Earth radii.
 * @param y - Earth radii, north.
 * @param z - Earth radii.
 * @param siderealDeg - Greenwich mean sidereal time in degrees.
 * @returns Longitude in -180 up to 180, latitude and height in kilometres.
 *
 * @example
 * ```ts
 * import { groundPoint } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(groundPoint(1.1, 0, 0, 0));
 * ```
 */
export function groundPoint(x: number, y: number, z: number, siderealDeg: number): { lon: number; lat: number; altitudeKm: number } {
  const r = Math.hypot(x, y, z);
  const lon = wrapLongitude(Math.atan2(-z, x) / RAD - siderealDeg);
  const geocentric = Math.asin(r === 0 ? 0 : y / r);
  return { lon, lat: Math.atan(Math.tan(geocentric) / FLATTENED) / RAD, altitudeKm: (r - 1) * 6371 };
}

/**
 * (1 - f)^2 for the Earth's flattening f = 1/298.257: the factor between the tangent of the geocentric and of the geodetic latitude.
 *
 * @example
 * ```ts
 * import { FLATTENED } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(FLATTENED);
 * ```
 */
export const FLATTENED = 0.99330562;
