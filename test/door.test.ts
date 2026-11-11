// The data door of the Earth (MODULES-902): the eight groups of tests the design asks for, in Node. The realistic Earth's tile set is driven with a handful of made-up three.js parts and made-up sources,
// so what a source gives, what is drawn, what is freed and what is sent are read from the tile set's own counts. The browser tests (e2e/door.demo.ts, e2e/passes.demo.ts) do the same with the real elements.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createAssetCache } from "@johnmorrisdotca/kazoku-ui/renderer";
import { OWN_SOURCES, createSourceBook, creditLine, creditsOf, earthTiles, elementsFrom, imageBytes, mapKeys, mergeElementSets, ownCredit, readElementSets, tileKeyParts, tilePlace, validateSource, MAX_RECORDS } from "../src/door/index.ts";
import type { EarthMapSource, ElementRecordSource, ImageTile, SourceInfo } from "../src/door/index.ts";
import { createTileSet, type TileSources } from "../src/realistic/tile-set.ts";
import type { ThreeParts } from "../src/realistic/textures.ts";
import type { TileCamera } from "../src/realistic/tiles.ts";
import type { ElementSet } from "../src/satellites/types.ts";

const info = (id: string, more: Partial<SourceInfo> = {}): SourceInfo => ({
  id,
  name: { en: "My maps", ja: "私の地図" },
  credit: { en: "Maps: mine, A. Person (2026)", ja: "地図：私の（A. Person、2026年）" },
  licence: { name: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/", nonCommercial: true },
  url: "https://example.org/mine",
  retrieved: "2026-11-11",
  ...more,
});

/** Yield to the event loop until `done()`, never longer than a thousand turns: what is read is the code's own state, not a time. */
async function until(done: () => boolean, what: string): Promise<void> {
  for (let turn = 0; turn < 1000 && !done(); turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(done(), `waited for ${what}`);
}

/** Just enough of three.js for the tile set to be made and driven in Node. */
function fakeThree(): ThreeParts {
  class Texture {
    image: unknown = null;
    needsUpdate = false;
    disposed = false;
    dispose(): void {
      this.disposed = true;
    }
  }
  class Material {
    uniforms: unknown;
    constructor(options: { uniforms: unknown }) {
      this.uniforms = options.uniforms;
    }
    dispose(): void {}
  }
  class Mesh {
    visible = true;
    frustumCulled = true;
    material: unknown;
    constructor(_geometry: unknown, material: unknown) {
      this.material = material;
    }
  }
  class Geometry {
    setAttribute(): void {}
    setIndex(): void {}
    dispose(): void {}
  }
  class Attribute {}
  const three = { Texture, ShaderMaterial: Material, Mesh, BufferGeometry: Geometry, BufferAttribute: Attribute, ClampToEdgeWrapping: 1, LinearMipmapLinearFilter: 2, LinearFilter: 3 };
  return three as unknown as ThreeParts;
}

const level = (n: number) => ({ level: n, width: 1024 * 2 ** n, height: 512 * 2 ** n, columns: 2 ** (n + 1), rows: 2 ** n });
const MANIFEST = { tileSize: 512, layers: { day: { levels: [0, 1, 2, 3, 4].map(level) }, night: { levels: [0, 1, 2, 3].map(level) } } };
/** The disc a zoomed-in view shows: level 3 is wanted at this radius (`tileLevel`). */
const CAMERA: TileCamera = { lon: 0, lat: 23, width: 800, height: 800, panX: 0, panY: 0, radius: 1000 };
const MOVED: TileCamera = { ...CAMERA, lon: 60, lat: -10 };
/** The Sun over the viewer: nothing in view is dark, so no night tile is wanted. */
const SUN: [number, number, number] = [0, 0, 1];

interface Rig {
  sources: TileSources;
  invalidated: number;
  set: ReturnType<typeof createTileSet>;
  assets: ReturnType<typeof createAssetCache>;
  sync(camera?: TileCamera): void;
  dispose(): void;
}

/** A tile set on made-up parts, reading the sources in `rig.sources`. */
function rig(sources: TileSources, options: { budgetBytes?: number; limit?: number } = {}): Rig {
  const assets = createAssetCache({ lingerMs: 0 });
  const state: Rig = {
    sources,
    invalidated: 0,
    assets,
    set: undefined as never,
    sync(camera = CAMERA) {
      state.set.sync(camera, SUN, true, 1);
    },
    dispose() {
      state.set.dispose();
      assets.clear();
    },
  };
  const shared = { sunDir: { value: {} }, lights: { value: 1 }, boost: { value: 0 }, ortho: { value: 1 }, water: { value: null }, night: { value: null } };
  state.set = createTileSet(
    fakeThree(),
    { add() {}, remove() {} } as never,
    shared as never,
    {
      assets,
      sources: () => state.sources,
      cap: () => 4096,
      invalidate: () => {
        state.invalidated += 1;
      },
      ...(options.budgetBytes === undefined ? {} : { budgetBytes: options.budgetBytes }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    } as never,
  );
  return state;
}

interface Made {
  source: EarthMapSource;
  calls: string[];
  aborted: string[];
  closed: string[];
}

/** A source of the day layer made in the test: every tile a flat square, on the package's pyramid, with levels 3 and 4. `mode` makes it misbehave. */
function mine(id = "mine", mode: "ok" | "hang" | "throw" | "not-a-picture" | "nan" | "nan-width" | "need-throws" | "no-levels" = "ok", layer: "day" | "night" | "*" = "day"): Made {
  const made: Made = { source: undefined as never, calls: [], aborted: [], closed: [] };
  made.source = {
    kind: "tiles",
    layer,
    info: info(id),
    ...(mode === "no-levels" ? {} : { levels: () => ({ tileSize: 512, levels: [3, 4].map((n) => ({ level: n, width: 1024 * 2 ** n })) }) }),
    need(place, detail) {
      if (mode === "need-throws") throw new Error("need() is broken");
      return mapKeys(place, detail, undefined, `${id}/`);
    },
    load(key, signal) {
      made.calls.push(key);
      if (mode === "throw") return Promise.reject(new Error(`no tile ${key}`));
      if (mode === "hang") {
        return new Promise<ImageTile>((_resolve, reject) =>
          signal.addEventListener("abort", () => {
            made.aborted.push(key);
            reject(new DOMException("aborted", "AbortError"));
          }),
        );
      }
      if (mode === "not-a-picture") return Promise.resolve({ width: 512, height: 512 } as never);
      const image = { width: 512, height: 512, close: () => made.closed.push(key) };
      return Promise.resolve({ width: mode === "nan-width" ? Number.NaN : 512, height: 512, image });
    },
    bytes: (tile) => (mode === "nan" ? Number.NaN : imageBytes(tile)),
  };
  return made;
}

/** The package's own folder, served from memory: a manifest and a flat tile for each request, counted. */
function folder(): { source: EarthMapSource; urls: string[]; closed: number[] } {
  const urls: string[] = [];
  const closed: number[] = [];
  const get = (url: string): Promise<Response> => {
    urls.push(url);
    if (url.endsWith("manifest.json")) return Promise.resolve(new Response(JSON.stringify(MANIFEST), { status: 200 }));
    return Promise.resolve(new Response(new Uint8Array(8), { status: 200 }));
  };
  const source = earthTiles("/tiles/", { fetch: get, decode: () => Promise.resolve({ width: 512, height: 512, close: () => closed.push(1) }) });
  return { source, urls, closed };
}

const settled = (set: Rig["set"]): boolean => set.stats.ready && set.stats.loading === 0;

test("1. with no source the Earth is drawn from the package's own folder of tiles, as it always was, and credits its pictures and that folder alone", async () => {
  const own = folder();
  const earth = rig({ day: own.source, night: own.source });
  earth.sync();
  await until(() => earth.set.stats.ready, "the folder's manifest");
  earth.sync();
  await until(() => settled(earth.set), "the tiles");
  earth.sync();
  const stats = earth.set.stats;
  assert.equal(stats.level, 3);
  assert.ok(stats.shown > 3 && stats.shown <= 48, `${stats.shown} tiles in view`);
  assert.equal(stats.held, stats.requested, "every tile asked for is held");
  assert.equal(stats.requested, own.urls.filter((url) => url.endsWith(".webp")).length);
  assert.ok(own.urls.filter((url) => url.endsWith(".webp")).every((url) => /^\/tiles\/day\/3\/\d+\/\d+\.webp$/.test(url)), "day tiles of level 3, from the folder");
  assert.equal(own.urls.filter((url) => url.endsWith("manifest.json")).length, 1, "the manifest is read once");
  assert.deepEqual(stats.used, { "chikyu-tiles": stats.shown });
  // credits: the package's own, and nothing else
  const book = createSourceBook({ kinds: ["tiles"] });
  const credits = creditsOf([ownCredit("chikyu-pictures", 1), ownCredit("chikyu-tiles", stats.used["chikyu-tiles"] ?? 0)], book, new Map());
  assert.deepEqual(credits.map((credit) => [credit.source.id, credit.own]), [["chikyu-pictures", true], ["chikyu-tiles", true]]);
  // before any tile is in view only the pictures are credited
  assert.deepEqual(creditsOf([ownCredit("chikyu-pictures", 1), ownCredit("chikyu-tiles", 0)], book, new Map()).map((credit) => credit.source.id), ["chikyu-pictures"]);
  earth.dispose();
  assert.equal(own.closed.length, own.urls.filter((url) => url.endsWith(".webp")).length, "every picture is let go");
});

test("2. a source of the day layer is drawn in place of the folder, exactly its tiles, and its credit has its licence in both languages", async () => {
  const day = mine();
  const earth = rig({ day: day.source });
  earth.sync();
  await until(() => earth.set.stats.ready, "the source's levels");
  earth.sync();
  await until(() => settled(earth.set), "the tiles");
  earth.sync();
  const stats = earth.set.stats;
  assert.equal(stats.level, 3);
  assert.ok(stats.shown > 3);
  assert.equal(day.calls.length, stats.requested);
  assert.ok(day.calls.every((key) => /^mine\/3\/\d+\/\d+$/.test(key)), "the keys are the source's own");
  assert.deepEqual(stats.used, { mine: stats.shown });
  const book = createSourceBook({ kinds: ["tiles"] });
  book.addSource(day.source);
  const credits = creditsOf([ownCredit("chikyu-pictures", 1)], book, new Map(Object.entries(stats.used)));
  assert.deepEqual(credits.map((credit) => [credit.source.id, credit.own, credit.used]), [["chikyu-pictures", true, 1], ["mine", false, stats.shown]]);
  const en = creditLine(credits, "en");
  const ja = creditLine(credits, "ja");
  assert.match(en, /Earth pictures: NASA Earth Observatory.*\(Public domain\); Maps: mine, A\. Person \(2026\) \(CC BY-NC 4\.0; non-commercial\)\.$/);
  assert.match(ja, /地球の画像：NASA Earth Observatory.*（パブリックドメイン）／地図：私の（A\. Person、2026年）（CC BY-NC 4\.0、非営利のみ）$/);
  assert.equal(credits[1]!.source.licence.url, "https://creativecommons.org/licenses/by-nc/4.0/");
  earth.dispose();
});

test("2b. a source with no levels has levels 3 and 4, a folder's levels come from its manifest, and the last source added for a layer is the one drawn", async () => {
  const bare = mine("bare", "no-levels");
  const earth = rig({ day: bare.source });
  earth.sync();
  await until(() => earth.set.stats.ready, "the default levels");
  earth.sync();
  await until(() => settled(earth.set), "the tiles");
  assert.ok(bare.calls.length > 0 && bare.calls.every((key) => /^bare\/3\//.test(key)));
  earth.dispose();
  const book = createSourceBook({ kinds: ["tiles"] });
  const first = mine("first");
  const second = mine("second");
  const night = mine("dark", "ok", "night");
  for (const one of [first, second, night]) book.addSource(one.source);
  assert.deepEqual(book.mapSources("day").map((source) => source.info.id), ["second", "first"]);
  assert.deepEqual(book.mapSources("night").map((source) => source.info.id), ["dark"]);
  // a folder the page adds is a source for every layer: it comes after the sources of one layer added later, and before the ones added earlier
  book.addSource(earthTiles("/tiles/"));
  assert.deepEqual(book.mapSources("day").map((source) => source.info.id), ["chikyu-tiles", "second", "first"]);
  assert.deepEqual(book.mapSources("night").map((source) => source.info.id), ["chikyu-tiles", "dark"]);
});

test("3. removing, switching off or ignoring a source gives the first picture back: its loads abort, its tiles are freed, and it can come back", async () => {
  const day = mine("mine", "hang");
  const earth = rig({ day: day.source });
  earth.sync();
  await until(() => earth.set.stats.ready, "the levels");
  earth.sync();
  await until(() => earth.set.stats.loading > 0 && day.calls.length === earth.set.stats.requested, "tiles loading");
  const started = [...day.calls];
  assert.ok(started.length > 0 && started.length <= 6, "at most six loads at once");
  // the page took the source away: the next draw finds no source, and every load it started is aborted
  earth.sources = {};
  earth.sync();
  await until(() => day.aborted.length === started.length, "the aborts");
  assert.deepEqual([...day.aborted].sort(), [...started].sort());
  assert.deepEqual(earth.set.stats, { ready: false, level: null, held: 0, shown: 0, loading: 0, failed: 0, requested: 6, heldBytes: 0, refused: 0, used: {} });
  assert.equal(earth.assets.stats().entries, 0, "nothing of it is kept");
  // and it comes back when the page puts it back
  const again = mine("mine");
  earth.sources = { day: again.source };
  earth.sync();
  await until(() => earth.set.stats.ready, "the levels again");
  await until(() => {
    earth.sync();
    return settled(earth.set) && earth.set.stats.shown > 0;
  }, "the tiles again");
  assert.ok(again.calls.length > 0);
  earth.dispose();
});

test("3b. the book's remove, enableSource and ownOnly do the same for what a view holds: a source off is out of the list, its signal aborts, and a record source is freed and read again when it comes back", async () => {
  const book = createSourceBook();
  const day = mine("mine");
  const reads = { count: 0 };
  const sets: ElementSet[] = [element(25544, "2026-11-10T00:00:00")];
  const records: ElementRecordSource = { kind: "records", info: info("rocks"), records: () => ((reads.count += 1), sets) };
  const remove = book.addSource(day.source);
  book.addSource(records);
  await book.ready();
  const signal = book.signal("mine");
  assert.deepEqual(book.elementLists().map((list) => [list.id, list.sets.length]), [["rocks", 1]]);
  assert.equal(reads.count, 1, "records are read once, when the source is added");
  book.enableSource("rocks", false);
  assert.deepEqual(book.elementLists(), []);
  assert.equal(book.isEnabled("rocks"), false);
  book.enableSource("rocks", true);
  await book.ready();
  assert.equal(reads.count, 2, "read again when switched on again");
  assert.equal(book.elementLists().length, 1);
  book.ownOnly(true);
  assert.deepEqual([book.mapSources("day").length, book.elementLists().length], [0, 0], "ignored at once");
  assert.equal(signal.aborted, true, "what was started for the source stops");
  book.ownOnly(false);
  await book.ready();
  assert.equal(book.mapSources("day").length, 1);
  remove();
  assert.equal(book.get("mine"), undefined);
  assert.equal(book.removeSource("mine"), false);
  assert.equal(book.removeSource("rocks"), true);
  assert.deepEqual(book.sources, []);
  book.dispose();
});

test("3c. a source made by earthTiles is the package's own, whatever a page calls it, and ownOnly keeps it; a source of a page cannot take an id of the package's", () => {
  const book = createSourceBook({ kinds: ["tiles"] });
  const own = earthTiles("/tiles/");
  book.addSource(own);
  book.addSource(mine().source);
  assert.equal(book.isOwn(own), true);
  assert.equal(book.isOwn(book.get("mine")!), false);
  book.ownOnly(true);
  assert.deepEqual(book.active().map((source) => source.info.id), ["chikyu-tiles"]);
  assert.throws(() => createSourceBook({ kinds: ["tiles"] }).addSource({ ...mine("chikyu-tiles").source }), /one of the package's own/);
  // two folders of the page's tiles are one source id: the second is refused, like any clash
  assert.throws(() => book.addSource(earthTiles("/other/")), /already|clash|taken/i);
});

test("4. a source with an empty credit, no licence, a clashing id, no layer or the wrong kind is refused at once and never kept", () => {
  const book = createSourceBook({ kinds: ["tiles"] });
  const good = mine("mine").source;
  const bad: [string, unknown, RegExp][] = [
    ["an empty credit", { ...good, info: info("empty", { credit: { en: "", ja: "" } }) }, /credit/i],
    ["no licence", { ...good, info: { ...info("nolicence"), licence: undefined } }, /licen[cs]e/i],
    ["a licence with no link", { ...good, info: info("nolink", { licence: { name: "CC BY 4.0", url: "" } }) }, /licen[cs]e|link|url/i],
    ["a bad id", { ...good, info: info("Not An Id") }, /id/i],
    ["no layer", { ...good, info: info("nolayer"), layer: undefined }, /layer/],
    ["an unknown layer", { ...good, info: info("odd"), layer: "relief" }, /layer/],
    ["records where only tiles are drawn", { kind: "records", info: info("rocks"), records: () => [] }, /tiles sources, not records/],
    ["no load", { ...good, info: info("noload"), load: undefined }, /load/],
    ["not an object", 7, /./],
  ];
  for (const [what, source, why] of bad) assert.throws(() => book.addSource(source), why, what);
  assert.deepEqual(book.sources, [], "nothing refused is kept");
  book.addSource(good);
  assert.throws(() => book.addSource(mine("mine").source), /already|clash|taken/i, "a clashing id");
  assert.equal(book.sources.length, 1);
  // the same check for `sources = [...]` is all or nothing (the element's setSources builds on it)
  assert.doesNotThrow(() => validateSource(good));
});

test("4b. a tile that throws, is not a picture or has a size that is not a number is counted and never drawn, and nothing is thrown at the page", async () => {
  for (const mode of ["throw", "not-a-picture", "nan", "nan-width", "need-throws"] as const) {
    const day = mine(`bad-${mode}`, mode);
    const earth = rig({ day: day.source });
    earth.sync();
    await until(() => earth.set.stats.ready, "the levels");
    earth.sync();
    await until(() => earth.set.stats.failed > 0 && earth.set.stats.loading === 0, `the failures of ${mode}`);
    earth.sync();
    const stats = earth.set.stats;
    assert.equal(stats.shown, 0, `${mode}: nothing is drawn`);
    assert.equal(stats.held, 0, `${mode}: nothing is held`);
    assert.ok(stats.failed > 0, `${mode}: counted`);
    assert.deepEqual(stats.used, {}, `${mode}: no credit for what was not drawn`);
    if (mode === "nan" || mode === "nan-width") assert.equal(day.closed.length, day.calls.length, "a picture that is refused is let go");
    earth.dispose();
  }
});

test("4c. a source whose levels throw or are not the pyramid's leaves the layer without tiles, and asks for none", async () => {
  const broken = mine("broken");
  broken.source.levels = () => {
    throw new Error("no levels");
  };
  const wrong = mine("wrong");
  wrong.source.levels = () => ({ tileSize: 512, levels: [{ level: 3, width: 9999 }] });
  for (const one of [broken, wrong]) {
    const earth = rig({ day: one.source });
    earth.sync();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    earth.sync();
    assert.deepEqual([earth.set.stats.ready, earth.set.stats.requested, one.calls.length], [false, 0, 0]);
    earth.dispose();
  }
});

test("4d. a record source that throws, holds too many, or is not a list is a failed read that adds nothing, and an element set that cannot be used is left out and counted", async () => {
  const signal = new AbortController().signal;
  const failing = await readElementSets({ kind: "records", info: info("a"), records: () => Promise.reject(new Error("down")) }, signal);
  assert.deepEqual([failing.status, failing.records.length, failing.reason], ["failed", 0, "down"]);
  const notList = await readElementSets({ kind: "records", info: info("b"), records: () => ({}) as never }, signal);
  assert.equal(notList.status, "failed");
  const many = await readElementSets({ kind: "records", info: info("c"), records: () => new Array(MAX_RECORDS + 1).fill(element(1, "2026-11-10T00:00:00")) }, signal);
  assert.equal(many.status, "failed");
  const mixed: unknown[] = [element(25544, "2026-11-10T00:00:00"), { ...element(2, "2026-11-10T00:00:00"), INCLINATION: Number.NaN }, { ...element(3, "2026-11-10T00:00:00"), OBJECT_NAME: 7 }, { ...element(4, "2026-11-10T00:00:00"), ECCENTRICITY: 1.5 }, null];
  const read = await readElementSets({ kind: "records", info: info("d"), records: () => mixed as ElementSet[] }, signal);
  assert.deepEqual([read.status, read.records.length, read.skipped], ["ok", 1, 4]);
  assert.ok(Object.isFrozen(read.records), "the list is frozen");
  // through a book: the same, and a throwing source does not stop the others
  const book = createSourceBook({ kinds: ["records"] });
  book.addSource({ kind: "records", info: info("bad"), records: () => Promise.reject(new Error("down")) });
  book.addSource({ kind: "records", info: info("fine"), records: () => [element(25544, "2026-11-10T00:00:00")] });
  await book.ready();
  assert.deepEqual(book.elementLists().map((list) => list.id), ["fine"]);
  assert.deepEqual(book.stats().records["bad"], { status: "failed", kept: 0, skipped: 0 });
});

test("4e. an address of orbital elements becomes a record source, read through the page's own fetch, and the newest epoch of a satellite wins between lists", async () => {
  const body = JSON.stringify([element(25544, "2026-11-10T00:00:00"), element(48274, "2026-11-09T00:00:00")]);
  let asked = 0;
  const source = elementsFrom("https://example.org/e.json", info("mine"), {
    store: null,
    fetch: (() => {
      asked += 1;
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/json" } }));
    }) as typeof fetch,
  });
  assert.equal(asked, 0, "nothing is asked until the source is read");
  const read = await readElementSets(source, new AbortController().signal);
  assert.equal(read.records.length, 2);
  assert.equal(asked, 1);
  const older = element(25544, "2026-11-01T00:00:00");
  const newer = element(25544, "2026-11-10T00:00:00");
  assert.equal(mergeElementSets([{ id: "a", sets: [older] }, { id: "b", sets: [newer] }])[0]!.id, "b");
  assert.equal(mergeElementSets([{ id: "a", sets: [newer] }, { id: "b", sets: [older] }])[0]!.id, "a");
  assert.equal(mergeElementSets([{ id: null, sets: [newer] }, { id: "b", sets: [newer] }])[0]!.id, null, "a tie goes to the list that came first");
  assert.equal(mergeElementSets([{ id: "a", sets: [older] }, { id: "b", sets: [element(48274, "2026-11-10T00:00:00")] }]).length, 2);
});

test("5. at rest the door sends nothing: drawing again is no request, and a tile that failed is asked for again only after the view has moved away from it and back", async () => {
  const day = mine("mine", "throw");
  const earth = rig({ day: day.source });
  earth.sync();
  await until(() => earth.set.stats.ready, "the levels");
  earth.sync();
  await until(() => earth.set.stats.failed > 0 && earth.set.stats.loading === 0, "the failures");
  const requested = earth.set.stats.requested;
  const calls = day.calls.length;
  for (let draw = 0; draw < 20; draw += 1) {
    earth.sync();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(earth.set.stats.requested, requested, "no request at rest, though every tile in view failed");
  assert.equal(day.calls.length, calls);
  // the view moves: what is wanted changed, so the tiles are asked for again, once
  earth.sync(MOVED);
  await until(() => earth.set.stats.loading === 0 && day.calls.length > calls, "the new asks");
  const moved = day.calls.length;
  for (let draw = 0; draw < 10; draw += 1) earth.sync(MOVED);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(day.calls.length, moved, "and again nothing at rest");
  earth.dispose();
});

test("5b. at most six loads run at once for a source", async () => {
  const day = mine("mine", "hang");
  const earth = rig({ day: day.source });
  earth.sync();
  await until(() => earth.set.stats.ready, "the levels");
  earth.sync();
  await until(() => day.calls.length >= 6, "six loads");
  for (let draw = 0; draw < 5; draw += 1) {
    earth.sync();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(day.calls.length, 6);
  assert.equal(earth.set.stats.loading, 6);
  earth.dispose();
});

test("6. more tiles than the budget leaves the held bytes at or under it, refuses the rest and counts them, and the view keeps what it has", async () => {
  const day = mine();
  const budget = imageBytes({ width: 512, height: 512, image: { width: 512, height: 512 } }) * 3;
  const earth = rig({ day: day.source }, { budgetBytes: budget });
  earth.sync();
  await until(() => earth.set.stats.ready, "the levels");
  earth.sync();
  await until(() => earth.set.stats.loading === 0 && earth.set.stats.requested > 3, "the loads");
  earth.sync();
  const stats = earth.set.stats;
  assert.ok(stats.heldBytes <= budget, `${stats.heldBytes} bytes held, over ${budget}`);
  assert.ok(stats.held <= 3 && stats.held > 0, `${stats.held} tiles held`);
  assert.ok(stats.refused > 0, "the tiles that did not fit are counted");
  assert.ok(stats.shown <= stats.held, "what is drawn is what is held");
  earth.dispose();
});

test("7. the package's own sources are clear to pass on: none is non-commercial or share-alike, each is a valid source, and the credit of each names NASA", () => {
  assert.deepEqual(OWN_SOURCES.map((source) => source.id), ["chikyu-pictures", "chikyu-tiles"]);
  for (const source of OWN_SOURCES) {
    assert.notEqual(source.licence.nonCommercial, true, source.id);
    assert.notEqual(source.licence.shareAlike, true, source.id);
    assert.doesNotThrow(() => validateSource({ kind: "records", info: source, records: () => [] }), source.id);
    assert.match(source.credit.en, /NASA/);
    assert.match(source.credit.ja, /NASA/);
    assert.match(source.licence.url, /NOTICE\.md#/);
  }
  const notice = readFileSync(new URL("../NOTICE.md", import.meta.url), "utf8");
  for (const anchor of ["#the-realistic-earths-pictures", "#the-earth-tiles"]) {
    const heading = anchor === "#the-earth-tiles" ? "## The Earth tiles" : "## The realistic Earth's pictures";
    assert.ok(notice.includes(heading), `NOTICE.md has "${heading}" for ${anchor}`);
  }
  // a folder made by earthTiles carries the row
  assert.equal(earthTiles("/tiles").info, OWN_SOURCES[1]);
});

test("8. src/data-door.ts is kazoku-ui's templates/data-door.ts, byte for byte", () => {
  const copy = readFileSync(new URL("../src/data-door.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  // kazoku-ui's scripts/check-standard.mjs holds this line (DATA_DOOR_SHA256); a change to the template changes it, and then every package's copy
  assert.equal(createHash("sha256").update(copy).digest("hex"), "b90af1f8e0f2ffc59485d5cc98995e54ee21fd98cd5ae027b90efe8c6673d5fa");
});

test("the keys of a place are the tiles it touches on the package's pyramid, a tile's own place asks for itself alone, and a key's end says where the tile is", () => {
  for (const [level, col, row] of [[3, 0, 0], [3, 15, 7], [3, 7, 3], [4, 17, 5], [4, 31, 15]] as const) {
    const keys = mapKeys(tilePlace({ level, col, row }), 1024 * 2 ** level, { tileSize: 512, levels: [3, 4].map((n) => ({ level: n, width: 1024 * 2 ** n })) }, "day/");
    assert.deepEqual(keys, [`day/${level}/${col}/${row}`]);
    assert.deepEqual(tileKeyParts(keys[0]!), { level, col, row });
  }
  assert.equal(mapKeys({ lonMin: -180, lonMax: 180, latMin: -90, latMax: 90 }, 8192).length, 16 * 8);
  assert.equal(mapKeys({ lonMin: 170, lonMax: 190, latMin: 0, latMax: 1 }, 8192).length, 2, "a place that passes 180 wraps round");
  assert.deepEqual(mapKeys({ lonMin: 10, lonMax: 10, latMin: 0, latMax: 1 }, 8192), [], "no area, no tile");
  assert.equal(tileKeyParts("nothing"), undefined);
  assert.equal(imageBytes({ width: 512, height: 512, image: { width: 512, height: 512 } }), Math.ceil(512 * 512 * 4 * (4 / 3)));
});

test("the package's own folder reads its manifest once, only when levels are asked for, and a folder that cannot be read is asked again only by the next view of it", async () => {
  let manifests = 0;
  let status = 404;
  const source = earthTiles("/tiles", {
    fetch: (url) => {
      if (url.endsWith("manifest.json")) manifests += 1;
      return Promise.resolve(new Response(JSON.stringify(MANIFEST), { status }));
    },
  });
  assert.equal(manifests, 0, "nothing is read when the source is made");
  const signal = new AbortController().signal;
  assert.equal(await source.levels!("day", signal), undefined);
  assert.equal(manifests, 1);
  status = 200;
  const day = await source.levels!("day", signal);
  assert.equal(manifests, 2);
  assert.deepEqual(day?.levels.map((entry) => entry.level), [0, 1, 2, 3, 4]);
  assert.deepEqual((await source.levels!("night", signal))?.levels.map((entry) => entry.level), [0, 1, 2, 3]);
  assert.equal(manifests, 2, "read once for both layers");
  assert.equal(await source.levels!("clouds", signal), undefined);
  await assert.rejects(() => source.load("nothing", signal), /not the key of a tile/);
});

function element(id: number, epoch: string): ElementSet {
  return { OBJECT_NAME: `SAT ${id}`, OBJECT_ID: "1998-067A", EPOCH: epoch, MEAN_MOTION: 15.49, ECCENTRICITY: 0.0007, INCLINATION: 51.6, RA_OF_ASC_NODE: 335.9, ARG_OF_PERICENTER: 339.3, MEAN_ANOMALY: 20.6, NORAD_CAT_ID: id, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0 };
}
