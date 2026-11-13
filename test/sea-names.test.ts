import test from "node:test";
import assert from "node:assert/strict";
import { SEA_FEATURES, SEA_RADIUS, layoutSeaNames, seaNamesFor, type SeaFeature } from "../src/sea-names/geometry.ts";

const ids = (radius: number): string[] => seaNamesFor(radius).map((one) => one.id);

test("a wide Earth names oceans and continents, and a closer Earth adds the seas", () => {
  const wide = ids(120);
  assert.ok(wide.includes("pacific-ocean"));
  assert.ok(wide.includes("africa"));
  assert.equal(wide.includes("sea-of-japan"), false);
  assert.equal(wide.includes("mediterranean-sea"), false);
  const close = ids(SEA_RADIUS);
  assert.ok(close.includes("sea-of-japan"));
  assert.ok(close.includes("mediterranean-sea"));
  assert.ok(close.includes("pacific-ocean"));
  assert.ok(close.includes("africa"));
});

/** Projects one feature to the middle and every other place off the picture. */
const only = (feature: SeaFeature, width: number, height: number) => ({
  width,
  height,
  radius: 400,
  project: (lon: number, lat: number, out: { x: number; y: number }) => {
    if (lon === feature.lon && lat === feature.lat) {
      out.x = width / 2;
      out.y = height / 2;
      return 1;
    }
    out.x = -1000;
    out.y = -1000;
    return 0;
  },
});

test("a city name that fills the only free space leaves the sea unnamed", () => {
  const japan = SEA_FEATURES.find((one) => one.id === "sea-of-japan")!;
  const frame = only(japan, 220, 40);
  const alone = layoutSeaNames(400, frame, "en", []);
  assert.equal(alone.find((one) => one.id === "sea-of-japan")?.text, "Sea of Japan");
  const city = { left: 0, top: 0, width: 220, height: 40 };
  const crowded = layoutSeaNames(400, frame, "en", [city]);
  assert.equal(crowded.some((one) => one.id === "sea-of-japan"), false);
  const japanese = layoutSeaNames(400, frame, "ja", []);
  assert.equal(japanese.find((one) => one.id === "sea-of-japan")?.text, "日本海");
});
