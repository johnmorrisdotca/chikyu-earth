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
 * A way a riding camera can face, as from the windows of a plane: `ahead` along the way it goes, `behind`, `left` and `right` across the way it goes (as seen facing ahead), each with the horizon a little above the middle of the picture, or
 * `down` straight at the Earth and `up` straight away from it. A facing is a place to look round from in the `horizon` look: the controls' yaw and tilt turn and tip the camera from it.
 *
 * @example
 * ```ts
 * import { RIDE_FACES, type RideFace } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const face: RideFace = "ahead";
 * console.log(RIDE_FACES.includes(face));
 * ```
 */
export type RideFace = "ahead" | "behind" | "left" | "right" | "down" | "up";

/**
 * Every way a riding camera can face, in the order of a row of buttons.
 *
 * @example
 * ```ts
 * import { RIDE_FACES } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(RIDE_FACES.join(", "));
 * ```
 */
export const RIDE_FACES: readonly RideFace[] = ["ahead", "behind", "left", "right", "down", "up"];

/** How far each facing turns from the way it goes, in degrees, to the left. */
const FACE_TURN: Record<RideFace, number> = { ahead: 0, behind: 180, left: 90, right: -90, down: 0, up: 0 };

/**
 * The field of view, in degrees, of a riding camera at a zoom: the natural 60 divided by the zoom, held between 5 and 100.
 *
 * @param zoom - The shared controls' zoom.
 * @returns The field of view in degrees.
 *
 * @example
 * ```ts
 * import { rideFov } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(rideFov(1), rideFov(6), rideFov(100));
 * ```
 */
export function rideFov(zoom: number): number {
  return Math.min(100, Math.max(5, RIDE_FOV / Math.max(0.05, zoom)));
}

/**
 * How many degrees the camera turns for a change of the controls' yaw at a zoom. The controls wrap their yaw into -180 to 180, so a page adds up the turns itself, change by change (`wrapYaw` of the change, scaled by this at the zoom of the moment), and hands
 * the total to `ridePose` as `turn`: a drag the whole way round is then a turn the whole way round, and the pace follows the field of view at any zoom.
 *
 * @param change - The change of yaw, in degrees, between two views of the controls (already brought into -180 to 180).
 * @param zoom - The shared controls' zoom at the moment.
 * @returns The turn, in degrees.
 *
 * @example
 * ```ts
 * import { rideTurnDegrees } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(rideTurnDegrees(180, 1), rideTurnDegrees(180, 6));
 * ```
 */
export function rideTurnDegrees(change: number, zoom: number): number {
  return change * (GRAB * rideFov(zoom)) / 180;
}

/**
 * The range of the controls' tilt that does something in the `horizon` look: from straight down to a little above the horizon. A tilt beyond it moves nothing, so a page holds the tilt to it, and a drag back starts moving at once instead of after the
 * excess is dragged back. It depends on the height (the horizon is further from straight down the higher the camera is) and the zoom. The `down` look has no such range.
 *
 * @param distance - The camera's distance from the Earth's centre, in Earth radii.
 * @param look - The look.
 * @param zoom - The shared controls' zoom.
 * @param face - The facing the tilt tips from (`ahead` when not given). Faced `up`, the range reaches straight up.
 * @returns The lowest and highest tilt, or `null` for the `down` look.
 *
 * @example
 * ```ts
 * import { rideTiltLimits } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const range = rideTiltLimits(1.066, "horizon", 1);
 * console.log(range && `${range.min.toFixed(0)} to ${range.max.toFixed(0)}`, rideTiltLimits(1.066, "down", 1));
 * ```
 */
export function rideTiltLimits(distance: number, look: RideLook, zoom: number, face?: RideFace): { min: number; max: number } | null {
  if (look !== "horizon") return null;
  const radius = distance <= 1 ? 90 : Math.asin(1 / distance) / RAD;
  const start = restElevation(radius, face);
  const perDegree = (GRAB * rideFov(zoom)) / 60;
  return { min: (start - highest(start)) / RAD / perDegree, max: (start + Math.PI / 2) / RAD / perDegree };
}

/** The elevation, in radians above the horizontal, of the horizon look at tilt 0: the facing's, or with the horizon a little above the middle of the picture. */
function restElevation(earthRadiusDegrees: number, face: RideFace | undefined): number {
  if (face === "down") return -Math.PI / 2;
  if (face === "up") return Math.PI / 2;
  return Math.max(0, earthRadiusDegrees - 12) * RAD - Math.PI / 2;
}

/** The highest the horizon look tips, in radians above the horizontal: a little above the horizon, or the facing's own when it is higher (straight up). */
const highest = (rest: number): number => Math.max(MAX_ABOVE_HORIZON * RAD, rest);

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
  /**
   * The heading in degrees, accumulated by the caller (see `rideTurnDegrees`): used in place of `yaw` when given, so a turn of more than half a way round is not undone by the controls wrapping their yaw, and a change of zoom does not swing it.
   */
  turn?: number;
  /** In the `horizon` look, the facing the yaw and tilt look round from (see `RideFace`): `ahead` when not given. */
  face?: RideFace;
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
 * nothing rolls; in the `down` look the camera turns about its own up. `zoom` narrows the field of view. In the `horizon` look `face` sets where the yaw and tilt look round from: `left` at yaw and tilt 0 looks across the way it goes to the left,
 * with the horizon where `ahead` has it, and `up` looks straight away from the Earth (the tilt may then tip it back down, and up again as far as straight up).
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
  const fov = rideFov(input.zoom);
  const faced = input.look === "horizon" && input.face ? FACE_TURN[input.face] : 0;
  const turn = ((input.turn ?? input.yaw * (GRAB * fov / 180)) + faced) * RAD;
  const lift = input.tilt * (GRAB * fov / 60) * RAD;
  if (input.look === "horizon") {
    // looking round on the spot: a drag sideways turns the camera about the local vertical, all the way round, and a drag up or down tips it up or down in the vertical plane it faces, from straight down to a little above the horizon,
    // so the horizon stays level and nothing rolls
    const zenith = scale(nadir, -1);
    const heading = add(scale(ahead, Math.cos(turn)), scale(cross(zenith, ahead), Math.sin(turn)));
    const rest = restElevation(earthRadiusDegrees, input.face);
    const elevation = Math.max(-Math.PI / 2, Math.min(highest(rest), rest - lift));
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
