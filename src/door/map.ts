// The map sources of the data door: the finer map tiles of the Earth as a `TileSource`. The package's own folder of tiles is one (`earthTiles`, what the `tiles` attribute means), and a caller's source of the same shape takes
// its place for a layer. The pyramid is the package's: level L is `1024 * 2^L` pixels across in 512 pixel tiles, `2^(L+1)` columns and `2^L` rows, column 0 at longitude -180 and row 0 at latitude 90 (see `realistic/tiles.ts`), and a
// tile's key ends in `level/column/row`. Pure apart from the `fetch` and `createImageBitmap` a source is given or finds: no DOM, no three.js.
import type { BitmapLike, ImageTile, MapPlace, TileSource } from "../data-door.ts";
import { parseManifest, tileColumns, tileRows, type TileId, type TileLayer } from "../realistic/tiles.ts";
import { OWN_BY_ID, madeHere } from "./own.ts";

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
/** A tile's own edge is not the next tile: places are measured to a billionth of a tile. */
const EDGE = 1e-9;

/**
 * What a map source draws: `day` and `night` are the Earth's pictures, which the realistic Earth lays tiles over; `clouds` and `water` are the door's for the whole-Earth layers they are, which the package does not tile or draw yet.
 *
 * @example
 * ```ts
 * import type { MapLayer } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const layers: MapLayer[] = ["day", "night", "clouds", "water"];
 * console.log(layers.join(", "));
 * ```
 */
export type MapLayer = "day" | "night" | "clouds" | "water";

/**
 * The place a map source is asked about: the family's `MapPlace` in degrees (longitude from `lonMin` to `lonMax`, which may pass 180 and is at most a whole turn, latitude from `latMin` to `latMax`), and the layer it is for.
 *
 * @example
 * ```ts
 * import type { EarthMapPlace } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const place: EarthMapPlace = { lonMin: 170, lonMax: 190, latMin: -10, latMax: 10, layer: "day" };
 * console.log(place.layer);
 * ```
 */
export type EarthMapPlace = MapPlace & { layer?: string };

/**
 * A source of the Earth's map in tiles for one layer (or every layer of a folder): a `TileSource` of the family's map shape (the place is a `MapPlace`, the detail is the pixels across the whole circumference, a tile is an
 * `ImageTile`) that says which `layer` it is for. A `layer` of `"*"` is every layer of a folder (the place then names the one, in `place.layer`, and the keys start with its name). The keys a source returns end in
 * `level/column/row` on the package's pyramid. `levels` says which levels the source has when that has to be asked (a folder's manifest); left out, levels 3 and 4.
 *
 * @example
 * ```ts
 * import type { EarthMapSource } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const layers = (sources: readonly EarthMapSource[]): string[] => sources.map((source) => source.layer);
 * console.log(layers([]));
 * ```
 */
export type EarthMapSource = TileSource<EarthMapPlace, number, ImageTile> & {
  layer: MapLayer | "*";
  levels?(layer: string, signal: AbortSignal): TileLayer | undefined | Promise<TileLayer | undefined>;
};

/**
 * The levels a source has when it does not say: levels 3 and 4 (8192 and 16384 pixels across), the two the package's cutter makes beyond its own 4096 pixel picture.
 *
 * @example
 * ```ts
 * import { DEFAULT_LEVELS } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(DEFAULT_LEVELS.levels.map((level) => level.width));
 * ```
 */
export const DEFAULT_LEVELS: TileLayer = Object.freeze({ tileSize: 512, levels: Object.freeze([3, 4].map((level) => ({ level, width: 1024 * 2 ** level }))) as TileLayer["levels"] });

const KEY_END = /(\d+)\/(\d+)\/(\d+)$/;

/**
 * The level, column and row a tile key ends in, or `undefined` for a key that does not end in three numbers.
 *
 * @param key - The tile's key.
 * @returns Where the tile is in the pyramid, or `undefined` for a key that does not end in three numbers.
 *
 * @example
 * ```ts
 * import { tileKeyParts } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(tileKeyParts("day/3/12/5"));
 * ```
 */
export function tileKeyParts(key: string): TileId | undefined {
  const found = KEY_END.exec(key);
  return found === null ? undefined : { level: Number(found[1]), col: Number(found[2]), row: Number(found[3]) };
}

/**
 * The place a tile covers, in degrees: what a view asks a source about to get that tile's key.
 *
 * @param tile - A tile of the pyramid.
 * @returns The tile's longitude and latitude bounds.
 *
 * @example
 * ```ts
 * import { tilePlace } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(tilePlace({ level: 3, col: 0, row: 0 }));
 * ```
 */
export function tilePlace(tile: TileId): MapPlace {
  const columns = tileColumns(tile.level);
  const rows = tileRows(tile.level);
  return { lonMin: -180 + (360 * tile.col) / columns, lonMax: -180 + (360 * (tile.col + 1)) / columns, latMax: 90 - (180 * tile.row) / rows, latMin: 90 - (180 * (tile.row + 1)) / rows };
}

/**
 * The keys of the tiles that cover a place at a detail, on the package's pyramid: the level is the lowest whose width is at least `detail` pixels round (or the finest there is), and the tiles are every one the place touches.
 * Pure. A source of your own can build its `need` on it.
 *
 * @param place - The part of the map, in degrees.
 * @param detail - The pixels across the whole circumference wanted.
 * @param layer - The levels the source has; `DEFAULT_LEVELS` where left out.
 * @param prefix - Put before each key (`"day/"`), for a folder of several layers.
 * @returns The keys, `[<prefix>]level/column/row`, row by row; none for a place with no area.
 *
 * @example
 * ```ts
 * import { mapKeys } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(mapKeys({ lonMin: -10, lonMax: 10, latMin: -5, latMax: 5 }, 8192));
 * ```
 */
export function mapKeys(place: MapPlace, detail: number, layer: TileLayer = DEFAULT_LEVELS, prefix = ""): string[] {
  if (layer.levels.length === 0 || !(place.lonMax > place.lonMin) || !(place.latMax >= place.latMin)) return [];
  const level = layer.levels.find((one) => one.width >= detail) ?? layer.levels[layer.levels.length - 1]!;
  const columns = tileColumns(level.level);
  const rows = tileRows(level.level);
  const span = Math.min(TAU, (place.lonMax - place.lonMin) * RAD);
  const first = Math.floor(((place.lonMin * RAD) / TAU + 0.5) * columns + EDGE);
  const count = span >= TAU - 1e-9 ? columns : Math.min(columns, Math.ceil(((place.lonMin * RAD + span) / TAU + 0.5) * columns - EDGE) - first);
  const row0 = Math.max(0, Math.floor((0.5 - (place.latMax * RAD) / Math.PI) * rows + EDGE));
  const row1 = Math.min(rows, Math.max(row0 + 1, Math.ceil((0.5 - (place.latMin * RAD) / Math.PI) * rows - EDGE)));
  const keys: string[] = [];
  for (let row = row0; row < row1; row += 1) for (let i = 0; i < count; i += 1) keys.push(`${prefix}${level.level}/${(((first + i) % columns) + columns) % columns}/${row}`);
  return keys;
}

/**
 * What `earthTiles` takes.
 *
 * @example
 * ```ts
 * import type { EarthTilesOptions } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const options: EarthTilesOptions = { fetch: (url, init) => fetch(url, init) };
 * console.log(typeof options.fetch);
 * ```
 */
export interface EarthTilesOptions {
  /** The `fetch` to use: the global one where left out. It is called as `fetch(address, { mode: "cors", signal })`. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Makes a picture of a tile's bytes: `createImageBitmap` where left out. */
  decode?: (blob: Blob) => Promise<BitmapLike>;
}

const slash = (base: string): string => (base.endsWith("/") ? base : `${base}/`);

/**
 * What a decoded picture holds in memory, with its mipmaps (4/3 of its bytes): the `bytes` of a map source.
 *
 * @param tile - The tile.
 * @returns Bytes.
 *
 * @example
 * ```ts
 * import { imageBytes } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(imageBytes({ width: 512, height: 512, image: { width: 512, height: 512 } }));
 * ```
 */
export function imageBytes(tile: ImageTile): number {
  return Math.ceil(tile.width * tile.height * 4 * (4 / 3));
}

const folders = new Map<string, EarthMapSource>();

/**
 * The package's own finer map tiles as a source: a folder with a `manifest.json` and a tile for each layer, level and place at `<layer>/<level>/<column>/<row>.webp` (made by `scripts/make-earth-tiles.py`). This is what the `tiles`
 * attribute of `<chikyu-earth-realistic>` means, and what the Earth is drawn from where no source of yours covers a layer. It is for every layer in the folder (`layer: "*"`); the manifest says which levels each has, and it is read once
 * for the source, only when a view first wants more than the 4096 pixel picture. Its `id` is `chikyu-tiles`, and a view counts it as the package's own data.
 *
 * @param base - The folder's address, with or without the closing slash.
 * @param options - The `fetch` and the decoder to use.
 * @returns The source.
 *
 * @example
 * ```ts no-run
 * import { earthTiles } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const mine = earthTiles("/tiles/");
 * console.log(mine.need({ lonMin: 0, lonMax: 20, latMin: 0, latMax: 10, layer: "day" }, 8192));
 * ```
 */
export function earthTiles(base: string, options: EarthTilesOptions = {}): EarthMapSource {
  const folder = slash(base);
  const get = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const decode = options.decode ?? ((blob: Blob): Promise<BitmapLike> => createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" }));
  let manifest: Promise<Record<string, TileLayer> | undefined> | undefined;
  const source: EarthMapSource = {
    kind: "tiles",
    layer: "*",
    info: OWN_BY_ID.get("chikyu-tiles")!,
    need(place, detail) {
      const layer = place.layer;
      if (typeof layer !== "string" || layer === "") throw new RangeError("a folder of tiles is asked for a place with its layer");
      return mapKeys(place, detail, DEFAULT_LEVELS, `${layer}/`);
    },
    async levels(layer) {
      // read once: a folder that cannot be read is not asked again by this source, so a view at rest sends nothing
      const asked = (manifest ??= get(`${folder}manifest.json`, { mode: "cors" }).then(
        async (response) => (response.ok ? parseManifest(await response.json().catch(() => undefined))?.layers : undefined),
        () => undefined,
      ));
      const layers = await asked;
      // an answer that was no folder is not kept: the next view of it (a changed source, a new element) asks again, and a view at rest never does
      if (layers === undefined && manifest === asked) manifest = undefined;
      return layers?.[layer];
    },
    async load(key, signal) {
      if (tileKeyParts(key) === undefined) throw new RangeError(`"${key}" is not the key of a tile`);
      const response = await get(`${folder}${key}.webp`, { mode: "cors", signal });
      if (!response.ok) throw new Error(`The tile ${key} could not be fetched (${response.status})`);
      const image = await decode(await response.blob());
      return { width: image.width > 0 ? image.width : 512, height: image.height > 0 ? image.height : 512, image };
    },
    bytes: (tile) => imageBytes(tile),
  };
  madeHere(source);
  return source;
}

/**
 * The folder source of an address, the same object each time: what an element makes of its `tiles` attribute, so that two elements on a page with the same folder share one source and its pictures.
 *
 * @param base - The folder's address.
 * @returns The source `earthTiles` makes for it.
 *
 * @example
 * ```ts no-run
 * import { folderSource } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(folderSource("/tiles/") === folderSource("/tiles/"));
 * ```
 */
export function folderSource(base: string): EarthMapSource {
  const folder = slash(base);
  let held = folders.get(folder);
  if (held === undefined) {
    held = earthTiles(folder);
    folders.set(folder, held);
  }
  return held;
}
