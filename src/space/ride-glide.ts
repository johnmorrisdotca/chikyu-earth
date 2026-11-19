// The glide of a ride from one satellite to another: along the great circle round the Earth's centre, never through the Earth, with the look carried along it. Pure, so a page or a test can ask where the camera
// is at any point of the glide.
import type { Vec3 } from "./ephemeris.ts";

/**
 * A rotation as a quaternion, `[x, y, z, w]` (three.js's order).
 *
 * @example
 * ```ts
 * import type { Quat } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const still: Quat = [0, 0, 0, 1];
 * console.log(still[3]);
 * ```
 */
export type Quat = [number, number, number, number];

/**
 * A camera's place and orientation: `p` in Earth radii from the Earth's centre, `q` the rotation from the camera's own axes (it looks down its -z, its up is +y) to the scene's.
 *
 * @example
 * ```ts
 * import type { GlidePose } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const pose: GlidePose = { p: [1.07, 0, 0], q: [0, 0, 0, 1] };
 * console.log(pose.p[0]);
 * ```
 */
export interface GlidePose {
  p: Vec3;
  q: Quat;
}

/**
 * The least height above the ground, in km, that the glide from one satellite's ride to another's keeps between its two ends (`satelliteGlide`). Ends lower than this (a satellite coming down) are left
 * where they are and the glide rises over the floor between them.
 *
 * @example
 * ```ts
 * import { GLIDE_FLOOR_KM } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(`${GLIDE_FLOOR_KM} km`);
 * ```
 */
export const GLIDE_FLOOR_KM = 100;

const EARTH_KM = 6371;
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** `a` then `b`: the rotation `b` followed by `a` (`a * b`). */
function mul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** The rotation by `angle` radians about the unit `axis`. */
const about = (axis: Vec3, angle: number): Quat => { const s = Math.sin(angle / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]; };

/** The shorter way from `a` to `b`, a share `t` along it, normalised. */
function slerp(a: Quat, b: Quat, t: number): Quat {
  let c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = c < 0 ? -1 : 1;
  c *= s;
  let ka = 1 - t, kb = t * s;
  if (c < 0.9995) {
    const half = Math.acos(Math.min(1, c)), sin = Math.sin(half);
    ka = Math.sin((1 - t) * half) / sin;
    kb = (Math.sin(t * half) / sin) * s;
  }
  const out: Quat = [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb, a[3] * ka + b[3] * kb];
  const n = Math.hypot(...out) || 1;
  return [out[0] / n, out[1] / n, out[2] / n, out[3] / n];
}

/** The great circle from the direction of `a` to that of `b` (both from the Earth's centre): the axis it turns about and the angle, radians. Opposite directions turn about a line square to `a`. */
function greatCircle(a: Vec3, b: Vec3): { axis: Vec3; angle: number } {
  const c = cross(a, b), sin = norm(c), cos = dot(a, b);
  const angle = Math.atan2(sin, cos);
  if (sin > 1e-9 * norm(a) * norm(b)) return { axis: [c[0] / sin, c[1] / sin, c[2] / sin], angle };
  if (cos >= 0) return { axis: [0, 0, 1], angle: 0 };
  const side = Math.abs(a[1]) < 0.9 * norm(a) ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]);
  const n = norm(side);
  return { axis: [side[0] / n, side[1] / n, side[2] / n], angle };
}

/**
 * Where the camera is, a share `ease` (0 to 1) along the glide from one satellite's ride to another's. It goes along the great circle round the Earth's centre from the first place to the second, its distance from
 * the centre going evenly from the one to the other, so it never passes through the Earth or dips under the two heights; between ends lower than `floorKm` above the ground it rises over that floor in the middle.
 * The look is carried along the circle (turned with it, as the local vertical turns) and goes over the way from the first look to the second in the same frame, so a facing along the ground stays level, a facing
 * down stays down, nothing rolls over, and the view turns once towards its end. The glide back is the same glide the other way: `satelliteGlide(to, from, 1 - ease)` is the same pose. A short hop is all but the
 * straight glide: the circle is about 10 m from the straight line half way along a hop of 25 km.
 *
 * @param from - The camera where the glide began.
 * @param to - The camera of the ride it goes to (its pose this frame: the satellite may move).
 * @param ease - How far along, 0 at the start and 1 at the end (eased by the caller).
 * @param floorKm - The least height above the ground between the ends, km (`GLIDE_FLOOR_KM`).
 * @returns The camera's place and orientation there.
 *
 * @example
 * ```ts
 * import { satelliteGlide } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * // from over one side of the Earth to over the other: half way, the camera is over the Earth's edge, not inside it
 * const mid = satelliteGlide({ p: [1.07, 0, 0], q: [0, 0, 0, 1] }, { p: [-1.07, 0, 0.01], q: [0, 0, 0, 1] }, 0.5);
 * console.log(Math.hypot(...mid.p).toFixed(2));
 * ```
 */
export function satelliteGlide(from: GlidePose, to: GlidePose, ease: number, floorKm: number = GLIDE_FLOOR_KM): GlidePose {
  const r0 = norm(from.p), r1 = norm(to.p);
  if (r0 < 1e-9 || r1 < 1e-9) return { p: [...to.p], q: [...to.q] };
  const { axis, angle } = greatCircle(from.p, to.p);
  const turn = about(axis, angle * ease);
  const along: Vec3 = [from.p[0] / r0, from.p[1] / r0, from.p[2] / r0];
  const c = Math.cos(angle * ease), s = Math.sin(angle * ease), k = dot(axis, along) * (1 - c), side = cross(axis, along);
  const u: Vec3 = [along[0] * c + side[0] * s + axis[0] * k, along[1] * c + side[1] * s + axis[1] * k, along[2] * c + side[2] * s + axis[2] * k];
  const floor = 1 + Math.max(0, floorKm) / EARTH_KM;
  const lift = Math.max(0, floor - Math.min(r0, r1)) * Math.sin(Math.PI * Math.min(1, Math.max(0, ease)));
  const r = r0 + (r1 - r0) * ease + lift;
  // the second look, as it would be at the first place (turned back along the circle), then the way between the two looks, turned on to where the camera is
  const back: Quat = [-axis[0] * Math.sin(angle / 2), -axis[1] * Math.sin(angle / 2), -axis[2] * Math.sin(angle / 2), Math.cos(angle / 2)];
  const q = mul(turn, slerp(from.q, mul(back, to.q), ease));
  return { p: [u[0] * r, u[1] * r, u[2] * r], q };
}

/**
 * How far, in km, the camera goes in the glide from one satellite's ride to another's (`satelliteGlide`): along the great circle, with the change of height. For a glide whose length follows the distance (`rideGlideMs`).
 *
 * @param from - Where the glide begins, Earth radii from the Earth's centre.
 * @param to - Where it ends.
 * @returns The length, km.
 *
 * @example
 * ```ts
 * import { satelliteGlideKm } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(Math.round(satelliteGlideKm([1.07, 0, 0], [0, 1.07, 0])));
 * ```
 */
export function satelliteGlideKm(from: Vec3, to: Vec3): number {
  const r0 = norm(from), r1 = norm(to);
  const { angle } = greatCircle(from, to);
  return Math.hypot(angle * (r0 + r1) / 2, r1 - r0) * EARTH_KM;
}
