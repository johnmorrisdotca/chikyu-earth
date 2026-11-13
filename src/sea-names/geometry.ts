// Which oceans, seas and continents are named, and where. Pure: the points are fixed, and a draw only places the names that fit.
import type { CityFrame } from "../cities/geometry.ts";
import { nameWidth } from "../cities/geometry.ts";
import { SEA_FEATURES } from "./features.ts";

export { SEA_FEATURES };

/**
 * One named place: an ocean, a sea, a gulf, a bay or a continent, with the point its name is set at.
 *
 * @example
 * ```ts
 * import type { SeaFeature } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const pacific: SeaFeature = { id: "pacific-ocean", kind: "ocean", lon: -145.5, lat: -8, name: { en: "Pacific Ocean", ja: "太平洋" } };
 * console.log(pacific.name.en);
 * ```
 */
export interface SeaFeature {
  id: string;
  kind: "ocean" | "continent" | "sea" | "gulf" | "bay";
  lon: number;
  lat: number;
  name: { en: string; ja: string };
}

/**
 * A name placed for one draw: its id, the text, and the box it takes.
 *
 * @example
 * ```ts
 * import type { SeaName } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const say = (one: SeaName): string => one.text;
 * console.log(typeof say);
 * ```
 */
export interface SeaName {
  id: string;
  kind: SeaFeature["kind"];
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  size: number;
}

/**
 * The Earth's radius, in CSS pixels, at which seas, gulfs and bays join the oceans and continents.
 * Below this the view is the wide Earth: only oceans and continents are named.
 *
 * @example
 * ```ts
 * import { SEA_RADIUS } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(SEA_RADIUS > 200);
 * ```
 */
export const SEA_RADIUS = 280;

/** Space between the letters of a water name, as a share of the text size. Continents use a little less. */
export const SEA_LETTER_SPACING = 0.22;
export const LAND_LETTER_SPACING = 0.06;

const WATER = new Set<SeaFeature["kind"]>(["ocean", "sea", "gulf", "bay"]);
const FACING = 0.25;
const MAX = 18;

/**
 * The names a view of this size may show: oceans and continents while the Earth is small, and seas, gulfs and bays once it is at least {@link SEA_RADIUS} pixels in radius.
 *
 * @param radius - The Earth's radius on the screen, in CSS pixels.
 * @returns The features, oceans and continents first.
 *
 * @example
 * ```ts
 * import { seaNamesFor } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(seaNamesFor(120).some((one) => one.id === "pacific-ocean"));
 * console.log(seaNamesFor(120).some((one) => one.id === "sea-of-japan"));
 * console.log(seaNamesFor(400).some((one) => one.id === "mediterranean-sea"));
 * ```
 */
export function seaNamesFor(radius: number): readonly SeaFeature[] {
  const wide = SEA_FEATURES.filter((one) => one.kind === "ocean" || one.kind === "continent");
  if (radius < SEA_RADIUS) return wide;
  return SEA_FEATURES;
}

/**
 * Reads the `sea-names` attribute. Absent or `off` is off. A bare attribute, or any other value, is on.
 *
 * @param value - The attribute's value, or null when it is absent.
 * @returns Whether the names are on.
 *
 * @example
 * ```ts
 * import { readSeaNames } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(readSeaNames(null), readSeaNames(""), readSeaNames("off"));
 * ```
 */
export function readSeaNames(value: string | null): boolean {
  return value !== null && value !== "off";
}

/** The attributes the elements watch for these names. */
export const SEA_NAMES_ATTRIBUTES = ["sea-names"] as const;

const spacingOf = (kind: SeaFeature["kind"]): number => (WATER.has(kind) ? SEA_LETTER_SPACING : LAND_LETTER_SPACING);

const boxOf = (text: string, size: number, spacing: number): { width: number; height: number } => {
  let width = 0;
  for (const char of text) width += ((char.codePointAt(0) ?? 0) >= 0x2e80 ? size : size * 0.58) + size * spacing;
  return { width: Math.ceil(Math.max(width, nameWidth(text, size))) + 4, height: Math.ceil(size * 1.35) };
};

/**
 * Lays the names out for one draw. A name on the far side, or off the Earth's disc, is left out. A box in `taken` (a city name, a place, a country) keeps its space: the name moves aside, and if the only room is taken it is left out, so a city that was placed first wins.
 *
 * @param radius - The Earth's radius on the screen. It chooses oceans and continents, or those plus the seas.
 * @param frame - Where the Earth is, and how to project a place. `project` returns how squarely the place faces the viewer.
 * @param lang - `en` or `ja`.
 * @param taken - Boxes already used. A name is not put over one.
 * @returns The names to show.
 *
 * @example
 * ```ts
 * import { layoutSeaNames } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const frame = { width: 400, height: 400, radius: 160, project: (lon: number, lat: number, out: { x: number; y: number }) => { out.x = 200 + lon; out.y = 200 - lat; return 1; } };
 * console.log(layoutSeaNames(160, frame, "en", []).some((one) => one.id === "africa"));
 * ```
 */
export function layoutSeaNames(radius: number, frame: CityFrame & { disc?: { x: number; y: number; radius: number } }, lang: "en" | "ja", taken: readonly { left: number; top: number; width: number; height: number }[]): SeaName[] {
  const out = { x: 0, y: 0 };
  const disc = frame.disc;
  const blocked = taken.map((box) => ({ l: box.left, t: box.top, r: box.left + box.width, b: box.top + box.height }));
  const placed: { l: number; t: number; r: number; b: number }[] = [];
  const hits = (box: { l: number; t: number; r: number; b: number }, others: readonly { l: number; t: number; r: number; b: number }[]): boolean => {
    for (const other of others) if (box.l < other.r && box.r > other.l && box.t < other.b && box.b > other.t) return true;
    return false;
  };
  const inDisc = (box: { l: number; t: number; r: number; b: number }): boolean => {
    if (!disc) return true;
    const reach = disc.radius - 2;
    return Math.hypot(box.l - disc.x, box.t - disc.y) <= reach && Math.hypot(box.r - disc.x, box.t - disc.y) <= reach && Math.hypot(box.l - disc.x, box.b - disc.y) <= reach && Math.hypot(box.r - disc.x, box.b - disc.y) <= reach;
  };
  const names: SeaName[] = [];
  const features = [...seaNamesFor(radius)].sort((a, b) => rank(b) - rank(a));
  for (const feature of features) {
    if (names.length >= MAX) break;
    const facing = frame.project(feature.lon, feature.lat, out);
    if (facing < FACING) continue;
    const text = lang === "ja" ? feature.name.ja : feature.name.en;
    const size = feature.kind === "ocean" || feature.kind === "continent" ? 14 : 12;
    const { width, height } = boxOf(text, size, spacingOf(feature.kind));
    const shifts: [number, number][] = [
      [-width / 2, -height / 2],
      [8, -height / 2],
      [-width - 8, -height / 2],
      [-width / 2, -height - 6],
      [-width / 2, 8],
    ];
    for (const [dx, dy] of shifts) {
      const left = out.x + dx;
      const top = out.y + dy;
      const box = { l: left, t: top, r: left + width, b: top + height };
      if (box.l < 0 || box.t < 0 || box.r > frame.width || box.b > frame.height) continue;
      if (!inDisc(box) || hits(box, blocked) || hits(box, placed)) continue;
      placed.push(box);
      names.push({ id: feature.id, kind: feature.kind, text, left, top, width, height, size });
      break;
    }
  }
  return names;
}

const rank = (feature: SeaFeature): number => (feature.kind === "sea" || feature.kind === "gulf" || feature.kind === "bay" ? 3 : feature.kind === "continent" ? 2 : 1);
