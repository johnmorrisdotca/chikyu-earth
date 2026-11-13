// A map grid that is not the package's pyramid. A source names its own tile size, how many columns and rows each level has, and where the grid starts, and the loader places tiles from that instead of from `2^(L+1)` by `2^L`. Pure: no DOM, no fetch, no three.js.
import type { MapPlace } from "../data-door.ts";

const EDGE = 1e-9;

/**
 * One level of a source's own grid. `width` is the pixels across a full turn of longitude, which is what a view compares with the screen. `west` and `north` are the outer corner of column 0, row 0, in degrees.
 * `tileLon` and `tileLat` are the degrees one tile covers, which may run past the Earth.
 *
 * @example
 * ```ts
 * import type { MapGridLevel } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const level: MapGridLevel = { level: 3, width: 5120, columns: 10, rows: 5, west: -180, north: 90, tileLon: 36, tileLat: 36 };
 * console.log(level.columns);
 * ```
 */
export interface MapGridLevel {
  level: number;
  width: number;
  columns: number;
  rows: number;
  west: number;
  north: number;
  tileLon: number;
  tileLat: number;
}

/**
 * The grid a map source declares when it is not the package's pyramid: the tile size, the Earth's extent in degrees, and one entry per level.
 *
 * @example
 * ```ts
 * import type { MapGrid } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const grid: MapGrid = { tileSize: 512, extent: { west: -180, south: -90, east: 180, north: 90 }, levels: [] };
 * console.log(grid.tileSize);
 * ```
 */
export interface MapGrid {
  tileSize: number;
  extent: { west: number; south: number; east: number; north: number };
  levels: readonly MapGridLevel[];
}

/**
 * Fold a longitude into the half-open range from -180 up to, but not including, 180. 180 and -180 are the same meridian, and both come back as -180.
 *
 * @param lon - A longitude in degrees, which may fall outside one turn.
 * @returns The longitude in `[-180, 180)`.
 *
 * @example
 * ```ts
 * import { wrapLon } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(wrapLon(180), wrapLon(-180), wrapLon(190));
 * ```
 */
export function wrapLon(lon: number): number {
  const turned = (((lon + 180) % 360) + 360) % 360 - 180;
  return turned === 180 ? -180 : turned;
}

/**
 * The level of a grid whose width is at least `detail` pixels across a full turn, or the finest level when none is, or `undefined` when the grid has no level wider than `minWidth`.
 *
 * @param grid - The source's grid.
 * @param detail - The pixels across a full turn the view wants.
 * @param minWidth - Levels no wider than this are left out (the picture already underneath).
 * @returns The level, or `undefined` when nothing in the grid is finer than `minWidth`.
 *
 * @example
 * ```ts
 * import { gibsGrid, gridLevelFor } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(gridLevelFor(gibsGrid("250m"), 40000, 32768)?.level);
 * ```
 */
export function gridLevelFor(grid: MapGrid, detail: number, minWidth: number): MapGridLevel | undefined {
  const levels = grid.levels.filter((level) => level.width > minWidth).sort((a, b) => a.width - b.width);
  if (levels.length === 0 || !(detail > minWidth)) return undefined;
  return levels.find((level) => level.width >= detail) ?? levels[levels.length - 1];
}

/**
 * The longitude and latitude a tile covers, before it is cut to the Earth. The south and east edges may fall past the Earth on a coarse level.
 *
 * @param level - The level the tile is on.
 * @param col - The column, from the west.
 * @param row - The row, from the north.
 * @returns The tile's bounds in degrees.
 *
 * @example
 * ```ts
 * import { gibsGrid, gridSpan } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(gridSpan(gibsGrid("250m").levels[0]!, 0, 0).latMin < -90);
 * ```
 */
export function gridSpan(level: MapGridLevel, col: number, row: number): { lonMin: number; lonMax: number; latMin: number; latMax: number } {
  const lonMin = level.west + col * level.tileLon;
  const latMax = level.north - row * level.tileLat;
  return { lonMin, lonMax: lonMin + level.tileLon, latMax, latMin: latMax - level.tileLat };
}

/**
 * True when the tile runs past the Earth's extent (a coarse level's tile is wider than the Earth).
 *
 * @param level - The level.
 * @param col - The column.
 * @param row - The row.
 * @returns Whether any edge falls outside -180 to 180 or -90 to 90.
 *
 * @example
 * ```ts
 * import { gibsGrid, gridPastExtent } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const coarse = gibsGrid("250m").levels[0]!;
 * console.log(gridPastExtent(coarse, 0, 0));
 * ```
 */
export function gridPastExtent(level: MapGridLevel, col: number, row: number): boolean {
  const span = gridSpan(level, col, row);
  return span.lonMin < -180 - EDGE || span.lonMax > 180 + EDGE || span.latMin < -90 - EDGE || span.latMax > 90 + EDGE;
}

/**
 * The part of a tile that lies on the Earth, or `undefined` when the tile misses the Earth entirely.
 *
 * @param level - The level.
 * @param col - The column.
 * @param row - The row.
 * @param extent - The Earth's extent in degrees.
 * @returns The overlap, or `undefined`.
 *
 * @example
 * ```ts
 * import { gibsGrid, gridOnEarth } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(gridOnEarth(gibsGrid("250m").levels[3]!, 0, 0, { west: -180, south: -90, east: 180, north: 90 }));
 * ```
 */
export function gridOnEarth(level: MapGridLevel, col: number, row: number, extent: MapGrid["extent"]): MapPlace | undefined {
  const span = gridSpan(level, col, row);
  const lonMin = Math.max(span.lonMin, extent.west);
  const lonMax = Math.min(span.lonMax, extent.east);
  const latMin = Math.max(span.latMin, extent.south);
  const latMax = Math.min(span.latMax, extent.north);
  if (!(lonMax > lonMin) || !(latMax > latMin)) return undefined;
  return { lonMin, lonMax, latMin, latMax };
}

/**
 * The column and row of the tile that holds a point, or `undefined` when the point is off the Earth or the tile that would hold it misses the Earth.
 * A longitude of 180 is the same meridian as -180, and both fall in column 0. A latitude of -90 falls in the last row that still meets the Earth.
 *
 * @param level - The level.
 * @param lon - The longitude in degrees.
 * @param lat - The latitude in degrees.
 * @param extent - The Earth's extent.
 * @returns The tile, or `undefined`.
 *
 * @example
 * ```ts
 * import { gibsGrid, gridTileAt } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const level = gibsGrid("250m").levels[3]!;
 * console.log(gridTileAt(level, 180, 0, gibsGrid("250m").extent));
 * ```
 */
export function gridTileAt(level: MapGridLevel, lon: number, lat: number, extent: MapGrid["extent"]): { col: number; row: number } | undefined {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat > extent.north || lat < extent.south) return undefined;
  const x = wrapLon(lon);
  let col = Math.floor((x - level.west) / level.tileLon + EDGE);
  let row = Math.floor((level.north - lat) / level.tileLat + EDGE);
  if (col >= level.columns) col = level.columns - 1;
  if (row >= level.rows) row = level.rows - 1;
  if (col < 0 || row < 0) return undefined;
  return gridOnEarth(level, col, row, extent) ? { col, row } : undefined;
}

/**
 * The key of the tile that holds a point, `[<prefix>]level/column/row`, or `undefined` when no tile holds it.
 *
 * @param grid - The grid.
 * @param level - The level number.
 * @param lon - The longitude in degrees.
 * @param lat - The latitude in degrees.
 * @param prefix - Put before the key.
 * @returns The key, or `undefined`.
 *
 * @example
 * ```ts
 * import { gibsGrid, gridKey } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(gridKey(gibsGrid("250m"), 3, 0, 0));
 * ```
 */
export function gridKey(grid: MapGrid, level: number, lon: number, lat: number, prefix = ""): string | undefined {
  const found = grid.levels.find((one) => one.level === level);
  if (!found) return undefined;
  const tile = gridTileAt(found, lon, lat, grid.extent);
  return tile ? `${prefix}${found.level}/${tile.col}/${tile.row}` : undefined;
}

/**
 * The keys of the tiles that cover a place at a detail. The longitude may pass 180. A place with no area gives none.
 *
 * @param grid - The grid.
 * @param place - The part of the map, in degrees.
 * @param detail - The pixels across a full turn wanted.
 * @param prefix - Put before each key.
 * @returns The keys, row by row.
 *
 * @example
 * ```ts
 * import { gibsGrid, gridKeys } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(gridKeys(gibsGrid("250m"), { lonMin: 170, lonMax: 190, latMin: -5, latMax: 5 }, 5120));
 * ```
 */
export function gridKeys(grid: MapGrid, place: MapPlace, detail: number, prefix = ""): string[] {
  if (!(place.lonMax > place.lonMin) || !(place.latMax > place.latMin)) return [];
  const level = grid.levels.find((one) => one.width >= detail) ?? grid.levels[grid.levels.length - 1];
  if (!level) return [];
  const span = Math.min(360, place.lonMax - place.lonMin);
  const cols: number[] = [];
  const seenCol = new Set<number>();
  const stepLon = level.tileLon / 2;
  const midLat = Math.min(place.latMax - EDGE, Math.max(place.latMin + EDGE, (place.latMin + place.latMax) / 2));
  const markCol = (lon: number): void => {
    const tile = gridTileAt(level, lon, midLat, grid.extent);
    if (!tile || seenCol.has(tile.col)) return;
    seenCol.add(tile.col);
    cols.push(tile.col);
  };
  for (let lon = place.lonMin; lon < place.lonMin + span - EDGE; lon += stepLon) markCol(lon);
  markCol(place.lonMin + span - EDGE);
  const rows: number[] = [];
  const seenRow = new Set<number>();
  const stepLat = level.tileLat / 2;
  const markRow = (lat: number): void => {
    const tile = gridTileAt(level, place.lonMin, lat, grid.extent);
    if (!tile || seenRow.has(tile.row)) return;
    seenRow.add(tile.row);
    rows.push(tile.row);
  };
  for (let lat = place.latMax; lat > place.latMin + EDGE; lat -= stepLat) markRow(lat);
  markRow(place.latMin + EDGE);
  rows.sort((a, b) => a - b);
  const keys: string[] = [];
  for (const row of rows) for (const col of cols) keys.push(`${prefix}${level.level}/${col}/${row}`);
  return keys;
}

/**
 * The Geographic (EPSG:4326) tile matrix NASA's imagery service publishes, read from its capabilities on 2026-11-13.
 * A pixel is `0.5625 / 2^level` degrees. Tiles are 512 pixels, the corner of column 0 and row 0 is longitude -180 and latitude 90, and a level has as many tiles as it takes to cover the Earth, so levels 0, 1 and 2 run past it.
 *
 * @param matrix - `250m` (levels 0 to 8) or `500m` (levels 0 to 7).
 * @returns The grid.
 *
 * @example
 * ```ts
 * import { gibsGrid } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(gibsGrid("250m").levels[3]);
 * ```
 */
export function gibsGrid(matrix: "250m" | "500m"): MapGrid {
  const max = matrix === "250m" ? 8 : 7;
  const levels: MapGridLevel[] = [];
  for (let level = 0; level <= max; level += 1) {
    const pixel = 0.5625 / 2 ** level;
    const tile = 512 * pixel;
    levels.push({
      level,
      width: 360 / pixel,
      columns: Math.ceil((360 - EDGE) / tile),
      rows: Math.ceil((180 - EDGE) / tile),
      west: -180,
      north: 90,
      tileLon: tile,
      tileLat: tile,
    });
  }
  return { tileSize: 512, extent: { west: -180, south: -90, east: 180, north: 90 }, levels };
}
