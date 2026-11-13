import test from "node:test";
import assert from "node:assert/strict";
import { faceOffset, ridePose, RIDE_FACES, RIDE_FOV, type RideFace, type RideInput } from "../src/space/ride.ts";
import { aboveAxes } from "../src/space/satellite-model.ts";

const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const len = (a: number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
/** Something like the ISS: 420 km up over the +x axis, going along -z. */
const iss: RideInput = { position: [1.066, 0, 0], velocity: [0, 0.2, -7.66], look: "down", yaw: 0, tilt: 0, zoom: 1 };

test("looking down, the camera looks at the Earth's centre with the way it is going at the top of the picture", () => {
  const pose = ridePose(iss);
  near(pose.forward[0], -1, 1e-9, "forward is toward the Earth");
  near(len(pose.forward), 1, 1e-9, "forward is a unit vector");
  near(len(pose.up), 1, 1e-9, "up is a unit vector");
  near(dot(pose.forward, pose.up), 0, 1e-9, "up is square to forward");
  assert.ok(pose.up[2] < -0.99, `the way it goes (-z) is up in the picture: ${pose.up}`);
  assert.deepEqual(pose.position, [1.066, 0, 0]);
  near(pose.fov, RIDE_FOV, 1e-9, "the natural field of view");
  near(pose.earthRadiusDegrees, 69.7, 0.2, "the Earth's radius seen from 420 km");
});

test("the part of the way it goes that points at the Earth is ignored", () => {
  const sideways = ridePose({ ...iss, velocity: [-3, 0.2, -7.66] });
  const plain = ridePose(iss);
  for (let i = 0; i < 3; i += 1) near(sideways.up[i]!, plain.up[i]!, 1e-9, "up");
});

test("the horizon look tips the camera forward until the horizon is a little above the middle", () => {
  const pose = ridePose({ ...iss, look: "horizon" });
  // the horizon is 69.7 degrees from straight down; the camera is tipped 12 degrees short of it
  near((Math.acos(-pose.forward[0]) * 180) / Math.PI, 69.7 - 12, 0.3, "angle from straight down");
  assert.ok(pose.forward[2] < 0, "tipped towards the way it goes");
  near(dot(pose.forward, pose.up), 0, 1e-9, "up is square to forward");
  const far = ridePose({ position: [10, 0, 0], velocity: [0, 0, 1], look: "horizon", yaw: 0, tilt: 0, zoom: 1 });
  near((Math.acos(-far.forward[0]) * 180) / Math.PI, 0, 1e-9, "from far away the horizon is the picture's edge, so it looks down");
});

test("zoom narrows the view", () => {
  near(ridePose({ ...iss, zoom: 2 }).fov, RIDE_FOV / 2, 1e-9, "twice the zoom, half the field of view");
  assert.equal(ridePose({ ...iss, zoom: 1000 }).fov, 1.5);
  near(ridePose({ ...iss, zoom: 40 }).fov, RIDE_FOV / 40, 1e-9, "a zoom of 40, the most a ride takes, is a field of 1.5 degrees");
  assert.equal(ridePose({ ...iss, zoom: 0.0001 }).fov, 100);
  assert.equal(ridePose({ ...iss, tilt: 400, yaw: 400 }).forward.every(Number.isFinite), true);
});

test("a drag right (yaw) turns the camera left and a drag up (tilt) tips it towards the bottom of the picture, so the ground follows the pointer", () => {
  // looking down over +x with the way it goes (-z) at the top: the picture's left is +y, its bottom is +z
  const clean: RideInput = { ...iss, velocity: [0, 0, -7.66] };
  const right = ridePose({ ...clean, yaw: 40 });
  assert.ok(right.forward[1] > 0.1, `looks to the picture's left: ${right.forward}`);
  near(right.forward[2], 0, 1e-9, "and not along the way it goes");
  const up = ridePose({ ...clean, tilt: 20 });
  assert.ok(up.forward[2] > 0.1, `looks towards the picture's bottom: ${up.forward}`);
  near(up.forward[1], 0, 1e-9, "and not sideways");
  for (const pose of [right, up]) {
    near(len(pose.forward), 1, 1e-9, "forward is a unit vector");
    near(len(pose.up), 1, 1e-9, "up is a unit vector");
    near(dot(pose.forward, pose.up), 0, 1e-9, "up is square to forward");
  }
});

test("the angle for each pixel of a drag follows the field of view, so the ground keeps pace with the pointer at any zoom", () => {
  const angle = (zoom: number): number => (Math.acos(-ridePose({ ...iss, yaw: 30, zoom }).forward[0]) * 180) / Math.PI;
  near(angle(1), 30 * 1.5 * (RIDE_FOV / 180), 1e-6, "at zoom 1");
  near(angle(2), angle(1) / 2, 1e-6, "twice the zoom, half the angle");
});

/** The cosine of the angle from straight up (the local vertical, from the Earth's centre through the camera) to a direction. */
const upness = (position: number[], v: number[]): number => dot(v, position) / len(position);
const cross = (a: number[], b: number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const horizonIss: RideInput = { ...iss, velocity: [0, 0, -7.66], look: "horizon" };
/** The yaw that turns the camera by `degrees` at zoom 1 (a drag across the view is 180 and turns it 90). */
const yawFor = (degrees: number): number => degrees / (1.5 * (RIDE_FOV / 180));

test("the horizon look keeps the horizon level through a whole turn: the picture's right is never up or down, and its up always has some of the sky in it", () => {
  for (let degrees = 0; degrees <= 360; degrees += 15) {
    const pose = ridePose({ ...horizonIss, yaw: yawFor(degrees) });
    const right = cross(pose.forward, pose.up);
    near(upness(iss.position, right), 0, 1e-9, `no roll at ${degrees} degrees`);
    assert.ok(upness(iss.position, pose.up) > 0.3, `up is above the horizontal at ${degrees} degrees`);
    near(len(pose.forward), 1, 1e-9, "forward is a unit vector");
    near(dot(pose.forward, pose.up), 0, 1e-9, "up is square to forward");
    // the tip down does not change with the turn: the camera only goes round
    near(upness(iss.position, pose.forward), upness(iss.position, ridePose(horizonIss).forward), 1e-9, `the same tip at ${degrees} degrees`);
  }
});

test("a sideways drag turns the camera the whole way round: 90, 180, 270 and 360 degrees from the way it goes", () => {
  const ahead = [0, 0, -1];
  const heading = (degrees: number): number[] => {
    const pose = ridePose({ ...horizonIss, yaw: yawFor(degrees) });
    const flat = [pose.forward[0]!, pose.forward[1]!, pose.forward[2]!];
    const lift = upness(iss.position, flat);
    return flat.map((n, i) => n - lift * [1, 0, 0][i]!);
  };
  const along = (degrees: number): number => dot(heading(degrees), ahead) / len(heading(degrees));
  near(along(0), 1, 1e-9, "at the start it looks the way it goes");
  near(along(90), 0, 1e-9, "at 90 it looks to the side");
  near(along(180), -1, 1e-9, "at 180 it looks back along the ground track, which runs away from the camera");
  near(along(270), 0, 1e-9, "at 270 it looks to the other side");
  near(along(360), 1, 1e-9, "and at 360 it is where it began");
  // a drag right turns the camera left (the ground follows the pointer): at 90 the picture looks along +y, the picture's left at the start
  assert.ok(ridePose({ ...horizonIss, yaw: yawFor(90) }).forward[1]! > 0.1, "the first quarter is to the left");
  assert.ok(ridePose({ ...horizonIss, yaw: yawFor(-90) }).forward[1]! < -0.1, "and a drag the other way is to the right");
});

test("up and down is only a tip: from straight down to a little above the horizon, with the heading kept and no roll", () => {
  const down = ridePose({ ...horizonIss, tilt: 1000 });
  near(upness(iss.position, down.forward), -1, 1e-9, "as far as straight down");
  near(upness(iss.position, cross(down.forward, down.up)), 0, 1e-9, "level");
  const high = ridePose({ ...horizonIss, tilt: -1000 });
  const degrees = (Math.asin(upness(iss.position, high.forward)) * 180) / Math.PI;
  near(degrees, 20, 1e-6, "20 degrees above the horizon at most");
  const turned = { ...horizonIss, yaw: yawFor(120) };
  for (const tilt of [-30, 0, 30, 60]) {
    const pose = ridePose({ ...turned, tilt });
    near(upness(iss.position, cross(pose.forward, pose.up)), 0, 1e-9, `no roll at tilt ${tilt}`);
    const flat = [pose.forward[0]! - upness(iss.position, pose.forward), pose.forward[1]!, pose.forward[2]!];
    const base = ridePose({ ...turned, tilt: 0 });
    const baseFlat = [base.forward[0]! - upness(iss.position, base.forward), base.forward[1]!, base.forward[2]!];
    near(dot(flat, baseFlat) / (len(flat) * len(baseFlat)), 1, 1e-9, `the heading does not move with the tip (tilt ${tilt})`);
  }
});

test("the horizon look from far away, where the horizon is the picture's edge, still turns about the vertical", () => {
  const far: RideInput = { position: [10, 0, 0], velocity: [0, 0, -1], look: "horizon", yaw: yawFor(90), tilt: 0, zoom: 1 };
  const pose = ridePose(far);
  near(pose.forward[0], -1, 1e-9, "it looks straight down");
  near(pose.up[1], 1, 1e-9, "and the picture's top is where it was turned to, to the left of the way it goes");
});

test("with no way of travel it still has a sensible up: north, or east at a pole", () => {
  const still = ridePose({ ...iss, velocity: [0, 0, 0] });
  near(still.up[1], 1, 1e-9, "north is up");
  const polar = ridePose({ position: [0, 1.2, 0], velocity: [0, 0, 0], look: "down", yaw: 0, tilt: 0, zoom: 1 });
  near(len(polar.up), 1, 1e-9, "a unit vector over the pole");
  near(dot(polar.up, polar.forward), 0, 1e-9, "and square to forward");
});

import { rideFov, rideTiltLimits, rideTurnDegrees } from "../src/space/ride.ts";

test("the turn is added up from the controls' wrapped yaw, so a whole turn round is a whole turn and a change of zoom swings nothing", () => {
  // the controls wrap yaw into -180..180: a drag round adds 150 at a time, and the page adds the turns up
  let total = 0;
  let yaw = 0;
  for (let step = 0; step < 10; step += 1) {
    const next = ((yaw + 150 + 180) % 360) - 180;
    const change = ((next - yaw + 540) % 360) - 180;
    total += rideTurnDegrees(change, 1);
    yaw = next;
  }
  near(total, 10 * 150 * 1.5 * (RIDE_FOV / 180), 1e-9, "the total is not wrapped");
  assert.ok(total > 360, "more than a whole turn");
  const before = ridePose({ ...horizonIss, turn: total });
  const zoomed = ridePose({ ...horizonIss, turn: total, zoom: 4 });
  // the heading is the same at both zooms
  const heading = (forward: number[]): number[] => forward.map((n, i) => n - dot(forward, [1, 0, 0]) * [1, 0, 0][i]!);
  const h1 = heading(before.forward);
  const h2 = heading(zoomed.forward);
  near(dot(h1, h2) / (len(h1) * len(h2)), 1, 1e-9, "a change of zoom does not turn the camera");
  near(rideFov(4), RIDE_FOV / 4, 1e-9, "and narrows the view");
  near(rideTurnDegrees(180, 6), rideTurnDegrees(180, 1) / 6, 1e-9, "a turn of the controls is smaller at a higher zoom");
});

test("a given turn is used in place of the yaw", () => {
  const byTurn = ridePose({ ...horizonIss, turn: 90, yaw: 123 });
  const byYaw = ridePose({ ...horizonIss, yaw: yawFor(90) });
  for (let i = 0; i < 3; i += 1) near(byTurn.forward[i]!, byYaw.forward[i]!, 1e-9, "forward");
});

test("the tilt that does something is from straight down to a little above the horizon, and a tilt past it is not needed", () => {
  const range = rideTiltLimits(1.066, "horizon", 1)!;
  assert.ok(range.min < 0 && range.max > 0);
  near(range.min, -34.9, 0.3, "up to 20 degrees above the horizon, in tilt");
  near(range.max, 38.5, 0.3, "and as far down as straight down");
  const top = ridePose({ ...horizonIss, tilt: range.min });
  const bottom = ridePose({ ...horizonIss, tilt: range.max });
  near(upness(iss.position, top.forward), Math.sin((20 * Math.PI) / 180), 1e-6, "the range's top is the highest the camera goes");
  near(upness(iss.position, bottom.forward), -1, 1e-6, "and its bottom is straight down");
  near(upness(iss.position, ridePose({ ...horizonIss, tilt: range.min - 30 }).forward), upness(iss.position, top.forward), 1e-9, "a tilt past the top changes nothing");
  assert.equal(rideTiltLimits(1.066, "down", 1), null, "the down look has no range");
  const narrow = rideTiltLimits(1.066, "horizon", 6)!;
  assert.ok(narrow.max > range.max * 3, "at a high zoom the same tilt moves less, so the range is wider");
});

const unitOf = (a: number[]): number[] => {
  const n = len(a) || 1;
  return [a[0]! / n, a[1]! / n, a[2]! / n];
};
const angle = (a: number[], b: number[]): number => (Math.acos(Math.max(-1, Math.min(1, dot(unitOf(a), unitOf(b))))) * 180) / Math.PI;
const level = (vector: number[], radial: number[]): number[] => {
  const n = unitOf(radial);
  const along = dot(vector, n);
  return unitOf([vector[0]! - n[0]! * along, vector[1]! - n[1]! * along, vector[2]! - n[2]! * along]);
};

test("each facing from the body is within a degree of its direction, and reduced motion is not this file's clock", () => {
  const radial = unitOf(iss.position);
  const way = level(iss.velocity, radial);
  const left = unitOf([radial[1]! * way[2]! - radial[2]! * way[1]!, radial[2]! * way[0]! - radial[0]! * way[2]!, radial[0]! * way[1]! - radial[1]! * way[0]!]);
  const want: Record<RideFace, number[]> = {
    ahead: way,
    behind: way.map((n) => -n),
    left,
    right: left.map((n) => -n),
    down: radial.map((n) => -n),
    up: radial,
  };
  for (const face of RIDE_FACES) {
    const pose = ridePose({ ...iss, look: "horizon", face, yaw: 0, tilt: 0, turn: 0 });
    const got = face === "down" || face === "up" ? pose.forward : level(pose.forward, radial);
    assert.ok(angle(got, want[face]) <= 1, `${face} is ${angle(got, want[face]).toFixed(2)} degrees off`);
  }
});

test("above a satellite, down looks straight down and the other facings look along, across or away", () => {
  const place: [number, number, number] = [1.07, 0, 0];
  const velocity: [number, number, number] = [0, 0, -7.66];
  const radial = unitOf(place);
  const way = level(velocity, radial);
  const left = unitOf([radial[1]! * way[2]! - radial[2]! * way[1]!, radial[2]! * way[0]! - radial[0]! * way[2]!, radial[0]! * way[1]! - radial[1]! * way[0]!]);
  const want: Record<RideFace, number[]> = { ahead: way, behind: way.map((n) => -n), left, right: left.map((n) => -n), down: radial.map((n) => -n), up: radial };
  for (const face of RIDE_FACES) {
    const { yaw, tilt } = faceOffset(face);
    const view = aboveAxes(place, velocity, yaw, tilt);
    const forward = view.offset.map((n) => -n);
    const got = face === "down" || face === "up" ? forward : level(forward, radial);
    assert.ok(angle(got, want[face]) <= 1, `${face} is ${angle(got, want[face]).toFixed(2)} degrees off`);
  }
});
