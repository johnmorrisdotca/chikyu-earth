import test from "node:test";
import assert from "node:assert/strict";
import { followSpin, groundLongitude, retargetFollow } from "../src/space/follow.ts";

const lon = (anchor: number, spin: number, follow: number, yaw = 0, centre = 20): number => groundLongitude(anchor, spin, follow, centre, yaw);

test("the longitude under the middle is the same after a change of follow, at three shares, with time running either way", () => {
  let anchor = 10;
  let follow = 0;
  let yaw = 4;
  const centre = -100;
  for (const spin of [40, 40 + 15, 40 + 15 - 40]) {
    const before = lon(anchor, spin, follow, yaw, centre);
    for (const to of [0.25, 1, 0.6]) {
      const turned = retargetFollow(anchor, spin, follow, to, yaw);
      const after = lon(turned.anchor, spin, to, turned.yaw, centre);
      assert.ok(Math.abs((((after - before) % 360) + 540) % 360 - 180) < 1e-6, `follow ${follow} to ${to} at spin ${spin}: ${before} then ${after}`);
      anchor = turned.anchor;
      yaw = turned.yaw;
      follow = to;
    }
  }
});

test("0 holds the stars and 1 turns with the Earth", () => {
  assert.equal(followSpin(10, 40, 0), 10);
  assert.equal(followSpin(10, 40, 1), 40);
  assert.equal(followSpin(10, 40, 0.5), 25);
  const held = lon(10, 40, 0) - lon(10, 70, 0);
  assert.equal(held, 30, "with the stars held, the ground moves by the Earth's turn");
  assert.equal(lon(10, 40, 1, 0, 20), lon(10, 70, 1, 0, 20), "turning with the Earth, the ground stays");
});
