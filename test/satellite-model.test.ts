// A satellite drawn as a model: the axes it flies on, where its model goes and how big it is drawn.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aboveAxes, MODEL_RADIUS_SHARE, modelMatrix, modelRadius, satelliteAxes } from "../src/space/satellite-model.ts";

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const near = (a: number, b: number, tol = 1e-12): boolean => Math.abs(a - b) <= tol;

test("the axes are along the flight, away from the Earth and to the left, each a unit and at right angles", () => {
  const axes = satelliteAxes([1.066, 0, 0], [0, 0, -7.66])!;
  assert.ok(near(dot(axes.z, [1, 0, 0]), 1), "z is straight up");
  assert.ok(near(dot(axes.x, [0, 0, -1]), 1), "x is the way it goes");
  for (const a of [axes.x, axes.y, axes.z]) assert.ok(near(Math.hypot(a[0], a[1], a[2]), 1));
  assert.ok(near(dot(axes.x, axes.y), 0) && near(dot(axes.y, axes.z), 0) && near(dot(axes.x, axes.z), 0));
  // y = z cross x: with x = -z_world and z = +x_world, y is z cross x = (1,0,0) x (0,0,-1) = (0,1,0)
  assert.ok(near(dot(axes.y, [0, 1, 0]), 1), "y is to the left of the way it goes (north here)");
});

test("a velocity with a part pointing up or down is taken level with the ground, and a satellite that does not move or sits at the centre has no axes", () => {
  const tilted = satelliteAxes([0, 1.07, 0], [3, 2, 0])!;
  assert.ok(near(dot(tilted.x, [1, 0, 0]), 1), "the climb is not in the way it points");
  assert.equal(satelliteAxes([1, 0, 0], [0, 0, 0]), null);
  assert.equal(satelliteAxes([1, 0, 0], [5, 0, 0]), null, "straight up has no level way");
  assert.equal(satelliteAxes([0, 0, 0], [1, 0, 0]), null);
});

test("the matrix has the axes times the scale in its columns, then the place", () => {
  const axes = satelliteAxes([1.066, 0, 0], [0, 0, -7.66])!;
  const m = modelMatrix([1.066, 0, 0], axes, 0.02);
  assert.equal(m.length, 16);
  assert.deepEqual([m[3], m[7], m[11], m[15]], [1.066, 0, 0, 1]);
  assert.deepEqual([m[12], m[13], m[14]], [0, 0, 0]);
  const column = (c: number): number[] => [m[c]!, m[4 + c]!, m[8 + c]!];
  for (const c of [0, 1, 2]) assert.ok(near(Math.hypot(...(column(c) as [number, number, number])), 0.02, 1e-12), `column ${c} has the scale`);
});

test("the radius grows with the distance so the model reads at any distance, and is never under its true size", () => {
  const half = Math.tan((35 / 2) * (Math.PI / 180));
  const near1 = modelRadius(0.1, half, MODEL_RADIUS_SHARE, 1e-9);
  const far = modelRadius(1, half, MODEL_RADIUS_SHARE, 1e-9);
  assert.ok(near(far / near1, 10, 1e-9), "ten times further, ten times bigger");
  // seen from `away` with the half field, a radius r is r / (away * half) of half the height: so the share of the whole height is that over two
  assert.ok(near(far / (1 * half) / 2, MODEL_RADIUS_SHARE, 1e-12));
  assert.equal(modelRadius(1e-6, half, MODEL_RADIUS_SHARE, 0.5), 0.5, "a close camera sees it at its true size");
});

const unit = (v: readonly number[]): boolean => Math.abs(Math.hypot(v[0]!, v[1]!, v[2]!) - 1) < 1e-9;

test("above a satellite: straight above it, the way it goes at the top, with no turn and no tip", () => {
  const view = aboveAxes([1.07, 0, 0], [0, 0, 7.5], 0, 0);
  assert.ok(unit(view.offset) && unit(view.up));
  assert.ok(dot(view.offset, [1, 0, 0]) > 0.999999, "the camera is on the line from the Earth's centre through the satellite, outside it");
  assert.ok(dot(view.up, [0, 0, 1]) > 0.999999, "the way the satellite goes is the top of the picture");
  assert.ok(Math.abs(dot(view.up, view.offset)) < 1e-9, "the top of the picture is level with the satellite");
});

test("above a satellite: a velocity that points up or down, or is none, still gives a camera straight above and a top that is level", () => {
  for (const velocity of [[7.5, 0, 0], [-7.5, 0, 0], [0, 0, 0]] as [number, number, number][]) {
    const view = aboveAxes([1.07, 0, 0], velocity, 0, 0);
    assert.ok(unit(view.offset) && unit(view.up), `unit vectors for ${velocity.join(",")}`);
    assert.ok(dot(view.offset, [1, 0, 0]) > 0.999999);
    assert.ok(Math.abs(dot(view.up, view.offset)) < 1e-9, "a top that is level");
  }
});

test("above a satellite over a pole: the same, whichever way the poles lie", () => {
  for (const position of [[0, 1.07, 0], [0, -1.07, 0]] as [number, number, number][]) {
    const view = aboveAxes(position, [7.5, 0, 0], 0, 0);
    assert.ok(unit(view.offset) && unit(view.up));
    assert.ok(dot(view.offset, [0, Math.sign(position[1]), 0]) > 0.999999);
    assert.ok(dot(view.up, [1, 0, 0]) > 0.999999, "the way it goes is the top");
    const still = aboveAxes(position, [0, 0, 0], 0, 0);
    assert.ok(unit(still.offset) && unit(still.up) && Math.abs(dot(still.up, still.offset)) < 1e-9, "and at rest over a pole");
  }
});

test("above a satellite: a turn turns the top about the line down, and a tip moves the camera back (positive) or ahead (negative) by that angle", () => {
  const radial = [1, 0, 0];
  const turned = aboveAxes([1.07, 0, 0], [0, 0, 7.5], Math.PI / 2, 0);
  assert.ok(Math.abs(dot(turned.up, [0, 0, 1])) < 1e-9, "a quarter turn: the top is no longer the way it goes");
  assert.ok(Math.abs(dot(turned.up, radial)) < 1e-9 && dot(turned.offset, radial) > 0.999999, "and still level, with the camera still straight above");
  const half = aboveAxes([1.07, 0, 0], [0, 0, 7.5], Math.PI, 0);
  assert.ok(dot(half.up, [0, 0, 1]) < -0.999999, "a half turn: the top is the way it came from");
  const back = aboveAxes([1.07, 0, 0], [0, 0, 7.5], 0, 0.5);
  assert.ok(Math.abs(dot(back.offset, radial) - Math.cos(0.5)) < 1e-9, "tipped back by the angle from straight above");
  assert.ok(dot(back.offset, [0, 0, 1]) < 0, "positive: behind the satellite");
  const ahead = aboveAxes([1.07, 0, 0], [0, 0, 7.5], 0, -0.5);
  assert.ok(dot(ahead.offset, [0, 0, 1]) > 0, "negative: ahead of it");
  assert.ok(Math.abs(dot(back.up, radial)) < 1e-9, "the top stays level with the satellite, tipped or not");
});
