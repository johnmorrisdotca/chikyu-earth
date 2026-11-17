// The colours of the flat map: one for each group of the package, and twelve for the orbital planes of a group. Chosen for a dark sea; each is read against the map's own colours.

/**
 * The colour of each of the package's satellite groups, the same as the demo draws them, for a dark map.
 *
 * @example
 * ```ts
 * import { GROUP_COLOURS } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(GROUP_COLOURS["gps"]);
 * ```
 */
export const GROUP_COLOURS: Readonly<Record<string, string>> = {
  stations: "#ffd54f",
  famous: "#ff8a65",
  science: "#b39ddb",
  "earth-observation": "#69f0ae",
  weather: "#4dd0e1",
  geostationary: "#f48fb1",
  gps: "#ffb74d",
  glonass: "#ef5350",
  galileo: "#64b5f6",
  beidou: "#fff176",
  amateur: "#aed581",
  oneweb: "#ce93d8",
  iridium: "#80cbc4",
  starlink: "#7fd4ff",
};

/**
 * The colours of the planes of a group, in order: `A` is the first, and the twelfth is followed by the first again.
 *
 * @example
 * ```ts
 * import { PLANE_COLOURS } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(PLANE_COLOURS.length, PLANE_COLOURS[0]);
 * ```
 */
export const PLANE_COLOURS: readonly string[] = ["#ff7a59", "#ffd23f", "#6ee7a0", "#4cc9f0", "#a78bfa", "#ff9ecb", "#f4a261", "#b8e986", "#5eead4", "#7aa2ff", "#e879f9", "#fde68a"];

/**
 * The grey of the satellites that are in no plane.
 *
 * @example
 * ```ts
 * import { SPARE_COLOUR } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(SPARE_COLOUR);
 * ```
 */
export const SPARE_COLOUR = "#9aa5b1";

/**
 * The colour of a ground track where the satellite is in sunlight: a warm amber. It is one half of a pair chosen to be told apart by a reader who cannot tell red from green (amber and blue differ in lightness as well as in hue), and each stretch is drawn over a dark edge so it reads on a dark sea and on a light one. The element's `--chikyu-flat-track-sun` overrides it.
 *
 * @example
 * ```ts
 * import { TRACK_SUNLIT } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(TRACK_SUNLIT);
 * ```
 */
export const TRACK_SUNLIT = "#ffb02e";

/**
 * The colour of a ground track where the satellite is in the Earth's shadow: a cool blue. The element's `--chikyu-flat-track-shadow` overrides it.
 *
 * @example
 * ```ts
 * import { TRACK_SHADOW } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * console.log(TRACK_SHADOW);
 * ```
 */
export const TRACK_SHADOW = "#5aa9ff";
