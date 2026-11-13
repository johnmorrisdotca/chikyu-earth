// What the two satellite elements share for the page's paths: the list and the look table, the attributes `selected-path` and `path-hit`, the test of which path a pointer is on, and the events `chikyu-path-hover` and `chikyu-path-click`.
// One press means one thing, in this order: a satellite's dot, then a path, then the sky. The element asks {@link PathControls.press} after the dot and before anything else, and what it answers `true` to is not given to the sky.
import type { SatelliteRef } from "../satellites/types.ts";
import type { SatelliteState } from "./satellite-layer.ts";
import { capPaths, hitRadius, MAX_PATHS, readPathHit, styleTable, type PathHit, type PathRequest, type PathStyle } from "./paths.ts";

/** The attributes the paths add to an element. */
export const PATH_ATTRIBUTES = ["selected-path", "path-hit"] as const;

/** What the element hands the paths. */
export interface PathHost {
  element: HTMLElement;
  state: SatelliteState;
  /** Ask for a draw. */
  request(): void;
  /** The path under a point of the view within a radius, from the last draw. */
  pathAt(x: number, y: number, radius: number): Omit<PathHit, "pointer"> | null;
  /** The satellite whose dot is under a point, which a path never takes a press from. */
  pick(x: number, y: number): SatelliteRef | null;
  /** The view is a ride from a satellite: the hit test is off there unless `path-hit` is set. */
  riding(): boolean;
}

export interface PathStats {
  /** Paths the page asked for. */
  requested: number;
  /** Paths in the one draw (the page's and the chosen satellite's own), as of the last draw. */
  drawn: number;
  /** Asked for beyond {@link MAX_PATHS}, so left out (the earliest). */
  dropped: number;
  /** Asked for but matching no satellite, or with no place. */
  unresolved: number;
  /** The chosen satellite's own orbit is drawn. */
  selectedDrawn: boolean;
  /** Draw calls the paths took at the last draw: 0 or 1. */
  draws: number;
  /** The path the mouse is on, by the id given, or `null`. */
  hover: number | string | null;
  /** `chikyu-path-click` events sent so far. */
  hits: number;
}

export interface PathControls {
  setPaths(list: readonly PathRequest[]): void;
  readonly paths: PathRequest[];
  setStyles(table: Readonly<Record<string, Partial<PathStyle> | null>>, replace?: boolean): void;
  readonly styles: Record<string, PathStyle>;
  /** Read `selected-path` and `path-hit` again. */
  sync(): void;
  readonly selectedOn: boolean;
  readonly hit: number;
  at(x: number, y: number, radiusPx?: number, pointer?: PathHit["pointer"]): PathHit | null;
  /** A press that was not a drag, at a point of the element: sends `chikyu-path-click` and answers `true` when a path was under it and no dot was. */
  press(x: number, y: number, pointer: PathHit["pointer"]): boolean;
  stats(): PathStats;
  stop(): void;
}

export const pointerOf = (event: PointerEvent): PathHit["pointer"] => (event.pointerType === "touch" ? "touch" : event.pointerType === "pen" ? "pen" : "mouse");

export function bindPaths(host: PathHost): PathControls {
  const { element, state } = host;
  let hits = 0;
  let hovered: PathHit | null = null;
  let queued = false;
  let point: { x: number; y: number } | null = null;
  const radiusFor = (pointer: PathHit["pointer"]): number => {
    if (host.riding() && !element.hasAttribute("path-hit")) return 0;
    return hitRadius(readPathHit(element.getAttribute("path-hit")), pointer);
  };

  const at = (x: number, y: number, radiusPx?: number, pointer: PathHit["pointer"] = "mouse"): PathHit | null => {
    const radius = radiusPx === undefined ? radiusFor(pointer) : Math.max(0, Math.min(radiusPx, 200));
    const found = host.pathAt(x, y, radius);
    return found ? { ...found, pointer } : null;
  };

  const detail = (hit: PathHit): PathHit => ({ ...hit, ref: { ...hit.ref } });
  const sameHit = (a: PathHit | null, b: PathHit | null): boolean => (a === null && b === null) || (a !== null && b !== null && a.id === b.id && a.style === b.style && a.ref.group === b.ref.group && a.ref.index === b.ref.index);

  const apply = (): void => {
    queued = false;
    if (!point) return;
    const dot = host.pick(point.x, point.y);
    const hit = dot ? null : at(point.x, point.y, undefined, "mouse");
    if (sameHit(hit, hovered)) {
      hovered = hit;
      return;
    }
    hovered = hit;
    element.dispatchEvent(new CustomEvent("chikyu-path-hover", { detail: hit ? detail(hit) : null, bubbles: true, composed: true }));
  };

  const move = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.buttons !== 0) return;
    if (state.paths.info.length === 0 && hovered === null) return;
    const rect = element.getBoundingClientRect();
    point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (queued) return;
    queued = true;
    element.ownerDocument.defaultView?.requestAnimationFrame(apply);
  };
  const leave = (): void => {
    point = null;
    if (hovered === null) return;
    hovered = null;
    element.dispatchEvent(new CustomEvent("chikyu-path-hover", { detail: null, bubbles: true, composed: true }));
  };
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerleave", leave);
  element.addEventListener("pointercancel", leave);

  return {
    setPaths(list) {
      state.paths.requests = list.filter((one) => one && (typeof one.id === "number" || typeof one.id === "string")).map((one) => ({ id: one.id, ...(one.style === undefined ? {} : { style: typeof one.style === "string" ? one.style : { ...one.style } }) }));
      state.paths.version += 1;
      host.request();
    },
    get paths() {
      return capPaths(state.paths.requests).kept.map((one) => ({ ...one }));
    },
    setStyles(table, replace = false) {
      const next: Record<string, Partial<PathStyle> | null> = replace ? {} : { ...state.paths.overrides };
      for (const [name, style] of Object.entries(table)) {
        if (style === null) delete next[name];
        else next[name] = { ...style };
      }
      state.paths.overrides = next;
      state.paths.version += 1;
      host.request();
    },
    get styles() {
      return styleTable(state.paths.overrides);
    },
    sync() {
      const on = element.getAttribute("selected-path") !== "off";
      if (on === state.paths.selectedOn) return;
      state.paths.selectedOn = on;
      state.paths.version += 1;
      host.request();
    },
    get selectedOn() {
      return state.paths.selectedOn;
    },
    get hit() {
      return readPathHit(element.getAttribute("path-hit"));
    },
    at,
    press(x, y, pointer) {
      if (host.pick(x, y)) return false;
      const hit = at(x, y, undefined, pointer);
      if (!hit) return false;
      hits += 1;
      element.dispatchEvent(new CustomEvent("chikyu-path-click", { detail: detail(hit), bubbles: true, composed: true }));
      return true;
    },
    stats() {
      const info = state.paths;
      return { requested: info.requests.length, drawn: state.drawn.pathsDrawn, dropped: info.dropped, unresolved: info.unresolved, selectedDrawn: state.drawn.selectedOpacity > 0, draws: state.drawn.pathDraws, hover: hovered ? hovered.id : null, hits };
    },
    stop() {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointercancel", leave);
      hovered = null;
    },
  };
}

export { MAX_PATHS };

/** The paths' numbers before the element has bound them. */
export const emptyPathStats = (): PathStats => ({ requested: 0, drawn: 0, dropped: 0, unresolved: 0, selectedDrawn: false, draws: 0, hover: null, hits: 0 });
