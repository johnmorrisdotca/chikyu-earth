// The names of the brightest stars and the constellations as faint lines, over the sky an element's page draws (hoshi-stars' `sky-labels`, loaded only when an attribute asks for it). The element tells this where the camera looks and what covers the sky at each draw
// (`frame`); it draws the names and lines on a canvas and a few labels over the picture, never redraws at rest, and lights the figure under the pointer. Stars are directions, so only the camera's turn matters, never its distance.
import type { CoverMask, FigureLines, LabelStyle, StarNames } from "@johnmorrisdotca/hoshi-stars/sky-labels";
import { canvasRatio } from "../markers/project.ts";
import { boxCovered, pathOutside, touches } from "./cover.ts";
import { inKeep, keepBox, touchesKeep, type KeepBox, type SkyKeepClear } from "./keep-clear.ts";
import type { SkyFrame } from "./frame.ts";
import type { SkyLabelStyle } from "./style.ts";

/** The styles of the layer, for an element to add to its own (`#sk-canvas`, `#sk-names` and the labels in its shadow root). */
export const SKY_STYLE =
  "#sk-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#sk-names{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  ".sk-name,.sk-figure,.sk-designation{position:absolute;left:0;top:0;margin:0;white-space:nowrap;pointer-events:none;font-family:var(--hoshi-label-font,Michroma,system-ui,sans-serif);font-size:calc(var(--hoshi-label-size,11) * 1px);font-weight:var(--hoshi-label-weight,400);color:var(--hoshi-label-colour,#e9f1ff);letter-spacing:calc(var(--hoshi-label-letter-spacing,.14) * 1em);font-variant:var(--hoshi-label-case-variant,small-caps);text-transform:var(--hoshi-label-case-transform,none);text-shadow:0 0 calc(var(--hoshi-label-halo-width,3) * 1px) var(--hoshi-label-halo,#0a1230)}" +
  ".sk-designation{font-family:var(--hoshi-label-designation-font,ui-monospace,monospace);font-size:calc(var(--hoshi-label-designation-size,9) * 1px);color:var(--hoshi-label-designation-colour,#b8c6e0);letter-spacing:0;font-variant:normal;text-transform:none}" +
  ".sk-figure{color:var(--hoshi-label-colour,#e9f1ff)}[hidden]{display:none}";

export interface SkyHost {
  /** Tells where the sky falls in the picture just drawn, or `null` when there is no picture. */
  frame(frame: SkyFrame | null): void;
  /** What the settings are now (`star-names`, `star-names-magnitude`, `constellation-lines`, the language): read again after any of them changed. */
  refresh(): void;
  /** The places where the sky's names must not go (the property `keepClear`): rectangles in the element's pixels, or elements of the page. `null` for none. */
  setKeepClear(areas: readonly SkyKeepClear[] | null): void;
  /** The look of the names, as a partial hoshi-stars `LabelStyle` (the property `skyStyle`). */
  setStyle(style: Partial<SkyLabelStyle>): void;
  readonly stats: { on: boolean; loaded: boolean; names: number; figures: number; picked: string | null; renders: number; lang: string; stars: { text: string; x: number; y: number }[] };
  dispose(): void;
}

export interface SkyHostOptions {
  /** Reads one of the element's attributes. */
  attribute(name: string): string | null;
  /** The page's language, `en` or `ja`. */
  language(): "en" | "ja";
  /** The shadow root and its host. */
  root: ShadowRoot;
  /** Told when the layer could not be made (hoshi-stars is not installed, or its font did not load). */
  onError(error: unknown): void;
  /** Loads Michroma for the names, when the page has named no font of its own: kazoku-ui's `loadBodyLabelFont`. */
  loadFont(): Promise<unknown>;
  /** Brings hoshi-stars' `sky-labels` in: a dynamic import of the package by default, a page's own (or a test's) where it has one. */
  importer?: () => Promise<typeof import("@johnmorrisdotca/hoshi-stars/sky-labels")>;
}

const NAME_POOL = 40;

/** The attributes this layer reads. */
export const SKY_ATTRIBUTES = ["star-names", "star-names-magnitude", "constellation-lines", "keep-clear"] as const;

/**
 * Makes the layer of one element, inside its shadow root. Nothing of hoshi-stars is loaded, and nothing is added to the root, until one of the three attributes is there.
 *
 * @param options - The attribute reader, the language and the shadow root.
 * @returns The host.
 */
export function createSkyHost(options: SkyHostOptions): SkyHost {
  const { root } = options;
  const doc = root.ownerDocument;
  let module: typeof import("@johnmorrisdotca/hoshi-stars/sky-labels") | undefined;
  let loading = false;
  let failed = false;
  let names: StarNames | undefined;
  let lines: FigureLines | undefined;
  let last: SkyFrame | null = null;
  let renders = 0;
  let style: Partial<SkyLabelStyle> = {};
  let canvas: HTMLCanvasElement | undefined;
  let box: HTMLElement | undefined;
  const pool: HTMLElement[] = [];
  const designations: HTMLElement[] = [];
  let figureName: HTMLElement | undefined;
  let attached = false;
  let covered: CoverMask | undefined;
  /** The places the page asked to keep clear, and as boxes from the picture's top left: measured when something has changed (a resize, a new list), never at each frame. */
  let keepList: readonly SkyKeepClear[] = [];
  const keep: KeepBox[] = [];
  let keepStale = true;
  let keepWatch: ResizeObserver | undefined;
  let keepEvents = false;
  /** Whether a point of the picture is on a body or in a place kept clear: what the names are laid out against (the lines are cut at the bodies only). */
  const blockedAt: CoverMask = (x, y) => (covered ? covered(x, y) : false) || inKeep(keep, x, y);
  /** The language the names were last laid out in: the page may change its language after the element was made, so it is read again at each draw. */
  let usedLang: "en" | "ja" | undefined;
  /** The names drawn at the last frame that were left out because they ran over another as the browser draws them (by label), and how many names are shown. */
  const culled: boolean[] = [];
  let drawnNames = 0;

  const wanted = (): boolean => options.attribute("star-names") !== null || options.attribute("constellation-lines") !== null;

  /** The places to keep clear now: the property's and the elements the attribute's selector matches. */
  const keepItems = (): SkyKeepClear[] => {
    const items = [...keepList];
    const selector = options.attribute("keep-clear");
    if (selector) {
      try {
        items.push(...Array.from(doc.querySelectorAll(selector)));
      } catch {
        // not a selector: nothing is kept clear by it
      }
    }
    return items;
  };
  /** Reads the boxes of the places to keep clear: when the list, the selector or a box has changed, and not at each frame. */
  const measureKeep = (rewatch: boolean): void => {
    keepStale = false;
    const items = keepItems();
    keep.length = 0;
    if (items.length === 0) {
      keepWatch?.disconnect();
      return;
    }
    const host = root.host as HTMLElement;
    const own = host.getBoundingClientRect();
    for (const item of items) keep.push(keepBox(item, own));
    if (!rewatch) return;
    // a box that grows or shrinks is read again and the layer laid out again; the observer is set again only when the list has changed
    if (typeof ResizeObserver === "undefined") return;
    keepWatch ??= new ResizeObserver(() => {
      keepStale = true;
      if (module && last) compute();
    });
    keepWatch.disconnect();
    for (const item of items) if ("getBoundingClientRect" in item && item instanceof Element) keepWatch.observe(item);
    keepWatch.observe(host);
    const view = doc.defaultView;
    if (!keepEvents && view && items.length > 0) {
      keepEvents = true;
      view.addEventListener("resize", markStale);
      view.addEventListener("scroll", markStale, { capture: true, passive: true });
    }
  };
  function markStale(): void {
    keepStale = true;
  }
  let keepRewatch = true;


  const attach = (): void => {
    if (attached) return;
    attached = true;
    canvas = doc.createElement("canvas");
    canvas.id = "sk-canvas";
    canvas.setAttribute("aria-hidden", "true");
    box = doc.createElement("div");
    box.id = "sk-names";
    box.setAttribute("aria-hidden", "true");
    figureName = doc.createElement("span");
    figureName.className = "sk-figure";
    figureName.hidden = true;
    box.append(figureName);
    root.append(canvas, box);
    const host = root.host as HTMLElement;
    const place = (event: PointerEvent): { x: number; y: number } => {
      const rect = host.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    // a mouse lights the figure it rests on and lets go when it leaves; a finger lights what it touches and the pick stays until the next touch
    host.addEventListener("pointermove", (event) => {
      if (!lines || event.pointerType === "touch") return;
      const at = place(event);
      // the lines on the Earth are not drawn, so none is lit there
      if ((covered?.(at.x, at.y) ? lines.point() : lines.point(at.x, at.y))) drawLines();
    });
    host.addEventListener("pointerleave", (event) => {
      if (!lines || event.pointerType === "touch") return;
      if (lines.point()) drawLines();
    });
    host.addEventListener("pointerdown", (event) => {
      if (!lines || event.pointerType !== "touch") return;
      const at = place(event);
      if ((covered?.(at.x, at.y) ? lines.point() : lines.point(at.x, at.y))) drawLines();
    });
  };

  const sizeCanvas = (frame: SkyFrame): CanvasRenderingContext2D | null => {
    const ratio = canvasRatio(frame.width, frame.height, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(frame.width * ratio));
    const h = Math.max(1, Math.round(frame.height * ratio));
    if (canvas!.width !== w || canvas!.height !== h) {
      canvas!.width = w;
      canvas!.height = h;
    }
    const context = canvas!.getContext("2d");
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  };

  const spot = { x: 0, y: 0 };
  /**
   * Where the picked figure's name goes: where hoshi-stars put it, or, where a body covers that, the nearest place round it that is clear of every body and inside the picture. Answers `null` where there is none. The name's box is set from its middle, the way it is drawn (up from its point, centred).
   */
  function placeFigureName(x: number, y: number, frame: SkyFrame): { x: number; y: number } | null {
    if (!covered && keep.length === 0) {
      spot.x = x;
      spot.y = y;
      return spot;
    }
    const box = typeof figureName!.getBoundingClientRect === "function" ? figureName!.getBoundingClientRect() : undefined;
    const w = box && box.width > 0 ? box.width : 80;
    const h = box && box.height > 0 ? box.height : 14;
    let best = Number.POSITIVE_INFINITY;
    for (const down of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      for (const across of [0, -0.5, 0.5, -1, 1, -1.5, 1.5]) {
        const cx = Math.max(w / 2 + 2, Math.min(frame.width - w / 2 - 2, x + across * w));
        const cy = Math.max(h + 2, Math.min(frame.height - 2, y + down * h * 1.4));
        const away = Math.abs(cx - x) + Math.abs(cy - y);
        if (away < best && !(covered && boxCovered(covered, cx - w / 2, cy - h, cx + w / 2, cy)) && !touchesKeep(keep, cx - w / 2, cy - h, cx + w / 2, cy)) {
          best = away;
          spot.x = cx;
          spot.y = cy;
        }
      }
    }
    return best === Number.POSITIVE_INFINITY ? null : spot;
  }

  /** The lines and the rings, and the names: drawn again from what `update` laid out. */
  function drawLines(): void {
    const frame = last;
    if (!frame || !canvas || !module) return;
    const context = sizeCanvas(frame);
    if (!context) return;
    renders += 1;
    context.clearRect(0, 0, frame.width, frame.height);
    if (lines && lines.count > 0) {
      context.lineWidth = 1;
      context.lineCap = "round";
      context.strokeStyle = "#cfe0ff";
      for (const figure of lines.figures) {
        const opacity = lines.opacityOf(figure);
        if (opacity <= 0) continue;
        context.globalAlpha = opacity;
        context.beginPath();
        for (let i = figure.start; i < figure.end; i += 1) pathOutside(context, lines.segments[i * 4]!, lines.segments[i * 4 + 1]!, lines.segments[i * 4 + 2]!, lines.segments[i * 4 + 3]!, covered, 0.75);
        context.stroke();
      }
      context.globalAlpha = 1;
    }
    if (names) {
      const s = names.style;
      context.lineWidth = s.ringWidth;
      context.strokeStyle = s.ringColour;
      for (const [index, label] of names.labels.entries()) {
        if (culled[index]) continue;
        if (label.ring > 0) {
          context.beginPath();
          context.arc(label.x, label.y, label.ring, 0, Math.PI * 2);
          context.stroke();
        }
        if (label.leader) {
          context.strokeStyle = s.leaderColour;
          context.beginPath();
          context.moveTo(label.leaderX0, label.leaderY0);
          context.lineTo(label.leaderX1, label.leaderY1);
          context.stroke();
          context.strokeStyle = s.ringColour;
        }
      }
    }
    // the picked figure's name
    if (figureName) {
      const name = lines?.name;
      if (name) {
        figureName.hidden = false;
        if (figureName.textContent !== name.text) figureName.textContent = name.text;
        const at = placeFigureName(name.x, name.y, frame);
        if (at) figureName.style.transform = `translate(${Math.round(at.x)}px,${Math.round(at.y)}px) translate(-50%,-100%)`;
        else figureName.hidden = true;
      } else figureName.hidden = true;
    }
  }

  function placeNames(): void {
    if (!box || !names) {
      drawnNames = 0;
      return;
    }
    const shown = names.labels.length;
    while (pool.length < Math.min(NAME_POOL, shown)) {
      const name = doc.createElement("span");
      name.className = "sk-name";
      const designation = doc.createElement("span");
      designation.className = "sk-designation";
      box.append(name, designation);
      pool.push(name);
      designations.push(designation);
    }
    for (let i = 0; i < pool.length; i += 1) {
      const name = pool[i]!;
      const designation = designations[i]!;
      const label = i < shown ? names.labels[i] : undefined;
      if (!label) {
        if (!name.hidden) {
          name.hidden = true;
          designation.hidden = true;
        }
        continue;
      }
      const text = module!.labelText(label.text, names.style);
      if (name.textContent !== text) name.textContent = text;
      name.hidden = false;
      const shift = label.anchor === "end" ? "-100%" : label.anchor === "middle" ? "-50%" : "0";
      name.style.transform = `translate(${Math.round(label.textX)}px,${Math.round(label.textY)}px) translate(${shift},-100%)`;
      if (label.designation && names.style.designation === "below") {
        if (designation.textContent !== label.designation) designation.textContent = label.designation;
        designation.hidden = false;
        designation.style.transform = `translate(${Math.round(label.designationX)}px,${Math.round(label.designationY)}px) translate(${shift},-100%)`;
      } else designation.hidden = true;
    }
    cullOverlaps(shown);
  }

  /**
   * hoshi-stars lays the names out by the width it works a name to have (a letter is about 0.6 of the size, a Japanese letter the whole size), and the browser draws them with the font it has: Michroma where it has loaded, another font where it has not, or where
   * the page has none that has the letters (a Japanese name on a machine with no Japanese font). The two can differ, so the names are measured as they are drawn, and a name that runs over one placed before it (the brighter star's) is left out, with its ring.
   */
  function cullOverlaps(shown: number): void {
    culled.length = 0;
    let visible = 0;
    const kept: { l: number; t: number; r: number; b: number }[] = [];
    for (let i = 0; i < shown; i += 1) {
      const name = pool[i];
      if (!name || name.hidden) {
        culled.push(true);
        continue;
      }
      if (typeof name.getBoundingClientRect !== "function") {
        culled.push(false);
        visible += 1;
        continue;
      }
      const rect = name.getBoundingClientRect();
      // no part of a name or of its ring is drawn over a body (the Earth, the Moon, the Sun): the sky is behind them. hoshi-stars tests the star's own point only, so a name set beside a star at the Earth's edge can run onto it, and the label (name, ring and all) is left out
      const blocked = keep.length > 0 ? blockedAt : covered;
      const own = blocked ? (root.host as HTMLElement).getBoundingClientRect() : undefined;
      // the catalogue letter set under the name is part of the label
      const under = designations[i]!.hidden || typeof designations[i]!.getBoundingClientRect !== "function" ? undefined : designations[i]!.getBoundingClientRect();
      const bottom = under ? Math.max(rect.bottom, under.bottom) : rect.bottom;
      if (blocked && own && (touches(blocked, rect.left - own.left, rect.top - own.top, rect.right - own.left, bottom - own.top, names!.labels[i]!) || touchesKeep(keep, rect.left - own.left, rect.top - own.top, rect.right - own.left, bottom - own.top))) {
        name.hidden = true;
        designations[i]!.hidden = true;
        culled.push(true);
        continue;
      }
      const over = kept.some((one) => rect.left < one.r && rect.right > one.l && rect.top < one.b && rect.bottom > one.t);
      if (over) {
        name.hidden = true;
        designations[i]!.hidden = true;
        culled.push(true);
        continue;
      }
      kept.push({ l: rect.left, t: rect.top, r: rect.right, b: rect.bottom });
      culled.push(false);
      visible += 1;
    }
    drawnNames = visible;
  }

  const vars = (): void => {
    if (!box || !module) return;
    const properties = module.labelStyleVars(style);
    for (const [name, value] of Object.entries(properties)) box.style.setProperty(name, value);
    // the case is drawn by the labels' own CSS (small capitals, or the text itself written in capitals or lower case by `labelText`)
    box.style.setProperty("--hoshi-label-case-variant", (style.case ?? "small-caps") === "small-caps" ? "small-caps" : "normal");
  };

  const configure = (): void => {
    if (!module) return;
    const count = options.attribute("star-names");
    const magnitude = options.attribute("star-names-magnitude");
    const settings = module.starNamesFromAttributes(count, magnitude);
    const strength = module.lineStrengthFromAttribute(options.attribute("constellation-lines"));
    const lang = options.language();
    usedLang = lang;
    if (settings) {
      if (!names) names = module.createStarNames({ ...settings, lang, style });
      else names.set({ ...settings, lang, style });
    } else names = undefined;
    if (strength !== undefined) {
      if (!lines) lines = module.createFigureLines({ strength, lang, style });
      else lines.set({ strength, lang, style });
    } else lines = undefined;
    vars();
  };

  const load = (): void => {
    if (module || loading || failed || !wanted()) return;
    loading = true;
    attach();
    void (options.importer ?? (() => import("@johnmorrisdotca/hoshi-stars/sky-labels")))()
      .then(async (loaded) => {
        module = loaded;
        if (!style.font) await options.loadFont().catch(() => undefined);
        configure();
        loading = false;
        compute();
      })
      .catch((error: unknown) => {
        loading = false;
        failed = true;
        // nothing of the layer stays in the page when hoshi-stars is not there
        canvas?.remove();
        box?.remove();
        canvas = undefined;
        box = undefined;
        attached = false;
        pool.length = 0;
        designations.length = 0;
        options.onError(error);
      });
  };

  /** Lays the names and lines out for the last frame, and draws them. */
  function compute(): void {
    const frame = last;
    if (!frame || !module) return;
    if (usedLang !== undefined && options.language() !== usedLang) configure();
    const discs = frame.discs;
    covered = frame.covered ?? (discs.length === 0 ? undefined : (x, y) => discs.some((d) => (x - d.x) * (x - d.x) + (y - d.y) * (y - d.y) <= d.radius * d.radius));
    const view = { width: frame.width, height: frame.height };
    if (keepStale || keepRewatch) {
      measureKeep(keepRewatch);
      keepRewatch = false;
    }
    if (names) names.update(frame.project, view, keep.length > 0 ? blockedAt : covered);
    if (lines) lines.update(frame.project, view, names ? names.labels : undefined);
    placeNames();
    drawLines();
  }

  /** The stars that are named at the last frame: each one's own point on the screen (the label's anchor) and its name, from the picture's top left, without the names the browser's measure left out. */
  const starPoints = (): { text: string; x: number; y: number }[] => {
    const out: { text: string; x: number; y: number }[] = [];
    if (!names) return out;
    for (const [index, label] of names.labels.entries()) if (!culled[index]) out.push({ text: label.text, x: label.x, y: label.y });
    return out;
  };

  // the family's chooser tells the document when the page's language changes: the names are written again, though nothing else is drawn
  const onLanguage = (): void =>
    queueMicrotask(() => {
      if (module && wanted() && usedLang !== options.language()) {
        configure();
        compute();
      }
    });
  doc.addEventListener("kazoku-languagechange", onLanguage);
  // a font arrives (Michroma, or the one a Japanese name falls back to): the names are measured as they are drawn, so they are laid out again
  const onFonts = (): void => {
    if (module && wanted() && last) compute();
  };
  doc.fonts?.addEventListener?.("loadingdone", onFonts);

  return {
    frame(next) {
      last = next;
      if (!wanted()) {
        if (attached && canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      load();
      if (!next) {
        if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        for (const name of pool) name.hidden = true;
        for (const designation of designations) designation.hidden = true;
        if (figureName) figureName.hidden = true;
        return;
      }
      compute();
    },
    refresh() {
      keepRewatch = true;
      if (!wanted()) {
        names = undefined;
        lines = undefined;
        if (attached && canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        for (const name of pool) name.hidden = true;
        for (const designation of designations) designation.hidden = true;
        if (figureName) figureName.hidden = true;
        return;
      }
      if (!module) {
        load();
        return;
      }
      configure();
      compute();
    },
    setKeepClear(areas) {
      keepList = areas ? [...areas] : [];
      keepRewatch = true;
      keepStale = true;
      if (module && wanted() && last) compute();
    },
    setStyle(next) {
      style = next;
      if (module) {
        configure();
        compute();
      }
    },
    get stats() {
      return { on: wanted(), loaded: module !== undefined, names: names ? drawnNames : 0, figures: lines?.count ?? 0, picked: lines?.picked?.abbreviation ?? null, renders, lang: usedLang ?? "", stars: starPoints() };
    },
    dispose() {
      keepWatch?.disconnect();
      keepWatch = undefined;
      if (keepEvents) {
        doc.defaultView?.removeEventListener("resize", markStale);
        doc.defaultView?.removeEventListener("scroll", markStale, { capture: true });
        keepEvents = false;
      }
      doc.removeEventListener("kazoku-languagechange", onLanguage);
      doc.fonts?.removeEventListener?.("loadingdone", onFonts);
      canvas?.remove();
      box?.remove();
      pool.length = 0;
      designations.length = 0;
    },
  };
}

// The look chikyu-earth names (`SkyLabelStyle`) and hoshi-stars' `LabelStyle` are the same type: either one given where the other is asked for must compile, or this file does not.
const sameStyle: [LabelStyle, SkyLabelStyle] = [{} as SkyLabelStyle, {} as LabelStyle];
void sameStyle;
