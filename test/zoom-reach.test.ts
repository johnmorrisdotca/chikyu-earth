// How far the realistic Earth zooms once its tiles are found: the arithmetic, that it is only raised, and that a page's own zoom-max wins.
import assert from "node:assert/strict";
import test from "node:test";
import { mayWriteZoomMax, raisedZoomMax, tilesZoomMax } from "../src/realistic/zoom-reach.ts";

test("the limit is as many times 5 as the finest day level is wider than 4096: 20 to level 4, 40 to level 5, and 5 where there is no day layer", () => {
  assert.equal(tilesZoomMax({ day: 8192 }), "10");
  assert.equal(tilesZoomMax({ day: 16384 }), "20");
  assert.equal(tilesZoomMax({ day: 32768 }), "40");
  assert.equal(tilesZoomMax({ day: 65536 }), "80");
  assert.equal(tilesZoomMax({ night: 16384 }), "5");
  assert.equal(tilesZoomMax({}), "5");
  assert.equal(tilesZoomMax({ day: 2048 }), "5", "never below the pictures' own limit");
  assert.equal(tilesZoomMax({ day: 32768, night: 16384 }), "40", "the night layer does not set it");
});

test("the limit is only raised by a later set: one with fewer levels does not lower it", () => {
  assert.equal(raisedZoomMax(null, { day: 16384 }), "20");
  assert.equal(raisedZoomMax("20", { day: 32768 }), "40");
  assert.equal(raisedZoomMax("40", { day: 16384 }), "40");
  assert.equal(raisedZoomMax("40", {}), "40");
  assert.equal(raisedZoomMax("40", { day: 32768 }), "40");
});

test("a zoom-max the page set is never overwritten, and the one the element wrote is its own to change", () => {
  assert.equal(mayWriteZoomMax(null, null), true, "none set");
  assert.equal(mayWriteZoomMax("20", "20"), true, "the element's own");
  assert.equal(mayWriteZoomMax("8", null), false, "a page's, before the element wrote any");
  assert.equal(mayWriteZoomMax("8", "20"), false, "a page's, after the element wrote one");
  assert.equal(mayWriteZoomMax("40", "20"), false, "a page's that happens to be larger");
});
