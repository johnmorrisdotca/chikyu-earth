import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eciToGeodetic, gstime, json2satrec, sgp4 } from "satellite.js";
import { frameAt } from "../src/space/ephemeris.ts";
import { createSatellites, MAX_SATELLITE_SPEED, type ElementSet } from "../src/satellites/index.ts";

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("../demo/celestrak-snapshot.json", import.meta.url), "utf8")) as Snapshot;
const setsOf = (group: string): ElementSet[] => snapshot.groups[group]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);
const stations = setsOf("stations");
const starlink = setsOf("starlink");
const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

const ISS_EPOCH = Date.parse(`${stations.find((set) => set.NORAD_CAT_ID === 25544)!.EPOCH}Z`);

test("the ISS is where the ISS is: about 420 km up, 7.7 km/s, a revolution in 93 minutes, at 51.6 degrees", () => {
  const group = createSatellites(stations);
  assert.ok(group.count >= 18, `${group.count} stations started`);
  const info = group.info(group.sets.findIndex((set) => set.NORAD_CAT_ID === 25544), ISS_EPOCH + 3_600_000)!;
  near(info.altitudeKm, 420, 40, "altitude");
  near(info.speedKmS, 7.66, 0.1, "speed");
  near(info.periodMinutes, 93, 1, "period");
  near(info.inclinationDeg, 51.6, 0.1, "inclination");
  near(info.ageDays, 1 / 24, 0.001, "age");
  assert.equal(info.noradId, 25544);
});

test("a satellite is over the ground it should be over: longitude and latitude agree with satellite.js within 0.02 degree, in the scene's own sidereal time", () => {
  const group = createSatellites(stations);
  const index = group.sets.findIndex((set) => set.NORAD_CAT_ID === 25544);
  for (const hours of [0.5, 2, 5, 11]) {
    const ms = ISS_EPOCH + hours * 3_600_000;
    const one = new Float64Array(6);
    assert.ok(group.exact(index, ms, one));
    // the scene's axes: x to the vernal equinox, y north, z toward -y of the equator. The ground is the Earth turned by the scene's sidereal time.
    const ra = (Math.atan2(-one[2]!, one[0]!) * 180) / Math.PI;
    const dec = (Math.asin(one[1]! / Math.hypot(one[0]!, one[1]!, one[2]!)) * 180) / Math.PI;
    let lon = ra - frameAt(ms).spin;
    lon -= 360 * Math.round(lon / 360);
    const rec = json2satrec(group.sets[index] as never);
    const p = sgp4(rec, (ms - ISS_EPOCH) / 60_000);
    assert.ok(p && p.position);
    const geo = eciToGeodetic(p.position, gstime(new Date(ms)));
    let reference = (geo.longitude * 180) / Math.PI;
    reference -= 360 * Math.round(reference / 360);
    near(lon, reference, 0.02, `longitude after ${hours} h`);
    near(dec, (geo.latitude * 180) / Math.PI, 0.25, `latitude after ${hours} h (geocentric against geodetic)`);
  }
});

test("interpolating between two batches stays within a metre at 1 s and a few kilometres at 60 s", () => {
  for (const [step, tolerance] of [[1000, 0.002], [60_000, 6]] as const) {
    const group = createSatellites(stations);
    group.setStep(step);
    const out = new Float32Array(group.count * 3);
    const one = new Float64Array(6);
    const ms = ISS_EPOCH + 3_600_000;
    let worst = 0;
    for (const offset of [0, 0.25, 0.5, 0.75, 0.99]) {
      const t = ms + offset * step;
      group.at(t, out);
      for (let i = 0; i < group.count; i += 1) {
        assert.ok(group.visible(i));
        assert.ok(group.exact(i, t, one));
        worst = Math.max(worst, Math.hypot(out[i * 3]! - one[0]!, out[i * 3 + 1]! - one[1]!, out[i * 3 + 2]! - one[2]!) * 6371);
      }
    }
    assert.ok(worst <= tolerance, `step ${step}: worst ${worst.toFixed(4)} km`);
  }
});

test("a steady clock costs one batch a step, forwards or backwards, and frames in between cost none", () => {
  for (const direction of [1, -1]) {
    const group = createSatellites(stations);
    const out = new Float32Array(group.count * 3);
    const start = ISS_EPOCH + 86_400_000;
    for (let frame = 0; frame <= 300; frame += 1) group.at(start + direction * frame * (1000 / 30), out);
    // 10 seconds of game time at 30 frames a second: two batches to begin with, then one a second.
    assert.ok(group.propagations <= group.count * 13, `${group.propagations} calls for ${group.count} satellites in 10 s`);
    assert.ok(group.propagations >= group.count * 10);
  }
});

test("elements older than the limit are left out of the picture, and bad ones are refused with a reason", () => {
  const group = createSatellites([...stations, { ...stations[0]!, OBJECT_NAME: "BAD", NORAD_CAT_ID: 1, EPOCH: "not a date" }, { ...stations[0]!, OBJECT_NAME: "ZERO", NORAD_CAT_ID: 2, MEAN_MOTION: 0 }], { maxAgeDays: 14 });
  assert.ok(group.refused.some((one) => one.name === "BAD" && /date/.test(one.reason)));
  assert.ok(group.refused.some((one) => one.name === "ZERO"));
  const out = new Float32Array(group.count * 3);
  group.at(ISS_EPOCH + 3_600_000, out);
  assert.equal(group.placed, group.count);
  group.at(ISS_EPOCH + 20 * 86_400_000, out);
  assert.equal(group.placed, 0);
  assert.equal(group.visible(0), false);
  assert.deepEqual([...out.subarray(0, 3)], [0, 0, 0]);
  assert.equal(group.info(0, ISS_EPOCH + 20 * 86_400_000), undefined);
});

test("an orbit is a closed path in order, one revolution long, round at the satellite's height", () => {
  const group = createSatellites(stations);
  const index = group.sets.findIndex((set) => set.NORAD_CAT_ID === 25544);
  const path = group.orbit(index, ISS_EPOCH + 3_600_000, 120);
  assert.equal(path.length, 121 * 3);
  assert.deepEqual([...path.subarray(0, 3)], [...path.subarray(120 * 3)]);
  let travelled = 0;
  for (let k = 1; k <= 120; k += 1) {
    const step = Math.hypot(path[k * 3]! - path[k * 3 - 3]!, path[k * 3 + 1]! - path[k * 3 - 2]!, path[k * 3 + 2]! - path[k * 3 - 1]!);
    near(step * 6371, (2 * Math.PI * 6793) / 120, 40, "each of the 120 steps is about the same length");
    travelled += step;
  }
  near(travelled * 6371, 2 * Math.PI * 6793, 150, "one revolution");
});

test("6,000 satellites are propagated in a batch that a second can afford", () => {
  const sets: ElementSet[] = [];
  for (let i = 0; i < 6000; i += 1) {
    const base = starlink[i % starlink.length]!;
    // test-only: real elements spread round their orbit so there are 6,000 different places
    sets.push({ ...base, NORAD_CAT_ID: 100_000 + i, MEAN_ANOMALY: (base.MEAN_ANOMALY + i * 0.37) % 360, RA_OF_ASC_NODE: (base.RA_OF_ASC_NODE + i * 0.11) % 360 });
  }
  const group = createSatellites(sets);
  assert.equal(group.count, 6000);
  const out = new Float32Array(6000 * 3);
  const ms = Date.parse("2026-11-02T18:00:00Z");
  group.at(ms, out);
  group.at(ms + 1000, out);
  group.at(ms + 2000, out);
  console.log(`6,000 satellites: one batch ${group.timing.lastBatchMs.toFixed(1)} ms (the longest ${group.timing.maxBatchMs.toFixed(1)} ms)`);
  assert.ok(group.timing.lastBatchMs < 120, `a batch took ${group.timing.lastBatchMs} ms`);
  assert.equal(group.placed, 6000);
  assert.ok(MAX_SATELLITE_SPEED >= 60);
});

