import test from "node:test";
import assert from "node:assert/strict";
import { SATELLITE_GROUPS } from "../src/satellites/catalogue.ts";
import { mkdtempSync, writeFileSync as write } from "node:fs";
import { tmpdir } from "node:os";
import { FIELDS, MIN_AGE_MS, SPACING_MS, THIN, buildAll, buildGroup, plan, problems, readDir, refresh, writeAll, type Answer, type GroupFile, type Raw } from "../scripts/elements.ts";
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

const NOW = Date.parse("2026-11-03T18:00:00Z");
/** A made-up CelesTrak: answers each list with made-up satellites, and records what was asked and how often a pause was made. */
function madeUpCelesTrak(fail?: { at: number; status: number }) {
  const asked: string[] = [];
  let pauses = 0;
  const ask = async (url: string): Promise<Answer> => {
    asked.push(url);
    if (fail && asked.length === fail.at) return { status: fail.status, json: async () => [] };
    const key = new URL(url).searchParams.get("GROUP") ?? `catnr-${new URL(url).searchParams.get("CATNR")}`;
    const group = SATELLITE_GROUPS.find((one) => one.celestrak === key) ?? SATELLITE_GROUPS.find((one) => one.catnr?.length);
    return { status: 200, json: async () => madeUp(group!, 3, "2026-11-03T12:00:00") as Raw[] };
  };
  return { ask, asked, pause: async () => void (pauses += 1), pauses: () => pauses };
}

test("the plan asks only CelesTrak, over https, once for each list and once for each single satellite", () => {
  const asks = plan();
  assert.ok(asks.length >= 13 && asks.length <= 22, `${asks.length} asks`);
  assert.equal(new Set(asks.map((one) => one.url)).size, asks.length);
  for (const one of asks) assert.match(one.url, /^https:\/\/celestrak\.org\/NORAD\/elements\/gp\.php\?(GROUP|CATNR)=[A-Za-z0-9-]+&FORMAT=json$/);
});

test("a refresh asks each list once with a pause between, and makes a file for every group", async () => {
  const made = madeUpCelesTrak();
  const { built, log } = await refresh(undefined, made.ask, made.pause, NOW);
  assert.equal(made.asked.length, plan().length);
  assert.equal(new Set(made.asked).size, made.asked.length);
  assert.equal(made.pauses(), made.asked.length - 1);
  assert.equal(Object.keys(built.manifest.groups).length, SATELLITE_GROUPS.length);
  assert.ok(SPACING_MS >= 5000);
  assert.ok(log.every((line) => !line.startsWith("stopped")));
  assert.equal(built.manifest.retrieved, "2026-11-03T18:00Z");
});

test("the first answer that is not 200 stops the asking, and the groups not reached keep their last files", async () => {
  const first = await refresh(undefined, madeUpCelesTrak().ask, async () => undefined, NOW - 6 * 3_600_000);
  const previous = { files: Object.fromEntries(Object.entries(first.built.files).filter(([name]) => name !== "index.json").map(([name, file]) => [name.replace(".json", ""), file as GroupFile])), manifest: first.built.manifest };
  const made = madeUpCelesTrak({ at: 4, status: 403 });
  const { built, log } = await refresh(previous, made.ask, made.pause, NOW);
  assert.equal(made.asked.length, 4, "no ask after the 403");
  assert.ok(log.some((line) => /stopped at .*403/.test(line)));
  const times = Object.values(built.manifest.groups).map((one) => one.retrieved);
  assert.ok(times.includes("2026-11-03T18:00Z") && times.includes("2026-11-03T12:00Z"), `new and old together: ${times.join(" ")}`);
  assert.equal(Object.keys(built.manifest.groups).length, SATELLITE_GROUPS.length);
});

test("a group retrieved less than about two hours ago is not asked for again", async () => {
  const first = await refresh(undefined, madeUpCelesTrak().ask, async () => undefined, NOW - 30 * 60_000);
  const previous = { files: Object.fromEntries(Object.entries(first.built.files).filter(([name]) => name !== "index.json").map(([name, file]) => [name.replace(".json", ""), file as GroupFile])), manifest: first.built.manifest };
  const made = madeUpCelesTrak();
  await refresh(previous, made.ask, made.pause, NOW);
  assert.deepEqual(made.asked, []);
  assert.ok(MIN_AGE_MS >= 105 * 60_000 && MIN_AGE_MS <= 2 * 3_600_000);
});

test("a directory of made files passes the check, and an empty or old one does not", async () => {
  const { built } = await refresh(undefined, madeUpCelesTrak().ask, async () => undefined, NOW);
  const dir = mkdtempSync(`${tmpdir()}/elements-`);
  writeAll(dir, built);
  assert.deepEqual(problems(dir, NOW), []);
  assert.ok(problems(dir, NOW + 40 * 86_400_000).some((line) => /30 days/.test(line)));
  assert.ok(problems(`${dir}/nothing`).length > 0);
  write(`${dir}/gps.json`, JSON.stringify({ ...(readDir(dir)!.files["gps"]!), rows: [] }));
  assert.ok(problems(dir, NOW).some((line) => /gps is empty/.test(line)));
});
