import test from "node:test";
import assert from "node:assert/strict";
import { coveringTile, parseManifest, pointOnEarth, tileColumns, tileLevel, tileRect, tileRows, tilesInView, TEXEL_SLACK, type TileCamera, type TileLayer } from "../src/realistic/tiles.ts";

const day: TileLayer = { tileSize: 512, levels: [0, 1, 2, 3, 4].map((level) => ({ level, width: 1024 * 2 ** level })) };
const night: TileLayer = { tileSize: 512, levels: [0, 1, 2, 3].map((level) => ({ level, width: 1024 * 2 ** level })) };
const camera = (lon: number, lat: number, radius: number, size = 800): TileCamera => ({ lon, lat, width: size, height: size, panX: 0, panY: 0, radius });
const ids = (tiles: { level: number; col: number; row: number }[]): string[] => tiles.map((tile) => `${tile.col},${tile.row}`).sort();

test("the pyramid is 2^(L+1) columns by 2^L rows, and a tile's edges are where the script cut it", () => {
  assert.equal(tileColumns(4), 32);
  assert.equal(tileRows(4), 16);
  const [west, north, east, south] = tileRect({ level: 3, col: 0, row: 0 });
  assert.equal(west, -Math.PI);
  assert.equal(north, Math.PI / 2);
  assert.ok(Math.abs(east - (-Math.PI + Math.PI / 8)) < 1e-12);
  assert.ok(Math.abs(south - (Math.PI / 2 - Math.PI / 8)) < 1e-12);
  const last = tileRect({ level: 3, col: 15, row: 7 });
  assert.ok(Math.abs(last[2] - Math.PI) < 1e-12);
  assert.ok(Math.abs(last[3] + Math.PI / 2) < 1e-12);
});

test("no tile is loaded while the package's 4096 picture is as sharp as the screen", () => {
  const radiusAt4096 = (4096 * TEXEL_SLACK) / (2 * Math.PI);
  assert.equal(tileLevel(200, day, 4096), undefined);
  assert.equal(tileLevel(radiusAt4096, day, 4096), undefined);
  assert.equal(tileLevel(radiusAt4096 + 1, day, 4096), 3);
});

test("the level is the smallest whose texels are about a pixel, and the finest there is past that", () => {
  const at = (width: number): number => (width * TEXEL_SLACK) / (2 * Math.PI);
  assert.equal(tileLevel(at(8192) - 1, day, 4096), 3);
  assert.equal(tileLevel(at(8192) + 1, day, 4096), 4);
  assert.equal(tileLevel(at(16384) - 1, day, 4096), 4);
  assert.equal(tileLevel(at(16384) * 10, day, 4096), 4, "past the top level the top level stays");
  // the night picture is 2048 across in the package, and its tiles reach level 3
  assert.equal(tileLevel(at(4096) - 1, night, 2048), 2);
  assert.equal(tileLevel(at(4096) + 1, night, 2048), 3);
  assert.equal(tileLevel(at(16384) * 10, night, 2048), 3);
});

test("a tile is held by the coarser tile that covers it", () => {
  assert.deepEqual(coveringTile({ level: 4, col: 17, row: 5 }, 3), { level: 3, col: 8, row: 2 });
  assert.deepEqual(coveringTile({ level: 4, col: 31, row: 15 }, 2), { level: 2, col: 7, row: 3 });
  assert.deepEqual(coveringTile({ level: 3, col: 5, row: 2 }, 3), { level: 3, col: 5, row: 2 });
});

test("the middle of the view is a point the maths can find again", () => {
  for (const [lon, lat] of [[0, 0], [139.7, 35.7], [-170, 60], [179.9, -45], [10, 89.5]] as const) {
    const place = pointOnEarth(camera(lon, lat, 500), 400, 400)!;
    assert.ok(Math.abs(place.lat - lat) < 1e-9, `latitude ${lat}: ${place.lat}`);
    const turn = Math.abs((((place.lon - lon) % 360) + 540) % 360 - 180);
    assert.ok(turn < 1e-9, `longitude ${lon}: ${place.lon}`);
  }
  assert.equal(pointOnEarth(camera(0, 0, 100), 0, 0), undefined, "a corner of the box beyond the disc is sky");
});

test("looking at one place, the tile under it is in view, and a far tile is not", () => {
  // Tokyo at level 4: column floor((139.7 + 180) / 11.25) = 28, row floor((90 - 35.7) / 11.25) = 4
  const tiles = tilesInView(4, camera(139.7, 35.7, 4000));
  assert.ok(ids(tiles).includes("28,4"));
  assert.ok(!ids(tiles).includes("12,10"), "Africa's tile is on the other side");
  assert.ok(tiles.length < 40, `a screen of 800 pixels at about a texel a pixel holds a few tiles, got ${tiles.length}`);
  assert.deepEqual(tiles[0] && { col: tiles[0].col, row: tiles[0].row }, { col: 28, row: 4 }, "the nearest to the middle comes first");
});

test("across the antimeridian both the first and the last column are in view", () => {
  const tiles = tilesInView(4, camera(180, 0, 4000));
  const columns = new Set(tiles.map((tile) => tile.col));
  assert.ok(columns.has(0) && columns.has(31), `columns ${[...columns].sort((a, b) => a - b).join(",")}`);
  // the same view from -180 is the same set
  assert.deepEqual(ids(tilesInView(4, camera(-180, 0, 4000))), ids(tiles));
  // and one turned a whole circle round, as the controls' yaw can leave it
  assert.deepEqual(ids(tilesInView(4, camera(540, 0, 4000))), ids(tiles));
  // east of it, a longitude of exactly 180 is the last column, never one past it
  const edge = tilesInView(4, camera(180, 0, 100, 400));
  assert.ok(edge.every((tile) => tile.col >= 0 && tile.col < 32));
});

test("at a pole the whole top row in view is found, and no row is out of range", () => {
  const north = tilesInView(4, camera(0, 90, 4000));
  assert.ok(north.every((tile) => tile.row >= 0 && tile.row < 16 && tile.col >= 0 && tile.col < 32));
  assert.ok(north.some((tile) => tile.row === 0), "the pole's row is in view");
  assert.ok(new Set(north.filter((tile) => tile.row === 0).map((tile) => tile.col)).size >= 8, "all the way round the pole");
  const south = tilesInView(4, camera(0, -90, 4000));
  assert.ok(south.some((tile) => tile.row === 15));
  assert.ok(south.every((tile) => tile.row >= 8), "from the south pole only the southern half is in view");
  // the poles with the view a little off the pole
  for (const lat of [89.99, -89.99]) assert.ok(tilesInView(3, camera(77, lat, 4000)).length > 0);
});

test("a tile bigger than the box is still found", () => {
  // level 3 at a radius that makes its tiles larger than a 100 pixel box: none of a tile's own sample points need be inside it
  const tiles = tilesInView(3, camera(11.25, 11.25, 3000, 100));
  assert.ok(ids(tiles).includes("8,3"), `got ${ids(tiles).join(" ")}`);
});

test("the whole disc at level 3 is the front hemisphere, and the back is never asked for", () => {
  const all = ids(tilesInView(3, camera(0, 0, 400, 1000)));
  assert.ok(all.includes("7,3") && all.includes("8,3") && all.includes("8,4"), "the tiles either side of the middle");
  for (const behind of ["0,3", "0,4", "15,3", "15,4", "1,3", "14,4"]) assert.ok(!all.includes(behind), `${behind} is on the far side`);
  const far = ids(tilesInView(3, camera(180, 0, 400, 1000)));
  assert.ok(far.includes("0,3") && far.includes("15,4"), "from the other side the map's edge columns are the middle");
});

test("the sun reads each tile's darkest point", () => {
  const lit = tilesInView(3, camera(0, 0, 400, 1000), [0, 0, 1]);
  const middle = lit.find((tile) => tile.col === 8 && tile.row === 3)!;
  assert.ok(middle.ndl > 0.7, `the tile at the sun's side: ${middle.ndl}`);
  const dark = tilesInView(3, camera(0, 0, 400, 1000), [0, 0, -1]);
  assert.ok(dark.find((tile) => tile.col === 8 && tile.row === 3)!.ndl < -0.7);
  assert.equal(tilesInView(3, camera(0, 0, 400, 1000))[0]!.ndl, 1, "no sun, no dark");
});

test("a manifest the loader reads must follow the pyramid's rule", () => {
  const good = { tileSize: 512, layers: { day: { levels: [{ level: 3, width: 8192, height: 4096, columns: 16, rows: 8 }, { level: 4, width: 16384, height: 8192, columns: 32, rows: 16 }] } } };
  assert.deepEqual(parseManifest(good)?.layers["day"]?.levels, [{ level: 3, width: 8192 }, { level: 4, width: 16384 }]);
  assert.equal(parseManifest(null), undefined);
  assert.equal(parseManifest({ tileSize: 256, layers: good.layers }), undefined, "only 512 pixel tiles");
  assert.equal(parseManifest({ tileSize: 512, layers: {} }), undefined);
  // a level that is not the pyramid's shape would put its tiles in the wrong place
  const wrong = { tileSize: 512, layers: { day: { levels: [{ level: 3, width: 8192, columns: 15, rows: 8 }, { level: 4, width: 9999, columns: 32, rows: 16 }] } } };
  assert.equal(parseManifest(wrong), undefined);
  const mixed = { tileSize: 512, layers: { day: good.layers.day, night: { levels: [] }, junk: 5 } };
  assert.deepEqual(Object.keys(parseManifest(mixed)!.layers), ["day"]);
});

/** A pinhole camera over the point where longitude 0 meets the equator, `height` of the Earth's radius above it, looking straight down, 800 by 600, 35 degrees from top to bottom. */
const overhead = (height: number): TileCamera => {
  const eye = [0, 0, 1 + height] as const;
  const focal = 300 / Math.tan((35 / 2) * (Math.PI / 180));
  return {
    lon: 0,
    lat: 0,
    width: 800,
    height: 600,
    panX: 0,
    panY: 0,
    radius: focal / height,
    perspective: {
      eye,
      project: (p) => {
        const depth = eye[2] - p[2];
        return depth <= 0 ? null : { x: 400 + (p[0] / depth) * focal, y: 300 - (p[1] / depth) * focal };
      },
      ground: (x, y) => {
        const d = [(x - 400) / focal, -(y - 300) / focal, -1];
        const length = Math.hypot(...d);
        const u = [d[0]! / length, d[1]! / length, d[2]! / length];
        // the nearer root of |eye + t u| = 1
        const b = eye[2] * u[2]!;
        const c = eye[2] * eye[2] - 1;
        const rest = b * b - c;
        if (rest < 0) return null;
        const t = -b - Math.sqrt(rest);
        return [t * u[0]!, t * u[1]!, eye[2] + t * u[2]!];
      },
    },
  };
};

test("a camera 150 km above the ground sees the few tiles under it, at the level it asks for, and none from the far side", () => {
  const near = overhead(150 / 6371);
  assert.equal(tileLevel(near.radius, day, 4096), 4, "the finest level is what that height needs");
  const tiles = tilesInView(4, near);
  assert.ok(tiles.length >= 1 && tiles.length <= 4, `got ${tiles.length}`);
  for (const tile of tiles) assert.ok([15, 16].includes(tile.col) && [7, 8].includes(tile.row), `${tile.col},${tile.row} is not one of the tiles round (0, 0)`);
  assert.ok(!ids(tilesInView(4, near)).includes("0,8"), "the far side is not asked for");
  const under = pointOnEarth(near, 400, 300)!;
  assert.ok(Math.abs(under.lon) < 1e-9 && Math.abs(under.lat) < 1e-9, "the middle of the box is the point under the camera");
  assert.equal(pointOnEarth({ ...near, perspective: { ...near.perspective!, ground: () => null } }, 400, 300), undefined, "the sky is not the Earth");
});

test("a camera high up in perspective sees the front of the Earth at level 3, as a disc does", () => {
  const high = overhead(2);
  const all = ids(tilesInView(3, high));
  assert.ok(all.includes("7,3") && all.includes("8,4"), "the tiles round the middle");
  assert.ok(!all.includes("0,3"), "the far side is not asked for");
});

const day5: TileLayer = { tileSize: 512, levels: [0, 1, 2, 3, 4, 5].map((level) => ({ level, width: 1024 * 2 ** level })) };

test("level 5 is 64 columns by 32 rows, and its last tile ends at 180 degrees and -90", () => {
  assert.equal(tileColumns(5), 64);
  assert.equal(tileRows(5), 32);
  const [west, north] = tileRect({ level: 5, col: 0, row: 0 });
  assert.equal(west, -Math.PI);
  assert.equal(north, Math.PI / 2);
  const last = tileRect({ level: 5, col: 63, row: 31 });
  assert.ok(Math.abs(last[2] - Math.PI) < 1e-12 && Math.abs(last[3] + Math.PI / 2) < 1e-12);
  assert.equal(tileLevel(8000, day5, 4096), 5, "a disc of 8000 pixels wants the finest level, 32768 across");
  assert.equal(tileLevel(8000, day, 4096), 4, "a set that stops at level 4 is as before");
});

test("level 5 across the antimeridian: the first and the last of its 64 columns are in view, and a longitude of 180 is the last", () => {
  const tiles = tilesInView(5, camera(180, 0, 9000));
  const columns = new Set(tiles.map((tile) => tile.col));
  assert.ok(columns.has(0) && columns.has(63), `columns ${[...columns].sort((a, b) => a - b).join(",")}`);
  assert.deepEqual(ids(tilesInView(5, camera(-180, 0, 9000))), ids(tiles));
  assert.deepEqual(ids(tilesInView(5, camera(540, 0, 9000))), ids(tiles));
  const edge = tilesInView(5, camera(180, 0, 200, 400));
  assert.ok(edge.length > 0 && edge.every((tile) => tile.col >= 0 && tile.col < 64));
  assert.ok(edge.some((tile) => tile.col === 63) && edge.some((tile) => tile.col === 0), "both sides of the line");
});

test("level 5 at a pole: the top row and the bottom row are found, and no row is out of range", () => {
  const north = tilesInView(5, camera(0, 90, 9000));
  assert.ok(north.every((tile) => tile.row >= 0 && tile.row < 32 && tile.col >= 0 && tile.col < 64));
  assert.ok(north.some((tile) => tile.row === 0), "the pole's row is in view");
  assert.ok(new Set(north.filter((tile) => tile.row === 0).map((tile) => tile.col)).size >= 16, "all the way round the pole");
  const south = tilesInView(5, camera(0, -90, 9000));
  assert.ok(south.some((tile) => tile.row === 31));
  assert.ok(south.every((tile) => tile.row >= 16));
  for (const lat of [89.99, -89.99]) assert.ok(tilesInView(5, camera(77, lat, 9000)).length > 0);
});
