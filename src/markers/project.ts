// Where a point on the Earth lands on a screen, for the orthographic view both looks share. Pure.

/** The view: the point of the Earth at the middle of the disc, the disc's radius and its centre, in CSS pixels. */
export interface Pose {
  lon: number;
  lat: number;
  radius: number;
  cx: number;
  cy: number;
}

const RAD = Math.PI / 180;

/**
 * Project a longitude and latitude (degrees) to the screen. `z` is the cosine of the angle from the middle of the disc: above 0 the point faces
 * the viewer, below it is on the far side. North is up.
 */
export function project(lon: number, lat: number, pose: Pose): { x: number; y: number; z: number } {
  const phi = lat * RAD;
  const phi0 = pose.lat * RAD;
  const delta = (lon - pose.lon) * RAD;
  const cosPhi = Math.cos(phi);
  const z = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(delta);
  return {
    x: pose.cx + pose.radius * cosPhi * Math.sin(delta),
    y: pose.cy - pose.radius * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(delta)),
    z,
  };
}

/** Project many points into flat arrays (reused between calls); `z` is left as it is for a point's facing test. */
export function projectAll(lons: ArrayLike<number>, lats: ArrayLike<number>, count: number, pose: Pose, xs: Float32Array, ys: Float32Array, zs: Float32Array): void {
  const phi0 = pose.lat * RAD;
  const sin0 = Math.sin(phi0);
  const cos0 = Math.cos(phi0);
  for (let i = 0; i < count; i += 1) {
    const phi = lats[i]! * RAD;
    const delta = (lons[i]! - pose.lon) * RAD;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const cosDelta = Math.cos(delta);
    zs[i] = sin0 * sinPhi + cos0 * cosPhi * cosDelta;
    xs[i] = pose.cx + pose.radius * cosPhi * Math.sin(delta);
    ys[i] = pose.cy - pose.radius * (cos0 * sinPhi - sin0 * cosPhi * cosDelta);
  }
}

/** The pixel ratio for an overlay canvas: the device's, to 2, held to 4096 a side and 6 million pixels (the same budget as the 3D canvas). */
export function canvasRatio(width: number, height: number, deviceRatio: number, maxSide = 4096, maxPixels = 6_000_000): number {
  let ratio = Math.min(Math.max(deviceRatio, 1), 2);
  ratio = Math.min(ratio, maxSide / Math.max(width, 1), maxSide / Math.max(height, 1));
  const pixels = width * height * ratio * ratio;
  if (pixels > maxPixels) ratio *= Math.sqrt(maxPixels / pixels);
  return Math.max(0.1, ratio);
}
