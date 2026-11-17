// Real satellite pictures of the ground under a point: the address of a NASA GIBS (Worldview) snapshot of a box around it, the days to try when a day is missing, and the credit NASA asks for.
// Pure: nothing here fetches. The reader's browser asks NASA for the picture (no key, and the service answers any page). A page that never imports this does not pay for it.
import { GIBS_CREDIT, GIBS_LAYERS, gibsHasDay, previousUtcDay, utcDay } from "../door/gibs.ts";

/** The WMS address of NASA's imagery, in the plain latitude and longitude (EPSG:4326) grid. */
const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

/** Kilometres in a degree of latitude (the mean sphere, 6,371 km). */
const KM_PER_DEGREE = 111.195;

/**
 * The smallest side of a box, in kilometres: a `sizeKm` below it is held at it.
 *
 * @example
 * ```ts
 * import { PHOTO_MIN_KM } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * console.log(PHOTO_MIN_KM);
 * ```
 */
export const PHOTO_MIN_KM = 1;

/**
 * The largest side of a box, in kilometres: a `sizeKm` above it is held at it.
 *
 * @example
 * ```ts
 * import { PHOTO_MAX_KM } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * console.log(PHOTO_MAX_KM);
 * ```
 */
export const PHOTO_MAX_KM = 4000;

/**
 * The width in pixels a picture has when a page does not say.
 *
 * @example
 * ```ts
 * import { PHOTO_DEFAULT_PX } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * console.log(PHOTO_DEFAULT_PX);
 * ```
 */
export const PHOTO_DEFAULT_PX = 512;

/**
 * The most pixels a picture may have across (and up): a larger `widthPx` is held at it.
 *
 * @example
 * ```ts
 * import { PHOTO_MAX_PX } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * console.log(PHOTO_MAX_PX);
 * ```
 */
export const PHOTO_MAX_PX = 2048;

/**
 * How many days, counting the first, `photoFallbacks` goes back by default.
 *
 * @example
 * ```ts
 * import { PHOTO_FALLBACK_DAYS } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * console.log(PHOTO_FALLBACK_DAYS);
 * ```
 */
export const PHOTO_FALLBACK_DAYS = 3;

/**
 * The daily true-colour layers, best first, about 250 m a pixel with the clouds left in: NOAA-20 VIIRS (from 2018-01-05), Suomi NPP VIIRS (2015-11-24 to 2026-11-02, then it ends) and MODIS Terra (from 2000-02-24).
 * The first with a day is used, so a day one of them skipped is taken from the next. Their days are the one table in `door/gibs.ts` (`GIBS_LAYERS`, read on `GIBS_DAYS_READ`), which the finer map tiles use too.
 */
const LAYERS = ["VIIRS_NOAA20_CorrectedReflectance_TrueColor", "VIIRS_SNPP_CorrectedReflectance_TrueColor", "MODIS_Terra_CorrectedReflectance_TrueColor"].map((id) => GIBS_LAYERS[id]!);

/**
 * What to ask for: a point, the side of the box in kilometres, and the day.
 *
 * @example
 * ```ts
 * import type { PhotoOptions } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * const tokyo: PhotoOptions = { lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10" };
 * console.log(tokyo.sizeKm);
 * ```
 */
export interface PhotoOptions {
  /** Degrees north (-90 to 90; a value outside is held at the pole). */
  lat: number;
  /** Degrees east (any number; it is wrapped into -180 to 180). */
  lon: number;
  /** The side of the box on the ground, in kilometres (held between `PHOTO_MIN_KM` and `PHOTO_MAX_KM`). */
  sizeKm: number;
  /** The UTC day as `yyyy-mm-dd`, or a Date or milliseconds since the epoch (its UTC day). */
  date: string | number | Date;
  /** The picture's width and height in pixels (a square). 512 when left out, and never more than `PHOTO_MAX_PX`. */
  widthPx?: number;
}

/**
 * A box in degrees. `west` may be below -180 or `east` above 180 when the box crosses the date line (`wraps`).
 *
 * @example
 * ```ts
 * import type { PhotoBox } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * const box: PhotoBox = { south: 34, north: 36, west: 138, east: 141, wraps: false };
 * console.log(box.east - box.west);
 * ```
 */
export interface PhotoBox {
  south: number;
  north: number;
  west: number;
  east: number;
  wraps: boolean;
}

/**
 * One request for a picture: its box (inside -180 to 180), its address, and where it goes in the whole picture. A box that crosses the date line is two of these, side by side.
 *
 * @example
 * ```ts
 * import type { PhotoPiece } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * const place = (piece: PhotoPiece): string => `${piece.offsetPx},${piece.widthPx}`;
 * console.log(typeof place);
 * ```
 */
export interface PhotoPiece {
  url: string;
  south: number;
  north: number;
  west: number;
  east: number;
  /** Pixels from the left of the whole picture. */
  offsetPx: number;
  widthPx: number;
  heightPx: number;
}

/**
 * One day to try: the day, the layer that has it, the one address of `photoUrl`, and the pieces of the exact box.
 *
 * @example
 * ```ts
 * import type { PhotoShot } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * const label = (shot: PhotoShot): string => `${shot.date} ${shot.layer}`;
 * console.log(typeof label);
 * ```
 */
export interface PhotoShot {
  date: string;
  layer: string;
  url: string;
  pieces: PhotoPiece[];
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const trim = (value: number): string => String(Number(value.toFixed(5)));

/** The UTC day of a date option, or a RangeError when it is not one. */
function dayOf(date: string | number | Date): string {
  if (typeof date === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const check = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
    if (!match || !check || utcDay(check.getTime()) !== date) throw new RangeError(`date must be yyyy-mm-dd, a Date or milliseconds: ${date}`);
    return date;
  }
  const ms = date instanceof Date ? date.getTime() : date;
  if (!Number.isFinite(ms)) throw new RangeError("date must be yyyy-mm-dd, a Date or milliseconds");
  return utcDay(ms);
}

function readOptions(options: PhotoOptions): { lat: number; lon: number; sizeKm: number; day: string; widthPx: number } {
  const { lat, lon, sizeKm, widthPx } = options;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(sizeKm)) throw new RangeError("lat, lon and sizeKm must be finite numbers");
  const width = widthPx === undefined ? PHOTO_DEFAULT_PX : widthPx;
  if (!Number.isFinite(width)) throw new RangeError("widthPx must be a finite number");
  return {
    lat: clamp(lat, -90, 90),
    lon: ((((lon + 180) % 360) + 360) % 360) - 180,
    sizeKm: clamp(sizeKm, PHOTO_MIN_KM, PHOTO_MAX_KM),
    day: dayOf(options.date),
    widthPx: clamp(Math.round(width), 1, PHOTO_MAX_PX),
  };
}

/**
 * The box a picture of `sizeKm` around a point covers, in degrees. The height is `sizeKm` of latitude; the width is as many degrees of longitude as make `sizeKm` at the box's middle latitude, so the picture is square on the ground.
 * At a pole the box is moved down so it stays on the Earth (the point is then at its edge) and its width in longitude grows to about 115 degrees. Across the date line `west` is below -180 or `east` above 180 and `wraps` is true.
 *
 * @param options - The point and the size; the date and the width are not read.
 * @returns The box.
 *
 * @example
 * ```ts
 * import { photoBox } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * const fiji = photoBox({ lat: -17.7, lon: 179.9, sizeKm: 200, date: "2026-11-10" });
 * console.log(fiji.wraps, fiji.east > 180);
 * ```
 */
export function photoBox(options: PhotoOptions): PhotoBox {
  const { lat, lon, sizeKm } = readOptions(options);
  const height = sizeKm / KM_PER_DEGREE;
  const south = clamp(lat - height / 2, -90, 90 - height);
  const north = south + height;
  const cosine = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const span = Math.min(360, height / Math.max(cosine, 1e-9));
  const west = lon - span / 2;
  const east = lon + span / 2;
  return { south, north, west, east, wraps: west < -180 || east > 180 };
}

/**
 * The id of the layer `photoUrl` uses for a day: the first of NOAA-20 VIIRS, Suomi NPP VIIRS and MODIS Terra (all true colour) whose days include it, or null before 2000-02-24.
 *
 * @param day - The UTC day, `yyyy-mm-dd`.
 * @returns The layer id, or null.
 *
 * @example
 * ```ts
 * import { photoLayer } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * console.log(photoLayer("2026-11-10"), photoLayer("2010-06-01"), photoLayer("1999-01-01"));
 * ```
 */
export function photoLayer(day: string): string | null {
  return LAYERS.find((layer) => gibsHasDay(layer, day))?.id ?? null;
}

function requestFor(layer: string, west: number, south: number, east: number, north: number, widthPx: number, heightPx: number, day: string): string {
  return `${WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${layer}&STYLES=&FORMAT=image%2Fjpeg&SRS=EPSG%3A4326&BBOX=${trim(west)},${trim(south)},${trim(east)},${trim(north)}&WIDTH=${widthPx}&HEIGHT=${heightPx}&TIME=${day}`;
}

function piecesFor(box: PhotoBox, layer: string, day: string, widthPx: number): PhotoPiece[] {
  const piece = (west: number, east: number, offsetPx: number, width: number): PhotoPiece => ({
    url: requestFor(layer, west, box.south, east, box.north, width, widthPx, day),
    south: box.south,
    north: box.north,
    west,
    east,
    offsetPx,
    widthPx: width,
    heightPx: widthPx,
  });
  if (!box.wraps) return [piece(box.west, box.east, 0, widthPx)];
  const span = box.east - box.west;
  const crossesEast = box.east > 180;
  const firstSpan = crossesEast ? 180 - box.west : -180 - box.west;
  const left = clamp(Math.round((widthPx * firstSpan) / span), 1, widthPx - 1);
  if (crossesEast) return [piece(box.west, 180, 0, left), piece(-180, box.east - 360, left, widthPx - left)];
  return [piece(box.west + 360, 180, 0, left), piece(-180, box.east, left, widthPx - left)];
}

/**
 * The address of a NASA GIBS snapshot (a WMS GetMap request, EPSG:4326, JPEG) of the box around a point on a day, from the best true-colour layer that has the day (`photoLayer`: NOAA-20 VIIRS from 2018, then Suomi NPP VIIRS and MODIS Terra back to 2000-02-24). About 250 m a pixel, clouds left in.
 * The picture is one request, so a box that would cross the date line or run off a pole is moved to stay inside the world: the point is then not in the middle. `photoPieces` gives the exact box in two requests.
 *
 * @param options - The point, the size of the box and the day.
 * @returns The address, or null when no layer has a picture for the day (before 2000-02-24).
 * @throws RangeError when a number is not finite or the date is not a day.
 *
 * @example
 * ```ts
 * import { photoUrl } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * const url = photoUrl({ lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10", widthPx: 512 });
 * console.log(url?.includes("TIME=2026-11-10"));
 * ```
 */
export function photoUrl(options: PhotoOptions): string | null {
  const { widthPx, day } = readOptions(options);
  const layer = photoLayer(day);
  if (layer === null) return null;
  const box = photoBox(options);
  const shift = box.west < -180 ? -180 - box.west : box.east > 180 ? 180 - box.east : 0;
  return requestFor(layer, box.west + shift, box.south, box.east + shift, box.north, widthPx, widthPx, day);
}

/**
 * The exact box of a point as one or two requests, left to right: two when it crosses the date line, so a page can lay them side by side and the point stays in the middle.
 *
 * @param options - The point, the size of the box and the day.
 * @returns The pieces, or an empty list when no layer has a picture for the day.
 * @throws RangeError when a number is not finite or the date is not a day.
 *
 * @example
 * ```ts
 * import { photoPieces } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * const pieces = photoPieces({ lat: -17.7, lon: 179.9, sizeKm: 200, date: "2026-11-10" });
 * console.log(pieces.length, pieces.map((piece) => piece.widthPx));
 * ```
 */
export function photoPieces(options: PhotoOptions): PhotoPiece[] {
  const { widthPx, day } = readOptions(options);
  const layer = photoLayer(day);
  return layer === null ? [] : piecesFor(photoBox(options), layer, day, widthPx);
}

/**
 * The days to try, newest first: the day asked for, then each day before it, up to `days` of them, skipping a day no layer has. NASA has no picture for a day whose satellite passes it has not yet processed (and answers with a black one, not an error), so a page tries the next of these when one is blank.
 *
 * @param options - The point, the size of the box and the first day.
 * @param days - How many days to count back, the first included (3 by default).
 * @returns The shots, each with its day, layer, one address and pieces.
 * @throws RangeError when a number is not finite or the date is not a day.
 *
 * @example
 * ```ts
 * import { photoFallbacks } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * const shots = photoFallbacks({ lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10" }, 3);
 * console.log(shots.map((shot) => shot.date));
 * ```
 */
export function photoFallbacks(options: PhotoOptions, days: number = PHOTO_FALLBACK_DAYS): PhotoShot[] {
  const { widthPx, day } = readOptions(options);
  const shots: PhotoShot[] = [];
  let at = day;
  const count = clamp(Math.floor(Number.isFinite(days) ? days : PHOTO_FALLBACK_DAYS), 1, 30);
  for (let i = 0; i < count; i += 1) {
    const layer = photoLayer(at);
    if (layer !== null) {
      const dated = { ...options, date: at, widthPx };
      shots.push({ date: at, layer, url: photoUrl(dated)!, pieces: piecesFor(photoBox(dated), layer, at, widthPx) });
    }
    at = previousUtcDay(Date.parse(`${at}T12:00:00Z`));
  }
  return shots;
}

/**
 * The credit line to show with a picture, in English or Japanese. `full` gives NASA's own acknowledgement sentence for GIBS (the Japanese is this package's translation: NASA publishes none) instead of the short line.
 * The short line names NASA as the source, as NASA asks, and says it is not an endorsement.
 *
 * @param lang - `en` or `ja`.
 * @param full - True for the whole acknowledgement sentence.
 * @returns The line.
 *
 * @example
 * ```ts
 * import { photoCredit } from "@johnmorrisdotca/chikyu-earth/photos";
 *
 * console.log(photoCredit("en"));
 * console.log(photoCredit("ja", true).length > photoCredit("ja").length);
 * ```
 */
export function photoCredit(lang: "en" | "ja", full = false): string {
  if (full) return GIBS_CREDIT[lang];
  return lang === "ja" ? "画像：NASA GIBS／Worldview（NASA）。NASAが承認したものではありません。" : "Imagery: NASA GIBS / Worldview (NASA). Not endorsed by NASA.";
}
