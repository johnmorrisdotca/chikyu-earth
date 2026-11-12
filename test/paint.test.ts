import test from "node:test";
import assert from "node:assert/strict";
import { coverageAngleRad, splitDateLine, trackSteps } from "../src/paint/math.ts";
import { createPaintState } from "../src/paint/buffer.ts";

test("the coverage of a 400 km satellite at 10° up is about 12° of Earth", () => {
  const degrees = coverageAngleRad(400) * 180 / Math.PI;
  assert.ok(Math.abs(degrees - 12.1) < 0.2, degrees.toFixed(2));
  assert.equal(coverageAngleRad(0), 0);
  assert.ok(coverageAngleRad(2000) > coverageAngleRad(400));
});

test("a segment that crosses the date line is two segments, and one that does not is one", () => {
  assert.equal(splitDateLine({ lon: 10, lat: 0 }, { lon: 20, lat: 1 }).length, 1);
  const crossed = splitDateLine({ lon: 170, lat: 10 }, { lon: -170, lat: 12 });
  assert.equal(crossed.length, 2);
  assert.equal(crossed[0]![1].lon, 180);
  assert.equal(crossed[1]![0].lon, -180);
  assert.ok(Math.abs(crossed[0]![1].lon) + Math.abs(crossed[1]![0].lon) === 360);
});

test("steps along a track stay short, including across the date line", () => {
  const steps = trackSteps({ lon: 170, lat: 0 }, { lon: -170, lat: 0 }, 2);
  assert.ok(steps.length > 5);
  for (let i = 1; i < steps.length; i += 1) {
    let delta = steps[i]!.lon - steps[i - 1]!.lon;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    assert.ok(Math.abs(delta) < 3, `step ${i} jumps ${delta}`);
  }
});

test("the trail grows only while time moves, and clears when the satellite changes or clear is called", () => {
  const paint = createPaintState();
  const sample = (ms: number) => ({ lon: ms <= start ? 0 : 40, lat: 10, heightKm: 400 });
  paint.set({ id: "25544" });
  assert.equal(paint.length, "1d");
  assert.equal(paint.swath, "track");
  const start = 1_700_000_000_000;
  assert.equal(paint.step(start, sample), true);
  const first = paint.pixels;
  assert.ok(first > 0);
  assert.equal(paint.step(start, sample), false, "at rest nothing is stamped");
  assert.equal(paint.pixels, first);
  assert.equal(paint.step(start + 60_000, sample), true);
  assert.ok(paint.pixels > first, "a minute later the trail is longer");
  paint.set({ id: "20580" });
  assert.equal(paint.pixels, 0, "another satellite clears the trail");
  paint.step(start, sample);
  assert.ok(paint.pixels > 0);
  paint.clear();
  assert.equal(paint.on, false);
  assert.equal(paint.pixels, 0);
  assert.equal(paint.step(start + 120_000, sample), true, "the cleared buffer is uploaded once");
  assert.equal(paint.step(start + 120_000, sample), false);
});
