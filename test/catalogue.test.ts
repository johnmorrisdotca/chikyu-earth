import test from "node:test";
import assert from "node:assert/strict";
import { CATALOGUE, SATELLITE_GROUPS, SHORT_NAMES, catalogueEntry, catalogueRows, findInCatalogue } from "../src/satellites/index.ts";

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

// The names these ten queries returned on 3aa5e7a, before Japanese matching. An English query must keep them.
const ENGLISH_QUERIES: readonly (readonly [string, readonly string[]])[] = [
  ["hst", ["HST"]],
  ["Sentinel-2", ["SENTINEL-2A", "SENTINEL-2B"]],
  ["25544", ["ISS (ZARYA)"]],
  ["weather", ["NOAA 20 (JPSS-1)", "NOAA 21 (JPSS-2)", "SUOMI NPP", "METOP-B", "GOES 19", "HIMAWARI-9", "METEOSAT-12 (MTG-I1)", "FENGYUN 4A"]],
  ["hubble", ["HST"]],
  ["terra", ["TERRA", "AQUA"]],
  ["gps", []],
  ["landsat", ["LANDSAT 8", "LANDSAT 9"]],
  ["iss", ["ISS (ZARYA)"]],
  ["telescope", ["HST", "FGRST (GLAST)", "XMM-NEWTON"]],
];

test("an English or numeric query returns the same entries as before Japanese matching", () => {
  assert.equal(ENGLISH_QUERIES.length, 10);
  for (const [query, names] of ENGLISH_QUERIES) assert.deepEqual(findInCatalogue(query).map((entry) => entry.name), [...names], query);
});

test("catalogue rows are plain data for every group and every satellite, in both languages", () => {
  const rows = catalogueRows();
  assert.equal(rows.length, SATELLITE_GROUPS.length + CATALOGUE.length);
  assert.deepEqual(catalogueRows("en"), rows);
  assert.deepEqual(catalogueRows("ja"), rows);
  assert.deepEqual(rows.filter((row) => row.kind === "group").map((row) => row.id), SATELLITE_GROUPS.map((group) => group.id));
  assert.deepEqual(rows.filter((row) => row.kind === "satellite").map((row) => row.noradId), CATALOGUE.map((entry) => entry.noradId));
  assert.deepEqual(rows.find((row) => row.id === "weather"), { kind: "group", id: "weather", names: { en: "Weather", ja: "気象衛星", reading: "きしょうえいせい" }, orbit: "mixed" });
  assert.deepEqual(rows.find((row) => row.noradId === 20580), {
    kind: "satellite", id: "20580", noradId: 20580, names: { en: "Hubble", ja: "ハッブル" }, group: "famous", orbit: "leo", aka: ["HST"],
  });
  assert.deepEqual(rows.find((row) => row.noradId === 48274)?.names, { en: "Tiangong", ja: "天宮", reading: "てんぐう" });
  assert.deepEqual(rows.find((row) => row.noradId === 48274)?.aka, ["CSS (TIANHE)", "TIANHE"]);
  assert.deepEqual(rows.find((row) => row.noradId === 25544)?.aka, ["ISS (ZARYA)", "ZARYA"]);
  const sentinel = rows.find((row) => row.noradId === 40697);
  assert.equal(sentinel?.names.en, "SENTINEL-2A");
  assert.equal(sentinel?.names.ja, "SENTINEL-2A");
  assert.equal(sentinel?.names.reading, undefined);
  assert.equal(sentinel?.aka, undefined);
  for (const row of rows) {
    if (row.kind === "group") {
      const group = SATELLITE_GROUPS.find((one) => one.id === row.id);
      assert.equal(row.names.en, group?.label);
      assert.equal(row.names.ja, group?.labelJa);
      assert.equal(row.noradId, undefined);
      assert.equal(row.aka, undefined);
    } else {
      const entry = catalogueEntry(row.noradId ?? 0);
      const short = SHORT_NAMES[row.noradId ?? 0];
      assert.equal(row.names.en, short?.en ?? entry?.name);
      assert.equal(row.names.ja, short?.ja ?? row.names.en);
      for (const aka of row.aka ?? []) assert.ok(entry?.name === aka || entry?.name.includes(`(${aka})`), `${aka} is not written in ${entry?.name}`);
    }
  }
  assert.throws(() => catalogueRows("fr" as "en"), TypeError);
});

test("finding matches a Japanese name and a group's Japanese label as typed", () => {
  assert.deepEqual(findInCatalogue("ハッブル").map((entry) => entry.noradId), [20580]);
  assert.deepEqual(findInCatalogue("天宮").map((entry) => entry.noradId), [48274]);
  assert.deepEqual(findInCatalogue("ﾊｯﾌﾞﾙ").map((entry) => entry.noradId), [20580]);
  assert.deepEqual(findInCatalogue("宇宙ステーション").map((entry) => entry.noradId), [25544, 48274]);
  assert.ok(findInCatalogue("気象衛星").every((entry) => entry.group === "weather"));
  assert.equal(findInCatalogue("気象衛星").length, CATALOGUE.filter((entry) => entry.group === "weather").length);
  assert.deepEqual(findInCatalogue("気象 衛星"), []);
  assert.deepEqual(findInCatalogue("バンガード"), []);
  assert.deepEqual(findInCatalogue("ＨＳＴ").map((entry) => entry.name), ["HST"]);
  assert.equal(findInCatalogue("２５５４４")[0]?.name, "ISS (ZARYA)");
});
