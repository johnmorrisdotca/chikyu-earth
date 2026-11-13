// The faint orbit and the name shown while the pointer rests on a satellite. A touch does not rest, so it changes nothing.
// The path itself is drawn by the satellite layer; this only decides which satellite, and for how long after the pointer leaves.
import type { SatelliteRef } from "../satellites/types.ts";
import { prefersLessMotion } from "../meteors/note.ts";
import { fadeLeft, HOVER_PATH_OPACITY, type SatelliteState } from "./satellite-layer.ts";

/** The faint orbit is on unless `hover-path` is `off`. Left unset, it follows `names-on-hover` (itself on unless `off`). */
export const hoverPathOn = (path: string | null, names: string | null): boolean => (path === "off" ? false : path !== null ? true : names !== "off");

/** A name is shown when the pointer rests on a satellite, unless `names-on-hover` is `off`. */
export const namesOnHover = (value: string | null): boolean => value !== "off";

export interface HoverPlace {
  x: number;
  y: number;
  visible: boolean;
}

/** What the element hands the hover: the satellite state, how to find a satellite, and where to put its name. */
export interface SatelliteHoverHost {
  element: HTMLElement;
  state: SatelliteState;
  pick(x: number, y: number): SatelliteRef | null;
  place(ref: SatelliteRef): HoverPlace | null;
  name(ref: SatelliteRef): string | undefined;
  selected(): SatelliteRef | null;
  request(): void;
  labelParent(): HTMLElement | null;
  pathOn(): boolean;
  namesOn(): boolean;
  style(): { color: string; opacity: number };
}

export interface SatelliteHover {
  /** Read the attributes again (they changed, or the element just connected). */
  sync(): void;
  /** Move the name to where the last draw put the satellite. Does not ask for a draw. */
  follow(place: HoverPlace | null): void;
  stop(): void;
}

const same = (a: SatelliteRef | null, b: SatelliteRef | null): boolean => a !== null && b !== null && a.group === b.group && a.index === b.index;

/**
 * Show a satellite's name, and ask for its faint orbit, while a mouse rests on it. One at a time. Leaving fades both; reduced motion takes them away at once.
 * Nothing is asked of the picture while the pointer is still.
 */
export function bindSatelliteHover(host: SatelliteHoverHost): SatelliteHover {
  let label: HTMLElement | undefined;
  let leaving = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queued = false;
  let point: { x: number; y: number } | null = null;

  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const hideName = (now: boolean): void => {
    if (!label) return;
    label.style.opacity = "0";
    if (now || prefersLessMotion()) label.hidden = true;
  };

  const showName = (ref: SatelliteRef | null, place: HoverPlace | null): void => {
    const box = host.labelParent();
    const naming = host.namesOn() && ref && place && place.visible && !same(ref, host.selected()) ? ref : null;
    if (!box || !naming || !place) {
      hideName(true);
      return;
    }
    if (!label) {
      label = box.ownerDocument.createElement("div");
      label.className = "sp-sat";
      label.dataset["hover"] = "true";
      box.append(label);
    }
    const text = host.name(naming) ?? "";
    if (label.textContent !== text) label.textContent = text;
    label.hidden = text === "";
    label.style.opacity = "1";
    label.style.transform = `translate(${Math.round(place.x + 10)}px,${Math.round(place.y - 8)}px)`;
  };

  const apply = (): void => {
    queued = false;
    if (!point) return;
    if (point.x < 0) return;
    const ref = host.pathOn() || host.namesOn() ? host.pick(point.x, point.y) : null;
    const hover = host.state.hover;
    const path = host.pathOn() ? ref : null;
    if (!path && (hover.ref || hover.fade > 0)) {
      leave();
      return;
    }
    if (same(path, hover.ref) && hover.fade === 1 && hover.enabled === host.pathOn()) {
      showName(ref, ref ? host.place(ref) : null);
      return;
    }
    clearTimer();
    leaving = false;
    const look = host.style();
    hover.color = look.color;
    hover.opacity = look.opacity;
    hover.enabled = host.pathOn();
    hover.ref = path;
    hover.fade = path ? 1 : 0;
    showName(ref, ref ? host.place(ref) : null);
    host.request();
  };

  const queue = (x: number, y: number): void => {
    point = { x, y };
    if (queued) return;
    queued = true;
    host.element.ownerDocument.defaultView?.requestAnimationFrame(apply);
  };

  const leave = (): void => {
    point = null;
    const hover = host.state.hover;
    if (!hover.ref && hover.fade === 0) {
      hideName(true);
      return;
    }
    clearTimer();
    if (prefersLessMotion()) {
      leaving = false;
      hover.ref = null;
      hover.fade = 0;
      hideName(true);
      host.request();
      return;
    }
    leaving = true;
    const from = hover.fade;
    const started = performance.now();
    hideName(false);
    const step = (): void => {
      const left = fadeLeft(performance.now() - started, from);
      hover.fade = left;
      host.request();
      if (left > 0) timer = setTimeout(step, 32);
      else {
        hover.ref = null;
        hover.fade = 0;
        leaving = false;
        hideName(true);
        host.request();
      }
    };
    step();
  };

  const move = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.buttons !== 0) return;
    const rect = host.element.getBoundingClientRect();
    queue(event.clientX - rect.left, event.clientY - rect.top);
  };

  const down = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    leave();
  };

  host.element.addEventListener("pointermove", move);
  host.element.addEventListener("pointerdown", down);
  host.element.addEventListener("pointerleave", leave);
  host.element.addEventListener("pointercancel", leave);

  return {
    sync() {
      const on = host.pathOn();
      const hover = host.state.hover;
      const look = host.style();
      hover.color = look.color;
      hover.opacity = look.opacity;
      if (hover.enabled === on) return;
      hover.enabled = on;
      if (!on) {
        clearTimer();
        leaving = false;
        hover.ref = null;
        hover.fade = 0;
        hideName(!host.namesOn());
      }
      host.request();
    },
    follow(place) {
      if (leaving || !host.state.hover.ref) return;
      showName(host.state.hover.ref, place);
    },
    stop() {
      clearTimer();
      host.element.removeEventListener("pointermove", move);
      host.element.removeEventListener("pointerdown", down);
      host.element.removeEventListener("pointerleave", leave);
      host.element.removeEventListener("pointercancel", leave);
      label?.remove();
      label = undefined;
      host.state.hover.ref = null;
      host.state.hover.fade = 0;
    },
  };
}

/** A blank custom property is the default. `Number("")` is 0, which would hide the orbit. */
export const hoverOpacityOf = (text: string): number => {
  const raw = text.trim() === "" ? Number.NaN : Number(text);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : HOVER_PATH_OPACITY;
};

/** Colour and opacity from the element's own custom properties, or the faint orbit's own. */
export function hoverStyleOf(element: HTMLElement): { color: string; opacity: number } {
  const css = element.ownerDocument.defaultView?.getComputedStyle(element);
  const color = css?.getPropertyValue("--chikyu-hover-path").trim() || "#ffffff";
  return { color, opacity: hoverOpacityOf(css?.getPropertyValue("--chikyu-hover-path-opacity") ?? "") };
}
