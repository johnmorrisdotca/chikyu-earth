// <chikyu-earth>: the globe as a web component. A shared view controller supplies its yaw, tilt, zoom and pan;
// it opens centred on the `center` attribute (0,0 without one) and never asks the browser where the reader is. Importing registers it once.
import { carryControls, type ElementControls, type ViewController } from "@johnmorrisdotca/kazoku-ui/view-controls";
import { adoptStyles } from "./adopt.ts";
import { globe } from "./globe.ts";
import { readRoute, routeLeg, routeText, type RouteLeg } from "./route.ts";
import { cleanStyle } from "./styles.ts";
import { globeBaseScale, HOME_VIEW, lookAt } from "./view.ts";
import type { OverlayHost, OverlayPose } from "./markers/layer.ts";
import { project } from "./markers/project.ts";
import { readSeaNames } from "./sea-names/geometry.ts";
import { SEA_NAMES_STYLE, createSeaHost, type SeaHost, type SeaNamesStats } from "./sea-names/host.ts";
import type { GeoPoint, GlobeView } from "./types.ts";

const readCentre = (value: string | null): GeoPoint | null => {
  if (!value) return null;
  const [lon, lat] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return { lon, lat };
};

/** The least time between two redraws of the projection while a hand is turning the globe: 30 a second at most. */
const LIVE_MS = 1000 / 30;
/** The automatic turn is slow enough that one redraw a second is smooth. */
const AUTO_MS = 1000;
/** Tilt to the poles; zoom from a tenth of Fit, which leaves the whole globe small in the view, to 20 times: the outlines are Natural Earth 1:110m, and past about 20 times their straight segments are longer than the view is wide. */
const LIMITS = { tiltMax: 90, zoomMin: 0.1, zoomMax: 20 };
const STYLE = ":host{display:block;position:relative;isolation:isolate}.holder svg{display:block;width:100%;height:auto}.overlay{position:absolute;inset:0;pointer-events:none;transform-origin:50% 50%}" + SEA_NAMES_STYLE;

/**
 * The `<chikyu-earth>` custom element: the line globe, drawn as SVG in its shadow root. Importing this entry point registers the tag once. It takes the attributes `size` (pixels, 320 by default), `center` (`"lon,lat"`; wins over the browser's location), `look` (`line` or `thick`; `style` is the older name for it, and a framework that reads `style` as CSS cannot use it) and `graticule`, and a shared view controller's camera through `setView`.
 * It carries kazoku-ui's controls itself: a drag turns it, two fingers pinch, Ctrl and the wheel zoom (a plain wheel at Fit scrolls the page) and the arrow keys, + and - work once it is focused, from a tenth of Fit to 20 times. `controls="none"` turns them off; `zoom-min` and `zoom-max` change the range. A `<kazoku-view-controls for="...">` on the element takes the hands over, and the page applies its events with `setView`.
 *
 * @example
 * ```ts no-run
 * import type { ChikyuEarth } from "@johnmorrisdotca/chikyu-earth/element";
 *
 * const earth = document.createElement("chikyu-earth") as ChikyuEarth;
 * earth.setAttribute("center", "139.7,35.7");
 * earth.setAttribute("look", "thick");
 * document.body.append(earth);
 * ```
 */
export class ChikyuEarth extends HTMLElement {
  static observedAttributes = ["center", "look", "style", "size", "graticule", "route", "sea-names", "lang"];

  #centre: GeoPoint = { lon: 0, lat: 0 };
  #view: GlobeView = { ...HOME_VIEW };
  #drawn: GlobeView = { ...HOME_VIEW };
  #listeners = new Set<(pose: OverlayPose) => void>();
  #overlay: HTMLElement | undefined;
  #seas: SeaHost | undefined;
  #pose: OverlayPose | null = null;
  #liveTimer: ReturnType<typeof setTimeout> | undefined;
  #liveAt = 0;
  #hands: ElementControls | undefined;

  /** The controller behind the element's own hands (`play`, `set`, `fit`, `state`), while it is in a page. */
  get controller(): ViewController | undefined {
    return this.#hands?.controller;
  }

  /** Where the view is centred now: the `center` attribute, else 0,0. The element never asks the browser where the reader is. */
  get centre(): GeoPoint {
    return { ...this.#centre };
  }

  /**
   * A route between two places (the attribute `route`, `lon,lat,lon,lat`). Null, the default, draws none. The line is the WGS84 geodesic, split at the date line.
   * Setting the property writes the attribute. Nothing is drawn again at rest: the line is part of the picture, which is drawn when the view or the route changes.
   */
  get route(): { from: GeoPoint; to: GeoPoint } | null {
    return readRoute(this.getAttribute("route"));
  }
  set route(value: { from: GeoPoint; to: GeoPoint } | null) {
    if (!value) this.removeAttribute("route");
    else this.setAttribute("route", routeText(value));
  }

  /**
   * Names of oceans, seas and continents (the attribute `sea-names`). Off unless set: a bare attribute is on. Oceans and continents from far out, seas once the Earth is large on the screen. Nothing is drawn again at rest.
   *
   * @example
   * ```ts no-run
   * import type { ChikyuEarth } from "@johnmorrisdotca/chikyu-earth/element";
   *
   * const earth = document.querySelector("chikyu-earth") as ChikyuEarth;
   * earth.seaNames = true;
   * console.log(earth.seaNames);
   * earth.seaNames = false;
   * ```
   */
  get seaNames(): boolean {
    return readSeaNames(this.getAttribute("sea-names"));
  }
  set seaNames(value: boolean) {
    if (value) this.setAttribute("sea-names", "");
    else this.removeAttribute("sea-names");
  }

  /**
   * Whether `sea-names` is on, the Earth's radius on the screen, the names shown, and how many times they were laid out.
   *
   * @example
   * ```ts no-run
   * import type { ChikyuEarth } from "@johnmorrisdotca/chikyu-earth/element";
   *
   * const earth = document.querySelector("chikyu-earth") as ChikyuEarth;
   * console.log(earth.stats.seaNames.on);
   * ```
   */
  get stats(): { seaNames: SeaNamesStats } {
    return { seaNames: this.#seas?.stats ?? { on: false, radius: 0, names: 0, renders: 0 } };
  }

  /** The distance, bearings and flight-time estimate for `route`, or null when none is set. The flight time assumes 900 km/h. */
  get routeInfo(): RouteLeg | null {
    const route = this.route;
    return route ? routeLeg(route.from, route.to) : null;
  }

  /** A box laid over the globe for markers (see `@johnmorrisdotca/chikyu-earth/markers`): where it is, the pose of the last drawing, and a way to hear the next. */
  get overlay(): OverlayHost {
    this.#ensureShell();
    return {
      overlayRoot: this.#overlay!,
      pose: this.#pose,
      subscribe: (listener) => {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
      },
    };
  }

  disconnectedCallback(): void {
    clearTimeout(this.#liveTimer);
    this.#liveTimer = undefined;
    this.#hands?.unbind();
    this.#hands = undefined;
    this.#seas?.dispose();
    this.#seas = undefined;
  }

  connectedCallback(): void {
    this.#centre = readCentre(this.getAttribute("center")) ?? { lon: 0, lat: 0 };
    this.#render();
    this.#hands = carryControls(this, {
      initial: this.#view,
      grabRadius: "fit",
      limits: LIMITS,
      onChange: (state, info) => this.setView(state, info.final, info.reason !== "auto"),
    });
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "center") this.#centre = readCentre(value) ?? { lon: 0, lat: 0 };
    if (this.isConnected) this.#render();
  }

  /**
   * Apply a shared controller's camera. Every event updates the state; `final: false` makes only the cheap
   * relative transform, and `final: true` redraws the orthographic projection. `live: true` says a hand is on the view (a drag, a pinch, a key held):
   * the projection is then also redrawn while it turns, at most 30 times a second, so the globe follows the pointer instead of jumping when it is let go.
   * The automatic turn leaves `live` off and is drawn about once a second.
   */
  setView(view: GlobeView, final = true, live = false): void {
    this.#view = { ...view };
    if (final) {
      clearTimeout(this.#liveTimer);
      this.#liveTimer = undefined;
      this.#render();
      return;
    }
    const turned = view.yaw !== this.#drawn.yaw || view.tilt !== this.#drawn.tilt;
    if (!live && turned && performance.now() - this.#liveAt >= AUTO_MS) {
      this.#render();
      return;
    }
    this.#transform();
    if (live && turned && this.#liveTimer === undefined) {
      const wait = Math.max(0, LIVE_MS - (performance.now() - this.#liveAt));
      this.#liveTimer = setTimeout(() => {
        this.#liveTimer = undefined;
        this.#render();
      }, wait);
    }
  }

  #transform(): void {
    const svg = this.shadowRoot?.querySelector("svg");
    if (!svg) return;
    const zoom = this.#view.zoom / this.#drawn.zoom;
    const x = this.#view.panX - this.#drawn.panX;
    const y = this.#view.panY - this.#drawn.panY;
    svg.style.transformOrigin = "50% 50%";
    svg.style.transform = zoom === 1 && x === 0 && y === 0 ? "" : `translate(${x}px, ${y}px) scale(${zoom})`;
    this.#publish(svg.style.transform);
  }

  /** The shell: the picture's holder and the overlay for markers, made once; a redraw replaces only the picture. */
  #ensureShell(): ShadowRoot {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    if (!this.#overlay || !root.contains(this.#overlay)) {
      root.innerHTML = `<div class="holder"></div><div class="overlay"></div>`;
      adoptStyles(root, STYLE, this.nonce);
      this.#overlay = root.querySelector<HTMLElement>(".overlay")!;
    }
    return root;
  }

  #publish(transform: string): void {
    if (this.#listeners.size === 0) {
      this.#pose = null;
      return;
    }
    const size = Number(this.getAttribute("size")) || 320;
    const k = (this.clientWidth || size) / size;
    const look = lookAt(this.#centre, this.#drawn);
    const pose: OverlayPose = {
      lon: look.lon,
      lat: look.lat,
      radius: globeBaseScale(size) * this.#drawn.zoom * k,
      cx: (size / 2 + this.#drawn.panX) * k,
      cy: (size / 2 + this.#drawn.panY) * k,
      width: size * k,
      height: size * k,
      transform,
    };
    this.#pose = pose;
    for (const listener of this.#listeners) listener(pose);
  }

  #render(): void {
    this.#liveAt = performance.now();
    const size = Number(this.getAttribute("size")) || 320;
    const style = cleanStyle(this.getAttribute("look") ?? this.getAttribute("style"));
    const svg = globe({ size, style, centre: this.#centre, view: this.#view, graticule: this.hasAttribute("graticule"), route: readRoute(this.getAttribute("route")) });
    const root = this.#ensureShell();
    root.querySelector(".holder")!.innerHTML = svg;
    this.#drawn = { ...this.#view };
    this.#publish("");
    this.#placeSeas();
  }

  /** Lays the ocean, sea and continent names on the picture just drawn. Off, or at rest, it adds nothing. */
  #placeSeas(): void {
    const root = this.shadowRoot;
    if (!root) return;
    if (!this.#seas) {
      this.#seas = createSeaHost({
        root,
        attribute: (name) => this.getAttribute(name),
        language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
      });
    }
    this.#seas.refresh();
    if (!readSeaNames(this.getAttribute("sea-names"))) {
      this.#seas.frame(null);
      return;
    }
    const size = Number(this.getAttribute("size")) || 320;
    const k = (this.clientWidth || size) / size;
    const look = lookAt(this.#centre, this.#drawn);
    const radius = globeBaseScale(size) * this.#drawn.zoom * k;
    const cx = (size / 2 + this.#drawn.panX) * k;
    const cy = (size / 2 + this.#drawn.panY) * k;
    const pose = { lon: look.lon, lat: look.lat, radius, cx, cy };
    this.#seas.frame({
      width: size * k,
      height: size * k,
      radius,
      disc: { x: cx, y: cy, radius },
      project: (lon, lat, out) => {
        const at = project(lon, lat, pose);
        out.x = at.x;
        out.y = at.y;
        return at.z;
      },
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "chikyu-earth": ChikyuEarth;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-earth")) {
  customElements.define("chikyu-earth", ChikyuEarth);
}
