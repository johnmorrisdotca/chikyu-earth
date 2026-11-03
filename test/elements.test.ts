import test from "node:test";
import assert from "node:assert/strict";
import { SATELLITE_GROUPS } from "../src/satellites/catalogue.ts";
import { FIELDS, THIN, buildAll, buildGroup, type GroupFile } from "../scripts/elements.ts";
import { madeUp } from "./madeup-elements.ts";

const GP = SATELLITE_GROUPS.find((group) => group.id === "gps")!;
const STARLINK = SATELLITE_GROUPS.find((group) => group.id === "starlink")!;

test("a group file has one row of numbers for each satellite, in catalogue order, with no repeats", () => {
  const raw = [...madeUp("gps", 5, "2026-11-03T12:00:00"), ...madeUp("gps", 2, "2026-11-03T12:00:00")].reverse();
  const file = buildGroup(GP, raw, "2026-11-03T16:00Z");
  assert.equal(file.rows.length, 5);
  assert.equal(file.all, 5);
  assert.deepEqual(file.rows.map((row) => row[0]), [...file.rows.map((row) => row[0] as number)].sort((a, b) => a - b));
  assert.equal(file.rows[0]!.length, FIELDS.length);
  assert.equal(file.fields[0], "NORAD_CAT_ID");
});

test("a thinned group keeps every Nth satellite and says how many there were", () => {
  const file = buildGroup(STARLINK, madeUp("starlink", 50, "2026-11-03T12:00:00"), "2026-11-03T16:00Z");
  assert.equal(THIN["starlink"], 5);
  assert.equal(file.rows.length, 10);
  assert.equal(file.all, 50);
});

test("the manifest lists what was downloaded, takes the oldest time, and the index gives each satellite once, in the first group that has it", () => {
  const built = buildAll((group) => {
    if (group.id === "gps") return { raw: madeUp("gps", 4, "2026-11-03T12:00:00"), retrieved: "2026-11-03T16:00Z" };
    if (group.id === "stations") return { raw: [...madeUp("stations", 2, "2026-11-03T12:00:00"), ...madeUp("gps", 1, "2026-11-03T12:00:00")], retrieved: "2026-11-03T10:00Z" };
    if (group.id === "galileo") return { raw: [], retrieved: "2026-11-03T16:00Z" };
    return undefined;
  });
  assert.deepEqual(Object.keys(built.manifest.groups), ["stations", "gps"]);
  assert.equal(built.manifest.retrieved, "2026-11-03T10:00Z");
  const index = built.files["index.json"] as { rows: [number, string, string][] };
  const ids = index.rows.map((row) => row[0]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(index.rows.filter((row) => row[2] === "stations").length, 3);
  assert.equal(index.rows.filter((row) => row[2] === "gps").length, 3);
  assert.ok((built.files["gps.json"] as GroupFile).rows.length === 4);
});

test("a made-up satellite is a made-up one", () => {
  for (const set of madeUp("geostationary", 3, "2026-11-03T12:00:00")) assert.match(set.OBJECT_NAME, /^MADE-UP /);
});
