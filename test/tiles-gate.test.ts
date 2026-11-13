// Which levels of the tile pyramid the Pages site publishes: all of them only when EARTH_TILES_ALL is yes, else the ones every published loader reads.
import assert from "node:assert/strict";
import test from "node:test";
import { publishedManifest, type TileManifest } from "../scripts/tiles-gate.ts";

const level = (n: number, bytes: number) => ({ level: n, width: 1024 * 2 ** n, height: 512 * 2 ** n, columns: 2 ** (n + 1), rows: 2 ** n, tiles: 2 ** (n + 1) * 2 ** n, bytes });
const made = (): TileManifest => {
  const day = [0, 1, 2, 3, 4, 5].map((n) => level(n, 1000 * (n + 1)));
  const night = [0, 1, 2, 3, 4].map((n) => level(n, 100 * (n + 1)));
  const sum = (levels: { tiles: number; bytes: number }[]) => ({ tiles: levels.reduce((a, l) => a + l.tiles, 0), bytes: levels.reduce((a, l) => a + l.bytes, 0) });
  return {
    tileSize: 512,
    layers: {
      day: { levels: day, ...sum(day), source: "day.jpg", sourceWidth: 21600, panelSources: { A1: { url: "x", sha256: "y" } }, panelWidth: 86400 },
      night: { levels: night, ...sum(night), source: "night.jpg", sourceWidth: 13500, panelSources: {}, panelWidth: 86400 },
    },
  } as unknown as TileManifest;
};

test("with the gate off the manifest lists day 0 to 4 and night 0 to 3, the counts are added up again, and the finer folders go", () => {
  const { manifest, remove } = publishedManifest(made(), false);
  assert.deepEqual(manifest.layers["day"]!.levels.map((l) => l.level), [0, 1, 2, 3, 4]);
  assert.deepEqual(manifest.layers["night"]!.levels.map((l) => l.level), [0, 1, 2, 3]);
  assert.equal(manifest.layers["day"]!.tiles, 2 + 8 + 32 + 128 + 512);
  assert.equal(manifest.layers["day"]!.bytes, 1000 + 2000 + 3000 + 4000 + 5000);
  assert.equal(manifest.layers["night"]!.tiles, 2 + 8 + 32 + 128);
  assert.equal(manifest.layers["night"]!.bytes, 100 + 200 + 300 + 400);
  assert.deepEqual(remove.sort(), ["day/5", "night/4"]);
  // what only the finest levels needed is not left in the manifest, and the order of the keys is the one the published manifest always had
  assert.deepEqual(Object.keys(manifest.layers["day"]!), ["levels", "tiles", "bytes", "source", "sourceWidth"]);
});

test("with the gate on every level stays, and nothing is removed", () => {
  const given = made();
  const { manifest, remove } = publishedManifest(given, true);
  assert.equal(manifest, given);
  assert.deepEqual(remove, []);
  assert.deepEqual(manifest.layers["day"]!.levels.map((l) => l.level), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(manifest.layers["night"]!.levels.map((l) => l.level), [0, 1, 2, 3, 4]);
});

test("a pyramid that already stops at the published top is left as it is, and a layer the gate does not name is kept whole", () => {
  const plain = made();
  plain.layers["day"]!.levels.pop();
  plain.layers["night"]!.levels.pop();
  const extra = { ...plain, layers: { ...plain.layers, clouds: { levels: [level(6, 5)], tiles: 1, bytes: 5 } } } as TileManifest;
  const { manifest, remove } = publishedManifest(extra, false);
  assert.deepEqual(remove, []);
  assert.deepEqual(manifest.layers["clouds"]!.levels.map((l) => l.level), [6]);
  assert.deepEqual(manifest.layers["day"]!.levels.map((l) => l.level), [0, 1, 2, 3, 4]);
});
