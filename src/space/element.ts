// <chikyu-space>: the Earth, the Moon, the Sun and the planets where they are at a date and time, drawn with three.js through kazoku-ui's shared renderer. Optional:
// the line globe and the Earth from space need neither this nor astronomy-engine. It draws only when something changes, at most 30 times a second.
import type { SharedRenderer, View } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { GeoPoint } from "../types.ts";
import { createGate, frameCap, type Gate } from "../realistic/gate.ts";
import { setThreeLoader, takeRenderer } from "../realistic/shared.ts";
import type { ThreeParts } from "../realistic/textures.ts";
import { MAX_TEXTURE, type Layer } from "../realistic/tiers.ts";
import { frameAt } from "./ephemeris.ts";
import { placeAround, placeMoon, placeSun, type ScaleMode } from "./scale.ts";
import { BODY_NAMES, createSpaceItem, FIT_DISTANCE, newSpaceModel, type BodyName, type SpaceModel } from "./scene.ts";

export { setThreeLoader };
type Three = ThreeParts;
export type SpaceState = "loading" | "live" | "unavailable" | "lost" | "idle";
export type SpacePreset = "earth" | "moon" | "sun" | "inner" | "solar-system";

const RAD = Math.PI / 180;
/** The Earth's own turn, degrees a second. */
const EARTH_RATE = 360 / 86_164.0905;
const REAL_TIME_TICK_MS = 60_000;

const readCentre = (value: string | null): GeoPoint | null => {
  if (!value) return null;
  const [lon, lat] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon!) > 180 || Math.abs(lat!) > 90) return null;
  return { lon: lon!, lat: lat! };
};
const readTime = (value: string | null): number | "now" => {
  if (value === null || value === "" || value === "now") return "now";
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : "now";
};

export class ChikyuSpace extends HTMLElement {
  static observedAttributes = ["center", "time", "speed", "scale", "labels", "orbits"];

  #model: SpaceModel = newSpaceModel();
  #mode: number | "now" = "now";
  #speed = 1;
  #view: View | undefined;
  #gate: Gate | undefined;
  #taken: { renderer: SharedRenderer<Three>; release(): void } | undefined;
  #stage: HTMLElement | undefined;
  #labelBox: HTMLElement | undefined;
  #state: SpaceState = "loading";
  #timer: ReturnType<typeof setTimeout> | undefined;
  #last = 0;
  #pool = new Map<BodyName, HTMLElement>();
  #tiers: Record<string, number> = {};

  connectedCallback(): void {
    this.#model.centre = readCentre(this.getAttribute("center")) ?? this.#model.centre;
    this.#mode = readTime(this.getAttribute("time"));
    this.#model.time = this.#mode === "now" ? Date.now() : this.#mode;
    this.#speed = this.#readSpeed();
    this.#model.mode = this.getAttribute("scale") === "true" ? "true" : "compressed";
    this.#model.labels = this.getAttribute("labels") !== "off";
    this.#model.orbits = this.getAttribute("orbits") !== "off";
    this.#model.stepMs = Math.max(1000, Math.abs(this.#speed) * 1000);
    if (!this.hasAttribute("role")) this.setAttribute("role", "img");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "The Earth, the Moon, the Sun and the planets in their places for the date shown");

    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;aspect-ratio:1/1;position:relative;overflow:hidden}#stage,#labels{position:absolute;inset:0}#labels{pointer-events:none;overflow:hidden}.sp-label{position:absolute;left:0;top:0;font:12px/16px system-ui,-apple-system,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000;will-change:transform}.sp-label::before{content:"";display:inline-block;width:5px;height:5px;margin:0 5px 1px -2px;border-radius:50%;background:#fff}.sp-label[hidden]{display:none}</style><div id="stage"></div><div id="labels" aria-hidden="true"></div>`;
    this.#stage = root.getElementById("stage")!;
    this.#labelBox = root.getElementById("labels")!;
    this.#pool.clear();

    const nav = navigator as Navigator & { deviceMemory?: number };
    this.#gate = createGate(1000 / frameCap(30, { deviceMemory: nav.deviceMemory, hardwareConcurrency: nav.hardwareConcurrency }), () => this.#view?.invalidate());
    this.#stage.addEventListener("webglcontextlost", this.#lost, true);
    this.#stage.addEventListener("webglcontextrestored", this.#restored, true);

    const taken = takeRenderer((state) => {
      if (state === "unavailable") this.#fail("WebGL is not available");
    });
    this.#taken = taken;
    const item = createSpaceItem(this.#model, {
      assets: taken.renderer.assets,
      textureBase: () => this.#textureBase(),
      cap: () => this.#textureCap(),
      invalidate: () => this.#gate?.request(),
      onError: (error) => this.#fail(error instanceof Error ? error.message : String(error)),
      onTier: (layer: Layer, width: number) => {
        this.#tiers[layer] = width;
      },
      onLabels: (places) => this.#placeLabels(places),
    });
    this.#view = taken.renderer.view(this.#stage, item, { still: null });
    this.#set("loading");
    void this.#view.focus().then((live) => {
      if (live) {
        this.#set("live");
        this.dispatchEvent(new CustomEvent("chikyu-ready"));
      } else if (this.#state === "loading") this.#set("unavailable");
    });
    this.#last = performance.now();
    this.#schedule();
  }

  disconnectedCallback(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#gate?.cancel();
    this.#view?.dispose();
    this.#view = undefined;
    this.#taken?.release();
    this.#taken = undefined;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "center") this.centre = readCentre(value) ?? { lon: 0, lat: 0 };
    else if (name === "time") this.time = readTime(value);
    else if (name === "speed") this.speed = this.#readSpeed();
    else if (name === "scale") this.scale = value === "true" ? "true" : "compressed";
    else if (name === "labels") this.labels = value !== "off";
    else if (name === "orbits") this.orbits = value !== "off";
  }

  get centre(): GeoPoint {
    return { ...this.#model.centre };
  }
  set centre(value: GeoPoint) {
    this.#model.centre = { ...value };
    this.#gate?.request();
  }

  /** The moment shown: milliseconds since the epoch, or "now" to follow the clock. Setting it points the camera at the same place on the ground again. */
  get time(): number {
    return this.#model.time;
  }
  set time(value: number | Date | "now") {
    this.#mode = value instanceof Date ? value.getTime() : value;
    this.#model.time = this.#mode === "now" ? Date.now() : this.#mode;
    this.#model.cameraSpin = null;
    this.#last = performance.now();
    this.#schedule();
    this.#gate?.request();
  }

  /** Seconds of game time per second: 1 is real time, 0 holds still, negative runs backwards. */
  get speed(): number {
    return this.#speed;
  }
  set speed(value: number) {
    this.#speed = Number.isFinite(value) ? value : 1;
    this.#model.stepMs = Math.max(1000, Math.abs(this.#speed) * 1000);
    this.#last = performance.now();
    this.#schedule();
    this.#gate?.request();
  }

  get scale(): ScaleMode {
    return this.#model.mode;
  }
  set scale(value: ScaleMode) {
    this.#model.mode = value;
    this.#gate?.request();
  }

  get labels(): boolean {
    return this.#model.labels;
  }
  set labels(value: boolean) {
    this.#model.labels = value;
    if (!value) for (const label of this.#pool.values()) label.hidden = true;
    this.#gate?.request();
  }

  get orbits(): boolean {
    return this.#model.orbits;
  }
  set orbits(value: boolean) {
    this.#model.orbits = value;
    this.#gate?.request();
  }

  /** The shared controls' camera: yaw and tilt turn the view, zoom brings the camera in (1 shows the Earth, less shows the sky round it). Pan is not used. */
  setView(view: { yaw: number; tilt: number; zoom: number }): void {
    const now = this.#model.view;
    if (view.yaw === now.yaw && view.tilt === now.tilt && view.zoom === now.zoom) return;
    this.#model.view = { yaw: view.yaw, tilt: view.tilt, zoom: view.zoom };
    this.#gate?.request();
  }

  /** The zoom that shows a part of the sky: the Earth alone, the Moon's orbit, the Sun, the planets out to Mars, or all of them, at this scale and moment. */
  zoomFor(preset: SpacePreset): number {
    const frame = this.#model.drawn?.frame ?? frameAt(this.#model.time);
    const mode = this.#model.mode;
    const sun = placeSun(mode, frame.sun);
    const around = (name: keyof typeof frame.planets): number => Math.hypot(...placeAround(mode, sun, [frame.planets[name][0] - frame.sun[0], frame.planets[name][1] - frame.sun[1], frame.planets[name][2] - frame.sun[2]]));
    const reach = {
      earth: 0,
      moon: Math.hypot(...placeMoon(mode, frame.moon)),
      sun: Math.hypot(...sun),
      inner: Math.max(around("Mercury"), around("Venus"), around("Mars"), Math.hypot(...sun)),
      "solar-system": Math.max(...(Object.keys(frame.planets) as (keyof typeof frame.planets)[]).map(around), Math.hypot(...sun)),
    }[preset];
    return preset === "earth" ? 1 : FIT_DISTANCE / Math.max(FIT_DISTANCE, reach * 3.4);
  }

  /** What the element is doing, for a page or a test. */
  get stats(): { state: SpaceState; draws: number; contexts: number; canvas: { width: number; height: number; pixels: number }; tiers: Record<string, number>; distance: number; assets: { entries: number; refs: number }; time: number; lookups: number } {
    const stats = this.#taken?.renderer.stats;
    return {
      state: this.#state,
      draws: stats?.draws ?? 0,
      contexts: stats?.contexts ?? 0,
      canvas: stats?.canvas ?? { width: 0, height: 0, pixels: 0 },
      tiers: { ...this.#tiers },
      distance: this.#model.drawn?.distance ?? 0,
      assets: { entries: stats?.assets.entries ?? 0, refs: stats?.assets.refs ?? 0 },
      time: this.#model.time,
      lookups: this.#model.lookups,
    };
  }

  // --- the game clock ----------------------------------------------------------------------------------------------------------------------------
  #readSpeed(): number {
    const raw = this.getAttribute("speed");
    const value = raw === null || raw === "" ? 1 : Number(raw);
    return Number.isFinite(value) ? value : 1;
  }

  /** While time runs, draw as often as it shows: real time once a minute; faster time as often as the Earth's turn moves a pixel (1 to 30 times a second). */
  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.isConnected || this.#speed === 0) return;
    const realTime = this.#speed === 1 && this.#mode === "now";
    const radius = this.#model.drawn?.radiusPx ?? 200;
    const pixelsPerSecond = EARTH_RATE * RAD * Math.abs(this.#speed) * radius;
    const perSecond = Math.min(30, Math.max(1, pixelsPerSecond));
    const wait = realTime || this.#speed === 1 ? REAL_TIME_TICK_MS : 1000 / perSecond;
    this.#timer = setTimeout(this.#tick, wait);
  }

  #tick = (): void => {
    const now = performance.now();
    if (this.#speed === 1 && this.#mode === "now") this.#model.time = Date.now();
    else this.#model.time += (now - this.#last) * this.#speed;
    this.#last = now;
    this.#gate?.request();
    this.#schedule();
    this.dispatchEvent(new CustomEvent("chikyu-time", { detail: { time: this.#model.time } }));
  };

  // --- labels --------------------------------------------------------------------------------------------------------------------------------------
  #placeLabels(places: Record<BodyName, { x: number; y: number } | null>): void {
    const box = this.#labelBox;
    if (!box) return;
    for (const name of BODY_NAMES) {
      let label = this.#pool.get(name);
      const at = places[name];
      if (!label) {
        if (!at) continue;
        label = box.ownerDocument.createElement("span");
        label.className = "sp-label";
        label.textContent = name;
        box.append(label);
        this.#pool.set(name, label);
      }
      if (!at) {
        if (!label.hidden) label.hidden = true;
        continue;
      }
      if (label.hidden) label.hidden = false;
      label.style.transform = `translate(${Math.round(at.x + 4)}px,${Math.round(at.y - 8)}px)`;
    }
  }

  // --- the rest --------------------------------------------------------------------------------------------------------------------------------------
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

  #lost = (): void => this.#set("lost");
  #restored = (): void => this.#set("live");

  #set(state: SpaceState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.dataset["state"] = state;
  }

  #fail(reason: string): void {
    this.#set("unavailable");
    this.dispatchEvent(new CustomEvent("chikyu-unavailable", { detail: { reason } }));
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-space")) {
  customElements.define("chikyu-space", ChikyuSpace);
}
