import test from "node:test";
import assert from "node:assert/strict";
import { centreRotation, DEGREES_PER_MS, rotationAt, SIDEREAL_DAY_MS, spinAt } from "../src/rotate.ts";

test("one sidereal day is a full turn", () => {
  assert.equal(spinAt(0), 0);
  assert.equal(spinAt(SIDEREAL_DAY_MS), 360);
  assert.equal(DEGREES_PER_MS * SIDEREAL_DAY_MS, 360);
});

test("half a sidereal day is half a turn", () => {
  assert.ok(Math.abs(spinAt(SIDEREAL_DAY_MS / 2) - 180) < 1e-9);
});

test("centring is the negative of the point", () => {
  assert.deepEqual(centreRotation({ lon: 139.7, lat: 35.7 }), [-139.7, -35.7]);
});

test("a centred globe starts centred and keeps turning at the Earth's rate", () => {
  const centre = { lon: 139.7, lat: 35.7 };
  const start = 1_000_000;
  assert.deepEqual(rotationAt(centre, start, start), [-139.7, -35.7]);
  const later = rotationAt(centre, start + SIDEREAL_DAY_MS, start);
  assert.ok(Math.abs(later[0] - (-139.7 + 360)) < 1e-9);
  assert.equal(later[1], -35.7);
});
