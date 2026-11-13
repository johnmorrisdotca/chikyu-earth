// A satellite drawn as a 3D model: the page supplies the model (the package ships none), the space view places it where the followed satellite is, points it the way it really flies, sizes it to read and lights it with the real Sun.
// This file is the maths of that, pure, so a page or a test can ask the same questions the view does.
import type { Vec3 } from "./ephemeris.ts";

/**
 * How big a followed satellite's model is drawn: its radius is this share of the height of the view (0.17), so it reads at any distance the camera keeps.
 *
 * @example
 * ```ts
 * import { MODEL_RADIUS_SHARE } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(MODEL_RADIUS_SHARE);
 * ```
 */
export const MODEL_RADIUS_SHARE = 0.17;

/**
 * The axes of a satellite flying: `x` along the way it goes (its velocity, taken level with the ground below it), `z` straight away from the Earth's centre, and `y` to complete them (`z` cross `x`, so it points to the left of the way it goes).
 * The family's convention for a model: its nose or long axis along +x, its top (the side that faces space) along +z.
 *
 * @param position - Where the satellite is, from the Earth's centre, in any unit.
 * @param velocity - The way it is going, in any unit.
 * @returns Three unit vectors, `x`, `y` and `z`, in the scene's axes; `null` when the position is the centre or the satellite does not move.
 *
 * @example
 * ```ts
 * import { satelliteAxes } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const axes = satelliteAxes([1.066, 0, 0], [0, 0, -7.66]);
 * console.log(axes?.x, axes?.z);
 * ```
 */
export function satelliteAxes(position: Vec3, velocity: Vec3): { x: Vec3; y: Vec3; z: Vec3 } | null {
  const length = Math.hypot(position[0], position[1], position[2]);
  if (!(length > 0)) return null;
  const z: Vec3 = [position[0] / length, position[1] / length, position[2] / length];
  // the velocity without the part that points up or down
  const along = velocity[0] * z[0] + velocity[1] * z[1] + velocity[2] * z[2];
  const level: Vec3 = [velocity[0] - along * z[0], velocity[1] - along * z[1], velocity[2] - along * z[2]];
  const speed = Math.hypot(level[0], level[1], level[2]);
  if (!(speed > 1e-12)) return null;
  const x: Vec3 = [level[0] / speed, level[1] / speed, level[2] / speed];
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return { x, y, z };
}

/**
 * The camera of the view above a satellite: where it stands from the satellite (a unit vector, to be multiplied by the height) and the way its picture's top points. With no turn and no tip the camera is straight above the satellite, looking straight down at it, the way the satellite is going at the top of
 * the picture. `yaw` turns the picture about the satellite (the top points the other way round the satellite); `tilt` tips the camera back (positive) or ahead of the satellite (negative), so it looks down at it from behind or in front.
 *
 * @param position - The satellite's place from the Earth's centre.
 * @param velocity - Its velocity.
 * @param yaw - The turn of the picture about the satellite, in radians.
 * @param tilt - How far the camera is tipped back from straight above, in radians.
 * @returns The unit offset of the camera from the satellite, and the unit vector at the top of its picture.
 *
 * @example
 * ```ts
 * import { aboveAxes } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const view = aboveAxes([1.07, 0, 0], [0, 0, 1], 0, 0);
 * console.log(view.offset, view.up);
 * ```
 */
export function aboveAxes(position: Vec3, velocity: Vec3, yaw: number, tilt: number): { offset: Vec3; up: Vec3 } {
  let axes = satelliteAxes(position, velocity);
  if (!axes) {
    // no way it is going (or no place): any level direction will do
    const length = Math.hypot(position[0], position[1], position[2]);
    const z: Vec3 = length > 0 ? [position[0] / length, position[1] / length, position[2] / length] : [1, 0, 0];
    const from: Vec3 = Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const cross: Vec3 = [from[1] * z[2] - from[2] * z[1], from[2] * z[0] - from[0] * z[2], from[0] * z[1] - from[1] * z[0]];
    const size = Math.hypot(cross[0], cross[1], cross[2]) || 1;
    const x: Vec3 = [cross[0] / size, cross[1] / size, cross[2] / size];
    axes = { x, y: [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]], z };
  }
  const { x, y, z } = axes;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const top: Vec3 = [cy * x[0] + sy * y[0], cy * x[1] + sy * y[1], cy * x[2] + sy * y[2]];
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  return { offset: [ct * z[0] - st * top[0], ct * z[1] - st * top[1], ct * z[2] - st * top[2]], up: top };
}

/**
 * The 4 by 4 matrix, row by row (what three.js's `Matrix4.set` takes), that puts a model of radius 1 at a place, turned to the satellite's axes and scaled: its columns are the axes times the scale, then the place.
 *
 * @param place - Where the model's middle goes, in the scene's units.
 * @param axes - The satellite's axes (`satelliteAxes`).
 * @param scale - The model's radius in the scene's units.
 * @returns Sixteen numbers, row by row.
 *
 * @example
 * ```ts
 * import { modelMatrix, satelliteAxes } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const axes = satelliteAxes([1.066, 0, 0], [0, 0, -7.66])!;
 * console.log(modelMatrix([1.066, 0, 0], axes, 0.01));
 * ```
 */
export function modelMatrix(place: Vec3, axes: { x: Vec3; y: Vec3; z: Vec3 }, scale: number): number[] {
  const { x, y, z } = axes;
  return [x[0] * scale, y[0] * scale, z[0] * scale, place[0], x[1] * scale, y[1] * scale, z[1] * scale, place[1], x[2] * scale, y[2] * scale, z[2] * scale, place[2], 0, 0, 0, 1];
}

/**
 * The radius to draw a model at so that it is `share` of the height of the view across its radius, seen from `away` with the half field of view `half` (the tangent of half the field, as the view uses it): the model grows with the distance, so it reads
 * at any distance the camera keeps. Never under `real`, its true size, so a camera that comes in close still sees it as big as it is.
 *
 * @param away - The camera's distance from the satellite, in the scene's units.
 * @param half - The tangent of half the field of view.
 * @param share - The share of the view's height that the radius should take (`MODEL_RADIUS_SHARE`).
 * @param real - The model's true radius, in the same units.
 * @returns The radius to draw it at.
 *
 * @example
 * ```ts
 * import { MODEL_RADIUS_SHARE, modelRadius } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(modelRadius(0.5, Math.tan((35 / 2) * (Math.PI / 180)), MODEL_RADIUS_SHARE, 1e-8));
 * ```
 */
export function modelRadius(away: number, half: number, share: number, real: number): number {
  return Math.max(real, away * half * share * 2);
}

/** The lowest height of a ride above a satellite, in kilometres: the model keeps its full size from here down (MODULES-1306). */
export const ABOVE_MODEL_KM = 150;
/** The share of the view's height the model's radius takes at the lowest height of a ride above a satellite (0.17): the size every page has seen since 0.46.1, and the size `ride-model-size="fixed"` keeps at every height. */
export const ABOVE_MODEL_SHARE = 0.17;
/** The height, in kilometres, from which the model is let shrink to nothing, and the height by which it has: between them the satellite is handed over to its ordinary mark. */
export const MODEL_FADE_FROM_KM = 1000;
export const MODEL_FADE_TO_KM = 2000;
/** The model's drawn radius, in CSS pixels, below which the satellite's ring and name come back (the ring is about this big, so the two are not drawn over each other). */
export const MODEL_HANDOVER_PX = 10;

/**
 * The share of the view's height that a model's radius takes when the camera is `distanceKm` above the satellite (a ride above it). A satellite is a few metres across, so the model is drawn larger than it is, but a
 * model that stays a share of the picture at any height becomes a block thousands of kilometres across from far up. So the model keeps a fixed size in the world, about 16 km in radius, which is the share `ABOVE_MODEL_SHARE`
 * at `ABOVE_MODEL_KM`: it is never larger than that, falls as one over the height above it, and from `MODEL_FADE_FROM_KM` is let down smoothly (a smooth step) to nothing at `MODEL_FADE_TO_KM`, where the satellite is its ordinary mark.
 * Pure, so a test can ask it at any height.
 *
 * @param distanceKm - The camera's distance from the satellite, in kilometres.
 * @returns The share, from 0 to 0.17.
 *
 * @example
 * ```ts
 * import { aboveModelShare } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(aboveModelShare(150), aboveModelShare(1000) < aboveModelShare(150), aboveModelShare(6000));
 * ```
 */
export function aboveModelShare(distanceKm: number): number {
  if (!(distanceKm > 0)) return ABOVE_MODEL_SHARE;
  const base = ABOVE_MODEL_SHARE * Math.min(1, ABOVE_MODEL_KM / distanceKm);
  const t = Math.min(1, Math.max(0, (distanceKm - MODEL_FADE_FROM_KM) / (MODEL_FADE_TO_KM - MODEL_FADE_FROM_KM)));
  return base * (1 - t * t * (3 - 2 * t));
}
