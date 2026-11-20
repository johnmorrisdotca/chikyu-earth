// The attributes that put a ride's compass in a corner: what they read, and that a bad value is the default (top-left, 8 pixels in).
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPASS_OFFSET, COMPASS_PLACE, readCompassOffset, readCompassPlace } from "../src/space/index.ts";

test("the default is where the compass always was: top-left, 8 pixels in from both sides", () => {
  assert.equal(COMPASS_PLACE, "top-left");
  assert.deepEqual(COMPASS_OFFSET, { x: 8, y: 8 });
  assert.equal(readCompassPlace(null), "top-left");
  assert.deepEqual(readCompassOffset(null), { x: 8, y: 8 });
});

test("compass-place reads the four corners, in any case and with spaces round them", () => {
  for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"] as const) {
    assert.equal(readCompassPlace(corner), corner);
    assert.equal(readCompassPlace(` ${corner.toUpperCase()} `), corner);
  }
});

test("compass-place falls back to the top-left corner for anything else", () => {
  for (const bad of ["", " ", "middle", "top", "right", "left-top", "top left", "topleft", "top-right bottom-left", "1", "null"]) assert.equal(readCompassPlace(bad), "top-left", JSON.stringify(bad));
});

test("compass-offset reads x,y, with a space or spaces round the comma, px after a number, and one number for both", () => {
  assert.deepEqual(readCompassOffset("16,96"), { x: 16, y: 96 });
  assert.deepEqual(readCompassOffset(" 16 , 96 "), { x: 16, y: 96 });
  assert.deepEqual(readCompassOffset("16 96"), { x: 16, y: 96 });
  assert.deepEqual(readCompassOffset("16px,96px"), { x: 16, y: 96 });
  assert.deepEqual(readCompassOffset("0,0"), { x: 0, y: 0 });
  assert.deepEqual(readCompassOffset("12.5,4"), { x: 12.5, y: 4 });
  assert.deepEqual(readCompassOffset("20"), { x: 20, y: 20 });
});

test("compass-offset falls back to 8,8 for anything that is not two numbers of 0 or more", () => {
  for (const bad of ["", " ", "x", "16,", ",96", "16,x", "-4,10", "10,-4", "1,2,3", "NaN", "Infinity", "1e3,1", "16%,96", "16em,1", "0x10,1"]) assert.deepEqual(readCompassOffset(bad), { x: 8, y: 8 }, JSON.stringify(bad));
});

test("the default is a copy: changing what a read returns does not change the default", () => {
  const read = readCompassOffset("bad");
  read.x = 99;
  assert.deepEqual(readCompassOffset("bad"), { x: 8, y: 8 });
  assert.deepEqual(COMPASS_OFFSET, { x: 8, y: 8 });
});
