// <chikyu-earth-realistic>: the Earth from space as a web component, drawn by kazoku-ui's shared 3D renderer (one WebGL context for the
// page) with three.js, which is the page's own. Optional entry point: the flat `<chikyu-earth>` needs neither. It draws only when something
// changes, at most 30 times a second, and nothing at all while it is out of sight or the tab is hidden.
import { createSharedRenderer, type SharedRenderer, type View } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { GeoPoint, GlobeView } from "../types.ts";
import { createEarthItem, lookAt, newModel, type EarthModel, type ThreeParts } from "./earth.ts";
import { createGate, frameCap, type Gate } from "./gate.ts";
import type { OverlayHost, OverlayPose } from "../markers/layer.ts";
import { MAX_TEXTURE, TIERS, type Layer } from "./tiers.ts";

type Three = ThreeParts;
/**
 * What the realistic Earth is doing: `loading` its pictures, `live` and drawing, `unavailable` (no WebGL), `lost` (the GPU took the context; it comes back by itself) or `idle` (another view has the page's one WebGL context; press or focus it to take it).
 *
 * @example
 * ```ts no-run
 * import type { ChikyuEarthRealistic, EarthState } from "@johnmorrisdotca/chikyu-earth/realistic/element";
 *
 * const describe = (earth: ChikyuEarthRealistic): EarthState => earth.stats.state;
 * console.log(typeof describe);
 * ```
 */
export type EarthState = "loading" | "live" | "unavailable" | "lost" | "idle";

const RAD = Math.PI / 180;
/** The Sun and the clouds are re-placed this often while the time is "now": 15 degrees an hour is 0.25 degree a minute. */
const LIVE_TICK_MS = 60_000;
const MIN_TICK_MS = 1000;

const readCentre = (value: string | null): GeoPoint | null => {
  if (!value) return null;
  const [lon, lat] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon!) > 180 || Math.abs(lat!) > 90) return null;
  return { lon: lon!, lat: lat! };
};

/**
 * A `time` attribute: "now" (or none) follows the clock, else an ISO date such as 2026-06-21T12:00:00Z.
 *
 * @param value - The attribute's text, or `null` when it is not there.
 * @returns The moment in milliseconds since the Unix epoch, or `"now"` when the value is empty, `"now"` or not a date.
 *
 * @example
 * ```ts no-run
 * import { readTime } from "@johnmorrisdotca/chikyu-earth/realistic/element";
 *
 * console.log(readTime("2026-06-21T12:00:00Z"), readTime(null), readTime("tomorrow"));
 * ```
 */
export const readTime = (value: string | null): number | "now" => {
  if (value === null || value === "" || value === "now") return "now";
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : "now";
};

// --- one renderer for the page ----------------------------------------------------------------------------------------------------------------------
let shared: SharedRenderer<Three> | undefined;
let loader: () => Promise<Three> = () => import("three");
const contextListeners = new Set<(state: "lost" | "restored" | "unavailable") => void>();
let elements = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Where three.js comes from, if a page wants to hand it over itself (before the first element connects). A page that hands over a module re-exporting only the parts the Earth uses ships a few hundred kilobytes of three.js instead of all of it.
 *
 * @param load - Returns the parts of three.js the Earth uses, as a promise.
 *
 * @example
 * ```ts no-run
 * import { setThreeLoader } from "@johnmorrisdotca/chikyu-earth/realistic/element";
 *
 * setThreeLoader(() => import("three"));
 * ```
 */
export function setThreeLoader(load: () => Promise<Three>): void {
  loader = load;
}

function renderer(): SharedRenderer<Three> {
  shared ??= createSharedRenderer<Three>({
    load: () => loader(),
    onContext: (state) => {
      for (const listener of contextListeners) listener(state);
    },
  });
  return shared;
}

/**
 * The `<chikyu-earth-realistic>` custom element: the Earth from space, drawn with three.js through kazoku-ui's shared renderer (one WebGL context for the page). It takes `center` (`"lon,lat"`), `time` (`now` or an ISO date; the real Sun at that moment), `clouds="off"`, `lights="off"`, `live-seconds` and `texture-base` (where the pictures are served from), and a shared view controller's camera through `setView`. It draws only when something changes, at most 30 times a second, and nothing while it is out of sight or the tab is hidden.
 *
 * @example
 * ```ts no-run
 * import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";
 *
 * const earth = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
 * earth.setAttribute("center", "139.7,35.7");
 * earth.setAttribute("time", "2026-06-21T03:00Z");
 * earth.setAttribute("texture-base", "/textures/");
 * document.body.append(earth);
 * ```
 */
export class ChikyuEarthRealistic extends HTMLElement {
  static observedAttributes = ["center", "time", "clouds", "lights", "live-seconds"];

  #model: EarthModel = newModel();
  #mode: number | "now" = "now";
  #view: View | undefined;
  #gate: Gate | undefined;
  #tick: ReturnType<typeof setInterval> | undefined;
  #state: EarthState = "loading";
  #tiers: Record<Layer, number> = { day: TIERS.day[0]!, night: TIERS.night[0]!, clouds: TIERS.clouds[0]!, water: TIERS.water[0]! };
  #stage: HTMLElement | undefined;
  #overlay: HTMLElement | undefined;
  #pose: OverlayPose | null = null;
  #listeners = new Set<(pose: OverlayPose) => void>();
  #onContext = (state: "lost" | "restored" | "unavailable"): void => {
    if (state === "unavailable") this.#fail("WebGL is not available");
  };
  // The canvas's own events reach the stage in the capture phase (they do not bubble); the shared renderer handles them and this follows.
  #lost = (): void => this.#set("lost");
  #restored = (): void => this.#set("live");

  connectedCallback(): void {
    clearTimeout(releaseTimer);
    elements += 1;
    this.#model.centre = readCentre(this.getAttribute("center")) ?? this.#model.centre;
    this.#mode = readTime(this.getAttribute("time"));
    this.#model.time = this.#mode === "now" ? Date.now() : this.#mode;
    this.#model.clouds = this.getAttribute("clouds") !== "off";
    this.#model.lights = this.getAttribute("lights") !== "off";
    if (!this.hasAttribute("role")) this.setAttribute("role", "img");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "The Earth from space, with its sunlit and dark sides");

    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;aspect-ratio:1/1;position:relative}#stage,#overlay{position:absolute;inset:0}#overlay{pointer-events:none}</style><div id="stage"></div><div id="overlay"></div>`;
    this.#stage = root.getElementById("stage")!;
    this.#overlay = root.getElementById("overlay")!;
    this.#stage.addEventListener("webglcontextlost", this.#lost, true);
    this.#stage.addEventListener("webglcontextrestored", this.#restored, true);

    const nav = navigator as Navigator & { deviceMemory?: number; getBattery?: () => Promise<{ charging: boolean; level: number }> };
    const cap = frameCap(30, { deviceMemory: nav.deviceMemory, hardwareConcurrency: nav.hardwareConcurrency });
    this.#gate = createGate(1000 / cap, () => this.#view?.invalidate());
    nav.getBattery?.().then(
      (battery) => {
        if (!battery.charging && battery.level <= 0.2) this.#gate?.setMinMs(1000 / Math.min(cap, 15));
      },
      () => undefined,
    );

    contextListeners.add(this.#onContext);
    const item = createEarthItem(this.#model, {
      assets: renderer().assets,
      textureBase: () => this.#textureBase(),
      cap: () => this.#textureCap(),
      drift: 1.5,
      invalidate: () => this.#gate?.request(),
      onPose: (pose) => {
        this.#pose = { ...pose, transform: "" };
        for (const listener of this.#listeners) listener(this.#pose);
      },
      onError: (error) => this.#fail(error instanceof Error ? error.message : String(error)),
      onTier: (layer, width) => {
        this.#tiers[layer] = width;
        this.dispatchEvent(new CustomEvent("chikyu-tier", { detail: { layer, width } }));
      },
    });
    this.#view = renderer().view(this.#stage, item, { still: null });
    this.#set("loading");
    void this.#view.focus().then((live) => {
      if (live) {
        this.#set("live");
        this.dispatchEvent(new CustomEvent("chikyu-ready"));
      } else if (this.#state === "loading") this.#set(this.#view?.live === false && renderer().focused !== undefined ? "idle" : "unavailable");
    });
    this.addEventListener("pointerdown", this.#take);
    this.addEventListener("focusin", this.#take);
    this.#startTick();
    this.#locate();
  }

  disconnectedCallback(): void {
    this.removeEventListener("pointerdown", this.#take);
    this.removeEventListener("focusin", this.#take);
    clearInterval(this.#tick);
    this.#tick = undefined;
    this.#gate?.cancel();
    this.#view?.dispose();
    this.#view = undefined;
    contextListeners.delete(this.#onContext);
    elements -= 1;
    if (elements <= 0) {
      releaseTimer = setTimeout(() => {
        if (elements <= 0) {
          shared?.dispose();
          shared = undefined;
        }
      }, 1000);
    }
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "center") this.centre = readCentre(value) ?? { lon: 0, lat: 0 };
    else if (name === "time") this.time = readTime(value);
    else if (name === "clouds") this.clouds = value !== "off";
    else if (name === "lights") this.lights = value !== "off";
    else if (name === "live-seconds") this.#startTick();
  }

  /** A box laid over the Earth for markers (see `@johnmorrisdotca/chikyu-earth/markers`): where it is, the pose of the last draw, and a way to hear the next. */
  get overlay(): OverlayHost {
    if (!this.#overlay) throw new Error("chikyu-earth-realistic: attach markers once the element is in the page");
    return {
      overlayRoot: this.#overlay!,
      pose: this.#pose,
      subscribe: (listener) => {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
      },
    };
  }

  /** Where the view starts: longitude and latitude; the shared controls' yaw and tilt turn it from there. */
  get centre(): GeoPoint {
    return { ...this.#model.centre };
  }
  set centre(value: GeoPoint) {
    this.#model.centre = { ...value };
    this.#gate?.request();
  }

  /** The moment shown: milliseconds since the epoch, or "now" to follow the clock. */
  get time(): number | "now" {
    return this.#mode;
  }
  set time(value: number | Date | "now") {
    this.#mode = value instanceof Date ? value.getTime() : value;
    if (this.#mode === "now") this.#model.time = Date.now();
    else this.#model.time = this.#mode;
    this.#startTick();
    this.#gate?.request();
  }

  get clouds(): boolean {
    return this.#model.clouds;
  }
  set clouds(value: boolean) {
    this.#model.clouds = value;
    this.#gate?.request();
  }

  get lights(): boolean {
    return this.#model.lights;
  }
  set lights(value: boolean) {
    this.#model.lights = value;
    this.#gate?.request();
  }

  /** What the element is doing, for a page or a test: its state, the texture widths held, the draws made. */
  get stats(): { state: EarthState; tiers: Record<Layer, number>; draws: number; contexts: number; canvas: { width: number; height: number; pixels: number }; assets: { entries: number; refs: number } } {
    const stats = renderer().stats;
    return { state: this.#state, tiers: { ...this.#tiers }, draws: stats.draws, contexts: stats.contexts, canvas: stats.canvas, assets: { entries: stats.assets.entries, refs: stats.assets.refs } };
  }

  /**
   * Apply a shared view controller's camera (yaw, tilt, zoom, pan). A change under half a pixel is not drawn, a settled change always is,
   * and draws are at most 30 a second.
   */
  setView(view: GlobeView, final = true): void {
    this.#model.view = { ...view };
    const drawn = this.#model.drawn;
    if (!drawn) {
      this.#gate?.request();
      return;
    }
    const shifted = view.zoom !== drawn.view.zoom || view.panX !== drawn.view.panX || view.panY !== drawn.view.panY;
    const a = lookAt(drawn.centre, drawn.view);
    const b = lookAt(this.#model.centre, view);
    const px = (Math.abs(b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RAD) + Math.abs(b.lat - a.lat)) * RAD * drawn.radius;
    if (shifted || px >= 0.5 || (final && px > 0.01)) this.#gate?.request();
  }

  /** The view as it is (for a page that wants to read it back). */
  get view(): GlobeView {
    return { ...this.#model.view };
  }

  /** While the time is "now", the Sun and the clouds are put right once a minute (`live-seconds` changes that): no frames between. */
  #startTick(): void {
    clearInterval(this.#tick);
    this.#tick = undefined;
    if (!this.isConnected || this.#mode !== "now") return;
    const seconds = Number(this.getAttribute("live-seconds"));
    const ms = Number.isFinite(seconds) && seconds > 0 ? Math.max(MIN_TICK_MS, seconds * 1000) : LIVE_TICK_MS;
    this.#tick = setInterval(this.#onTick, ms);
  }

  #onTick = (): void => {
    this.#model.time = Date.now();
    this.#gate?.request();
  };

  #take = (): void => {
    if (this.#view && !this.#view.live) void this.#view.focus();
  };

  #textureBase(): string {
    const given = this.getAttribute("texture-base");
    const base = given ?? new URL("../textures/", import.meta.url).href;
    return base.endsWith("/") ? base : `${base}/`;
  }

  #textureCap(): number {
    const given = Number(this.getAttribute("max-texture"));
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const cap = Number.isFinite(given) && given > 0 ? Math.min(given, MAX_TEXTURE) : MAX_TEXTURE;
    return memory !== undefined && memory <= 2 ? Math.min(cap, 2048) : cap;
  }

  #set(state: EarthState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.dataset["state"] = state;
  }

  #fail(reason: string): void {
    this.#set("unavailable");
    this.dispatchEvent(new CustomEvent("chikyu-unavailable", { detail: { reason } }));
  }

  #locate(): void {
    if (readCentre(this.getAttribute("center")) || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.centre = { lon: position.coords.longitude, lat: position.coords.latitude };
      },
      () => undefined,
      { timeout: 8000, maximumAge: 600000 },
    );
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-earth-realistic")) {
  customElements.define("chikyu-earth-realistic", ChikyuEarthRealistic);
}
