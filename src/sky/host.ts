// The names of the brightest stars and the constellations as faint lines, over the sky an element's page draws (hoshi-stars' `sky-labels`, loaded only when an attribute asks for it). The element tells this where the camera looks and what covers the sky at each draw
// (`frame`); it draws the names and lines on a canvas and a few labels over the picture, never redraws at rest, and lights the figure under the pointer. Stars are directions, so only the camera's turn matters, never its distance.
import type { CoverMask, FigureLines, LabelStyle, ScreenPoint, StarNames } from "@johnmorrisdotca/hoshi-stars/sky-labels";
import { canvasRatio } from "../markers/project.ts";

/** The styles of the layer, for an element to add to its own (`#sk-canvas`, `#sk-names` and the labels in its shadow root). */
export const SKY_STYLE =
  "#sk-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#sk-names{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  ".sk-name,.sk-figure,.sk-designation{position:absolute;left:0;top:0;margin:0;white-space:nowrap;pointer-events:none;font-family:var(--hoshi-label-font,Michroma,system-ui,sans-serif);font-size:calc(var(--hoshi-label-size,11) * 1px);font-weight:var(--hoshi-label-weight,400);color:var(--hoshi-label-colour,#e9f1ff);letter-spacing:calc(var(--hoshi-label-letter-spacing,.14) * 1em);font-variant:var(--hoshi-label-case-variant,small-caps);text-transform:var(--hoshi-label-case-transform,none);text-shadow:0 0 calc(var(--hoshi-label-halo-width,3) * 1px) var(--hoshi-label-halo,#0a1230)}" +
  ".sk-designation{font-family:var(--hoshi-label-designation-font,ui-monospace,monospace);font-size:calc(var(--hoshi-label-designation-size,9) * 1px);color:var(--hoshi-label-designation-colour,#b8c6e0);letter-spacing:0;font-variant:normal;text-transform:none}" +
  ".sk-figure{color:var(--hoshi-label-colour,#e9f1ff)}[hidden]{display:none}";

/** What an element tells the layer at each draw: where a direction in the sky falls on the screen, the size of the box, and the bodies that cover the sky (round, in pixels). */
export interface SkyFrame {
  /** Writes where the direction (right ascension and declination, degrees) falls on the screen in CSS pixels and answers whether it is in front of the camera. */
  project(rightAscension: number, declination: number, out: ScreenPoint): boolean;
  width: number;
  height: number;
  /** Bodies in front of the sky, each a disc on the screen: the Earth, the Moon, the Sun. */
  discs: readonly { x: number; y: number; radius: number }[];
}

export interface SkyHost {
  /** Tells where the sky falls in the picture just drawn, or `null` when there is no picture. */
  frame(frame: SkyFrame | null): void;
  /** What the settings are now (`star-names`, `star-names-magnitude`, `constellation-lines`, the language): read again after any of them changed. */
  refresh(): void;
  /** The look of the names, as a partial hoshi-stars `LabelStyle` (the property `skyStyle`). */
  setStyle(style: Partial<LabelStyle>): void;
  readonly stats: { on: boolean; loaded: boolean; names: number; figures: number; picked: string | null; renders: number; lang: string };
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
}

const NAME_POOL = 40;

/** The attributes this layer reads. */
export const SKY_ATTRIBUTES = ["star-names", "star-names-magnitude", "constellation-lines"] as const;

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
  let style: Partial<LabelStyle> = {};
  let canvas: HTMLCanvasElement | undefined;
  let box: HTMLElement | undefined;
  const pool: HTMLElement[] = [];
  const designations: HTMLElement[] = [];
  let figureName: HTMLElement | undefined;
  let attached = false;
  let covered: CoverMask | undefined;
  /** The language the names were last laid out in: the page may change its language after the element was made, so it is read again at each draw. */
  let usedLang: "en" | "ja" | undefined;

  const wanted = (): boolean => options.attribute("star-names") !== null || options.attribute("constellation-lines") !== null;

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
      if (lines.point(at.x, at.y)) drawLines();
    });
    host.addEventListener("pointerleave", (event) => {
      if (!lines || event.pointerType === "touch") return;
      if (lines.point()) drawLines();
    });
    host.addEventListener("pointerdown", (event) => {
      if (!lines || event.pointerType !== "touch") return;
      const at = place(event);
      if (lines.point(at.x, at.y)) drawLines();
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
        for (let i = figure.start; i < figure.end; i += 1) {
          context.moveTo(lines.segments[i * 4]!, lines.segments[i * 4 + 1]!);
          context.lineTo(lines.segments[i * 4 + 2]!, lines.segments[i * 4 + 3]!);
        }
        context.stroke();
      }
      context.globalAlpha = 1;
    }
    if (names) {
      const s = names.style;
      context.lineWidth = s.ringWidth;
      context.strokeStyle = s.ringColour;
      for (const label of names.labels) {
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
        figureName.style.transform = `translate(${Math.round(name.x)}px,${Math.round(name.y)}px) translate(-50%,-100%)`;
      } else figureName.hidden = true;
    }
  }

  function placeNames(): void {
    if (!box || !names) return;
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
    void import("@johnmorrisdotca/hoshi-stars/sky-labels")
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
        options.onError(error);
      });
  };

  /** Lays the names and lines out for the last frame, and draws them. */
  function compute(): void {
    const frame = last;
    if (!frame || !module) return;
    if (usedLang !== undefined && options.language() !== usedLang) configure();
    const discs = frame.discs;
    covered = discs.length === 0 ? undefined : (x, y) => discs.some((d) => (x - d.x) * (x - d.x) + (y - d.y) * (y - d.y) <= d.radius * d.radius);
    const view = { width: frame.width, height: frame.height };
    if (names) names.update(frame.project, view, covered);
    if (lines) lines.update(frame.project, view, names ? names.labels : undefined);
    placeNames();
    drawLines();
  }

  // the family's chooser tells the document when the page's language changes: the names are written again, though nothing else is drawn
  const onLanguage = (): void =>
    queueMicrotask(() => {
      if (module && wanted() && usedLang !== options.language()) {
        configure();
        compute();
      }
    });
  doc.addEventListener("kazoku-languagechange", onLanguage);

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
    setStyle(next) {
      style = next;
      if (module) {
        configure();
        compute();
      }
    },
    get stats() {
      return { on: wanted(), loaded: module !== undefined, names: names?.labels.length ?? 0, figures: lines?.count ?? 0, picked: lines?.picked?.abbreviation ?? null, renders, lang: usedLang ?? "" };
    },
    dispose() {
      doc.removeEventListener("kazoku-languagechange", onLanguage);
      canvas?.remove();
      box?.remove();
      pool.length = 0;
      designations.length = 0;
    },
  };
}
