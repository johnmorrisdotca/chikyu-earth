// Which country a point is in, from the same Natural Earth 1:110m outlines the line globe draws (chizu's world-geo).
// The line is coarse, so a point within PLACE_COAST_KM of an outline but outside every shape is `near`, not a country.
import { geoContains } from "d3-geo";
import WORLD_GEO from "@johnmorrisdotca/chizu/world-geo";
import type { Feature, Geometry } from "geojson";

/**
 * How close to a 1:110m outline, in kilometres, still counts as that country nearby.
 * The outlines can sit tens of kilometres off a real coast, so a point this close is not reported as inside.
 *
 * @example
 * ```ts
 * import { PLACE_COAST_KM } from "@johnmorrisdotca/chikyu-earth/place";
 *
 * console.log(PLACE_COAST_KM);
 * ```
 */
export const PLACE_COAST_KM = 50;

const RAD = Math.PI / 180;
const MEAN_RADIUS_KM = 6371.0088;
const CELL = 15;
const EXPAND = 0.8;

type Vec = [number, number, number];
type Ring = Vec[];
interface Box { west: number; east: number; south: number; north: number }
interface Land {
  code: string | null;
  name: string;
  nameJa: string;
  group: string;
  groupJa: string;
  geometry: Geometry;
  rings: Ring[];
  boxes: Box[];
  area: number;
}

/** A country the outlines know, with the continent group chizu gives it. */
export interface LandHit {
  code: string | null;
  name: string;
  nameJa: string;
  group: string;
  groupJa: string;
}

export interface LandAnswer {
  /** Inside one outline, and not merely within {@link PLACE_COAST_KM} of its edge while sitting outside it. */
  country: LandHit | null;
  /** Outside every outline, and within {@link PLACE_COAST_KM} of the nearest one. */
  near: (LandHit & { distanceKm: number }) | null;
}

const toVec = (lon: number, lat: number): Vec => {
  const la = lat * RAD;
  const lo = lon * RAD;
  const c = Math.cos(la);
  return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)];
};

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const hypot = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);
const angle = (a: Vec, b: Vec): number => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

/** Kilometres from `p` to the minor arc `a`–`b`. A segment longer than half a turn uses the nearer end. */
const segmentKm = (p: Vec, a: Vec, b: Vec): number => {
  const ab = angle(a, b);
  if (ab < 1e-8 || ab > Math.PI - 1e-4) return Math.min(angle(p, a), angle(p, b)) * MEAN_RADIUS_KM;
  const n = cross(a, b);
  const nn = hypot(n);
  if (nn < 1e-12) return angle(p, a) * MEAN_RADIUS_KM;
  const scale = dot(p, n) / (nn * nn);
  const raw: Vec = [p[0] - n[0] * scale, p[1] - n[1] * scale, p[2] - n[2] * scale];
  const len = hypot(raw);
  if (len < 1e-12) return 0;
  const g: Vec = [raw[0] / len, raw[1] / len, raw[2] / len];
  const on = dot(cross(a, g), n) >= -1e-7 && dot(cross(g, b), n) >= -1e-7;
  return (on ? angle(p, g) : Math.min(angle(p, a), angle(p, b))) * MEAN_RADIUS_KM;
};

const ringsOf = (geometry: Geometry): number[][][] => {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
};

const boxesOf = (rings: number[][][]): Box[] => {
  let south = 90;
  let north = -90;
  let wraps = false;
  const lons: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const lon = ring[i]![0]!;
      const lat = ring[i]![1]!;
      lons.push(lon);
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (i > 0 && Math.abs(lon - ring[i - 1]![0]!) > 180) wraps = true;
    }
  }
  if (lons.length === 0) return [];
  if (!wraps) return [{ west: Math.min(...lons), east: Math.max(...lons), south, north }];
  const east = lons.filter((lon) => lon >= 0);
  const west = lons.filter((lon) => lon < 0);
  const boxes: Box[] = [];
  if (east.length > 0) boxes.push({ west: Math.min(...east), east: 180, south, north });
  if (west.length > 0) boxes.push({ west: -180, east: Math.max(...west), south, north });
  return boxes;
};

const cellKey = (lon: number, lat: number): number => {
  const x = Math.max(-180, Math.min(165, Math.floor(lon / CELL) * CELL));
  const y = Math.max(-90, Math.min(75, Math.floor(lat / CELL) * CELL));
  return (x + 180) / CELL + ((y + 90) / CELL) * 24;
};

const build = (): { lands: Land[]; grid: Map<number, number[]> } => {
  const lands: Land[] = [];
  const grid = new Map<number, number[]>();
  for (const feature of WORLD_GEO.features) {
    const geometry = feature.geometry as Geometry;
    const raw = ringsOf(geometry);
    if (raw.length === 0) continue;
    const boxes = boxesOf(raw);
    const rings = raw.map((ring) => ring.map(([lon, lat]) => toVec(lon!, lat!)));
    const area = boxes.reduce((sum, box) => sum + (box.east - box.west) * (box.north - box.south), 0);
    const index = lands.length;
    const props = feature.properties;
    lands.push({
      code: props.code.length === 2 ? props.code : null,
      name: props.name,
      nameJa: props.nameJa || props.name,
      group: props.group ?? "",
      groupJa: props.groupJa ?? "",
      geometry,
      rings,
      boxes,
      area,
    });
    for (const box of boxes) {
      const west = Math.max(-180, box.west - EXPAND);
      const east = Math.min(180, box.east + EXPAND);
      const south = Math.max(-90, box.south - EXPAND);
      const north = Math.min(90, box.north + EXPAND);
      for (let lat = Math.floor(south / CELL) * CELL; lat <= north; lat += CELL) {
        for (let lon = Math.floor(west / CELL) * CELL; lon <= east; lon += CELL) {
          const key = cellKey(Math.max(-180, Math.min(179.9, lon)), Math.max(-90, Math.min(89.9, lat)));
          const list = grid.get(key);
          if (list) list.push(index);
          else grid.set(key, [index]);
        }
      }
    }
  }
  return { lands, grid };
};

let ready: { lands: Land[]; grid: Map<number, number[]> } | null = null;
const index = (): { lands: Land[]; grid: Map<number, number[]> } => (ready ??= build());

const nearestKm = (land: Land, point: Vec): number => {
  let best = Number.POSITIVE_INFINITY;
  for (const ring of land.rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const km = segmentKm(point, ring[i]!, ring[i + 1]!);
      if (km < best) best = km;
      if (best === 0) return 0;
    }
  }
  return best;
};

const asHit = (land: Land): LandHit => ({ code: land.code, name: land.name, nameJa: land.nameJa, group: land.group, groupJa: land.groupJa });

/** The country at a longitude and latitude, or the nearest one when the point is just off a coarse outline. The shapes are Natural Earth 1:110m. */
export function landAt(lon: number, lat: number): LandAnswer {
  const { lands, grid } = index();
  const list = grid.get(cellKey(lon, lat)) ?? [];
  const point = toVec(lon, lat);
  let inside: Land | null = null;
  for (const id of list) {
    const land = lands[id]!;
    const feature = { type: "Feature", geometry: land.geometry, properties: {} } as Feature;
    if (!geoContains(feature, [lon, lat])) continue;
    if (!inside || land.area < inside.area) inside = land;
  }
  if (inside) return { country: asHit(inside), near: null };
  let best: { land: Land; km: number } | null = null;
  for (const id of list) {
    const land = lands[id]!;
    const km = nearestKm(land, point);
    if (km <= PLACE_COAST_KM && (!best || km < best.km)) best = { land, km };
  }
  if (!best) return { country: null, near: null };
  return { country: null, near: { ...asHit(best.land), distanceKm: best.km } };
}
