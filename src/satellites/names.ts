// The short names of the large satellites the package knows, in each language, for a label or a list: any other satellite is shown under the name in its elements. Pure.

/**
 * The short names of the satellites the package knows by name, by NORAD number, in English and in Japanese: the ISS, Tiangong and Hubble.
 *
 * @example
 * ```ts
 * import { SHORT_NAMES } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(SHORT_NAMES[48274]?.ja);
 * ```
 */
export const SHORT_NAMES: Readonly<Record<number, { en: string; ja: string }>> = {
  25544: { en: "ISS", ja: "ISS" },
  48274: { en: "Tiangong", ja: "天宮" },
  20580: { en: "Hubble", ja: "ハッブル" },
};
