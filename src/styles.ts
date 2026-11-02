// The two looks the globe is drawn in, the same line colours as hako-devices and uchusen-rockets: one table entry each,
// a look changes lines and fills, never the geometry. Pure.

/**
 * The lines and fills of one look: colours and widths only, never the geometry.
 *
 * @example
 * ```ts
 * import { STYLES, type Style } from "@johnmorrisdotca/chikyu-earth";
 *
 * const thick: Style = STYLES.thick;
 * console.log(thick.outline, thick.line);
 * ```
 */
export interface Style {
  /** The colour of the outlines and the rim. */
  line: string;
  /** The disc of ocean. */
  ocean: string;
  /** The fill under a country's outline. */
  land: string;
  /** Country outline width, in SVG units. */
  outline: number;
  /** Rim width, in SVG units. */
  horizon: number;
  /** Graticule width, in SVG units. */
  graticule: number;
}

/**
 * The looks the globe is drawn in, by name: `line` (thin outlines) and `thick`.
 *
 * @example
 * ```ts
 * import { STYLES } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(Object.keys(STYLES), STYLES.line.ocean);
 * ```
 */
export const STYLES = {
  line: { line: "#8fa1b8", ocean: "#0b1424", land: "#13203a", outline: 0.5, horizon: 1, graticule: 0.3 },
  thick: { line: "#b4c2d4", ocean: "#0b1424", land: "#1a2b47", outline: 1.2, horizon: 2, graticule: 0.5 },
} as const satisfies Record<string, Style>;

/**
 * The name of a look: `"line"` or `"thick"`.
 *
 * @example
 * ```ts
 * import { globe, type StyleName } from "@johnmorrisdotca/chikyu-earth";
 *
 * const look: StyleName = "thick";
 * console.log(globe({ style: look, size: 100 }).includes("stroke-width"));
 * ```
 */
export type StyleName = keyof typeof STYLES;
/**
 * The style a drawing is in when none is named.
 *
 * @example
 * ```ts
 * import { DEFAULT_STYLE } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(DEFAULT_STYLE);
 * ```
 */
export const DEFAULT_STYLE: StyleName = "line";
/**
 * Every style's name, in the order they are listed.
 *
 * @example
 * ```ts
 * import { STYLE_NAMES } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(STYLE_NAMES.join(", "));
 * ```
 */
export const STYLE_NAMES = Object.keys(STYLES) as StyleName[];

/**
 * A value from outside (an attribute, a query parameter) as a style's name: the default for anything else.
 *
 * @param value - Anything.
 * @returns A valid style name; {@link DEFAULT_STYLE} when `value` names none.
 *
 * @example
 * ```ts
 * import { cleanStyle } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(cleanStyle("thick"), cleanStyle("neon"), cleanStyle(null));
 * ```
 */
export const cleanStyle = (value: unknown): StyleName =>
  typeof value === "string" && Object.hasOwn(STYLES, value) ? (value as StyleName) : DEFAULT_STYLE;
