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
