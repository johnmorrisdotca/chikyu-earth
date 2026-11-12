// Markers over the globe, for either look: dots drawn in one pass on a 2D canvas, a few labels as real buttons, crowded places gathered into clusters.
// It only draws when the view or the markers change (the element tells it), reads no layout to place a label, and shows no more labels than `maxLabels`.
import { clusterPoints, type Cluster } from "./cluster.ts";
import { placeLabels, type LabelItem } from "./labels.ts";
import { canvasRatio, projectAll, type Pose } from "./project.ts";
import type { GroupInfo, MarkerEventDetail, MarkerIcon, MarkerInput } from "./types.ts";

/** The view as an element tells it: the Pose, the size of the box it is drawn in, and the CSS transform its picture carries between redraws. */
/**
 * The pose of an element's last drawing, with the size of its box and the CSS transform its picture carries between redraws.
 *
 * @example
 * ```ts
 * import type { OverlayPose } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const where = (pose: OverlayPose): string => `${pose.lon}, ${pose.lat} at ${pose.width} x ${pose.height}`;
 * console.log(typeof where);
 * ```
 */
export interface OverlayPose extends Pose {
  width: number;
  height: number;
  transform: string;
}

/** What an element gives the markers: a box laid over its view, the pose of its last draw, and a way to hear the next ones. */
/**
 * What an element gives the markers (`element.overlay`): a box laid over its view, the pose of its last draw, and a way to hear the next ones.
 *
 * @example
 * ```ts
 * import type { OverlayHost } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const follow = (host: OverlayHost): (() => void) => host.subscribe((pose) => console.log(pose.radius));
 * console.log(typeof follow);
 * ```
 */
export interface OverlayHost {
  readonly overlayRoot: HTMLElement;
  readonly pose: OverlayPose | null;
  subscribe(listener: (pose: OverlayPose) => void): () => void;
  /**
   * Tells the element the boxes an overlay's marks and labels take now (an empty list when it is taken away), so the element's own names keep clear of them. `names` is the part of `boxes` that is the labels' (the marks' own boxes are the rest): the cities' names, which are
   * set at a mark's own place, keep clear of the labels and not of the marks.
   */
  claim?(owner: object, boxes: readonly { left: number; top: number; width: number; height: number }[], names?: readonly { left: number; top: number; width: number; height: number }[]): void;
  /** The boxes the element's own places take now (names, rings, marks): the markers' labels are put clear of them, as the places come first. */
  taken?(): readonly { left: number; top: number; width: number; height: number }[];
}

/**
 * What {@link attachMarkers} may be asked: the most labels, how close markers gather, and the default colour.
 *
 * @example
 * ```ts
 * import { attachMarkers, type MarkerOptions, type OverlayElement } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const options: MarkerOptions = { maxLabels: 12, clusterRadius: 20, color: "#ffcc00" };
 * const mark = (element: OverlayElement) => attachMarkers(element, options);
 * console.log(typeof mark);
 * ```
 */
export interface MarkerOptions {
  /** Most labels shown at once (24). */
  maxLabels?: number;
  /** Gather markers closer than this many pixels into a cluster (28); 0 turns clustering off. */
  clusterRadius?: number;
  /** The colour of a marker with none of its own. */
  color?: string;
}

/**
 * The markers on one globe: add, update, remove and find them, show or hide groups, and detach.
 *
 * @example
 * ```ts no-run
 * import { attachMarkers, type Markers, type OverlayElement } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * declare const earth: OverlayElement;
 * const markers: Markers = attachMarkers(earth);
 * markers.add({ id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo", group: "Cities" });
 * markers.toggleGroup("Cities");
 * console.log(markers.size, markers.groups());
 * ```
 */
export interface Markers {
  add(marker: MarkerInput): void;
  addAll(markers: readonly MarkerInput[]): void;
  update(id: string, patch: Partial<Omit<MarkerInput, "id">>): void;
  remove(id: string): void;
  clear(): void;
  get(id: string): MarkerInput | undefined;
  list(): MarkerInput[];
  readonly size: number;
  groups(): GroupInfo[];
  showGroup(name: string): void;
  hideGroup(name: string): void;
  /** Show it if hidden and hide it if shown (or set it with `force`). Returns whether it is shown. */
  toggleGroup(name: string, force?: boolean): boolean;
  /** Markers and clusters drawn at the last render (for a page or a test). */
  readonly stats: { markers: number; clusters: number; labels: number; renders: number };
  detach(): void;
}

/**
 * An element markers can be put on: any HTML element with an `overlay` (both `<chikyu-earth>` and `<chikyu-earth-realistic>` have one).
 *
 * @example
 * ```ts
 * import { attachMarkers, type OverlayElement } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const mark = (element: OverlayElement) => attachMarkers(element);
 * console.log(typeof mark);
 * ```
 */
export type OverlayElement = HTMLElement & { overlay: OverlayHost };

const CSS = `
.cm-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cm-labels{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.cm-label{position:absolute;left:0;top:0;margin:0;padding:0 6px;height:20px;line-height:20px;font:12px/20px system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;background:rgba(7,11,18,.72);border:0;border-radius:10px;white-space:nowrap;pointer-events:none;will-change:transform}
.cm-label:focus-visible{outline:2px solid #6cd0ff;outline-offset:1px}
.cm-label[hidden]{display:none}
.cm-list{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:0;padding:0}
`;

const EDGE = 16;
const LABEL_FONT = "12px system-ui, -apple-system, sans-serif";
const TEXT_LIST_MAX = 200;

interface Compiled {
  items: MarkerInput[];
  lons: Float64Array;
  lats: Float64Array;
  sizes: Float32Array;
}

/**
 * Put markers on a globe, for either look: dots drawn in one pass on a canvas, a few labels as real buttons, crowded places gathered into clusters. It draws only when the view or the markers change, reads no layout to place a label, and shows no more labels than `maxLabels`. Hovering, clicking or focusing a marker fires `chikyu-marker-hover`, `chikyu-marker-click` and `chikyu-marker-focus` on the element, with your own `data` in the detail.
 *
 * @param element - `<chikyu-earth>` or `<chikyu-earth-realistic>`.
 * @param options - The most labels, the cluster radius and the default colour; each has a default.
 * @returns The markers: `add`, `addAll`, `update`, `remove`, `clear`, `groups`, `toggleGroup`, `stats` and `detach`.
 *
 * @example
 * ```ts no-run
 * import "@johnmorrisdotca/chikyu-earth/element";
 * import { attachMarkers, type MarkerEventDetail } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const earth = document.querySelector("chikyu-earth")!;
 * const markers = attachMarkers(earth);
 * markers.add({ id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo", group: "Cities" });
 * earth.addEventListener("chikyu-marker-click", (event) => {
 *   const { marker } = (event as CustomEvent<MarkerEventDetail>).detail;
 *   console.log("chose", marker?.label);
 * });
 * ```
 */
export function attachMarkers(element: OverlayElement, options: MarkerOptions = {}): Markers {
  const host = element.overlay;
  const root = host.overlayRoot;
  const doc = root.ownerDocument;
  const maxLabels = options.maxLabels ?? 24;
  const clusterRadius = options.clusterRadius ?? 28;
  const defaultColor = options.color ?? "#6cd0ff";

  const shadow = root.getRootNode();
  const sheet = typeof CSSStyleSheet !== "undefined" && "adoptedStyleSheets" in doc && shadow instanceof ShadowRoot ? new CSSStyleSheet() : null;
  let style: HTMLStyleElement | null = null;
  if (sheet && shadow instanceof ShadowRoot) {
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
  } else {
    style = doc.createElement("style");
    style.textContent = CSS;
    root.append(style);
  }
  const canvas = doc.createElement("canvas");
  canvas.className = "cm-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const labelBox = doc.createElement("div");
  labelBox.className = "cm-labels";
  const list = doc.createElement("ul");
  list.className = "cm-list";
  list.setAttribute("aria-label", "Places marked on the globe");
  root.append(canvas, labelBox, list);
  const ctx = canvas.getContext("2d");

  const store = new Map<string, MarkerInput>();
  const hidden = new Set<string>();
  let compiled: Compiled | null = null;
  let listDirty = true;
  let renders = 0;
  let last: OverlayPose | null = host.pose;
  let xs = new Float32Array(0);
  let ys = new Float32Array(0);
  let zs = new Float32Array(0);
  const stats = { markers: 0, clusters: 0, labels: 0, renders: 0 };

  // what the last render drew, for picking
  let hitX: number[] = [];
  let hitY: number[] = [];
  let hitR: number[] = [];
  let hitMembers: number[][] = [];
  let hitHover: string | null = null;

  const pool: HTMLButtonElement[] = [];
  let shown = 0;
  const widths = new Map<string, number>();

  const compile = (): Compiled => {
    if (compiled) return compiled;
    const items = [...store.values()].filter((m) => !m.group || !hidden.has(m.group));
    const lons = new Float64Array(items.length);
    const lats = new Float64Array(items.length);
    const sizes = new Float32Array(items.length);
    items.forEach((m, i) => {
      lons[i] = m.lon;
      lats[i] = m.lat;
      sizes[i] = Math.min(32, Math.max(4, m.size ?? 8));
    });
    compiled = { items, lons, lats, sizes };
    if (xs.length < items.length) {
      xs = new Float32Array(items.length);
      ys = new Float32Array(items.length);
      zs = new Float32Array(items.length);
    }
    return compiled;
  };

  const textWidth = (text: string): number => {
    let w = widths.get(text);
    if (w === undefined) {
      if (ctx) {
        ctx.font = LABEL_FONT;
        w = Math.ceil(ctx.measureText(text).width);
      } else w = text.length * 7;
      if (widths.size > 2000) widths.clear();
      widths.set(text, w);
    }
    return w;
  };

  const rebuildList = (): void => {
    listDirty = false;
    list.replaceChildren();
    const entries = [...store.values()].filter((m) => !m.group || !hidden.has(m.group));
    const summary = doc.createElement("li");
    summary.textContent = `${entries.length} place${entries.length === 1 ? "" : "s"} marked on the globe`;
    list.append(summary);
    if (entries.length > TEXT_LIST_MAX) return;
    for (const m of entries) {
      const li = doc.createElement("li");
      li.textContent = m.description ?? m.label ?? `${m.lat.toFixed(1)}, ${m.lon.toFixed(1)}`;
      list.append(li);
    }
  };

  const drawIcon = (c: CanvasRenderingContext2D, icon: MarkerIcon, x: number, y: number, r: number, color: string): void => {
    c.fillStyle = color;
    c.strokeStyle = "rgba(0,0,0,.6)";
    c.lineWidth = 1;
    c.beginPath();
    if (icon === "square") c.rect(x - r, y - r, 2 * r, 2 * r);
    else if (icon === "diamond") {
      c.moveTo(x, y - r * 1.3);
      c.lineTo(x + r * 1.3, y);
      c.lineTo(x, y + r * 1.3);
      c.lineTo(x - r * 1.3, y);
      c.closePath();
    } else c.arc(x, y, r, 0, Math.PI * 2);
    if (icon === "ring") {
      c.lineWidth = Math.max(1.5, r * 0.35);
      c.strokeStyle = color;
      c.stroke();
    } else {
      c.fill();
      c.stroke();
    }
  };

  const render = (pose: OverlayPose | null = last): void => {
    if (!pose || !ctx) return;
    last = pose;
    renders += 1;
    stats.renders = renders;
    if (listDirty) rebuildList();
    root.style.transform = pose.transform;
    const data = compile();
    const ratio = canvasRatio(pose.width, pose.height, globalThis.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(pose.width * ratio));
    const ph = Math.max(1, Math.round(pose.height * ratio));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(pw / pose.width, 0, 0, ph / pose.height, 0, 0);
    ctx.clearRect(0, 0, pose.width, pose.height);

    const n = data.items.length;
    projectAll(data.lons, data.lats, n, pose, xs, ys, zs);
    const visible: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (zs[i]! > 0.02 && xs[i]! > -EDGE && xs[i]! < pose.width + EDGE && ys[i]! > -EDGE && ys[i]! < pose.height + EDGE) visible.push(i);
    }
    const groups: Cluster[] = clusterRadius > 0 ? clusterPoints(visible, visible.length, xs, ys, clusterRadius) : visible.map((i) => ({ x: xs[i]!, y: ys[i]!, members: [i] }));

    hitX = [];
    hitY = [];
    hitR = [];
    hitMembers = [];
    const items: LabelItem[] = [];
    const labelled: number[] = [];
    let clusters = 0;
    for (const g of groups) {
      if (g.members.length === 1) {
        const i = g.members[0]!;
        const m = data.items[i]!;
        const r = data.sizes[i]! / 2;
        const edge = zs[i]! < 0.15 ? 0.35 : zs[i]! < 0.3 ? 0.7 : 1;
        ctx.globalAlpha = edge;
        drawIcon(ctx, m.icon ?? "dot", g.x, g.y, r, m.color ?? defaultColor);
        ctx.globalAlpha = 1;
        hitX.push(g.x);
        hitY.push(g.y);
        hitR.push(Math.max(10, r + 4));
        hitMembers.push([i]);
        if (m.label) {
          items.push({ x: g.x, y: g.y, r, w: textWidth(m.label) + 12, h: 20, priority: m.priority ?? 0 });
          labelled.push(i);
        }
      } else {
        clusters += 1;
        const r = 10 + Math.min(10, Math.log2(g.members.length) * 3);
        ctx.fillStyle = "rgba(108,208,255,.85)";
        ctx.strokeStyle = "rgba(0,0,0,.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#06101c";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(g.members.length), g.x, g.y + 0.5);
        hitX.push(g.x);
        hitY.push(g.y);
        hitR.push(r + 2);
        hitMembers.push(g.members);
      }
    }

    const placed = placeLabels(items, pose.width, pose.height, maxLabels, 64, host.taken?.());
    for (let k = 0; k < placed.length; k += 1) {
      const p = placed[k]!;
      const m = data.items[labelled[p.item]!]!;
      let button = pool[k];
      if (!button) {
        button = doc.createElement("button");
        button.type = "button";
        button.className = "cm-label";
        pool[k] = button;
        labelBox.append(button);
      }
      if (button.dataset["id"] !== m.id) {
        button.dataset["id"] = m.id;
        button.textContent = m.label ?? "";
        button.setAttribute("aria-label", m.description ?? m.label ?? m.id);
      }
      if (k >= shown) button.hidden = false;
      button.style.transform = `translate(${Math.round(p.left)}px,${Math.round(p.top)}px)`;
    }
    for (let k = placed.length; k < shown; k += 1) {
      const button = pool[k];
      if (button && !button.hidden) {
        button.hidden = true;
        delete button.dataset["id"];
      }
    }
    shown = placed.length;
    const boxes: { left: number; top: number; width: number; height: number }[] = [];
    for (const p of placed) boxes.push({ left: p.left, top: p.top, width: items[p.item]!.w, height: items[p.item]!.h });
    const names = boxes.slice();
    for (let k = 0; k < hitX.length; k += 1) boxes.push({ left: hitX[k]! - hitR[k]!, top: hitY[k]! - hitR[k]!, width: hitR[k]! * 2, height: hitR[k]! * 2 });
    host.claim?.(api, boxes, names);
    stats.markers = visible.length - groups.reduce((sum, g) => sum + (g.members.length > 1 ? g.members.length : 0), 0);
    stats.clusters = clusters;
    stats.labels = placed.length;
  };

  let scheduled = false;
  const changed = (): void => {
    compiled = null;
    listDirty = true;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      render();
    });
  };

  const unsubscribe = host.subscribe((pose) => render(pose));

  // --- events ------------------------------------------------------------------------------------------------------------------------------------
  const detail = (marker: MarkerInput | null, x: number, y: number, cluster?: string[]): MarkerEventDetail => ({ marker, x, y, ...(cluster ? { cluster } : {}) });
  const emit = (type: string, d: MarkerEventDetail): void => {
    element.dispatchEvent(new CustomEvent(type, { detail: d, bubbles: true, composed: true }));
  };
  const pick = (x: number, y: number): number => {
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < hitX.length; k += 1) {
      const dx = x - hitX[k]!;
      const dy = y - hitY[k]!;
      const d = dx * dx + dy * dy;
      if (d <= hitR[k]! * hitR[k]! && d < bestD) {
        best = k;
        bestD = d;
      }
    }
    return best;
  };
  const local = (event: PointerEvent | MouseEvent): { x: number; y: number } => {
    const rect = element.getBoundingClientRect();
    const scale = last && rect.width > 0 ? last.width / rect.width : 1;
    return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
  };
  let moveAt = 0;
  const onMove = (event: PointerEvent): void => {
    const now = performance.now();
    if (now - moveAt < 33) return;
    moveAt = now;
    const { x, y } = local(event);
    const k = pick(x, y);
    const id = k >= 0 && hitMembers[k]!.length === 1 ? (compile().items[hitMembers[k]![0]!]?.id ?? null) : null;
    const key = k >= 0 ? (id ?? `cluster:${k}`) : null;
    if (key === hitHover) return;
    hitHover = key;
    element.toggleAttribute("data-marker-hover", key !== null);
    emit("chikyu-marker-hover", detail(id ? (store.get(id) ?? null) : null, x, y, k >= 0 && !id ? hitMembers[k]!.map((i) => compile().items[i]!.id) : undefined));
  };
  const onLeave = (): void => {
    if (hitHover === null) return;
    hitHover = null;
    element.removeAttribute("data-marker-hover");
    emit("chikyu-marker-hover", detail(null, -1, -1));
  };
  let downX = 0;
  let downY = 0;
  // The shared controls capture the pointer, so a click is told from where the press began and where the pointer is let go, seen on the window.
  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    downX = event.clientX;
    downY = event.clientY;
    window.addEventListener("pointerup", onUp, { capture: true, once: true });
  };
  const onUp = (event: PointerEvent): void => {
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;
    const { x, y } = local(event);
    const k = pick(x, y);
    if (k < 0) return;
    const members = hitMembers[k]!;
    const items = compile().items;
    if (members.length === 1) emit("chikyu-marker-click", detail(items[members[0]!] ?? null, x, y));
    else emit("chikyu-marker-click", detail(null, x, y, members.map((i) => items[i]!.id)));
  };
  const onLabelClick = (event: Event): void => {
    const id = (event.target as HTMLElement | null)?.dataset?.["id"];
    const m = id ? store.get(id) : undefined;
    if (!m || !last) return;
    const p = projectAt(m);
    emit("chikyu-marker-click", detail(m, p.x, p.y));
  };
  const onLabelFocus = (event: Event): void => {
    const id = (event.target as HTMLElement | null)?.dataset?.["id"];
    const m = id ? store.get(id) : undefined;
    if (!m || !last) return;
    const p = projectAt(m);
    emit("chikyu-marker-focus", detail(m, p.x, p.y));
  };
  const projectAt = (m: MarkerInput): { x: number; y: number } => {
    const k = compile().items.indexOf(m);
    return k >= 0 ? { x: xs[k]!, y: ys[k]! } : { x: 0, y: 0 };
  };
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerleave", onLeave);
  element.addEventListener("pointerdown", onDown);
  labelBox.addEventListener("click", onLabelClick);
  labelBox.addEventListener("focusin", onLabelFocus);

  const api: Markers = {
    add(marker) {
      store.set(marker.id, { ...marker });
      changed();
    },
    addAll(markers) {
      for (const marker of markers) store.set(marker.id, { ...marker });
      changed();
    },
    update(id, patch) {
      const found = store.get(id);
      if (!found) return;
      store.set(id, { ...found, ...patch, id });
      changed();
    },
    remove(id) {
      if (store.delete(id)) changed();
    },
    clear() {
      store.clear();
      changed();
    },
    get: (id) => store.get(id),
    list: () => [...store.values()],
    get size() {
      return store.size;
    },
    groups() {
      const counts = new Map<string, number>();
      for (const m of store.values()) if (m.group) counts.set(m.group, (counts.get(m.group) ?? 0) + 1);
      for (const name of hidden) if (!counts.has(name)) counts.set(name, 0);
      return [...counts].map(([name, count]) => ({ name, count, visible: !hidden.has(name) }));
    },
    showGroup(name) {
      if (hidden.delete(name)) changed();
    },
    hideGroup(name) {
      if (!hidden.has(name)) {
        hidden.add(name);
        changed();
      }
    },
    toggleGroup(name, force) {
      const show = force ?? hidden.has(name);
      if (show) api.showGroup(name);
      else api.hideGroup(name);
      return show;
    },
    stats,
    detach() {
      unsubscribe();
      host.claim?.(api, []);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp, true);
      labelBox.removeEventListener("click", onLabelClick);
      labelBox.removeEventListener("focusin", onLabelFocus);
      canvas.remove();
      labelBox.remove();
      list.remove();
      style?.remove();
      if (sheet && shadow instanceof ShadowRoot) shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter((s) => s !== sheet);
      root.style.transform = "";
    },
  };
  render();
  return api;
}
