// NASA's imagery tiles: the grid is not the package's pyramid, a day outside a layer's range is not requested, and a finer tile fades in and then stops.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAssetCache } from "@johnmorrisdotca/kazoku-ui/renderer";
import { GIBS_CREDIT, gibsGrid, gibsTiles, gridKey, gridKeys, gridPastExtent, gridTileAt, previousUtcDay, samplesAreBlank, utcDay } from "../src/door/index.ts";
import { GIBS_DEFAULT_LAYER, GIBS_LAYERS, GIBS_NAMES, NODATA_BELOW, NODATA_FULL, GIBS_LOOKBACK_DAYS, forgetGibsDays, gibsCandidates, gibsDay, gibsHasDay } from "../src/door/gibs.ts";
import { createTileSet, type TileSources } from "../src/realistic/tile-set.ts";
import type { ThreeParts } from "../src/realistic/textures.ts";
import type { TileCamera } from "../src/realistic/tiles.ts";

const SHAPE: readonly (readonly [number, number])[] = [
  [2, 1],
  [3, 2],
  [5, 3],
  [10, 5],
  [20, 10],
  [40, 20],
  [80, 40],
  [160, 80],
  [320, 160],
];

test("the Geographic matrix matches the capabilities read on 2026-11-13, and levels 0 to 2 run past the Earth", () => {
  const grid = gibsGrid("250m");
  assert.equal(grid.tileSize, 512);
  assert.equal(grid.levels.length, 9);
  grid.levels.forEach((level, index) => {
    assert.deepEqual([level.columns, level.rows], SHAPE[index]);
    assert.equal(level.west, -180);
    assert.equal(level.north, 90);
  });
  assert.equal(gibsGrid("500m").levels.length, 8);
  const coarse = grid.levels[0]!;
  assert.equal(gridPastExtent(coarse, 0, 0), true);
  assert.equal(gridPastExtent(grid.levels[2]!, 0, 2), true);
  assert.equal(gridPastExtent(grid.levels[3]!, 0, 0), false);
  assert.equal(gridPastExtent(grid.levels[1]!, 2, 0), true);
});

test("a point's tile is stable at every level, and the antimeridian and the poles fall on the edge tile", () => {
  const grid = gibsGrid("250m");
  const extent = grid.extent;
  for (const level of grid.levels) {
    const key = gridKey(grid, level.level, 10, 20);
    assert.equal(key, `${level.level}/${gridTileAt(level, 10, 20, extent)!.col}/${gridTileAt(level, 10, 20, extent)!.row}`);
  }
  const level = grid.levels[3]!;
  assert.deepEqual(gridTileAt(level, 0, 0, extent), { col: 5, row: 2 });
  assert.deepEqual(gridTileAt(level, 180, 0, extent), { col: 0, row: 2 });
  assert.deepEqual(gridTileAt(level, -180, 0, extent), { col: 0, row: 2 });
  assert.equal(gridTileAt(level, 0, 90, extent)!.row, 0);
  assert.equal(gridTileAt(level, 0, -90, extent)!.row, 4);
  assert.equal(gridTileAt(level, 0, 91, extent), undefined);
  const across = gridKeys(grid, { lonMin: 170, lonMax: 190, latMin: -2, latMax: 2 }, level.width);
  const cols = new Set(across.map((key) => Number(key.split("/")[1])));
  assert.equal(cols.has(9), true);
  assert.equal(cols.has(0), true);
  assert.equal(utcDay(Date.UTC(2026, 5, 21, 12)), "2026-06-21");
  assert.equal(previousUtcDay(Date.UTC(2026, 5, 21, 12)), "2026-06-20");
});

test("a day outside the layer's range names no tile, and a tile that fails or is blank is not a picture", async () => {
  const vii = GIBS_LAYERS["VIIRS_SNPP_CorrectedReflectance_TrueColor"]!;
  assert.equal(gibsDay(vii, "previous-day", Date.UTC(2026, 5, 21, 12)), "2026-06-20");
  assert.equal(gibsDay(vii, "previous-day", Date.UTC(2026, 10, 13, 12)), "2026-11-12", "a day after the last listed one may have imagery: the list is of 2026-11-13 and the layer goes on");
  assert.equal(gibsDay(vii, "2022-08-01", Date.UTC(2026, 5, 21)), undefined, "a day in a gap the list shows");
  assert.equal(gibsDay(vii, "2015-11-23", Date.UTC(2026, 5, 21)), undefined, "a day before the first");
  assert.equal(gibsDay(vii, "2001-01-01", Date.UTC(2026, 5, 21)), undefined);
  const modis = GIBS_LAYERS["MODIS_Terra_CorrectedReflectance_TrueColor"]!;
  assert.equal(gibsDay(modis, "2001-06-20", Date.UTC(2026, 5, 21)), undefined);
  assert.equal(gibsDay(GIBS_LAYERS["BlueMarble_ShadedRelief_Bathymetry"]!, "previous-day", Date.UTC(2026, 10, 13)), "default");
  const quiet = gibsTiles({ time: () => new Date("2000-02-24T12:00:00Z"), layer: "today", fetch: () => Promise.reject(new Error("no request expected")) });
  assert.deepEqual(quiet.need({ lonMin: -1, lonMax: 1, latMin: -1, latMax: 1, layer: "day" }, 50000), [], "the day before the first day of the layer: nothing is asked");
  const urls: string[] = [];
  const source = gibsTiles({
    time: () => new Date("2026-06-21T12:00:00Z"),
    layer: "today",
    date: "previous-day",
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve(new Response("no", { status: 404 }));
    },
    decode: () => Promise.resolve({ width: 512, height: 512 }),
  });
  const keys = source.need({ lonMin: -1, lonMax: 1, latMin: -1, latMax: 1, layer: "day" }, 50000);
  assert.equal(keys[0]?.startsWith("2026-06-20/"), true);
  await assert.rejects(() => source.load(keys[0]!, new AbortController().signal));
  assert.match(urls[0]!, /^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg4326\/best\/MODIS_Terra_CorrectedReflectance_TrueColor\/default\/2026-06-20\/250m\/\d+\/\d+\/\d+\.jpg$/);
  const parts = urls[0]!.split("/");
  const z = parts[parts.length - 3];
  const row = parts[parts.length - 2];
  const col = parts[parts.length - 1]!.replace(".jpg", "");
  assert.equal(`${z}/${col}/${row}`, keys[0]!.slice("2026-06-20/".length));
  assert.equal(samplesAreBlank(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])), true);
  assert.equal(samplesAreBlank(new Uint8ClampedArray([0, 0, 2, 255])), false);
  assert.match(GIBS_CREDIT.en, /^We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services \(GIBS\)/);
});

test("finer tiles are asked for only closer than the package's own, then fade in and stop", async () => {
  forgetGibsDays();
  const urls: string[] = [];
  const source = gibsTiles({
    time: () => new Date("2026-06-21T12:00:00Z"),
    layer: "today",
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve(new Response(new Uint8Array([1]), { status: 200 }));
    },
    decode: () => Promise.resolve({ width: 512, height: 512, close() {} }),
  });
  let clock = 0;
  let invalidated = 0;
  const sources: TileSources = { finer: source };
  const assets = createAssetCache({ lingerMs: 0 });
  class Texture {
    image: unknown = null;
    needsUpdate = false;
    dispose(): void {}
  }
  class Material {
    uniforms: { cover?: { value: number } };
    transparent = false;
    depthWrite = true;
    constructor(options: { uniforms: { cover?: { value: number } } }) {
      this.uniforms = options.uniforms;
    }
    dispose(): void {}
  }
  class Mesh {
    visible = false;
    material: Material;
    constructor(_geometry: unknown, material: Material) {
      this.material = material;
    }
  }
  const three = {
    Texture,
    ShaderMaterial: Material,
    Mesh,
    BufferGeometry: class { setAttribute(): void {} setIndex(): void {} dispose(): void {} },
    BufferAttribute: class {},
    ClampToEdgeWrapping: 1,
    LinearMipmapLinearFilter: 2,
    LinearFilter: 3,
  };
  const set = createTileSet(three as unknown as ThreeParts, { add() {}, remove() {} } as never, { sunDir: { value: {} }, lights: { value: 1 }, boost: { value: 0 }, ortho: { value: 1 }, water: { value: null }, night: { value: null } } as never, {
    assets,
    sources: () => sources,
    cap: () => 4096,
    invalidate: () => { invalidated += 1; },
    now: () => clock,
    limit: 48,
  });
  const far: TileCamera = { lon: 0, lat: 23, width: 800, height: 800, panX: 0, panY: 0, radius: 1000 };
  const near: TileCamera = { ...far, radius: 8000 };
  set.sync(far, [0, 0, 1], true, 1);
  await new Promise((resolve) => setImmediate(resolve));
  set.sync(far, [0, 0, 1], true, 1);
  assert.equal(urls.length, 0, "nothing is fetched while the package's own tiles are sharp enough");
  assert.equal(set.stats.finer, null);
  for (let turn = 0; turn < 20; turn += 1) {
    set.sync(near, [0, 0, 1], true, 1);
    await new Promise((resolve) => setImmediate(resolve));
    for (let wait = 0; wait < 20 && set.stats.loading > 0; wait += 1) await new Promise((resolve) => setImmediate(resolve));
    if (set.stats.loading === 0 && set.stats.held > 0 && set.stats.shown === set.stats.held) break;
  }
  assert.ok(urls.length > 0 && urls.length <= 48, `${urls.length} tiles`);
  assert.ok(urls.every((url) => url.includes("/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-06-20/250m/")));
  assert.equal(set.stats.finer !== null, true);
  assert.equal(set.stats.loading, 0);
  assert.equal(set.stats.shown, set.stats.held);
  assert.equal(set.stats.fading, true);
  const asked = urls.length;
  const marks = invalidated;
  clock = 300;
  set.sync(near, [0, 0, 1], true, 1);
  assert.equal(set.stats.fading, false);
  assert.equal(urls.length, asked, "the fade asks for no further tile");
  set.sync(near, [0, 0, 1], true, 1);
  assert.equal(invalidated, marks, "once the fade has ended, nothing asks for another draw");
  assert.equal(set.stats.heldBytes <= 72 * 1024 * 1024, true);
  set.dispose();
  assets.clear();
});

/** A source whose `fetch` is answered here: `has` says which days have a picture (a 200 with a JPEG body) and the others are a 404. */
const answering = (shown: string, has: (day: string) => boolean, extra: Partial<Parameters<typeof gibsTiles>[0]> = {}) => {
  const urls: string[] = [];
  let changed = 0;
  const source = gibsTiles({
    time: () => new Date(`${shown}T12:00:00Z`),
    layer: "today",
    changed: () => {
      changed += 1;
    },
    fetch: (url) => {
      urls.push(url);
      const day = /\/default\/(\d{4}-\d{2}-\d{2})\//.exec(url)![1]!;
      return Promise.resolve(has(day) ? new Response(new Uint8Array([1]), { status: 200 }) : new Response("no", { status: 404 }));
    },
    decode: () => Promise.resolve({ width: 512, height: 512, close() {} }),
    ...extra,
  });
  return { source, urls, changed: () => changed };
};
const place = { lonMin: -123.2, lonMax: -123.0, latMin: 49.2, latMax: 49.3, layer: "day" } as const;
const settleAll = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

test("the daily layer is MODIS Terra under the name today, and a day is looked for from the day before the shown one, one tile a day, newest first", () => {
  assert.equal(GIBS_NAMES["today"], "MODIS_Terra_CorrectedReflectance_TrueColor");
  const terra = GIBS_LAYERS[GIBS_NAMES["today"]!]!;
  assert.deepEqual(gibsCandidates(terra, "2026-11-12").slice(0, 3), ["2026-11-12", "2026-11-11", "2026-11-10"]);
  assert.equal(gibsCandidates(terra, "2026-11-12").length, GIBS_LOOKBACK_DAYS, "at most ten days");
  assert.deepEqual(gibsCandidates(terra, "2000-02-25"), ["2000-02-25", "2000-02-24"], "stops at the layer's first day");
  assert.deepEqual(gibsCandidates(terra, "2000-02-23"), [], "a start before the first day names none");
  assert.equal(gibsHasDay(terra, "2022-10-15"), false, "a day inside a gap of the list");
  assert.deepEqual(gibsCandidates(terra, "2022-10-24").slice(0, 3), ["2022-10-24", "2022-10-23"], "the gap below 2022-10-23 is stepped over with no request, and the ten days end inside it");
});

test("today has no picture and two days back does: two single-tile asks, then the tiles are from that day, and a later move asks nothing again", async () => {
  forgetGibsDays();
  const day = (d: string) => d === "2026-11-11";
  const { source, urls, changed } = answering("2026-11-13", day);
  assert.deepEqual(source.need(place, 50000), [], "the first look starts the search and names no tile yet");
  assert.deepEqual(source.need(place, 50000), [], "a second look while it runs starts no other ask");
  await settleAll();
  assert.equal(urls.length, 2, "2026-11-12 had none, 2026-11-11 had one: two asks, one tile each, one at a time");
  assert.match(urls[0]!, /\/default\/2026-11-12\/250m\//);
  assert.match(urls[1]!, /\/default\/2026-11-11\/250m\//);
  assert.equal(changed(), 1, "the view is told to draw again");
  const keys = source.need(place, 50000);
  assert.ok(keys.length > 0 && keys.every((key) => key.startsWith("2026-11-11/")), "the tiles are from two days back");
  const asked = urls.length;
  source.need({ ...place, lonMin: -122.9, lonMax: -122.8 }, 50000);
  source.need(place, 50000);
  await settleAll();
  assert.equal(urls.length, asked, "the answer is kept: no ask for the next move");
  const other = answering("2026-11-13", day);
  assert.ok(other.source.need(place, 50000).every((key) => key.startsWith("2026-11-11/")), "another view of the same layer and day uses the kept answer");
  assert.equal(other.urls.length, 0, "and asks nothing");
});

test("nothing in ten days: ten asks, then no further request and the package's own tiles stay", async () => {
  forgetGibsDays();
  const { source, urls, changed } = answering("2026-11-13", () => false);
  source.need(place, 50000);
  await settleAll();
  assert.equal(urls.length, GIBS_LOOKBACK_DAYS);
  assert.equal(changed(), 0, "nothing to draw again for");
  for (let move = 0; move < 5; move += 1) assert.deepEqual(source.need({ ...place, lonMin: -122 + move, lonMax: -121 + move }, 50000), []);
  await settleAll();
  assert.equal(urls.length, GIBS_LOOKBACK_DAYS, "no ask after the answer is none");
});

test("a picture that is all black is no picture for the day, one that is partly black is one", async () => {
  forgetGibsDays();
  const black = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 3; i < black.length; i += 4) black[i] = 255;
  const partly = new Uint8ClampedArray(black);
  for (let i = 0; i < partly.length / 2; i += 4) partly[i] = partly[i + 1] = partly[i + 2] = 200;
  const { samplesAreBlank } = await import("../src/door/gibs.ts");
  assert.equal(samplesAreBlank(black), true);
  assert.equal(samplesAreBlank(partly), false, "a swath gap across part of a tile leaves the rest shown");
});

test("a fixed rule asks for no search: the day before, the shown day or a day named, each as it is", () => {
  forgetGibsDays();
  for (const [date, want] of [["previous-day", "2026-11-12/"], ["shown", "2026-11-13/"], ["2026-11-01", "2026-11-01/"]] as const) {
    const { source, urls } = answering("2026-11-13", () => false, { date });
    const keys = source.need(place, 50000);
    assert.ok(keys.length > 0 && keys[0]!.startsWith(want), `${date}: ${keys[0]}`);
    assert.equal(urls.length, 0, "and no search");
  }
  const before = answering("2026-11-13", () => false, { date: "1999-12-31" });
  assert.deepEqual(before.source.need(place, 50000), [], "a date before the layer's first day asks nothing");
});

test("the 31.25 m matrix: twelve levels, 512 pixel tiles, and the tile of a place is the one the service answered with on 2026-11-13", () => {
  const grid = gibsGrid("31.25m");
  assert.equal(grid.levels.length, 12);
  assert.equal(grid.tileSize, 512);
  const shape = [2, 3, 5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560];
  grid.levels.forEach((level, index) => {
    assert.equal(level.columns, shape[index], `level ${index} columns`);
    assert.equal(level.rows, [1, 2, 3, 5, 10, 20, 40, 80, 160, 320, 640, 1280][index], `level ${index} rows`);
    assert.equal(level.width, 360 / (0.5625 / 2 ** index));
  });
  assert.equal(grid.levels[11]!.width, 1_310_720, "the finest level is 1.3 million pixels round the Earth, 30 m at the equator");
  // the tiles that the service returned a picture for, the same ones this grid names (row/column in the address, column/row in a key)
  const places: [string, number, number, number, number, number][] = [
    ["Vancouver", -123.1, 49.25, 9, 72, 101],
    ["Vancouver", -123.1, 49.25, 10, 144, 202],
    ["Vancouver", -123.1, 49.25, 11, 289, 404],
    ["Tokyo", 139.76, 35.68, 9, 96, 568],
    ["Tokyo", 139.76, 35.68, 11, 386, 2273],
    ["Paris", 2.35, 48.86, 10, 146, 648],
    ["the Sahara", 10, 25, 9, 115, 337],
  ];
  for (const [name, lon, lat, level, row, col] of places) {
    assert.deepEqual(gridTileAt(grid.levels[level]!, lon, lat, grid.extent), { col, row }, `${name}, level ${level}`);
    assert.deepEqual(gridKeys(grid, { lonMin: lon - 1e-4, lonMax: lon + 1e-4, latMin: lat - 1e-4, latMax: lat + 1e-4 }, grid.levels[level]!.width), [`${level}/${col}/${row}`], `${name} key`);
  }
  assert.equal(gridPastExtent(grid.levels[3]!, 0, 0), false);
  assert.equal(gridPastExtent(grid.levels[2]!, 0, 2), true);
});

test("the default is the Landsat annual mosaic: its year is not searched for, its tiles are on the 31.25 m grid, and its credit says so", () => {
  forgetGibsDays();
  assert.equal(GIBS_DEFAULT_LAYER, "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual");
  assert.equal(GIBS_NAMES["landsat"], GIBS_DEFAULT_LAYER);
  const urls: string[] = [];
  const source = gibsTiles({ time: () => new Date("2026-11-13T12:00:00Z"), fetch: (url) => (urls.push(url), Promise.reject(new Error("offline"))) });
  assert.equal(source.holes, true, "its tiles have holes where there is no data");
  assert.equal(source.grid!.levels.length, 12);
  const keys = source.need({ lonMin: -123.1001, lonMax: -123.0999, latMin: 49.2499, latMax: 49.2501, layer: "day" }, 327_680);
  assert.deepEqual(keys, ["2000-12-01/9/101/72"], "the newest year, at the level the view needs");
  assert.equal(urls.length, 0, "no search for a day, no probe");
  assert.match(source.info.credit.en, /^We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services/);
  assert.match(source.info.credit.en, /Global Web-Enabled Landsat Data \(GWELD\)/);
  assert.match(source.info.credit.ja, /GWELD/);
  const named = (layer: string, date?: string) => gibsTiles({ time: () => new Date("2026-11-13T12:00:00Z"), layer, ...(date ? { date } : {}) });
  const first = (source: ReturnType<typeof gibsTiles>) => source.need({ lonMin: -123.1001, lonMax: -123.0999, latMin: 49.2499, latMax: 49.2501, layer: "day" }, 327_680)[0];
  assert.equal(first(named("landsat")), "2000-12-01/9/101/72");
  assert.equal(first(named("landsat", "1990-05-05")), "1990-12-01/9/101/72", "a year the layer has, by the year of the date");
  assert.equal(first(named("landsat", "1991-01-01")), "2000-12-01/9/101/72", "a year it has not: the newest");
  assert.equal(first(named(GIBS_DEFAULT_LAYER, "previous-day")), "2000-12-01/9/101/72", "the day rules are for the daily layers");
  const today = named("today");
  assert.equal(today.grid!.levels.length, 9, "the daily layer is on the 250 m grid");
  assert.doesNotMatch(today.info.credit.en, /GWELD/);
});

test("each layer says how its tiles are drawn: clear below a luminance, and a gain on the colours; the daily layers clear only the black of no data", () => {
  const time = () => new Date("2026-11-13T12:00:00Z");
  const landsat = gibsTiles({ time });
  assert.deepEqual(landsat.look, { clear: [20, 32], gain: [0.76, 0.66, 0.55] }, "the sea of the mosaic is clear, and the colours are brought to ours");
  const today = gibsTiles({ time, layer: "today" });
  assert.deepEqual(today.look, { clear: [NODATA_BELOW, NODATA_FULL] }, "black is no data, nothing else is touched");
  assert.ok(NODATA_BELOW < NODATA_FULL);
  assert.equal(today.holes, true);
  assert.deepEqual(GIBS_LAYERS[GIBS_DEFAULT_LAYER]!.clear, [20, 32]);
  // the gain was fitted over land: each channel under 1, red the least cut, blue the most (our pictures are darker and warmer)
  const [r, g, b] = landsat.look!.gain!;
  assert.ok(r > g && g > b && r < 1 && b > 0);
});
