// Nearest satellites. A satellite straight overhead is its height away. The ISS elements are one CelesTrak download on 2026-11-09 (test/recorded/passes-elements-2026-11-09.json).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSatellites, nearest, overheadKm, within, type Satellites } from "../src/satellites/index.ts";
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
