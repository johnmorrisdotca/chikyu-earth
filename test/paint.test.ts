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

// A craft on a 90-minute orbit tilted 80° to the equator, over an Earth that turns 360.9856° a day: the point under it at a moment.
const PERIOD = 5_400_000;
const orbit = (ms: number) => {
  const phase = (2 * Math.PI * ms) / PERIOD;
  const tilt = (80 * Math.PI) / 180;
  const lat = (Math.asin(Math.sin(tilt) * Math.sin(phase)) * 180) / Math.PI;
  const inertial = (Math.atan2(Math.cos(tilt) * Math.sin(phase), Math.cos(phase)) * 180) / Math.PI;
  let lon = inertial - (360.9856 * ms) / 86_400_000;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lon, lat, heightKm: 500 };
};
const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 11);

const mask = (paint: { data: Uint8Array }): Uint8Array => Uint8Array.from({ length: paint.data.length / 4 }, (_, i) => (paint.data[i * 4 + 3] === 0 ? 0 : 1));
const differ = (a: Uint8Array, b: Uint8Array): number => a.reduce((n, v, i) => n + (v === b[i] ? 0 : 1), 0);
const pixelAt = (lon: number, lat: number): number => (Math.floor((0.5 - lat / 180) * 512) * 1024 + Math.floor((lon / 360 + 0.5) * 1024)) * 4 + 3;

test("a swath over the date line is painted on both edges of the map, and over a pole all the way round", () => {
  const paint = createPaintState();
  paint.set({ id: "25544", swath: "coverage" });
  paint.step(T0, () => ({ lon: 179, lat: 0, heightKm: 500 }));
  assert.equal(paint.data[pixelAt(176, 0)], 255);
  assert.equal(paint.data[pixelAt(-176, 0)], 255, "the far side of the date line");
  assert.equal(paint.data[pixelAt(-150, 0)], 0);
  const pole = createPaintState();
  pole.set({ id: "25544", swath: "coverage" });
  pole.step(T0, () => ({ lon: 40, lat: 88, heightKm: 500 }));
  assert.equal(pole.data[pixelAt(-140, 87)], 255);
  assert.equal(pole.data[pixelAt(40, 0)], 0);
});

test("a swath over the date line from the east side wraps to the west", () => {
  const paint = createPaintState();
  paint.set({ id: "25544", swath: "coverage" });
  paint.step(T0, () => ({ lon: -179, lat: 10, heightKm: 500 }));
  assert.equal(paint.data[pixelAt(176, 10)], 255);
  assert.equal(paint.data[pixelAt(-176, 10)], 255);
});

test("a clock that jumps ahead fills the gap from the orbit, and matches a trail laid down in one go", () => {
  const stepped = createPaintState();
  stepped.set({ id: "25544", length: "1d" });
  stepped.step(T0, orbit, PERIOD);
  stepped.step(T0 + 5 * HOUR, orbit, PERIOD);
  const whole = createPaintState();
  whole.set({ id: "25544", length: "1d" });
  whole.step(T0 + 5 * HOUR, orbit, PERIOD);
  assert.ok(differ(mask(stepped), mask(whole)) < whole.pixels * 0.05, `${differ(mask(stepped), mask(whole))} of ${whole.pixels}`);
});

test("a clock run backwards uncovers the older end of the trail, and matches one laid down at that moment", () => {
  const paint = createPaintState();
  paint.set({ id: "25544", length: "1d" });
  paint.step(T0 + DAY, orbit, PERIOD);
  for (let h = 1; h <= 6; h += 1) paint.step(T0 + DAY - h * HOUR, orbit, PERIOD);
  const fresh = createPaintState();
  fresh.set({ id: "25544", length: "1d" });
  fresh.step(T0 + DAY - 6 * HOUR, orbit, PERIOD);
  assert.ok(differ(mask(paint), mask(fresh)) < fresh.pixels * 0.05, `${differ(mask(paint), mask(fresh))} of ${fresh.pixels}`);
  assert.ok(paint.pixels > fresh.pixels * 0.9, "the trail did not shrink");
});

test("a month of trail from a cold start follows the orbit: samples at most a third of a trip apart, and the first lay-down is bounded", () => {
  const times: number[] = [];
  const paint = createPaintState();
  paint.set({ id: "25544", length: "1m" });
  paint.step(T0 + 40 * DAY, (ms) => (times.push(ms), orbit(ms)), PERIOD);
  assert.ok(times.length <= 4001, String(times.length));
  assert.ok(times.every((t, i) => i === 0 || Math.abs(t - times[i - 1]!) <= PERIOD / 3 + 1), "no line is a chord across the orbit");
  assert.ok(paint.pixels > 1000);
});

test("nothing older than the length is kept, and the buffer is the same size throughout", () => {
  const paint = createPaintState();
  paint.set({ id: "25544", length: "1d" });
  const size = paint.data.length;
  for (let h = 0; h <= 96; h += 3) paint.step(T0 + h * HOUR, orbit, PERIOD);
  const now = Math.round((T0 + 96 * HOUR) / 60_000) & 0xffff;
  let oldest = 0;
  for (let i = 0; i < paint.data.length; i += 4) {
    if (paint.data[i + 3] === 0) continue;
    const then = (paint.data[i]! << 8) | paint.data[i + 1]!;
    let age = now - then;
    if (age < -32768) age += 65536;
    oldest = Math.max(oldest, age);
  }
  assert.ok(oldest <= 1441, `oldest stamp ${oldest} minutes`);
  assert.equal(paint.data.length, size);
});

test("a new satellite empties the picture and says it must be sent, even before it has painted anything", () => {
  const paint = createPaintState();
  paint.set({ id: "25544" });
  paint.step(T0, orbit, PERIOD);
  assert.ok(paint.pixels > 0);
  paint.set({ id: "99999" });
  assert.equal(paint.pixels, 0);
  assert.equal(paint.step(T0, () => null, PERIOD), true, "the cleared picture is sent once");
  assert.equal(paint.step(T0, () => null, PERIOD), false);
});

test("the two megabytes are made when the first satellite is painted, and given back by clear", () => {
  const paint = createPaintState();
  paint.set({ id: "25544" });
  const first = paint.data;
  assert.equal(first.length, 1024 * 512 * 4);
  paint.step(T0, orbit, PERIOD);
  paint.clear();
  assert.notEqual(paint.data, first, "a new buffer, so the old one is gone");
});
