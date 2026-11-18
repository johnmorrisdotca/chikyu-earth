import test from "node:test";
import assert from "node:assert/strict";
import { descentFloorKm, FLY_FLOOR_KM, FLY_HEIGHT_KM, flyAcrossMs, flyAim, flyAt, flyDistance, flyDownMs, flyLonLat, flyStateAt, flyStill, planFly, type FlyPlan } from "../src/space/index.ts";

const TOKYO = flyAim(139.69, 35.69);
const LONDON = flyAim(-0.13, 51.51);
const LIMA = flyAim(-77.04, -12.05);
const angle = (p: number[], q: number[]): number => Math.acos(Math.max(-1, Math.min(1, p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!)));
const near = (p: number[], q: number[], degrees = 1e-6): void => assert.ok(angle(p, q) < (degrees * Math.PI) / 180, `${angle(p, q)} rad apart`);

/** The speed of the point under the camera and of the height at a moment, read from either side of it, and the largest step between frames 1 ms apart: the move has no jump or stop. */
function across(first: FlyPlan, second: FlyPlan, at: number): { before: number; after: number; hBefore: number; hAfter: number; turn: number } {
  const dt = 1;
  const before = angle(flyAt(first, at - dt).aim, flyAt(first, at).aim) / dt;
  const after = angle(flyAt(second, at).aim, flyAt(second, at + dt).aim) / dt;
  const hBefore = (Math.log(flyAt(first, at).heightKm) - Math.log(flyAt(first, at - dt).heightKm)) / dt;
  const hAfter = (Math.log(flyAt(second, at + dt).heightKm) - Math.log(flyAt(second, at).heightKm)) / dt;
  // the way the point is going, before and after: the angle between the two steps
  const a = flyAt(first, at - dt).aim;
  const b = flyAt(first, at).aim;
  const c = flyAt(second, at + dt).aim;
  const d1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const d2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const turn = Math.acos(Math.max(-1, Math.min(1, (d1[0]! * d2[0]! + d1[1]! * d2[1]! + d1[2]! * d2[2]!) / (Math.hypot(...d1) * Math.hypot(...d2)))));
  return { before, after, hBefore, hAfter, turn };
}

test("a fly-to goes across at the height it has, then down to the height asked for, and ends over the place", () => {
  const plan = planFly(flyStill(flyAim(0, 0), 20_000), TOKYO, { at: 0, heightKm: 30 });
  assert.equal(plan.across, flyAcrossMs(angle(flyAim(0, 0), TOKYO)));
  // across: the height stays
  for (let t = 0; t <= plan.across; t += 50) assert.ok(Math.abs(flyAt(plan, t).heightKm - 20_000) < 1e-6, `height at ${t}`);
  near(flyAt(plan, plan.across).aim, TOKYO);
  // down: the place stays below, the height falls the whole way and never goes back up
  let last = Infinity;
  for (let t = plan.across; t <= plan.end; t += 25) {
    const at = flyAt(plan, t);
    near(at.aim, TOKYO);
    assert.ok(at.heightKm <= last + 1e-9, `height rises at ${t}`);
    last = at.heightKm;
  }
  assert.ok(Math.abs(flyAt(plan, plan.end).heightKm - 30) < 1e-9);
  assert.ok(Math.abs(plan.end - plan.across - flyDownMs(20_000, 30)) < 1e-6);
  const end = flyLonLat(flyAt(plan, plan.end + 1000).aim);
  assert.ok(Math.abs(end.lon - 139.69) < 1e-9 && Math.abs(end.lat - 35.69) < 1e-9);
});

test("the turn across is a great circle when it starts from rest", () => {
  const plan = planFly(flyStill(TOKYO, 1000), LONDON, { at: 0, phase: "across" });
  const whole = angle(TOKYO, LONDON);
  for (let t = 0; t <= plan.end; t += 100) {
    const at = flyAt(plan, t).aim;
    assert.ok(Math.abs(angle(TOKYO, at) + angle(at, LONDON) - whole) < 1e-9, `off the great circle at ${t}`);
  }
  assert.equal(plan.lifts.length, 0);
  assert.ok(Math.abs(flyAt(plan, 500).heightKm - 1000) < 1e-9);
});

test("a new place mid-turn bends the running turn: the same speed and way on, no jump, no stop, and it ends at the new place", () => {
  const start = flyStill(flyAim(0, 0), 20_000);
  const toTokyo = planFly(start, TOKYO, { at: 0, phase: "across" });
  const at = toTokyo.across * 0.4;
  const toLondon = planFly(flyStateAt(toTokyo, at), LONDON, { at, phase: "across" });
  const seen = across(toTokyo, toLondon, at);
  assert.ok(seen.before > 1e-5, "the turn was moving");
  assert.ok(Math.abs(seen.after - seen.before) / seen.before < 0.01, `speed ${seen.before} then ${seen.after}`);
  assert.ok(seen.turn < 0.01, `the way it goes turns by ${seen.turn} rad in a millisecond`);
  // no frame of 1 ms in which it stops or jumps, and it ends over London
  let least = Infinity;
  let most = 0;
  for (let t = at; t < toLondon.end - 200; t += 1) {
    const step = angle(flyAt(toLondon, t).aim, flyAt(toLondon, t + 1).aim);
    least = Math.min(least, step);
    most = Math.max(most, step);
  }
  assert.ok(least > 0, "it never stops before it is nearly there");
  assert.ok(most < 0.002, `the largest step in a millisecond is ${most} rad`);
  near(flyAt(toLondon, toLondon.end).aim, LONDON);
  assert.equal(flyStateAt(toLondon, toLondon.end + 10).hv, 0);
});

test("a new fly-to mid-descent blends the height and the turn: the height slows without turning back, then comes down over the new place", () => {
  const toTokyo = planFly(flyStill(flyAim(0, 0), 20_000), TOKYO, { at: 0, heightKm: 30 });
  const at = toTokyo.across + (toTokyo.end - toTokyo.across) * 0.3;
  const now = flyStateAt(toTokyo, at);
  assert.ok(now.hv < 0, "it was coming down");
  const toLima = planFly(now, LIMA, { at, heightKm: 30 });
  const seen = across(toTokyo, toLima, at);
  assert.ok(Math.abs(seen.hAfter - seen.hBefore) / Math.abs(seen.hBefore) < 0.01, `the height's speed ${seen.hBefore} then ${seen.hAfter}`);
  // the height comes to rest without going back up, while the turn sets off from rest
  const rest = flyAt(toLima, toLima.across).heightKm;
  let last = Infinity;
  for (let t = at; t <= toLima.across; t += 10) {
    const h = flyAt(toLima, t).heightKm;
    assert.ok(h <= last + 1e-9, `the height turns back at ${t}`);
    last = h;
  }
  assert.ok(rest < flyAt(toTokyo, at).heightKm && rest > 30);
  assert.ok(angle(flyAt(toLima, at).aim, flyAt(toLima, at + 1).aim) < 1e-6, "the turn starts from rest, as the descent had it");
  near(flyAt(toLima, toLima.end).aim, LIMA);
  assert.ok(Math.abs(flyAt(toLima, toLima.end).heightKm - 30) < 1e-9);
});

test("down alone carries a moving height on into the new descent, and up works too", () => {
  const plan = planFly(flyStill(TOKYO, 10_000), TOKYO, { at: 0, phase: "down", heightKm: 100 });
  assert.equal(plan.across, 0);
  const mid = plan.end / 2;
  const again = planFly(flyStateAt(plan, mid), TOKYO, { at: mid, phase: "down", heightKm: 50 });
  const seen = across(plan, again, mid);
  assert.ok(Math.abs(seen.hAfter - seen.hBefore) / Math.abs(seen.hBefore) < 0.01);
  assert.ok(Math.abs(flyAt(again, again.end).heightKm - 50) < 1e-9);
  const up = planFly(flyStill(TOKYO, 30), TOKYO, { at: 0, phase: "down", heightKm: 1000 });
  assert.ok(Math.abs(flyAt(up, up.end).heightKm - 1000) < 1e-9);
});

test("the far side of the Earth, the same place, and a long way at speed stay finite", () => {
  const opposite = planFly(flyStill(flyAim(0, 0), 1000), flyAim(180, 0), { at: 0, phase: "across" });
  near(flyAt(opposite, opposite.end).aim, flyAim(180, 0));
  for (let t = 0; t <= opposite.end; t += 50) assert.ok(flyAt(opposite, t).aim.every(Number.isFinite));
  const same = planFly(flyStill(TOKYO, 1000), TOKYO, { at: 5, phase: "across" });
  assert.equal(same.end, 5);
  assert.deepEqual(flyAt(same, 5).aim.map((n) => Math.round(n * 1e9)), TOKYO.map((n) => Math.round(n * 1e9)));
});

test("the floor: all the way down over land with finer pictures, the package's own sharp height elsewhere", () => {
  assert.equal(descentFloorKm({ finer: true, land: true, lat: 35 }), null);
  assert.equal(descentFloorKm({ finer: false, land: true, lat: 35 }), FLY_FLOOR_KM);
  assert.equal(descentFloorKm({ finer: true, land: false, lat: 35 }), FLY_FLOOR_KM);
  assert.equal(descentFloorKm({ finer: true, land: true, lat: -75 }), FLY_FLOOR_KM, "Antarctica");
  assert.equal(descentFloorKm({ finer: true, land: true, lat: 82 }), FLY_FLOOR_KM, "the far north");
  assert.equal(FLY_HEIGHT_KM, 30);
  assert.equal(flyDistance(0), 1);
});
