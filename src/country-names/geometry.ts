// Which countries are named on the Earth, and where: each at the middle of the part of it the view shows, the largest on the screen first, sized by that part, never over another name or a box
// taken, and kept inside the Earth's disc. Pure: the outlines are turned once into points spread over each country's land, and each draw only finds where those points fall.
import type { CityFrame } from "../cities/geometry.ts";

const RAD = Math.PI / 180;

/**
 * One country outline the names are made from: a GeoJSON feature in longitude and latitude (a `Polygon` or `MultiPolygon`) with its code and its English and Japanese names, as chizu's
 * `world-geo` has them. A feature with no name is passed over.
 *
 * @example
 * ```ts
 * import type { NamedShape } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const square: NamedShape = { properties: { code: "A", name: "Square", nameJa: "四角" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } };
 * console.log(square.properties?.name);
 * ```
 */
export interface NamedShape {
  properties?: { code?: string | null; name?: string | null; nameJa?: string | null } | null;
  geometry: { type: string; coordinates: unknown } | null;
}

/**
 * The countries ready to be named: for each, its code and names, and points spread evenly over its land (longitude, latitude, the area each stands for in square degrees of the sphere, and which
 * of the country's polygons it is in), with the cap of the sphere they all lie in.
 *
 * @example
 * ```ts
 * import { countrySpots, type CountrySpots } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const spots: CountrySpots = countrySpots({ features: [] });
 * console.log(spots.countries.length);
 * ```
 */
export interface CountrySpots {
  countries: {
    code: string;
    name: { en: string; ja?: string };
    /** lon, lat, area, polygon for each point. */
    points: Float32Array;
    /** The middle of the points on the sphere, and how far from it (degrees) the farthest one is. */
    cap: { lon: number; lat: number; reach: number };
  }[];
}

/**
 * A country named at one draw: its code, the text, where the middle of the part in view falls, the box the text goes in (top left corner and size) and the text's size in pixels.
 *
 * @example
 * ```ts
 * import type { CountryName } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const say = (one: CountryName): string => `${one.text} at ${one.left}, ${one.top}`;
 * console.log(typeof say);
 * ```
 */
export interface CountryName {
  code: string;
  text: string;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
  size: number;
}

/**
 * Where the Earth is on the screen at one draw: the frame the city names use, and the Earth's disc (its middle and radius in CSS pixels), which no name may leave.
 *
 * @example
 * ```ts
 * import type { CountryFrame } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const frame: CountryFrame = { width: 400, height: 400, radius: 150, disc: { x: 200, y: 200, radius: 150 }, project: (lon, lat, out) => { out.x = 200 + lon; out.y = 200 - lat; return 1; } };
 * console.log(frame.disc?.radius);
 * ```
 */
export interface CountryFrame extends CityFrame {
  disc?: { x: number; y: number; radius: number };
}

/**
 * What the names are laid out with: the most names, the smallest and largest text in pixels, the boxes other names use, and the width and height of a text as the browser draws it.
 *
 * @example
 * ```ts
 * import type { CountryLayoutOptions } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const options: CountryLayoutOptions = { max: 40, smallest: 10, largest: 16 };
 * console.log(options.max);
 * ```
 */
export interface CountryLayoutOptions {
  max: number;
  smallest: number;
  largest: number;
  /** Boxes other names already use (cities, places, the bodies' names): no country name is put over one. */
  taken?: readonly { left: number; top: number; width: number; height: number }[];
  /**
   * The width and height of a text at a size, as the browser draws it in the names' own font (a canvas's `measureText`). The estimate from the length is a floor and the larger is used, so a
   * fallback font with wider letters or taller lines is measured as it is. Left out, the estimate alone is used, as in Node.
   */
  measure?: (text: string, size: number) => { width: number; height: number };
}

/** How many of a country's points, the nearest to the middle of the part in view first, its name is tried at. */
const SPOTS_TRIED = 6;
/** Points that face the viewer less squarely than this are too foreshortened to count. */
const FACING = 0.2;
/** About this many points are spread over each country, more for none and at least one for each polygon. */
const POINTS_EACH = 48;
/**
 * The space between the letters of a country's name, as a share of the text's size (the style sheet's `letter-spacing` in `em`).
 *
 * @example
 * ```ts
 * import { COUNTRY_LETTER_SPACING } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(COUNTRY_LETTER_SPACING * 12);
 * ```
 */
export const COUNTRY_LETTER_SPACING = 0.06;

const ringsOf = (geometry: NamedShape["geometry"]): number[][][][] => {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates as number[][][]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as number[][][][];
  return [];
};

const inside = (rings: readonly number[][][], lon: number, lat: number): boolean => {
  let odd = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) odd = !odd;
    }
  }
  return odd;
};

/**
 * Spreads points over each named country's land, about 48 to a country on an even grid of longitude and latitude, so that a view can find the middle of the part of it in sight and how large
 * that part is. A polygon too small for the grid gets one point, at the middle of its outline. Made once, when the outlines arrive.
 *
 * @param shapes - The outlines, as chizu's `world-geo` has them.
 * @returns The countries and their points.
 *
 * @example
 * ```ts
 * import { countrySpots } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const square = { properties: { code: "A", name: "Square" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } };
 * const spots = countrySpots({ features: [square] });
 * console.log(spots.countries[0]?.points.length! / 4);
 * ```
 */
export function countrySpots(shapes: { features: readonly NamedShape[] }): CountrySpots {
  const countries: CountrySpots["countries"] = [];
  for (const feature of shapes.features) {
    const name = feature.properties?.name;
    if (!name) continue;
    const polygons = ringsOf(feature.geometry).filter((rings) => rings.length > 0 && rings[0]!.length >= 4);
    if (polygons.length === 0) continue;
    const boxes = polygons.map((rings) => {
      let west = 180;
      let east = -180;
      let south = 90;
      let north = -90;
      for (const point of rings[0]!) {
        west = Math.min(west, point[0]!);
        east = Math.max(east, point[0]!);
        south = Math.min(south, point[1]!);
        north = Math.max(north, point[1]!);
      }
      return { west, east, south, north };
    });
    // the grid's step: the country's outline boxes, on the plane of longitude and latitude, shared among about POINTS_EACH points
    const plane = boxes.reduce((sum, box) => sum + (box.east - box.west) * (box.north - box.south), 0);
    const step = Math.min(8, Math.max(0.1, Math.sqrt(plane / POINTS_EACH)));
    const out: number[] = [];
    polygons.forEach((rings, polygon) => {
      const box = boxes[polygon]!;
      const before = out.length;
      for (let lat = box.south + step / 2; lat < box.north; lat += step) {
        for (let lon = box.west + step / 2; lon < box.east; lon += step) {
          if (inside(rings, lon, lat)) out.push(lon, lat, Math.cos(lat * RAD) * step * step, polygon);
        }
      }
      if (out.length === before) {
        // too small for the grid: one point at the middle of its outline, standing for the box's area at most
        const ring = rings[0]!;
        let lon = 0;
        let lat = 0;
        for (const point of ring) {
          lon += point[0]!;
          lat += point[1]!;
        }
        lon /= ring.length;
        lat /= ring.length;
        out.push(lon, lat, Math.cos(lat * RAD) * Math.max(0.0001, (box.east - box.west) * (box.north - box.south)) * 0.5, polygon);
      }
    });
    // the cap: the middle of the points on the sphere, and the farthest point from it
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < out.length; i += 4) {
      const phi = out[i + 1]! * RAD;
      const lambda = out[i]! * RAD;
      x += Math.cos(phi) * Math.sin(lambda);
      y += Math.sin(phi);
      z += Math.cos(phi) * Math.cos(lambda);
    }
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;
    let reach = 0;
    for (let i = 0; i < out.length; i += 4) {
      const phi = out[i + 1]! * RAD;
      const lambda = out[i]! * RAD;
      const dot = x * Math.cos(phi) * Math.sin(lambda) + y * Math.sin(phi) + z * Math.cos(phi) * Math.cos(lambda);
      reach = Math.max(reach, Math.acos(Math.max(-1, Math.min(1, dot))) / RAD);
    }
    const ja = feature.properties?.nameJa;
    countries.push({
      code: feature.properties?.code ?? name,
      name: ja ? { en: name, ja } : { en: name },
      points: new Float32Array(out),
      cap: { lon: Math.atan2(x, z) / RAD, lat: Math.asin(Math.max(-1, Math.min(1, y))) / RAD, reach: reach + step },
    });
  }
  return { countries };
}

/**
 * The name to write for a country: its Japanese name on a page in Japanese where there is one, else its English name in capitals.
 *
 * @param country - The country's names.
 * @param lang - The page's language, `en` or `ja`.
 * @returns The text.
 *
 * @example
 * ```ts
 * import { countryNameText } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const japan = { name: { en: "Japan", ja: "日本" } };
 * console.log(countryNameText(japan, "en"), countryNameText(japan, "ja"));
 * ```
 */
export function countryNameText(country: { name: { en: string; ja?: string } }, lang: "en" | "ja"): string {
  return lang === "ja" && country.name.ja ? country.name.ja : country.name.en.toUpperCase();
}

/**
 * About how wide and tall a country's name is, in pixels, without reading any layout: a Japanese character as wide as the text is tall, a capital about 0.7 of it, with the letters' spacing.
 *
 * @param text - The name.
 * @param size - The text size in pixels.
 * @returns The width and height.
 *
 * @example
 * ```ts
 * import { countryNameBox } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(countryNameBox("JAPAN", 12), countryNameBox("日本", 12));
 * ```
 */
export function countryNameBox(text: string, size: number): { width: number; height: number } {
  let width = 0;
  for (const char of text) width += ((char.codePointAt(0) ?? 0) >= 0x2e80 ? size : size * 0.7) + size * COUNTRY_LETTER_SPACING;
  return { width: Math.ceil(width) + 4, height: Math.ceil(size * 1.3) };
}

const GAP = 2;

/**
 * Lays the names out for one draw. Each country in sight is named at the middle of the largest part of it the view shows (snapped to a point of its own land, so a crescent's name is not out at
 * sea), the largest on the screen first, its text sized by that part, only where the text fits within it, inside the Earth's disc, and free of the names already placed and of `taken`
 * (tried at the middle, a line above and below, then at the next points of its land out from the middle). A country on the far side, or too small for its name, is left out: fewer names when the Earth is small, more as it grows.
 *
 * @param spots - The countries' points (see {@link countrySpots}).
 * @param frame - Where the Earth is on the screen.
 * @param lang - The page's language, `en` or `ja`.
 * @param options - The most names, the text sizes, the boxes taken and how to measure.
 * @returns The names to show, the largest first.
 *
 * @example
 * ```ts
 * import { countrySpots, layoutCountryNames } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const square = { properties: { code: "A", name: "Square", nameJa: "四角" }, geometry: { type: "Polygon", coordinates: [[[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]]] } };
 * const frame = {
 *   width: 400, height: 400, radius: 180, disc: { x: 200, y: 200, radius: 180 },
 *   project: (lon: number, lat: number, out: { x: number; y: number }) => { out.x = 200 + lon * 3; out.y = 200 - lat * 3; return 1; },
 * };
 * console.log(layoutCountryNames(countrySpots({ features: [square] }), frame, "en", { max: 10, smallest: 10, largest: 16 }).map((one) => one.text));
 * ```
 */
export function layoutCountryNames(spots: CountrySpots, frame: CountryFrame, lang: "en" | "ja", options: CountryLayoutOptions): CountryName[] {
  const out = { x: 0, y: 0 };
  const margin = 2;
  const pixelsPerArea = (RAD * frame.radius) ** 2;
  const disc = frame.disc;
  interface Seen {
    code: string;
    text: string;
    /** The points of the country's land to name it at, the nearest to the middle of the part in view first. */
    spots: { x: number; y: number }[];
    area: number;
  }
  const seen: Seen[] = [];
  const sums = new Map<number, { w: number; x: number; y: number }>();
  const xs: number[] = [];
  const ys: number[] = [];
  const owners: number[] = [];
  for (const country of spots.countries) {
    // the whole cap on the far side: nothing of it in sight
    const middle = frame.project(country.cap.lon, country.cap.lat, out);
    if (Math.acos(Math.max(-1, Math.min(1, middle))) / RAD - country.cap.reach > 95) continue;
    sums.clear();
    xs.length = 0;
    ys.length = 0;
    owners.length = 0;
    const points = country.points;
    for (let i = 0; i < points.length; i += 4) {
      const facing = frame.project(points[i]!, points[i + 1]!, out);
      if (facing < FACING) continue;
      if (out.x < margin || out.y < margin || out.x > frame.width - margin || out.y > frame.height - margin) continue;
      if (disc && Math.hypot(out.x - disc.x, out.y - disc.y) > disc.radius) continue;
      const polygon = points[i + 3]!;
      const weight = points[i + 2]! * facing;
      const sum = sums.get(polygon);
      if (sum) {
        sum.w += weight;
        sum.x += out.x * weight;
        sum.y += out.y * weight;
      } else sums.set(polygon, { w: weight, x: out.x * weight, y: out.y * weight });
      xs.push(out.x);
      ys.push(out.y);
      owners.push(polygon);
    }
    let best = -1;
    let most = 0;
    for (const [polygon, sum] of sums) {
      if (sum.w > most) {
        most = sum.w;
        best = polygon;
      }
    }
    if (best < 0) continue;
    const sum = sums.get(best)!;
    const cx = sum.x / sum.w;
    const cy = sum.y / sum.w;
    // snapped to the points of that polygon's own land in view, the nearest to the middle first: the next ones are tried when another name is in the way
    const near: { x: number; y: number; d: number }[] = [];
    for (let k = 0; k < xs.length; k += 1) {
      if (owners[k] !== best) continue;
      near.push({ x: xs[k]!, y: ys[k]!, d: (xs[k]! - cx) ** 2 + (ys[k]! - cy) ** 2 });
    }
    near.sort((a, b) => a.d - b.d);
    seen.push({ code: country.code, text: countryNameText(country, lang), spots: near.slice(0, SPOTS_TRIED), area: most * pixelsPerArea });
  }
  seen.sort((a, b) => b.area - a.area);
  const placed: { l: number; t: number; r: number; b: number }[] = [];
  const blocked = (options.taken ?? []).map((box) => ({ l: box.left, t: box.top, r: box.left + box.width, b: box.top + box.height }));
  const free = (box: { l: number; t: number; r: number; b: number }): boolean => {
    for (const other of placed) if (box.l < other.r + GAP && box.r + GAP > other.l && box.t < other.b + GAP && box.b + GAP > other.t) return false;
    for (const other of blocked) if (box.l < other.r && box.r > other.l && box.t < other.b && box.b > other.t) return false;
    return true;
  };
  const inDisc = (box: { l: number; t: number; r: number; b: number }): boolean => {
    if (!disc) return true;
    const reach = disc.radius - 2;
    for (const [x, y] of [
      [box.l, box.t],
      [box.r, box.t],
      [box.l, box.b],
      [box.r, box.b],
    ] as const) {
      if (Math.hypot(x - disc.x, y - disc.y) > reach) return false;
    }
    return true;
  };
  const names: CountryName[] = [];
  for (const one of seen) {
    if (names.length >= options.max) break;
    const across = Math.sqrt(one.area);
    const size = Math.round(Math.min(options.largest, Math.max(options.smallest, options.smallest - 1 + across / 30)));
    const guess = countryNameBox(one.text, size);
    const measured = options.measure?.(one.text, size);
    const width = Math.max(guess.width, measured ? Math.ceil(measured.width) + 4 : 0);
    const height = Math.max(guess.height, measured ? Math.ceil(measured.height) : 0);
    // the name must fit the part of the country in view: a country much narrower than its name is left out
    if (across < width * 0.45) continue;
    tries: for (const spot of one.spots) {
      for (const shift of [0, -0.8, 0.8]) {
        const left = spot.x - width / 2;
        const top = spot.y - height / 2 + shift * height;
        const box = { l: left, t: top, r: left + width, b: top + height };
        if (box.l < 0 || box.t < 0 || box.r > frame.width || box.b > frame.height || !inDisc(box) || !free(box)) continue;
        placed.push(box);
        names.push({ code: one.code, text: one.text, x: spot.x, y: spot.y, left, top, width, height, size });
        break tries;
      }
    }
  }
  return names;
}

/**
 * The most names `country-names` may ask for at once.
 *
 * @example
 * ```ts
 * import { COUNTRY_NAMES_MAX } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(COUNTRY_NAMES_MAX);
 * ```
 */
export const COUNTRY_NAMES_MAX = 120;

/**
 * How many names a bare `country-names` asks for.
 *
 * @example
 * ```ts
 * import { COUNTRY_NAMES_DEFAULT } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(COUNTRY_NAMES_DEFAULT);
 * ```
 */
export const COUNTRY_NAMES_DEFAULT = 40;

/**
 * Reads the `country-names` attribute: absent (or `off`) is none, bare is 40 names at most, a number is that many at most (1 to 120).
 *
 * @param value - The attribute's value, or `null` when it is absent.
 * @returns How many names at most, or `null` for none.
 *
 * @example
 * ```ts
 * import { readCountryNames } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(readCountryNames(null), readCountryNames(""), readCountryNames("12"), readCountryNames("500"), readCountryNames("off"));
 * ```
 */
export function readCountryNames(value: string | null): number | null {
  if (value === null || value.trim().toLowerCase() === "off") return null;
  const count = Number(value.trim());
  if (value.trim() === "" || !Number.isFinite(count)) return COUNTRY_NAMES_DEFAULT;
  return Math.min(COUNTRY_NAMES_MAX, Math.max(1, Math.round(count)));
}

/**
 * The attributes the country names read: `country-names`.
 *
 * @example
 * ```ts
 * import { COUNTRY_NAMES_ATTRIBUTES } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(COUNTRY_NAMES_ATTRIBUTES.join(" "));
 * ```
 */
export const COUNTRY_NAMES_ATTRIBUTES = ["country-names"] as const;
