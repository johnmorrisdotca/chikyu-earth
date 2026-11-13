// Nearest satellites. A satellite straight overhead is its height away. The ISS elements are one CelesTrak download on 2026-11-09 (test/recorded/passes-elements-2026-11-09.json).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closeApproach, createSatellites, nearest, overheadKm, within, type Satellites } from "../src/satellites/index.ts";
import { groundUnder } from "../src/paint/math.ts";
import { greenwichSidereal } from "../src/realistic/sun.ts";
import type { ElementSet } from "../src/satellites/types.ts";

const MS = Date.UTC(2026, 10, 2, 12);
const EARTH = 6371;

/** The view-frame position (Earth radii) whose Earth-fixed place is this unit vector at radius `radii`. The inverse of `fixedKm`. */
function viewOf(east: number, north: number, prime: number, radii: number, ms: number): [number, number, number] {
  const theta = (greenwichSidereal(ms) * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const temeX = -sin * east + cos * prime;
  const temeY = cos * east + sin * prime;
  return [temeX * radii, north * radii, -temeY * radii];
}

test("a satellite straight overhead is its height away", () => {
  assert.equal(overheadKm(420), 420);
  const radii = (EARTH + 420) / EARTH;
  const above = viewOf(0, 0, 1, radii, MS);
  const far = viewOf(1, 0, 0, (EARTH + 800) / EARTH, MS);
  const sets = [
    { OBJECT_NAME: "ABOVE", EPOCH: "2026-11-02T12:00:00Z", NORAD_CAT_ID: 1 },
    { OBJECT_NAME: "FAR", EPOCH: "2026-11-02T12:00:00Z", NORAD_CAT_ID: 2 },
  ];
  const positions = [above, far];
  const group = {
    count: 2,
    sets,
    exact(index: number, _ms: number, out: Float64Array) {
      const at = positions[index];
      if (!at) return false;
      out[0] = at[0];
      out[1] = at[1];
      out[2] = at[2];
      return true;
    },
  } as unknown as Satellites;
  const found = nearest(group, { place: { lon: 0, lat: 0 } }, { date: MS, by: "space" });
  assert.equal(found[0]?.name, "ABOVE");
  assert.ok(Math.abs((found[0]?.distance?.kilometres ?? 0) - 420) < 0.01, String(found[0]?.distance?.kilometres));
  assert.equal(found[0]?.distance?.unit, "km");
  const sky = nearest(group, { azimuth: 0, elevation: 90, observer: { lon: 0, lat: 0 } }, { date: MS, by: "sky" });
  assert.equal(sky[0]?.name, "ABOVE");
  assert.ok((sky[0]?.angle ?? 90) < 0.05, String(sky[0]?.angle));
  const close = within(group, { place: { lon: 0, lat: 0 } }, 500, { date: MS, by: "space" });
  assert.deepEqual(close.map((one) => one.name), ["ABOVE"]);
});

test("the ISS at the epoch of its elements has a finite slant range (CelesTrak, 2026-11-09)", () => {
  const file = JSON.parse(readFileSync(new URL("./recorded/passes-elements-2026-11-09.json", import.meta.url), "utf8")) as { sets: ElementSet[] };
  const iss = file.sets.find((set) => set.NORAD_CAT_ID === 25544)!;
  const group = createSatellites([iss]);
  const date = Date.parse(`${iss.EPOCH}Z`);
  const t0 = performance.now();
  const found = nearest(group, { place: { lon: -0.1275, lat: 51.5072 } }, { date, by: "space", count: 1 });
  const ms = performance.now() - t0;
  assert.equal(found.length, 1);
  assert.ok((found[0]?.distance?.kilometres ?? 0) > 200, String(found[0]?.distance?.kilometres));
  assert.ok((found[0]?.distance?.uncertaintyKm ?? 0) >= 1);
  console.log(`nearest of 1 satellite: ${ms.toFixed(3)} ms`);
});

test("a real satellite is its height away from the place `groundUnder` says is beneath it, and straight overhead there (CelesTrak, 2026-11-09)", () => {
  const file = JSON.parse(readFileSync(new URL("./recorded/passes-elements-2026-11-09.json", import.meta.url), "utf8")) as { sets: ElementSet[] };
  const iss = file.sets.find((set) => set.NORAD_CAT_ID === 25544)!;
  const group = createSatellites([iss]);
  const date = Date.parse(`${iss.EPOCH}Z`) + 3 * 3_600_000;
  const buf = new Float64Array(6);
  assert.ok(group.exact(0, date, buf));
  const under = groundUnder(buf[0]!, buf[1]!, buf[2]!, date);
  const range = nearest(group, { place: { lon: under.lon, lat: under.lat } }, { date, by: "space", count: 1 });
  assert.ok(Math.abs((range[0]?.distance?.kilometres ?? 0) - under.heightKm) < 0.01, `${range[0]?.distance?.kilometres} against ${under.heightKm}`);
  const angle = nearest(group, { place: { lon: under.lon, lat: under.lat } }, { date, by: "sky", count: 1 });
  assert.ok((angle[0]?.angle ?? 90) < 0.01, String(angle[0]?.angle));
  // a place 90 degrees of longitude away on the equator sees the same satellite far from straight up
  const away = nearest(group, { place: { lon: under.lon + 90, lat: 0 } }, { date, by: "sky", count: 1 });
  assert.ok((away[0]?.angle ?? 0) > 20, String(away[0]?.angle));
});

test("the closest approach is found between the samples, not only at one", () => {
  // Two satellites 7 km/s apart, closest (100 km) at the middle of the span, which falls between two samples a minute apart.
  const t0 = Date.UTC(2026, 10, 2, 12, 0, 20);
  const radii = 1.2;
  const group = {
    count: 2,
    sets: [
      { OBJECT_NAME: "A", EPOCH: "2026-11-02T12:00:00Z", NORAD_CAT_ID: 1 },
      { OBJECT_NAME: "B", EPOCH: "2026-11-02T12:00:00Z", NORAD_CAT_ID: 2 },
    ],
    exact(index: number, ms: number, out: Float64Array) {
      out[0] = radii;
      out[1] = 0;
      out[2] = 0;
      if (index === 1) {
        out[1] = ((ms - t0) / 1000) * (7 / EARTH);
        out[2] = -100 / EARTH;
      }
      return true;
    },
  } as unknown as Satellites;
  const found = closeApproach(group, 0, 1, Date.UTC(2026, 10, 2, 11, 58), Date.UTC(2026, 10, 2, 12, 3));
  assert.ok(found);
  assert.ok(Math.abs(found.kilometres - 100) < 0.5, String(found.kilometres));
  assert.ok(Math.abs(found.at - t0) < 500, String(found.at - t0));
  // the uncertainty is the elements' age (about 1 km each at their epoch), not how far the samples were apart
  assert.ok(found.uncertaintyKm >= 1 && found.uncertaintyKm < 5, String(found.uncertaintyKm));
});
