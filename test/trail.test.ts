import test from "node:test";
import assert from "node:assert/strict";
import { createTrailBuilder, TRAIL_DEFAULT_ORBITS, TRAIL_MAX_ORBITS, TRAIL_MAX_POINTS, TRAIL_POINTS_PER_ORBIT, trailOrbits } from "../src/space/trail.ts";

const PERIOD = 5_400_000;
/** A satellite going round the equator once in 90 minutes, 7 per cent above the surface. */
const circle = (ms: number, out: Float64Array): boolean => {
  const a = (ms / PERIOD) * 2 * Math.PI;
  out[0] = 1.07 * Math.cos(a);
  out[1] = 0;
  out[2] = -1.07 * Math.sin(a);
  return true;
};
const angleOf = (out: Float32Array, k: number): number => Math.atan2(-out[k * 3 + 2]!, out[k * 3]!);

test("the trail runs back N orbits from the satellite, oldest first, in steps of a ninety-sixth of an orbit, and ends at the satellite itself", () => {
  const builder = createTrailBuilder();
  const out = new Float32Array(TRAIL_MAX_POINTS * 3);
  const now = 10 * PERIOD + 1_234_567;
  for (const orbits of [1, 3, 20]) {
    const n = builder.build(circle, PERIOD, orbits, now, out);
    assert.ok(Math.abs(n - (orbits * TRAIL_POINTS_PER_ORBIT + 1)) <= 1, `${orbits} orbits: ${n} points`);
    const live = new Float64Array(6);
    circle(now, live);
    for (let c = 0; c < 3; c += 1) assert.ok(Math.abs(out[(n - 1) * 3 + c]! - live[c]!) < 1e-6, "the last point is the satellite");
    // oldest first: the angle goes forward, and the whole trail is `orbits` turns (to within a step)
    let turned = 0;
    for (let k = 1; k < n; k += 1) {
      let d = angleOf(out, k) - angleOf(out, k - 1);
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      assert.ok(d >= 0, "forwards");
      turned += d;
    }
    assert.ok(Math.abs(turned - orbits * 2 * Math.PI) < (2 * Math.PI) / TRAIL_POINTS_PER_ORBIT * 1.01, `${orbits} orbits turned ${(turned / (2 * Math.PI)).toFixed(3)}`);
  }
  assert.ok(TRAIL_MAX_POINTS >= TRAIL_MAX_ORBITS * TRAIL_POINTS_PER_ORBIT + 1);
});

test("the points of the past are kept: a frame later costs the satellite's own place and the points that have come into the window, not the whole trail", () => {
  const builder = createTrailBuilder();
  const out = new Float32Array(TRAIL_MAX_POINTS * 3);
  const now = 10 * PERIOD;
  builder.build(circle, PERIOD, 3, now, out);
  const first = builder.calls;
  assert.ok(first > 140, `${first} calls to start`);
  builder.build(circle, PERIOD, 3, now + 1000, out);
  assert.ok(builder.calls - first <= 2, `${builder.calls - first} calls a frame at real time`);
  const again = builder.calls;
  builder.build(circle, PERIOD, 3, now + 1000, out);
  assert.equal(builder.calls - again, 1, "the same moment again: only the satellite's own place");
  // a longer window fetches only what is new at its old end
  const before = builder.calls;
  builder.build(circle, PERIOD, 4, now + 1000, out);
  assert.ok(builder.calls - before <= TRAIL_POINTS_PER_ORBIT + 3, `${builder.calls - before} calls for one more orbit`);
});

test("a trail is shorter where the satellite was not placed, none when it is not placed now, and a new period or a reset starts again", () => {
  const builder = createTrailBuilder();
  const out = new Float32Array(TRAIL_MAX_POINTS * 3);
  const launched = 9 * PERIOD;
  const young = (ms: number, o: Float64Array): boolean => ms >= launched && circle(ms, o);
  const now = 10 * PERIOD;
  const n = builder.build(young, PERIOD, 3, now, out);
  assert.ok(Math.abs(n - (TRAIL_POINTS_PER_ORBIT + 1)) <= 1, `${n} points since the launch, 1 orbit of the 3 asked`);
  assert.equal(builder.build(young, PERIOD, 3, 5 * PERIOD, out), 0, "not placed now: no trail");
  assert.equal(builder.build(circle, 0, 3, now, out), 0, "no period");
  assert.equal(builder.build(circle, PERIOD, 0, now, out), 0, "no orbits");
  const calls = builder.calls;
  builder.reset();
  builder.build(circle, PERIOD, 3, now, out);
  assert.ok(builder.calls - calls > 140, "a reset asks again for every point");
});

test("a changed period starts the kept points again: nothing kept for another step is reused", () => {
  const worn = createTrailBuilder();
  const out = new Float32Array(TRAIL_MAX_POINTS * 3);
  const fresh = new Float32Array(TRAIL_MAX_POINTS * 3);
  worn.build(circle, PERIOD, 3, 10 * PERIOD, out);
  const n = worn.build(circle, PERIOD * 1.7, 3, 10 * PERIOD + 5000, out);
  const m = createTrailBuilder().build(circle, PERIOD * 1.7, 3, 10 * PERIOD + 5000, fresh);
  assert.equal(n, m);
  assert.deepEqual(out.subarray(0, n * 3), fresh.subarray(0, m * 3));
});

test("the number of orbits is read as 0.25 to 20, and 3 when it is not a number", () => {
  assert.equal(trailOrbits(5), 5);
  assert.equal(trailOrbits("7"), 7);
  assert.equal(trailOrbits(100), TRAIL_MAX_ORBITS);
  assert.equal(trailOrbits(0.01), 0.25);
  for (const bad of [undefined, null, "x", Number.NaN, -2, 0, {}]) assert.equal(trailOrbits(bad), TRAIL_DEFAULT_ORBITS);
});

test("building a trail makes no array", () => {
  const builder = createTrailBuilder();
  const out = new Float32Array(TRAIL_MAX_POINTS * 3);
  builder.build(circle, PERIOD, 20, 10 * PERIOD, out);
  const heap = process.memoryUsage().heapUsed;
  for (let i = 0; i < 2000; i += 1) builder.build(circle, PERIOD, 20, 10 * PERIOD + i * 16, out);
  assert.ok(process.memoryUsage().heapUsed - heap < 8_000_000);
});
