// A fly-to move over the Earth, for `flyTo` and `goToPlace`: the point under the camera goes along a great circle and the height along a log scale, each a quintic that starts with the speed and
// the turn the camera has now, so a new move bends the running one instead of stopping it. Pure.
import { EARTH_RADIUS_KM, type Vec3 } from "./ephemeris.ts";

/**
 * The height a descent stops at when the page names none, in kilometres: the whole of a city in view, still sharp with the finer 30 m pictures of the land.
 *
 * @example
 * ```ts
 * import { FLY_HEIGHT_KM } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(FLY_HEIGHT_KM); // 30
 * ```
 */
export const FLY_HEIGHT_KM = 30;

/**
 * The lowest height a descent goes to, in kilometres: the camera stays above the clouds' shell.
 *
 * @example
 * ```ts
 * import { FLY_MIN_KM } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(FLY_MIN_KM); // 15
 * ```
 */
export const FLY_MIN_KM = 15;

/**
 * The height a descent stops at where no finer picture lies under it (the sea, Antarctica, the far north, or no `tiles-finer`), in kilometres: as low as the package's own pictures stay sharp.
 *
 * @example
 * ```ts
 * import { FLY_FLOOR_KM } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(FLY_FLOOR_KM); // 400
 * ```
 */
export const FLY_FLOOR_KM = 400;

/**
 * The parts of a fly-to: `across` turns the Earth under the camera at the height it has until the place is below, `down` comes down to the height over the place, `both` (the default) one after the other.
 *
 * @example
 * ```ts
 * import type { FlyPhase } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const phases: FlyPhase[] = ["across", "down", "both"];
 * console.log(phases.length);
 * ```
 */
export type FlyPhase = "across" | "down" | "both";

/**
 * Where a move has the camera at one moment, and how it is going: `aim` is the point under it (a unit vector in the Earth's axes: x toward longitude 90, y north, z toward longitude 0), `v` and `a` its speed and
 * acceleration a millisecond, `height` the natural log of the height in kilometres, `hv` and `ha` its speed and acceleration.
 *
 * @example
 * ```ts
 * import type { FlyState } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const still: FlyState = { aim: [0, 0, 1], v: [0, 0, 0], a: [0, 0, 0], height: Math.log(1000), hv: 0, ha: 0 };
 * console.log(Math.exp(still.height));
 * ```
 */
export interface FlyState {
  aim: Vec3;
  v: Vec3;
  a: Vec3;
  height: number;
  hv: number;
  ha: number;
}

/** The turn of a move: from `from` with the speed `v` and acceleration `a` it had, to `to`, over `ms` from `start`; `axis` and `angle` are the great circle between them. */
interface Turn {
  start: number;
  ms: number;
  from: Vec3;
  to: Vec3;
  axis: Vec3;
  angle: number;
  v: Vec3;
  a: Vec3;
}

/** One part of a move's height, in the log of kilometres: from `from` with the speed and acceleration it had to `to`, over `ms` from `start`. */
interface Lift {
  start: number;
  ms: number;
  from: number;
  to: number;
  v: number;
  a: number;
}

/**
 * A move worked out by `planFly`: its turn, the parts of its height one after the other, the height it starts at (the log of kilometres), when the turn is over (`across`) and when the whole move is
 * (`end`), on the clock it was planned with.
 *
 * @example
 * ```ts
 * import { planFly, type FlyPlan } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const plan: FlyPlan = planFly({ aim: [0, 0, 1], v: [0, 0, 0], a: [0, 0, 0], height: Math.log(1000), hv: 0, ha: 0 }, [1, 0, 0], { at: 0, phase: "across" });
 * console.log(plan.end > plan.turn.start);
 * ```
 */
export interface FlyPlan {
  readonly turn: Readonly<Turn>;
  readonly lifts: readonly Readonly<Lift>[];
  readonly height: number;
  readonly across: number;
  readonly end: number;
}

/**
 * Where a move has the camera at one moment: `aim`, the unit vector of the point under it, and `heightKm`.
 *
 * @example
 * ```ts
 * import type { FlyPoint } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const over: FlyPoint = { aim: [0, 0, 1], heightKm: 30 };
 * console.log(over.heightKm);
 * ```
 */
export interface FlyPoint {
  aim: Vec3;
  heightKm: number;
}

const RAD = Math.PI / 180;
const dot = (p: Vec3, q: Vec3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const scale = (p: Vec3, k: number): Vec3 => [p[0] * k, p[1] * k, p[2] * k];
const unit = (p: Vec3): Vec3 => {
  const length = Math.hypot(p[0], p[1], p[2]);
  return length > 0 ? scale(p, 1 / length) : [0, 0, 1];
};
/** `p` less its part along the unit vector `n`: what lies in the plane that touches the sphere at `n`. */
const along = (p: Vec3, n: Vec3): Vec3 => {
  const k = dot(p, n);
  return [p[0] - n[0] * k, p[1] - n[1] * k, p[2] - n[2] * k];
};

// The quintic's three parts on 0 to 1: `ease` goes from 0 to 1 still at both ends, `push` starts with a slope of 1 and `bend` with a second slope of 1, both ending flat at 0.
const ease = (s: number): number => s * s * s * (10 - 15 * s + 6 * s * s);
const push = (s: number): number => s - 6 * s ** 3 + 8 * s ** 4 - 3 * s ** 5;
const bend = (s: number): number => 0.5 * s * s - 1.5 * s ** 3 + 1.5 * s ** 4 - 0.5 * s ** 5;

/**
 * The unit vector of a longitude and latitude in degrees, in the Earth's axes (x toward longitude 90, y north, z toward longitude 0).
 *
 * @param lon - Degrees east.
 * @param lat - Degrees north.
 * @returns The unit vector.
 *
 * @example
 * ```ts
 * import { flyAim } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(flyAim(0, 90).map((n) => Math.round(n))); // [0, 1, 0]
 * ```
 */
export function flyAim(lon: number, lat: number): Vec3 {
  const c = Math.cos(lat * RAD);
  return [c * Math.sin(lon * RAD), Math.sin(lat * RAD), c * Math.cos(lon * RAD)];
}

/**
 * The longitude and latitude in degrees of a unit vector in the Earth's axes, the inverse of `flyAim`.
 *
 * @param aim - The unit vector.
 * @returns `{ lon, lat }`.
 *
 * @example
 * ```ts
 * import { flyAim, flyLonLat } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(flyLonLat(flyAim(139.69, 35.69)));
 * ```
 */
export function flyLonLat(aim: Vec3): { lon: number; lat: number } {
  return { lon: Math.atan2(aim[0], aim[2]) / RAD, lat: Math.asin(Math.max(-1, Math.min(1, aim[1]))) / RAD };
}

/**
 * How long the turn across takes, in milliseconds: 900 for a short way, up to 2,400 for the far side of the Earth.
 *
 * @param angle - The angle between the two points, in radians.
 * @returns Milliseconds.
 *
 * @example
 * ```ts
 * import { flyAcrossMs } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(flyAcrossMs(0), flyAcrossMs(Math.PI)); // 900 2400
 * ```
 */
export const flyAcrossMs = (angle: number): number => 900 + 1500 * Math.min(1, Math.abs(angle) / Math.PI);

/**
 * How long a descent takes, in milliseconds: 1,200 and half a second more for each time the height is divided by e, at most 5 seconds.
 *
 * @param fromKm - The height it starts from.
 * @param toKm - The height it ends at.
 * @returns Milliseconds.
 *
 * @example
 * ```ts
 * import { flyDownMs } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(Math.round(flyDownMs(20_000, 30)));
 * ```
 */
export const flyDownMs = (fromKm: number, toKm: number): number => Math.min(5000, 1200 + 500 * Math.abs(Math.log(Math.max(1e-3, fromKm) / Math.max(1e-3, toKm))));

/** The time a height still moving takes to come to rest, in milliseconds: it goes on as far as half its speed over that time, so it slows without turning back. */
const COAST_MS = 900;

const turnAt = (turn: Turn, t: number): Vec3 => {
  const s = Math.max(0, Math.min(1, (t - turn.start) / turn.ms));
  const angle = turn.angle * ease(s);
  const side = cross(turn.axis, turn.from);
  const c = Math.cos(angle);
  const n = Math.sin(angle);
  const k = turn.ms * push(s);
  const k2 = turn.ms * turn.ms * bend(s);
  return unit([
    turn.from[0] * c + side[0] * n + turn.v[0] * k + turn.a[0] * k2,
    turn.from[1] * c + side[1] * n + turn.v[1] * k + turn.a[1] * k2,
    turn.from[2] * c + side[2] * n + turn.v[2] * k + turn.a[2] * k2,
  ]);
};

const liftAt = (lifts: readonly Lift[], t: number): number => {
  let value = lifts[0]!.from;
  for (const lift of lifts) {
    if (t < lift.start) break;
    const s = Math.min(1, (t - lift.start) / lift.ms);
    value = lift.from + (lift.to - lift.from) * ease(s) + lift.v * lift.ms * push(s) + lift.a * lift.ms * lift.ms * bend(s);
  }
  return value;
};

/**
 * Where a move has the camera at a moment of its clock. Before it starts it is where it began; after it ends, where it ended.
 *
 * @param plan - What `planFly` returned.
 * @param t - The moment, in milliseconds of the clock the plan was made with.
 * @returns The point under the camera and its height.
 *
 * @example
 * ```ts
 * import { flyAt, flyAim, flyLonLat, planFly } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const plan = planFly({ aim: flyAim(0, 0), v: [0, 0, 0], a: [0, 0, 0], height: Math.log(20_000), hv: 0, ha: 0 }, flyAim(139.69, 35.69), { at: 0, phase: "both", heightKm: 30 });
 * const end = flyAt(plan, plan.end);
 * console.log(flyLonLat(end.aim), Math.round(end.heightKm)); // Tokyo, 30
 * ```
 */
export function flyAt(plan: FlyPlan, t: number): FlyPoint {
  return { aim: turnAt(plan.turn, t), heightKm: Math.exp(plan.lifts.length > 0 ? liftAt(plan.lifts, t) : plan.height) };
}

/** The step the speed and acceleration of a move are read over, in milliseconds. */
const STEP_MS = 0.5;

/**
 * Where a move has the camera at a moment and how it is going there: what a new move starts from, so that it carries on with the same speed and turn.
 *
 * @param plan - What `planFly` returned.
 * @param t - The moment, in milliseconds of the plan's clock.
 * @returns The state, with its speeds and accelerations a millisecond.
 *
 * @example
 * ```ts
 * import { flyAim, flyStateAt, planFly } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const plan = planFly({ aim: flyAim(0, 0), v: [0, 0, 0], a: [0, 0, 0], height: Math.log(1000), hv: 0, ha: 0 }, flyAim(90, 0), { at: 0, phase: "across" });
 * const halfway = flyStateAt(plan, plan.end / 2);
 * console.log(Math.hypot(...halfway.v) > 0);
 * ```
 */
export function flyStateAt(plan: FlyPlan, t: number): FlyState {
  // read forward, so a move that has only just begun is read from its own start, not the moment before it
  const p0 = flyAt(plan, t);
  const p1 = flyAt(plan, t + STEP_MS);
  const p2 = flyAt(plan, t + 2 * STEP_MS);
  const aim = p0.aim;
  const v: Vec3 = [0, 1, 2].map((i) => (-3 * p0.aim[i]! + 4 * p1.aim[i]! - p2.aim[i]!) / (2 * STEP_MS)) as Vec3;
  const a: Vec3 = [0, 1, 2].map((i) => (p0.aim[i]! - 2 * p1.aim[i]! + p2.aim[i]!) / (STEP_MS * STEP_MS)) as Vec3;
  const [h0, h1, h2] = [p0, p1, p2].map((p) => Math.log(p.heightKm)) as [number, number, number];
  return { aim, v: along(v, aim), a: along(a, aim), height: h0, hv: (-3 * h0 + 4 * h1 - h2) / (2 * STEP_MS), ha: (h0 - 2 * h1 + h2) / (STEP_MS * STEP_MS) };
}

/**
 * The state of a camera that is not moving: over `aim` at `heightKm`.
 *
 * @param aim - The unit vector of the point under the camera.
 * @param heightKm - Its height in kilometres.
 * @returns The state, with no speed.
 *
 * @example
 * ```ts
 * import { flyAim, flyStill } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(flyStill(flyAim(0, 0), 1000).hv); // 0
 * ```
 */
export const flyStill = (aim: Vec3, heightKm: number): FlyState => ({ aim: unit(aim), v: [0, 0, 0], a: [0, 0, 0], height: Math.log(Math.max(1e-3, heightKm)), hv: 0, ha: 0 });

/**
 * Plan a move from where the camera is and how it is going (`now`) to the point `to`. The turn starts with the camera's own speed and turn and curves to the place along a great circle, slowing to rest over
 * it; the height does the same on a log scale. A height still moving when the move is planned (a descent that a new move cuts short) slows to rest first, without turning back. `across` keeps the height,
 * `down` comes to `heightKm` at once (the turn, if any, beside it), `both` comes down once the turn is over.
 *
 * @param now - Where the camera is and how it is going: `flyStateAt` of the move running, else `flyStill`.
 * @param to - The unit vector of the place.
 * @param options - `at`, the moment on the move's clock; `phase` (`both` by default); `heightKm`, the height to come down to (`FLY_HEIGHT_KM` by default); `acrossMs`, the time of the turn (`flyAcrossMs` of its angle by default).
 * @returns The plan, for `flyAt` and `flyStateAt`.
 *
 * @example
 * ```ts
 * import { flyAim, flyStateAt, planFly } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const start = { aim: flyAim(0, 0), v: [0, 0, 0] as [number, number, number], a: [0, 0, 0] as [number, number, number], height: Math.log(20_000), hv: 0, ha: 0 };
 * const toTokyo = planFly(start, flyAim(139.69, 35.69), { at: 0 });
 * // half way, the reader asks for London: the new move starts with the speed the first one has
 * const toLondon = planFly(flyStateAt(toTokyo, 800), flyAim(-0.13, 51.51), { at: 800 });
 * console.log(toLondon.end > 800);
 * ```
 */
export function planFly(now: FlyState, to: Vec3, options: { at: number; phase?: FlyPhase; heightKm?: number; acrossMs?: number }): FlyPlan {
  const at = options.at;
  const phase = options.phase ?? "both";
  const from = unit(now.aim);
  const target = unit(to);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(from, target))));
  // the great circle's axis; for two points opposite each other any axis will do, and the way the camera is already going is the one that bends least
  let axis = cross(from, target);
  if (Math.hypot(...axis) < 1e-9) axis = cross(from, Math.hypot(...now.v) > 1e-12 ? unit(now.v) : Math.abs(from[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const moving = Math.hypot(...now.v) > 1e-12 || Math.hypot(...now.a) > 1e-12;
  const acrossMs = angle < 1e-9 && !moving ? 0 : (options.acrossMs ?? flyAcrossMs(angle));
  const turn: Turn = { start: at, ms: Math.max(1, acrossMs), from, to: target, axis: unit(axis), angle, v: along(now.v, from), a: along(now.a, from) };
  const lifts: Lift[] = [];
  let held = now.height;
  let free = at;
  // a height still moving, with no descent to carry on in: it slows to rest first, going on half as far as its speed would carry it over that time
  if (phase !== "down" && (Math.abs(now.hv) > 1e-9 || Math.abs(now.ha) > 1e-9)) {
    held = now.height + 0.5 * now.hv * COAST_MS;
    lifts.push({ start: at, ms: COAST_MS, from: now.height, to: held, v: now.hv, a: now.ha });
    free = at + COAST_MS;
  }
  const across = at + acrossMs;
  if (phase !== "across") {
    const goal = Math.log(Math.max(1e-3, options.heightKm ?? FLY_HEIGHT_KM));
    if (phase === "down") lifts.push({ start: at, ms: flyDownMs(Math.exp(now.height), Math.exp(goal)), from: now.height, to: goal, v: now.hv, a: now.ha });
    else if (Math.abs(goal - held) > 1e-9) {
      const start = Math.max(across, free);
      lifts.push({ start, ms: flyDownMs(Math.exp(held), Math.exp(goal)), from: held, to: goal, v: 0, a: 0 });
    }
  }
  const last = lifts[lifts.length - 1];
  return { turn, lifts, height: now.height, across, end: Math.max(across, last ? last.start + last.ms : at) };
}

/**
 * The height a descent over a place is held at, in kilometres, or `null` when nothing holds it: a descent comes all the way down only where the finer pictures lie (`tiles-finer` on, over land, from 60
 * degrees south to 80 degrees north, as the survey of the layer found), and stops at `FLY_FLOOR_KM` elsewhere, as low as the package's own pictures stay sharp.
 *
 * @param place - `finer`, whether finer pictures are asked for; `land`, whether the place is on land or near its coast; `lat`, its latitude.
 * @returns The height to hold at, or `null`.
 *
 * @example
 * ```ts
 * import { descentFloorKm } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(descentFloorKm({ finer: true, land: true, lat: 35.69 })); // null: down to the height asked for
 * console.log(descentFloorKm({ finer: true, land: false, lat: 30 })); // 400: the sea
 * ```
 */
export function descentFloorKm(place: { finer: boolean; land: boolean; lat: number }): number | null {
  return place.finer && place.land && place.lat >= -60 && place.lat <= 80 ? null : FLY_FLOOR_KM;
}

/**
 * The camera's distance from the Earth's centre, in Earth radii, for a height above the ground in kilometres.
 *
 * @param heightKm - The height.
 * @returns The distance.
 *
 * @example
 * ```ts
 * import { flyDistance } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(flyDistance(6371)); // 2
 * ```
 */
export const flyDistance = (heightKm: number): number => 1 + heightKm / EARTH_RADIUS_KM;
