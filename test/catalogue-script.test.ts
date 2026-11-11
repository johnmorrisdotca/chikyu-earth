// The catalogue refresh script (scripts/catalogue.ts) on a made-up Space-Track and a recorded small sample (test/recorded/catalogue-*-sample-2026-11-11.*: Space-Track's GP and SATCAT shapes, the ISS, Hubble and NAVSTAR rows
// from the recorded answer of 2026-11-08, the rest made up). No test makes a request, and the login used here is not a real one.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { unpackAny } from "../src/catalogue/index.ts";
import { ACTIVE_URL, GP_PATH, SATCAT_PATH, SPACING_MS, buildGroups, groupOf, packBuilt, problems, readDir, refresh, satcatInfo, workingIds, writeAll, type Answer, type Manifest } from "../scripts/catalogue.ts";
import { CITATION, type Reply, type Send } from "../scripts/spacetrack.ts";

const recorded = (name: string): string => readFileSync(new URL(`./recorded/${name}`, import.meta.url), "utf8");
const GP = JSON.parse(recorded("catalogue-gp-sample-2026-11-11.json")) as Record<string, unknown>[];
const SATCAT = JSON.parse(recorded("catalogue-satcat-sample-2026-11-11.json")) as Record<string, unknown>[];
const ACTIVE = recorded("catalogue-active-sample-2026-11-11.csv");
const LOGIN = { user: "made-up-user", password: "made-up-password" };
const EVENING = Date.parse("2026-11-11T18:05:00Z");
const MORNING = Date.parse("2026-11-11T09:05:00Z");

interface Made {
  send: Send;
  asks: string[];
  ask: (url: string) => Promise<Answer>;
  celestrakAsks: string[];
  pauses: number[];
  pause: (ms: number) => Promise<void>;
}
/** A made-up Space-Track (a login that works, the recorded GP and SATCAT answers, a failure at the n-th ask if told) and a made-up CelesTrak. */
function madeUp(options: { failAt?: number; failStatus?: number; celestrak?: number } = {}): Made {
  const asks: string[] = [];
  const celestrakAsks: string[] = [];
  const pauses: number[] = [];
  let query = 0;
  const reply = (status: number, body: string, cookies: string[] = []): Reply => ({ status, text: async () => body, cookies: () => cookies });
  const send: Send = async (url) => {
    if (url.endsWith("/ajaxauth/login")) return reply(200, "", ["chocolatechip=made-up-session; path=/; HttpOnly"]);
    if (url.endsWith("/ajaxauth/logout")) return reply(200, "");
    asks.push(url.replace("https://www.space-track.org", ""));
    query += 1;
    if (options.failAt === query) return reply(options.failStatus ?? 500, "");
    return reply(200, JSON.stringify(url.includes("/class/gp/") ? GP : SATCAT));
  };
  const ask = async (url: string): Promise<Answer> => {
    celestrakAsks.push(url);
    const status = options.celestrak ?? 200;
    return { status, text: async () => ACTIVE };
  };
  return { send, asks, ask, celestrakAsks, pauses, pause: async (ms) => void pauses.push(ms) };
}

const sets = (built: ReturnType<typeof buildGroups>, id: keyof ReturnType<typeof buildGroups>["groups"]): number[] => built.groups[id].map((record) => record.set.NORAD_CAT_ID).sort((a, b) => a - b);

test("the four groups: working and inactive payloads by the active list, rocket bodies, and debris with what has no kind", () => {
  const built = buildGroups({ gp: GP, satcat: SATCAT, working: workingIds(ACTIVE) }, "2026-11-11T18:05Z");
  assert.deepEqual(sets(built, "working"), [20_580, 25_544, 26_407, 123_456, 900_001]);
  assert.deepEqual(sets(built, "inactive"), [100_000]);
  assert.deepEqual(sets(built, "rocket-bodies"), [345_678]);
  assert.deepEqual(sets(built, "debris"), [900_002, 1_000_001, 1_000_002]);
  assert.equal(built.skipped, 1, "the row with no mean motion is left out and counted");
  assert.equal(GP.length - built.skipped - 1, Object.values(built.groups).flat().length, "one record for each number: the older duplicate is dropped");
  const starlink = built.groups.working.find((record) => record.set.NORAD_CAT_ID === 123_456)!;
  assert.equal(starlink.set.EPOCH, "2026-11-08T04:00:00.000000", "the newer epoch wins");
});

test("owner, launch and size fall back on SATCAT only where the GP row has none; the kind of an unlabelled object comes from SATCAT", () => {
  const built = buildGroups({ gp: GP, satcat: SATCAT, working: new Set() }, "2026-11-11T18:05Z");
  const tba = built.groups.debris.find((record) => record.set.NORAD_CAT_ID === 1_000_002)!;
  assert.equal(tba.kind, "DEB", "SATCAT says DEBRIS for the object GP calls TBA");
  assert.equal(tba.owner, "PRC");
  assert.equal(tba.launch, "2026-08-30");
  assert.equal(tba.size, "S");
  const rocket = built.groups["rocket-bodies"][0]!;
  assert.equal(rocket.owner, "PRC");
  assert.equal(rocket.launch, "2026-07-09");
  const without = buildGroups({ gp: GP, working: new Set() }, "2026-11-11T09:05Z");
  assert.equal(without.groups.debris.find((record) => record.set.NORAD_CAT_ID === 1_000_002)?.kind, "UNK");
  assert.equal(without.satcat, null);
  assert.equal(built.satcat, "2026-11-11T18:05Z");
});

test("a payload is working only when the list says so; unknown and debris share a file but keep their kinds", () => {
  const working = new Set([1]);
  assert.equal(groupOf("PAY", 1, working), "working");
  assert.equal(groupOf("PAY", 2, working), "inactive");
  assert.equal(groupOf("RB", 1, working), "rocket-bodies");
  assert.equal(groupOf("DEB", 1, working), "debris");
  assert.equal(groupOf("UNK", 1, working), "debris");
  assert.deepEqual([...workingIds("OBJECT_NAME,NORAD_CAT_ID\nA,25544\nB,100000\nC,x\n")], [25_544, 100_000]);
  assert.throws(() => workingIds("A,B\n1,2"), /NORAD_CAT_ID/);
  assert.equal(satcatInfo([{ NORAD_CAT_ID: "5", COUNTRY: "US", LAUNCH: "1958-02-01" }, { OBJECT_NUMBER: 6 }, { NORAD_CAT_ID: "x" }]).size, 2);
});

test("the asks: one login, one gp ask with the on-orbit filter, a pause, one satcat ask (after 17:00 UTC), one CelesTrak ask", async () => {
  assert.ok(GP_PATH.includes("/class/gp/decay_date/null-val/epoch/%3Enow-10/"), "Space-Track's own filter for propagable, on-orbit objects");
  assert.ok(GP_PATH.endsWith("/format/json"));
  assert.ok(SATCAT_PATH.includes("/class/satcat/"));
  const spy = madeUp();
  const done = await refresh(undefined, LOGIN, spy.send, spy.ask, spy.pause, EVENING, true);
  assert.deepEqual(spy.asks, [GP_PATH, SATCAT_PATH]);
  assert.deepEqual(spy.celestrakAsks, [ACTIVE_URL]);
  assert.deepEqual(spy.pauses, [SPACING_MS, SPACING_MS], "a pause between the two Space-Track asks, and one before CelesTrak's");
  assert.ok(done.built);
  assert.equal(done.built.retrieved, "2026-11-11T18:05Z");
  assert.equal(done.built.satcat, "2026-11-11T18:05Z");
  assert.equal(Object.values(done.built.groups).flat().length, 10);
});

test("before 17:00 UTC satcat is not asked, and the owner and launch details come from the last files", async () => {
  const first = madeUp();
  const evening = await refresh(undefined, LOGIN, first.send, first.ask, first.pause, EVENING, true);
  const dir = mkdtempSync(`${tmpdir()}/catalogue-`);
  writeAll(dir, await packBuilt(evening.built!));
  const last = await readDir(dir);
  assert.ok(last);
  const spy = madeUp();
  const done = await refresh(last, LOGIN, spy.send, spy.ask, spy.pause, MORNING, true);
  assert.deepEqual(spy.asks, [GP_PATH], "only the gp ask");
  assert.ok(done.log.some((line) => line.includes("satcat: not asked")));
  const tba = done.built!.groups.debris.find((record) => record.set.NORAD_CAT_ID === 1_000_002)!;
  assert.equal(tba.owner, "PRC", "kept from the last files");
  assert.equal(tba.launch, "2026-08-30");
  assert.equal(done.built!.satcat, "2026-11-11T18:05Z", "the day satcat was last read is kept");
});

test("if the gp ask fails nothing is made, the last files are kept and their age is said, and nobody else is asked", async () => {
  const dir = mkdtempSync(`${tmpdir()}/catalogue-`);
  const first = madeUp();
  writeAll(dir, await packBuilt((await refresh(undefined, LOGIN, first.send, first.ask, first.pause, EVENING, true)).built!));
  const last = await readDir(dir);
  const spy = madeUp({ failAt: 1, failStatus: 503 });
  const done = await refresh(last, LOGIN, spy.send, spy.ask, spy.pause, EVENING + 30 * 3_600_000, true);
  assert.equal(done.built, undefined);
  assert.deepEqual(spy.asks, [GP_PATH], "stopped at the first answer that was not 200: no satcat ask");
  assert.equal(spy.celestrakAsks.length, 0);
  assert.ok(done.log.some((line) => line.includes("answer 503")));
  assert.ok(done.log.some((line) => line.includes("the last files are kept, retrieved 2026-11-11T18:05Z (30 hours old)")), done.log.join("\n"));
  const again = madeUp({ failAt: 1 });
  const none = await refresh(undefined, LOGIN, again.send, again.ask, again.pause, EVENING, true);
  assert.equal(none.built, undefined);
  assert.ok(none.log.some((line) => line.includes("there are no last files either")));
  const nologin = await refresh(last, undefined, spy.send, spy.ask, spy.pause, EVENING, true);
  assert.equal(nologin.built, undefined);
  assert.ok(nologin.log[0]?.includes("no Space-Track login"));
});

test("if the satcat ask fails the gp elements are still used, CelesTrak is not asked, and the working list is the last one", async () => {
  const dir = mkdtempSync(`${tmpdir()}/catalogue-`);
  const first = madeUp();
  writeAll(dir, await packBuilt((await refresh(undefined, LOGIN, first.send, first.ask, first.pause, EVENING, true)).built!));
  const last = await readDir(dir);
  const spy = madeUp({ failAt: 2, failStatus: 500 });
  const done = await refresh(last, LOGIN, spy.send, spy.ask, spy.pause, EVENING + 3_600_000, true);
  assert.ok(done.built);
  assert.equal(spy.celestrakAsks.length, 0);
  assert.deepEqual(sets(done.built, "working"), [20_580, 25_544, 26_407, 123_456, 900_001]);
  assert.equal(done.built.retrieved, "2026-11-11T19:05Z");
  assert.ok(done.log.some((line) => line.includes("Space-Track stopped: answer 500")));
});

test("if CelesTrak does not answer 200 the last working list is used, and with no last files nothing is made", async () => {
  const dir = mkdtempSync(`${tmpdir()}/catalogue-`);
  const first = madeUp();
  writeAll(dir, await packBuilt((await refresh(undefined, LOGIN, first.send, first.ask, first.pause, EVENING, true)).built!));
  const last = await readDir(dir);
  const spy = madeUp({ celestrak: 503 });
  const kept = await refresh(last, LOGIN, spy.send, spy.ask, spy.pause, EVENING + 86_400_000, true);
  assert.ok(kept.built);
  assert.equal(kept.built.working?.retrieved, "2026-11-11T18:05Z", "the working list is dated by when it was read");
  assert.equal(sets(kept.built, "working").length, 5);
  const none = madeUp({ celestrak: 503 });
  const refused = await refresh(undefined, LOGIN, none.send, none.ask, none.pause, EVENING, true);
  assert.equal(refused.built, undefined);
  assert.ok(refused.log.some((line) => line.includes("no list of working satellites")));
});

test("the files: four packed groups and a manifest with the source, the count, the time and the citation, which read back and pass the check", async () => {
  const spy = madeUp();
  const done = await refresh(undefined, LOGIN, spy.send, spy.ask, spy.pause, EVENING, true);
  const made = await packBuilt(done.built!);
  assert.deepEqual(Object.keys(made.files), ["working.pack.gz", "inactive.pack.gz", "rocket-bodies.pack.gz", "debris.pack.gz"]);
  const m = made.manifest;
  assert.equal(m.source, "Space-Track.org (USSPACECOM)");
  assert.equal(m.citation, CITATION);
  assert.equal(m.retrieved, "2026-11-11T18:05Z");
  assert.equal(m.total, 10);
  assert.match(m.note, /not everything in orbit/);
  const file = await unpackAny(made.files["debris.pack.gz"]!);
  assert.equal(file.count, 3);
  assert.deepEqual(file.meta, { group: "debris", source: "Space-Track.org (USSPACECOM)", citation: CITATION, retrieved: "2026-11-11T18:05Z", count: "3" });
  assert.deepEqual([...file.norad], [900_002, 1_000_001, 1_000_002]);
  const dir = mkdtempSync(`${tmpdir()}/catalogue-`);
  writeAll(dir, made);
  assert.deepEqual(await problems(dir, EVENING), []);
  const back = await readDir(dir);
  assert.equal(back?.previous.records.size, 10);
  assert.equal(back?.previous.working?.size, 5);
});

test("the check names what is wrong: no citation, old files, a count that is not the file's, a missing group, no manifest", async () => {
  const spy = madeUp();
  const made = await packBuilt((await refresh(undefined, LOGIN, spy.send, spy.ask, spy.pause, EVENING, true)).built!);
  const dir = mkdtempSync(`${tmpdir()}/catalogue-`);
  writeAll(dir, made);
  assert.match((await problems(dir, EVENING + 31 * 86_400_000)).join("|"), /more than 30 days/);
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8")) as Manifest;
  const write = (changed: object): void => writeFileSync(`${dir}/manifest.json`, JSON.stringify({ ...manifest, ...changed }));
  write({ citation: "" });
  assert.match((await problems(dir, EVENING)).join("|"), /no citation/);
  write({ groups: { ...manifest.groups, debris: { ...manifest.groups.debris, count: 99 } } });
  assert.match((await problems(dir, EVENING)).join("|"), /holds 3 and the manifest says 99/);
  const rest = Object.fromEntries(Object.entries(manifest.groups).filter(([id]) => id !== "debris"));
  write({ groups: rest });
  assert.match((await problems(dir, EVENING)).join("|"), /group debris is not in the manifest/);
  assert.match((await problems(`${dir}/nowhere`, EVENING)).join("|"), /missing/);
});

test("by default payloads are one group and CelesTrak is never asked; the files, the manifest and the check follow", async () => {
  const spy = madeUp();
  const done = await refresh(undefined, LOGIN, spy.send, spy.ask, spy.pause, EVENING);
  assert.equal(spy.celestrakAsks.length, 0);
  assert.deepEqual(spy.asks, [GP_PATH, SATCAT_PATH]);
  assert.ok(done.log.some((line) => line.includes("payloads are one group")));
  assert.ok(done.built);
  assert.equal(done.built.working, null);
  assert.deepEqual(sets(done.built, "payloads"), [20_580, 25_544, 26_407, 100_000, 123_456, 900_001]);
  assert.equal(done.built.groups.working.length + done.built.groups.inactive.length, 0);
  const made = await packBuilt(done.built);
  assert.deepEqual(Object.keys(made.files), ["payloads.pack.gz", "rocket-bodies.pack.gz", "debris.pack.gz"]);
  assert.equal(made.manifest.working, null);
  assert.equal(made.manifest.total, 10);
  const dir = mkdtempSync(`${tmpdir()}/catalogue-`);
  writeAll(dir, made);
  assert.deepEqual(await problems(dir, EVENING), []);
  const last = await readDir(dir);
  assert.equal(last?.previous.working, undefined);
  assert.equal(last?.previous.records.size, 10);
  const again = madeUp({ failAt: 1 });
  const kept = await refresh(last, LOGIN, again.send, again.ask, again.pause, EVENING + 3_600_000);
  assert.equal(kept.built, undefined);
  assert.ok(kept.log.some((line) => line.includes("the last files are kept")));
  const turnedOn = madeUp();
  const split = await refresh(last, LOGIN, turnedOn.send, turnedOn.ask, turnedOn.pause, EVENING + 86_400_000, true);
  assert.deepEqual(sets(split.built!, "working"), [20_580, 25_544, 26_407, 123_456, 900_001], "switching the list on splits the payloads");
});

test("the CelesTrak list is read with a CSV reader: a quoted name with a comma does not move the number", () => {
  assert.deepEqual([...workingIds('OBJECT_NAME,NORAD_CAT_ID\n"A, B",25544\n"C",100000\n')], [25_544, 100_000]);
  assert.deepEqual([...workingIds("NORAD_CAT_ID,OBJECT_NAME\n7,X\n")], [7]);
});
