import test from "node:test";
import assert from "node:assert/strict";
import { HOME_VIEW, projectionView } from "../src/view.ts";

const home = { lon: -73.9857, lat: 40.7484 };

test("the home view is the starting centre, upright and unzoomed", () => {
  assert.deepEqual(HOME_VIEW, { yaw: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 });
  assert.deepEqual(projectionView(home, 420), {
    rotation: [73.9857, -40.7484],
    scale: 209,
    translate: [210, 210],
  });
});

test("yaw turns longitude west and tilt tips latitude south from the home centre, so a drag right or up moves the ground right or up", () => {
  const view = projectionView(home, 420, { ...HOME_VIEW, yaw: 45, tilt: 20 });
  assert.deepEqual(view.rotation, [73.9857 + 45, -40.7484 + 20]);
});

test("zoom scales the globe and pan moves it in CSS pixels", () => {
  const view = projectionView(home, 420, { yaw: 0, tilt: 0, zoom: 2, panX: 15, panY: -10 });
  assert.equal(view.scale, 418);
  assert.deepEqual(view.translate, [225, 200]);
});
