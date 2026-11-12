// The names of cities on the Earth, over the picture of an element (kuni's `cities`, loaded only when `city-names` is set, a tier at a time as the Earth grows on the screen). The element tells this where the Earth is at each draw (`frame`);
// it lays the names out, draws the dots on a canvas and the names as a few labels, and draws nothing at rest.
import { canvasRatio } from "../markers/project.ts";
import { CITY_NAMES_MAX, cityRank, cityTiersFor, layoutCities, readCityNames, type CityFrame, type CityName, type CityNameTier, type NamedCity } from "./geometry.ts";

/**
 * The look of the city names, all optional: the text's font, size (pixels), weight and colour, the outline round it, and the dot's colour and radius (pixels).
 *
 * @example
 * ```ts
 * import type { CityNamesStyle } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const look: CityNamesStyle = { font: "Georgia, serif", size: 13, colour: "#ffe9b0", halo: "#201400", dot: "#ffd166", dotSize: 3 };
 * console.log(Object.keys(look).join(" "));
 * ```
 */
export interface CityNamesStyle {
  font?: string;
  size?: number;
  weight?: number | string;
  colour?: string;
  halo?: string;
  haloWidth?: number;
  dot?: string;
  dotSize?: number;
}

/** The styles of the layer, for an element to add to its own (`#cn-canvas`, `#cn-names` and the names in its shadow root). */
export const CITY_NAMES_STYLE =
  "#cn-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#cn-names{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  ".cn-name{position:absolute;left:0;top:0;margin:0;white-space:nowrap;pointer-events:none;will-change:transform;font-family:var(--chikyu-city-font,system-ui,-apple-system,'Segoe UI',sans-serif);font-size:calc(var(--chikyu-city-size,12) * 1px);line-height:1.35;font-weight:var(--chikyu-city-weight,500);color:var(--chikyu-city-colour,#f3f7ff);text-shadow:0 0 calc(var(--chikyu-city-halo-width,3) * 1px) var(--chikyu-city-halo,#06101f),0 0 calc(var(--chikyu-city-halo-width,3) * 1px) var(--chikyu-city-halo,#06101f)}.cn-name[hidden]{display:none}";

const DEFAULTS = { size: 12, dot: 3, dotColour: "#ffd166", haloColour: "#06101f" } as const;

/** What an element tells the layer about the page. */
export interface CityHostOptions {
  /** Reads one of the element's attributes. */
  attribute(name: string): string | null;
  /** The page's language, `en` or `ja`. */
  language(): "en" | "ja";
  /** The shadow root the layer is made in. */
  root: ShadowRoot;
  /** Told when a tier of cities could not be loaded (kuni is not installed, or the file did not arrive). */
  onError(error: unknown): void;
  /** Loads kuni's cities; the page's own copy when it has one (the property is for tests and for pages that bundle their own). */
  load?(tier: CityNameTier): Promise<readonly NamedCity[]>;
  /** Told when the names were laid out again between draws (a tier arrived, the language or a font changed), so names that keep clear of these can be laid out again. */
  onLayout?(): void;
}

export interface CityHost {
  /** Tells where the Earth is in the picture just drawn, or `null` when there is no Earth to name. */
  frame(frame: CityFrame | null): void;
  /** Reads the attribute and the language again after either changed. */
  refresh(): void;
  /** The look of the names (the property `cityNamesStyle`). */
  setStyle(style: CityNamesStyle): void;
  readonly stats: { on: boolean; max: number; radius: number; tiers: CityNameTier[]; cities: number; names: number; renders: number };
  /** The boxes the names and their dots take in the picture just drawn, for other names to keep clear of. */
  readonly boxes: { left: number; top: number; width: number; height: number }[];
  dispose(): void;
}

/**
 * The attributes the city names read: `city-names`.
 *
 * @example
 * ```ts
 * import { CITY_NAMES_ATTRIBUTES } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(CITY_NAMES_ATTRIBUTES.join(" "));
 * ```
 */
export const CITY_NAMES_ATTRIBUTES = ["city-names"] as const;

const defaultLoad = async (tier: CityNameTier): Promise<readonly NamedCity[]> => {
  const { loadCities } = await import("@johnmorrisdotca/kuni/cities");
  return (await loadCities(tier)).cities;
};

/**
 * Makes the layer of one element, inside its shadow root. Nothing of kuni is loaded, and nothing is added to the root, until `city-names` is there and the Earth is big enough for a name.
 *
 * @param options - The attribute reader, the language and the shadow root.
 * @returns The host.
 */
export function createCityHost(options: CityHostOptions): CityHost {
  const { root } = options;
  const doc = root.ownerDocument;
  const lists = new Map<CityNameTier, readonly NamedCity[]>();
  const asked = new Set<CityNameTier>();
  let version = 0;
  let cache: { key: string; version: number; cities: readonly NamedCity[] } | undefined;
  let last: CityFrame | null = null;
  let shown: CityName[] = [];
  let renders = 0;
  let style: CityNamesStyle = {};
  let canvas: HTMLCanvasElement | undefined;
  let box: HTMLElement | undefined;
  const pool: HTMLElement[] = [];
  let max = readCityNames(options.attribute("city-names"));
  let drawnBefore = false;
  /** Set in `dispose`: a tier that arrives later, or a font or language event already queued, must not attach again. */
  let gone = false;
  /** The language the names were last laid out in: the page may change its language after the element was made, so it is read again at each draw. */
  let usedLang: "en" | "ja" | undefined;

  const attach = (): void => {
    if (gone || canvas) return;
    canvas = doc.createElement("canvas");
    canvas.id = "cn-canvas";
    canvas.setAttribute("aria-hidden", "true");
    box = doc.createElement("div");
    box.id = "cn-names";
    box.setAttribute("aria-hidden", "true");
    root.append(canvas, box);
    vars();
  };

  const clear = (): void => {
    if (canvas && drawnBefore) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      drawnBefore = false;
    }
    for (const name of pool) name.hidden = true;
    shown = [];
  };

  function vars(): void {
    if (!box) return;
    const set = (name: string, value: string | number | undefined): void => {
      if (value === undefined) box!.style.removeProperty(name);
      else box!.style.setProperty(name, String(value));
    };
    set("--chikyu-city-font", style.font);
    set("--chikyu-city-size", style.size);
    set("--chikyu-city-weight", style.weight);
    set("--chikyu-city-colour", style.colour);
    set("--chikyu-city-halo", style.halo);
    set("--chikyu-city-halo-width", style.haloWidth);
  }

  /** The width of a name in the font it is drawn in: a canvas set to the layer's own font, size and weight (the page's `--chikyu-city-*` properties, or the style set), so a fallback font with wider letters is measured as it is. The font string is read again only when the style, the size or the language changes, not on every draw. */
  let ruler: CanvasRenderingContext2D | null | undefined;
  let fontKey = "";
  let fontValue = "";
  const measurer = (size: number): ((text: string) => number) | undefined => {
    if (ruler === undefined) ruler = doc.createElement("canvas").getContext?.("2d") ?? null;
    const context = ruler;
    if (!context || typeof context.measureText !== "function") return undefined;
    const lang = options.language();
    const key = `${style.font ?? ""}\0${style.weight ?? ""}\0${size}\0${lang}`;
    if (key !== fontKey) {
      fontKey = key;
      const host = root.host ? getComputedStyle(root.host) : undefined;
      const family = style.font ?? (host?.getPropertyValue("--chikyu-city-font").trim() || "system-ui, -apple-system, 'Segoe UI', sans-serif");
      const weight = style.weight ?? (host?.getPropertyValue("--chikyu-city-weight").trim() || 500);
      fontValue = `${weight} ${size}px ${family}`;
    }
    context.font = fontValue;
    return (text) => context.measureText(text).width;
  };

  /** The cities of the tiers wanted that have arrived, the highest rank first; made again only when the tiers or the lists change. */
  const citiesFor = (tiers: readonly CityNameTier[]): readonly NamedCity[] => {
    const key = tiers.join();
    if (cache?.key !== key || cache.version !== version) {
      const cities = tiers.flatMap((tier) => lists.get(tier) ?? []).sort((a, b) => cityRank(b) - cityRank(a));
      cache = { key, version, cities };
    }
    return cache.cities;
  };

  /** Asks for the tiers the Earth's size needs and are not here yet, one at a time. */
  const ensure = (tiers: readonly CityNameTier[]): void => {
    const load = options.load ?? defaultLoad;
    for (const tier of tiers) {
      if (asked.has(tier)) continue;
      asked.add(tier);
      void load(tier)
        .then((cities) => {
          if (gone) return;
          lists.set(tier, cities);
          version += 1;
          compute();
          options.onLayout?.();
        })
        .catch((error: unknown) => {
          if (gone) return;
          options.onError(error);
        });
    }
  };

  function compute(): void {
    if (gone) return;
    const frame = last;
    if (max === null || !frame) return;
    const tiers = cityTiersFor(frame.radius);
    if (tiers.length === 0) {
      clear();
      return;
    }
    ensure(tiers);
    attach();
    const size = style.size ?? DEFAULTS.size;
    const dot = style.dotSize ?? DEFAULTS.dot;
    usedLang = options.language();
    shown = layoutCities(citiesFor(tiers), frame, usedLang, { max, size, dot, measure: measurer(size) });
    place(frame, dot);
  }

  function place(frame: CityFrame, dot: number): void {
    if (!canvas || !box) return;
    const ratio = canvasRatio(frame.width, frame.height, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(frame.width * ratio));
    const h = Math.max(1, Math.round(frame.height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    renders += 1;
    drawnBefore = true;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, frame.width, frame.height);
    context.lineWidth = 1.5;
    context.strokeStyle = style.halo ?? DEFAULTS.haloColour;
    context.fillStyle = style.dot ?? DEFAULTS.dotColour;
    for (const one of shown) {
      context.beginPath();
      context.arc(one.x, one.y, dot, 0, Math.PI * 2);
      context.stroke();
      context.fill();
    }
    while (pool.length < Math.min(CITY_NAMES_MAX, shown.length)) {
      const name = doc.createElement("span");
      name.className = "cn-name";
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
      name.hidden = false;
      name.style.transform = `translate(${Math.round(one.left)}px,${Math.round(one.top)}px)`;
    }
  }

  // the family's chooser tells the document when the page's language changes: the names are written again, though nothing else is drawn
  const onLanguage = (): void =>
    queueMicrotask(() => {
      if (gone) return;
      if (max !== null && last && usedLang !== undefined && usedLang !== options.language()) {
        compute();
        options.onLayout?.();
      }
    });
  doc.addEventListener("kazoku-languagechange", onLanguage);
  // a font arrives: the names are measured in the font they are drawn in, so they are laid out again
  const onFonts = (): void => {
    fontKey = "";
    if (!gone && max !== null && last) {
      compute();
      options.onLayout?.();
    }
  };
  doc.fonts?.addEventListener?.("loadingdone", onFonts);

  return {
    frame(next) {
      if (gone) return;
      last = next;
      if (max === null) return;
      if (!next) {
        clear();
        return;
      }
      compute();
    },
    refresh() {
      if (gone) return;
      max = readCityNames(options.attribute("city-names"));
      if (max === null) {
        clear();
        return;
      }
      compute();
    },
    setStyle(next) {
      if (gone) return;
      style = { ...next };
      vars();
      compute();
    },
    get boxes() {
      const dot = (style.dotSize ?? DEFAULTS.dot) + 1;
      return shown.flatMap((one) => [
        { left: one.left, top: one.top, width: one.width, height: one.height },
        { left: one.x - dot, top: one.y - dot, width: dot * 2, height: dot * 2 },
      ]);
    },
    get stats() {
      return { on: max !== null, max: max ?? 0, radius: last?.radius ?? 0, tiers: [...lists.keys()], cities: [...lists.values()].reduce((sum, list) => sum + list.length, 0), names: shown.length, renders };
    },
    dispose() {
      gone = true;
      last = null;
      max = null;
      doc.removeEventListener("kazoku-languagechange", onLanguage);
      doc.fonts?.removeEventListener?.("loadingdone", onFonts);
      canvas?.remove();
      box?.remove();
      canvas = undefined;
      box = undefined;
      pool.length = 0;
      lists.clear();
      asked.clear();
      cache = undefined;
      shown = [];
    },
  };
}
