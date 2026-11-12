import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eciToGeodetic, gstime, json2satrec, sgp4 } from "satellite.js";
import { frameAt } from "../src/space/ephemeris.ts";
import { createSatellites, DEFAULT_DIM_AFTER_DAYS, DEFAULT_MAX_AGE_DAYS, MAX_SATELLITE_SPEED, type ElementSet } from "../src/satellites/index.ts";
import { ECCENTRIC_FROM } from "../src/satellites/track.ts";
import { madeUp } from "./madeup-elements.ts";

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("./recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Snapshot;
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


test("a satellite whose elements are more than 14 days from the moment shown is placed but flagged to be drawn dimmer, and one past 30 days is left out", () => {
  const sets = madeUp("gps", 3, "2026-11-01T00:00:00") as unknown as ElementSet[];
  const epoch = Date.parse("2026-11-01T00:00:00Z");
  const group = createSatellites(sets);
  assert.equal(group.dimAfterDays, DEFAULT_DIM_AFTER_DAYS);
  assert.equal(group.maxAgeDays, DEFAULT_MAX_AGE_DAYS);
  const out = new Float32Array(group.count * 3);
  group.at(epoch + 10 * 86_400_000, out);
  assert.equal(group.placed, 3);
  assert.deepEqual([...group.dimmed], [0, 0, 0]);
  const before = group.dimVersion;
  group.at(epoch + 10 * 86_400_000 + 1000, out);
  assert.equal(group.dimVersion, before, "nothing changed, so the version did not move");
  group.at(epoch + 16 * 86_400_000, out);
  assert.equal(group.placed, 3);
  assert.deepEqual([...group.dimmed], [1, 1, 1]);
  assert.ok(group.dimVersion > before);
  group.at(epoch + 40 * 86_400_000, out);
  assert.equal(group.placed, 0);
});

test("above the interpolation limit each satellite is a streak along its orbit, one SGP4 sample, and the class colours differ", () => {
  const group = createSatellites(stations);
  const index = group.sets.findIndex((set) => set.NORAD_CAT_ID === 25544);
  const ms = Date.parse("2026-11-02T18:00:00Z");
  const positions = new Float32Array(group.count * 3);
  const segments = new Float32Array(group.count * 6);
  const before = group.propagations;
  group.pin(ms, true);
  const eccentric = group.sets.filter((set) => set.ECCENTRICITY >= ECCENTRIC_FROM).length;
  assert.equal(group.propagations - before, group.count, "one SGP4 call each to pin the place");
  const drawn = group.arc(ms, 120_000, positions, segments);
  assert.equal(drawn, group.count, "every station is drawn, not hidden");
  assert.equal(drawn, group.placed);
  assert.equal(group.propagations - before, group.count + eccentric * 2, "and two more for each eccentric orbit, which SGP4 places itself");
  const pinned = group.propagations;
  group.arc(ms + 1000, 120_000, positions, segments);
  assert.equal(group.propagations - pinned, eccentric * 2, "the next frame turns the pinned place and calls SGP4 only for the eccentric ones");
  const set = group.sets[index]!;
  const sweep = Math.min(Math.PI, (set.MEAN_MOTION * 2 * Math.PI * 120_000) / 86_400_000);
  const radius = Math.hypot(positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!);
  const chord = 2 * radius * Math.sin(sweep / 2);
  const s = index * 6;
  const length = Math.hypot(segments[s + 3]! - segments[s]!, segments[s + 4]! - segments[s + 1]!, segments[s + 5]! - segments[s + 2]!);
  assert.ok(Math.abs(length - chord) / chord < 0.2, `streak ${length.toFixed(4)} against ${chord.toFixed(4)} Earth radii`);
  const geo = createSatellites([{ ...set, NORAD_CAT_ID: 1, MEAN_MOTION: 1.0027, ECCENTRICITY: 0.0001, INCLINATION: 0.05 }]);
  assert.ok(Math.hypot(group.classColour[index * 3]! - geo.classColour[0]!, group.classColour[index * 3 + 1]! - geo.classColour[1]!, group.classColour[index * 3 + 2]! - geo.classColour[2]!) > 0.2, "a low orbit and a geostationary orbit are not the same colour");
  assert.equal(group.newestEpochMs > 0, true);
});

test("a fast clock with the whole recorded catalogue draws one streak each and does not sample SGP4 per frame", () => {
  const sets = [...stations, ...starlink];
  const group = createSatellites(sets);
  const ms = Date.parse("2026-11-02T18:00:00Z");
  const positions = new Float32Array(group.count * 3);
  const segments = new Float32Array(group.count * 6);
  const span = 3_600 * (1000 / 30);
  group.pin(ms, true);
  const once = group.propagations;
  let drawn = 0;
  for (let frame = 0; frame < 30; frame += 1) drawn = group.arc(ms + frame * span, span, positions, segments);
  assert.equal(drawn, group.count, "every satellite in the recorded catalogue is a streak");
  const eccentric = group.sets.filter((set) => set.ECCENTRICITY >= ECCENTRIC_FROM).length;
  assert.equal(group.propagations - once, eccentric * 2 * 30, "only the eccentric ones call SGP4 on a frame, two calls each: the rest turn the pinned place");
});

test("pin places about a thirtieth of the group each call, and arc turns each satellite from its own pin", () => {
  const group = createSatellites(starlink);
  const ms = Date.parse("2026-11-02T18:00:00Z");
  const slice = Math.ceil(group.count / 30);
  const before = group.propagations;
  group.pin(ms);
  assert.equal(group.propagations - before, slice, "one call is one slice, not the whole group");
  for (let i = 1; i < 30; i += 1) group.pin(ms + i);
  assert.ok(group.propagations - before >= group.count, "thirty calls have placed every satellite");
  assert.ok(group.propagations - before < group.count + slice, "thirty calls do not place the group twice");
  const base = stations.find((set) => set.NORAD_CAT_ID === 25544)!;
  const pair = createSatellites([
    { ...base, NORAD_CAT_ID: 1, ECCENTRICITY: 0.001 },
    { ...base, NORAD_CAT_ID: 2, ECCENTRICITY: 0.001, MEAN_ANOMALY: 40 },
    { ...base, NORAD_CAT_ID: 3, ECCENTRICITY: 0.001, MEAN_ANOMALY: 80 },
  ]);
  const positions = new Float32Array(pair.count * 3);
  const segments = new Float32Array(pair.count * 6);
  pair.pin(ms);
  assert.equal(pair.arc(ms + 5_000, 1_000, positions, segments), 1, "a satellite with no pin yet is left out");
  pair.pin(ms + 5_000);
  pair.pin(ms + 5_000);
  assert.equal(pair.arc(ms + 5_000, 1_000, positions, segments), 3);
  const here = new Float64Array(6);
  const km = 6371;
  for (let i = 0; i < pair.count; i += 1) {
    assert.ok(pair.exact(i, ms + 5_000, here));
    const off = Math.hypot(positions[i * 3]! - here[0]!, positions[i * 3 + 1]! - here[1]!, positions[i * 3 + 2]! - here[2]!) * km;
    assert.ok(off < 80, `satellite ${i} is ${off.toFixed(0)} km from its own pin, turned to now`);
  }
});

test("a streak ends where SGP4 puts the satellite and starts where it was one frame earlier, forwards, backwards and for a retrograde orbit", () => {
  const base = stations.find((set) => set.NORAD_CAT_ID === 25544)!;
  const sets = [base, { ...base, NORAD_CAT_ID: 2, INCLINATION: 98.2, RA_OF_ASC_NODE: 40, MEAN_MOTION: 14.9, ECCENTRICITY: 0.001 }, { ...base, NORAD_CAT_ID: 3, INCLINATION: 140, RA_OF_ASC_NODE: 200, MEAN_MOTION: 13, ECCENTRICITY: 0.001 }];
  const group = createSatellites(sets);
  const km = 6371;
  const ms = Date.parse(base.EPOCH + "Z") + 3_600_000;
  const here = new Float64Array(6);
  const there = new Float64Array(6);
  const positions = new Float32Array(group.count * 3);
  const segments = new Float32Array(group.count * 6);
  for (const span of [120_000, -120_000]) {
    for (const age of [0, 600_000]) {
      group.pin(ms, true);
      group.arc(ms + age, span, positions, segments);
      for (let i = 0; i < group.count; i += 1) {
        assert.ok(group.exact(i, ms + age, here) && group.exact(i, ms + age - span, there));
        const s = i * 6;
        const end = Math.hypot(segments[s + 3]! - here[0]!, segments[s + 4]! - here[1]!, segments[s + 5]! - here[2]!) * km;
        const start = Math.hypot(segments[s]! - there[0]!, segments[s + 1]! - there[1]!, segments[s + 2]! - there[2]!) * km;
        assert.ok(end < 80, `satellite ${i}, span ${span}, ${age} ms after the pin: the streak ends ${end.toFixed(0)} km from the satellite`);
        assert.ok(start < 80, `satellite ${i}, span ${span}, ${age} ms after the pin: the streak starts ${start.toFixed(0)} km from where it was one frame before`);
      }
    }
  }
});

test("a highly eccentric orbit is SGP4 itself on every frame: its streak is the real stretch of the orbit, not a turn at the mean motion", () => {
  const base = stations.find((set) => set.NORAD_CAT_ID === 25544)!;
  const molniya = { ...base, NORAD_CAT_ID: 9, OBJECT_NAME: "MOLNIYA", MEAN_MOTION: 2.00614, ECCENTRICITY: 0.74, INCLINATION: 63.4, ARG_OF_PERICENTER: 270, MEAN_ANOMALY: 0, BSTAR: 0, MEAN_MOTION_DOT: 0 };
  const group = createSatellites([molniya]);
  const km = 6371;
  const t0 = Date.parse(`${molniya.EPOCH}Z`);
  const positions = new Float32Array(3);
  const segments = new Float32Array(6);
  const here = new Float64Array(6);
  const there = new Float64Array(6);
  for (const [age, span] of [[-600_000, 20_000], [0, 120_000], [3 * 3_600_000, 120_000], [6 * 3_600_000, 20_000]] as const) {
    group.pin(t0 + 3_600_000);
    group.arc(t0 + 3_600_000 + age + 600_000, span, positions, segments);
    const ms = t0 + 3_600_000 + age + 600_000;
    assert.ok(group.exact(0, ms, here) && group.exact(0, ms - span, there));
    const length = Math.hypot(here[0]! - there[0]!, here[1]! - there[1]!, here[2]! - there[2]!) * km;
    const drawn = Math.hypot(segments[3]! - segments[0]!, segments[4]! - segments[1]!, segments[5]! - segments[2]!) * km;
    assert.ok(Math.abs(drawn - length) < 1, `streak ${drawn.toFixed(1)} km against ${length.toFixed(1)} km`);
    assert.ok(Math.hypot(positions[0]! - here[0]!, positions[1]! - here[1]!, positions[2]! - here[2]!) * km < 1, "the dot is where SGP4 puts it, however long since the last pin");
  }
});

test("an old element set mixed with fresh ones is the only one dimmed", () => {
  const fresh = madeUp("gps", 2, "2026-11-03T00:00:00");
  const old = madeUp("gps", 1, "2026-10-10T00:00:00", 800_000);
  const group = createSatellites([...fresh, ...old] as unknown as ElementSet[]);
  const out = new Float32Array(group.count * 3);
  group.at(Date.parse("2026-11-03T12:00:00Z"), out);
  assert.equal(group.placed, 3);
  const names = group.sets.map((set) => set.NORAD_CAT_ID);
  assert.deepEqual(names.map((id, i) => (group.dimmed[i] === 1 ? id : 0)).filter(Boolean), [806_000]);
});
