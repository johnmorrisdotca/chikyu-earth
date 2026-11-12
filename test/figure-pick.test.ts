// Where a pointer is on the constellation figures, and where a figure's name goes: the pure part.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hullAreaAround, nearestSegment, placeBox, visibleCentre } from "../src/sky/figure-pick.ts";

// a figure of three segments: a square's three sides, from (100, 100)
const square = [100, 100, 200, 100, 200, 100, 200, 200, 200, 200, 100, 200, 100, 200, 100, 100];

test("the nearest segment: a point on a line is at nothing, one beside it at the gap, and a figure with no segment at infinity", () => {
  assert.equal(nearestSegment(square, 0, 4, 150, 100), 0);
  assert.equal(nearestSegment(square, 0, 4, 150, 95), 25);
  assert.equal(nearestSegment(square, 0, 0, 150, 95), Number.POSITIVE_INFINITY);
});

test("inside a figure: the area of its hull where the point is in it, and -1 where it is not", () => {
  assert.equal(hullAreaAround(square, 0, 4, 150, 150), 10_000);
  assert.equal(hullAreaAround(square, 0, 4, 250, 150), -1);
  assert.equal(hullAreaAround(square, 0, 1, 150, 100), -1, "one segment has no inside");
});

test("the middle of the part of a figure that is in view: a figure that runs off the top is centred on what shows, and what a body covers counts for nothing", () => {
  const out = { x: 0, y: 0 };
  // the square, on a picture 400 wide and 300 high: all of it is in view, and its middle is its middle
  assert.ok(visibleCentre(square, 0, 4, 400, 300, undefined, out));
  assert.ok(Math.abs(out.x - 150) < 1 && Math.abs(out.y - 150) < 1);
  // a tall figure from far above the picture to y = 80: only the part below y = 0 counts
  const tall = [50, -1000, 50, 80];
  assert.ok(visibleCentre(tall, 0, 1, 400, 300, undefined, out));
  assert.ok(out.y >= 0 && out.y <= 80, `the middle is in view: ${out.y}`);
  // a figure wholly off the picture is not in view
  assert.equal(visibleCentre([-50, 10, -10, 20], 0, 1, 400, 300, undefined, out), false);
  // the left side of the square under a body: the middle moves to the right
  assert.ok(visibleCentre(square, 0, 4, 400, 300, (x) => x < 120, out));
  assert.ok(out.x > 150, `the covered part counts for nothing: ${out.x}`);
});

test("a box goes at the point, or the nearest place that is free, inside the picture", () => {
  const out = { x: 0, y: 0 };
  assert.ok(placeBox(200, 150, 80, 14, 400, 300, () => true, out));
  assert.deepEqual(out, { x: 200, y: 150 });
  // the point is taken: the box stands beside or above or below it
  assert.ok(placeBox(200, 150, 80, 14, 400, 300, (l, t, r, b) => !(l < 215 && r > 185 && t < 160 && b > 140), out));
  assert.ok(out.x !== 200 || out.y !== 150);
  // at the edge it is held inside the picture
  assert.ok(placeBox(5, 5, 80, 14, 400, 300, () => true, out));
  assert.ok(out.x - 40 >= 0 && out.y - 7 >= 0);
  // nowhere free
  assert.equal(placeBox(200, 150, 80, 14, 400, 300, () => false, out), false);
});
