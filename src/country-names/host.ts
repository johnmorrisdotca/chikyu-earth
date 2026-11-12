// The names of the countries on the Earth, over the picture of an element (chizu's `world-geo`, loaded only when `country-names` is set). The element tells this where the Earth is at each draw
// and which boxes other names use (`frame`); it lays the names out as a few labels and draws nothing at rest.
import { COUNTRY_LETTER_SPACING, COUNTRY_NAMES_MAX, countrySpots, layoutCountryNames, readCountryNames, type CountryFrame, type CountryName, type CountrySpots, type NamedShape } from "./geometry.ts";

/**
 * The look of the country names, all optional: the text's font, weight and colour, the outline round it, and the smallest and largest size in pixels.
 *
 * @example
 * ```ts
 * import type { CountryNamesStyle } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const look: CountryNamesStyle = { font: "Georgia, serif", colour: "#fff3d6", halo: "#1a1000", smallest: 11, largest: 18 };
 * console.log(Object.keys(look).join(" "));
 * ```
 */
export interface CountryNamesStyle {
  font?: string;
  weight?: number | string;
  colour?: string;
  halo?: string;
  haloWidth?: number;
  smallest?: number;
  largest?: number;
}

/** The styles of the layer, for an element to add to its own (`#co-names` and the names in its shadow root). */
export const COUNTRY_NAMES_STYLE =
  "#co-names{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  `.co-name{position:absolute;left:0;top:0;margin:0;white-space:nowrap;text-align:center;pointer-events:none;will-change:transform;letter-spacing:${COUNTRY_LETTER_SPACING}em;` +
  "font-family:var(--chikyu-country-font,system-ui,-apple-system,'Segoe UI',sans-serif);font-weight:var(--chikyu-country-weight,600);color:var(--chikyu-country-colour,rgba(255,244,214,.92));" +
  "text-shadow:0 0 calc(var(--chikyu-country-halo-width,3) * 1px) var(--chikyu-country-halo,#140c00),0 0 calc(var(--chikyu-country-halo-width,3) * 1px) var(--chikyu-country-halo,#140c00)}.co-name[hidden]{display:none}";

const DEFAULTS = { smallest: 10, largest: 16 } as const;

/** What an element tells the layer about the page. */
export interface CountryHostOptions {
  /** Reads one of the element's attributes. */
  attribute(name: string): string | null;
  /** The page's language, `en` or `ja`. */
  language(): "en" | "ja";
  /** The shadow root the layer is made in. */
  root: ShadowRoot;
  /** Told when the outlines could not be loaded. */
  onError(error: unknown): void;
  /** Loads the outlines with their names: chizu's `world-geo` by default. */
  load?(): Promise<{ features: readonly NamedShape[] }>;
}

/**
 * What the country names did: whether `country-names` is set and the most it asks for, the countries loaded, the names shown at the last draw, how many times the layer was laid out, and
 * whether the outlines could not be loaded.
 *
 * @example
 * ```ts no-run
 * import type { CountryNamesStats } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const none: CountryNamesStats = { on: false, max: 0, countries: 0, names: 0, renders: 0, failed: false };
 * console.log(none);
 * ```
 */
export interface CountryNamesStats {
  on: boolean;
  max: number;
  countries: number;
  names: number;
  renders: number;
  failed: boolean;
}

export interface CountryHost {
  /** Tells where the Earth is in the picture just drawn (or `null` when there is no Earth to name), and the boxes other names use there. */
  frame(frame: CountryFrame | null, taken?: readonly { left: number; top: number; width: number; height: number }[]): void;
  /** Reads the attribute and the language again after either changed. */
  refresh(): void;
  /** The look of the names (the property `countryNamesStyle`). */
  setStyle(style: CountryNamesStyle): void;
  /** The names shown at the last draw. */
  readonly shown: readonly CountryName[];
  readonly stats: CountryNamesStats;
  dispose(): void;
}

const worldGeo = async (): Promise<{ features: readonly NamedShape[] }> => (await import("@johnmorrisdotca/chizu/world-geo")).default as unknown as { features: readonly NamedShape[] };

/**
 * Makes the layer of one element, inside its shadow root. Nothing is loaded, and nothing is added to the root, until `country-names` is there.
 *
 * @param options - The attribute reader, the language and the shadow root.
 * @returns The host.
 */
export function createCountryHost(options: CountryHostOptions): CountryHost {
  const { root } = options;
  const doc = root.ownerDocument;
  let spots: CountrySpots | null = null;
  let asked = false;
  let failed = false;
  let last: CountryFrame | null = null;
  let taken: readonly { left: number; top: number; width: number; height: number }[] = [];
  let shown: CountryName[] = [];
  let renders = 0;
  let style: CountryNamesStyle = {};
  let box: HTMLElement | undefined;
  const pool: HTMLElement[] = [];
  let max = readCountryNames(options.attribute("country-names"));
  let usedLang: "en" | "ja" | undefined;

  const attach = (): void => {
    if (box) return;
    box = doc.createElement("div");
    box.id = "co-names";
    box.setAttribute("aria-hidden", "true");
    // under the other names: the city names' box, when it is there, comes after this one
    const cities = root.getElementById("cn-canvas");
    if (cities) root.insertBefore(box, cities);
    else root.append(box);
    vars();
  };

  const clear = (): void => {
    for (const name of pool) name.hidden = true;
    shown = [];
  };

  function vars(): void {
    if (!box) return;
    const set = (name: string, value: string | number | undefined): void => {
      if (value === undefined) box!.style.removeProperty(name);
      else box!.style.setProperty(name, String(value));
    };
    set("--chikyu-country-font", style.font);
    set("--chikyu-country-weight", style.weight);
    set("--chikyu-country-colour", style.colour);
    set("--chikyu-country-halo", style.halo);
    set("--chikyu-country-halo-width", style.haloWidth);
  }

  /** The width and height of a name in the font it is drawn in: a canvas set to the layer's own font and weight, so a fallback font with wider letters or taller lines is measured as it is. */
  let ruler: CanvasRenderingContext2D | null | undefined;
  const measurer = (): ((text: string, size: number) => { width: number; height: number }) | undefined => {
    if (ruler === undefined) ruler = doc.createElement("canvas").getContext?.("2d") ?? null;
    const context = ruler;
    if (!context || typeof context.measureText !== "function") return undefined;
    const host = root.host ? getComputedStyle(root.host) : undefined;
    const family = style.font ?? (host?.getPropertyValue("--chikyu-country-font").trim() || "system-ui, -apple-system, 'Segoe UI', sans-serif");
    const weight = style.weight ?? (host?.getPropertyValue("--chikyu-country-weight").trim() || 600);
    return (text, size) => {
      context.font = `${weight} ${size}px ${family}`;
      const metrics = context.measureText(text);
      const ink = (metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0);
      const line = (metrics.fontBoundingBoxAscent ?? 0) + (metrics.fontBoundingBoxDescent ?? 0);
      return { width: metrics.width + [...text].length * size * COUNTRY_LETTER_SPACING, height: Math.max(ink + 2, line) };
    };
  };

  const ensure = (): void => {
    if (asked) return;
    asked = true;
    let loading: Promise<{ features: readonly NamedShape[] }>;
    try {
      loading = (options.load ?? worldGeo)();
    } catch (error) {
      failed = true;
      options.onError(error);
      return;
    }
    loading.then(
      (shapes) => {
        spots = countrySpots(shapes);
        compute();
      },
      (error: unknown) => {
        failed = true;
        options.onError(error);
      },
    );
  };

  function compute(): void {
    const frame = last;
    if (max === null || !frame) return;
    ensure();
    if (!spots) return;
    attach();
    usedLang = options.language();
    shown = layoutCountryNames(spots, frame, usedLang, { max, smallest: style.smallest ?? DEFAULTS.smallest, largest: style.largest ?? DEFAULTS.largest, taken, measure: measurer() });
    place();
  }

  function place(): void {
    if (!box) return;
    renders += 1;
    while (pool.length < Math.min(COUNTRY_NAMES_MAX, shown.length)) {
      const name = doc.createElement("span");
      name.className = "co-name";
      box.append(name);
      pool.push(name);
    }
    for (let i = 0; i < pool.length; i += 1) {
      const name = pool[i]!;
      const one = shown[i];
      if (!one) {
        if (!name.hidden) name.hidden = true;
        continue;
      }
      if (name.textContent !== one.text) name.textContent = one.text;
      const font = `${one.size}px`;
      if (name.style.fontSize !== font) name.style.fontSize = font;
      const line = `${one.height}px`;
      if (name.style.lineHeight !== line) {
        name.style.lineHeight = line;
        name.style.height = line;
      }
      const wide = `${Math.ceil(one.width)}px`;
      if (name.style.width !== wide) name.style.width = wide;
      name.hidden = false;
      name.style.transform = `translate(${Math.round(one.left)}px,${Math.round(one.top)}px)`;
    }
  }

  // the family's chooser tells the document when the page's language changes: the names are written again, though nothing else is drawn
  const onLanguage = (): void =>
    queueMicrotask(() => {
      if (max !== null && last && usedLang !== undefined && usedLang !== options.language()) compute();
    });
  doc.addEventListener("kazoku-languagechange", onLanguage);
  // a font arrives: the names are measured in the font they are drawn in, so they are laid out again
  const onFonts = (): void => {
    if (max !== null && last) compute();
  };
  doc.fonts?.addEventListener?.("loadingdone", onFonts);

  return {
    frame(next, boxes = []) {
      last = next;
      taken = boxes;
      if (max === null) return;
      if (!next) {
        clear();
        return;
      }
      compute();
    },
    refresh() {
      max = readCountryNames(options.attribute("country-names"));
      if (max === null) {
        clear();
        return;
      }
      compute();
    },
    setStyle(next) {
      style = { ...next };
      vars();
      compute();
    },
    get shown() {
      return shown;
    },
    get stats() {
      return { on: max !== null, max: max ?? 0, countries: spots?.countries.length ?? 0, names: shown.length, renders, failed };
    },
    dispose() {
      doc.removeEventListener("kazoku-languagechange", onLanguage);
      doc.fonts?.removeEventListener?.("loadingdone", onFonts);
      box?.remove();
      box = undefined;
      pool.length = 0;
      shown = [];
    },
  };
}
