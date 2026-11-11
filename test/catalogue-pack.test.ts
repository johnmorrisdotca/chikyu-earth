// The packed catalogue file: round trip, six-digit and bigger catalogue numbers, OMM JSON and CSV in, gzip, the limits (200,000 records, a gzip that unpacks to too much, a cut file), and the data door reading it. Nothing here
// asks a network: the door gets a made-up fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_PACKED, MAX_PACKED_BYTES, PackError, gzipBytes, packCatalogue, readCatalogueRecords, unpackAny, unpackCatalogue, type CatalogueRecord } from "../src/catalogue/index.ts";
import { packedElementsFrom, readElementSets, readPackedFrom } from "../src/door/index.ts";
import { elementNumbers } from "../src/door/elements.ts";
import { ElementSourceError } from "../src/satellites/index.ts";

const SAMPLE = readFileSync(new URL("./recorded/catalogue-gp-sample-2026-11-11.json", import.meta.url), "utf8");
const INFO = { id: "catalogue-test", name: { en: "Test", ja: "テスト" }, credit: { en: "Data from Space-Track.org (USSPACECOM)", ja: "データ：Space-Track.org（USSPACECOM）" }, licence: { name: "Space-Track basic SSA data, with citation", url: "https://www.space-track.org/documentation" }, url: "https://www.space-track.org", retrieved: "2026-11-11" };
const f32 = Math.fround;

const made = (id: number, over: Partial<CatalogueRecord["set"]> = {}): CatalogueRecord => ({
  set: { OBJECT_NAME: `MADE-UP ${id}`, OBJECT_ID: "2026-001A", EPOCH: "2026-11-08T04:12:35.430048", MEAN_MOTION: 15.49256954, ECCENTRICITY: 0.0007219, INCLINATION: 51.632, RA_OF_ASC_NODE: 307.5621, ARG_OF_PERICENTER: 1.6306, MEAN_ANOMALY: 358.4705, NORAD_CAT_ID: id, BSTAR: 0.00023266166, MEAN_MOTION_DOT: 0.00012511, MEAN_MOTION_DDOT: 0, ...over },
  kind: "PAY",
});

test("a record comes back with its numbers: the epoch to the microsecond, the mean motion in full, the angles to a float32", () => {
  const record: CatalogueRecord = { ...made(25544, { OBJECT_NAME: "ISS (ZARYA)", OBJECT_ID: "1998-067A" }), kind: "RB", owner: "ISS", launch: "1998-11-20", size: "L" };
  const file = unpackCatalogue(packCatalogue([record], { group: "rocket-bodies", retrieved: "2026-11-11T17:41Z" }));
  assert.equal(file.count, 1);
  assert.deepEqual(file.meta, { group: "rocket-bodies", retrieved: "2026-11-11T17:41Z" });
  const back = file.recordAt(0);
  assert.equal(back.set.EPOCH, "2026-11-08T04:12:35.430048");
  assert.equal(back.set.MEAN_MOTION, 15.49256954);
  assert.equal(back.set.NORAD_CAT_ID, 25544);
  assert.equal(back.set.OBJECT_NAME, "ISS (ZARYA)");
  assert.equal(back.set.OBJECT_ID, "1998-067A");
  for (const key of ["ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"] as const) assert.equal(back.set[key], f32(record.set[key]), key);
  assert.equal(back.kind, "RB");
  assert.equal(back.owner, "ISS");
  assert.equal(back.launch, "1998-11-20");
  assert.equal(back.size, "L");
  assert.equal(file.epochMs(0), Date.parse("2026-11-08T04:12:35.430Z") + 0.048);
});

test("six-digit, nine-digit and the largest 32-bit catalogue numbers are held; a number that is not a whole 32-bit number is refused", () => {
  const ids = [0, 99_999, 100_000, 123_456, 999_999, 1_000_001, 999_999_999, 4_294_967_295];
  const file = unpackCatalogue(packCatalogue(ids.map((id) => made(id))));
  assert.deepEqual([...file.norad], ids);
  assert.deepEqual(file.sets().map((set) => set.NORAD_CAT_ID), ids);
  for (const bad of [-1, 4_294_967_296, 1.5, Number.NaN]) assert.throws(() => packCatalogue([made(bad)]), PackError);
  assert.throws(() => packCatalogue([made(1, { MEAN_MOTION: Number.NaN })]), PackError);
  assert.throws(() => packCatalogue([made(1, { EPOCH: "not a date" })]), PackError);
});

test("a name with a tab or a new line cannot break the table, and blank owner and launch stay blank", () => {
  const file = unpackCatalogue(packCatalogue([made(1, { OBJECT_NAME: "A\tB\nC", OBJECT_ID: undefined }), made(2)]));
  assert.equal(file.nameAt(0), "A B C");
  assert.equal(file.nameAt(1), "MADE-UP 2");
  assert.equal(file.recordAt(0).set.OBJECT_ID, undefined);
  assert.equal(file.recordAt(0).owner, undefined);
  assert.equal(file.recordAt(1).launch, undefined);
  assert.equal(file.recordAt(1).size, undefined);
  assert.deepEqual(file.sets().map((set) => set.OBJECT_NAME), ["A B C", "MADE-UP 2"]);
});

test("an empty file is a file; one cut from the middle of a bigger buffer is read too", () => {
  assert.equal(unpackCatalogue(packCatalogue([])).count, 0);
  const bytes = packCatalogue([made(1), made(2), made(3)]);
  const buffer = new Uint8Array(bytes.length + 11);
  buffer.set(bytes, 3);
  const cut = buffer.subarray(3, 3 + bytes.length);
  assert.equal(cut.byteOffset % 8, 3);
  assert.deepEqual([...unpackCatalogue(cut).norad], [1, 2, 3]);
});

test("a wrong, cut or lying file is a PackError and never a wrong number", () => {
  const bytes = packCatalogue([made(1), made(2)]);
  assert.throws(() => unpackCatalogue(new Uint8Array(3)), PackError);
  assert.throws(() => unpackCatalogue(new Uint8Array(40)), PackError);
  assert.throws(() => unpackCatalogue(bytes.subarray(0, bytes.length - 1)), PackError);
  const liar = bytes.slice();
  new DataView(liar.buffer).setUint32(4, 3, true);
  assert.throws(() => unpackCatalogue(liar), PackError);
  const huge = bytes.slice();
  new DataView(huge.buffer).setUint32(4, MAX_PACKED + 1, true);
  assert.throws(() => unpackCatalogue(huge), /over the 200000/);
});

test("OMM JSON and OMM CSV in: kind, owner, launch and radar size come from the row, six-digit numbers as they are, a bad row is counted", () => {
  const json = readCatalogueRecords(SAMPLE);
  assert.equal(json.skipped, 1);
  assert.equal(json.records.length, 11);
  const byId = new Map(json.records.map((record) => [record.set.NORAD_CAT_ID, record]));
  assert.equal(byId.get(1_000_001)?.kind, "DEB");
  assert.equal(byId.get(345_678)?.kind, "RB");
  assert.equal(byId.get(1_000_002)?.kind, "UNK");
  assert.equal(byId.get(25_544)?.owner, "ISS");
  assert.equal(byId.get(20_580)?.launch, "1990-04-24");
  assert.equal(byId.get(20_580)?.size, "L");
  assert.equal(byId.get(1_000_002)?.owner, undefined);
  const csv = [
    "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,NORAD_CAT_ID,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT,OBJECT_TYPE,COUNTRY_CODE,LAUNCH_DATE,RCS_SIZE",
    '"MADE-UP, QUOTED DEB",2026-002B,2026-11-08T04:12:35,14.9,0.01,82,10,90,20,1000001,0.0001,0.00001,0,DEBRIS,US,2026-02-01,SMALL',
    "MADE-UP BAD,2026-003A,2026-11-08T04:12:35,,0.01,82,10,90,20,1000002,0.0001,0.00001,0,DEBRIS,US,2026-02-01,SMALL",
  ].join("\n");
  const read = readCatalogueRecords(csv);
  assert.equal(read.records.length, 1);
  assert.equal(read.skipped, 1);
  assert.equal(read.records[0]?.set.OBJECT_NAME, "MADE-UP, QUOTED DEB");
  assert.equal(read.records[0]?.set.NORAD_CAT_ID, 1_000_001);
  assert.equal(read.records[0]?.size, "S");
  assert.throws(() => readCatalogueRecords("1 25544U 98067A   26312.17540547  .00012511  00000-0  23266-3 0  9997"), /not OMM/);
  assert.throws(() => readCatalogueRecords("[not json"), /not/);
});

test("gzip: a packed file is read whether or not it is gzipped, and a gzip that unpacks to too much is refused before it is held", async () => {
  const bytes = packCatalogue([made(1), made(2)], { group: "debris" });
  const zipped = await gzipBytes(bytes);
  assert.deepEqual([zipped[0], zipped[1]], [0x1f, 0x8b]);
  assert.deepEqual([...(await unpackAny(zipped)).norad], [1, 2]);
  assert.deepEqual([...(await unpackAny(bytes)).norad], [1, 2]);
  assert.equal((await unpackAny(zipped)).meta["group"], "debris");
  const bomb = await gzipBytes(new Uint8Array(MAX_PACKED_BYTES + 1024));
  assert.ok(bomb.length < 100_000, `the bomb is ${bomb.length} bytes`);
  await assert.rejects(unpackAny(bomb), PackError);
  await assert.rejects(unpackAny(Uint8Array.of(0x1f, 0x8b, 1, 2, 3, 4)), PackError);
});

/** A made-up fetch that answers one body once, and says what it was asked. */
function madeUpFetch(body: Uint8Array, init: { status?: number; headers?: Record<string, string> } = {}): { fetch: typeof fetch; seen: { url: string; init: RequestInit | undefined }[] } {
  const seen: { url: string; init: RequestInit | undefined }[] = [];
  const fake = (async (url: string | URL | Request, options?: RequestInit) => {
    seen.push({ url: String(url), init: options });
    return new Response(body as BodyInit, { status: init.status ?? 200, headers: init.headers });
  }) as typeof fetch;
  return { fetch: fake, seen };
}

test("200,000 records pack, gzip, unpack and go through the data door: all of them, six-digit numbers and all", async () => {
  const records: CatalogueRecord[] = [];
  for (let i = 0; i < MAX_PACKED; i += 1) {
    records.push({ ...made(100_000 + i, { OBJECT_NAME: `OBJECT ${100_000 + i}`, MEAN_ANOMALY: (i * 7.31) % 360, EPOCH: `2026-11-0${1 + (i % 8)}T0${i % 10}:12:35.430048` }), kind: i % 3 === 0 ? "DEB" : "RB" });
  }
  const bytes = packCatalogue(records, { group: "debris" });
  assert.ok(bytes.length < 200_000 * 100, `${bytes.length} bytes for 200,000 is ${(bytes.length / 200_000).toFixed(0)} a record`);
  const zipped = await gzipBytes(bytes);
  assert.ok(zipped.length < bytes.length * 0.6, `gzip: ${zipped.length} of ${bytes.length}`);
  const { fetch: fake, seen } = madeUpFetch(zipped, { headers: { "content-length": String(zipped.length) } });
  const read = await readElementSets(packedElementsFrom("https://example.org/catalogue/debris.pack.gz", INFO, { fetch: fake }), new AbortController().signal);
  assert.equal(read.status, "ok");
  assert.equal(read.records.length, 200_000);
  assert.equal(read.skipped, 0);
  assert.equal(read.records[199_999]?.NORAD_CAT_ID, 299_999);
  assert.equal(read.records[0]?.NORAD_CAT_ID, 100_000);
  assert.ok(elementNumbers(read.records[123_456]!).every(Number.isFinite));
  assert.equal(seen.length, 1, "asked once");
  assert.equal(seen[0]?.init?.credentials, "omit");
  assert.equal(seen[0]?.init?.referrerPolicy, "no-referrer");
  assert.equal(seen[0]?.init?.redirect, "error");
  assert.throws(() => packCatalogue([...records, made(1)]), /over the 200000/);
});

test("the door asks only a safe address once, and says why when the file cannot be read", async () => {
  const good = packCatalogue([made(100_001)]);
  const ok = madeUpFetch(good);
  assert.equal((await readPackedFrom("https://example.org/x.pack", { fetch: ok.fetch })).count, 1);
  assert.equal((await readPackedFrom("http://localhost:8200/x.pack", { fetch: madeUpFetch(good).fetch })).count, 1);
  for (const url of ["http://example.org/x.pack", "not an address", "ftp://example.org/x.pack"]) await assert.rejects(readPackedFrom(url, { fetch: ok.fetch }), ElementSourceError);
  assert.equal(ok.seen.length, 1, "the unsafe ones were never asked");
  await assert.rejects(readPackedFrom("https://example.org/x.pack", { fetch: madeUpFetch(good, { status: 503 }).fetch }), (error: unknown) => error instanceof ElementSourceError && error.status === 503);
  await assert.rejects(readPackedFrom("https://example.org/x.pack", { fetch: madeUpFetch(good, { headers: { "content-length": "9999999999" } }).fetch }), /bigger than the limit/);
  await assert.rejects(readPackedFrom("https://example.org/x.pack", { fetch: madeUpFetch(good).fetch, maxBytes: 10 }), /bigger than the limit/);
  await assert.rejects(readPackedFrom("https://example.org/x.pack", { fetch: madeUpFetch(new Uint8Array(100)).fetch }), /could not be read/);
  const refused = (async () => {
    throw new TypeError("redirect");
  }) as typeof fetch;
  await assert.rejects(readPackedFrom("https://example.org/x.pack", { fetch: refused }), /could not be reached/);
  const source = packedElementsFrom("https://example.org/x.pack", INFO, { fetch: madeUpFetch(new Uint8Array(100)).fetch });
  const failed = await readElementSets(source, new AbortController().signal);
  assert.equal(failed.status, "failed");
});
