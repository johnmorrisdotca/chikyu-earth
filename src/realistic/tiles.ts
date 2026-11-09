// The maths of the Earth's map tiles, with no browser and no three.js: which pyramid level a zoom needs, and which tiles of that level are in view. Pure.
//
// A tile set is the map cut into 512 pixel squares: level L is `1024 * 2^L` pixels across, in `2^(L+1)` columns and `2^L` rows, column 0 at longitude -180 and row 0 at
// latitude 90, a tile at `<layer>/<level>/<column>/<row>.webp` (`scripts/make-earth-tiles.py` makes one).

/**
 * One tile of the map pyramid: a level, a column counted east from longitude -180 and a row counted south from latitude 90.
 *
 * @example
 * ```ts
 * import type { TileId } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const tile: TileId = { level: 4, col: 17, row: 5 };
 * console.log(tile);
 * ```
 */
export interface TileId {
  level: number;
  col: number;
  row: number;
}

/**
 * What a layer of a tile set holds, from its manifest: the pyramid's levels, each as wide as it is, and the tile size.
 *
 * @example
 * ```ts
 * import type { TileLayer } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const day: TileLayer = { tileSize: 512, levels: [{ level: 3, width: 8192 }, { level: 4, width: 16384 }] };
 * console.log(day.levels.length);
 * ```
 */
export interface TileLayer {
  tileSize: number;
  levels: { level: number; width: number }[];
}

/**
 * Where the camera is, as the realistic Earth draws it: the place in the middle of the disc, the box in CSS pixels, the pan, and the disc's radius in CSS pixels.
 *
 * @example
 * ```ts
 * import type { TileCamera } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const camera: TileCamera = { lon: 10, lat: 20, width: 800, height: 600, panX: 0, panY: 0, radius: 900 };
 * console.log(camera.radius);
 * ```
 */
export interface TileCamera {
  lon: number;
  lat: number;
  width: number;
  height: number;
  panX: number;
  panY: number;
  radius: number;
}

/**
 * A tile that is in view: where, how far its middle is from the middle of the box (CSS pixels, for loading the middle first) and how dark its darkest sampled point is (`ndl`, the
 * cosine of the angle to the Sun, only when a Sun was given).
 *
 * @example
 * ```ts
 * import type { VisibleTile } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const tile: VisibleTile = { level: 3, col: 0, row: 0, d: 120, ndl: -0.4 };
 * console.log(tile.d);
 * ```
 */
export interface VisibleTile extends TileId {
  d: number;
  ndl: number;
}

const RAD = Math.PI / 180;

/**
 * How much larger than a device pixel a map texel may be before the next level is wanted: 1.25 is a quarter larger.
 *
 * @example
 * ```ts
 * import { TEXEL_SLACK } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(TEXEL_SLACK);
 * ```
 */
export const TEXEL_SLACK = 1.25;

/**
 * Columns in a level.
 *
 * @param level - A pyramid level.
 * @returns `2^(level + 1)`.
 *
 * @example
 * ```ts
 * import { tileColumns } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(tileColumns(4));
 * ```
 */
export const tileColumns = (level: number): number => 2 ** (level + 1);

/**
 * Rows in a level.
 *
 * @param level - A pyramid level.
 * @returns `2^level`.
 *
 * @example
 * ```ts
 * import { tileRows } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(tileRows(4));
 * ```
 */
export const tileRows = (level: number): number => 2 ** level;

/**
 * The first level to load for a disc: the smallest one whose texels are about a device pixel on the screen, else the finest there is, and none when the whole-Earth picture
 * (`baseWidth` across) is already that sharp.
 *
 * @param radiusPx - The disc's radius in device pixels.
 * @param layer - The levels the set has for this layer.
 * @param baseWidth - The width of the picture the tiles are laid over, 4096 for the day map.
 * @returns A level in `layer`, or `undefined` when no tile is worth loading.
 *
 * @example
 * ```ts
 * import { tileLevel, type TileLayer } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const day: TileLayer = { tileSize: 512, levels: [{ level: 3, width: 8192 }, { level: 4, width: 16384 }] };
 * console.log(tileLevel(600, day, 4096), tileLevel(1500, day, 4096), tileLevel(9000, day, 4096));
 * ```
 */
export function tileLevel(radiusPx: number, layer: TileLayer, baseWidth: number): number | undefined {
  const needed = (2 * Math.PI * radiusPx) / TEXEL_SLACK;
  if (needed <= baseWidth) return undefined;
  const finer = layer.levels.filter((entry) => entry.width > baseWidth).sort((a, b) => a.width - b.width);
  if (finer.length === 0) return undefined;
  return (finer.find((entry) => entry.width >= needed) ?? finer[finer.length - 1]!).level;
}

/**
 * The tile of a coarser or the same level that holds a tile.
 *
 * @param tile - A tile.
 * @param level - A level no finer than the tile's.
 * @returns The tile at `level` that covers it.
 *
 * @example
 * ```ts
 * import { coveringTile } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(coveringTile({ level: 4, col: 17, row: 5 }, 3));
 * ```
 */
export function coveringTile(tile: TileId, level: number): TileId {
  const shift = Math.max(0, tile.level - level);
  return { level: Math.min(level, tile.level), col: tile.col >> shift, row: tile.row >> shift };
}

/**
 * Where a tile's edges are, in longitude and latitude in radians: west, north, east and south.
 *
 * @param tile - A tile.
 * @returns `[west, north, east, south]`.
 *
 * @example
 * ```ts
 * import { tileRect } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(tileRect({ level: 3, col: 0, row: 0 }));
 * ```
 */
export function tileRect(tile: TileId): [number, number, number, number] {
  const columns = tileColumns(tile.level);
  const rows = tileRows(tile.level);
  return [-Math.PI + (tile.col / columns) * 2 * Math.PI, Math.PI / 2 - (tile.row / rows) * Math.PI, -Math.PI + ((tile.col + 1) / columns) * 2 * Math.PI, Math.PI / 2 - ((tile.row + 1) / rows) * Math.PI];
}

/** A place on the unit sphere turned to face the camera: +x to the right, +y up, +z toward the viewer (the realistic Earth's own turn: about y by minus the longitude, then about x by the latitude). */
const turned = (lon: number, lat: number, lonRad: number, latRad: number): [number, number, number] => {
  const cl = Math.cos(lat);
  const x = cl * Math.sin(lon);
  const y = Math.sin(lat);
  const z = cl * Math.cos(lon);
  const x1 = x * Math.cos(lonRad) - z * Math.sin(lonRad);
  const z1 = x * Math.sin(lonRad) + z * Math.cos(lonRad);
  return [x1, y * Math.cos(latRad) - z1 * Math.sin(latRad), y * Math.sin(latRad) + z1 * Math.cos(latRad)];
};

/**
 * The longitude and latitude (degrees) under a point of the box, or `undefined` where the box shows the sky.
 *
 * @param camera - The camera.
 * @param x - Across the box, CSS pixels from its left.
 * @param y - Down the box, CSS pixels from its top.
 * @returns The longitude and latitude in degrees under that point, or `undefined` where the box shows the sky.
 *
 * @example
 * ```ts
 * import { pointOnEarth } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(pointOnEarth({ lon: 10, lat: 20, width: 800, height: 600, panX: 0, panY: 0, radius: 900 }, 400, 300));
 * ```
 */
export function pointOnEarth(camera: TileCamera, x: number, y: number): { lon: number; lat: number } | undefined {
  const px = (x - camera.width / 2 - camera.panX) / camera.radius;
  const py = (camera.height / 2 + camera.panY - y) / camera.radius;
  const rest = 1 - px * px - py * py;
  if (rest < 0) return undefined;
  const pz = Math.sqrt(rest);
  const latRad = camera.lat * RAD;
  const lonRad = camera.lon * RAD;
  const y1 = py * Math.cos(latRad) + pz * Math.sin(latRad);
  const z1 = -py * Math.sin(latRad) + pz * Math.cos(latRad);
  const gx = px * Math.cos(lonRad) + z1 * Math.sin(lonRad);
  const gz = -px * Math.sin(lonRad) + z1 * Math.cos(lonRad);
  return { lon: Math.atan2(gx, gz) / RAD, lat: Math.asin(Math.max(-1, Math.min(1, y1))) / RAD };
}

/** The columns and rows are counted from the corner; a longitude of exactly 180 is the last column, and a latitude of exactly -90 the last row. */
const tileAt = (level: number, lon: number, lat: number): TileId => {
  const columns = tileColumns(level);
  const rows = tileRows(level);
  const col = Math.min(columns - 1, Math.max(0, Math.floor(((lon + 180) / 360) * columns)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(((90 - lat) / 180) * rows)));
  return { level, col, row };
};

/**
 * The tiles of a level that are in view: those with a sampled point inside the box (a little over, so a tile slides in before its edge does), and those under a grid of points
 * across the box. The antimeridian and the poles need nothing special: a tile is tested where it is on the sphere, and a longitude of 180 is the last column.
 *
 * @param level - A pyramid level.
 * @param camera - The camera.
 * @param sun - The Sun's direction as the camera sees it (+x right, +y up, +z toward the viewer), to read each tile's `ndl`; left out, `ndl` is 1.
 * @returns The tiles in view, the nearest to the middle of the box first.
 *
 * @example
 * ```ts
 * import { tilesInView } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const tiles = tilesInView(4, { lon: 179.9, lat: 89, width: 800, height: 600, panX: 0, panY: 0, radius: 3000 });
 * console.log(tiles.length, tiles[0]);
 * ```
 */
export function tilesInView(level: number, camera: TileCamera, sun?: readonly [number, number, number]): VisibleTile[] {
  const columns = tileColumns(level);
  const rows = tileRows(level);
  const lonRad = camera.lon * RAD;
  const latRad = camera.lat * RAD;
  const margin = Math.min(160, Math.min(camera.width, camera.height) / 4);
  const cx = camera.width / 2 + camera.panX;
  const cy = camera.height / 2 + camera.panY;
  const found = new Map<number, { d: number; ndl: number }>();
  const ndlOf = (z: [number, number, number]): number => (sun ? z[0] * sun[0] + z[1] * sun[1] + z[2] * sun[2] : 1);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const [west, north, east, south] = tileRect({ level, col, row });
      const middle = turned((west + east) / 2, (north + south) / 2, lonRad, latRad);
      if (middle[2] < -0.4) continue;
      let inside = false;
      let darkest = 1;
      for (let j = 0; j <= 2; j += 1) {
        for (let i = 0; i <= 2; i += 1) {
          const p = turned(west + ((east - west) * i) / 2, north + ((south - north) * j) / 2, lonRad, latRad);
          darkest = Math.min(darkest, ndlOf(p));
          if (p[2] < 0) continue;
          const sx = cx + p[0] * camera.radius;
          const sy = cy - p[1] * camera.radius;
          if (sx >= -margin && sx <= camera.width + margin && sy >= -margin && sy <= camera.height + margin) inside = true;
        }
      }
      if (inside) {
        const d = Math.hypot(cx + middle[0] * camera.radius - camera.width / 2, cy - middle[1] * camera.radius - camera.height / 2);
        found.set(row * columns + col, { d, ndl: darkest });
      }
    }
  }

  // a tile bigger than the box can have none of its own sample points in it: the points of the box say which tile they are on
  const step = 32;
  for (let y = 0; y <= camera.height + step - 1; y += step) {
    for (let x = 0; x <= camera.width + step - 1; x += step) {
      const place = pointOnEarth(camera, Math.min(x, camera.width), Math.min(y, camera.height));
      if (!place) continue;
      const tile = tileAt(level, place.lon, place.lat);
      const key = tile.row * columns + tile.col;
      if (found.has(key)) continue;
      const [west, north, east, south] = tileRect(tile);
      const p = turned((west + east) / 2, (north + south) / 2, lonRad, latRad);
      const dark = [turned(west, north, lonRad, latRad), turned(east, north, lonRad, latRad), turned(west, south, lonRad, latRad), turned(east, south, lonRad, latRad), p].reduce((least, q) => Math.min(least, ndlOf(q)), 1);
      found.set(key, { d: Math.hypot(cx + p[0] * camera.radius - camera.width / 2, cy - p[1] * camera.radius - camera.height / 2), ndl: dark });
    }
  }

  return [...found]
    .map(([key, value]) => ({ level, col: key % columns, row: Math.floor(key / columns), ...value }))
    .sort((a, b) => a.d - b.d);
}

/**
 * Read a tile set's manifest (`manifest.json`): the tile size and, for each layer, its levels. A manifest with no usable layer gives `undefined`.
 *
 * @param json - The parsed JSON.
 * @returns A layer name to its levels, and the tile size; or `undefined`.
 *
 * @example
 * ```ts
 * import { parseManifest } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const manifest = parseManifest({ tileSize: 512, layers: { day: { levels: [{ level: 3, width: 8192, height: 4096, columns: 16, rows: 8 }] } } });
 * console.log(manifest?.layers["day"]?.levels);
 * ```
 */
export function parseManifest(json: unknown): { tileSize: number; layers: Record<string, TileLayer> } | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const given = json as { tileSize?: unknown; layers?: unknown };
  if (given.tileSize !== 512 || typeof given.layers !== "object" || given.layers === null) return undefined;
  const layers: Record<string, TileLayer> = {};
  for (const [name, layer] of Object.entries(given.layers as Record<string, { levels?: unknown }>)) {
    if (!Array.isArray(layer?.levels)) continue;
    const levels: TileLayer["levels"] = [];
    for (const entry of layer.levels as { level?: unknown; width?: unknown; columns?: unknown; rows?: unknown }[]) {
      // the set must follow the pyramid's rule, or a tile's place on the sphere would be wrong
      if (typeof entry?.level !== "number" || !Number.isInteger(entry.level) || entry.level < 0 || entry.level > 8) continue;
      if (entry.width !== 1024 * 2 ** entry.level || entry.columns !== tileColumns(entry.level) || entry.rows !== tileRows(entry.level)) continue;
      levels.push({ level: entry.level, width: entry.width });
    }
    if (levels.length > 0) layers[name] = { tileSize: 512, levels: levels.sort((a, b) => a.level - b.level) };
  }
  return Object.keys(layers).length > 0 ? { tileSize: 512, layers } : undefined;
}
