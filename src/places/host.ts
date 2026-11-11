// What an element does with its places: a canvas laid over the picture where the markers are drawn (a ring on the ground, a beam standing out of it, a head), a button for each name that fits (never over another
// name: right of it, then left, above, below, and a lesser place is left out when none is free), and a quiet pulse on the visitor's own place while the view moves and for two seconds after the place is added or changed. The element tells it where the places
// fall at each draw (`frame`); it draws nothing else on its own, and its pulse stops when nothing pulses, when the tab is hidden or the element is out of view, and for a reader who prefers reduced motion.
import { placeLabels, type LabelItem } from "../markers/labels.ts";
import { canvasRatio } from "../markers/project.ts";
import { PLACE_STYLES, putPlaces, type PlaceOnScreen, type PlaceProjector } from "./geometry.ts";
import type { Place } from "./types.ts";

/** The styles of the layer, for an element to add to its own (`#pl-canvas`, `#pl-labels` and `.pl-label` in its shadow root). */
export const PLACES_STYLE =
  "#pl-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#pl-labels{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  ".pl-label{position:absolute;left:0;top:0;margin:0;padding:0 5px;height:18px;line-height:18px;border:0;border-radius:3px;background:rgba(7,11,18,.55);color:#e9f6ff;font:12px/18px system-ui,-apple-system,sans-serif;white-space:nowrap;cursor:pointer;pointer-events:auto;text-shadow:0 0 3px #000}" +
  ".pl-label[data-kind=favourite]{color:#ffe9c4;opacity:.85}.pl-label[data-kind=satellite]{color:#cfeaff;background:rgba(7,11,18,.45);pointer-events:none;cursor:default}.pl-label[hidden]{display:none}.pl-label:focus-visible{outline:2px solid #6cd0ff;outline-offset:1px}" +
  "#pl-list{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:0;padding:0}";

/** What the host needs of its element. */
export interface PlacesHostOptions {
  /** Told when a name is pressed. */
  onClick(place: Place): void;
  /** The most names shown at once (24). */
  maxLabels?: number;
  /** Whether the reader asked for less motion: the pulse is then not drawn. */
  reducedMotion?: () => boolean;
}

/** A satellite ringed and named in the picture just drawn: its name, where it is on the screen and whether it can be seen (in the box and not behind the Earth). */
export interface MarkOnScreen {
  id: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface PlacesHost {
  /** Tells where the satellites that are ringed and named fall in the picture just drawn (an empty list takes them away). Drawn with the places, by the same rule for names. */
  setMarks(marks: readonly MarkOnScreen[]): void;
  /** Replaces the places (already checked with `readPlaces`) and draws them again. */
  set(places: readonly Place[]): void;
  /** Tells where the places fall in the picture just drawn, or `null` when there is no picture (nothing is shown). */
  frame(view: PlaceProjector | null): void;
  /** The places as they fell at the last frame, for a page or a test. */
  readonly stats: { places: number; facing: number; labels: number; renders: number; pulsing: boolean };
  dispose(): void;
}

const PULSE_MS = 2600;
const PULSE_FRAME_MS = 50;
/** How long a place that was just added or changed pulses with nothing else moving. */
const PULSE_AFTER_SET_MS = 2000;
/** How long after the last draw the view counts as still moving. */
const SETTLE_MS = 160;
const LABEL_H = 18;
const SATELLITE_COLOR = "#cfeaff";
const SATELLITE_RING_PX = 8;

/**
 * Makes the places layer of one element, inside its shadow root.
 *
 * @param root - The element's shadow root: the layer's canvas, names and list are added to it.
 * @param options - What to do on a click, the most names, and the reduced-motion question.
 * @returns The host.
 */
export function createPlacesHost(root: ShadowRoot, options: PlacesHostOptions): PlacesHost {
  const doc = root.ownerDocument;
  const canvas = doc.createElement("canvas");
  canvas.id = "pl-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const labels = doc.createElement("div");
  labels.id = "pl-labels";
  const list = doc.createElement("ul");
  list.id = "pl-list";
  let places: readonly Place[] = [];
  let view: PlaceProjector | null = null;
  let screen: PlaceOnScreen[] = [];
  let renders = 0;
  let marks: readonly MarkOnScreen[] = [];
  let shownLabels = 0;
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Until when a place that was just added or changed pulses with nothing else moving. */
  let pulseUntil = 0;
  /** The view moved a moment ago: the pulse runs with the draws that move it. */
  let moving = false;
  let hereKey = "";
  let painted = false;
  let placeIds = new Set<string>();
  let markIds = new Set<string>();
  let inView = true;
  let observer: IntersectionObserver | undefined;
  const buttons = new Map<string, HTMLElement>();
  let ruler: CanvasRenderingContext2D | null | undefined;
  const widths = new Map<string, number>();
  const max = options.maxLabels ?? 24;

  const attach = (): void => {
    if (canvas.isConnected) return;
    root.append(canvas, labels, list);
    labels.addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-id]");
      const place = button ? places.find((one) => one.id === button.dataset["id"]) : undefined;
      if (place) options.onClick(place);
    });
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        inView = last ? last.isIntersecting : true;
        if (inView) draw();
      });
      observer.observe(root.host);
    }
  };

  const textWidth = (text: string): number => {
    let width = widths.get(text);
    if (width === undefined) {
      if (ruler === undefined) ruler = doc.createElement("canvas").getContext("2d");
      if (ruler) ruler.font = "12px system-ui, -apple-system, sans-serif";
      width = Math.ceil((ruler?.measureText(text).width ?? text.length * 7) + 10);
      widths.set(text, width);
      if (widths.size > 400) widths.delete(widths.keys().next().value as string);
    }
    return width;
  };

  const hereFacing = (): boolean => screen.some((one) => one.facing && one.place.kind === "here" && PLACE_STYLES.here.pulse) && !(options.reducedMotion?.() ?? false);
  /** The timer runs only for the two seconds after a place was added or changed; while the view moves the draws that move it carry the pulse, and at rest there is none. */
  const pulsing = (): boolean => hereFacing() && performance.now() < pulseUntil;

  function paint(now: number): void {
    const v = view;
    if (!v) return;
    const ratio = canvasRatio(v.width, v.height, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(v.width * ratio));
    const h = Math.max(1, Math.round(v.height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, v.width, v.height);
    const calm = (options.reducedMotion?.() ?? false) || !(moving || now < pulseUntil);
    painted = true;
    // the satellites that are ringed and named: a ring round each, no beam
    context.strokeStyle = SATELLITE_COLOR;
    context.lineWidth = 1.2;
    context.globalAlpha = 0.85;
    for (const mark of marks) {
      if (!mark.visible) continue;
      context.beginPath();
      context.arc(mark.x, mark.y, SATELLITE_RING_PX, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    for (const one of screen) {
      if (!one.facing) continue;
      const here = one.place.kind === "here";
      const style = here ? PLACE_STYLES.here : PLACE_STYLES.favourite;
      context.globalAlpha = style.alpha;
      context.strokeStyle = style.color;
      context.fillStyle = style.color;
      // the ring on the ground
      context.lineWidth = here ? 1.4 : 1;
      context.beginPath();
      one.ring.forEach((p, k) => (k === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
      context.closePath();
      context.stroke();
      // the pulse: the ring grows from the ground and fades
      if (here && style.pulse && !calm) {
        const phase = (now % PULSE_MS) / PULSE_MS;
        const grow = 1 + 1.6 * phase;
        context.globalAlpha = style.alpha * (1 - phase) * 0.7;
        context.beginPath();
        one.ring.forEach((p, k) => {
          const x = one.footX + (p.x - one.footX) * grow;
          const y = one.footY + (p.y - one.footY) * grow;
          if (k === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
        context.stroke();
        context.globalAlpha = style.alpha;
      }
      // the beam, bright where it leaves the ground and fading as it rises
      const gradient = context.createLinearGradient(one.footX, one.footY, one.headX, one.headY);
      gradient.addColorStop(0, style.color);
      gradient.addColorStop(1, "rgba(255,255,255,0.08)");
      context.strokeStyle = gradient;
      context.lineWidth = here ? 1.6 : 1.1;
      context.beginPath();
      context.moveTo(one.footX, one.footY);
      context.lineTo(one.headX, one.headY);
      context.stroke();
      // the head
      context.fillStyle = style.color;
      context.shadowColor = style.color;
      context.shadowBlur = here ? 8 : 3;
      context.beginPath();
      context.arc(one.headX, one.headY, style.headPx, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    }
  }

  /** Lays the names out for the places and the ringed satellites at the last frame, and hides the ones that do not fit (or all of them, with no view). */
  function arrange(): void {
    const v = view;
    const items: LabelItem[] = [];
    const named: { key: string; id: string; label: string; kind: string }[] = [];
    if (v) {
      screen.forEach((one, index) => {
        if (!one.facing || !one.place.label) return;
        const style = one.place.kind === "here" ? PLACE_STYLES.here : PLACE_STYLES.favourite;
        items.push({ x: one.headX, y: one.headY, r: style.headPx + 3, w: textWidth(one.place.label), h: LABEL_H, priority: one.place.kind === "here" ? 1_000_000 : 1000 - index });
        named.push({ key: `p:${one.place.id}`, id: one.place.id, label: one.place.label, kind: one.place.kind ?? "favourite" });
      });
      // the satellites' names come after the places' (a place is the page's own marker), each beside its ring
      marks.forEach((mark, index) => {
        if (!mark.visible || mark.label === "") return;
        items.push({ x: mark.x, y: mark.y, r: SATELLITE_RING_PX + 2, w: textWidth(mark.label), h: LABEL_H, priority: 500 - index });
        named.push({ key: `s:${mark.id}`, id: mark.id, label: mark.label, kind: "satellite" });
      });
    }
    const placed = v ? placeLabels(items, v.width, v.height, max) : [];
    const shown = new Set<string>();
    for (const spot of placed) {
      const one = named[spot.item]!;
      shown.add(one.key);
      let button = buttons.get(one.key);
      if (!button) {
        // a place's name is a button that can be pressed; a satellite's is a name beside its ring and nothing more
        if (one.kind === "satellite") button = doc.createElement("span");
        else {
          button = doc.createElement("button");
          (button as HTMLButtonElement).type = "button";
          button.dataset["id"] = one.id;
        }
        button.className = "pl-label";
        labels.append(button);
        buttons.set(one.key, button);
      }
      if (button.textContent !== one.label) button.textContent = one.label;
      if (button.dataset["kind"] !== one.kind) button.dataset["kind"] = one.kind;
      if (button.hidden) button.hidden = false;
      button.style.transform = `translate(${Math.round(spot.left)}px,${Math.round(spot.top)}px)`;
    }
    for (const [key, button] of buttons) {
      if (shown.has(key)) continue;
      // a name whose place or satellite has gone is taken away; one that did not fit this time is only hidden
      const alive = key.startsWith("p:") ? placeIds.has(key.slice(2)) : markIds.has(key.slice(2));
      if (!alive) {
        button.remove();
        buttons.delete(key);
      } else if (!button.hidden) button.hidden = true;
    }
    shownLabels = shown.size;
  }

  /** The list for a screen reader holds every place, drawn or not: made when the places are set, not at each draw. */
  function describe(): void {
    list.replaceChildren(...places.map((one) => Object.assign(doc.createElement("li"), { textContent: one.label ?? one.id })));
  }

  function clearCanvas(): void {
    if (!painted) return;
    painted = false;
    const context = canvas.getContext("2d");
    context?.setTransform(1, 0, 0, 1, 0, 0);
    context?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function draw(): void {
    if (!view) return;
    renders += 1;
    paint(performance.now());
    schedule();
  }

  function schedule(): void {
    if (pulseTimer !== undefined) return;
    if (!pulsing() || !inView || doc.visibilityState === "hidden") return;
    pulseTimer = setTimeout(() => {
      pulseTimer = undefined;
      if (!view || !inView || doc.visibilityState === "hidden") return;
      renders += 1;
      paint(performance.now());
      if (pulsing()) schedule();
      else if (hereFacing()) {
        // the two seconds are over: one last drawing with no pulse in it, and the layer rests
        renders += 1;
        paint(performance.now());
      }
    }, PULSE_FRAME_MS);
  }

  /** The view has moved: the pulse rides on the draws that move it, and one more drawing, with no pulse, follows when they stop. */
  function moved(): void {
    moving = true;
    clearTimeout(settleTimer);
    if (!hereFacing()) {
      settleTimer = undefined;
      return;
    }
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      moving = false;
      if (!view || !hereFacing() || performance.now() < pulseUntil) return;
      renders += 1;
      paint(performance.now());
    }, SETTLE_MS);
  }

  return {
    setMarks(next) {
      marks = next;
      markIds = new Set(next.map((mark) => mark.id));
      attach();
      arrange();
      if (!view) clearCanvas();
      else draw();
    },
    set(next) {
      places = next;
      placeIds = new Set(next.map((one) => one.id));
      attach();
      describe();
      // a place of the visitor's own that is new or has moved pulses for two seconds, then rests
      const here = next.filter((one) => one.kind === "here").map((one) => `${one.id}|${one.lat}|${one.lon}`).join(";");
      if (here !== "" && here !== hereKey) pulseUntil = performance.now() + PULSE_AFTER_SET_MS;
      hereKey = here;
      screen = view ? putPlaces(places, view) : [];
      arrange();
      if (!view) clearCanvas();
      else draw();
    },
    frame(next) {
      view = next;
      if (places.length === 0 && marks.length === 0 && screen.length === 0 && !painted && shownLabels === 0) return;
      attach();
      screen = next ? putPlaces(places, next) : [];
      arrange();
      if (!next) {
        clearCanvas();
        return;
      }
      moved();
      draw();
    },
    get stats() {
      return { places: places.length, facing: screen.filter((one) => one.facing).length, labels: shownLabels, renders, pulsing: pulseTimer !== undefined };
    },
    dispose() {
      clearTimeout(pulseTimer);
      clearTimeout(settleTimer);
      pulseTimer = undefined;
      settleTimer = undefined;
      observer?.disconnect();
      canvas.remove();
      labels.remove();
      list.remove();
      buttons.clear();
    },
  };
}
