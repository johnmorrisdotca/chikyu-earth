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
 * A way to face while riding, as from the windows of a plane or a boat: `ahead` along the way it goes, `behind` the opposite, `left` and `right` across that way as seen facing ahead, `down` straight at the Earth and `up` straight away from it.
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
 * Every facing, in the order of a row of buttons.
 *
 * @example
 * ```ts
 * import { RIDE_FACES } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(RIDE_FACES.join(" "));
 * ```
 */
export const RIDE_FACES: readonly RideFace[] = ["ahead", "behind", "left", "right", "down", "up"];

/** How far each facing turns from the way it goes, in degrees, to the left, in the view from the body. */
const FACE_TURN: Record<RideFace, number> = { ahead: 0, behind: 180, left: 90, right: -90, down: 0, up: 0 };

/**
 * Yaw and tilt, in radians, that put a camera looking at a satellite on a facing. `down` is straight above it, looking down at it and the Earth. `ahead` looks along the way it goes.
 *
 * @param face - The facing.
 * @returns The yaw and tilt to give `aboveAxes`.
 *
 * @example
 * ```ts
 * import { faceOffset } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(faceOffset("down").tilt, faceOffset("ahead").tilt > 1);
 * ```
 */
export function faceOffset(face: RideFace): { yaw: number; tilt: number } {
  if (face === "up") return { yaw: 0, tilt: Math.PI };
  if (face === "ahead") return { yaw: 0, tilt: Math.PI / 2 };
  if (face === "behind") return { yaw: 0, tilt: -Math.PI / 2 };
  if (face === "left") return { yaw: Math.PI / 2, tilt: Math.PI / 2 };
  if (face === "right") return { yaw: -Math.PI / 2, tilt: Math.PI / 2 };
  return { yaw: 0, tilt: 0 };
}

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
export function rideTiltLimits(distance: number, look: RideLook, zoom: number): { min: number; max: number } | null {
  if (look !== "horizon") return null;
  const radius = distance <= 1 ? 90 : Math.asin(1 / distance) / RAD;
  const start = Math.max(0, radius - 12) * RAD - Math.PI / 2;
  const perDegree = (GRAB * rideFov(zoom)) / 60;
  return { min: (start - (MAX_ABOVE_HORIZON * RAD)) / RAD / perDegree, max: (start + Math.PI / 2) / RAD / perDegree };
}

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
  /** In the `horizon` look, the facing the yaw and tilt look round from. `ahead` when not given. */
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
 * Where a ride puts the camera: `outside` (the default) a little way off the satellite, behind and above it, so the satellite is in the picture; `inside` at the satellite itself, looking out of it, as a ride always was.
 *
 * @example
 * ```ts
 * import type { RideViewpoint } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const viewpoints: RideViewpoint[] = ["outside", "inside"];
 * console.log(viewpoints.join(" or "));
 * ```
 */
export type RideViewpoint = "outside" | "inside";

/**
 * How far an outside ride keeps the camera from the satellite, in kilometres. The satellite itself is a few metres across, so it is drawn far larger than life (a model about a fifth of the picture's height across): not to scale, and the page says so in its caption.
 *
 * @example
 * ```ts
 * import { OUTSIDE_KM } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(OUTSIDE_KM);
 * ```
 */
export const OUTSIDE_KM = 25;

/** How far below the middle of the picture the satellite is drawn in an outside ride that looks along the way it goes, as a share of half the picture's height (0.56: about a fifth of the height below the middle). */
const OUTSIDE_LOW = 0.56;

/**
 * The camera of an outside ride: the pose `ridePose` works out for a camera at the satellite, moved to `OUTSIDE_KM` back along its own line of sight so the satellite is in front of it. Looking along the way it goes (`look: "horizon"`) the satellite sits a little below the middle of the picture, so the camera is behind and above it; looking
 * down (`look: "down"`) it is at the middle, with the camera straight above it. Where the satellite sits in the picture does not change with the zoom. Which way the camera looks and which way is up are the pose's own, so the look-around is the same as from the satellite itself; the camera goes round the satellite as it looks about. Pure. Never nearer the ground than half the satellite's height.
 *
 * @param pose - The pose from `ridePose` for the camera at the satellite.
 * @param look - The look the pose was made with.
 * @returns The pose moved back from the satellite, with how far the camera is from it in Earth radii and how many degrees below the middle of the picture the satellite is.
 *
 * @example
 * ```ts
 * import { outsidePose, ridePose } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const at = ridePose({ position: [1.066, 0, 0], velocity: [0, 0, -7.66], look: "horizon", yaw: 0, tilt: 0, zoom: 1 });
 * const out = outsidePose(at, "horizon");
 * console.log(out.distance.toFixed(4), out.below.toFixed(1), out.pose.position.map((n) => n.toFixed(4)).join(","));
 * ```
 */
export function outsidePose(pose: RidePose, look: RideLook): { pose: RidePose; distance: number; below: number } {
  const height = Math.max(0, norm(pose.position) - 1);
  const distance = Math.max(1e-5, Math.min(OUTSIDE_KM / 6371, height * 0.5));
  const below = look === "horizon" ? Math.atan(OUTSIDE_LOW * Math.tan((pose.fov / 2) * RAD)) : 0;
  // the satellite is along the line of sight turned `below` down (towards the bottom of the picture): the camera is back along that line
  const line = add(scale(pose.forward, Math.cos(below)), scale(pose.up, -Math.sin(below)));
  return { pose: { ...pose, position: add(pose.position, scale(line, -distance)) }, distance, below: below / RAD };
}

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
  const faced = input.look === "horizon" && input.face ? FACE_TURN[input.face] : 0;
  const base = input.look === "horizon" ? Math.max(0, earthRadiusDegrees - 12) * RAD : 0;
  const fov = rideFov(input.zoom);
  const turn = ((input.turn ?? input.yaw * (GRAB * fov / 180)) + faced) * RAD;
  const lift = input.tilt * (GRAB * fov / 60) * RAD;
  const rest = input.face === "down" ? -Math.PI / 2 : input.face === "up" ? Math.PI / 2 : base - Math.PI / 2;
  const cap = Math.max(MAX_ABOVE_HORIZON * RAD, rest);
  if (input.look === "horizon") {
    // looking round on the spot: a drag sideways turns the camera about the local vertical, all the way round, and a drag up or down tips it up or down in the vertical plane it faces, from straight down to a little above the horizon,
    // so the horizon stays level and nothing rolls. A facing (`up`, `down`, `ahead`, ...) is where that drag starts.
    const zenith = scale(nadir, -1);
    const heading = add(scale(ahead, Math.cos(turn)), scale(cross(zenith, ahead), Math.sin(turn)));
    const elevation = Math.max(-Math.PI / 2, Math.min(cap, rest - lift));
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
