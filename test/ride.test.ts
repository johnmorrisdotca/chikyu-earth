import test from "node:test";
import assert from "node:assert/strict";
import { ridePose, RIDE_FOV, type RideInput } from "../src/space/ride.ts";

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
  assert.equal(ridePose({ ...iss, zoom: 1000 }).fov, 5);
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

test("a drag from the horizon look turns about the camera's own up, so the picture's up stays put", () => {
  const level = ridePose({ ...iss, look: "horizon" });
  const turned = ridePose({ ...iss, look: "horizon", yaw: 30 });
  for (let i = 0; i < 3; i += 1) near(turned.up[i]!, level.up[i]!, 1e-9, "up");
  assert.ok(Math.abs(turned.forward[1]!) > 0.05, "and it looks to the side");
});

test("with no way of travel it still has a sensible up: north, or east at a pole", () => {
  const still = ridePose({ ...iss, velocity: [0, 0, 0] });
  near(still.up[1], 1, 1e-9, "north is up");
  const polar = ridePose({ position: [0, 1.2, 0], velocity: [0, 0, 0], look: "down", yaw: 0, tilt: 0, zoom: 1 });
  near(len(polar.up), 1, 1e-9, "a unit vector over the pole");
  near(dot(polar.up, polar.forward), 0, 1e-9, "and square to forward");
});
