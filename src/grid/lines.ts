// The grid on the Earth: meridians and parallels as line segments on the unit sphere, with the equator, the tropics, the polar circles and the prime meridian picked out.
// Pure: numbers in, a buffer of points and colours out (the axes of the Earth's own sphere: +z is longitude 0 on the equator, +x east, +y north).

const RAD = Math.PI / 180;

/**
 * The Earth's tilt, degrees: the IAU's obliquity of the ecliptic at J2000. The tropics lie at this latitude, the polar circles at 90 degrees less it.
 *
 * @example
 * ```ts
 * import { EARTH_TILT } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(EARTH_TILT, 90 - EARTH_TILT);
 * ```
 */
export const EARTH_TILT = 23.4393;

/**
 * The Earth's radius on the screen, in CSS pixels, from which the grid has a line every 15 degrees; below it, every 30.
 *
 * @example
 * ```ts
 * import { GRID_FINE_RADIUS } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(GRID_FINE_RADIUS);
 * ```
 */
export const GRID_FINE_RADIUS = 220;

/**
 * The attributes the grid reads: `grid`.
 *
 * @example
 * ```ts
 * import { GRID_ATTRIBUTES } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(GRID_ATTRIBUTES.join(" "));
 * ```
 */
export const GRID_ATTRIBUTES = ["grid"] as const;

/**
 * A `grid` attribute: absent (or `off`) draws none, anything else draws it.
 *
 * @param value - The attribute's text, or `null` when it is not there.
 * @returns Whether the grid is drawn.
 *
 * @example
 * ```ts
 * import { readGrid } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(readGrid(null), readGrid(""), readGrid("off"));
 * ```
 */
export function readGrid(value: string | null): boolean {
  return value !== null && value.trim().toLowerCase() !== "off";
}

/**
 * The grid's lines, ready for one batch of line segments: the special lines first, then the lines every 30 degrees, then the ones every 15 degrees in between, so that the first `coarse` points are
 * the grid of a small Earth and all `points` the grid of a large one.
 *
 * @example
 * ```ts
 * import { gridLines, type GridLines } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const grid: GridLines = gridLines();
 * console.log(grid.coarse < grid.points);
 * ```
 */
export interface GridLines {
  /** x, y, z of each point, two points to a segment. */
  positions: Float32Array;
  /** r, g, b of each point (0 to 255). */
  colours: Uint8Array;
  /** How many points the special lines and the 30-degree lines take. */
  coarse: number;
  /** How many points there are in all. */
  points: number;
}

/** The look of each kind of line: a plain line, the special parallels (equator, tropics, polar circles) and the prime meridian. */
const PLAIN: readonly [number, number, number] = [140, 168, 204];
const CIRCLE: readonly [number, number, number] = [235, 242, 255];
const EQUATOR: readonly [number, number, number] = [255, 255, 255];
const PRIME: readonly [number, number, number] = [255, 189, 107];

/**
 * Makes the grid: meridians and parallels every 15 degrees (the parallels from 75 south to 75 north, the meridians to the poles), the equator brightest, the tropics and polar circles bright,
 * the prime meridian in a warm colour. Each line is cut into pieces of at most `step` degrees so it keeps to the sphere.
 *
 * @param step - The longest piece, in degrees (3 when left out).
 * @returns The segments and their colours.
 *
 * @example
 * ```ts
 * import { gridLines } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const grid = gridLines();
 * console.log(grid.points / 2, grid.coarse / 2);
 * ```
 */
export function gridLines(step = 3): GridLines {
  const positions: number[] = [];
  const colours: number[] = [];
  const at = (lon: number, lat: number): [number, number, number] => {
    const phi = lat * RAD;
    const lambda = lon * RAD;
    return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
  };
  const segment = (a: [number, number, number], b: [number, number, number], colour: readonly [number, number, number]): void => {
    positions.push(...a, ...b);
    colours.push(...colour, ...colour);
  };
  const parallel = (lat: number, colour: readonly [number, number, number]): void => {
    const pieces = Math.max(8, Math.ceil(360 / step));
    for (let i = 0; i < pieces; i += 1) segment(at(-180 + (360 * i) / pieces, lat), at(-180 + (360 * (i + 1)) / pieces, lat), colour);
  };
  const meridian = (lon: number, colour: readonly [number, number, number]): void => {
    const pieces = Math.max(4, Math.ceil(180 / step));
    for (let i = 0; i < pieces; i += 1) segment(at(lon, -90 + (180 * i) / pieces), at(lon, -90 + (180 * (i + 1)) / pieces), colour);
  };
  // the special lines
  parallel(0, EQUATOR);
  for (const lat of [EARTH_TILT, -EARTH_TILT, 90 - EARTH_TILT, EARTH_TILT - 90]) parallel(lat, CIRCLE);
  meridian(0, PRIME);
  // every 30 degrees, then every 15 in between
  const plain = (coarseOnes: boolean): void => {
    for (let lat = -75; lat <= 75; lat += 15) if (lat !== 0 && (lat % 30 === 0) === coarseOnes) parallel(lat, PLAIN);
    for (let lon = -165; lon <= 180; lon += 15) if (lon !== 0 && (lon % 30 === 0) === coarseOnes) meridian(lon, PLAIN);
  };
  plain(true);
  const coarse = positions.length / 3;
  plain(false);
  return { positions: new Float32Array(positions), colours: new Uint8Array(colours), coarse, points: positions.length / 3 };
}
