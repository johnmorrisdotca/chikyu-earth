// The line an element shows under its picture while meteors are on, so nobody takes a streak for a meteor that was seen.
/** The line, in the two languages the family's pages are written in. */
export const METEOR_NOTE = {
  en: "Meteor streaks are an illustration. How often they appear, and where, how high and when, follow real data.",
  ja: "流星の光の筋はイメージです。出やすさ、場所、高さ、時期は実際のデータにもとづいています。",
} as const;

/** The styles of the line (`#meteor-note` in an element's shadow root). */
export const METEOR_NOTE_STYLE =
  "#meteor-note{position:absolute;left:8px;bottom:6px;margin:0;font:11px/1.3 system-ui,sans-serif;color:#dfe6f2;background:#0b0e14b3;padding:2px 6px;border-radius:4px;pointer-events:none}#meteor-note[hidden]{display:none}";

/** Put the line right: its words in the language of the element or the page, shown only while meteors are on and `meteors-label` is not `off`. */
export function setMeteorNote(note: HTMLElement | undefined, host: HTMLElement, on: boolean): void {
  if (!note) return;
  const lang = (host.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
  note.textContent = METEOR_NOTE[lang];
  note.lang = lang;
  note.hidden = !on || host.getAttribute("meteors-label") === "off";
}

/** Whether a reader has asked their device for less motion. */
export const prefersLessMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
