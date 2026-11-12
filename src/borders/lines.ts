// Borders on the land as lines on the sphere: the edges two shapes share (a country's border with its neighbour, a province's with the next), never a coast, which the pictures already show.
// Pure: longitude and latitude in, points on the unit sphere out (the axes of the Earth's own sphere: +z is longitude 0 on the equator, +x east, +y north).

const RAD = Math.PI / 180;

/**
 * One shape a border set is made of: a GeoJSON feature in longitude and latitude (degrees), a `Polygon` or `MultiPolygon`, with an optional `code` in its properties (a country's code, which says
 * which regions to ask for). Any other geometry is passed over.
 *
 * @example
 * ```ts
 * import type { BorderFeature } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const square: BorderFeature = { properties: { code: "A" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } };
 * console.log(square.properties?.code);
 * ```
 */
export interface BorderFeature {
  properties?: { code?: string | null } | null;
  geometry: { type: string; coordinates: unknown } | null;
}

/**
 * A set of shapes whose shared edges are the borders: a GeoJSON `FeatureCollection` in longitude and latitude, such as chizu's `world-geo` (the countries) or a country's regions.
 *
 * @example
 * ```ts
 * import type { BorderShapes } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const none: BorderShapes = { features: [] };
 * console.log(none.features.length);
 * ```
 */
export interface BorderShapes {
  features: readonly BorderFeature[];
}

/**
 * Which border sets an element draws, from its `borders` attribute.
 *
 * @example
 * ```ts
 * import type { BorderSets } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const both: BorderSets = { countries: true, regions: true };
 * console.log(both);
 * ```
 */
export interface BorderSets {
  countries: boolean;
  regions: boolean;
}

/**
 * The Earth's radius on the screen, in CSS pixels, from which the regions (provinces, states, prefectures) are drawn: about 7 km to a pixel, where a region of a few hundred kilometres is tens of pixels across.
 * The countries are drawn at any size.
 *
 * @example
 * ```ts
 * import { BORDER_REGIONS_RADIUS } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(BORDER_REGIONS_RADIUS);
 * ```
 */
export const BORDER_REGIONS_RADIUS = 900;

/**
 * The attributes the borders read: `borders`.
 *
 * @example
 * ```ts
 * import { BORDER_ATTRIBUTES } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(BORDER_ATTRIBUTES.join(" "));
 * ```
 */
export const BORDER_ATTRIBUTES = ["borders"] as const;

/**
 * A `borders` attribute: absent draws none; a bare attribute draws both sets; otherwise the words in it, `countries` and `regions`, each switch one set on.
 *
 * @param value - The attribute's text, or `null` when it is not there.
 * @returns Which sets are drawn.
 *
 * @example
 * ```ts
 * import { readBorders } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(readBorders(null), readBorders(""), readBorders("countries"));
 * ```
 */
export function readBorders(value: string | null): BorderSets {
  if (value === null) return { countries: false, regions: false };
  const words = value.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return { countries: true, regions: true };
  return { countries: words.includes("countries"), regions: words.includes("regions") };
}

const ringsOf = (geometry: BorderFeature["geometry"]): number[][][] => {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === "Polygon") return geometry.coordinates as number[][][];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as number[][][][]).flat();
  return [];
};

const pointKey = (point: number[]): string => `${Math.round(point[0]! * 1e5)},${Math.round(point[1]! * 1e5)}`;

/**
 * The borders of a set of shapes as line segments on the unit sphere: each edge that two different shapes share, drawn once; an edge only one shape has (a coast) is left out.
 * An edge longer than `maxStep` degrees is cut into pieces along the great circle, so the line keeps to the ground.
 *
 * @param shapes - The shapes, in longitude and latitude.
 * @param maxStep - The longest piece in degrees (1 when left out).
 * @returns The segments' ends, x, y, z for each, two points to a segment: ready for a `LineSegments` geometry.
 *
 * @example
 * ```ts
 * import { sharedEdges } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const west = { geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } };
 * const east = { geometry: { type: "Polygon", coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] } };
 * console.log(sharedEdges({ features: [west, east] }).length / 6);
 * ```
 */
export function sharedEdges(shapes: BorderShapes, maxStep = 1): Float32Array {
  const owners = new Map<string, { a: number[]; b: number[]; owner: number; shared: boolean }>();
  shapes.features.forEach((feature, owner) => {
    for (const ring of ringsOf(feature.geometry)) {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const a = ring[i]!;
        const b = ring[i + 1]!;
        const ka = pointKey(a);
        const kb = pointKey(b);
        if (ka === kb) continue;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const seen = owners.get(key);
        if (!seen) owners.set(key, { a, b, owner, shared: false });
        else if (seen.owner !== owner) seen.shared = true;
      }
    }
  });
  const out: number[] = [];
  const push = (lon: number, lat: number): void => {
    const phi = lat * RAD;
    const lambda = lon * RAD;
    out.push(Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda));
  };
  for (const edge of owners.values()) {
    if (!edge.shared) continue;
    const [lon0, lat0] = edge.a as [number, number];
    const [lon1, lat1] = edge.b as [number, number];
    let dLon = lon1 - lon0;
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    const pieces = Math.max(1, Math.ceil(Math.max(Math.abs(dLon) * Math.cos(((lat0 + lat1) / 2) * RAD), Math.abs(lat1 - lat0)) / maxStep));
    if (pieces === 1) {
      push(lon0, lat0);
      push(lon1, lat1);
      continue;
    }
    // along the great circle: the ends as unit vectors, mixed and put back on the sphere
    const p = [Math.cos(lat0 * RAD) * Math.sin(lon0 * RAD), Math.sin(lat0 * RAD), Math.cos(lat0 * RAD) * Math.cos(lon0 * RAD)];
    const q = [Math.cos(lat1 * RAD) * Math.sin(lon1 * RAD), Math.sin(lat1 * RAD), Math.cos(lat1 * RAD) * Math.cos(lon1 * RAD)];
    let last = p;
    for (let k = 1; k <= pieces; k += 1) {
      const t = k / pieces;
      const m = [p[0]! + (q[0]! - p[0]!) * t, p[1]! + (q[1]! - p[1]!) * t, p[2]! + (q[2]! - p[2]!) * t];
      const length = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
      const next = [m[0]! / length, m[1]! / length, m[2]! / length];
      out.push(last[0]!, last[1]!, last[2]!, next[0]!, next[1]!, next[2]!);
      last = next;
    }
  }
  return new Float32Array(out);
}

/**
 * Each coded shape's box in longitude and latitude: `[west, south, east, north]`, with `west` greater than `east` for a shape across the 180th meridian (the shorter way round).
 *
 * @param shapes - The shapes; one with no code is left out.
 * @returns The box of each code.
 *
 * @example
 * ```ts
 * import { shapeBoxes } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const fiji = { properties: { code: "FJ" }, geometry: { type: "Polygon", coordinates: [[[177, -18], [-179, -18], [-179, -16], [177, -16], [177, -18]]] } };
 * console.log(shapeBoxes({ features: [fiji] }).get("FJ"));
 * ```
 */
export function shapeBoxes(shapes: BorderShapes): Map<string, [number, number, number, number]> {
  const boxes = new Map<string, [number, number, number, number]>();
  for (const feature of shapes.features) {
    const code = feature.properties?.code;
    if (!code) continue;
    let south = 90;
    let north = -90;
    const lons: number[] = [];
    for (const ring of ringsOf(feature.geometry)) {
      for (const point of ring) {
        lons.push(point[0]!);
        south = Math.min(south, point[1]!);
        north = Math.max(north, point[1]!);
      }
    }
    if (lons.length === 0) continue;
    // the narrowest span of longitudes: the widest gap between neighbouring longitudes, round the circle, is the part the shape leaves out
    const sorted = [...new Set(lons.map((lon) => ((lon % 360) + 540) % 360 - 180))].sort((a, b) => a - b);
    let gap = sorted[0]! + 360 - sorted[sorted.length - 1]!;
    let west = sorted[0]!;
    let east = sorted[sorted.length - 1]!;
    for (let i = 1; i < sorted.length; i += 1) {
      const step = sorted[i]! - sorted[i - 1]!;
      if (step > gap) {
        gap = step;
        west = sorted[i]!;
        east = sorted[i - 1]!;
      }
    }
    boxes.set(code, [west, south, east, north]);
  }
  return boxes;
}

/**
 * The codes whose boxes come within `angle` degrees of a place: the countries whose regions a view may show.
 *
 * @param boxes - The boxes from `shapeBoxes`.
 * @param lon - The place's longitude, degrees.
 * @param lat - The place's latitude, degrees.
 * @param angle - How far round the sphere the view reaches from the place, degrees (90 for the whole near side).
 * @returns The codes, in the boxes' order.
 *
 * @example
 * ```ts
 * import { codesNear } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const boxes = new Map<string, [number, number, number, number]>([["JP", [122, 24, 154, 46]], ["BR", [-74, -34, -34, 5]]]);
 * console.log(codesNear(boxes, 139.7, 35.7, 10));
 * ```
 */
export function codesNear(boxes: ReadonlyMap<string, readonly [number, number, number, number]>, lon: number, lat: number, angle: number): string[] {
  const reach = Math.max(0, angle);
  const south = lat - reach;
  const north = lat + reach;
  // past a pole the view takes in every longitude
  const spread = south <= -90 || north >= 90 ? 180 : Math.min(180, reach / Math.max(0.01, Math.cos(Math.max(Math.abs(south), Math.abs(north)) * RAD)));
  const found: string[] = [];
  for (const [code, [west, boxSouth, east, boxNorth]] of boxes) {
    if (boxNorth < south || boxSouth > north) continue;
    if (spread < 180) {
      // the box's middle longitude and half its width, against the view's
      const width = (((east - west) % 360) + 360) % 360;
      const middle = west + width / 2;
      const apart = Math.abs((((middle - lon) % 360) + 540) % 360 - 180);
      if (apart > width / 2 + spread) continue;
    }
    found.push(code);
  }
  return found;
}
