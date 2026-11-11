// A satellite drawn as a model: the axes it flies on, where its model goes and how big it is drawn.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MODEL_RADIUS_SHARE, modelMatrix, modelRadius, satelliteAxes } from "../src/space/satellite-model.ts";

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
