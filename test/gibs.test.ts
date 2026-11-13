// NASA's imagery tiles: the grid is not the package's pyramid, a day outside a layer's range is not requested, and a finer tile fades in and then stops.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAssetCache } from "@johnmorrisdotca/kazoku-ui/renderer";
import { GIBS_CREDIT, gibsGrid, gibsTiles, gridKey, gridKeys, gridPastExtent, gridTileAt, previousUtcDay, samplesAreBlank, utcDay } from "../src/door/index.ts";
import { GIBS_LAYERS, gibsDay } from "../src/door/gibs.ts";
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
  assert.equal(gibsDay(vii, "previous-day", Date.UTC(2026, 10, 13, 12)), undefined);
  assert.equal(gibsDay(vii, "2001-01-01", Date.UTC(2026, 5, 21)), undefined);
  const modis = GIBS_LAYERS["MODIS_Terra_CorrectedReflectance_TrueColor"]!;
  assert.equal(gibsDay(modis, "2001-06-20", Date.UTC(2026, 5, 21)), undefined);
  assert.equal(gibsDay(GIBS_LAYERS["BlueMarble_ShadedRelief_Bathymetry"]!, "previous-day", Date.UTC(2026, 10, 13)), "default");
  const quiet = gibsTiles({ time: () => new Date("2026-11-13T12:00:00Z") });
  assert.deepEqual(quiet.need({ lonMin: -1, lonMax: 1, latMin: -1, latMax: 1, layer: "day" }, 50000), []);
  const urls: string[] = [];
  const source = gibsTiles({
    time: () => new Date("2026-06-21T12:00:00Z"),
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve(new Response("no", { status: 404 }));
    },
    decode: () => Promise.resolve({ width: 512, height: 512 }),
  });
  const keys = source.need({ lonMin: -1, lonMax: 1, latMin: -1, latMax: 1, layer: "day" }, 50000);
  assert.equal(keys[0]?.startsWith("2026-06-20/"), true);
  await assert.rejects(() => source.load(keys[0]!, new AbortController().signal));
  assert.match(urls[0]!, /^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg4326\/best\/VIIRS_SNPP_CorrectedReflectance_TrueColor\/default\/2026-06-20\/250m\/\d+\/\d+\/\d+\.jpg$/);
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
  const urls: string[] = [];
  const source = gibsTiles({
    time: () => new Date("2026-06-21T12:00:00Z"),
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
    for (let wait = 0; wait < 20 && set.stats.loading > 0; wait += 1) await new Promise((resolve) => setImmediate(resolve));
    if (set.stats.loading === 0 && set.stats.held > 0 && set.stats.shown === set.stats.held) break;
  }
  assert.ok(urls.length > 0 && urls.length <= 48, `${urls.length} tiles`);
  assert.ok(urls.every((url) => url.includes("/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-06-20/250m/")));
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
