// How often a running clock draws (src/realistic/pace.ts): half a pixel of the quickest thing's travel between frames, between a floor and a cap, and what a satellite group says of its own speed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { framesPerSecond, readSmoothFps, smoothCap, SMOOTH_FPS, waitFor, watchLowBattery } from "../src/realistic/pace.ts";
import { smallDevice } from "../src/realistic/gate.ts";

const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("a frame each time the quickest thing has moved half a pixel: twice its pixels a second", () => {
  near(framesPerSecond({ pixelsPerSecond: 3, speed: 1, cap: 15, always: true }), 6, 1e-9, "3 px a second");
  near(framesPerSecond({ pixelsPerSecond: 0.9, speed: 1, cap: 15, always: true }), 1.8, 1e-9, "0.9 px a second");
});

test("at least one a second while a satellite or a ride moves, and never more than the cap", () => {
  assert.equal(framesPerSecond({ pixelsPerSecond: 0.3, speed: 1, cap: 15, always: true }), 1);
  assert.equal(framesPerSecond({ pixelsPerSecond: 0, speed: 1, cap: 15, always: true }), 1);
  assert.equal(framesPerSecond({ pixelsPerSecond: 400, speed: 1, cap: 15, always: true }), 15);
  // real time is strictly capped, even when a pixel a frame would be more
  assert.equal(framesPerSecond({ pixelsPerSecond: 20, speed: 1, cap: 15, always: true }), 15);
});

test("the Earth's turn alone is drawn as seldom as it moves: under once a second, and a minute at most when nothing moves", () => {
  const slow = framesPerSecond({ pixelsPerSecond: 0.02, speed: 1, cap: 15 });
  assert.ok(slow < 0.1, `${slow}`);
  assert.equal(framesPerSecond({ pixelsPerSecond: 0, speed: 1, cap: 15 }), 0);
  assert.equal(waitFor(slow, 60_000), 1000 / slow);
  assert.equal(waitFor(0, 60_000), 60_000);
  assert.equal(waitFor(0.001, 60_000), 60_000);
  assert.equal(waitFor(15, 60_000), 1000 / 15);
  // zoomed in, the same turn moves pixels and is drawn up to the cap
  assert.equal(framesPerSecond({ pixelsPerSecond: 30, speed: 1, cap: 15 }), 15);
});

test("reduced motion keeps one a second, and no more, however fast things move", () => {
  assert.equal(framesPerSecond({ pixelsPerSecond: 50, speed: 1, cap: 15, always: true, reduced: true }), 1);
  assert.equal(framesPerSecond({ pixelsPerSecond: 0.1, speed: 1, cap: 15, always: true, reduced: true }), 1);
  assert.ok(framesPerSecond({ pixelsPerSecond: 0.1, speed: 1, cap: 15, reduced: true }) <= 1);
});

test("faster than real time is never drawn less often than it was: a frame for each pixel, or the half pixel rule if that is more often", () => {
  // 60 times real time, a satellite moving 18 pixels a second: as often as a pixel (18), not held to the cap of 15
  assert.equal(framesPerSecond({ pixelsPerSecond: 18, speed: 60, cap: 15, always: true }), 18);
  assert.equal(framesPerSecond({ pixelsPerSecond: 4, speed: 10, cap: 15, always: true }), 8);
  assert.equal(framesPerSecond({ pixelsPerSecond: 400, speed: 60, cap: 15, always: true }), 30);
});

test("above 60 times real time the rule is as it was: a frame for each pixel, 1 to 30 a second, whatever the cap", () => {
  assert.equal(framesPerSecond({ pixelsPerSecond: 12, speed: 3600, cap: 15 }), 12);
  assert.equal(framesPerSecond({ pixelsPerSecond: 100, speed: 3600, cap: 15 }), 30);
  assert.equal(framesPerSecond({ pixelsPerSecond: 0.2, speed: 3600, cap: 15 }), 1);
  assert.equal(framesPerSecond({ pixelsPerSecond: 12, speed: -3600, cap: 15 }), 12);
});

test("smooth-fps: 15 by default, 1 to 30, and half of it on a small device or a low battery", () => {
  assert.equal(SMOOTH_FPS, 15);
  assert.equal(readSmoothFps(null), 15);
  assert.equal(readSmoothFps(""), 15);
  assert.equal(readSmoothFps("many"), 15);
  assert.equal(readSmoothFps("24"), 24);
  assert.equal(readSmoothFps("500"), 30);
  assert.equal(readSmoothFps("0"), 1);
  assert.equal(smoothCap(15, false), 15);
  assert.equal(smoothCap(15, true), 8);
  assert.equal(smoothCap(1, true), 1);
  assert.equal(smallDevice({ deviceMemory: 2 }), true);
  assert.equal(smallDevice({ hardwareConcurrency: 8, deviceMemory: 8 }), false);
  assert.equal(smallDevice({}), false);
});

test("a low battery is told once, and a browser without the battery API or a refusal says nothing", async () => {
  const told: boolean[] = [];
  watchLowBattery({ getBattery: async () => ({ charging: false, level: 0.15 }) }, (low) => told.push(low));
  watchLowBattery({ getBattery: async () => ({ charging: true, level: 0.15 }) }, (low) => told.push(low));
  watchLowBattery({ getBattery: async () => ({ charging: false, level: 0.8 }) }, (low) => told.push(low));
  watchLowBattery({ getBattery: async () => Promise.reject(new Error("no")) }, (low) => told.push(low));
  watchLowBattery({}, (low) => told.push(low));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(told, [true]);
});

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("./recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Snapshot;
const setsOf = (group: string): ElementSet[] => snapshot.groups[group]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);
const stations = setsOf("stations");
const ISS_EPOCH = Date.parse(`${stations.find((set) => set.NORAD_CAT_ID === 25544)!.EPOCH}Z`);

test("a group says how fast its quickest satellite goes from the places it already holds: about a low orbit's 0.0012 Earth radii a second", () => {
  const group = createSatellites(stations);
  assert.equal(group.fastest, 0);
  const out = new Float32Array(group.count * 3);
  group.at(ISS_EPOCH + 3_600_000, out);
  // 7.66 km/s over 6,371 km, to a few per cent (a chord of the orbit, and the quickest of the stations)
  near(group.fastest, 7.66 / 6371, 0.0001, "Earth radii a second");
  const first = group.fastest;
  // the frames in between change nothing and cost no pass over the group
  for (let frame = 1; frame < 20; frame += 1) group.at(ISS_EPOCH + 3_600_000 + frame * 33, out);
  assert.equal(group.fastest, first);
  // a longer step between the samples is a longer chord, and the same speed to a hair
  group.setStep(60_000);
  group.at(ISS_EPOCH + 4_000_000, out);
  near(group.fastest, first, 0.00002, "the speed does not depend on the step");
});

test("a group with nothing placed is not moving", () => {
  const group = createSatellites(stations, { maxAgeDays: 1 });
  const out = new Float32Array(group.count * 3);
  group.at(ISS_EPOCH + 30 * 86_400_000, out);
  assert.equal(group.placed, 0);
  assert.equal(group.fastest, 0);
});
