// The names of the brightest stars and the constellations as faint lines, over the sky an element's page draws (hoshi-stars' `sky-labels`, loaded only when an attribute asks for it). The element tells this where the camera looks and what covers the sky at each draw
// (`frame`); it draws the names and lines on a canvas and a few labels over the picture, never redraws at rest, and lights the figure under the pointer. Stars are directions, so only the camera's turn matters, never its distance.
import { pressClaimed } from "./claim.ts";
import type { Culture } from "@johnmorrisdotca/hoshi-stars/culture";
import type { CoverMask, LabelStyle, StarNames } from "@johnmorrisdotca/hoshi-stars/sky-labels";
import { canvasRatio } from "../markers/project.ts";
import { boxCovered, pathOutside, touches } from "./cover.ts";
import { cultureLoaders } from "./culture-source.ts";
import { createCultureLines, type CultureFigureLines, type Lines } from "./culture-lines.ts";
import { areaInHull, hullOf, nearestSegment, placeBox, visibleCentre } from "./figure-pick.ts";
import { inKeep, keepBox, touchesKeep, type KeepBox, type SkyKeepClear } from "./keep-clear.ts";
import type { SkyFrame } from "./frame.ts";
import type { SkyLabelStyle } from "./style.ts";

/** The styles of the layer, for an element to add to its own (`#sk-canvas`, `#sk-names` and the labels in its shadow root). */
export const SKY_STYLE =
  "#sk-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#sk-names{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  ".sk-name,.sk-figure,.sk-constellation,.sk-designation{position:absolute;left:0;top:0;margin:0;white-space:nowrap;pointer-events:none;font-family:var(--hoshi-label-font,Michroma,system-ui,sans-serif);font-size:calc(var(--hoshi-label-size,11) * 1px);font-weight:var(--hoshi-label-weight,400);color:var(--hoshi-label-colour,#e9f1ff);letter-spacing:calc(var(--hoshi-label-letter-spacing,.14) * 1em);font-variant:var(--hoshi-label-case-variant,small-caps);text-transform:var(--hoshi-label-case-transform,none);text-shadow:0 0 calc(var(--hoshi-label-halo-width,3) * 1px) var(--hoshi-label-halo,#0a1230)}" +
  ".sk-designation{font-family:var(--hoshi-label-designation-font,ui-monospace,monospace);font-size:calc(var(--hoshi-label-designation-size,9) * 1px);color:var(--hoshi-label-designation-colour,#b8c6e0);letter-spacing:0;font-variant:normal;text-transform:none}" +
  ".sk-figure{color:var(--hoshi-label-colour,#e9f1ff);opacity:0;transition:opacity .15s ease-out}.sk-constellation{font-size:calc(var(--hoshi-label-size,11) * .9px);color:var(--hoshi-label-constellation-colour,#9db0d3);letter-spacing:.22em;opacity:.85}@media (prefers-reduced-motion:reduce){.sk-figure{transition:none}}.sk-ruler{visibility:hidden}.sk-live{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
  "button.sk-name,button.sk-hit{background:transparent;border:0;padding:0;cursor:pointer;pointer-events:auto}button.sk-hit{width:28px;height:28px}button.sk-name:focus-visible,button.sk-hit:focus-visible{outline:2px solid #6cd0ff;outline-offset:2px;border-radius:4px}[hidden]{display:none}";

export interface SkyHost {
  /** Tells where the sky falls in the picture just drawn, or `null` when there is no picture. */
  frame(frame: SkyFrame | null): void;
  /** What the settings are now (`star-names`, `star-names-magnitude`, `constellation-lines`, the language): read again after any of them changed. */
  refresh(): void;
  /** The places where the sky's names must not go (the property `keepClear`): rectangles in the element's pixels, or elements of the page. `null` for none. */
  setKeepClear(areas: readonly SkyKeepClear[] | null): void;
  /** Lays the names out once more on the last frame, where a layer placed before this one has moved between draws (a marker list changed, city names arrived). Nothing happens when there is no frame or no name is asked for. */
  relayout(): void;
  /** The look of the names, as a partial hoshi-stars `LabelStyle` (the property `skyStyle`). */
  setStyle(style: Partial<SkyLabelStyle>): void;
  /** Picks a constellation by its IAU abbreviation (`Ori`), or lets it go (`null`): the property `constellation`. Sends no event. */
  pick(abbreviation: string | null): void;
  /** The picked constellation's IAU abbreviation, or `null`. */
  readonly picked: string | null;
  readonly stats: { on: boolean; loaded: boolean; names: number; figures: number; picked: string | null; pick: string | null; hover: string | null; constellations: number; culture: string; renders: number; lang: string; stars: { text: string; x: number; y: number }[] };
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
  /** Brings hoshi-stars' `constellations` in, for the names of the figures: a dynamic import by default. */
  constellations?: () => Promise<typeof import("@johnmorrisdotca/hoshi-stars/constellations")>;
  /**
   * The boxes the layers placed before the sky take in the picture just drawn (the places' names and marks, the markers' labels, the bodies' and the cities' names), as left, top, width and height from the picture's top left. No star name, ring or figure name goes over one.
   * Read when the names are laid out; the element refills the same list, so nothing is made at a draw.
   */
  taken?: () => readonly { left: number; top: number; width: number; height: number }[];
  /** Brings a sky culture of hoshi-stars in (`western`, `japanese` or `chinese`): a dynamic import of the culture by default, a page's own (or a test's) where it has one. */
  cultures?: (id: string) => Promise<Culture>;
}

/** What a page is told of a figure, and what its name is written from. */
interface FigureInfo {
  abbreviation: string;
  name: string;
  english: string;
  japanese: string;
  kind: string;
  names?: Readonly<Partial<Record<string, string>>>;
  reading?: string;
}
const warnedCultures = new Set<string>();
const NAME_POOL = 40;
/** What other layers of the element draw as labels over the sky (bodies, satellites, places, cities): a constellation's name keeps off them. */
const OTHER_LABELS = ".sp-label,.sp-sat,.cm-label,.pl-name:not(.pl-measure),.cn-name";

/** The attributes this layer reads. */
export const SKY_ATTRIBUTES = ["star-names", "star-names-magnitude", "constellation-lines", "constellation-names", "constellation-culture", "keep-clear"] as const;

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
  let lines: Lines | undefined;
  let last: SkyFrame | null = null;
  let renders = 0;
  let style: Partial<SkyLabelStyle> = {};
  let canvas: HTMLCanvasElement | undefined;
  let box: HTMLElement | undefined;
  const pool: HTMLElement[] = [];
  const designations: HTMLElement[] = [];
  let figureName: HTMLElement | undefined;
  /** The figure the pointer rests on, and the one a click or tap picked (IAU abbreviations): the lines of either are lit and the name of one is shown. */
  let hoverAbbr: string | null = null;
  /** What a press on a named star tells the page, kept with the button that shows the name. */
  const starOf = new Map<HTMLElement, { hr: number; name: string; designation: string; x: number; y: number }>();
  /** A focusable point on each figure in view, and the abbreviation it picks. */
  const hits: HTMLElement[] = [];
  const hitAbbr = new Map<HTMLElement, string>();
  let pickAbbr: string | null = null;
  /** The abbreviation the name now shown (the figure name's span) is of, and the timer that hides it after it has faded. */
  let shownAbbr: string | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  /** The names of the constellations: the spans of the optional layer (`constellation-names`), and what is known of each figure from hoshi-stars. */
  const figurePool: HTMLElement[] = [];
  let shownFigures = 0;
  /** What is known of each figure of the IAU's 88 (from hoshi-stars' `constellations`), and of each culture that has been loaded; `culture` is the culture the lines are of now. */
  let iauInfo: Map<string, FigureInfo> | undefined;
  const cultureData = new Map<string, { figures: CultureFigureLines[]; info: Map<string, FigureInfo> }>();
  const cultureLoading = new Set<string>();
  const cultureFailed = new Set<string>();
  let culture = "iau";
  const activeInfo = (): Map<string, FigureInfo> | undefined => (culture === "iau" ? iauInfo : cultureData.get(culture)?.info);
  /** Whether the lines are drawn (the attribute `constellation-lines`): the names alone use the figures but draw none. */
  let drawStrokes = false;
  /** A pick asked for before hoshi-stars was in. */
  let pendingPick: string | null | undefined;
  const middle = { x: 0, y: 0 };
  const found = { x: 0, y: 0 };
  /** The boxes of what is on the picture already, from its top left: the pool is reused, `takenN` of it is in use. */
  const taken: KeepBox[] = [];
  let takenN = 0;
  /** The star names that stayed (their boxes, noted as they were measured), the other layers' labels (read again only when they have changed) and the size of each text as drawn (measured once). */
  const starBoxes: KeepBox[] = [];
  let starN = 0;
  const otherBoxes: KeepBox[] = [];
  let otherN = 0;
  let otherStale = true;
  let otherWatch: MutationObserver | undefined;
  const sizes = new Map<string, { w: number; h: number }>();
  let ruler: HTMLElement | undefined;
  /** The hull of each figure, made when a pointer first asks of it after a projection change. */
  const hulls: (number[] | undefined)[] = [];
  /** A visually hidden polite live region: a pick is read out with the figure's name. */
  let live: HTMLElement | undefined;
  let queuedFrame = false;
  let attached = false;
  let covered: CoverMask | undefined;
  /** The places the page asked to keep clear, and as boxes from the picture's top left: measured when something has changed (a resize, a new list), never at each frame. */
  let keepList: readonly SkyKeepClear[] = [];
  const pageKeep: KeepBox[] = [];
  /** What the names keep off: the page's places (`pageKeep`) and the boxes the layers placed before the sky take (the pool `ext`, refilled at each layout). */
  const keep: KeepBox[] = [];
  const ext: KeepBox[] = [];
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

  /** Lays the layer out once more at the next frame (one for any number of calls), where something it avoids has moved without the picture drawing: a place the page keeps clear that was scrolled, another layer's label. */
  const later = (): void => {
    if (queuedFrame) return;
    queuedFrame = true;
    const run = (): void => {
      queuedFrame = false;
      if (module && last && (pageKeep.length > 0 || options.attribute("constellation-names") !== null || shownAbbr !== null)) compute();
    };
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(run);
    else setTimeout(run, 16);
  };
  const wanted = (): boolean => options.attribute("star-names") !== null || options.attribute("constellation-lines") !== null || options.attribute("constellation-names") !== null;

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
    pageKeep.length = 0;
    if (items.length === 0) {
      keepWatch?.disconnect();
      return;
    }
    const host = root.host as HTMLElement;
    const own = host.getBoundingClientRect();
    for (const item of items) pageKeep.push(keepBox(item, own));
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
    // scrolled or resized while something is kept clear: the names are laid out again at the next frame, once however many events
    if (pageKeep.length > 0) later();
  }
  /** Joins the page's places and the boxes of the layers placed before: the objects are reused, nothing is made at a layout. */
  function mergeKeep(): void {
    keep.length = 0;
    for (const one of pageKeep) keep.push(one);
    const others = options.taken?.();
    if (!others) return;
    for (let i = 0; i < others.length; i += 1) {
      const o = others[i]!;
      const one = (ext[i] ??= { l: 0, t: 0, r: 0, b: 0 });
      one.l = o.left;
      one.t = o.top;
      one.r = o.left + o.width;
      one.b = o.top + o.height;
      keep.push(one);
    }
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
    figureName = doc.createElement("span");
    figureName.className = "sk-figure";
    figureName.hidden = true;
    figureName.setAttribute("aria-hidden", "true");
    box.append(figureName);
    ruler = doc.createElement("span");
    ruler.className = "sk-ruler";
    ruler.setAttribute("aria-hidden", "true");
    ruler.hidden = false;
    box.append(ruler);
    live = doc.createElement("div");
    live.id = "sk-live";
    live.className = "sk-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    root.append(canvas, box, live);
    const host = root.host as HTMLElement;
    const at = { x: 0, y: 0 };
    const place = (event: PointerEvent): { x: number; y: number } => {
      const rect = host.getBoundingClientRect();
      at.x = event.clientX - rect.left;
      at.y = event.clientY - rect.top;
      return at;
    };
    // a mouse lights the figure it rests on, shows its name and lets go when it leaves (the hit test runs once a frame at most, and only when the pointer has moved); a click or a tap picks the figure it is on, or lets the pick go on empty sky
    const rest = { x: 0, y: 0 };
    let queued = false;
    let down: { id: number; x: number; y: number; at: number } | undefined;
    host.addEventListener("pointermove", (event) => {
      // a button held is a drag, a turn of the view: nothing is hit then
      if (!lines || !drawStrokes || event.pointerType === "touch" || event.buttons !== 0) return;
      const here = place(event);
      rest.x = here.x;
      rest.y = here.y;
      if (queued) return;
      queued = true;
      const run = (): void => {
        queued = false;
        setHover(figureAt(rest.x, rest.y));
      };
      if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(run);
      else setTimeout(run, 16);
    });
    host.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "touch") return;
      setHover(null);
    });
    host.addEventListener("pointerdown", (event) => {
      const here = place(event);
      down = { id: event.pointerId, x: here.x, y: here.y, at: event.timeStamp };
    });
    host.addEventListener("pointerup", (event) => {
      const start = down;
      down = undefined;
      if (!start || start.id !== event.pointerId) return;
      if (pressClaimed(event)) return;
      const here = place(event);
      // a press that did not move, and was not held: a click or a tap, not the start of a turn
      if (Math.hypot(here.x - start.x, here.y - start.y) > 6 || event.timeStamp - start.at > 600) return;
      const star = starAt(here.x, here.y);
      if (star) {
        emitStar(star, event.pointerType || "mouse");
        return;
      }
      if (!lines || !drawStrokes) return;
      const figure = figureAt(here.x, here.y);
      setPick(figure, true);
      if (figure) emitFigure(figure, event.pointerType || "mouse");
    });
    host.addEventListener("keydown", (event) => {
      if (!lines || !drawStrokes || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape" && pickAbbr !== null) setPick(null, true);
      else if (event.key === "c" || event.key === "C") cycle(event.shiftKey ? -1 : 1);
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

  /** What the page can be told of a constellation: its names from hoshi-stars, with the culture. */
  const detailOf = (abbreviation: string): { abbreviation: string; id: string; name: string; english: string; japanese: string; kind: string; culture: string } => {
    const info = activeInfo()?.get(abbreviation);
    return { abbreviation, id: abbreviation, name: info?.name ?? abbreviation, english: info?.english ?? abbreviation, japanese: info?.japanese ?? abbreviation, kind: info?.kind ?? "constellation", culture };
  };
  const emit = (type: string, detail: unknown): void => {
    (root.host as HTMLElement).dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  };
  /** The text of a figure's name in the page's language, in the case the style asks for: for the IAU's 88 the Latin or Japanese name; for a culture's own figures its name in the page's language (a Japanese asterism by its reading in kana: すばる). */
  const figureText = (abbreviation: string): string => {
    const info = activeInfo()?.get(abbreviation);
    const ja = options.language() === "ja";
    let text = abbreviation;
    if (info && culture === "iau") text = ja ? info.japanese : info.name;
    else if (info) {
      const names = info.names ?? {};
      text = ja ? (info.kind === "asterism" && info.reading ? info.reading : (names["ja"] ?? info.name)) : info.kind === "constellation" ? (names["la"] ?? info.name) : (names["en"] ?? info.name);
    }
    return module && lines ? module.labelText(text, lines.style) : text;
  };
  /** The figure under a point of the picture: one with a line within reach of it, else the smallest one it is inside of (a pointer in a figure picks it, not only on its lines). `null` where a body covers the point, or none is there. */
  function figureAt(x: number, y: number): string | null {
    if (!lines || !drawStrokes || covered?.(x, y)) return null;
    const reach = lines.settings.reach ?? 14;
    let best = reach * reach;
    let nearest: string | null = null;
    for (const figure of lines.figures) {
      if (figure.end <= figure.start) continue;
      const d = nearestSegment(lines.segments, figure.start, figure.end, x, y);
      if (d < best) {
        best = d;
        nearest = figure.abbreviation;
      }
    }
    if (nearest) return nearest;
    let smallest = Number.POSITIVE_INFINITY;
    for (const figure of lines.figures) {
      if (figure.end <= figure.start || x < figure.left || x > figure.right || y < figure.top || y > figure.bottom) continue;
      const index = lines.figures.indexOf(figure);
      const area = areaInHull((hulls[index] ??= hullOf(lines.segments, figure.start, figure.end)), x, y);
      if (area >= 0 && area < smallest) {
        smallest = area;
        nearest = figure.abbreviation;
      }
    }
    return nearest;
  }
  function setHover(abbreviation: string | null): void {
    if (abbreviation === hoverAbbr) return;
    hoverAbbr = abbreviation;
    emit("chikyu-constellation-hover", abbreviation === null ? null : detailOf(abbreviation));
    drawLines();
  }
  function setPick(abbreviation: string | null, send: boolean): void {
    if (abbreviation === pickAbbr) return;
    pickAbbr = abbreviation;
    if (send) {
      emit("chikyu-constellation-pick", abbreviation === null ? null : detailOf(abbreviation));
      // a pick is read out, with the figure's name in the page's language; a hover is not (it would be too much to hear)
      sayPick(abbreviation === null ? "" : figureText(abbreviation));
    }
    drawLines();
  }
  /** Read a pick out, with its name in the page's language. An empty text clears it. */
  function sayPick(text: string): void {
    if (live) live.textContent = text === "" ? "" : options.language() === "ja" ? `${text}を選択` : `${text} selected`;
  }
  /** A named star that was pressed or tapped. `name` is the name as drawn. */
  function emitStar(star: { hr: number; name: string; designation: string; x: number; y: number }, pointerType: string): void {
    emit("chikyu-sky-pick", { kind: "star", hr: star.hr, name: star.name, designation: star.designation, x: star.x, y: star.y, pointerType });
    sayPick(star.name);
  }
  /** A constellation figure that was pressed or tapped. */
  function emitFigure(abbreviation: string, pointerType: string): void {
    emit("chikyu-sky-pick", { kind: "constellation", abbreviation, pointerType });
  }
  /** The named star under a point: its name box first, else the nearest star point within reach. Culled names are not there. */
  function starAt(x: number, y: number): { hr: number; name: string; designation: string; x: number; y: number } | null {
    const named = names;
    const sky = module;
    if (!named || !sky) return null;
    const drawn = (label: (typeof named.labels)[number]): { hr: number; name: string; designation: string; x: number; y: number } => ({
      hr: label.hr,
      name: sky.labelText(label.text, named.style),
      designation: label.designation,
      x: label.x,
      y: label.y,
    });
    for (const [index, label] of named.labels.entries()) {
      if (culled[index]) continue;
      if (x >= label.x0 && x <= label.x1 && y >= label.y0 && y <= label.y1) return drawn(label);
    }
    let best: { hr: number; name: string; designation: string; x: number; y: number } | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const [index, label] of named.labels.entries()) {
      if (culled[index]) continue;
      const reach = Math.max(label.ring, 14);
      const d = (x - label.x) ** 2 + (y - label.y) ** 2;
      if (d <= reach * reach && d < bestD) {
        bestD = d;
        best = drawn(label);
      }
    }
    return best;
  }
  /** Picks the next (or the previous) figure in view, from the left: the keyboard's way to pick. */
  function cycle(step: number): void {
    if (!lines) return;
    const inView = lines.figures.filter((f) => f.end > f.start).sort((a, b) => a.left + a.right - (b.left + b.right));
    if (inView.length === 0) return;
    const at = inView.findIndex((f) => f.abbreviation === pickAbbr);
    const next = inView[(at < 0 ? (step > 0 ? 0 : inView.length - 1) : (at + step + inView.length) % inView.length)]!;
    setPick(next.abbreviation, true);
    // the key picks as Enter on a figure's button does, so the page hears every pick of the reader's the same way
    emitFigure(next.abbreviation, "keyboard");
  }

  const takenAbbr: (string | null)[] = [];
  /** Whether a box may stand: clear of bodies and kept-clear areas, and clear of the names already placed (those of `ignore` aside). */
  const freeFor =
    (ignore: string | undefined, useTaken: boolean) =>
    (l: number, t: number, r: number, b: number): boolean => {
      const blocked = keep.length > 0 ? blockedAt : covered;
      if (blocked && boxCovered(blocked, l, t, r, b)) return false;
      if (touchesKeep(keep, l, t, r, b)) return false;
      if (!useTaken) return true;
      for (let i = 0; i < takenN; i += 1) {
        const a = taken[i]!;
        if ((ignore === undefined || takenAbbr[i] !== ignore) && l < a.r + 1 && r > a.l - 1 && t < a.b + 1 && b > a.t - 1) return false;
      }
      return true;
    };
  let takenStale = true;
  /** Notes a box among those taken, reusing the objects of the pool. */
  const take = (l: number, t: number, r: number, b: number, abbreviation: string | null): void => {
    const one = (taken[takenN] ??= { l: 0, t: 0, r: 0, b: 0 });
    one.l = l;
    one.t = t;
    one.r = r;
    one.b = b;
    takenAbbr[takenN] = abbreviation;
    takenN += 1;
  };
  /** The other layers' labels (bodies, places, satellites, cities) are read again only after one of them has changed (a mutation of the shadow root outside this layer), never at each frame. */
  const readOthers = (): void => {
    otherStale = false;
    otherN = 0;
    if (typeof MutationObserver !== "undefined" && !otherWatch) {
      otherWatch = new MutationObserver((records) => {
        for (const record of records) {
          if (record.target === canvas || record.target === live || (box && box.contains(record.target))) continue;
          otherStale = true;
          later();
          return;
        }
      });
      otherWatch.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "hidden"] });
    }
    const own = (root.host as HTMLElement).getBoundingClientRect();
    for (const el of Array.from(root.querySelectorAll?.(OTHER_LABELS) ?? [])) {
      if ((el as HTMLElement).hidden) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      const one = (otherBoxes[otherN] ??= { l: 0, t: 0, r: 0, b: 0 });
      one.l = rect.left - own.left;
      one.t = rect.top - own.top;
      one.r = rect.right - own.left;
      one.b = rect.bottom - own.top;
      otherN += 1;
    }
  };
  /** The boxes of what is already on the picture: the star names that stayed (noted when they were measured), the other layers' labels and, as they are placed, the constellation names. No layout is asked for here but when another layer has changed. */
  function gatherTaken(): void {
    takenN = 0;
    takenStale = false;
    if (otherStale) readOthers();
    for (let i = 0; i < starN; i += 1) take(starBoxes[i]!.l, starBoxes[i]!.t, starBoxes[i]!.r, starBoxes[i]!.b, null);
    for (let i = 0; i < otherN; i += 1) take(otherBoxes[i]!.l, otherBoxes[i]!.t, otherBoxes[i]!.r, otherBoxes[i]!.b, null);
  }
  /**
   * The size of a text as drawn with a class of the layer, measured once (on a hidden ruler) and kept until the style, the language or a font changes: the layout never has to be asked again to place a name.
   */
  const textBox = (className: string, text: string): { w: number; h: number } => {
    const key = `${className}|${text}`;
    let known = sizes.get(key);
    if (!known) {
      const rect = ruler && typeof ruler.getBoundingClientRect === "function" ? (() => {
        ruler.className = `${className} sk-ruler`;
        ruler.textContent = text;
        return ruler.getBoundingClientRect();
      })() : undefined;
      known = { w: rect && rect.width > 0 ? rect.width : 90, h: rect && rect.height > 0 ? rect.height : 14 };
      sizes.set(key, known);
    }
    return known;
  };
  const reduced = (): boolean => doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  /** The name of the lit figure (the one the pointer is on, else the picked one) at the middle of the part of it that is in view, clear of the star names, the Earth and the places kept clear; it fades in and out. */
  function updateFigureName(frame: SkyFrame): void {
    const el = figureName;
    if (!el) return;
    const abbreviation = hoverAbbr ?? pickAbbr;
    const figure = abbreviation && lines ? lines.figures.find((f) => f.abbreviation === abbreviation) : undefined;
    const blocked = keep.length > 0 ? blockedAt : covered;
    if (!abbreviation || !lines || !figure || figure.end <= figure.start || !visibleCentre(lines.segments, figure.start, figure.end, frame.width, frame.height, blocked, middle)) {
      fadeName();
      return;
    }
    if (takenStale) gatherTaken();
    const text = figureText(abbreviation);
    if (el.hidden) {
      el.style.opacity = "0";
      el.hidden = false;
    }
    if (el.textContent !== text) el.textContent = text;
    const { w, h } = textBox("sk-figure", text);
    // the middle of the figure, or the nearest place that is clear: of the other names first, and where there is none, over them
    if (!placeBox(middle.x, middle.y, w, h, frame.width, frame.height, freeFor(abbreviation, true), found) && !placeBox(middle.x, middle.y, w, h, frame.width, frame.height, freeFor(abbreviation, false), found)) {
      fadeName();
      return;
    }
    el.style.transform = `translate(${Math.round(found.x)}px,${Math.round(found.y)}px) translate(-50%,-50%)`;
    if (shownAbbr !== abbreviation || el.style.opacity !== "1") {
      clearTimeout(fadeTimer);
      if (typeof el.getBoundingClientRect === "function") void el.offsetWidth;
      el.style.opacity = "1";
    }
    shownAbbr = abbreviation;
  }
  function fadeName(): void {
    const el = figureName;
    shownAbbr = null;
    if (!el || el.hidden || el.style.opacity === "0") return;
    el.style.opacity = "0";
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      el.hidden = true;
    }, reduced() ? 0 : 180);
  }
  /** The optional layer of the constellations' names (`constellation-names`): each figure's name at the middle of the part of it in view, quieter than the star names, and clear of them, of the bodies, of the places kept clear and of each other. */
  function placeConstellationNames(frame: SkyFrame): void {
    const on = options.attribute("constellation-names") !== null && lines !== undefined && module !== undefined && box !== undefined;
    shownFigures = 0;
    if (on) {
      gatherTaken();
      const inView = lines!.figures.filter((f) => f.end > f.start).sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top));
      const blocked = keep.length > 0 ? blockedAt : covered;
      for (const figure of inView) {
        if (figure.abbreviation === shownAbbr || !visibleCentre(lines!.segments, figure.start, figure.end, frame.width, frame.height, blocked, middle)) continue;
        while (figurePool.length <= shownFigures) {
          const span = doc.createElement("span");
          span.className = "sk-constellation";
          span.setAttribute("aria-hidden", "true");
          box!.append(span);
          figurePool.push(span);
        }
        const el = figurePool[shownFigures]!;
        const text = figureText(figure.abbreviation);
        if (el.textContent !== text) el.textContent = text;
        el.hidden = false;
        const { w, h } = textBox("sk-constellation", text);
        // not far from the middle: a name set off to the far side of a figure names nothing
        if (!placeBox(middle.x, middle.y, w, h, frame.width, frame.height, freeFor(undefined, true), found) || Math.abs(found.x - middle.x) > 1.6 * w || Math.abs(found.y - middle.y) > 5 * h) {
          el.hidden = true;
          continue;
        }
        el.style.transform = `translate(${Math.round(found.x)}px,${Math.round(found.y)}px) translate(-50%,-50%)`;
        take(found.x - w / 2, found.y - h / 2, found.x + w / 2, found.y + h / 2, figure.abbreviation);
        shownFigures += 1;
      }
    }
    for (let i = shownFigures; i < figurePool.length; i += 1) figurePool[i]!.hidden = true;
  }

  /** The lines and the rings, and the names: drawn again from what `update` laid out. */
  function drawLines(): void {
    const frame = last;
    if (!frame || !canvas || !module) return;
    const context = sizeCanvas(frame);
    if (!context) return;
    renders += 1;
    context.clearRect(0, 0, frame.width, frame.height);
    if (lines && drawStrokes && lines.count > 0) {
      context.lineWidth = 1;
      context.lineCap = "round";
      context.strokeStyle = "#cfe0ff";
      for (const figure of lines.figures) {
        const opacity = figure.abbreviation === hoverAbbr || figure.abbreviation === pickAbbr ? 1 : lines.opacityOf(figure);
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
    // the lit figure's name
    updateFigureName(frame);
  }

  function placeNames(): void {
    if (!box || !names) {
      drawnNames = 0;
      return;
    }
    const shown = names.labels.length;
    while (pool.length < Math.min(NAME_POOL, shown)) {
      const name = doc.createElement("button");
      name.className = "sk-name";
      name.setAttribute("type", "button");
      name.addEventListener("click", (event) => {
        // a pointer already sent the pick from the press; Enter and Space are a click with no pointer (detail 0)
        if ((event as MouseEvent).detail !== 0) return;
        const star = starOf.get(name);
        if (!star || name.hidden) return;
        emitStar(star, "keyboard");
      });
      const designation = doc.createElement("span");
      designation.className = "sk-designation";
      designation.setAttribute("aria-hidden", "true");
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
        starOf.delete(name);
        continue;
      }
      const text = module!.labelText(label.text, names.style);
      if (name.textContent !== text) name.textContent = text;
      name.setAttribute("aria-label", text);
      starOf.set(name, { hr: label.hr, name: text, designation: label.designation, x: label.x, y: label.y });
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
    starN = 0;
    let visible = 0;
    const own = shown > 0 ? (root.host as HTMLElement).getBoundingClientRect() : undefined;
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
      // the boxes of the names that stayed, from the picture's top left, for the constellations' names to keep off
      if (own) {
        const one = (starBoxes[starN] ??= { l: 0, t: 0, r: 0, b: 0 });
        one.l = rect.left - own.left;
        one.t = rect.top - own.top;
        one.r = rect.right - own.left;
        one.b = bottom - own.top;
        starN += 1;
      }
      culled.push(false);
      visible += 1;
    }
    drawnNames = visible;
  }

  /** Hides the lit figure's name and the constellations' names. */
  function hideFigures(): void {
    clearTimeout(fadeTimer);
    if (figureName) figureName.hidden = true;
    shownAbbr = null;
    for (const el of figurePool) el.hidden = true;
    shownFigures = 0;
    for (const hit of hits) hit.hidden = true;
  }
  /**
   * One focusable point on each figure that is in view, at the middle of the part of it on the picture. Enter picks it. Nothing is drawn: the buttons are the way a keyboard reaches a figure, and they are moved only when the picture is laid out.
   */
  function placeFigureHits(frame: SkyFrame): void {
    if (!box || !lines) {
      for (const hit of hits) hit.hidden = true;
      return;
    }
    const placed: { abbreviation: string; x: number; y: number }[] = [];
    const at = { x: 0, y: 0 };
    const blocked = keep.length > 0 ? blockedAt : covered;
    for (const figure of lines.figures) {
      if (figure.end <= figure.start) continue;
      if (!visibleCentre(lines.segments, figure.start, figure.end, frame.width, frame.height, blocked, at)) continue;
      placed.push({ abbreviation: figure.abbreviation, x: at.x, y: at.y });
    }
    placed.sort((a, b) => a.x - b.x);
    while (hits.length < placed.length) {
      const hit = doc.createElement("button");
      hit.className = "sk-hit";
      hit.setAttribute("type", "button");
      hit.addEventListener("click", (event) => {
        if ((event as MouseEvent).detail !== 0) return;
        const abbreviation = hitAbbr.get(hit);
        if (!abbreviation || hit.hidden) return;
        setPick(abbreviation, true);
        emitFigure(abbreviation, "keyboard");
      });
      box.append(hit);
      hits.push(hit);
    }
    for (let i = 0; i < hits.length; i += 1) {
      const hit = hits[i]!;
      const figure = placed[i];
      if (!figure) {
        hit.hidden = true;
        hitAbbr.delete(hit);
        continue;
      }
      const text = figureText(figure.abbreviation);
      hit.setAttribute("aria-label", text);
      hit.hidden = false;
      hit.style.transform = `translate(${Math.round(figure.x)}px,${Math.round(figure.y)}px) translate(-50%,-50%)`;
      hitAbbr.set(hit, figure.abbreviation);
    }
  }
  /** The settings no longer ask for the lines: a figure that was picked is let go, and the page is told. */
  function letGo(): void {
    hoverAbbr = null;
    if (pickAbbr !== null) {
      pickAbbr = null;
      emit("chikyu-constellation-pick", null);
    }
  }

  const vars = (): void => {
    if (!box || !module) return;
    const properties = module.labelStyleVars(style);
    for (const [name, value] of Object.entries(properties)) box.style.setProperty(name, value);
    // the case is drawn by the labels' own CSS (small capitals, or the text itself written in capitals or lower case by `labelText`)
    box.style.setProperty("--hoshi-label-case-variant", (style.case ?? "small-caps") === "small-caps" ? "small-caps" : "normal");
  };

  /** The sky culture the page asks for, exactly as it sets it: `iau` where it sets none. A value that is not a culture is `iau`, with one warning in the console. */
  const readCulture = (): string => {
    const raw = options.attribute("constellation-culture");
    const id = raw === null || raw.trim() === "" ? "iau" : raw.trim().toLowerCase();
    if (id === "iau") return id;
    if (Object.hasOwn(cultureLoaders(), id) && !cultureFailed.has(id)) return id;
    if (!warnedCultures.has(id)) {
      warnedCultures.add(id);
      console.warn(`chikyu-earth: constellation-culture="${id}" is not a sky culture here (${["iau", ...Object.keys(cultureLoaders())].join(", ")}): the IAU's constellations are used.`);
    }
    return "iau";
  };
  const requestCulture = (id: string): void => {
    if (cultureLoading.has(id)) return;
    cultureLoading.add(id);
    void Promise.all([(options.cultures ?? ((name: string) => cultureLoaders()[name]!()))(id), import("@johnmorrisdotca/hoshi-stars/lines")])
      .then(([loaded, library]) => {
        const info = new Map<string, FigureInfo>();
        const figures: CultureFigureLines[] = [];
        for (const figure of library.figures(loaded)) {
          const a = figure.asterism;
          figures.push({ id: a.id, segments: figure.segments });
          info.set(a.id, { abbreviation: a.id, name: a.name, english: a.names.en ?? a.name, japanese: a.names.ja ?? a.readings.ja ?? a.name, kind: a.kind, names: a.names, ...(a.readings.ja ? { reading: a.readings.ja } : {}) });
        }
        cultureData.set(id, { figures, info });
        cultureLoading.delete(id);
        if (module) {
          configure();
          // a figure the page picked while the culture was on its way
          if (pendingPick !== undefined && lines?.figures.some((f) => f.abbreviation === pendingPick)) {
            setPick(pendingPick, false);
            pendingPick = undefined;
          }
          compute();
        }
      })
      .catch((error: unknown) => {
        cultureLoading.delete(id);
        cultureFailed.add(id);
        // not "not a culture": it is one, and could not be had; the IAU's figures are shown in its place
        warnedCultures.add(id);
        console.warn(`chikyu-earth: the sky culture "${id}" could not be loaded, so the IAU's constellations are shown.`);
        options.onError(error);
        if (module) {
          configure();
          compute();
        }
      });
  };

  const configure = (): void => {
    if (!module) return;
    // the texts may be written in another language or look: their sizes are measured again
    sizes.clear();
    const count = options.attribute("star-names");
    const magnitude = options.attribute("star-names-magnitude");
    const settings = module.starNamesFromAttributes(count, magnitude);
    const linesAttribute = module.lineStrengthFromAttribute(options.attribute("constellation-lines"));
    // the names alone need the figures' places but draw no line: a strength that draws nothing visible, never drawn
    const strength = linesAttribute ?? (options.attribute("constellation-names") !== null ? 0.01 : undefined);
    drawStrokes = linesAttribute !== undefined;
    const lang = options.language();
    usedLang = lang;
    if (settings) {
      if (!names) names = module.createStarNames({ ...settings, lang, style });
      else names.set({ ...settings, lang, style });
    } else names = undefined;
    const wantedCulture = readCulture();
    if (strength === undefined) lines = undefined;
    else if (wantedCulture !== "iau" && !cultureData.has(wantedCulture)) {
      // the culture's figures are brought in when asked for; until they are here none are drawn, never the IAU's in their place
      requestCulture(wantedCulture);
      if (lines) {
        lines = undefined;
        letGo();
      }
    } else {
      if (lines && culture !== wantedCulture) {
        lines = undefined;
        letGo();
      }
      culture = wantedCulture;
      const loaded = module;
      if (!lines) lines = wantedCulture === "iau" ? loaded.createFigureLines({ strength, lang, style }) : createCultureLines(cultureData.get(wantedCulture)!.figures, strength, (partial) => loaded.labelStyle(partial), style);
      else lines.set({ strength, lang, style });
    }
    if (!lines || !drawStrokes) letGo();
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
        // the constellations' names (hoshi-stars' own): for the layer of names and for what a pick tells the page
        try {
          const all = await (options.constellations ?? (() => import("@johnmorrisdotca/hoshi-stars/constellations")))();
          iauInfo = new Map(all.constellations().map((c) => [c.abbreviation, { abbreviation: c.abbreviation, name: c.name, english: c.english, japanese: c.japanese, kind: "constellation" }]));
        } catch {
          iauInfo = undefined;
        }
        configure();
        loading = false;
        // a pick asked for before hoshi-stars was in (kept while the figures of a culture are still on their way)
        if (pendingPick !== undefined && lines) {
          if (lines.figures.some((f) => f.abbreviation === pendingPick)) setPick(pendingPick, false);
          pendingPick = undefined;
        }
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
        figurePool.length = 0;
        figureName = undefined;
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
    mergeKeep();
    takenStale = true;
    hulls.length = 0;
    if (names) names.update(frame.project, view, keep.length > 0 ? blockedAt : covered);
    if (lines) lines.update(frame.project, view, names ? names.labels : undefined);
    placeNames();
    placeConstellationNames(frame);
    drawLines();
    placeFigureHits(frame);
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
    sizes.clear();
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
        hideFigures();
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
        hideFigures();
        letGo();
        return;
      }
      if (!module) {
        load();
        return;
      }
      configure();
      compute();
    },
    relayout() {
      if (module && wanted() && last) compute();
    },
    setKeepClear(areas) {
      keepList = areas ? [...areas] : [];
      keepRewatch = true;
      keepStale = true;
      if (module && wanted() && last) compute();
    },
    pick(abbreviation) {
      if (!lines) {
        pendingPick = abbreviation;
        return;
      }
      const known = abbreviation === null || lines?.figures.some((f) => f.abbreviation === abbreviation);
      if (known) setPick(abbreviation, false);
    },
    get picked() {
      return pickAbbr;
    },
    setStyle(next) {
      style = next;
      sizes.clear();
      if (module) {
        configure();
        compute();
      }
    },
    get stats() {
      return { on: wanted(), loaded: module !== undefined, names: names ? drawnNames : 0, figures: lines?.count ?? 0, picked: hoverAbbr ?? pickAbbr, pick: pickAbbr, hover: hoverAbbr, constellations: shownFigures, culture, renders, lang: usedLang ?? "", stars: starPoints() };
    },
    dispose() {
      clearTimeout(fadeTimer);
      otherWatch?.disconnect();
      otherWatch = undefined;
      live?.remove();
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
      figurePool.length = 0;
    },
  };
}

// The look chikyu-earth names (`SkyLabelStyle`) and hoshi-stars' `LabelStyle` are the same type: either one given where the other is asked for must compile, or this file does not.
const sameStyle: [LabelStyle, SkyLabelStyle] = [{} as SkyLabelStyle, {} as LabelStyle];
void sameStyle;
