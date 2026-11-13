// Finer map tiles read straight from NASA's Global Imagery Browse Services, in the browser, and only when a page asks. The service's terms and the date they were read are in NOTICE.md. Nothing here is fetched until `load` is called.
import type { BitmapLike, ImageTile, SourceInfo } from "../data-door.ts";
import { tileKeyParts, type EarthMapPlace, type EarthMapSource, type EarthTilesOptions } from "./map.ts";
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
  matrix: "31.25m" | "250m" | "500m";
  /** Empty for a picture that has no day (the shaded relief, and the annual Landsat mosaics, which have `years`). */
  ranges: readonly DayRange[];
  /** True when the picture is one day of the satellite and clouds are left in. */
  clouds: boolean;
  /** For a layer with one picture a year: the years' times, as the service names them (`yyyy-mm-dd`), oldest first. The newest is the one used unless a page names another of them. */
  years?: readonly string[];
  /**
   * For a layer that shows water as nearly black (the Landsat mosaics): the luminance (0 to 255) below which a pixel is clear and from which it is opaque, so the sea is left to the package's blue ocean and the picture is a land picture. Left out, only the black of no data is cleared (`NODATA_BELOW` and `NODATA_FULL`).
   */
  clear?: readonly [number, number];
  /** Multiplies each colour, to bring the picture to the look of the package's own pictures (found by comparing them over land, see NOTICE.md). */
  gain?: readonly [number, number, number];
  /** A sentence about the layer's own data, added to NASA's acknowledgement while its tiles are on the screen. */
  credit?: { en: string; ja: string };
}

/**
 * The layers a page may ask for. The ranges are the days the capabilities document listed on 2026-11-13; a day outside them is not requested.
 * The two daily layers are true colour with the clouds left in. The shaded relief is the same kind of picture as the package's own level 5, and is only a stand-in.
 */
export const GIBS_LAYERS: Readonly<Record<string, GibsLayer>> = {
  Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual: {
    id: "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual",
    matrix: "31.25m",
    clouds: false,
    ranges: [],
    // as the capabilities document listed them on 2026-11-13: 1983-12-01 to 1985-12-01, 1988-12-01 to 1990-12-01, 1998-12-01 to 2000-12-01, a picture a year
    years: ["1983-12-01", "1984-12-01", "1985-12-01", "1988-12-01", "1989-12-01", "1990-12-01", "1998-12-01", "1999-12-01", "2000-12-01"],
    // per channel, the median over six land places of our level 5 divided by this layer's mean (NOTICE.md): the package's pictures are darker and warmer
    gain: [0.76, 0.66, 0.55],
    // the sea is (7, 25, 12) there and a dark wooded slope (8, 39, 6) to (22, 54, 7): clear below a luminance of 20, opaque from 32
    clear: [20, 32],
    credit: {
      en: "Landsat imagery: NASA Global Web-Enabled Landsat Data (GWELD), annual 30 m mosaic, distributed by NASA's LP DAAC.",
      ja: "Landsat画像：NASAのGlobal Web-Enabled Landsat Data（GWELD）の年間30 mモザイク。NASAのLP DAACが配布しています。",
    },
  },
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

/**
 * The layer a page gets without naming one: the Landsat annual true-colour mosaic (30 m, no cloud, land only; the year 2000, the newest it has). The daily layers are a named choice: `today` for MODIS Terra.
 * A layer id is taken as it is, and these short names stand for two of them.
 */
export const GIBS_DEFAULT_LAYER = "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual";
const DEFAULT_LAYER = GIBS_DEFAULT_LAYER;

/** The short names `tiles-finer-layer` takes besides a layer's own id: `landsat` (the default) and `today` (the daily picture of MODIS Terra, with its clouds). */
export const GIBS_NAMES: Readonly<Record<string, string>> = {
  landsat: GIBS_DEFAULT_LAYER,
  today: "MODIS_Terra_CorrectedReflectance_TrueColor",
};

/** How many days, counting the first, the default rule looks back for a day with imagery. */
export const GIBS_LOOKBACK_DAYS = 10;

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

/**
 * Whether the layer may have imagery for a day: inside one of the ranges listed on 2026-11-13, or after the last of them (a daily layer goes on growing, and the list does not). A day before the layer's first day, or in a gap the list shows, has none, and is not asked for.
 */
export function gibsHasDay(layer: GibsLayer, day: string): boolean {
  if (layer.ranges.length === 0) return true;
  const first = layer.ranges[0]!;
  const last = layer.ranges[layer.ranges.length - 1]!;
  if (day < first.start) return false;
  if (day > last.end) return true;
  return layer.ranges.some((range) => day >= range.start && day <= range.end);
}

/** The day a fixed rule names (`previous-day`, `shown`, or one `yyyy-mm-dd`), or `undefined` for `latest`, which has to be looked for. */
function fixedDay(rule: string, ms: number): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rule)) return rule;
  if (rule === "shown") return utcDay(ms);
  if (rule === "previous-day") return previousUtcDay(ms);
  return undefined;
}

/** A day the layer can serve for a fixed rule (`latest`, the default, starts at the day before `ms`), or `undefined` when it lands where the layer has no imagery (nothing is requested). */
export function gibsDay(layer: GibsLayer, rule: string, ms: number): string | undefined {
  if (layer.years) {
    // one picture a year: the year a page names if the layer has it (any day of that year), else the newest
    const named = /^\d{4}/.test(rule) ? layer.years.find((time) => time.slice(0, 4) === rule.slice(0, 4)) : undefined;
    return named ?? layer.years[layer.years.length - 1];
  }
  if (layer.ranges.length === 0) return "default";
  const named = fixedDay(rule, ms) ?? previousUtcDay(ms);
  return gibsHasDay(layer, named) ? named : undefined;
}

/** The day before `day`. */
const dayBefore = (day: string): string => previousUtcDay(Date.parse(`${day}T12:00:00Z`));

/** The days the default rule looks at, newest first: from `start`, back, skipping days the layer is known to lack, until the layer's first day or `GIBS_LOOKBACK_DAYS` days have been counted. */
export function gibsCandidates(layer: GibsLayer, start: string): string[] {
  const found: string[] = [];
  let day = start;
  for (let count = 0; count < GIBS_LOOKBACK_DAYS; count += 1) {
    if (layer.ranges.length > 0 && day < layer.ranges[0]!.start) break;
    if (gibsHasDay(layer, day)) found.push(day);
    day = dayBefore(day);
  }
  return found;
}

/** The days the default rule has settled, by layer and starting day: a day with imagery, or `null` for none. Kept for the session, so a view that moves asks nothing again. */
const settled = new Map<string, string | null>();
const probing = new Set<string>();

/** Forget what the default rule has settled (for a page that wants to look again, and for the tests). */
export function forgetGibsDays(): void {
  settled.clear();
  probing.clear();
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
  /** A layer id (see `GIBS_LAYERS`). Left out, the MODIS Terra daily true-colour layer. */
  layer?: string;
  /**
   * `latest` (the default): the most recent day with imagery, looked for from the day before `time` back, one tile under the middle of the view a day. `previous-day` (that day alone), `shown` (the UTC day of `time`), or one day `yyyy-mm-dd`.
   */
  date?: string;
  /** Called when the default rule has found its day, so the view draws again and asks for the tiles. */
  changed?: () => void;
  /** How many milliseconds a tile is given to arrive (`GIBS_SLOW_MS`, 2000, when left out). A page on a slow link can give it longer. */
  slowMs?: number;
}

/**
 * Where a tile's luminance (0 to 255) is at or below this, the picture has no data there (the service paints it black) and the loader draws it clear; from `NODATA_FULL` it is opaque, and between the two a share, so the edge of a gap is not a hard
 * black line. A layer may set its own limits (`clear`).
 */
export const NODATA_BELOW = 3;
/** The luminance from which a pixel is wholly opaque (see `NODATA_BELOW`). */
export const NODATA_FULL = 14;

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
  const wanted = options.layer ? (GIBS_NAMES[options.layer] ?? options.layer) : DEFAULT_LAYER;
  const known = GIBS_LAYERS[wanted];
  const layer = known ?? { id: wanted, matrix: "250m" as const, clouds: true, ranges: [] as readonly DayRange[] };
  const grid: MapGrid = gibsGrid(layer.matrix);
  const rule = options.date ?? "latest";
  const get = options.fetch ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const decode = options.decode ?? ((blob: Blob): Promise<BitmapLike> => createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" }));
  /** One tile of one day, as `load` reads it: nothing for a 404, a blank picture, a slow answer or a failure. */
  const fetchTile = async (key: string, signal: AbortSignal): Promise<ImageTile> => {
    const parts = tileKeyParts(key);
    const day = key.split("/")[0];
    const level = parts ? grid.levels.find((one) => one.level === parts.level) : undefined;
    if (!parts || !day || !level) throw new RangeError(`"${key}" is not the key of a tile`);
    if (!gridOnEarth(level, parts.col, parts.row, grid.extent)) throw new RangeError(`"${key}" is off the Earth`);
    const url = `${TILE_URL}/${layer.id}/default/${day}/${layer.matrix}/${parts.level}/${parts.row}/${parts.col}.jpg`;
    const timer = AbortSignal.timeout(options.slowMs && options.slowMs > 0 ? options.slowMs : GIBS_SLOW_MS);
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
  };
  /** Look for the most recent day with imagery: the tile under the middle of the view, one day at a time, newest first, each given the usual two seconds. The answer, a day or none, is kept. */
  const lookFor = (settledKey: string, start: string, place: EarthMapPlace, detail: number): void => {
    probing.add(settledKey);
    void (async () => {
      let found: string | null = null;
      for (const day of gibsCandidates(layer, start)) {
        const keys = gridKeys(grid, place, detail, `${day}/`);
        if (keys.length === 0) break;
        try {
          const tile = await fetchTile(keys[0]!, new AbortController().signal);
          tile.image.close?.();
          found = day;
          break;
        } catch {
          // no picture for this day here: the day before
        }
      }
      settled.set(settledKey, found);
      probing.delete(settledKey);
      if (found !== null) options.changed?.();
    })();
  };
  // an unknown layer has no published range, so no day is inside it and nothing is requested
  const dayOf = (place: EarthMapPlace, detail: number): string | undefined => {
    if (!known) return undefined;
    const ms = options.time().getTime();
    if (layer.years || fixedDay(rule, ms) !== undefined || layer.ranges.length === 0) return gibsDay(layer, rule, ms);
    const start = previousUtcDay(ms);
    const settledKey = `${layer.id}|${start}`;
    if (settled.has(settledKey)) return settled.get(settledKey) ?? undefined;
    if (!probing.has(settledKey)) lookFor(settledKey, start, place, detail);
    return undefined;
  };
  const source: EarthMapSource = {
    kind: "tiles",
    layer: "day",
    info: layer.credit ? { ...INFO, credit: { en: `${GIBS_CREDIT.en} ${layer.credit.en}`, ja: `${GIBS_CREDIT.ja}${layer.credit.ja}` } } : INFO,
    holes: true,
    // the loader draws the tile with these on the graphics card: clear where it is dark, and each colour multiplied (nothing is done to the pixels on the processor)
    look: { clear: layer.clear ?? [NODATA_BELOW, NODATA_FULL], ...(layer.gain ? { gain: layer.gain } : {}) },
    grid,
    need(place, detail) {
      if (gridLevelFor(grid, detail, 0) === undefined) return [];
      const day = dayOf(place, detail);
      if (day === undefined) return [];
      return gridKeys(grid, place, detail, `${day}/`);
    },
    levels() {
      return { tileSize: grid.tileSize, levels: grid.levels.map((level) => ({ level: level.level, width: level.width })) };
    },
    load: (key, signal) => fetchTile(key, signal),
    bytes: (tile) => Math.ceil(tile.width * tile.height * 4 * (4 / 3)),
  };
  return source;
}

/**
 * The finer source an element makes from its attributes, the same object while the attributes are unchanged, or `undefined` when finer tiles are off or the view is limited to the package's own data.
 *
 * @param time - The moment the element is showing.
 * @param changed - Called when the source has found the day it will read, so the element draws again.
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
export function createFinerHolder(time: () => Date, changed?: () => void): { source(read: (name: string) => string | null, ownOnly: boolean): EarthMapSource | undefined } {
  let key = "";
  let held: EarthMapSource | undefined;
  return {
    source(read, ownOnly) {
      if (ownOnly || read("tiles-finer") !== "gibs") return undefined;
      const next = `${read("tiles-finer-layer") ?? ""}\n${read("tiles-finer-date") ?? ""}\n${read("tiles-finer-timeout") ?? ""}`;
      if (held && key === next) return held;
      key = next;
      const layer = read("tiles-finer-layer");
      const date = read("tiles-finer-date");
      const slow = Number(read("tiles-finer-timeout"));
      held = gibsTiles({ time, ...(changed ? { changed } : {}), ...(slow > 0 ? { slowMs: slow } : {}), ...(layer ? { layer } : {}), ...(date ? { date } : {}) });
      return held;
    },
  };
}
