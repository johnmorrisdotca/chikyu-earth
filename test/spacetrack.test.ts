// Space-Track as the second source, on a made-up Space-Track and a recorded answer (test/recorded/spacetrack-gp-2026-11-08.json): no test makes a request, and the login used here is not a real one.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { SATELLITE_GROUPS } from "../src/satellites/catalogue.ts";
import { FALLBACK_AFTER_MS, FIELDS, SPACETRACK_MIN_AGE_MS, buildAll, filesOf, fillFromSpaceTrack, type GroupFile } from "../scripts/elements.ts";
import { CITATION, IDS_PER_ASK, SPACETRACK, gpPath, loginFrom, toRaw, withSession, type Reply, type Send } from "../scripts/spacetrack.ts";
import { madeUp } from "./madeup-elements.ts";

const RECORDED = JSON.parse(readFileSync(new URL("./recorded/spacetrack-gp-2026-11-08.json", import.meta.url), "utf8")) as Record<string, string>[];
const LOGIN = { user: "made-up-user", password: "made-up-password" };
const NOW = Date.parse("2026-11-08T12:00:00Z");
const hoursAgo = (hours: number): string => new Date(NOW - hours * 3_600_000).toISOString().slice(0, 16) + "Z";

interface Made {
  send: Send;
  seen: { url: string; method: string; body?: string; cookie?: string }[];
  pauses: () => number;
  pause: (ms: number) => Promise<void>;
}
/** A made-up Space-Track: a login that works (or not), GP asks answered with the recorded sets renumbered, and a failure at the n-th GP ask if told. */
function madeUpSpaceTrack(options: { loginBody?: string; loginStatus?: number; failAt?: number; failStatus?: number } = {}): Made {
  const seen: Made["seen"] = [];
  let gpAsks = 0;
  let pauses = 0;
  const reply = (status: number, body: string, cookies: string[] = []): Reply => ({ status, text: async () => body, cookies: () => cookies });
  const send: Send = async (url, init = {}) => {
    seen.push({ url, method: init.method ?? "GET", body: init.body, cookie: init.cookie });
    if (url.endsWith("/ajaxauth/login")) return reply(options.loginStatus ?? 200, options.loginBody ?? "", options.loginStatus && options.loginStatus !== 200 ? [] : ["chocolatechip=made-up-session; path=/; HttpOnly"]);
    if (url.endsWith("/ajaxauth/logout")) return reply(200, "");
    gpAsks += 1;
    if (options.failAt === gpAsks) return reply(options.failStatus ?? 500, "");
    const ids = /NORAD_CAT_ID\/([\d,]+)\//.exec(url)![1]!.split(",");
    return reply(200, JSON.stringify(ids.map((id, index) => ({ ...RECORDED[index % RECORDED.length]!, NORAD_CAT_ID: id, OBJECT_NAME: `MADE-UP ${id}`, EPOCH: "2026-11-08T04:00:00.000000" }))));
  };
  return { send, seen, pause: async () => void (pauses += 1), pauses: () => pauses };
}

/** Group files as CelesTrak's round leaves them, each retrieved `hours` ago. */
function filesFrom(ages: Record<string, number>, count = 3): Record<string, GroupFile> {
  const all = { famous: 1, ...ages };
  return filesOf(buildAll((group) => (group.id in all ? { raw: madeUp(group, count, "2026-11-01T12:00:00"), retrieved: hoursAgo(all[group.id as keyof typeof all]!) } : undefined)));
}

test("the login comes from the environment first, from the file only when neither variable is set, and nowhere else", () => {
  const file = `${mkdtempSync(`${tmpdir()}/spacetrack-`)}/spacetrack.env`;
  writeFileSync(file, "# a note\nSPACETRACK_USER=file-user\nSPACETRACK_PASSWORD=file-password\n");
  assert.deepEqual(loginFrom({ SPACETRACK_USER: "env-user", SPACETRACK_PASSWORD: "env-password" }, file), { user: "env-user", password: "env-password" });
  assert.deepEqual(loginFrom({}, file), { user: "file-user", password: "file-password" });
  assert.equal(loginFrom({ SPACETRACK_USER: "env-user" }, file), undefined, "half a login in the environment does not borrow the file");
  assert.equal(loginFrom({}, `${file}.nothing`), undefined);
});

test("the GP ask names the catalogue numbers and the fields the files keep, and the recorded answer becomes numbers", () => {
  const path = gpPath([20580, 25544]);
  assert.match(path, /^\/basicspacedata\/query\/class\/gp\/NORAD_CAT_ID\/20580,25544\/orderby\/NORAD_CAT_ID%20asc\/predicates\/NORAD_CAT_ID,OBJECT_NAME,/);
  assert.ok(path.endsWith("/format/json"));
  assert.ok(!/identity|password/i.test(path));
  const sets = toRaw(RECORDED);
  assert.deepEqual(sets.map((set) => set.NORAD_CAT_ID), [20580, 25544, 26407]);
  assert.equal(sets[0]!.OBJECT_NAME, "HST");
  assert.equal(typeof sets[0]!["MEAN_MOTION"], "number");
  assert.ok(Math.abs((sets[0]!["MEAN_MOTION"] as number) - 15.32215546) < 1e-9);
  assert.equal(sets[1]!["EPOCH"], "2026-11-08T04:12:35.430048");
  for (const field of FIELDS) assert.ok(field in sets[2]!, field);
});

test("a session logs in with the login in the request body only, sends the cookie, pauses between asks and always logs out", async () => {
  const made = madeUpSpaceTrack();
  const result = await withSession(LOGIN, made.send, made.pause, 6000, async (ask) => [await ask(gpPath([1])), await ask(gpPath([2])), await ask(gpPath([3]))]);
  assert.equal(result.length, 3);
  assert.equal(made.pauses(), 2);
  const [login, ...rest] = made.seen;
  assert.equal(login!.url, `${SPACETRACK}/ajaxauth/login`);
  assert.equal(login!.method, "POST");
  assert.match(login!.body!, /identity=made-up-user&password=made-up-password/);
  for (const one of made.seen) assert.ok(!one.url.includes("made-up-user") && !one.url.includes("made-up-password"), "the login is never in an address");
  assert.ok(rest.every((one) => one.cookie === "chocolatechip=made-up-session"));
  assert.ok(made.seen.at(-1)!.url.endsWith("/ajaxauth/logout"));
});

test("a refused login stops before any ask; any answer that is not 200 stops the asking, and the session still logs out", async () => {
  for (const options of [{ loginBody: '{"Login":"Failed"}' }, { loginStatus: 401 }]) {
    const made = madeUpSpaceTrack(options);
    await assert.rejects(withSession(LOGIN, made.send, made.pause, 0, async (ask) => ask(gpPath([1]))), /login refused/);
    assert.equal(made.seen.length, 1);
  }
  for (const status of [429, 500]) {
    const made = madeUpSpaceTrack({ failAt: 2, failStatus: status });
    await assert.rejects(withSession(LOGIN, made.send, made.pause, 0, async (ask) => [await ask(gpPath([1])), await ask(gpPath([2])), await ask(gpPath([3]))]), new RegExp(`answer ${status}`));
    assert.equal(made.seen.filter((one) => one.url.includes("class/gp")).length, 2, "no ask after the failure");
    assert.ok(made.seen.at(-1)!.url.endsWith("/ajaxauth/logout"));
  }
});

test("a group CelesTrak left stale is filled from Space-Track, with its members kept, the source named and the credit in the manifest", async () => {
  const files = filesFrom({ gps: 20, stations: 3 });
  const made = madeUpSpaceTrack();
  const { built, log } = await fillFromSpaceTrack(files, LOGIN, made.send, made.pause, NOW);
  const gps = built.files["gps.json"] as GroupFile;
  assert.equal(gps.source, "spacetrack");
  assert.equal(gps.retrieved, "2026-11-08T12:00Z");
  assert.deepEqual(gps.rows.map((row) => row[0]), files["gps"]!.rows.map((row) => row[0]));
  assert.equal(typeof gps.rows[0]![4], "number");
  assert.equal((built.files["stations.json"] as GroupFile).source, undefined, "a fresh group is left as CelesTrak made it");
  assert.equal(built.manifest.groups["gps"]!.source, "spacetrack");
  assert.equal(built.manifest.groups["stations"]!.source, undefined);
  assert.ok(built.manifest.source.includes(CITATION));
  assert.ok(log.includes("Space-Track gps: 3"));
  assert.equal(made.seen.filter((one) => one.url.includes("class/gp")).length, 1);
});

test("a thinned group keeps the count it had and is not thinned again", async () => {
  const files = filesFrom({ starlink: 20 }, 50);
  assert.equal(files["starlink"]!.rows.length, 10);
  const { built } = await fillFromSpaceTrack(files, LOGIN, madeUpSpaceTrack().send, async () => undefined, NOW);
  const starlink = built.files["starlink.json"] as GroupFile;
  assert.equal(starlink.rows.length, 10);
  assert.equal(starlink.all, 50);
  assert.equal(starlink.source, "spacetrack");
});

test("nothing is asked of Space-Track when every group is fresh, or was asked of it within a day", async () => {
  const fresh = madeUpSpaceTrack();
  const none = await fillFromSpaceTrack(filesFrom({ gps: 1, galileo: 6 }), LOGIN, fresh.send, fresh.pause, NOW);
  assert.deepEqual(fresh.seen, []);
  assert.match(none.log[0]!, /not needed/);
  assert.ok(FALLBACK_AFTER_MS >= 6 * 3_600_000 && SPACETRACK_MIN_AGE_MS >= 20 * 3_600_000);

  const files = filesFrom({ gps: 15, galileo: 15 });
  files["gps"] = { ...files["gps"]!, source: "spacetrack" };
  const made = madeUpSpaceTrack();
  const { built } = await fillFromSpaceTrack(files, LOGIN, made.send, made.pause, NOW);
  assert.equal(made.seen.filter((one) => one.url.includes("class/gp")).length, 1, "galileo only: gps came from Space-Track 15 hours ago");
  assert.equal(built.manifest.groups["gps"]!.retrieved, hoursAgo(15));
  assert.equal(built.manifest.groups["galileo"]!.source, "spacetrack");

  const old = filesFrom({ gps: 25 });
  old["gps"] = { ...old["gps"]!, source: "spacetrack" };
  const again = madeUpSpaceTrack();
  await fillFromSpaceTrack(old, LOGIN, again.send, again.pause, NOW);
  assert.equal(again.seen.filter((one) => one.url.includes("class/gp")).length, 1, "a day later it is asked again");
});

test("without a login it asks nothing, says CelesTrak only, and keeps every file", async () => {
  const files = filesFrom({ gps: 20, galileo: 30 });
  const made = madeUpSpaceTrack();
  const { built, log } = await fillFromSpaceTrack(files, undefined, made.send, made.pause, NOW);
  assert.deepEqual(made.seen, []);
  assert.equal(log.length, 1);
  assert.match(log[0]!, /no login set.*CelesTrak only.*2 stale groups/);
  assert.equal(Object.keys(built.manifest.groups).length, 3, "the two stale groups and the fresh one");
  assert.ok(!built.manifest.source.includes("Space-Track"));
  assert.equal(built.manifest.groups["gps"]!.retrieved, hoursAgo(20));
});

test("a long list is asked in chunks, and a failure keeps the groups not reached", async () => {
  const files = filesFrom({ geostationary: 30 }, IDS_PER_ASK + 5);
  const big = madeUpSpaceTrack();
  const { built } = await fillFromSpaceTrack(files, LOGIN, big.send, big.pause, NOW);
  assert.equal(big.seen.filter((one) => one.url.includes("class/gp")).length, 2);
  assert.equal((built.files["geostationary.json"] as GroupFile).rows.length, IDS_PER_ASK + 5);

  const several = filesFrom({ gps: 30, galileo: 30, beidou: 30 });
  const failing = madeUpSpaceTrack({ failAt: 2, failStatus: 500 });
  const stopped = await fillFromSpaceTrack(several, LOGIN, failing.send, failing.pause, NOW);
  assert.ok(stopped.log.some((line) => /Space-Track stopped: answer 500/.test(line)));
  assert.equal(failing.seen.filter((one) => one.url.includes("class/gp")).length, 2, "no ask after the 500");
  assert.ok(failing.seen.at(-1)!.url.endsWith("/ajaxauth/logout"));
  const sources = SATELLITE_GROUPS.filter((group) => stopped.built.manifest.groups[group.id]).map((group) => stopped.built.manifest.groups[group.id]!.source);
  assert.equal(sources.filter((one) => one === "spacetrack").length, 1, "the first group was filled, the others keep CelesTrak's last files");
});
