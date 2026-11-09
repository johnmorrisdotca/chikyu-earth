// The land as the printable sheets need it, worked out from the package's own outlines (chizu's Natural Earth 1:110m): the coast of each continent as lines (the borders inside a continent are left out, so a child colours a whole continent),
// how much of the Earth is land, and which countries touch each other. Pure.
import WORLD_GEO from "@johnmorrisdotca/chizu/world-geo";
import { geoArea, geoCentroid, geoDistance } from "d3-geo";
import type { Feature, MultiPolygon, Polygon } from "geojson";

export type ContinentId = "africa" | "asia" | "europe" | "north-america" | "south-america" | "oceania" | "antarctica";

/** The continents, by the name chizu gives each country's group. */
const GROUP_IDS: Readonly<Record<string, ContinentId>> = {
  Africa: "africa",
  Asia: "asia",
  Europe: "europe",
  "North America": "north-america",
  "South America": "south-america",
  Oceania: "oceania",
  Antarctica: "antarctica",
};

type Ring = number[][];
type Rings = Ring[];

interface Land {
  name: string;
  ja: string;
  alpha2: string | null;
  continent: ContinentId;
  polygons: Rings[];
}

const LANDS: readonly Land[] = WORLD_GEO.features.map((feature): Land => {
  const geometry = feature.geometry as Polygon | MultiPolygon;
  return {
    name: feature.properties.name,
    ja: feature.properties.nameJa || feature.properties.name,
    alpha2: feature.properties.code.length === 2 ? feature.properties.code : null,
    continent: GROUP_IDS[feature.properties.group] ?? "asia",
    polygons: (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as Rings[],
  };
});

/** The area of a polygon in steradians (the whole sphere is 4π), whichever way its ring is wound. */
const areaOf = (rings: Rings): number => {
  const a = geoArea({ type: "Polygon", coordinates: rings });
  return a > 2 * Math.PI ? 4 * Math.PI - a : a;
};

/** Russia is in both Europe and Asia: the line between them is taken as the meridian 60 degrees east (the Urals are close to it), and everything east of it, with Chukotka past the antimeridian, is Asia. */
const URALS = 60;
const isEast = (lon: number): boolean => lon >= URALS || lon <= -150;

/** The part of a ring on the east side of the Urals meridian (one half-plane, so a plain clip). */
function eastOf(ring: Ring): Ring {
  const out: Ring = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const ain = a[0]! >= URALS;
    const bin = b[0]! >= URALS;
    if (ain) out.push(a);
    if (ain !== bin) out.push([URALS, a[1]! + ((URALS - a[0]!) / (b[0]! - a[0]!)) * (b[1]! - a[1]!)]);
  }
  if (out.length > 0) out.push(out[0]!);
  return out;
}

/** The point a vertex is known by: the antimeridian is one line, so 180 and -180 are the same. */
const keyOf = (p: number[]): string => `${p[0] === 180 ? -180 : p[0]},${p[1]}`;

interface Edge {
  a: number[];
  b: number[];
  continents: Set<ContinentId>;
  lands: Set<number>;
  /** The polygons it is on, as `land:polygon`. */
  polygons: Set<string>;
  count: number;
  /** The area of the biggest polygon the edge is on. */
  biggest: number;
}

/** Every edge of every outline, and who it is shared with. Built on first use. */
let table: { edges: Edge[]; areas: Map<ContinentId, number>; total: number } | undefined;
function edgesOf(): NonNullable<typeof table> {
  if (table !== undefined) return table;
  const edges = new Map<string, Edge>();
  const areas = new Map<ContinentId, number>();
  let total = 0;
  LANDS.forEach((land, index) => {
    land.polygons.forEach((polygon, which) => {
      const size = areaOf(polygon);
      if (land.alpha2 === "RU") {
        const ring = polygon[0]!;
        const lons = ring.map((p) => p[0]!);
        const east = Math.min(...lons) >= URALS || Math.max(...lons) <= URALS ? (isEast(lons[0]!) ? size : 0) : areaOf([eastOf(ring)]);
        areas.set("asia", (areas.get("asia") ?? 0) + east);
        areas.set("europe", (areas.get("europe") ?? 0) + size - east);
      } else areas.set(land.continent, (areas.get(land.continent) ?? 0) + size);
      total += size;
      // a hole is another country's land (Lesotho in South Africa), never a line of its own
      const ring = polygon[0]!;
      for (let i = 0; i < ring.length - 1; i += 1) {
        const a = ring[i]!;
        const b = ring[i + 1]!;
        const ka = keyOf(a);
        const kb = keyOf(b);
        if (ka === kb) continue;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        let edge = edges.get(key);
        if (edge === undefined) {
          edge = { a, b, continents: new Set(), lands: new Set(), polygons: new Set(), count: 0, biggest: 0 };
          edges.set(key, edge);
        }
        edge.continents.add(land.alpha2 === "RU" ? (isEast((a[0]! + b[0]!) / 2) ? "asia" : "europe") : land.continent);
        edge.lands.add(index);
        edge.polygons.add(`${index}:${which}`);
        edge.count += 1;
        edge.biggest = Math.max(edge.biggest, size);
      }
    });
  });
  table = { edges: [...edges.values()], areas, total };
  return table;
}

/** The line between Europe and Asia through Russia: the meridian from where the main land is crossed by it in the south to where it is crossed in the north. */
function uralsLine(): [number, number][] | undefined {
  const russia = LANDS.find((land) => land.alpha2 === "RU");
  if (russia === undefined) return undefined;
  const ring = russia.polygons.reduce((a, b) => (b[0]!.length > a[0]!.length ? b : a))[0]!;
  const crossings: number[] = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    if ((a[0]! - URALS) * (b[0]! - URALS) < 0) crossings.push(a[1]! + ((URALS - a[0]!) / (b[0]! - a[0]!)) * (b[1]! - a[1]!));
  }
  if (crossings.length < 2) return undefined;
  return [[URALS, Math.min(...crossings)], [URALS, Math.max(...crossings)]];
}

/**
 * The coasts of the continents as lines in longitude and latitude, for a child to colour a whole continent: the line round each continent and between two continents (Europe and Asia), and none between two countries of one continent. Islands under `minAreaSr` steradians are left out
 * (about 80,000 square kilometres at the default, so Great Britain, Japan, Madagascar and New Zealand stay and small islands go, which at a thick line would only be blobs).
 * @param minAreaSr - The smallest island kept, in steradians (the whole sphere is 4 pi).
 * @returns Lines of `[longitude, latitude]` points.
 *
 * @example
 * ```ts
 * import { continentLines } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const lines = continentLines();
 * console.log(lines.length > 5, lines[0]?.length);
 * ```
 */
export function continentLines(minAreaSr = 0.002): [number, number][][] {
  const edges = edgesOf().edges.filter((edge) => (edge.count === 1 || edge.continents.size > 1) && edge.biggest >= minAreaSr);
  const ends = new Map<string, number[]>();
  const add = (point: number[], at: number): void => {
    const key = keyOf(point);
    const list = ends.get(key);
    if (list === undefined) ends.set(key, [at]);
    else list.push(at);
  };
  edges.forEach((edge, i) => {
    add(edge.a, i);
    add(edge.b, i);
  });
  const used = new Set<number>();
  const lines: [number, number][][] = [];
  const other = (edge: Edge, from: string): number[] => (keyOf(edge.a) === from ? edge.b : edge.a);
  const walk = (start: number[], first: number): number[][] => {
    const points = [start];
    let at = first;
    let from = keyOf(start);
    for (;;) {
      used.add(at);
      const next = other(edges[at]!, from);
      points.push(next);
      from = keyOf(next);
      const here = ends.get(from)!;
      if (here.length !== 2) break;
      const following = here.find((i) => !used.has(i));
      if (following === undefined) break;
      at = following;
    }
    return points;
  };
  // lines start at a point where three lines meet or one ends, then whatever loops are left
  for (const [key, list] of ends) {
    if (list.length === 2) continue;
    for (const first of list) {
      if (used.has(first)) continue;
      const edge = edges[first]!;
      const start = keyOf(edge.a) === key ? edge.a : edge.b;
      lines.push(walk(start, first) as [number, number][]);
    }
  }
  edges.forEach((edge, i) => {
    if (!used.has(i)) lines.push(walk(edge.a, i) as [number, number][]);
  });
  const urals = uralsLine();
  if (urals !== undefined) lines.push(urals);
  return lines;
}

/**
 * How much of the Earth is land, by the package's outlines, in percent, and the share of all the land each continent has.
 * @returns The land's percent of the whole sphere, and each continent's percent of the land.
 *
 * @example
 * ```ts
 * import { landShares } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const shares = landShares();
 * console.log(Math.round(shares.landPercent), shares.continents.asia > shares.continents.africa);
 * ```
 */
export function landShares(): { landPercent: number; continents: Record<ContinentId, number> } {
  const { areas, total } = edgesOf();
  const continents = {} as Record<ContinentId, number>;
  for (const id of Object.values(GROUP_IDS)) continents[id] = ((areas.get(id) ?? 0) / total) * 100;
  return { landPercent: (total / (4 * Math.PI)) * 100, continents };
}

/**
 * One country as the sheets draw it: its names, its continent, its land as one feature and the names of the countries it touches.
 *
 * @example
 * ```ts
 * import { countryShape, type CountryShape } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const spain: CountryShape | undefined = countryShape("ES");
 * console.log(spain?.neighbours.map((one) => one.name));
 * ```
 */
export interface CountryShape {
  name: string;
  ja: string;
  alpha2: string | null;
  continent: ContinentId;
  /** The main land and the nearby islands as one feature. */
  feature: Feature<MultiPolygon>;
  /** The names of the countries it shares a border with, English and Japanese. */
  neighbours: { name: string; ja: string }[];
}

/** The farthest an island may be from the main land and still be drawn with it (France's Guiana and Hawaii are too far; Japan's and Indonesia's islands are not). */
const NEAR = 0.52;

/**
 * One country by its ISO alpha-2 code, for a "my country" sheet: its main land and the islands near it (a far territory such as French Guiana is left out), the continent it is in and the countries it touches.
 * @param alpha2 - The two-letter code, such as `JP`.
 * @returns The shape, or `undefined` when the package has no outline for the code.
 *
 * @example
 * ```ts
 * import { countryShape } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const france = countryShape("FR");
 * console.log(france?.continent, france?.neighbours.length);
 * ```
 */
export function countryShape(alpha2: string): CountryShape | undefined {
  const index = LANDS.findIndex((land) => land.alpha2 === alpha2.toUpperCase());
  if (index < 0) return undefined;
  const land = LANDS[index]!;
  const sized = land.polygons.map((rings, which) => ({ rings, which, size: areaOf(rings), centre: geoCentroid({ type: "Polygon", coordinates: rings }) }));
  const main = sized.reduce((a, b) => (b.size > a.size ? b : a));
  const kept = sized.filter((p) => p === main || (geoDistance(p.centre, main.centre) <= NEAR && p.size >= main.size * 0.003));
  // only the land that is drawn: French Guiana's neighbours are not France's on this sheet
  const touching = new Set<number>();
  for (const edge of edgesOf().edges) if (kept.some((p) => edge.polygons.has(`${index}:${p.which}`)) && edge.lands.size > 1) for (const other of edge.lands) if (other !== index) touching.add(other);
  return {
    name: land.name,
    ja: land.ja,
    alpha2: land.alpha2,
    continent: land.continent,
    feature: { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: kept.map((p) => p.rings) } },
    neighbours: [...touching].map((i) => ({ name: LANDS[i]!.name, ja: LANDS[i]!.ja })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * The two-letter codes of the countries that have an outline.
 * @returns The codes, in the order of the outlines.
 *
 * @example
 * ```ts
 * import { countryCodes } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(countryCodes().includes("JP"));
 * ```
 */
export const countryCodes = (): string[] => LANDS.flatMap((land) => (land.alpha2 === null ? [] : [land.alpha2]));
