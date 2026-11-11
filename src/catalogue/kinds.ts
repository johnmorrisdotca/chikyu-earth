// What kind of object a catalogue entry is, the class of its orbit, and how each is coloured and named. Pure: no DOM, no data.

/**
 * What a catalogued object is: `PAY` a payload (a satellite or probe), `RB` a rocket body, `DEB` debris, `UNK` unknown.
 *
 * @example
 * ```ts
 * import type { ObjectKind } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const kind: ObjectKind = "RB";
 * console.log(kind);
 * ```
 */
export type ObjectKind = "PAY" | "RB" | "DEB" | "UNK";

/**
 * The four kinds, in the order a legend lists them.
 *
 * @example
 * ```ts
 * import { OBJECT_KINDS } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(OBJECT_KINDS.join(" "));
 * ```
 */
export const OBJECT_KINDS: readonly ObjectKind[] = ["PAY", "RB", "DEB", "UNK"];

/**
 * The kind a source's object type means: Space-Track says `PAYLOAD`, `ROCKET BODY`, `DEBRIS` or `TBA`, other lists say `PAY`, `R/B`, `DEB` or `UNK`; any other word, or none, is `UNK`.
 *
 * @param value - The source's object type, in any case.
 * @returns The kind.
 *
 * @example
 * ```ts
 * import { readKind } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(readKind("PAYLOAD"), readKind("R/B"), readKind("debris"), readKind("TBA"), readKind(undefined));
 * ```
 */
export function readKind(value: string | null | undefined): ObjectKind {
  const word = (value ?? "").trim().toUpperCase();
  if (word === "PAYLOAD" || word === "PAY") return "PAY";
  if (word === "ROCKET BODY" || word === "R/B" || word === "RB") return "RB";
  if (word === "DEBRIS" || word === "DEB") return "DEB";
  return "UNK";
}

/**
 * The words for each kind, in English and Japanese.
 *
 * @example
 * ```ts
 * import { KIND_LABELS } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(KIND_LABELS.DEB.en, KIND_LABELS.DEB.ja);
 * ```
 */
export const KIND_LABELS: Readonly<Record<ObjectKind, { en: string; ja: string }>> = {
  PAY: { en: "Payloads", ja: "人工衛星" },
  RB: { en: "Rocket bodies", ja: "ロケット本体" },
  DEB: { en: "Debris", ja: "デブリ" },
  UNK: { en: "Unknown", ja: "種類不明" },
};

/**
 * The class of an orbit: low (`leo`), medium (`meo`), geostationary (`geo`), highly elliptical (`heo`), or `other` for what fits none of them.
 *
 * @example
 * ```ts
 * import type { OrbitClass } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const value: OrbitClass = "geo";
 * console.log(value);
 * ```
 */
export type OrbitClass = "leo" | "meo" | "geo" | "heo" | "other";

/**
 * The five classes, in the order a legend lists them.
 *
 * @example
 * ```ts
 * import { ORBIT_CLASSES } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(ORBIT_CLASSES.join(" "));
 * ```
 */
export const ORBIT_CLASSES: readonly OrbitClass[] = ["leo", "meo", "geo", "heo", "other"];

/**
 * The words for each class, in English and Japanese, with the rule that makes it (heights above the mean Earth radius).
 *
 * @example
 * ```ts
 * import { CLASS_LABELS } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(CLASS_LABELS.leo.en, "|", CLASS_LABELS.leo.rule);
 * ```
 */
export const CLASS_LABELS: Readonly<Record<OrbitClass, { en: string; ja: string; rule: string }>> = {
  leo: { en: "Low orbit", ja: "低軌道", rule: "highest point under 2,000 km" },
  meo: { en: "Medium orbit", ja: "中軌道", rule: "lowest point 2,000 km or more, highest point under 34,286 km" },
  geo: { en: "Geostationary", ja: "静止軌道", rule: "35,786 km, within 1,500 km, nearly circular" },
  heo: { en: "Highly elliptical", ja: "高楕円軌道", rule: "eccentricity 0.25 or more" },
  other: { en: "Other", ja: "その他", rule: "none of the above (above the geostationary belt, or between the classes)" },
};

/**
 * The colour of each class on a dark background: green, yellow, red, violet and grey.
 *
 * @example
 * ```ts
 * import { CLASS_COLOURS } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(CLASS_COLOURS.geo);
 * ```
 */
export const CLASS_COLOURS: Readonly<Record<OrbitClass, string>> = { leo: "#5dd6a2", meo: "#ffd166", geo: "#ef476f", heo: "#b388eb", other: "#9aa5b1" };

/**
 * The colour of each kind on a dark background: cyan payloads, orange rocket bodies, grey debris and pale unknowns.
 *
 * @example
 * ```ts
 * import { KIND_COLOURS } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(KIND_COLOURS.RB);
 * ```
 */
export const KIND_COLOURS: Readonly<Record<ObjectKind, string>> = { PAY: "#4cc9f0", RB: "#ff8c42", DEB: "#9aa5b1", UNK: "#e6e6e6" };

/**
 * One line of a legend: what it is called, in the page's language, and its colour.
 *
 * @example
 * ```ts
 * import type { LegendEntry } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const entry: LegendEntry = { key: "leo", label: "Low orbit", colour: "#5dd6a2" };
 * console.log(entry.label);
 * ```
 */
export interface LegendEntry {
  key: string;
  label: string;
  colour: string;
}

/**
 * The legend for colouring by class or by kind, in the page's language.
 *
 * @param by - `class` or `kind`.
 * @param lang - `en` or `ja`.
 * @returns One entry for each class or kind, in the legend's order.
 *
 * @example
 * ```ts
 * import { legend } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(legend("class", "en").map((one) => `${one.label} ${one.colour}`).join(", "));
 * console.log(legend("kind", "ja")[2]?.label);
 * ```
 */
export function legend(by: "class" | "kind", lang: "en" | "ja"): LegendEntry[] {
  if (by === "class") return ORBIT_CLASSES.map((key) => ({ key, label: CLASS_LABELS[key][lang], colour: CLASS_COLOURS[key] }));
  return OBJECT_KINDS.map((key) => ({ key, label: KIND_LABELS[key][lang], colour: KIND_COLOURS[key] }));
}
