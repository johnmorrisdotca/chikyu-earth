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

/**
 * The day the daily layers' days in `GIBS_LAYERS` were read, from the capabilities documents (the tiles' WMTS and the snapshots' WMS list the same days).
 *
 * To refresh the table: fetch `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml`, and for each daily layer copy the `<Value>` ranges of its `Time` dimension
 * (`start/end/P1D`) into `ranges`, oldest first. Mark a layer `ended` when its last day stays behind the others' (the satellite has stopped, or its processing has), and take the mark off if it starts again. Then change this date.
 */
export const GIBS_DAYS_READ = "2026-11-17";

/** A day the layer has imagery, inclusive, as the capabilities document listed it on `GIBS_DAYS_READ`. Dates sort as text. */
interface DayRange {
  start: string;
  end: string;
}

/** One layer of NASA's service, as the package uses it. */
interface GibsLayer {
  id: string;
  matrix: "31.25m" | "250m" | "500m";
  /** The days it has, oldest first. Empty for a picture that has no day (the shaded relief, and the annual Landsat mosaics, which have `years`). */
  ranges: readonly DayRange[];
  /**
   * True when the layer has stopped: no day after its last listed one is asked for. A layer still running is taken to go on to the present day after its last listed one, because the list is of the day it was read and
   * the satellite goes on sending.
   */
  ended?: boolean;
  /** The satellite and instrument, for the credit line when this layer stands in for another (see `gibsPick`). */
  name?: string;
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

/** A daily true-colour layer on the 250 m matrix, with the clouds left in. */
const daily = (id: string, name: string, ranges: readonly (readonly [string, string])[], ended = false): GibsLayer => ({
  id,
  name,
  matrix: "250m",
  clouds: true,
  ranges: ranges.map(([start, end]) => ({ start, end })),
  ...(ended ? { ended: true } : {}),
});

/**
 * The layers a page may ask for, and the one table of the days each daily layer has (read on `GIBS_DAYS_READ`; how to refresh it is there). A day outside a layer's days is not requested from it.
 * The daily layers are true colour with the clouds left in. Suomi NPP VIIRS has ended: its last day is 2026-11-02, and a later day is a black picture. The shaded relief is the same kind of picture as the package's own level 5, and is only a stand-in.
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
  VIIRS_NOAA20_CorrectedReflectance_TrueColor: daily("VIIRS_NOAA20_CorrectedReflectance_TrueColor", "NOAA-20 VIIRS", [
    ["2018-01-05", "2018-02-21"],
    ["2018-02-24", "2018-03-12"],
    ["2018-03-14", "2019-12-31"],
    ["2020-01-02", "2022-01-12"],
    ["2022-01-14", "2026-11-16"],
  ]),
  VIIRS_NOAA21_CorrectedReflectance_TrueColor: daily("VIIRS_NOAA21_CorrectedReflectance_TrueColor", "NOAA-21 VIIRS", [
    ["2023-02-10", "2023-02-23"],
    ["2023-02-25", "2023-03-09"],
    ["2023-03-11", "2024-02-26"],
    ["2024-02-29", "2026-11-16"],
  ]),
  VIIRS_SNPP_CorrectedReflectance_TrueColor: daily(
    "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    "Suomi NPP VIIRS",
    [
      ["2015-11-24", "2022-07-27"],
      ["2022-08-10", "2024-05-31"],
      ["2024-06-04", "2024-07-11"],
      ["2024-07-16", "2024-07-24"],
      ["2024-07-29", "2024-11-03"],
      ["2024-11-06", "2026-04-28"],
      ["2026-04-30", "2026-07-10"],
      ["2026-07-16", "2026-11-02"],
    ],
    true,
  ),
  MODIS_Terra_CorrectedReflectance_TrueColor: daily("MODIS_Terra_CorrectedReflectance_TrueColor", "MODIS Terra", [
    ["2000-02-24", "2000-04-25"],
    ["2000-04-28", "2000-08-06"],
    ["2000-08-18", "2001-06-15"],
    ["2001-07-03", "2002-03-19"],
    ["2002-03-28", "2003-12-16"],
    ["2003-12-24", "2008-12-20"],
    ["2008-12-23", "2016-02-18"],
    ["2016-02-27", "2022-10-10"],
    ["2022-10-23", "2026-11-17"],
  ]),
  MODIS_Aqua_CorrectedReflectance_TrueColor: daily("MODIS_Aqua_CorrectedReflectance_TrueColor", "MODIS Aqua", [
    ["2002-07-03", "2002-07-30"],
    ["2002-08-07", "2002-09-12"],
    ["2002-09-14", "2022-03-31"],
    ["2022-04-17", "2026-11-16"],
  ]),
  BlueMarble_ShadedRelief_Bathymetry: { id: "BlueMarble_ShadedRelief_Bathymetry", matrix: "500m", clouds: false, ranges: [] },
};

/**
 * The daily true-colour layers in the order one stands in for another: when the layer a page asked for has no picture for a day (it has ended, it had not started, or the day is in a gap of its list), the first of these that has the day is used.
 * NOAA-20 VIIRS, NOAA-21 VIIRS, Suomi NPP VIIRS (VIIRS is finer and newer than MODIS), then MODIS Terra and MODIS Aqua.
 */
export const GIBS_DAILY_ORDER: readonly string[] = [
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
  "VIIRS_SNPP_CorrectedReflectance_TrueColor",
  "MODIS_Terra_CorrectedReflectance_TrueColor",
  "MODIS_Aqua_CorrectedReflectance_TrueColor",
];

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
 * Whether the layer may have imagery for a day: inside one of its listed ranges, or, for a layer still running (not `ended`), after the last of them and no later than `today` (the list is of the day it was read, and the layer goes on growing).
 * A day before the layer's first day, in a gap the list shows, after the last day of a layer that has ended, or after `today`, has none, and is not asked for.
 *
 * @param today - The present UTC day, `yyyy-mm-dd`. Left out, a running layer has every day after its last listed one.
 */
export function gibsHasDay(layer: GibsLayer, day: string, today?: string): boolean {
  if (layer.ranges.length === 0) return true;
  const first = layer.ranges[0]!;
  const last = layer.ranges[layer.ranges.length - 1]!;
  if (day < first.start) return false;
  if (day > last.end) return !layer.ended && (today === undefined || day <= today);
  return layer.ranges.some((range) => day >= range.start && day <= range.end);
}

/** The day before `day`. */
const dayBefore = (day: string): string => previousUtcDay(Date.parse(`${day}T12:00:00Z`));

/** Why `gibsPick` chose what it did: the layer asked for has the day, another layer stands in for it, or no layer has the day and the newest day there is is shown instead. */
type GibsPickWhy = "asked" | "layer" | "newest";

/** The layer and the day the tiles are read from, for a layer asked for and a day wanted. */
interface GibsPick {
  layer: GibsLayer;
  day: string;
  /** The day that was wanted. */
  wanted: string;
  why: GibsPickWhy;
}

const isDaily = (layer: GibsLayer): boolean => GIBS_DAILY_ORDER.includes(layer.id);

/** The newest day each daily layer surely has by `today`: the day before it for a layer still running (that day's passes are in), the last listed one for a layer that has ended. The newest of them, from the first layer in `GIBS_DAILY_ORDER` that has it. */
export function gibsNewest(today: string): { layer: GibsLayer; day: string } | undefined {
  let best: { layer: GibsLayer; day: string } | undefined;
  const yesterday = dayBefore(today);
  for (const id of GIBS_DAILY_ORDER) {
    const layer = GIBS_LAYERS[id]!;
    const day = layer.ended ? layer.ranges[layer.ranges.length - 1]!.end : yesterday;
    if (!gibsHasDay(layer, day, today)) continue;
    if (best === undefined || day > best.day) best = { layer, day };
  }
  return best;
}

/**
 * The layer and day to read for a day wanted. The layer asked for when it has the day. Else, for a daily true-colour layer, the first of `GIBS_DAILY_ORDER` that has it (Suomi NPP has ended on 2026-11-02, so a later day is NOAA-20's).
 * Else, when the day is after the newest day any of them has (a day still to come), that newest day, from the layer asked for if it has it. A day no layer has that is not after all of them (before 2000-02-24, when MODIS Terra began) gives `undefined`: nothing is requested.
 *
 * @param today - The present UTC day, `yyyy-mm-dd`: no layer has a day after it.
 */
export function gibsPick(asked: GibsLayer, day: string, today: string): GibsPick | undefined {
  if (gibsHasDay(asked, day, today)) return { layer: asked, day, wanted: day, why: "asked" };
  if (!isDaily(asked)) return undefined;
  for (const id of GIBS_DAILY_ORDER) {
    const other = GIBS_LAYERS[id]!;
    if (other !== asked && gibsHasDay(other, day, today)) return { layer: other, day, wanted: day, why: "layer" };
  }
  const newest = gibsNewest(today);
  if (!newest || day <= newest.day) return undefined;
  // the layer asked for, when it has that newest day too
  return { layer: gibsHasDay(asked, newest.day, today) ? asked : newest.layer, day: newest.day, wanted: day, why: "newest" };
}

/** The days the default rule tries, newest first, each with the layer it is read from: from `start` (or, when `start` is after every layer, from the newest day there is), back, `GIBS_LOOKBACK_DAYS` days, skipping a day no layer has. */
export function gibsPickCandidates(asked: GibsLayer, start: string, today: string): GibsPick[] {
  const first = gibsPick(asked, start, today);
  const from = first?.why === "newest" ? first.day : start;
  const found: GibsPick[] = [];
  let day = from;
  for (let count = 0; count < GIBS_LOOKBACK_DAYS; count += 1) {
    const pick = gibsPick(asked, day, today);
    if (pick && pick.why !== "newest") found.push(first?.why === "newest" ? { ...pick, wanted: start, why: "newest" } : pick);
    day = dayBefore(day);
  }
  return found;
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

/** The days the default rule has settled, by layer and starting day: the day with imagery and the layer it is read from, or `null` for none. Kept for the session, so a view that moves asks nothing again. */
const settled = new Map<string, GibsPick | null>();
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
  /** The present moment, which no layer has a picture after (`Date.now` when left out; not the moment on show, which may be one still to come). */
  now?: () => number;
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

/** The sentence the credit line adds when the picture is not the one asked for: another layer stands in for a day, or the newest day there is stands in for one still to come. */
function pickNote(asked: GibsLayer, pick: GibsPick): { en: string; ja: string } | undefined {
  const name = pick.layer.name ?? pick.layer.id;
  if (pick.why === "layer") {
    const was = asked.name ?? asked.id;
    return { en: `Shown: ${name}, ${pick.day} (${was} has no picture for that day).`, ja: `表示中：${name}、${pick.day}（${was}にはこの日の画像がありません）。` };
  }
  if (pick.why === "newest") return { en: `Shown: ${name}, ${pick.day}, the newest day with a picture (there is none yet for ${pick.wanted}).`, ja: `表示中：${name}、${pick.day}。画像のある最新の日です（${pick.wanted}の画像はまだありません）。` };
  return undefined;
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
  const today = (): string => utcDay(options.now ? options.now() : Date.now());
  /** The layer a key's day is read from: the one asked for, or the daily layer that stands in for it on that day (`gibsPick`). */
  const layerOf = (day: string): GibsLayer => (known && isDaily(layer) ? (gibsPick(layer, day, today())?.layer ?? layer) : layer);
  /** The pick the tiles in view were last named from, for the credit line. */
  let shown: GibsPick | undefined;
  /** One tile of one day, as `load` reads it: nothing for a 404, a blank picture, a slow answer or a failure. */
  const fetchTile = async (key: string, signal: AbortSignal): Promise<ImageTile> => {
    const parts = tileKeyParts(key);
    const day = key.split("/")[0];
    const level = parts ? grid.levels.find((one) => one.level === parts.level) : undefined;
    if (!parts || !day || !level) throw new RangeError(`"${key}" is not the key of a tile`);
    if (!gridOnEarth(level, parts.col, parts.row, grid.extent)) throw new RangeError(`"${key}" is off the Earth`);
    const from = layerOf(day);
    const url = `${TILE_URL}/${from.id}/default/${day}/${from.matrix}/${parts.level}/${parts.row}/${parts.col}.jpg`;
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
      let found: GibsPick | null = null;
      for (const pick of gibsPickCandidates(layer, start, today())) {
        const keys = gridKeys(grid, place, detail, `${pick.day}/`);
        if (keys.length === 0) break;
        try {
          const tile = await fetchTile(keys[0]!, new AbortController().signal);
          tile.image.close?.();
          found = pick;
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
  const pickOf = (place: EarthMapPlace, detail: number): GibsPick | undefined => {
    if (!known) return undefined;
    const ms = options.time().getTime();
    if (layer.years || layer.ranges.length === 0) {
      const day = gibsDay(layer, rule, ms);
      return day === undefined ? undefined : { layer, day, wanted: day, why: "asked" };
    }
    const fixed = fixedDay(rule, ms);
    const now = today();
    if (fixed !== undefined) return gibsPick(layer, fixed, now);
    const start = previousUtcDay(ms);
    const settledKey = `${layer.id}|${start}|${now}`;
    if (settled.has(settledKey)) return settled.get(settledKey) ?? undefined;
    if (!probing.has(settledKey)) lookFor(settledKey, start, place, detail);
    return undefined;
  };
  const baseInfo: SourceInfo = layer.credit ? { ...INFO, credit: { en: `${GIBS_CREDIT.en} ${layer.credit.en}`, ja: `${GIBS_CREDIT.ja}${layer.credit.ja}` } } : INFO;
  let noted: { key: string; info: SourceInfo } = { key: "", info: baseInfo };
  /** The credit, with a sentence when another layer or the newest day stands in for the one asked for; the same object while that does not change. */
  const infoNow = (): SourceInfo => {
    const note = shown ? pickNote(layer, shown) : undefined;
    const key = note ? note.en : "";
    if (key !== noted.key) noted = { key, info: note ? { ...baseInfo, credit: { en: `${baseInfo.credit.en} ${note.en}`, ja: `${baseInfo.credit.ja}${note.ja}` } } : baseInfo };
    return noted.info;
  };
  const source: EarthMapSource = {
    kind: "tiles",
    layer: "day",
    get info() {
      return infoNow();
    },
    holes: true,
    // the loader draws the tile with these on the graphics card: clear where it is dark, and each colour multiplied (nothing is done to the pixels on the processor)
    look: { clear: layer.clear ?? [NODATA_BELOW, NODATA_FULL], ...(layer.gain ? { gain: layer.gain } : {}) },
    grid,
    need(place, detail) {
      if (gridLevelFor(grid, detail, 0) === undefined) return [];
      const pick = pickOf(place, detail);
      shown = pick;
      if (pick === undefined) return [];
      return gridKeys(grid, place, detail, `${pick.day}/`);
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
