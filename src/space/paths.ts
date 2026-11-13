// Extra orbit paths for a page's own use: a list of satellites whose orbit is drawn at once, each in a named look, and the test of which path a point on the picture is on.
// The look is a small table a page can override (`selected`, `hovered`, `favourite`, `path`); a look differs by width and dash as well as colour, so a reader who cannot tell the colours apart can still tell the lines apart.
// Everything here is plain numbers and strings: the drawing is in satellite-layer.ts, which draws every path and the chosen satellite's own orbit in one call.
import type { SatelliteRef, Satellites } from "../satellites/types.ts";

/** How a path is drawn: its colour, its width in CSS pixels, how opaque it is and its dashes (a dash and a gap, in CSS pixels, or `null` for a solid line). */
export interface PathStyle {
  /** Any CSS colour. */
  color: string;
  /** CSS pixels, 0.5 to 8. */
  width: number;
  /** 0 to 1. */
  opacity: number;
  /** `[dash, gap]` in CSS pixels, each 1 to 64, measured along the orbit at the Earth's drawn size; `null` is a solid line. */
  dash: [number, number] | null;
}

/** One path to draw: the satellite, by NORAD catalogue number or by `group:index` (`stations:0`), and its look, as the name of an entry of the style table or as a partial look over the `path` entry. */
export interface PathRequest {
  id: number | string;
  style?: string | Partial<PathStyle>;
}

/** A path that is drawn: the request, the satellite it resolved to and the look it has. */
export interface PathInfo {
  id: number | string;
  ref: SatelliteRef;
  /** The name of the style, or `custom` for a look given in the request itself. */
  style: string;
}

/** The path under a point on the picture. */
export interface PathHit extends PathInfo {
  /** CSS pixels from the element's left and top edges: the point on the path nearest to the pointer. */
  x: number;
  y: number;
  /** How far, in CSS pixels, the pointer is from that point. */
  distancePx: number;
  /** What pointed: a mouse, a touch or a pen. */
  pointer: "mouse" | "touch" | "pen";
}

/** The most extra paths drawn at once. A longer list keeps the last of it (the most recent). */
export const MAX_PATHS = 16;

/** The path hit radius in CSS pixels when the page does not say (`path-hit`), and its range. A touch is given twice as much, and at least {@link TOUCH_HIT_MIN}. */
export const DEFAULT_PATH_HIT = 8;
export const MAX_PATH_HIT = 40;
export const TOUCH_HIT_MIN = 16;

export const MIN_PATH_WIDTH = 0.5;
export const MAX_PATH_WIDTH = 8;

/** The look of each name before a page overrides any. They differ in width and dash, not only in colour. */
export const BUILT_IN_PATH_STYLES: Readonly<Record<string, PathStyle>> = {
  selected: { color: "#ffffff", width: 2, opacity: 0.85, dash: null },
  hovered: { color: "#ffffff", width: 1.5, opacity: 0.6, dash: [6, 4] },
  favourite: { color: "#ffd166", width: 1.75, opacity: 0.85, dash: [3, 4] },
  path: { color: "#ffffff", width: 1.5, opacity: 0.8, dash: null },
};

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * Take a look a page gave and make a whole one: what is missing or out of range is taken from `base` (a number is held to its range, a dash that is not two numbers of 1 to 64 is `base`'s dash, `null` is a solid line).
 *
 * @param given - The page's look, any part of it.
 * @param base - The look to fall back on.
 * @returns A look with every part set.
 */
export function completeStyle(given: Partial<PathStyle> | null | undefined, base: PathStyle): PathStyle {
  const out: PathStyle = { ...base, dash: base.dash ? [...base.dash] : null };
  if (!given || typeof given !== "object") return out;
  if (typeof given.color === "string" && given.color.trim() !== "") out.color = given.color.trim();
  if (typeof given.width === "number" && Number.isFinite(given.width)) out.width = clamp(given.width, MIN_PATH_WIDTH, MAX_PATH_WIDTH);
  if (typeof given.opacity === "number" && Number.isFinite(given.opacity)) out.opacity = clamp(given.opacity, 0, 1);
  if (given.dash === null) out.dash = null;
  else if (Array.isArray(given.dash) && given.dash.length === 2 && given.dash.every((n) => typeof n === "number" && Number.isFinite(n))) out.dash = [clamp(given.dash[0]!, 1, 64), clamp(given.dash[1]!, 1, 64)];
  return out;
}

/**
 * The table of looks in use: the built-in ones with the page's own laid over them, name by name. An override is a partial look over the built-in of that name (or over `path` for a new name);
 * `null` takes a page's override away.
 *
 * @param overrides - The page's entries.
 * @returns The whole table, a new object.
 */
export function styleTable(overrides: Readonly<Record<string, Partial<PathStyle> | null>>): Record<string, PathStyle> {
  const table: Record<string, PathStyle> = {};
  for (const [name, style] of Object.entries(BUILT_IN_PATH_STYLES)) table[name] = completeStyle(null, style);
  for (const [name, given] of Object.entries(overrides)) {
    if (given === null || name === "") continue;
    table[name] = completeStyle(given, table[name] ?? BUILT_IN_PATH_STYLES["path"]!);
  }
  return table;
}

/** The part of a list that is drawn and how much was left out: the last {@link MAX_PATHS}, in their order. */
export function capPaths<T>(list: readonly T[]): { kept: T[]; dropped: number } {
  const dropped = Math.max(0, list.length - MAX_PATHS);
  return { kept: list.slice(dropped), dropped };
}

/**
 * Find the satellite an id names among the groups shown: a NORAD number, or `group:index` (`group/index` is read the same). `null` when nothing matches.
 *
 * @param id - The id from a path request.
 * @param groups - The groups, by name.
 * @returns The satellite, or `null`.
 */
export function resolvePathId(id: number | string, groups: ReadonlyMap<string, { satellites: Satellites }>): SatelliteRef | null {
  if (typeof id === "string") {
    const at = Math.max(id.lastIndexOf(":"), id.lastIndexOf("/"));
    if (at > 0) {
      const group = id.slice(0, at);
      const index = Number(id.slice(at + 1));
      const found = groups.get(group);
      return found && Number.isInteger(index) && index >= 0 && index < found.satellites.count ? { group, index } : null;
    }
    const number = Number(id);
    if (id.trim() === "" || !Number.isInteger(number)) return null;
    return resolvePathId(number, groups);
  }
  if (!Number.isInteger(id)) return null;
  for (const [group, found] of groups) {
    const sets = found.satellites.sets;
    for (let index = 0; index < found.satellites.count; index += 1) if (sets[index]?.NORAD_CAT_ID === id) return { group, index };
  }
  return null;
}

/** The radius a pointer finds a path within: the page's `path-hit` for a mouse or a pen, twice it (at least {@link TOUCH_HIT_MIN}) for a touch, and 0 (no test) when `path-hit` is 0. */
export function hitRadius(base: number, pointer: PathHit["pointer"]): number {
  if (!(base > 0)) return 0;
  return pointer === "touch" ? Math.max(TOUCH_HIT_MIN, base * 2) : base;
}

/** Read `path-hit`: a number of CSS pixels from 0 to {@link MAX_PATH_HIT}, `off` for 0, and the default for nothing or anything else. */
export function readPathHit(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_PATH_HIT;
  const text = value.trim().toLowerCase();
  if (text === "off") return 0;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? Math.min(MAX_PATH_HIT, number) : DEFAULT_PATH_HIT;
}

/** The look of the path of a request: a name in the table, a partial look over `path`, or `path` itself. A name the table does not have is `path`. */
export function styleOf(request: PathRequest, table: Readonly<Record<string, PathStyle>>): { name: string; style: PathStyle } {
  const given = request.style;
  const base = table["path"] ?? BUILT_IN_PATH_STYLES["path"]!;
  if (given === undefined) return { name: "path", style: base };
  if (typeof given === "string") return table[given] ? { name: given, style: table[given]! } : { name: "path", style: base };
  return { name: "custom", style: completeStyle(given, base) };
}

/**
 * How far a point is from a line segment, and the point on it nearest. All in the same units (CSS pixels on the picture).
 *
 * @param px - The point's x.
 * @param py - The point's y.
 * @param ax - The segment's start x.
 * @param ay - The segment's start y.
 * @param bx - The segment's end x.
 * @param by - The segment's end y.
 * @returns The distance and the nearest point.
 */
export function nearestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { distance: number; x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { distance: Math.hypot(px - x, py - y), x, y };
}

/**
 * The nearest of several closed loops of screen points to a point, within `radius`. A segment is left out when either end is flagged hidden (behind the Earth, behind the camera or off the picture's depth).
 *
 * @param px - The point's x.
 * @param py - The point's y.
 * @param loops - Each loop's screen points (`xy`, two numbers each) and a flag for each point (`ok`: 1 when the point can be seen, else 0).
 * @param radius - The most the point may be from a loop.
 * @returns The loop's index, the distance and the nearest point, or `null` when no loop is within the radius.
 */
export function nearestLoop(px: number, py: number, loops: readonly { xy: Float32Array | Float64Array; ok: Uint8Array; count: number }[], radius: number): { index: number; distance: number; x: number; y: number } | null {
  let best: { index: number; distance: number; x: number; y: number } | null = null;
  for (let l = 0; l < loops.length; l += 1) {
    const { xy, ok, count } = loops[l]!;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      if (!ok[i] || !ok[j]) continue;
      const near = nearestOnSegment(px, py, xy[i * 2]!, xy[i * 2 + 1]!, xy[j * 2]!, xy[j * 2 + 1]!);
      if (near.distance <= radius && (best === null || near.distance < best.distance)) best = { index: l, distance: near.distance, x: near.x, y: near.y };
    }
  }
  return best;
}
