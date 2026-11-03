import test from "node:test";
import assert from "node:assert/strict";
import { CATALOGUE, SATELLITE_GROUPS, catalogueEntry, findInCatalogue } from "../src/satellites/index.ts";

test("every group has a source, both languages and a distinct id", () => {
  const ids = new Set<string>();
  for (const group of SATELLITE_GROUPS) {
    assert.ok(!ids.has(group.id), `${group.id} appears twice`);
    ids.add(group.id);
    assert.match(group.id, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(group.celestrak || group.catnr?.length, `${group.id} has no source`);
    assert.ok(group.label && group.labelJa && group.about && group.aboutJa, `${group.id} lacks a word`);
    assert.match(group.aboutJa, /[぀-ヿ一-鿿]/, `${group.id}: the Japanese line has no Japanese in it`);
  }
  assert.equal(SATELLITE_GROUPS.filter((group) => group.still).map((group) => group.id).join(), "geostationary");
});

test("every entry names a real group, has a distinct NORAD number and both languages", () => {
  const groups = new Set(SATELLITE_GROUPS.map((group) => group.id));
  const numbers = new Set<number>();
  for (const entry of CATALOGUE) {
    assert.ok(groups.has(entry.group), `${entry.name}: no group ${entry.group}`);
    assert.ok(!numbers.has(entry.noradId), `${entry.noradId} appears twice`);
    numbers.add(entry.noradId);
    assert.ok(Number.isInteger(entry.noradId) && entry.noradId > 0);
    assert.ok(entry.about.length > 20 && entry.aboutJa.length > 10, `${entry.name} is missing a line`);
    assert.match(entry.aboutJa, /[぀-ヿ一-鿿]/, `${entry.name}: the Japanese line has no Japanese in it`);
  }
});

test("the famous group's numbers are the ones the catalogue names, and the stations are there", () => {
  const famous = SATELLITE_GROUPS.find((group) => group.id === "famous")!;
  for (const number of famous.catnr ?? []) assert.ok(catalogueEntry(number), `${number} is not in the catalogue`);
  assert.equal(catalogueEntry(25544)?.group, "stations");
  assert.equal(catalogueEntry(5)?.name, "VANGUARD 1");
});

test("JWST is not in Earth orbit and so is not in the catalogue", () => {
  assert.deepEqual(findInCatalogue("jwst"), []);
  assert.deepEqual(findInCatalogue("webb"), []);
});

test("finding ignores case and punctuation and puts names that start with the text first", () => {
  assert.equal(findInCatalogue("hst")[0]?.noradId, 20580);
  assert.deepEqual(findInCatalogue("Sentinel-2").map((entry) => entry.name), ["SENTINEL-2A", "SENTINEL-2B"]);
  assert.equal(findInCatalogue("25544")[0]?.name, "ISS (ZARYA)");
  assert.deepEqual(findInCatalogue(""), []);
  assert.equal(findInCatalogue("o", 3).length, 3);
});
