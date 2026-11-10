// <chikyu-earth-realistic>: the Earth from space as a web component, drawn by kazoku-ui's shared 3D renderer (one WebGL context for the
// page) with three.js, which is the page's own. Optional entry point: the flat `<chikyu-earth>` needs neither. It draws only when something
// changes, at most 30 times a second, and nothing at all while it is out of sight or the tab is hidden.
import { carryControls, type ElementControls, type ViewController } from "@johnmorrisdotca/kazoku-ui/view-controls";
import { adoptStyles } from "../adopt.ts";
import type { SharedRenderer, View } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { GeoPoint, GlobeView } from "../types.ts";
import { createEarthItem, discRadius, lookAt, newModel, type EarthModel, type LightMode, type ThreeParts } from "./earth.ts";
import { createGate, frameCap, type Gate } from "./gate.ts";
import { setSharedRenderer, setThreeLoader, takeRenderer } from "./shared.ts";
export { setSharedRenderer, setThreeLoader };
import type { OverlayHost, OverlayPose } from "../markers/layer.ts";
import { MAX_TEXTURE, TIERS, type Layer } from "./tiers.ts";
import type { TileStats } from "./tile-set.ts";

type EarthLayer = Extract<Layer, "day" | "night" | "clouds" | "water">;

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

const STYLE = ":host{display:block;aspect-ratio:1/1;position:relative}#stage,#overlay{position:absolute;inset:0}#overlay{pointer-events:none}";
const RAD = Math.PI / 180;
/** The Sun and the clouds are re-placed this often at real time: 15 degrees an hour is 0.25 degree a minute. */
const LIVE_TICK_MS = 60_000;
const MIN_TICK_MS = 1000;
/** The least time between two `chikyu-timechange` events while time runs: a few a second at most, however fast the picture is drawn. */
const TIME_EVENT_MS = 250;
/** How fast the Sun goes round the Earth, degrees a second of real time (the light, the night side and the clouds' drift all follow it). */
const SUN_RATE = 360 / 86_400;
/** Tilt to the poles; zoom from a tenth of Fit, which leaves the whole Earth small in the view, to 5 times: the package's own pictures are sharp to about 5 times. */
const LIMITS = { tiltMax: 90, zoomMin: 0.1, zoomMax: 5 };
/** With the finer tiles the detail runs 4 times further: the finest level is 4 times wider than the widest picture. */
const TILES_ZOOM_MAX = "20";

const readCentre = (value: string | null): GeoPoint | null => {
  if (!value) return null;
  const [lon, lat] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon!) > 180 || Math.abs(lat!) > 90) return null;
  return { lon: lon!, lat: lat! };
};

/** A `light` attribute: `lit` or `boost`, else the true sun. */
const readLight = (value: string | null): LightMode => (value === "lit" || value === "boost" ? value : "sun");

const readRatio = (value: string | null): number | undefined => {
  const ratio = Number(value);
  return value !== null && Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, 2) : undefined;
};

/**
 * A `speed` attribute: how many seconds pass for each real second.
 *
 * @param value - The attribute's text, or `null` when it is not there.
 * @returns The speed, or `null` when the value is empty or not a number (the clock then follows `time`: real time for "now", held for a date).
 *
 * @example
 * ```ts no-run
 * import { readSpeed } from "@johnmorrisdotca/chikyu-earth/realistic/element";
 *
 * console.log(readSpeed("86400"), readSpeed("-3600"), readSpeed(null));
 * ```
 */
export const readSpeed = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null;
  const speed = Number(value);
  return Number.isFinite(speed) ? speed : null;
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

/**
 * The `<chikyu-earth-realistic>` custom element: the Earth from space, drawn with three.js through kazoku-ui's shared renderer (one WebGL context for the page). It takes `center` (`"lon,lat"`), `time` (`now` or an ISO date; the real Sun at that moment), `clouds="off"`, `lights="off"`, `live-seconds`, `texture-base` (where the pictures are served from), `tiles` (where a set of finer map tiles is served from, see the Earth tiles guide: only the tiles in view are loaded, over the package's own pictures, which stay as the far view and the fallback; without it, or when a tile cannot be fetched, the Earth is drawn as before) and `max-ratio` (the most device pixels to a CSS pixel the canvas is drawn at, 2 at most, and `0.5` draws at half the size and scales it up: for a background; read when the element connects, and it is the shared renderer's cap for the whole page), and a shared view controller's camera through `setView`. It draws only when something changes, at most 30 times a second, and nothing while it is out of sight or the tab is hidden.
 *
 * It has a clock, like `<chikyu-space>`'s: `speed` is how many seconds pass for each real second (`1` is real time, `0` holds, `3600` is an hour a second, `86400` a day a second, a negative number runs backwards), and the clock runs from `time`, the moment shown.
 * The Sun's light, the night side and the clouds follow it. Without a `speed`, nothing about a page from before changes: `time="now"` (or no `time`) follows the real clock, the Sun and the clouds put right every `live-seconds` (a minute by default, a second at the least),
 * and a date holds still. A `speed` runs the clock from the moment shown at that rate (from now, when `time` is "now"); `speed="0"` holds it. At real time it steps every `live-seconds`; faster, it draws as often as the Sun's turn moves a pixel, once a second at least and 30 a second at most
 * (a reader who prefers reduced motion gets one step a second), and nothing at all while it is held, out of sight or in a hidden tab.
 *
 * While time runs it sends `chikyu-timechange` with `detail: { time, running: true }` (the moment shown in milliseconds since 1970), at most four times a second however fast the picture is drawn and not from a hidden tab, and once with `running: false` when the clock holds
 * (a date is set, or `speed` is set to 0): a page writes the date into its date box from it. It is not sent for a `time` the page sets itself.
 *
 * @example
 * ```ts no-run
 * import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";
 *
 * const earth = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
 * earth.setAttribute("center", "139.7,35.7");
 * earth.setAttribute("time", "2026-06-21T03:00Z");
 * earth.setAttribute("texture-base", "/textures/");
 * earth.setAttribute("tiles", "/tiles/");
 * earth.setAttribute("speed", "86400");
 * earth.addEventListener("chikyu-timechange", (event) => {
 *   const { time, running } = (event as CustomEvent<{ time: number; running: boolean }>).detail;
 *   console.log(new Date(time).toISOString(), running ? "running" : "held");
 * });
 * document.body.append(earth);
 * ```
 */
export class ChikyuEarthRealistic extends HTMLElement {
  static observedAttributes = ["center", "time", "speed", "clouds", "lights", "light", "live-seconds", "tiles"];

  #model: EarthModel = newModel();
  #mode: number | "now" = "now";
  #view: View | undefined;
  #gate: Gate | undefined;
  #tick: ReturnType<typeof setTimeout> | undefined;
  /** The clock's speed when `speed` is given (attribute or property); `null` follows `time`: real time for "now", held for a date. */
  #speed: number | null = null;
  /** The page's own clock, in milliseconds, at the last step. */
  #last = 0;
  #announced = -Infinity;
  /** The clock is running (a `running: false` is owed when it holds). */
  #running = false;
  #state: EarthState = "loading";
  #tiers: Record<EarthLayer, number> = { day: TIERS.day[0]!, night: TIERS.night[0]!, clouds: TIERS.clouds[0]!, water: TIERS.water[0]! };
  #taken: { renderer: SharedRenderer<Three>; release(): void } | undefined;
  #stage: HTMLElement | undefined;
  #overlay: HTMLElement | undefined;
  #pose: OverlayPose | null = null;
  #listeners = new Set<(pose: OverlayPose) => void>();
  #hands: ElementControls | undefined;
  #reach: string | null = null;
  #onContext = (state: "lost" | "restored" | "unavailable"): void => {
    if (state === "unavailable") this.#fail("WebGL is not available");
  };
  // The canvas's own events reach the stage in the capture phase (they do not bubble); the shared renderer handles them and this follows.
  #lost = (): void => this.#set("lost");
  #restored = (): void => this.#set("live");

  connectedCallback(): void {
    this.#model.centre = readCentre(this.getAttribute("center")) ?? this.#model.centre;
    this.#mode = readTime(this.getAttribute("time"));
    this.#model.time = this.#mode === "now" ? Date.now() : this.#mode;
    this.#speed = readSpeed(this.getAttribute("speed"));
    this.#last = performance.now();
    this.#model.clouds = this.getAttribute("clouds") !== "off";
    this.#model.lights = this.getAttribute("lights") !== "off";
    this.#model.light = readLight(this.getAttribute("light"));
    if (!this.hasAttribute("role")) this.setAttribute("role", "img");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "The Earth from space, with its sunlit and dark sides");

    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<div id="stage"></div><div id="overlay"></div>`;
    adoptStyles(root, STYLE, this.nonce);
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

    const maxRatio = readRatio(this.getAttribute("max-ratio"));
    if (maxRatio) this.#model.ratio = () => Math.min(globalThis.devicePixelRatio || 1, 2, maxRatio);
    const taken = takeRenderer(this.#onContext, maxRatio);
    this.#taken = taken;
    const item = createEarthItem(this.#model, {
      assets: taken.renderer.assets,
      textureBase: () => this.#textureBase(),
      cap: () => this.#textureCap(),
      tiles: () => this.tiles ?? undefined,
      onTiles: (layers) => {
        if (!this.hasAttribute("zoom-max") || this.getAttribute("zoom-max") === this.#reach) {
          this.#reach = TILES_ZOOM_MAX;
          this.setAttribute("zoom-max", TILES_ZOOM_MAX);
        }
        this.dispatchEvent(new CustomEvent("chikyu-tiles", { detail: { layers } }));
      },
      drift: 1.5,
      invalidate: () => this.#gate?.soon(),
      onDraw: () => this.#gate?.drawn(),
      onPose: (pose) => {
        if (this.#hands) this.#hands.controller.grabRadius = discRadius(pose.width, pose.height, 1);
        this.#pose = { ...pose, transform: "" };
        for (const listener of this.#listeners) listener(this.#pose);
      },
      onError: (error) => this.#fail(error instanceof Error ? error.message : String(error)),
      onTier: (layer, width) => {
        if (layer in this.#tiers) this.#tiers[layer as EarthLayer] = width;
        this.dispatchEvent(new CustomEvent("chikyu-tier", { detail: { layer, width } }));
      },
    });
    this.#view = taken.renderer.view(this.#stage, item, { still: null });
    this.#set("loading");
    void this.#view.focus().then((live) => {
      if (live) {
        this.#set("live");
        this.dispatchEvent(new CustomEvent("chikyu-ready"));
      } else if (this.#state === "loading") this.#set(this.#view?.live === false && taken.renderer.focused !== undefined ? "idle" : "unavailable");
    });
    this.addEventListener("pointerdown", this.#take);
    this.addEventListener("focusin", this.#take);
    this.#hands = carryControls(this, { initial: this.#model.view, limits: LIMITS, onChange: (state, info) => this.setView(state, info.final) });
    this.#startTick();
    document.addEventListener("visibilitychange", this.#onVisible);
    this.#locate();
  }

  disconnectedCallback(): void {
    this.removeEventListener("pointerdown", this.#take);
    this.removeEventListener("focusin", this.#take);
    this.#hands?.unbind();
    this.#hands = undefined;
    if (this.#reach !== null && this.getAttribute("zoom-max") === this.#reach) this.removeAttribute("zoom-max");
    this.#reach = null;
    clearTimeout(this.#tick);
    this.#tick = undefined;
    this.#running = false;
    document.removeEventListener("visibilitychange", this.#onVisible);
    this.#gate?.cancel();
    this.#view?.dispose();
    this.#view = undefined;
    this.#taken?.release();
    this.#taken = undefined;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "center") this.centre = readCentre(value) ?? { lon: 0, lat: 0 };
    else if (name === "time") this.time = readTime(value);
    else if (name === "speed") this.#setSpeed(readSpeed(value));
    else if (name === "clouds") this.clouds = value !== "off";
    else if (name === "lights") this.lights = value !== "off";
    else if (name === "light") this.light = readLight(value);
    else if (name === "live-seconds") this.#startTick();
    else if (name === "tiles") this.#gate?.soon();
  }

  /** The controller behind the element's own hands (`set`, `fit`, `state`), while it is in a page. */
  get controller(): ViewController | undefined {
    return this.#hands?.controller;
  }

  /** Where the finer map tiles are served from (a folder with `manifest.json`), or `null` for none; the attribute `tiles`. The Earth loads only the tiles in view, over its own pictures. */
  get tiles(): string | null {
    const given = this.getAttribute("tiles");
    if (!given) return null;
    return given.endsWith("/") ? given : `${given}/`;
  }
  set tiles(value: string | null) {
    if (value === null || value === "") this.removeAttribute("tiles");
    else this.setAttribute("tiles", value);
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
    this.#gate?.soon();
  }

  /** The moment shown: milliseconds since the epoch, or "now" while it follows the real clock. The clock runs from it at `speed`, so a number read while time runs is the moment it has reached. */
  get time(): number | "now" {
    return this.#mode === "now" && this.speed === 1 ? "now" : this.#model.time;
  }
  set time(value: number | Date | "now") {
    this.#mode = value instanceof Date ? value.getTime() : value;
    if (this.#mode === "now") this.#model.time = Date.now();
    else this.#model.time = this.#mode;
    this.#last = performance.now();
    this.#startTick();
    this.#gate?.soon();
  }

  /**
   * Seconds of time for each real second: `1` is real time, `0` holds, `3600` is an hour a second, `86400` a day a second, a negative number runs backwards. Without one (the attribute `speed` left out) the clock
   * follows `time`: real time for "now", held for a date. Reading it gives the speed in force. Setting it is setting the attribute (and `null`-like, a value that is not a number, takes it off); it works out the moment shown up to now at the old speed first, so a hold keeps the moment the reader saw last.
   */
  get speed(): number {
    return this.#speed ?? (this.#mode === "now" ? 1 : 0);
  }
  set speed(value: number) {
    if (Number.isFinite(value)) this.setAttribute("speed", String(value));
    else this.removeAttribute("speed");
  }

  #setSpeed(next: number | null): void {
    if (this.isConnected && this.speed !== 0) this.#advance(performance.now());
    this.#speed = next;
    this.#last = performance.now();
    this.#startTick();
    this.#gate?.soon();
  }

  get clouds(): boolean {
    return this.#model.clouds;
  }
  set clouds(value: boolean) {
    this.#model.clouds = value;
    this.#gate?.soon();
  }

  /** How the Earth is lit: `sun` (true, the default), `lit` (always lit: the night side is never a black frame) or `boost` (the true terminator with the night side raised). */
  get light(): LightMode {
    return this.#model.light;
  }
  set light(value: LightMode) {
    this.#model.light = value;
    this.#gate?.soon();
  }

  get lights(): boolean {
    return this.#model.lights;
  }
  set lights(value: boolean) {
    this.#model.lights = value;
    this.#gate?.soon();
  }

  /** What the element is doing, for a page or a test: its state, the texture widths held, the map tiles held, the draws made. */
  get stats(): { state: EarthState; tiers: Record<EarthLayer, number>; tiles: TileStats; draws: number; contexts: number; canvas: { width: number; height: number; pixels: number }; assets: { entries: number; refs: number } } {
    const stats = this.#taken?.renderer.stats;
    return {
      state: this.#state,
      tiers: { ...this.#tiers },
      tiles: this.#model.tiles?.stats ?? { ready: false, level: null, held: 0, shown: 0, loading: 0, failed: 0, requested: 0 },
      draws: stats?.draws ?? 0,
      contexts: stats?.contexts ?? 0,
      canvas: stats?.canvas ?? { width: 0, height: 0, pixels: 0 },
      assets: { entries: stats?.assets.entries ?? 0, refs: stats?.assets.refs ?? 0 },
    };
  }

  /**
   * Apply a shared view controller's camera (yaw, tilt, zoom, pan). A change under half a pixel is not drawn, a settled change always is,
   * and draws are at most 30 a second.
   */
  setView(view: GlobeView, final = true): void {
    this.#model.view = { ...view };
    const drawn = this.#model.drawn;
    if (!drawn) {
      this.#gate?.soon();
      return;
    }
    const shifted = view.zoom !== drawn.view.zoom || view.panX !== drawn.view.panX || view.panY !== drawn.view.panY;
    const a = lookAt(drawn.centre, drawn.view);
    const b = lookAt(this.#model.centre, view);
    const px = (Math.abs(b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RAD) + Math.abs(b.lat - a.lat)) * RAD * drawn.radius;
    if (shifted || px >= 0.5 || (final && px > 0.01)) this.#gate?.soon();
  }

  /** The view as it is (for a page that wants to read it back). */
  get view(): GlobeView {
    return { ...this.#model.view };
  }

  /** Bring the moment shown up to `now` (the page's own clock, in milliseconds) at the speed it has run at. */
  #advance(now: number): void {
    if (this.speed === 1 && this.#mode === "now") this.#model.time = Date.now();
    else this.#model.time += (now - this.#last) * this.speed;
    this.#last = now;
  }

  /** The wait before the next step: real time every `live-seconds` (a minute by default); faster time as often as the Sun's turn moves a pixel, 1 to 30 times a second (once a second for a reader who prefers reduced motion). */
  #wait(): number {
    const seconds = Number(this.getAttribute("live-seconds"));
    const live = Number.isFinite(seconds) && seconds > 0 ? Math.max(MIN_TICK_MS, seconds * 1000) : LIVE_TICK_MS;
    const speed = Math.abs(this.speed);
    if (speed <= 1) return live;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return Math.min(live, 1000);
    const radius = this.#model.drawn?.radius ?? 200;
    return Math.min(live, 1000 / Math.min(30, Math.max(1, SUN_RATE * RAD * speed * radius)));
  }

  /** Tell the page the moment shown: at most four times a second while time runs (`running`, and not from a hidden tab), and once, at once, when it holds. */
  #announce(running: boolean): void {
    const now = performance.now();
    if (running && (now - this.#announced < TIME_EVENT_MS || document.visibilityState === "hidden")) return;
    this.#announced = running ? now : -Infinity;
    this.dispatchEvent(new CustomEvent("chikyu-timechange", { detail: { time: this.#model.time, running } }));
  }

  /** While the clock runs the Sun and the clouds are put right at the pace `#wait` gives, and nothing runs at all while it holds. */
  #startTick(): void {
    clearTimeout(this.#tick);
    this.#tick = undefined;
    const go = this.isConnected && this.speed !== 0;
    // the clock was running and now holds: told once, so a page's date box stops following it
    if (this.#running && !go) {
      this.#running = false;
      this.#announce(false);
    }
    if (!go) return;
    this.#running = true;
    this.#tick = setTimeout(this.#onTick, this.#wait());
  }

  #onTick = (): void => {
    this.#advance(performance.now());
    this.#tick = setTimeout(this.#onTick, this.#wait());
    this.#gate?.soon();
    this.#announce(true);
  };

  /** Back in a shown tab: the moment is brought up to date, and drawn. */
  #onVisible = (): void => {
    if (document.visibilityState === "hidden" || !this.#running) return;
    this.#advance(performance.now());
    this.#gate?.soon();
    this.#announce(true);
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

declare global {
  interface HTMLElementTagNameMap {
    "chikyu-earth-realistic": ChikyuEarthRealistic;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-earth-realistic")) {
  customElements.define("chikyu-earth-realistic", ChikyuEarthRealistic);
}
