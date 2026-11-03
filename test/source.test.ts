import test from "node:test";
import assert from "node:assert/strict";
import { ElementSourceError, createSatellites, fetchElements, forgetElements, parseElements, type ElementSet } from "../src/satellites/index.ts";
import { madeUp, madeUpTle as tleOf } from "./madeup-elements.ts";

const EPOCH = "2026-11-03T12:00:00";
const sets = madeUp("gps", 4, EPOCH) as unknown as ElementSet[];
const checksum = (line: string): number => [...line].reduce((sum, ch) => sum + (ch >= "0" && ch <= "9" ? Number(ch) : ch === "-" ? 1 : 0), 0) % 10;

const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("OMM JSON: an array or one object, numbers as numbers or as text; a set that is missing a number is skipped with the reason", () => {
  const text = JSON.stringify([...sets, { ...sets[0], OBJECT_NAME: "NO MOTION", MEAN_MOTION: undefined }, { ...sets[0], OBJECT_NAME: "TEXT NUMBERS", NORAD_CAT_ID: "42", MEAN_MOTION: "2.0057" }, 7]);
  const parsed = parseElements(text);
  assert.equal(parsed.format, "omm-json");
  assert.equal(parsed.sets.length, 5);
  assert.equal(parsed.sets[4]!.NORAD_CAT_ID, 42);
  assert.equal(parsed.skipped.length, 2);
  assert.match(parsed.skipped.find((one) => one.name === "NO MOTION")!.reason, /MEAN_MOTION/);
  assert.equal(parseElements(JSON.stringify(sets[0])).sets.length, 1);
  assert.throws(() => parseElements("{ not json"), /JSON/);
});

test("OMM CSV: a header row, then a satellite a row, with quoted names", () => {
  const head = "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,NORAD_CAT_ID,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
  const row = (s: ElementSet, name: string): string => [name, s.OBJECT_ID, s.EPOCH, s.MEAN_MOTION, s.ECCENTRICITY, s.INCLINATION, s.RA_OF_ASC_NODE, s.ARG_OF_PERICENTER, s.MEAN_ANOMALY, s.NORAD_CAT_ID, s.BSTAR, s.MEAN_MOTION_DOT, s.MEAN_MOTION_DDOT].join(",");
  const parsed = parseElements(`${head}\r\n${row(sets[0]!, '"MADE-UP, WITH ""QUOTES"""')}\r\n${row(sets[1]!, "PLAIN")}\r\n`);
  assert.equal(parsed.format, "omm-csv");
  assert.deepEqual(parsed.sets.map((set) => set.OBJECT_NAME), ['MADE-UP, WITH "QUOTES"', "PLAIN"]);
  assert.equal(parsed.sets[1]!.NORAD_CAT_ID, sets[1]!.NORAD_CAT_ID);
});

test("TLE, three lines or two: the numbers come out as the OMM's, and a wrong checksum or a mixed pair is skipped", () => {
  const original = { ...sets[0]!, NORAD_CAT_ID: 25544, BSTAR: 0.00010620, MEAN_MOTION_DOT: 0.00005437, MEAN_MOTION_DDOT: 0 };
  const parsed = parseElements(`${tleOf(original)}\n${tleOf({ ...sets[1]!, NORAD_CAT_ID: 25545 }, false)}\n`);
  assert.equal(parsed.format, "tle");
  assert.equal(parsed.sets.length, 2);
  const one = parsed.sets[0]!;
  assert.equal(one.OBJECT_NAME, original.OBJECT_NAME);
  assert.equal(parsed.sets[1]!.OBJECT_NAME, "NORAD 25545");
  assert.equal(one.NORAD_CAT_ID, 25544);
  near(Date.parse(`${one.EPOCH}Z`), Date.parse(`${original.EPOCH}Z`), 2, "epoch");
  near(one.MEAN_MOTION, original.MEAN_MOTION, 1e-8, "mean motion");
  near(one.ECCENTRICITY, original.ECCENTRICITY, 1e-7, "eccentricity");
  near(one.INCLINATION, original.INCLINATION, 1e-4, "inclination");
  near(one.RA_OF_ASC_NODE, original.RA_OF_ASC_NODE, 1e-4, "raan");
  near(one.MEAN_ANOMALY, original.MEAN_ANOMALY, 1e-4, "mean anomaly");
  near(one.BSTAR, original.BSTAR, 1e-8, "bstar");
  near(one.MEAN_MOTION_DOT, original.MEAN_MOTION_DOT, 1e-9, "ndot");
  const good = tleOf({ ...sets[2]!, NORAD_CAT_ID: 30003 });
  const bad = good.replace(/\n(1 .{66})\d/, (_, line: string) => `\n${line}${(checksum(line) + 1) % 10}`);
  const mixed = parseElements(`${good}\n${bad.replace("MADE-UP GPS 3", "MADE-UP BAD")}`);
  assert.equal(mixed.sets.length, 1);
  assert.match(mixed.skipped[0]!.reason, /checksum/);
  const two = tleOf({ ...sets[3]!, NORAD_CAT_ID: 30004 }, false).split("\n");
  assert.match(parseElements(`${two[0]}\n${two[1]!.replace(/^2 \d{5}/, "2 99999").slice(0, 68)}${checksum(two[1]!.replace(/^2 \d{5}/, "2 99999").slice(0, 68))}`).skipped[0]!.reason, /different satellites/);
  assert.throws(() => parseElements("hello"), /not OMM/);
});

test("what is read from a TLE can be flown: the same place as the OMM's elements, to a few metres", () => {
  const original = { ...sets[1]!, NORAD_CAT_ID: 30002 };
  const fromTle = parseElements(tleOf(original)).sets[0]!;
  const at = Date.parse(`${original.EPOCH}Z`) + 3_600_000;
  const a = new Float64Array(6);
  const b = new Float64Array(6);
  assert.ok(createSatellites([original]).exact(0, at, a));
  assert.ok(createSatellites([fromTle]).exact(0, at, b));
  near(Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) * 6371, 0, 0.5, "km apart");
});

// A made-up source: a fetch that answers what it is told and counts the asks. No request leaves the test.
function madeUpSource(answers: (string | number)[], body = JSON.stringify(sets)) {
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    asked.push({ url, init });
    const answer = answers[Math.min(asked.length - 1, answers.length - 1)]!;
    if (typeof answer === "number") return new Response(answer === 200 ? body : "no", { status: answer });
    return new Response(answer, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, asked };
}
const memoryStore = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
};
const URL1 = "https://elements.example.test/gps.json";

test("fetchElements asks once, then returns the answer it has until two hours are over, and asks again after", async () => {
  forgetElements();
  const made = madeUpSource([200]);
  let clock = Date.parse("2026-11-03T12:00:00Z");
  const options = { fetch: made.fetchFn, now: () => clock, store: null };
  const first = await fetchElements(URL1, options);
  assert.equal(first.fromCache, false);
  assert.equal(first.sets.length, 4);
  clock += 3_600_000;
  const second = await fetchElements(URL1, options);
  assert.equal(second.fromCache, true);
  assert.equal(second.retrievedAt, first.retrievedAt);
  assert.equal(made.asked.length, 1);
  clock += 2 * 3_600_000;
  assert.equal((await fetchElements(URL1, options)).fromCache, false);
  assert.equal(made.asked.length, 2);
  assert.equal(made.asked[0]!.init?.credentials, "omit");
  assert.equal(made.asked[0]!.init?.referrerPolicy, "no-referrer");
});

test("an answer that is not 200 stops the asking for an hour, and the answer already read is used meanwhile", async () => {
  forgetElements();
  const made = madeUpSource([200, 403, 200]);
  let clock = Date.parse("2026-11-03T12:00:00Z");
  const options = { fetch: made.fetchFn, now: () => clock, store: null };
  await fetchElements(URL1, options);
  clock += 3 * 3_600_000;
  const kept = await fetchElements(URL1, options);
  assert.equal(kept.fromCache, true, "the 403 did not lose what was read");
  assert.equal(made.asked.length, 2);
  clock += 600_000;
  assert.equal((await fetchElements(URL1, options)).fromCache, true);
  assert.equal(made.asked.length, 2, "left alone: no third ask within the hour");
  clock += 3_600_000;
  assert.equal((await fetchElements(URL1, options)).fromCache, false);
  assert.equal(made.asked.length, 3);
});

test("a source that never answered 200 throws with its status and when it may be asked again, and is not asked again meanwhile", async () => {
  forgetElements();
  const made = madeUpSource([429]);
  let clock = Date.parse("2026-11-03T12:00:00Z");
  const options = { fetch: made.fetchFn, now: () => clock, store: null };
  const error = await fetchElements(URL1, options).catch((e: unknown) => e);
  assert.ok(error instanceof ElementSourceError);
  assert.equal(error.status, 429);
  assert.equal(error.retryAt, clock + 3_600_000);
  await assert.rejects(fetchElements(URL1, options), /left alone/);
  assert.equal(made.asked.length, 1);
  clock += 3_700_000;
  await assert.rejects(fetchElements(URL1, options), /429/);
  assert.equal(made.asked.length, 2);
});

test("only https addresses are asked (http on localhost only), nothing is asked for a refused address, and too big or unreadable answers are refused", async () => {
  forgetElements();
  const made = madeUpSource([200]);
  const options = { fetch: made.fetchFn, store: null };
  await assert.rejects(fetchElements("http://elements.example.test/a.json", options), /https/);
  await assert.rejects(fetchElements("ftp://elements.example.test/a.json", options), /https/);
  await assert.rejects(fetchElements("not an address", options), /not an address/);
  assert.equal(made.asked.length, 0);
  await fetchElements("http://localhost:8200/elements.json", options);
  assert.equal(made.asked.length, 1);
  await assert.rejects(fetchElements("https://elements.example.test/big.json", { ...options, maxBytes: 100 }), /over the 100/);
  await assert.rejects(fetchElements("https://elements.example.test/many.json", { ...options, maxSets: 2 }), /over the 2 allowed/);
  const html = madeUpSource(["<html>nope</html>"]);
  await assert.rejects(fetchElements("https://elements.example.test/html.json", { fetch: html.fetchFn, store: null }), /not OMM/);
});

test("the answer is kept between page loads in the store, and a refusal too", async () => {
  forgetElements();
  const store = memoryStore();
  const made = madeUpSource([200]);
  let clock = Date.parse("2026-11-03T12:00:00Z");
  await fetchElements(URL1, { fetch: made.fetchFn, now: () => clock, store });
  forgetElements();
  clock += 1000;
  const again = await fetchElements(URL1, { fetch: made.fetchFn, now: () => clock, store });
  assert.equal(again.fromCache, true);
  assert.equal(made.asked.length, 1);
  forgetElements();
  const refusing = madeUpSource([500]);
  const other = "https://elements.example.test/other.json";
  await assert.rejects(fetchElements(other, { fetch: refusing.fetchFn, now: () => clock, store }));
  forgetElements();
  await assert.rejects(fetchElements(other, { fetch: refusing.fetchFn, now: () => clock + 60_000, store }), /left alone/);
  assert.equal(refusing.asked.length, 1);
});
