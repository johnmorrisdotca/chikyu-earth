// The "my country" sheet: the country's outline, big and thick, its capital marked with a star, a box to draw its flag in and three facts. Pure: a string of SVG measured in millimetres.
import { geoAzimuthalEqualArea, geoCentroid, geoPath } from "d3-geo";
import { countryShape } from "./land.ts";
import { thickPath } from "./outline.ts";
import { TITLES, SAY, countryFacts } from "./text.ts";
import { TYPES, esc, factsBlock, haloText, innerMm, labelMm, outlineMm, svgOpen, textWidth, wrap, type Block, type Lang } from "./common.ts";
import type { SheetOptions } from "./earth.ts";

/**
 * A capital city: its name, as the sheet says it in each language, and where it is.
 *
 * @example
 * ```ts
 * import { type Capital } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const tokyo: Capital = { name: "Tokyo", ja: "東京", lon: 139.69, lat: 35.69 };
 * console.log(tokyo.name);
 * ```
 */
export interface Capital {
  name: string;
  /** The Japanese name, when it has one. */
  ja?: string;
  lon: number;
  lat: number;
}

/**
 * What a "my country" sheet is drawn for: the room, the language and the type, and the capital.
 *
 * @example
 * ```ts
 * import { countrySheetSvg, type CountryOptions } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const options: CountryOptions = { widthMm: 184.6, heightMm: 170, capital: { name: "Paris", lon: 2.35, lat: 48.86 } };
 * console.log(countrySheetSvg("FR", options)?.includes("Paris"));
 * ```
 */
export interface CountryOptions extends SheetOptions {
  /** The capital, to put a star on it and say its name; without it the sheet asks the child to find it. */
  capital?: Capital;
}

const GAP = 5;

/** A five-pointed star centred on `x`, `y`, `outer` from the middle to a point. */
function star(x: number, y: number, outer: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : outer * 0.42;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(x + radius * Math.cos(angle)).toFixed(2)},${(y + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/**
 * A "my country" colouring sheet: the country's outline as big as the room allows (an equal-area view centred on the country, with a far territory such as French Guiana left out), its capital as a star when `capital` is given, a box to draw the flag in, and three facts:
 * the continent, the countries it touches, the capital. The flag is a box to fill in, never a picture: the sheet carries no flag.
 * @param alpha2 - The country's two-letter code, such as `JP`.
 * @param options - The room, the language, the type and the capital.
 * @returns The `<svg>` markup, or `undefined` when the package has no outline for the code.
 *
 * @example
 * ```ts
 * import { countrySheetSvg } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const svg = countrySheetSvg("JP", { widthMm: 184.6, heightMm: 180, capital: { name: "Tokyo", lon: 139.7, lat: 35.7 } });
 * console.log(svg?.includes("Tokyo"), svg?.includes("Draw the flag!"));
 * ```
 */
export function countrySheetSvg(alpha2: string, options: CountryOptions): string | undefined {
  const shape = countryShape(alpha2);
  if (shape === undefined) return undefined;
  const { widthMm: w, heightMm: h } = options;
  const lang: Lang = options.lang ?? "en";
  const type = options.type ?? "kid";
  const outline = outlineMm(type);
  const flagW = Math.min(58, w * 0.32);
  const factsWidth = w - flagW - 8;
  const capitalName = options.capital === undefined ? undefined : lang === "ja" ? (options.capital.ja ?? options.capital.name) : options.capital.name;
  const facts: Block = factsBlock(countryFacts(shape, capitalName, lang), factsWidth, 0, type);
  const flagH = Math.max(facts.height, 40);
  const strip = Math.max(facts.height, flagH);
  const mapH = h - strip - GAP;
  const centre = geoCentroid(shape.feature);
  const pad = outline + 3;
  const projection = geoAzimuthalEqualArea().rotate([-centre[0], -centre[1]]).fitExtent([[pad, pad], [w - pad, mapH - pad]], shape.feature);
  const path = geoPath(projection);
  const land = thickPath(path(shape.feature) ?? "", outline * 0.3, outline * 1.2);
  let marks = `<path d="${land}" fill="none" stroke="#000" stroke-width="${outline}" stroke-linejoin="round" data-country="${shape.alpha2 ?? ""}"/>`;
  if (options.capital !== undefined) {
    const at = projection([options.capital.lon, options.capital.lat]);
    if (at !== null) {
      const size = labelMm(type);
      const radius = type === "kid" ? 7 : 3.5;
      const toRight = at[0] + radius + 2 + textWidth(capitalName!, size) <= w;
      const x = toRight ? at[0] + radius + 2 : at[0] - radius - 2;
      marks += `<polygon points="${star(at[0], at[1], radius)}" fill="#000" stroke="#fff" stroke-width="${innerMm(type)}" stroke-linejoin="round" paint-order="stroke" data-capital=""/>`;
      marks += haloText(x, at[1] + size * 0.34, size, capitalName!, ' data-capital-name=""', toRight ? "start" : "end");
    }
  }
  const top = mapH + GAP;
  const left = `<g transform="translate(0 ${top + (strip - facts.height) / 2})">${facts.markup}</g>`;
  const bodyMm = TYPES[type].bodyMm;
  const box = `<g transform="translate(${w - flagW} ${top})"><rect x="${outline / 2}" y="${outline / 2}" width="${flagW - outline}" height="${strip - outline}" rx="3" fill="none" stroke="#000" stroke-width="${innerMm(type)}" data-flag-box=""/>${wrap(SAY[lang].flag, flagW - 2 * outline, bodyMm).map((line, i) => `<text x="${flagW / 2}" y="${outline + bodyMm * (0.9 + 1.2 * i)}" font-size="${bodyMm}" font-weight="700" fill="#000" text-anchor="middle" data-flag-say="">${esc(line)}</text>`).join("")}</g>`;
  return `${svgOpen(w, h, TITLES.country(lang === "ja" ? shape.ja : shape.name, lang), "country")}${marks}${left}${box}</svg>`;
}
