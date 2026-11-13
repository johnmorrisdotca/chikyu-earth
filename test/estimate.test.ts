import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { toElementSet } from "../src/satellites/source.ts";

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("./recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Snapshot;
const rows = (name: string): ElementSet[] => snapshot.groups[name]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);
const stations = rows("stations");
const starlink = rows("starlink");
const iss = stations.find((set) => set.NORAD_CAT_ID === 25544)!;
const DAY = 86_400_000;
const EPOCH = Date.parse(`${iss.EPOCH}Z`);
const at = (days: number): number => EPOCH + days * DAY;
const out = new Float32Array(3);

/** Place a group of one at a moment with the clock the test gives: the group's own `at` and what it says. */
function place(set: ElementSet, days: number, options = {}): { placed: boolean; estimated: boolean; days: number; km: number } {
  const group = createSatellites([set], options);
  group.at(at(days), out);
  const info = group.info(0, at(days));
  return { placed: group.visible(0), estimated: group.estimated(0), days: info?.estimatedDays ?? -1, km: Math.hypot(out[0]!, out[1]!, out[2]!) * 6371 - 6371 };
}

test("off, as ever: placed 20 days from its elements, left out 36 days from them, and never an estimate", () => {
  const near = place(iss, 20);
  assert.equal(near.placed, true);
  assert.equal(near.estimated, false);
  const far = place(iss, 36);
  assert.equal(far.placed, false, "36 days is past the 30-day limit");
  assert.equal(createSatellites([iss]).estimateFar, false);
});

test("estimate-far: +20 days is not an estimate, +36 and +400 days are, with how far they are from the elements", () => {
  const near = place(iss, 20, { estimateFar: true });
  assert.equal(near.placed, true);
  assert.equal(near.estimated, false, "inside the limit it is the ordinary place");
  assert.ok(Math.abs(near.days - 20) < 1e-6);
  const far = place(iss, 36, { estimateFar: true });
  assert.equal(far.placed, true);
  assert.equal(far.estimated, true);
  assert.ok(Math.abs(far.days - 36) < 1e-6);
  assert.ok(far.km > 300 && far.km < 500, `36 days on it is still about where the ISS flies: ${far.km.toFixed(0)} km`);
  const later = place(iss, 400, { estimateFar: true });
  assert.equal(later.placed, true);
  assert.equal(later.estimated, true);
  assert.ok(Math.abs(later.days - 400) < 1e-6);
  const before = place(iss, -400, { estimateFar: true });
  assert.equal(before.placed, true, "the ISS flew 400 days before these elements");
  assert.equal(before.estimated, true);
  assert.ok(Math.abs(before.days - 400) < 1e-6, "the distance is a size, not a sign");
});

test("the same elements give the same place with the option on and off wherever both place it", () => {
  const off = createSatellites([iss]);
  const on = createSatellites([iss], { estimateFar: true });
  const a = new Float32Array(3);
  const b = new Float32Array(3);
  off.at(at(10), a);
  on.at(at(10), b);
  assert.deepEqual([...a], [...b]);
});

test("a satellite launched after the moment is not placed, one launched before it is, and the launch year of its designator is the earliest", () => {
  const launched = { ...iss, LAUNCH_DATE: "2026-06-01" };
  assert.equal(place(launched, -400, { estimateFar: true }).placed, false, "-400 days is September 2025: before its launch");
  assert.equal(place(launched, 36, { estimateFar: true }).placed, true);
  assert.equal(place(launched, -150, { estimateFar: true }).placed, true, "-150 days is 5 June 2026: four days after the launch");
  assert.equal(place(launched, -155, { estimateFar: true }).placed, false, "-155 days is 31 May: the day before it");
  const byYear = { ...iss, OBJECT_ID: "2026-050A" };
  assert.equal(place(byYear, -400, { estimateFar: true }).placed, false, "the year of 2026-050A starts in 2026");
  assert.equal(place(byYear, 36, { estimateFar: true }).placed, true);
  assert.equal(place({ ...iss, OBJECT_ID: undefined }, -400, { estimateFar: true }).placed, true, "nothing says when it was launched");
});

test("a satellite is not placed after its decay date, and the day of the decay is still its own", () => {
  const decayed = { ...iss, DECAY_DATE: "2026-12-01" };
  assert.equal(place(decayed, 20, { estimateFar: true }).placed, true, "22 November");
  assert.equal(place(decayed, 29, { estimateFar: true }).placed, true, "1 December, the day it decayed");
  assert.equal(place(decayed, 36, { estimateFar: true }).placed, false, "8 December");
  assert.equal(place(decayed, 400, { estimateFar: true }).placed, false);
});

test("a low orbit carried far on is left out when SGP4 brings it down: never inside the Earth, and not counted as placed", () => {
  const low: ElementSet = { ...iss, NORAD_CAT_ID: 99001, OBJECT_NAME: "LOW", MEAN_MOTION: 16.35, BSTAR: 0.02, OBJECT_ID: undefined };
  const group = createSatellites([low], { estimateFar: true });
  group.at(at(400), out);
  assert.equal(group.visible(0), false);
  assert.equal(group.placed, 0);
  assert.equal(group.estimatedCount, 0);
  assert.deepEqual([...out], [0, 0, 0], "it is not drawn anywhere, least of all inside the Earth");
  const exact = new Float64Array(6);
  assert.equal(group.exact(0, at(400), exact), false);
});

test("of 2,000 Starlink satellites carried 400 days on, every one that is placed is above 120 km, and some are left out", () => {
  const group = createSatellites(starlink.slice(0, 2000), { estimateFar: true });
  const positions = new Float32Array(group.count * 3);
  group.at(at(400), positions);
  let placed = 0;
  for (let i = 0; i < group.count; i += 1) {
    if (!group.visible(i)) continue;
    placed += 1;
    assert.ok(group.estimated(i));
    const km = Math.hypot(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!) * 6371 - 6371;
    assert.ok(km >= 120, `satellite ${i} is ${km.toFixed(0)} km up`);
  }
  assert.equal(group.placed, placed);
  assert.equal(group.estimatedCount, placed);
  assert.ok(placed < group.count, "some satellites have come down by then");
});

test("turning the option on or off places the group again at once, and info says how far from the elements", () => {
  const group = createSatellites([iss]);
  group.at(at(36), out);
  assert.equal(group.visible(0), false);
  group.estimateFar = true;
  group.at(at(36), out);
  assert.equal(group.visible(0), true);
  assert.equal(group.estimatedCount, 1);
  const info = group.info(0, at(36))!;
  assert.equal(info.estimated, true);
  assert.ok(Math.abs(info.estimatedDays - 36) < 1e-6);
  group.estimateFar = false;
  group.at(at(36), out);
  assert.equal(group.visible(0), false);
  assert.equal(group.estimatedCount, 0);
  assert.equal(group.info(0, at(10))!.estimated, false);
});

test("the launch and decay dates a source carries are kept, and bad ones are ignored", () => {
  const set = toElementSet({ ...iss, LAUNCH_DATE: "2026-06-01", DECAY_DATE: "2026-12-01" }) as ElementSet;
  assert.equal(set.LAUNCH_DATE, "2026-06-01");
  assert.equal(set.DECAY_DATE, "2026-12-01");
  const odd = { ...iss, LAUNCH_DATE: "not a date" };
  assert.equal(place(odd, -400, { estimateFar: true }).placed, true, "a date that is not one says nothing");
});
