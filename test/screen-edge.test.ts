import test from "node:test";
import assert from "node:assert/strict";
import { edgeBeyondCamera, screenEdge } from "../src/space/satellite-layer.ts";

test("a point inside the picture is not past an edge, and a corner takes the side it passes by more", () => {
  assert.equal(screenEdge(10, 10, 100, 80), null);
  assert.equal(screenEdge(0, 0, 100, 80), null);
  assert.equal(screenEdge(100, 80, 100, 80), null);
  assert.equal(screenEdge(-4, 10, 100, 80), "left");
  assert.equal(screenEdge(130, 10, 100, 80), "right");
  assert.equal(screenEdge(10, -3, 100, 80), "top");
  assert.equal(screenEdge(10, 90, 100, 80), "bottom");
  assert.equal(screenEdge(-2, -30, 100, 80), "top");
  assert.equal(screenEdge(140, 90, 100, 80), "right");
});

test("behind the camera, the edge follows the camera's own axes, up being the top", () => {
  assert.equal(edgeBeyondCamera(2, 0.2), "right");
  assert.equal(edgeBeyondCamera(-3, 1), "left");
  assert.equal(edgeBeyondCamera(0.2, 4), "top");
  assert.equal(edgeBeyondCamera(-0.2, -4), "bottom");
});
