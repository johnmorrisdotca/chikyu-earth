// The line an element shows under its picture while the air is drawn thicker than it is, so nobody takes the ring for the true size of the atmosphere.

/**
 * The line, in the two languages the family's pages are written in; `{n}` is how many times its real thickness the air is drawn.
 *
 * @example
 * ```ts
 * import { AIR_NOTE } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(AIR_NOTE.en.replace("{n}", "3"));
 * ```
 */
export const AIR_NOTE = {
  en: "The air is drawn {n} times its real thickness so it can be seen.",
  ja: "大気は、見やすいように実際の厚さの{n}倍で描いています。",
} as const;

/** The styles of the lines under the picture (`#notes`, with the air's `#air-note` and the meteors' `#meteor-note` in it, one above the other) in an element's shadow root. */
export const NOTES_STYLE =
  "#notes{position:absolute;left:8px;right:8px;bottom:6px;display:flex;flex-direction:column;align-items:flex-start;gap:4px;pointer-events:none}#notes>p{position:static;margin:0;max-width:100%;font:11px/1.3 system-ui,sans-serif;color:#dfe6f2;background:#0b0e14b3;padding:2px 6px;border-radius:4px}#notes>p[hidden]{display:none}";

/** The words of the line for a thickness: a whole number is written plainly, any other with up to one decimal. */
export function airNoteText(lang: "en" | "ja", thickness: number): string {
  return AIR_NOTE[lang].replace("{n}", String(Math.round(thickness * 10) / 10));
}

/** Put the line right: its words in the language of the element or the page, shown only while the air is thicker than it is (`air-thickness` above 1) and `air-label` is not `off`. */
export function setAirNote(note: HTMLElement | undefined, host: HTMLElement, thickness: number): void {
  if (!note) return;
  const lang = (host.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
  note.textContent = airNoteText(lang, thickness);
  note.lang = lang;
  note.hidden = thickness <= 1 || host.getAttribute("air-label") === "off";
}
