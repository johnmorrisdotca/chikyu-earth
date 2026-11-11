// The look of the names on the sky, as chikyu-earth's own type: the same fields as hoshi-stars' `LabelStyle` (an optional peer), written out here so the package's types never import a package a page may not have installed. A drift check in `host.ts` keeps the two the same.

/**
 * The look of a name drawn on the sky (the property `skyStyle` of `<chikyu-space>` and `<chikyu-earth-realistic>` takes any part of it): font, size, weight, colour, outline, case, letter spacing, the leader line, the ring round a star and the catalogue letter under the name. These are
 * hoshi-stars' `LabelStyle`, with the same defaults and ranges, written out so a page without hoshi-stars installed still type-checks.
 *
 * @example
 * ```ts
 * import type { SkyLabelStyle } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const look: Partial<SkyLabelStyle> = { size: 12, colour: "#ffe9b0", case: "as-written", ring: 0 };
 * console.log(Object.keys(look).join(" "));
 * ```
 */
export interface SkyLabelStyle {
    /** The font family, as CSS writes it. `Michroma, system-ui, sans-serif` by default: Michroma is the family's font for a name on a body, and the page loads it (kazoku-ui's `loadBodyLabelFont`); until it is in, the next family is used. */
    font: string;
    /** The text size in pixels, 6 to 48. 11 by default. */
    size: number;
    /** The font weight, 100 to 900. 400 by default. */
    weight: number;
    /** The text colour, any CSS colour. A quiet white by default. */
    colour: string;
    /** The colour of the outline round the letters that keeps them readable over stars, any CSS colour, or `none` for no outline. A dark blue by default. */
    halo: string;
    /** The width of that outline in pixels, 0 to 12. 3 by default. */
    haloWidth: number;
    /** `small-caps` writes the name in small capitals (the page draws it with CSS `font-variant: small-caps`), `as-written` keeps it as it is, `upper` and `lower` change the case (Japanese is not changed by any). `small-caps` by default. */
    case: "small-caps" | "as-written" | "upper" | "lower";
    /** The space added between letters, in em, -0.1 to 1. 0.14 by default. */
    letterSpacing: number;
    /** The length in pixels of a short line from the star to its name, 0 to 80, or 0 for no line and the name set beside the star. 0 by default. */
    leader: number;
    /** The colour of that line, any CSS colour. A quiet blue-white by default. */
    leaderColour: string;
    /** The gap in pixels between the ring round a star (or the star) and its name (or its line), 0 to 40. 4 by default. */
    offset: number;
    /** The radius in pixels of a thin ring drawn round each named star, 0 to 30, or 0 for no ring. 6 by default. */
    ring: number;
    /** The colour of the ring, any CSS colour. A quiet blue-white by default. */
    ringColour: string;
    /** The line width of the ring in pixels, 0.25 to 4. 0.75 by default. */
    ringWidth: number;
    /** `below` writes the star's catalogue letter (`α Ori`) in small type under its name; `none` leaves it out. A star with no Bayer letter or Flamsteed number has none to write. `below` by default. */
    designation: "below" | "none";
    /** The font family of that line. A small monospace by default. */
    designationFont: string;
    /** Its size in pixels, 6 to 24. 9 by default. */
    designationSize: number;
    /** Its colour, any CSS colour. A quieter white by default. */
    designationColour: string;
}
