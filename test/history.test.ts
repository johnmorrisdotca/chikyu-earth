import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { altitudeSeries, createSatelliteHistory, createSatellites, DEFAULT_UNCERTAINTY, predictionUncertaintyKm, type ElementSet } from "../src/satellites/index.ts";

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("./recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Snapshot;
const stations = snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);
const iss = stations.find((set) => set.NORAD_CAT_ID === 25544)!;
const ISS_EPOCH = Date.parse(`${iss.EPOCH}Z`);
const DAY = 86_400_000;
const KM = 6371;

// Reference places of the ISS, from NASA/JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api), read on 2026-11-17 by one request:
//   COMMAND='-125544' (International Space Station, source: iss), EPHEM_TYPE=OBSERVER, CENTER='500@399' (the Earth's centre), TLIST_TYPE=JD, TIME_TYPE=UT,
//   QUANTITIES='2,20', ANG_FORMAT=DEG, EXTRA_PREC=YES, CSV_FORMAT=YES, at JD 2461352.5, 2461354.5, 2461356.5, 2461358.5.
// Columns copied digit for digit: R.A. (a-app) and DEC (a-app) in degrees (airless apparent place, true equator and equinox of date: within about 1 km of TEME at the ISS), and delta, the range, in AU.
// Not computed from this package. One element set only (the recorded 2026-11-02 snapshot) is held for it, so the later dates are 5.6 to 11.6 days from it: they test the stated uncertainty of a prediction.
const HORIZONS = [
  { utc: "2026-11-08T00:00:00Z", raDeg: 56.172333068, decDeg: 50.246347316, deltaAu: 0.00004539371296 },
  { utc: "2026-11-10T00:00:00Z", raDeg: 49.423041295, decDeg: 49.702587692, deltaAu: 0.00004539113585 },
  { utc: "2026-11-12T00:00:00Z", raDeg: 43.017646605, decDeg: 48.982276947, deltaAu: 0.00004538853455 },
  { utc: "2026-11-14T00:00:00Z", raDeg: 36.867701269, decDeg: 48.063827734, deltaAu: 0.00004538648381 },
] as const;
const AU_KM = 149_597_870.7;

/** An element set with its epoch moved and its mean anomaly turned: a made-up later set of the same orbit, for tests of which set is used (not a real one). */
const later = (days: number, anomaly: number): ElementSet => ({ ...iss, EPOCH: new Date(ISS_EPOCH + days * DAY).toISOString().replace("Z", ""), MEAN_ANOMALY: (iss.MEAN_ANOMALY + anomaly) % 360 });

test("against Horizons: the ISS's place on four past dates is within its stated uncertainty, and its range to a few km", () => {
  const history = createSatelliteHistory([iss]);
  const out = new Float64Array(6);
  for (const ref of HORIZONS) {
    const ms = Date.parse(ref.utc);
    assert.equal(history.exact(ms, out), "tracked" === history.describe(ms).status ? "tracked" : "predicted");
    const r = Math.hypot(out[0]!, out[1]!, out[2]!);
    const ra = Math.atan2(-out[2]!, out[0]!);
    const dec = Math.asin(out[1]! / r);
    const a = (ref.raDeg * Math.PI) / 180;
    const d = (ref.decDeg * Math.PI) / 180;
    const angle = Math.acos(Math.min(1, Math.sin(d) * Math.sin(dec) + Math.cos(d) * Math.cos(dec) * Math.cos(a - ra)));
    const km = angle * ref.deltaAu * AU_KM;
    const stated = history.describe(ms).uncertaintyKm;
    assert.ok(km <= stated, `${ref.utc}: ${km.toFixed(1)} km from Horizons, stated uncertainty ${stated.toFixed(1)} km`);
    assert.ok(km > 5, `${ref.utc}: ${km.toFixed(1)} km: a real error, so the test measures something`);
    near(r * KM, ref.deltaAu * AU_KM, 5, `${ref.utc} range`);
  }
});
const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("the stated uncertainty grows with the distance from the nearest set, is the same either side, and is never below its base", () => {
  assert.equal(predictionUncertaintyKm(0), DEFAULT_UNCERTAINTY.baseKm);
  let before = predictionUncertaintyKm(0);
  for (const days of [0.5, 1, 3, 7, 14, 30]) {
    const now = predictionUncertaintyKm(days);
    assert.ok(now > before, `${days} days`);
    assert.equal(predictionUncertaintyKm(-days), now);
    before = now;
  }
  assert.equal(predictionUncertaintyKm(Number.NaN), DEFAULT_UNCERTAINTY.baseKm);
  assert.equal(predictionUncertaintyKm(2, { baseKm: 0, kmPerDay: 10, kmPerDaySquared: 0 }), 20);
});

test("a moment is before launch, tracked, backcast, predicted or decayed, and the nearest set is the one used", () => {
  const sets = [later(10, 90), iss, later(-20, 40)];
  const history = createSatelliteHistory(sets, { launch: "2026-09-01", decay: "2026-12-31" });
  assert.deepEqual(history.epochs, [...history.epochs].sort((a, b) => a - b), "sorted by epoch");
  assert.equal(history.sets.length, 3);
  const at = (days: number): ReturnType<typeof history.describe> => history.describe(ISS_EPOCH + days * DAY);
  assert.equal(at(-70).status, "before-launch");
  assert.equal(at(-25).status, "backcast", "after the launch, before the oldest set");
  assert.equal(at(-5).status, "tracked");
  assert.equal(at(5).status, "tracked");
  assert.equal(at(12).status, "predicted", "after the newest set");
  assert.equal(at(60).status, "decayed");
  assert.equal(at(-5).setIndex, 1, "of the sets at -20, 0 and +10 days, 0 is the nearest to -5 (5 away; -20 is 15)");
  assert.equal(at(-12).setIndex, 0, "-20 is nearer to -12 than 0 is");
});

test("the nearest set is the one that places it: each gives its own place, not the middle set's", () => {
  const a = iss;
  const b = later(10, 90);
  const history = createSatelliteHistory([a, b]);
  const out = new Float64Array(6);
  const alone = (set: ElementSet, ms: number): number[] => {
    const group = createSatellites([set], { estimateFar: true });
    const o = new Float64Array(6);
    assert.ok(group.exact(0, ms, o));
    return [...o];
  };
  for (const ms of [ISS_EPOCH + 1 * DAY, ISS_EPOCH + 9 * DAY]) {
    const nearer = ms - ISS_EPOCH < 5 * DAY ? a : b;
    assert.equal(history.exact(ms, out), "tracked");
    assert.deepEqual([...out], alone(nearer, ms), "the place is the nearer set's, bit for bit");
  }
  assert.equal(history.describe(ISS_EPOCH + 9 * DAY).setIndex, 1);
  near(history.describe(ISS_EPOCH + 9 * DAY).distanceDays, 1, 1e-9, "distance from the nearer set");
});

test("before launch and after decay nothing is drawn, and after the newest set the place is a prediction: shaded, with its uncertainty stated and growing", () => {
  const history = createSatelliteHistory([{ ...iss, LAUNCH_DATE: "2026-10-01", DECAY_DATE: "2026-11-20" }, later(2, 10)]);
  const out = new Float64Array(6);
  assert.equal(history.exact(Date.parse("2026-09-30T23:00:00Z"), out), "before-launch");
  assert.equal(history.exact(Date.parse("2026-11-21T00:00:00Z"), out), "decayed");
  assert.equal(history.exact(Date.parse("2026-11-20T23:59:00Z"), out), "predicted", "the decay day is the end of that day");
  assert.equal(history.exact(ISS_EPOCH + 1 * DAY, out), "tracked");
  const moment = history.describe(Date.parse("2026-11-21T00:00:00Z"));
  assert.equal(moment.decayedMs, Date.parse("2026-11-20T23:59:59.999Z"));
  assert.equal(history.describe(Date.parse("2026-09-30T00:00:00Z")).launchedMs, Date.parse("2026-10-01T00:00:00Z"));
  // the group the view draws
  const group = history.group;
  const positions = new Float32Array(3);
  group.at(Date.parse("2026-09-30T00:00:00Z"), positions);
  assert.equal(group.visible(0), false, "not drawn before the launch");
  assert.equal(group.placed, 0);
  assert.deepEqual([...positions], [0, 0, 0]);
  group.at(ISS_EPOCH + 3_600_000, positions);
  assert.equal(group.visible(0), true);
  assert.equal(group.dimmed[0], 0, "the tracked place is not shaded");
  assert.equal(group.estimated(0), false);
  group.at(ISS_EPOCH + 3 * DAY, positions);
  assert.equal(group.dimmed[0], 2, "a prediction is shaded");
  assert.equal(group.estimated(0), true);
  assert.equal(group.estimatedCount, 1);
  const soon = group.info(0, ISS_EPOCH + 3 * DAY)!;
  assert.equal(soon.estimated, true);
  near(soon.estimatedDays, 1, 1e-9, "estimatedDays: 1 day after the newest set, at +2 days");
  assert.ok(history.describe(ISS_EPOCH + 9 * DAY).uncertaintyKm > history.describe(ISS_EPOCH + 3 * DAY).uncertaintyKm);
  group.at(Date.parse("2026-11-21T00:00:00Z"), positions);
  assert.equal(group.visible(0), false, "not drawn after it has come down");
  assert.equal(group.info(0, Date.parse("2026-11-21T00:00:00Z")), undefined);
});

test("the launch year of the international designator stands in for a launch date, and a set with neither has no limit", () => {
  const year = createSatelliteHistory([iss]);
  const m = year.describe(ISS_EPOCH);
  assert.equal(m.launchedMs, Date.UTC(1998, 0, 1));
  assert.equal(m.launchExact, false);
  assert.equal(year.describe(Date.UTC(1997, 5, 1)).status, "before-launch");
  const bare = createSatelliteHistory([{ ...iss, OBJECT_ID: undefined }]);
  assert.equal(bare.describe(Date.UTC(1950, 0, 1)).status, "backcast");
  assert.equal(bare.describe(ISS_EPOCH).launchedMs, null);
});

test("sets SGP4 cannot start from are refused with a reason and the rest are kept", () => {
  const history = createSatelliteHistory([iss, { ...iss, EPOCH: "not a date" }, { ...iss, EPOCH: "2026-11-03T00:00:00", ECCENTRICITY: 1.5 }]);
  assert.equal(history.sets.length, 1);
  assert.equal(history.refused.length, 2);
  const none = createSatelliteHistory([]);
  assert.equal(none.describe(ISS_EPOCH).status, "unplaceable");
  assert.equal(none.group.count, 0);
});

test("the trail is the last N orbits, oldest first, ending at the satellite, each point placed from the set nearest its own moment", () => {
  const history = createSatelliteHistory([iss, later(1, 30)]);
  const now = ISS_EPOCH + 0.5 * DAY;
  const points = 241;
  const path = new Float32Array(points * 3);
  const valid = history.trailInto(now, 3, path);
  assert.equal(valid, points);
  const out = new Float64Array(6);
  history.exact(now, out);
  for (let c = 0; c < 3; c += 1) near(path[(points - 1) * 3 + c]!, out[c]!, 1e-6, "the newest point is the satellite");
  const periodMs = (1440 / iss.MEAN_MOTION) * 60_000;
  history.exact(now - 3 * periodMs, out);
  for (let c = 0; c < 3; c += 1) near(path[c]!, out[c]!, 1e-6, "the oldest point is 3 orbits back");
  // a circle of this height, so every point is at about the same height and the points are near each other
  let longest = 0;
  for (let k = 1; k < points; k += 1) longest = Math.max(longest, Math.hypot(path[k * 3]! - path[(k - 1) * 3]!, path[k * 3 + 1]! - path[(k - 1) * 3 + 1]!, path[k * 3 + 2]! - path[(k - 1) * 3 + 2]!));
  assert.ok(longest * KM < 600, `${(longest * KM).toFixed(0)} km between neighbours (80 points to an orbit: 4.5 degrees, 534 km)`);
  assert.equal(history.trail(now, 1, 50).length, 150);
  // before the launch the trail is shorter at the back, and none before it at all
  const late = createSatelliteHistory([iss], { launch: ISS_EPOCH - 0.01 * DAY });
  const some = late.trailInto(ISS_EPOCH + periodMs, 3, new Float32Array(300));
  assert.ok(some > 0 && some < 100, `${some} points since the launch`);
  assert.equal(late.trailInto(ISS_EPOCH - DAY, 3, new Float32Array(300)), 0);
  assert.equal(createSatelliteHistory([]).trail(ISS_EPOCH, 3).length, 0);
});

test("the trail makes no array: a frame of it costs SGP4 calls and no allocation", () => {
  const history = createSatelliteHistory([iss]);
  const path = new Float32Array(300);
  history.trailInto(ISS_EPOCH, 3, path);
  const heap = process.memoryUsage().heapUsed;
  for (let i = 0; i < 300; i += 1) history.trailInto(ISS_EPOCH + i * 1000, 3, path);
  assert.ok(process.memoryUsage().heapUsed - heap < 8_000_000);
});

test("altitudeSeries gives the mean height at each set's epoch, oldest first, and follows a falling orbit", () => {
  const raised = { ...iss, EPOCH: "2026-09-01T00:00:00", MEAN_MOTION: 15.45 };
  const lowered = { ...iss, EPOCH: "2026-10-01T00:00:00", MEAN_MOTION: 15.55 };
  const series = altitudeSeries([iss, lowered, { ...iss, EPOCH: "bad" }, raised]);
  assert.equal(series.length, 3);
  assert.deepEqual(series.map((p) => p.epochMs), [...series.map((p) => p.epochMs)].sort((a, b) => a - b));
  assert.ok(series[0]!.altitudeKm > series[1]!.altitudeKm, "a smaller mean motion is a higher orbit");
  const group = createSatellites([iss]);
  const info = group.info(0, ISS_EPOCH)!;
  near(series.find((p) => p.epochMs === ISS_EPOCH)!.altitudeKm, info.altitudeKm, 5, "the ISS's mean height against its height at the epoch (a near-circular orbit)");
  assert.equal(series[2]!.noradId, 25544);
  assert.deepEqual(altitudeSeries([]), []);
});
