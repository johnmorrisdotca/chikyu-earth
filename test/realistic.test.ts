import test from "node:test";
import assert from "node:assert/strict";
import { subsolarPoint, unitVector } from "../src/realistic/sun.ts";
import { chooseTier, textureBytes, textureCap, TIERS } from "../src/realistic/tiers.ts";
import { createGate, frameCap, type Timers } from "../src/realistic/gate.ts";

const near = (actual: number, expected: number, tolerance: number, what: string): void =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);

test("the Sun's declination follows the seasons", () => {
  near(subsolarPoint(Date.UTC(2026, 2, 20, 14, 46)).lat, 0, 0.06, "March equinox 2026 (14:46 UTC)");
  near(subsolarPoint(Date.UTC(2026, 5, 21, 8, 24)).lat, 23.44, 0.05, "June solstice 2026");
  near(subsolarPoint(Date.UTC(2026, 11, 21, 20, 50)).lat, -23.44, 0.05, "December solstice 2026");
  near(subsolarPoint(Date.UTC(2000, 0, 1, 12)).lat, -23.03, 0.05, "J2000");
  near(subsolarPoint(Date.UTC(2026, 10, 2, 12)).lat, -14.8, 0.2, "2 November 2026");
});

test("the Sun is over Greenwich near noon UTC, a few degrees off by the equation of time", () => {
  near(subsolarPoint(Date.UTC(2000, 0, 1, 12)).lon, 0.9, 0.1, "1 January, the sun runs 3.5 minutes slow");
  near(subsolarPoint(Date.UTC(2026, 10, 2, 12)).lon, -4.1, 0.2, "2 November, the sun runs 16.4 minutes fast");
  near(subsolarPoint(Date.UTC(2026, 5, 21, 12)).lon, 0.45, 0.2, "21 June, 1.8 minutes slow");
});

test("the subsolar point runs west 15 degrees an hour", () => {
  const a = subsolarPoint(Date.UTC(2026, 3, 1, 6));
  const b = subsolarPoint(Date.UTC(2026, 3, 1, 7));
  near(a.lon - b.lon, 15.0, 0.05, "one hour");
  assert.ok(b.lon >= -180 && b.lon <= 180);
});

test("a point is a unit vector with +z at longitude 0 and +y at the north pole", () => {
  assert.deepEqual(unitVector({ lon: 0, lat: 0 }).map((n) => Math.round(n)), [0, 0, 1]);
  assert.deepEqual(unitVector({ lon: 90, lat: 0 }).map((n) => Math.round(n)), [1, 0, 0]);
  assert.deepEqual(unitVector({ lon: 0, lat: 90 }).map((n) => Math.round(n)), [0, 1, 0]);
  const [x, y, z] = unitVector({ lon: 40, lat: -25 });
  near(Math.hypot(x, y, z), 1, 1e-12, "length");
});

test("a texture width grows with the disc and stops at the cap", () => {
  assert.equal(chooseTier("day", 100), 1024);
  assert.equal(chooseTier("day", 420), 2048);
  assert.equal(chooseTier("day", 900), 4096);
  assert.equal(chooseTier("day", 5000), 4096);
  assert.equal(chooseTier("day", 5000, 2048), 2048);
  assert.equal(chooseTier("night", 5000), 2048);
  assert.equal(chooseTier("day", 5000, 100), 1024, "never under the smallest shipped width");
  for (const widths of Object.values(TIERS)) assert.ok(widths.every((width) => width <= 4096));
});

test("the texture cap takes the lowest of the option, the GPU and a small device", () => {
  assert.equal(textureCap(), 4096);
  assert.equal(textureCap({ gpuMax: 2048 }), 2048);
  assert.equal(textureCap({ max: 1024 }), 1024);
  assert.equal(textureCap({ deviceMemory: 2 }), 2048);
  assert.equal(textureCap({ deviceMemory: 8 }), 4096);
  assert.ok(textureBytes(4096) < 48 * 1024 * 1024);
});

test("the gate runs at once, then at most once every minMs, and never loses the last ask", () => {
  let now = 0;
  const timers: { at: number; run: () => void }[] = [];
  const clock: Timers = {
    set: (run, ms) => {
      const timer = { at: now + ms, run };
      timers.push(timer);
      return timer;
    },
    clear: (handle) => timers.splice(timers.indexOf(handle as (typeof timers)[number]), 1),
    now: () => now,
  };
  const ran: number[] = [];
  const gate = createGate(33, () => ran.push(now), clock);
  gate.request();
  assert.deepEqual(ran, [0]);
  now = 10;
  gate.request();
  gate.request();
  assert.deepEqual(ran, [0], "inside the gap the ask waits");
  assert.equal(timers.length, 1, "and the asks make one timer");
  now = 33;
  timers.shift()!.run();
  assert.deepEqual(ran, [0, 33]);
  now = 100;
  gate.request();
  assert.deepEqual(ran, [0, 33, 100]);
  now = 101;
  gate.request();
  gate.cancel();
  assert.equal(timers.length, 0);
  gate.setMinMs(1000);
  now = 150;
  gate.request();
  assert.equal(timers.length, 1);
});

test("the frame cap is 30, lower on a small device", () => {
  assert.equal(frameCap(), 30);
  assert.equal(frameCap(60), 60);
  assert.equal(frameCap(30, { deviceMemory: 2 }), 20);
  assert.equal(frameCap(30, { hardwareConcurrency: 2 }), 20);
  assert.equal(frameCap(10, { deviceMemory: 1 }), 10);
});

test("asks made in one task are one draw, made when the task ends", async () => {
  let now = 0;
  const timers: { run: () => void }[] = [];
  const clock: Timers = {
    set: (callback) => {
      const handle = { run: callback };
      timers.push(handle);
      return handle;
    },
    clear: () => undefined,
    now: () => now,
  };
  const ran: number[] = [];
  const gate = createGate(33, () => ran.push(now), clock);
  gate.soon();
  gate.soon();
  gate.soon();
  assert.deepEqual(ran, [], "nothing runs inside the task");
  await Promise.resolve();
  assert.deepEqual(ran, [0], "one run when the task ends");
  assert.equal(timers.length, 0, "and no second one waiting");
  now = 10;
  gate.soon();
  gate.soon();
  await Promise.resolve();
  assert.equal(timers.length, 1, "inside the gap the one ask waits");
});
