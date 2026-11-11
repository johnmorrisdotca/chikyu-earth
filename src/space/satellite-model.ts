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
