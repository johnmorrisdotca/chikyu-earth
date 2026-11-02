import test from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, countryList } from "../src/index.ts";

test("the outlines cover the world", () => {
  assert.ok(COUNTRIES.features.length > 150);
});

test("every outline has a name", () => {
  for (const f of COUNTRIES.features) assert.ok(f.properties.name.length > 0);
});

test("kuni names and codes come through", () => {
  const japan = COUNTRIES.features.find((f) => f.properties.alpha2 === "JP");
  assert.ok(japan);
  assert.equal(japan.properties.name, "Japan");
  assert.equal(japan.properties.ja, "日本");
});

test("countryList returns one entry per outline", () => {
  assert.equal(countryList().length, COUNTRIES.features.length);
});

test("chizu's world-geo gives 177 outlines, Antarctica included", () => {
  assert.equal(COUNTRIES.features.length, 177);
  assert.ok(COUNTRIES.features.some((f) => f.properties.name === "Antarctica"));
});

test("the three places with no ISO code keep a null code, Kosovo has XK", () => {
  const nulls = COUNTRIES.features.filter((f) => f.properties.alpha2 === null).map((f) => f.properties.name);
  assert.deepEqual(nulls.sort(), ["N. Cyprus", "Somaliland"].sort());
  assert.ok(COUNTRIES.features.some((f) => f.properties.alpha2 === "XK"));
});
