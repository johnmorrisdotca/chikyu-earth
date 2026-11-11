// The line an element shows under its picture while the clock runs too fast to follow the satellites, so a reader knows the dots are held, not flying.

/** The line, in the two languages the family's pages are written in. */
export const SATELLITE_NOTE = {
  en: "The clock is too fast to follow the satellites: each is shown where it was, placed again once a second.",
  ja: "時計が速すぎて人工衛星を追えないため、1秒ごとに、そのときにいた場所へ置き直して表示しています。",
} as const;

/** Put the line right: its words in the language of the element or the page, shown only while satellites are held (`on`) and `satellites-label` is not `off`. */
export function setSatelliteNote(note: HTMLElement | undefined, host: HTMLElement, on: boolean): void {
  if (!note) return;
  const lang = (host.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
  if (note.textContent !== SATELLITE_NOTE[lang]) note.textContent = SATELLITE_NOTE[lang];
  note.lang = lang;
  note.hidden = !on || host.getAttribute("satellites-label") === "off";
}
