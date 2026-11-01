// The two looks the globe is drawn in, the same line colours as hako-devices and uchusen-rockets: one table entry each,
// a look changes lines and fills, never the geometry. Pure.

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

export const STYLES = {
  line: { line: "#8fa1b8", ocean: "#0b1424", land: "#13203a", outline: 0.5, horizon: 1, graticule: 0.3 },
  thick: { line: "#b4c2d4", ocean: "#0b1424", land: "#1a2b47", outline: 1.2, horizon: 2, graticule: 0.5 },
} as const satisfies Record<string, Style>;

export type StyleName = keyof typeof STYLES;
/** The style a drawing is in when none is named. */
export const DEFAULT_STYLE: StyleName = "line";
export const STYLE_NAMES = Object.keys(STYLES) as StyleName[];

/** A value from outside as a style's name: the default for anything else. */
export const cleanStyle = (value: unknown): StyleName =>
  typeof value === "string" && Object.hasOwn(STYLES, value) ? (value as StyleName) : DEFAULT_STYLE;
