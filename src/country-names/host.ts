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

/** Which layer a host is: the countries' names, or the regions' (`region-names`), whose shapes arrive a country at a time from the borders. */
export interface NamesLayer {
  /** The attribute that switches the layer on. */
  attribute: string;
  /** The id of the layer's box in the shadow root. */
  id: string;
  /** The class of each name. */
  className: string;
  /** The word in the style variables, `--chikyu-<word>-font` and the rest. */
  word: string;
  /** Whether English names are written in capitals. */
  capitals: boolean;
  /** The names' smallest and largest size in pixels when the page gives none. */
  sizes: { smallest: number; largest: number };
  /** The shapes are handed in with `add`, a few at a time, and nothing is loaded here. */
  incremental: boolean;
}

const COUNTRY_LAYER: NamesLayer = { attribute: "country-names", id: "co-names", className: "co-name", word: "country", capitals: true, sizes: { smallest: 10, largest: 16 }, incremental: false };

/** The styles of one layer: its own variables first, the countries' after them where it has none of its own. */
export const namesStyle = (layer: NamesLayer, weight: number): string => {
  const own = (name: string, fallback: string): string => (layer.word === "country" ? `var(--chikyu-country-${name},${fallback})` : `var(--chikyu-${layer.word}-${name},var(--chikyu-country-${name},${fallback}))`);
  const halo = own("halo", "#140c00");
  const width = `calc(${own("halo-width", "3")} * 1px)`;
  return (
    `#${layer.id}{position:absolute;inset:0;overflow:hidden;pointer-events:none}` +
    `.${layer.className}{position:absolute;left:0;top:0;margin:0;white-space:nowrap;text-align:center;pointer-events:none;will-change:transform;letter-spacing:${COUNTRY_LETTER_SPACING}em;` +
    `font-family:${own("font", "system-ui,-apple-system,'Segoe UI',sans-serif")};font-weight:${own("weight", String(weight))};color:${own("colour", "rgba(255,244,214,.92)")};` +
    `text-shadow:0 0 ${width} ${halo},0 0 ${width} ${halo}}.${layer.className}[hidden]{display:none}`
  );
};

/** The styles of the layer, for an element to add to its own (`#co-names` and the names in its shadow root). */
export const COUNTRY_NAMES_STYLE = namesStyle(COUNTRY_LAYER, 600);

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
  /** Which layer this is: the countries' when left out. */
  layer?: NamesLayer;
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
  /** Hands in more shapes to name (an incremental layer's): the layer is laid out again. */
  add(shapes: readonly NamedShape[]): void;
  /** Tells where the Earth is in the picture just drawn (or `null` when there is no Earth to name), and the boxes other names use there. */
  frame(frame: CountryFrame | null, taken?: readonly { left: number; top: number; width: number; height: number }[]): void;
  /** Reads the attribute and the language again after either changed. */
  refresh(): void;
  /** The look of the names (the property `countryNamesStyle`). */
  setStyle(style: CountryNamesStyle): void;
  /** The names shown at the last draw. */
  readonly shown: readonly CountryName[];
  /** The boxes the names shown take (the same names, for the layers laid out after this one to keep clear of). */
  readonly boxes: readonly { left: number; top: number; width: number; height: number }[];
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
  const layer = options.layer ?? COUNTRY_LAYER;
  let spots: CountrySpots | null = layer.incremental ? { countries: [] } : null;
  let asked = false;
  let failed = false;
  let last: CountryFrame | null = null;
  let taken: readonly { left: number; top: number; width: number; height: number }[] = [];
  let shown: CountryName[] = [];
  let renders = 0;
  let style: CountryNamesStyle = {};
  let box: HTMLElement | undefined;
  const pool: HTMLElement[] = [];
  let max = readCountryNames(options.attribute(layer.attribute));
  let usedLang: "en" | "ja" | undefined;
  // set by `dispose`: an outline load that finishes after it is ignored, so it makes no box and tells no one
  let disposed = false;

  const attach = (): void => {
    if (box) return;
    box = doc.createElement("div");
    box.id = layer.id;
    box.setAttribute("aria-hidden", "true");
    // under the other names: the city names' box, when it is there, comes after this one (and the regions' under the countries')
    const after = (layer.word === "country" ? null : root.getElementById("co-names")) ?? root.getElementById("cn-canvas");
    if (after) root.insertBefore(box, after);
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
    set(`--chikyu-${layer.word}-font`, style.font);
    set(`--chikyu-${layer.word}-weight`, style.weight);
    set(`--chikyu-${layer.word}-colour`, style.colour);
    set(`--chikyu-${layer.word}-halo`, style.halo);
    set(`--chikyu-${layer.word}-halo-width`, style.haloWidth);
  }

  /** The width and height of a name in the font it is drawn in: a canvas set to the layer's own font and weight, so a fallback font with wider letters or taller lines is measured as it is. */
  let ruler: CanvasRenderingContext2D | null | undefined;
  const measurer = (): ((text: string, size: number) => { width: number; height: number }) | undefined => {
    if (ruler === undefined) ruler = doc.createElement("canvas").getContext?.("2d") ?? null;
    const context = ruler;
    if (!context || typeof context.measureText !== "function") return undefined;
    const host = root.host ? getComputedStyle(root.host) : undefined;
    const read = (name: string): string => host?.getPropertyValue(`--chikyu-${layer.word}-${name}`).trim() || host?.getPropertyValue(`--chikyu-country-${name}`).trim() || "";
    const family = style.font ?? (read("font") || "system-ui, -apple-system, 'Segoe UI', sans-serif");
    const weight = style.weight ?? (read("weight") || (layer.word === "country" ? 600 : 500));
    return (text, size) => {
      context.font = `${weight} ${size}px ${family}`;
      const metrics = context.measureText(text);
      const ink = (metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0);
      const line = (metrics.fontBoundingBoxAscent ?? 0) + (metrics.fontBoundingBoxDescent ?? 0);
      return { width: metrics.width + [...text].length * size * COUNTRY_LETTER_SPACING, height: Math.max(ink + 2, line) };
    };
  };

  const ensure = (): void => {
    if (asked || layer.incremental) return;
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
        if (disposed) return;
        spots = countrySpots(shapes);
        compute();
      },
      (error: unknown) => {
        if (disposed) return;
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
    shown = layoutCountryNames(spots, frame, usedLang, { max, smallest: style.smallest ?? layer.sizes.smallest, largest: style.largest ?? layer.sizes.largest, taken, measure: measurer(), capitals: layer.capitals });
    place();
  }

  function place(): void {
    if (!box) return;
    renders += 1;
    while (pool.length < Math.min(COUNTRY_NAMES_MAX, shown.length)) {
      const name = doc.createElement("span");
      name.className = layer.className;
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
    add(shapes) {
      if (disposed) return;
      spots = { countries: [...(spots?.countries ?? []), ...countrySpots({ features: shapes }).countries] };
      compute();
    },
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
      max = readCountryNames(options.attribute(layer.attribute));
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
    get boxes() {
      return shown;
    },
    get stats() {
      return { on: max !== null, max: max ?? 0, countries: spots?.countries.length ?? 0, names: shown.length, renders, failed };
    },
    dispose() {
      disposed = true;
      doc.removeEventListener("kazoku-languagechange", onLanguage);
      doc.fonts?.removeEventListener?.("loadingdone", onFonts);
      box?.remove();
      box = undefined;
      pool.length = 0;
      shown = [];
    },
  };
}
