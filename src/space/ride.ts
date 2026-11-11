// Riding along: the camera sits at a moving body (a satellite, the Moon, a planet) and looks at the Earth. This file is the maths of where it looks, pure, so a page or a test can
// ask the same question the space view does.
import type { Vec3 } from "./ephemeris.ts";

const RAD = Math.PI / 180;

/** How far the ground moves in the picture for each pixel of a drag at the middle of it: the same pace as the line globe and the Earth from space (about one and a half). */
const GRAB = 1.5;
/** How far above the horizon a drag may tip the horizon look, in degrees. */
const MAX_ABOVE_HORIZON = 20;

/**
 * The field of view, in degrees, of a camera riding along at zoom 1 (the Earth's view from outside is 35).
 *
 * @example
 * ```ts
 * import { RIDE_FOV } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(RIDE_FOV);
 * ```
 */
export const RIDE_FOV = 60;

/**
 * Where a riding camera looks: `down` straight at the Earth's centre (the ground goes by under the camera), or `horizon` tipped forward along the way it is going until the horizon
 * is a little above the middle of the view. A drag looks round from there on the spot with the horizon kept level: sideways turns about the local vertical, all the way round, and up and down only tips the view, from straight down to 20 degrees above the horizon.
 *
 * @example
 * ```ts
 * import type { RideLook } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const looks: RideLook[] = ["down", "horizon"];
 * console.log(looks.join(" or "));
 * ```
 */
export type RideLook = "down" | "horizon";

/**
 * What `ridePose` is asked: the camera's place and its way of travel (any length), where it looks, and the shared controls' yaw, tilt and zoom.
 *
 * @example
 * ```ts
 * import type { RideInput } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const input: RideInput = { position: [1.066, 0, 0], velocity: [0, 0, -7.66], look: "down", yaw: 0, tilt: 0, zoom: 1 };
 * console.log(input.look);
 * ```
 */
export interface RideInput {
  /** The camera's place in Earth radii from the Earth's centre, in the scene's axes. */
  position: Vec3;
  /** Its direction of travel, in any unit: only the direction is used. */
  velocity: Vec3;
  look: RideLook;
  /** The shared controls' yaw in degrees (a drag across the view is 180): turns the camera to look along its picture's left, so the ground moves right. 0 has the way it is going at the top of the picture. */
  yaw: number;
  /** The shared controls' tilt in degrees (a drag down the view is 60): tips the camera to look towards the bottom of its picture, so the ground moves up. */
  tilt: number;
  /** 1 is the natural view; more narrows the field of view. */
  zoom: number;
}

/**
 * The camera `ridePose` works out: where it is, which way it looks, which way is up in the picture, its field of view in degrees, and how big the Earth looks from there (its angular radius in degrees).
 *
 * @example
 * ```ts
 * import type { RidePose } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const describe = (pose: RidePose): string => `looking ${pose.forward.map((n) => n.toFixed(2)).join(",")} with a ${pose.fov} degree view`;
 * console.log(typeof describe);
 * ```
 */
export interface RidePose {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  fov: number;
  earthRadiusDegrees: number;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n === 0 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
};

/**
 * The camera of a body-borne view: at `position`, looking at the Earth, with the way the body is going at the top of the picture. `look: "horizon"` tips it forward until the horizon is a little above the middle. A drag looks about from there on the spot:
 * `yaw` turns the camera to its left and `tilt` tips it towards the bottom of its picture, so the ground follows the pointer (right for a drag right, up for a drag up); the angle for each pixel of the drag is the field of view's, so the pace is the same at any zoom.
 * In the `horizon` look a sideways drag turns about the local vertical (the line from the Earth's centre through the camera), all the way round, and up and down only tips the view, from straight down to 20 degrees above the horizon, so the horizon stays level and
 * nothing rolls; in the `down` look the camera turns about its own up. `zoom` narrows the field of view.
 *
 * @param input - The camera's place, its way of travel, the look, and the shared controls' yaw, tilt and zoom.
 * @returns The camera's place, forward and up directions (unit vectors), its field of view, and the Earth's angular radius from there.
 *
 * @example
 * ```ts
 * import { ridePose } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const pose = ridePose({ position: [1.066, 0, 0], velocity: [0, 0, -7.66], look: "down", yaw: 0, tilt: 0, zoom: 1 });
 * console.log(pose.forward.map((n) => n.toFixed(2)).join(","), pose.earthRadiusDegrees.toFixed(0));
 * ```
 */
export function ridePose(input: RideInput): RidePose {
  const distance = Math.max(1e-9, norm(input.position));
  const nadir = scale(input.position, -1 / distance);
  let ahead: Vec3 = add(input.velocity, scale(nadir, -dot(input.velocity, nadir)));
  if (norm(ahead) < 1e-12 * Math.max(1, norm(input.velocity))) {
    // no way of travel to go by (or it is straight at the Earth): north, or east where north is straight down
    const north: Vec3 = [0, 1, 0];
    ahead = add(north, scale(nadir, -dot(north, nadir)));
    if (norm(ahead) < 1e-9) ahead = cross([1, 0, 0], nadir);
  }
  ahead = unit(ahead);
  const earthRadiusDegrees = distance <= 1 ? 90 : Math.asin(1 / distance) / RAD;
  const base = input.look === "horizon" ? Math.max(0, earthRadiusDegrees - 12) * RAD : 0;
  const fov = Math.min(100, Math.max(5, RIDE_FOV / Math.max(0.05, input.zoom)));
  const turn = input.yaw * (GRAB * fov / 180) * RAD;
  const lift = input.tilt * (GRAB * fov / 60) * RAD;
  if (input.look === "horizon") {
    // looking round on the spot: a drag sideways turns the camera about the local vertical, all the way round, and a drag up or down tips it up or down in the vertical plane it faces, from straight down to a little above the horizon,
    // so the horizon stays level and nothing rolls
    const zenith = scale(nadir, -1);
    const heading = add(scale(ahead, Math.cos(turn)), scale(cross(zenith, ahead), Math.sin(turn)));
    const elevation = Math.max(-Math.PI / 2, Math.min(MAX_ABOVE_HORIZON * RAD, base - Math.PI / 2 - lift));
    const forward = add(scale(heading, Math.cos(elevation)), scale(zenith, Math.sin(elevation)));
    const up = add(scale(heading, -Math.sin(elevation)), scale(zenith, Math.cos(elevation)));
    return { position: [input.position[0], input.position[1], input.position[2]], forward, up, fov, earthRadiusDegrees };
  }
  const forward0 = add(scale(nadir, Math.cos(base)), scale(ahead, Math.sin(base)));
  const up0 = add(scale(ahead, Math.cos(base)), scale(nadir, -Math.sin(base)));
  const turned = add(scale(forward0, Math.cos(turn)), scale(cross(up0, forward0), Math.sin(turn)));
  const forward = add(scale(turned, Math.cos(lift)), scale(up0, -Math.sin(lift)));
  const up = add(scale(up0, Math.cos(lift)), scale(turned, Math.sin(lift)));
  return { position: [input.position[0], input.position[1], input.position[2]], forward, up, fov, earthRadiusDegrees };
}
