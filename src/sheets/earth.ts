// The globe sheet and the world map: the continents with thick outlines and their names and the oceans' written where they are, then three facts. Pure: each is a string of SVG measured in millimetres.
import { geoNaturalEarth1, geoOrthographic, geoPath, type GeoProjection } from "d3-geo";
import { continentLines } from "./land.ts";
import { PLACES, VIEW_CENTRES, VIEW_LABELS, earthFacts, type GlobeView, type Place } from "./text.ts";
import { thickPath } from "./outline.ts";
import { factsBlock, labelMm, nameBlock, outlineMm, svgOpen, type Lang, type TypeName } from "./common.ts";
import { TITLES } from "./text.ts";

/**
 * What a sheet is drawn for: the room in millimetres, the language and the type.
 *
 * @example
 * ```ts
 * import { worldMapSvg, type SheetOptions } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const options: SheetOptions = { widthMm: 184.6, heightMm: 170, lang: "ja", type: "kid" };
 * console.log(worldMapSvg(options).includes("たいへいよう"));
 * ```
 */
export interface SheetOptions {
  widthMm: number;
  heightMm: number;
  lang?: Lang;
  /** `kid` (default): thick lines and big type. `normal`: thin lines and small type. */
  type?: TypeName;
}

const SPHERE = { type: "Sphere" } as const;
const GAP = 5;
/** The smallest island kept before the lines are made simpler. */
const MIN_ISLAND_SR = 0.0006;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The names written on a picture, each centred where `spot` says (a place with no spot is left out). A name that does not fit `inside` is left out too. */
function names(projection: GeoProjection, lang: Lang, type: TypeName, inside: (box: Box) => boolean, spot: (place: Place) => readonly [number, number] | undefined, flat = false): string {
  const size = labelMm(type);
  const out: string[] = [];
  for (const place of PLACES) {
    const at = spot(place);
    if (at === undefined) continue;
    const point = projection([at[0], at[1]]);
    if (point === null) continue;
    const lines = flat && place.oneLine === true ? [(lang === "ja" ? place.ja : place.en).join(" ")] : lang === "ja" ? place.ja : place.en;
    const block = nameBlock(lines, point[0], point[1], size, ` data-place="${place.id}"`);
    const box: Box = { x0: point[0] - block.width / 2, x1: point[0] + block.width / 2, y0: point[1] - block.height / 2, y1: point[1] + block.height / 2 };
    if (inside(box)) out.push(block.markup);
  }
  return out.join("");
}

/**
 * The globe as a colouring sheet: one side of the Earth as a big disc, the continents with thick outlines, the continents' and oceans' names written on them, and three facts under it. A view is the Americas, Europe and Africa, or Asia and Oceania.
 * `widthMm` and `heightMm` are the room it is drawn for, and the viewBox is that room, so a millimetre is a millimetre on paper.
 * @param view - `americas`, `europe-africa` or `asia-oceania`.
 * @param options - The room, the language and the type.
 * @returns The `<svg>` markup.
 *
 * @example
 * ```ts
 * import { globeSheetSvg } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const svg = globeSheetSvg("europe-africa", { widthMm: 184.6, heightMm: 180, lang: "en" });
 * console.log(svg.includes("Africa"), svg.includes("Atlantic"));
 * ```
 */
export function globeSheetSvg(view: GlobeView, options: SheetOptions): string {
  const { widthMm: w, heightMm: h } = options;
  const lang = options.lang ?? "en";
  const type = options.type ?? "kid";
  const outline = outlineMm(type);
  const facts = factsBlock(earthFacts("globe", lang), w, 0, type);
  const free = h - facts.height - GAP;
  const diameter = Math.min(w, free);
  const radius = diameter / 2 - outline / 2;
  const cx = w / 2;
  const cy = free / 2;
  const centre = VIEW_CENTRES[view];
  const projection = geoOrthographic().rotate([-centre[0], -centre[1]]).translate([cx, cy]).scale(radius).clipAngle(90).precision(0.3);
  const path = geoPath(projection);
  const coast = thickPath(path({ type: "MultiLineString", coordinates: continentLines(MIN_ISLAND_SR) }) ?? "", outline * 0.4, outline * 3.5);
  const rim = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#000" stroke-width="${outline}" data-rim=""/>`;
  const lines = `<path d="${coast}" fill="none" stroke="#000" stroke-width="${outline}" stroke-linecap="round" stroke-linejoin="round" data-coast=""/>`;
  const inside = (box: Box): boolean => [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]].every(([x, y]) => Math.hypot(x! - cx, y! - cy) <= radius - outline);
  const words = names(projection, lang, type, inside, (place) => VIEW_LABELS[view][place.id]);
  const label = TITLES.globe(view, lang);
  return `${svgOpen(w, h, label, "globe")}${rim}${lines}${words}<g transform="translate(0 ${h - facts.height})">${facts.markup}</g></svg>`;
}

/**
 * The world map as a colouring sheet: all the land on one flat map, the continents with thick outlines, the names of the continents and of the five oceans written on it, and three facts.
 * @param options - The room, the language and the type.
 * @returns The `<svg>` markup.
 *
 * @example
 * ```ts
 * import { worldMapSvg } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const svg = worldMapSvg({ widthMm: 184.6, heightMm: 180, lang: "en" });
 * console.log(svg.includes("Pacific"));
 * ```
 */
export function worldMapSvg(options: SheetOptions): string {
  const { widthMm: w, heightMm: h } = options;
  const lang = options.lang ?? "en";
  const type = options.type ?? "kid";
  const outline = outlineMm(type);
  const facts = factsBlock(earthFacts("map", lang), w, 0, type);
  const free = h - facts.height - GAP;
  const projection = geoNaturalEarth1();
  projection.fitWidth(w - outline, SPHERE);
  const [tx, ty] = projection.translate();
  projection.translate([tx! + outline / 2, ty! + outline / 2]);
  const path = geoPath(projection);
  const bounds = path.bounds(SPHERE);
  const mapH = bounds[1][1] - bounds[0][1] + outline;
  const top = Math.max(0, (free - mapH) / 2);
  const coast = thickPath(path({ type: "MultiLineString", coordinates: continentLines(MIN_ISLAND_SR) }) ?? "", outline * 0.4, outline * 3.5);
  const frame = path(SPHERE) ?? "";
  const inside = (box: Box): boolean => box.x0 >= 0 && box.x1 <= w && box.y0 >= bounds[0][1] && box.y1 <= bounds[1][1] + outline;
  const words = names(projection, lang, type, inside, (place) => place.mapAt ?? place.at, true);
  const label = TITLES.map(lang);
  const picture = `<path d="${frame}" fill="none" stroke="#000" stroke-width="${outline}" stroke-linejoin="round" data-rim=""/><path d="${coast}" fill="none" stroke="#000" stroke-width="${outline}" stroke-linecap="round" stroke-linejoin="round" data-coast=""/>${words}`;
  return `${svgOpen(w, h, label, "map")}<g transform="translate(0 ${top})">${picture}</g><g transform="translate(0 ${h - facts.height})">${facts.markup}</g></svg>`;
}

