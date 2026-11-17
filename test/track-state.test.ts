// Heading, ascending or descending, and sunlit or in shadow: the analytic cases (an orbit through the poles, the equator crossing of an orbit at 51.6 degrees, the cylinder of shadow) and the ISS from its recorded elements.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { json2satrec, sgp4 } from "satellite.js";
import { COMPASS_POINTS, SHADOW_RADIUS_KM, compassPoint, inEarthShadow, sunDirection, trackStateOf, trackStateOfScene } from "../src/flat/index.ts";
import { groundTrack, groundTrackState } from "../src/passes/index.ts";
import { greenwichSidereal } from "../src/realistic/sun.ts";
import type { ElementSet } from "../src/satellites/index.ts";

const RAD = Math.PI / 180;
const OMEGA = 7.292115e-5;
const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
/** An Earth-fixed place turned into the axes SGP4 uses at a moment. */
const teme = (ecef: [number, number, number], ms: number): [number, number, number] => {
  const t = greenwichSidereal(ms) * RAD;
  return [Math.cos(t) * ecef[0] - Math.sin(t) * ecef[1], Math.sin(t) * ecef[0] + Math.cos(t) * ecef[1], ecef[2]];
};
const AT = Date.UTC(2026, 10, 3, 12);

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("./recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Snapshot;
const iss = snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, i) => [field, row[i]])) as unknown as ElementSet).find((set) => set.NORAD_CAT_ID === 25544)!;
const ISS_EPOCH = Date.parse(`${iss.EPOCH}Z`);

test("a polar orbit crossing the equator goes north, a little west of north (the ground turns east under it), and south the other way", () => {
  const r = 7000;
  // at longitude 0, on the equator, going straight along the pole in space: the ground's own turn is the whole of the sideways part
  const up = trackStateOf(teme([r, 0, 0], AT), teme([0, 0, 0], AT).map((_, i) => [0, 0, 7.5][i]!) as [number, number, number], AT);
  near(up.lat, 0, 1e-6, "lat");
  near(up.lon, 0, 1e-6, "lon");
  near(up.heightKm, r - 6378.137, 1e-6, "height");
  assert.equal(up.ascending, true);
  // the ground moves east at omega r, so the track is west of north by atan(omega r / v)
  const west = Math.atan((OMEGA * r) / 7.5) / RAD;
  near(up.bearingDeg, 360 - west, 1e-6, "ascending bearing");
  const down = trackStateOf(teme([r, 0, 0], AT), [0, 0, -7.5], AT);
  assert.equal(down.ascending, false);
  near(down.bearingDeg, 180 + west, 1e-6, "descending bearing");
});

test("a circular orbit at 51.6 degrees crosses the equator at the launch azimuth, less the Earth's turn", () => {
  const r = 6798;
  const v = 7.66;
  const inclination = 51.6 * RAD;
  // the velocity at the ascending node is v along (0, cos i, sin i) in the axes of the node: the inertial azimuth is asin(cos i)
  const lon = 40;
  const place = teme([r * Math.cos(lon * RAD), r * Math.sin(lon * RAD), 0], AT);
  const t = greenwichSidereal(AT) * RAD;
  const node = lon * RAD + t;
  // the inertial direction east at the place is (-sin node, cos node, 0), north is (0, 0, 1)
  const velocity: [number, number, number] = [-Math.sin(node) * v * Math.cos(inclination), Math.cos(node) * v * Math.cos(inclination), v * Math.sin(inclination)];
  const state = trackStateOf(place, velocity, AT);
  near(state.lon, lon, 1e-6, "lon");
  const east = v * Math.cos(inclination) - OMEGA * r;
  const north = v * Math.sin(inclination);
  near(state.bearingDeg, Math.atan2(east, north) / RAD, 1e-6, "bearing");
  near(state.bearingDeg, 35.4, 0.1, "the number for a person: about 35 degrees");
  assert.equal(state.ascending, true);
});

test("a satellite going west on the ground has a bearing in the west half, and the bearing is 0 to 360", () => {
  // a retrograde orbit: 1 km a second west over the ground, 0.5 north (the inertial velocity is the ground's plus the Earth's turn at that place)
  const inertial = (ground: [number, number, number]): [number, number, number] => teme([ground[0], ground[1] + OMEGA * 7000, ground[2]], AT);
  const state = trackStateOf(teme([7000, 0, 0], AT), inertial([0, -1, 0.5]), AT);
  near(state.bearingDeg, 360 + Math.atan2(-1, 0.5) / RAD, 1e-6, "west and a little north");
  assert.ok(state.bearingDeg > 180 && state.bearingDeg < 360);
  const still = trackStateOf(teme([7000, 0, 0], AT), inertial([0, 0, 0]), AT);
  assert.equal(still.bearingDeg, 0);
});

test("the scene's axes give the same state as TEME's", () => {
  const a = trackStateOf([5000, -3000, 4000], [3.1, 5.2, -4.4], AT);
  // scene: x = TEME x, y = TEME z, z = minus TEME y, in Earth radii of 6,371 km
  const b = trackStateOfScene([5000 / 6371, 4000 / 6371, 3000 / 6371], [3.1, -4.4, -5.2], AT);
  assert.deepEqual(b, a);
});

test("the cylinder of shadow: behind the Earth and inside its radius", () => {
  const sun: [number, number, number] = [1, 0, 0];
  assert.equal(inEarthShadow([-7000, 0, 0], sun), true);
  assert.equal(inEarthShadow([-7000, 6000, 0], sun), true);
  assert.equal(inEarthShadow([-7000, SHADOW_RADIUS_KM + 1, 0], sun), false);
  assert.equal(inEarthShadow([-7000, SHADOW_RADIUS_KM - 1, 0], sun), true);
  assert.equal(inEarthShadow([7000, 0, 0], sun), false, "in front of the Earth");
  assert.equal(inEarthShadow([0, 7000, 0], sun), false, "beside it");
  assert.equal(inEarthShadow([-1e5, 0, 6000], sun), true, "far behind it, still inside the cylinder");
});

test("the Sun's direction is a unit vector over the right place at the June solstice noon", () => {
  const sun = sunDirection(Date.UTC(2026, 5, 21, 12));
  near(Math.hypot(...sun), 1, 1e-12, "unit");
  near(Math.asin(sun[2]) / RAD, 23.44, 0.1, "declination");
});

test("a satellite on the night side is in shadow, and straight under the Sun it is lit", () => {
  const sun = sunDirection(AT);
  const r = 6798;
  const under = trackStateOf(teme(sun.map((n) => n * r) as [number, number, number], AT), [0, 0, 7], AT);
  assert.equal(under.sunlit, true);
  const behind = trackStateOf(teme(sun.map((n) => -n * r) as [number, number, number], AT), [0, 0, 7], AT);
  assert.equal(behind.sunlit, false);
});

test("the ISS's share of an orbit in shadow is the one the geometry gives, at four different Sun angles", () => {
  // the share from the geometry: acos(sqrt(1 - (Re / r)^2) / cos beta) / pi, with beta the Sun's angle from the orbit plane (none at all once beta is high enough)
  const period = 1440 / iss.MEAN_MOTION;
  const step = 15_000;
  const betas: number[] = [];
  const rec = json2satrec(iss as never);
  for (const hours of [3, 240, 480, 720]) {
    const from = ISS_EPOCH + hours * 3_600_000;
    let lit = 0;
    let total = 0;
    let radius = 0;
    for (let ms = from; ms < from + period * 60_000; ms += step) {
      const state = groundTrackState(iss, ms)!;
      total += 1;
      if (state.sunlit) lit += 1;
      radius += 6378.137 + state.heightKm;
    }
    radius /= total;
    // beta at the middle of the orbit, from the orbit's own normal (the position times the velocity, in TEME) and the Sun
    const mid = from + period * 30_000;
    const t = greenwichSidereal(mid) * RAD;
    const sun = sunDirection(mid);
    const sunInertial = [Math.cos(t) * sun[0] - Math.sin(t) * sun[1], Math.sin(t) * sun[0] + Math.cos(t) * sun[1], sun[2]];
    const at = sgp4(rec, (mid - ISS_EPOCH) / 60_000) as { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number } };
    const { position: r, velocity: v } = at;
    const cross = [r.y * v.z - r.z * v.y, r.z * v.x - r.x * v.z, r.x * v.y - r.y * v.x];
    const size = Math.hypot(cross[0]!, cross[1]!, cross[2]!);
    const beta = Math.asin((cross[0]! * sunInertial[0]! + cross[1]! * sunInertial[1]! + cross[2]! * sunInertial[2]!) / size);
    betas.push(beta / RAD);
    const ratio = Math.sqrt(1 - (6378.137 / radius) ** 2) / Math.cos(beta);
    const expected = ratio >= 1 ? 0 : Math.acos(ratio) / Math.PI;
    near(1 - lit / total, expected, 0.012, `shadow share at a beta of ${(beta / RAD).toFixed(1)} degrees`);
    // 35 to 39 per cent at a beta of 0, falling as it rises
    assert.ok(1 - lit / total < 0.4);
  }
  assert.ok(Math.max(...betas) - Math.min(...betas) > 15, `the three orbits are at different angles: ${betas.join(", ")}`);
});

test("the ISS's track has both sunlit and shadow points over a day, and its heading keeps to the east half", () => {
  const track = groundTrack(iss, ISS_EPOCH, ISS_EPOCH + 86_400_000, 60);
  assert.ok(track.some((p) => p.sunlit) && track.some((p) => !p.sunlit));
  let ascending = 0;
  let descending = 0;
  for (let ms = ISS_EPOCH; ms < ISS_EPOCH + 6_000_000; ms += 60_000) {
    const s = groundTrackState(iss, ms)!;
    near(s.heightKm, 420, 30, "height");
    assert.ok(Math.abs(s.lat) <= 52, `the geodetic latitude of a 51.6 degree orbit tops out near 51.8: ${s.lat}`);
    assert.ok(s.bearingDeg >= 0 && s.bearingDeg < 360);
    if (s.ascending) {
      ascending += 1;
      assert.ok(s.bearingDeg < 90 || s.bearingDeg > 270 || Math.abs(s.lat) > 45, `ascending bearing ${s.bearingDeg} at ${s.lat}`);
    } else {
      descending += 1;
      assert.ok(s.bearingDeg > 90 && s.bearingDeg < 270 || Math.abs(s.lat) > 45, `descending bearing ${s.bearingDeg} at ${s.lat}`);
    }
  }
  assert.ok(ascending > 20 && descending > 20);
});

test("the ISS going south over the ground heads south-east, as the ground-track map shows", () => {
  let found = false;
  for (let ms = ISS_EPOCH; ms < ISS_EPOCH + 6_000_000; ms += 30_000) {
    const s = groundTrackState(iss, ms)!;
    if (!s.ascending && Math.abs(s.lat) < 10) {
      // across the equator going south the track runs south-east: 180 less the 35.4 degrees of the ascending crossing
      near(s.bearingDeg, 144.4, 3, "descending at the equator");
      found = true;
      break;
    }
  }
  assert.ok(found);
});

test("eight points of the compass", () => {
  assert.deepEqual([0, 44, 46, 128, 180, 225, 270, 315, 350, 360, -10].map(compassPoint), ["N", "NE", "NE", "SE", "S", "SW", "W", "NW", "N", "N", "N"]);
  assert.equal(COMPASS_POINTS.length, 8);
});
