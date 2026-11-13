// Finer map tiles read straight from NASA's Global Imagery Browse Services, in the browser, and only when a page asks. The service's terms and the date they were read are in NOTICE.md. Nothing here is fetched until `load` is called.
import type { BitmapLike, ImageTile, SourceInfo } from "../data-door.ts";
import { tileKeyParts, type EarthMapSource, type EarthTilesOptions } from "./map.ts";
import { gibsGrid, gridKeys, gridLevelFor, gridOnEarth, type MapGrid } from "./grid.ts";

/** The day this service's tile matrix, layers and terms were read. */
export const GIBS_READ = "2026-11-13";

/**
 * The id of the source `gibsTiles` makes. A view credits it while its tiles are on the screen.
 *
 * @example
 * ```ts
 * import { GIBS_ID } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(GIBS_ID);
 * ```
 */
export const GIBS_ID = "gibs";

/**
 * How long a tile is given to arrive before the coarser picture is left as it is and the tile is not asked for again while it stays in view.
 *
 * @example
 * ```ts
 * import { GIBS_SLOW_MS } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(GIBS_SLOW_MS);
 * ```
 */
export const GIBS_SLOW_MS = 2000;

/** The address of one tile. The matrix, the day and the layer are the source's; the path is `z/row/col`, which is not the package's `level/column/row`. */
const TILE_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best";

/**
 * The acknowledgement NASA asks a client to show, in their words (English, read 2026-11-13). The Japanese is this package's translation of that sentence: NASA published none.
 *
 * @example
 * ```ts
 * import { GIBS_CREDIT } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(GIBS_CREDIT.en.startsWith("We acknowledge"));
 * ```
 */
export const GIBS_CREDIT = {
  en: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
  ja: "NASAの地球科学データ情報システム（ESDIS）の一部である Global Imagery Browse Services（GIBS）が提供する画像を使用していることを記します。",
} as const;

const INFO: SourceInfo = {
  id: GIBS_ID,
  name: { en: "NASA GIBS imagery", ja: "NASA GIBSの画像" },
  credit: { en: GIBS_CREDIT.en, ja: GIBS_CREDIT.ja },
  licence: { name: "Public domain", nameJa: "パブリックドメイン", url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" },
  url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
  retrieved: GIBS_READ,
};

/** A day the layer has imagery, inclusive, as the capabilities document listed it on 2026-11-13. Dates sort as text. */
interface DayRange {
  start: string;
  end: string;
}

interface GibsLayer {
  id: string;
  matrix: "250m" | "500m";
  /** Empty for a picture that has no day (the shaded relief). */
  ranges: readonly DayRange[];
  /** True when the picture is one day of the satellite and clouds are left in. */
  clouds: boolean;
}

/**
 * The layers a page may ask for. The ranges are the days the capabilities document listed on 2026-11-13; a day outside them is not requested.
 * The two daily layers are true colour with the clouds left in. The shaded relief is the same kind of picture as the package's own level 5, and is only a stand-in.
 */
export const GIBS_LAYERS: Readonly<Record<string, GibsLayer>> = {
  VIIRS_SNPP_CorrectedReflectance_TrueColor: {
    id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    matrix: "250m",
    clouds: true,
    ranges: [
      { start: "2015-11-24", end: "2022-07-27" },
      { start: "2022-08-10", end: "2024-05-31" },
      { start: "2024-06-04", end: "2024-07-11" },
      { start: "2024-07-16", end: "2024-07-24" },
      { start: "2024-07-29", end: "2024-11-03" },
      { start: "2024-11-06", end: "2026-04-28" },
      { start: "2026-04-30", end: "2026-07-10" },
      { start: "2026-07-16", end: "2026-11-02" },
    ],
  },
  MODIS_Terra_CorrectedReflectance_TrueColor: {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor",
    matrix: "250m",
    clouds: true,
    ranges: [
      { start: "2000-02-24", end: "2000-04-25" },
      { start: "2000-04-28", end: "2000-08-06" },
      { start: "2000-08-18", end: "2001-06-15" },
      { start: "2001-07-03", end: "2002-03-19" },
      { start: "2002-03-28", end: "2003-12-16" },
      { start: "2003-12-24", end: "2008-12-20" },
      { start: "2008-12-23", end: "2016-02-18" },
      { start: "2016-02-27", end: "2022-10-10" },
      { start: "2022-10-23", end: "2026-11-13" },
    ],
  },
  BlueMarble_ShadedRelief_Bathymetry: { id: "BlueMarble_ShadedRelief_Bathymetry", matrix: "500m", clouds: false, ranges: [] },
};

const DEFAULT_LAYER = "VIIRS_SNPP_CorrectedReflectance_TrueColor";

/**
 * True when every sampled pixel is black, which is the picture the service returns for a day it has no swath for (a 200, not a 404).
 *
 * @param pixels - RGBA bytes.
 * @returns Whether every pixel is black.
 *
 * @example
 * ```ts
 * import { samplesAreBlank } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(samplesAreBlank(new Uint8ClampedArray([0, 0, 0, 255])));
 * ```
 */
export function samplesAreBlank(pixels: Uint8ClampedArray): boolean {
  if (pixels.length < 4) return false;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 1 || pixels[i + 1]! > 1 || pixels[i + 2]! > 1) return false;
  return true;
}

/**
 * The UTC day `yyyy-mm-dd` of a moment.
 *
 * @param ms - Milliseconds since the epoch.
 * @returns The day.
 *
 * @example
 * ```ts
 * import { utcDay } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(utcDay(Date.UTC(2026, 5, 21, 12)));
 * ```
 */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The UTC day before `ms`.
 *
 * @param ms - Milliseconds since the epoch.
 * @returns The day before.
 *
 * @example
 * ```ts
 * import { previousUtcDay } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(previousUtcDay(Date.UTC(2026, 5, 21, 12)));
 * ```
 */
export function previousUtcDay(ms: number): string {
  const day = new Date(ms);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/** A day the layer can serve, or `undefined` when the rule lands outside the layer's range (nothing is requested). */
export function gibsDay(layer: GibsLayer, rule: string, ms: number): string | undefined {
  if (layer.ranges.length === 0) return "default";
  const named = /^\d{4}-\d{2}-\d{2}$/.test(rule) ? rule : rule === "shown" ? utcDay(ms) : previousUtcDay(ms);
  return layer.ranges.some((range) => named >= range.start && named <= range.end) ? named : undefined;
}

/**
 * What `gibsTiles` takes. `time` is the moment the Earth is showing. The day requested is the day before that, unless `date` says otherwise.
 *
 * @example
 * ```ts
 * import type { GibsTilesOptions } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const options: GibsTilesOptions = { time: () => new Date("2026-06-21T12:00:00Z") };
 * console.log(typeof options.time);
 * ```
 */
export interface GibsTilesOptions extends EarthTilesOptions {
  /** The moment the view is showing. The default day is the UTC day before this. */
  time: () => Date;
  /** A layer id (see `GIBS_LAYERS`). Left out, the VIIRS daily true-colour layer. */
  layer?: string;
  /** `previous-day` (the default), `shown` (the UTC day of `time`), or one day `yyyy-mm-dd`. */
  date?: string;
}

const anySignal = (signals: AbortSignal[]): AbortSignal => (typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : signals[0]!);

async function pictureIsBlank(image: BitmapLike): Promise<boolean> {
  const CanvasCtor = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;
  if (typeof CanvasCtor !== "function") return false;
  try {
    const canvas = new CanvasCtor(8, 8);
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(image as CanvasImageSource, 0, 0, 8, 8);
    return samplesAreBlank(ctx.getImageData(0, 0, 8, 8).data);
  } catch {
    return false;
  }
}

/**
 * A map source that reads NASA's imagery service directly. It declares its own grid (512 pixel tiles, the Geographic matrix, which is not the package's pyramid). `need` names no tile for a day outside the layer's range.
 * `load` gives a tile two seconds, and treats a 404 or an all-black tile as no imagery. The clouds are not taken out of the daily layers.
 *
 * @param options - The clock, the layer and the day rule, and the `fetch` to use.
 * @returns The source. Its `layer` is `day`. It does not replace the package's own tiles: a view lays it over them, and only when the view is closer than those tiles serve.
 *
 * @example
 * ```ts
 * import { gibsTiles } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const source = gibsTiles({ time: () => new Date("2026-06-21T12:00:00Z") });
 * console.log(source.need({ lonMin: -1, lonMax: 1, latMin: -1, latMax: 1, layer: "day" }, 50000)[0]);
 * ```
 */
export function gibsTiles(options: GibsTilesOptions): EarthMapSource {
  const known = GIBS_LAYERS[options.layer ?? DEFAULT_LAYER];
  const layer = known ?? { id: options.layer ?? DEFAULT_LAYER, matrix: "250m" as const, clouds: true, ranges: [] as readonly DayRange[] };
  const grid: MapGrid = gibsGrid(layer.matrix);
  const rule = options.date ?? "previous-day";
  const get = options.fetch ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const decode = options.decode ?? ((blob: Blob): Promise<BitmapLike> => createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" }));
  // an unknown layer has no published range, so no day is inside it and nothing is requested
  const dayOf = (): string | undefined => (known ? gibsDay(layer, rule, options.time().getTime()) : undefined);
  const source: EarthMapSource = {
    kind: "tiles",
    layer: "day",
    info: INFO,
    grid,
    need(place, detail) {
      const day = dayOf();
      if (day === undefined) return [];
      if (gridLevelFor(grid, detail, 0) === undefined) return [];
      return gridKeys(grid, place, detail, `${day}/`);
    },
    levels() {
      return { tileSize: grid.tileSize, levels: grid.levels.map((level) => ({ level: level.level, width: level.width })) };
    },
    async load(key, signal) {
      const parts = tileKeyParts(key);
      const day = key.split("/")[0];
      const level = parts ? grid.levels.find((one) => one.level === parts.level) : undefined;
      if (!parts || !day || !level) throw new RangeError(`"${key}" is not the key of a tile`);
      if (!gridOnEarth(level, parts.col, parts.row, grid.extent)) throw new RangeError(`"${key}" is off the Earth`);
      const url = `${TILE_URL}/${layer.id}/default/${day}/${layer.matrix}/${parts.level}/${parts.row}/${parts.col}.jpg`;
      const timer = AbortSignal.timeout(GIBS_SLOW_MS);
      let response: Response;
      try {
        response = await get(url, { mode: "cors", signal: anySignal([signal, timer]) });
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      if (!response.ok) throw new Error(`The tile ${key} could not be fetched (${response.status})`);
      const image = await decode(await response.blob());
      if (await pictureIsBlank(image)) {
        image.close?.();
        throw new Error(`The tile ${key} has no imagery`);
      }
      return { width: image.width > 0 ? image.width : 512, height: image.height > 0 ? image.height : 512, image } satisfies ImageTile;
    },
    bytes: (tile) => Math.ceil(tile.width * tile.height * 4 * (4 / 3)),
  };
  return source;
}

/**
 * The finer source an element makes from its attributes, the same object while the attributes are unchanged, or `undefined` when finer tiles are off or the view is limited to the package's own data.
 *
 * @param time - The moment the element is showing.
 * @returns A reader of the element's attributes.
 *
 * @example
 * ```ts
 * import { createFinerHolder } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const hold = createFinerHolder(() => new Date("2026-06-21T12:00:00Z"));
 * console.log(hold.source(() => null, false));
 * ```
 */
export function createFinerHolder(time: () => Date): { source(read: (name: string) => string | null, ownOnly: boolean): EarthMapSource | undefined } {
  let key = "";
  let held: EarthMapSource | undefined;
  return {
    source(read, ownOnly) {
      if (ownOnly || read("tiles-finer") !== "gibs") return undefined;
      const next = `${read("tiles-finer-layer") ?? ""}\n${read("tiles-finer-date") ?? ""}`;
      if (held && key === next) return held;
      key = next;
      const layer = read("tiles-finer-layer");
      const date = read("tiles-finer-date");
      held = gibsTiles({ time, ...(layer ? { layer } : {}), ...(date ? { date } : {}) });
      return held;
    },
  };
}
