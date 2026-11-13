// The maths of the Earth's map tiles, with no browser and no three.js: which pyramid level a zoom needs, and which tiles of that level are in view. Pure.
//
// A tile set is the map cut into 512 pixel squares: level L is `1024 * 2^L` pixels across, in `2^(L+1)` columns and `2^L` rows, column 0 at longitude -180 and row 0 at
// latitude 90, a tile at `<layer>/<level>/<column>/<row>.webp` (`scripts/make-earth-tiles.py` makes one). A source may declare a different grid; `gridTilesInView` walks only the columns and rows the view can see.
import { gridOnEarth, gridSpan, gridTileAt, type MapGrid, type MapGridLevel } from "../door/grid.ts";

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
  /** A camera of the space view, which has a real place and a perspective, in place of the disc: when given, `lon`, `lat`, `panX`, `panY` are not read and `radius` is the disc's radius at the nearest ground. */
  perspective?: TilePerspective;
}

/**
 * A camera that sees the Earth in perspective, from a place that can be a few kilometres above the ground, in the Earth's own axes (x toward longitude 90, y north, z toward longitude 0; the Earth's radius is 1).
 *
 * @example
 * ```ts
 * import type { TilePerspective } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const look: TilePerspective = { eye: [0, 0, 1.0235], project: (p) => ({ x: 400 + p[0] * 5000, y: 300 - p[1] * 5000 }), ground: () => [0, 0, 1] };
 * console.log(look.eye);
 * ```
 */
export interface TilePerspective {
  /** Where the camera is. */
  eye: readonly [number, number, number];
  /** Where a point of the Earth's surface falls in the box (CSS pixels), or `null` where it is behind the camera. */
  project(point: readonly [number, number, number]): { x: number; y: number } | null;
  /** The point of the Earth's surface under a place in the box (a unit vector), or `null` where the box shows the sky. */
  ground(x: number, y: number): readonly [number, number, number] | null;
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
  if (camera.perspective) {
    const g = camera.perspective.ground(x, y);
    return g ? { lon: Math.atan2(g[0], g[2]) / RAD, lat: Math.asin(Math.max(-1, Math.min(1, g[1]))) / RAD } : undefined;
  }
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
  const look = camera.perspective;
  const margin = Math.min(160, Math.min(camera.width, camera.height) / 4);
  const cx = camera.width / 2 + camera.panX;
  const cy = camera.height / 2 + camera.panY;
  const found = new Map<number, { d: number; ndl: number }>();
  const ndlOf = (z: readonly [number, number, number]): number => (sun ? z[0] * sun[0] + z[1] * sun[1] + z[2] * sun[2] : 1);
  const eyeLength = look ? Math.hypot(...look.eye) : 1;
  /** A point of the map as the camera has it: the vector to light it by, and where it is in the box when it faces the camera. */
  const sample = (lon: number, lat: number): { n: [number, number, number]; screen: { x: number; y: number } | null; flat: { x: number; y: number } | null; toward: number } => {
    if (!look) {
      const n = turned(lon, lat, lonRad, latRad);
      const at = { x: cx + n[0] * camera.radius, y: cy - n[1] * camera.radius };
      return { n, screen: n[2] < 0 ? null : at, flat: at, toward: n[2] };
    }
    const cl = Math.cos(lat);
    const n: [number, number, number] = [cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon)];
    const along = n[0] * look.eye[0] + n[1] * look.eye[1] + n[2] * look.eye[2];
    // a point is in sight when it is on the camera's side of the horizon (the plane through the points where its sight lines graze the Earth)
    const screen = along < 1 ? null : look.project(n);
    return { n, screen, flat: screen, toward: along / eyeLength };
  };

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const [west, north, east, south] = tileRect({ level, col, row });
      const middle = sample((west + east) / 2, (north + south) / 2);
      if (middle.toward < -0.4) continue;
      let inside = false;
      let darkest = 1;
      for (let j = 0; j <= 2; j += 1) {
        for (let i = 0; i <= 2; i += 1) {
          const p = sample(west + ((east - west) * i) / 2, north + ((south - north) * j) / 2);
          darkest = Math.min(darkest, ndlOf(p.n));
          if (!p.screen) continue;
          if (p.screen.x >= -margin && p.screen.x <= camera.width + margin && p.screen.y >= -margin && p.screen.y <= camera.height + margin) inside = true;
        }
      }
      if (inside) {
        const d = middle.flat ? Math.hypot(middle.flat.x - camera.width / 2, middle.flat.y - camera.height / 2) : Math.hypot(camera.width, camera.height);
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
      const p = sample((west + east) / 2, (north + south) / 2);
      const dark = [sample(west, north), sample(east, north), sample(west, south), sample(east, south), p].reduce((least, q) => Math.min(least, ndlOf(q.n)), 1);
      found.set(key, { d: p.flat ? Math.hypot(p.flat.x - camera.width / 2, p.flat.y - camera.height / 2) : Math.hypot(camera.width, camera.height), ndl: dark });
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

/**
 * The tiles of one level of a source's own grid that are in view. Only the columns and rows under the box are tested, so a fine matrix (hundreds of columns) is not walked. A tile that misses the Earth is left out.
 *
 * @param level - A level of the source's grid.
 * @param extent - The Earth's extent, from the same grid.
 * @param camera - The camera.
 * @param sun - The Sun's direction as the camera sees it, for each tile's `ndl`; left out, `ndl` is 1.
 * @returns The tiles in view, the nearest to the middle of the box first.
 *
 * @example
 * ```ts
 * import { gibsGrid } from "@johnmorrisdotca/chikyu-earth/door";
 * import { gridTilesInView } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const grid = gibsGrid("250m");
 * console.log(gridTilesInView(grid.levels[6]!, grid.extent, { lon: 0, lat: 0, width: 800, height: 600, panX: 0, panY: 0, radius: 8000 }).length > 0);
 * ```
 */
export function gridTilesInView(level: MapGridLevel, extent: MapGrid["extent"], camera: TileCamera, sun?: readonly [number, number, number]): VisibleTile[] {
  const lonRad = camera.lon * RAD;
  const latRad = camera.lat * RAD;
  const look = camera.perspective;
  const margin = Math.min(160, Math.min(camera.width, camera.height) / 4);
  const cx = camera.width / 2 + camera.panX;
  const cy = camera.height / 2 + camera.panY;
  const eyeLength = look ? Math.hypot(...look.eye) : 1;
  const ndlOf = (z: readonly [number, number, number]): number => (sun ? z[0] * sun[0] + z[1] * sun[1] + z[2] * sun[2] : 1);
  const sample = (lon: number, lat: number): { n: [number, number, number]; screen: { x: number; y: number } | null; flat: { x: number; y: number } | null; toward: number } => {
    if (!look) {
      const n = turned(lon * RAD, lat * RAD, lonRad, latRad);
      const at = { x: cx + n[0] * camera.radius, y: cy - n[1] * camera.radius };
      return { n, screen: n[2] < 0 ? null : at, flat: at, toward: n[2] };
    }
    const cl = Math.cos(lat * RAD);
    const n: [number, number, number] = [cl * Math.sin(lon * RAD), Math.sin(lat * RAD), cl * Math.cos(lon * RAD)];
    const along = n[0] * look.eye[0] + n[1] * look.eye[1] + n[2] * look.eye[2];
    const screen = along < 1 ? null : look.project(n);
    return { n, screen, flat: screen, toward: along / eyeLength };
  };
  const candidates = new Set<number>();
  const step = 24;
  for (let y = 0; y <= camera.height + step - 1; y += step) {
    for (let x = 0; x <= camera.width + step - 1; x += step) {
      const place = pointOnEarth(camera, Math.min(x, camera.width), Math.min(y, camera.height));
      if (!place) continue;
      const at = gridTileAt(level, place.lon, place.lat, extent);
      if (!at) continue;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const col = at.col + dc;
          const row = at.row + dr;
          if (col < 0 || row < 0 || col >= level.columns || row >= level.rows) continue;
          if (!gridOnEarth(level, col, row, extent)) continue;
          candidates.add(row * level.columns + col);
        }
      }
    }
  }
  const found: VisibleTile[] = [];
  for (const key of candidates) {
    const col = key % level.columns;
    const row = Math.floor(key / level.columns);
    const span = gridSpan(level, col, row);
    const west = Math.max(span.lonMin, extent.west);
    const east = Math.min(span.lonMax, extent.east);
    const north = Math.min(span.latMax, extent.north);
    const south = Math.max(span.latMin, extent.south);
    const middle = sample((west + east) / 2, (north + south) / 2);
    if (middle.toward < -0.4) continue;
    let inside = false;
    let darkest = 1;
    for (let j = 0; j <= 2; j += 1) {
      for (let i = 0; i <= 2; i += 1) {
        const p = sample(west + ((east - west) * i) / 2, north + ((south - north) * j) / 2);
        darkest = Math.min(darkest, ndlOf(p.n));
        if (p.screen && p.screen.x >= -margin && p.screen.x <= camera.width + margin && p.screen.y >= -margin && p.screen.y <= camera.height + margin) inside = true;
      }
    }
    if (!inside) continue;
    const d = middle.flat ? Math.hypot(middle.flat.x - camera.width / 2, middle.flat.y - camera.height / 2) : Math.hypot(camera.width, camera.height);
    found.push({ level: level.level, col, row, d, ndl: darkest });
  }
  found.sort((a, b) => a.d - b.d);
  return found;
}
