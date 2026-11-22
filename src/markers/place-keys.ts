// The keyboard's way to the places in the picture: with the element focused, `P` goes to the next place from the left and `Shift`+`P` to the one before, `Enter` presses the one the ring is on (the same
// `chikyu-place-click` as a press) and `Escape` lets go of it. The ring is drawn by the place layer; the name is said in a live region of the element's own shadow root. Keys the view controls and the ride use are left alone.
import { placeClick, type PlaceLayer } from "./place-layer.ts";
import type { Place } from "./places.ts";

/** The words the keys say, in English and Japanese. `{name}`, `{n}` and `{total}` are filled in. */
const WORDS = {
  en: { at: "{name}, {n} of {total}", unnamed: "Place", hidden: "{name} is not in view", none: "No places in view" },
  ja: { at: "{name}、{total}か所のうち{n}番目", unnamed: "場所", hidden: "{name}は見えていません", none: "見えている場所はありません" },
} as const;

/** What a reader hears for each thing the keys do, in a language. */
export const placeKeyWords = (lang: "en" | "ja", key: keyof (typeof WORDS)["en"], values: { name?: string; n?: number; total?: number } = {}): string =>
  WORDS[lang][key].replace("{name}", values.name ?? "").replace("{n}", String(values.n ?? "")).replace("{total}", String(values.total ?? ""));

const nameOf = (place: Place, lang: "en" | "ja"): string => place.label || place.id || placeKeyWords(lang, "unnamed");

/** What `bindPlaceKeys` gives back. */
export interface PlaceKeys {
  /** Call when the places change: an element with places is a `group` (a screen reader skips what is inside an `img`), one without is the `img` it was. */
  sync(count: number): void;
  stop(): void;
}

/**
 * Bind the place keys to an element.
 *
 * @param host - The focused element.
 * @param layer - Its place layer, read at each key.
 * @param live - A live region of its shadow root (`#place-live`), written with each place's name.
 * @param language - The language of the words, read at each key.
 * @param ownsRole - Whether the element set its own `role="img"` (the page's own `role` is left alone).
 * @returns The binding.
 */
export function bindPlaceKeys(host: HTMLElement, layer: () => PlaceLayer | undefined, live: () => HTMLElement | null, language: () => "en" | "ja", ownsRole: boolean): PlaceKeys {
  const say = (text: string): void => {
    const region = live();
    if (!region) return;
    region.lang = language();
    region.textContent = text === region.textContent ? `${text}${String.fromCharCode(0x200b)}` : text;
  };
  const key = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    const places = layer();
    // while the context is lost nothing is drawn and the names are hidden: the keys wait for the view
    if (!places || host.dataset["state"] === "lost") return;
    // typing in a field anywhere on the way to this element, or in editable text, is typing
    if (event.composedPath().some((node) => node instanceof HTMLElement && (node.matches("input, textarea, select") || node.isContentEditable))) return;
    const lang = language();
    if (event.key === "p" || event.key === "P") {
      const moved = places.step(event.shiftKey ? -1 : 1);
      say(moved ? placeKeyWords(lang, "at", { name: nameOf(moved.place, lang), n: moved.position, total: moved.total }) : placeKeyWords(lang, "none"));
      event.preventDefault();
    } else if (event.key === "Enter" && places.current && !event.repeat) {
      const at = places.where(places.current);
      if (at) host.dispatchEvent(new CustomEvent("chikyu-place-click", { detail: placeClick(places.current, at.x, at.y), bubbles: true, composed: true }));
      else say(placeKeyWords(lang, "hidden", { name: nameOf(places.current, lang) }));
      event.preventDefault();
    } else if (event.key === "Escape" && places.current) {
      places.current = null;
      say("");
      event.preventDefault();
    }
  };
  const leave = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return;
    const places = layer();
    if (places?.current) places.current = null;
  };
  host.addEventListener("keydown", key);
  host.addEventListener("focusout", leave);
  let grouped = false;
  return {
    sync(count) {
      if (!ownsRole) return;
      if (count > 0 && !grouped && host.getAttribute("role") === "img") {
        grouped = true;
        host.setAttribute("role", "group");
      } else if (count === 0 && grouped && host.getAttribute("role") === "group") {
        grouped = false;
        host.setAttribute("role", "img");
      }
    },
    stop() {
      host.removeEventListener("keydown", key);
      host.removeEventListener("focusout", leave);
      if (grouped && host.getAttribute("role") === "group") host.setAttribute("role", "img");
      grouped = false;
    },
  };
}
