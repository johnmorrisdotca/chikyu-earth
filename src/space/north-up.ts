// North at the top of the picture in the view above a satellite, and where north is on a ride's picture. Pure, so a page or a test can ask the same questions the space view does.
import type { Vec3 } from "./ephemeris.ts";
import { satelliteAxes } from "./satellite-model.ts";

const RAD = Math.PI / 180;

/**
 * Which way is up in the picture of a ride above a satellite: `travel` (the default) puts the way the satellite is going at the top, so the picture turns with its heading; `north` puts north at the top, so the satellite is seen to move in its real direction over the ground (south-east, say).
 *
 * @example
 * ```ts
 * import type { RideUp } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const ups: RideUp[] = ["travel", "north"];
 * console.log(ups.join(" or "));
 * ```
 */
export type RideUp = "travel" | "north";

/**
 * How close to a pole, in degrees of arc, a satellite must be for north-up to give way to travel-up: inside this, north's direction on the ground swings round faster than a picture can follow (and at the pole itself it has none), so the way it is going is at the top.
 *
 * @example
 * ```ts
 * import { NORTH_UP_POLE_DEG } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(NORTH_UP_POLE_DEG);
 * ```
 */
export const NORTH_UP_POLE_DEG = 3;

/**
 * How many more degrees from a pole north-up takes to come back in: travel-up holds inside {@link NORTH_UP_POLE_DEG}, north-up holds beyond that many degrees more, and between them the two are mixed by a smooth step so the picture turns, never jumps.
 *
 * @example
 * ```ts
 * import { NORTH_UP_BLEND_DEG } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(NORTH_UP_BLEND_DEG);
 * ```
 */
export const NORTH_UP_BLEND_DEG = 3;

/**
 * Which way north is at a place, as a unit vector in the scene's axes (y is north): the way along the ground that goes towards the pole. `null` at the poles themselves and at the centre, where it is not defined.
 *
 * @param position - Where the place is, from the Earth's centre, in any unit.
 * @returns A unit vector level with the ground there, or `null`.
 *
 * @example
 * ```ts
 * import { localNorth } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(localNorth([1.066, 0, 0]));
 * ```
 */
export function localNorth(position: Vec3): Vec3 | null {
  const length = Math.hypot(position[0], position[1], position[2]);
  if (!(length > 0)) return null;
  const up: Vec3 = [position[0] / length, position[1] / length, position[2] / length];
  const level: Vec3 = [-up[1] * up[0], 1 - up[1] * up[1], -up[1] * up[2]];
  const size = Math.hypot(level[0], level[1], level[2]);
  return size > 1e-9 ? [level[0] / size, level[1] / size, level[2] / size] : null;
}

/**
 * The turn that puts north at the top of the picture of the view above a satellite (`aboveAxes` turns the picture by its `yaw`, from the way the satellite is going at the top), and how much of it holds. Add `yaw * weight` to the picture's own turn. The weight is 1 away from the poles,
 * 0 within {@link NORTH_UP_POLE_DEG} degrees of one (the way it is going stays at the top), and a smooth step between, over {@link NORTH_UP_BLEND_DEG} degrees. A satellite that is not moving has no way to turn from, and gives a weight of 0.
 *
 * @param position - Where the satellite is, from the Earth's centre.
 * @param velocity - The way it is going.
 * @returns The yaw in radians (positive turns the top towards the left of the way it goes) and its weight, 0 to 1.
 *
 * @example
 * ```ts
 * import { northUpYaw } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * // over the equator going east: north is on the left, a quarter turn
 * const turn = northUpYaw([1.066, 0, 0], [0, 0, -7.66]);
 * console.log((turn.yaw / (Math.PI / 180)).toFixed(0), turn.weight);
 * ```
 */
export function northUpYaw(position: Vec3, velocity: Vec3): { yaw: number; weight: number } {
  const axes = satelliteAxes(position, velocity);
  const north = localNorth(position);
  if (!axes || !north) return { yaw: 0, weight: 0 };
  const yaw = Math.atan2(north[0] * axes.y[0] + north[1] * axes.y[1] + north[2] * axes.y[2], north[0] * axes.x[0] + north[1] * axes.x[1] + north[2] * axes.x[2]);
  // the angle from the nearer pole: the up vector's component along y is the cosine of the colatitude
  const polar = Math.acos(Math.min(1, Math.abs(axes.z[1]))) / RAD;
  const k = Math.min(1, Math.max(0, (polar - NORTH_UP_POLE_DEG) / NORTH_UP_BLEND_DEG));
  return { yaw, weight: k * k * (3 - 2 * k) };
}

/**
 * Where north points in a picture: the angle, clockwise from the top of the picture, of a direction as the camera sees it (the part of it in the picture's plane). 0 means north is at the top, 90 to the right. `null` when the direction points along the camera's line of sight (or away), where it has no direction in the picture.
 *
 * @param quaternion - The camera's turn, `[x, y, z, w]` as three.js has it (the camera looks along its own -z, with +y up and +x to the right).
 * @param direction - The direction in the scene's axes, such as `localNorth`.
 * @returns Degrees clockwise from the top of the picture, 0 up to 360, or `null`.
 *
 * @example
 * ```ts
 * import { screenAngle } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * // a camera that is not turned: +y is at the top, +x to the right
 * console.log(screenAngle([0, 0, 0, 1], [0, 1, 0]), screenAngle([0, 0, 0, 1], [1, 0, 0]));
 * ```
 */
export function screenAngle(quaternion: readonly [number, number, number, number], direction: Vec3): number | null {
  // the direction in the camera's own axes: turned by the inverse of the camera's turn
  const [qx, qy, qz, w] = quaternion;
  const px = -qx;
  const py = -qy;
  const pz = -qz;
  const tx = 2 * (py * direction[2] - pz * direction[1]);
  const ty = 2 * (pz * direction[0] - px * direction[2]);
  const tz = 2 * (px * direction[1] - py * direction[0]);
  const x = direction[0] + w * tx + (py * tz - pz * ty);
  const y = direction[1] + w * ty + (pz * tx - px * tz);
  if (Math.hypot(x, y) < 1e-6) return null;
  return (((Math.atan2(x, y) / RAD) % 360) + 360) % 360;
}
