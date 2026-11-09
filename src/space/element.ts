// <chikyu-space>: the Earth, the Moon, the Sun and the planets where they are at a date and time, drawn with three.js through kazoku-ui's shared renderer. Optional:
// the line globe and the Earth from space need neither this nor astronomy-engine. It draws only when something changes, at most 30 times a second.
import type { SharedRenderer, View } from "@johnmorrisdotca/kazoku-ui/renderer";
import { carryControls, type ElementControls, type ViewController } from "@johnmorrisdotca/kazoku-ui/view-controls";
import { adoptStyles } from "../adopt.ts";
import type { GeoPoint } from "../types.ts";
import { createGate, frameCap, type Gate } from "../realistic/gate.ts";
import { setThreeLoader, takeRenderer } from "../realistic/shared.ts";
import type { ThreeParts } from "../realistic/textures.ts";
import type { LightMode } from "../realistic/earth.ts";
import { MAX_TEXTURE, type Layer } from "../realistic/tiers.ts";
import { MAX_SATELLITE_SPEED } from "../satellites/limits.ts";
import type { SatelliteInfo, SatelliteRef, Satellites } from "../satellites/types.ts";
import { AU_IN_EARTH_RADII, EARTH_RADIUS_KM, frameAt, type PlanetName } from "./ephemeris.ts";
import { MAX_ORBIT_GROUP, type SatelliteStyle } from "./satellite-layer.ts";
import type { RideLook } from "./ride.ts";
import { placeAround, placeMoon, placeSun, RADIUS, type ScaleMode } from "./scale.ts";
import { BODY_NAMES, createSpaceItem, FIT_DISTANCE, newSpaceModel, type BodyName, type BodyPainter, type BodyPlace, type RideTarget, type SpaceModel } from "./scene.ts";

export { BODY_NAMES, type BodyName, type RideTarget };

let painter: BodyPainter | undefined;

/**
 * Change how the Sun and the planets are drawn (before the first element connects): the space view keeps their places, sizes, light, names and orbits and asks
 * the painter only for what to draw at each place (see `BodyPainter`). Left alone, they are plain spheres in the right colours.
 *
 * @param next - The painter to use, or `undefined` for the plain one.
 *
 * @example
 * ```ts no-run
 * import { plainPainter } from "@johnmorrisdotca/chikyu-earth/space";
 * import { setBodyPainter } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * setBodyPainter({ make: (three, name) => plainPainter.make(three, name) });
 * ```
 */
export function setBodyPainter(next: BodyPainter | undefined): void {
  painter = next;
}

/** Mean radii in kilometres (IAU), for what a click tells. */
const RADIUS_KM: Record<BodyName, number> = { Sun: 695_700, Mercury: 2439.7, Venus: 6051.8, Earth: 6371, Moon: 1737.4, Mars: 3389.5, Jupiter: 69_911, Saturn: 58_232, Uranus: 25_362, Neptune: 24_622, Pluto: 1188.3 };

/**
 * What a page can tell a reader about a body now.
 *
 * @example
 * ```ts no-run
 * import type { BodyInfo } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const info: BodyInfo = { name: "Mars", radiusKm: 3389.5, distanceKm: 225_000_000 };
 * console.log(`${info.name}: ${info.radiusKm} km`);
 * ```
 */
export interface BodyInfo {
  name: BodyName;
  /** Mean radius, kilometres. */
  radiusKm: number;
  /** Distance from the Earth's centre now, kilometres (0 for the Earth). */
  distanceKm: number;
}

export { setThreeLoader };
type Three = ThreeParts;
/**
 * What the space view is doing: `loading`, `live`, `unavailable` (no WebGL), `lost` (the GPU took the context; it comes back by itself) or `idle` (another view has the page's one context).
 *
 * @example
 * ```ts no-run
 * import type { ChikyuSpace, SpaceState } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const stateOf = (space: ChikyuSpace): SpaceState => space.stats.state;
 * console.log(typeof stateOf);
 * ```
 */
export type SpaceState = "loading" | "live" | "unavailable" | "lost" | "idle";
/**
 * A named distance for `zoomFor`: the Earth, the Moon, the Sun, the inner planets, the whole solar system, or a planet with its nearer moons (`Jupiter-moons`: the zoom that shows them, when a body painter that draws moons is set).
 *
 * @example
 * ```ts no-run
 * import type { ChikyuSpace, SpacePreset } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const zoomTo = (space: ChikyuSpace, preset: SpacePreset): number => space.zoomFor(preset);
 * console.log(typeof zoomTo);
 * ```
 */
export type SpacePreset = "earth" | "moon" | "sun" | "inner" | "solar-system" | `${Exclude<PlanetName, "Mercury" | "Venus">}-moons`;

/**
 * How a ride along is done: `view` `from` (the default) puts the camera at the body looking at the Earth, `follow` keeps it a fixed distance from the body looking at it (`distanceKm`, 3000 by default,
 * for a satellite; a planet or the Moon is kept at the distance the zoom says); `look` `down` (the default) or `horizon` is where a camera at the body points; `smooth` (the default) glides
 * from the old camera to the new one in about a second and a bit, and jumps instead for a reader who asked for reduced motion.
 *
 * @example
 * ```ts no-run
 * import type { RideOptions } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const options: RideOptions = { view: "from", look: "horizon" };
 * console.log(options.look);
 * ```
 */
export interface RideOptions {
  view?: "from" | "follow";
  look?: RideLook;
  distanceKm?: number;
  smooth?: boolean;
}

/**
 * What the camera is riding along with now: the body or satellite, how (`from` or `follow`), where it looks, and the distance kept for a satellite.
 *
 * @example
 * ```ts no-run
 * import type { Riding } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const describe = (ride: Riding | null): string => (ride ? `${ride.view} ${typeof ride.target === "string" ? ride.target : ride.target.group}` : "not riding");
 * console.log(typeof describe);
 * ```
 */
export interface Riding {
  target: RideTarget;
  view: "from" | "follow";
  look: RideLook;
  distanceKm: number;
}

type SatelliteStats = { groups: number; placed: number; tooFast: boolean; propagations: number; lastBatchMs: number; maxBatchMs: number; updateMs: number; maxUpdateMs: number; averageUpdateMs: number; updates: number };

/** A `light` attribute: `lit` or `boost`, else the true sun. */
const readLight = (value: string | null): LightMode => (value === "lit" || value === "boost" ? value : "sun");
const RAD = Math.PI / 180;
/** The Earth's own turn, degrees a second. */
const EARTH_RATE = 360 / 86_164.0905;
/** The quickest a satellite goes round, degrees a second (a low orbit: 88 minutes). */
const SATELLITE_RATE = 360 / (88 * 60);
const SATELLITE_COLORS = ["#ffd54f", "#7fd4ff", "#ff8fa3", "#9ef0a8"];
const REAL_TIME_TICK_MS = 60_000;
/**
 * Tilt to the poles. The zoom is the camera's distance: a millionth of Fit takes in the whole solar system (the views of the planets and their distances need that much), and 2.5 times is as close as the Earth's 4096 pixel picture and the body textures stay sharp.
 * Riding at a body looking at the Earth, the zoom only narrows the camera's field a little either way: 0.5 to 6.
 */
const LIMITS = { tiltMax: 90, zoomMin: 0.000001, zoomMax: 2.5 };
const RIDE_ZOOM = { "zoom-min": "0.5", "zoom-max": "6" };

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

const STYLE = `:host{display:block;aspect-ratio:1/1;position:relative;overflow:hidden}#stage,#labels{position:absolute;inset:0}#labels{pointer-events:none;overflow:hidden}.sp-label{position:absolute;left:0;top:0;margin:0;padding:0;border:0;background:none;font:12px/16px system-ui,-apple-system,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000;will-change:transform;pointer-events:none}.sp-label:focus-visible{outline:2px solid #6cd0ff;outline-offset:2px;border-radius:4px}.sp-label::before{content:"";display:inline-block;width:5px;height:5px;margin:0 5px 1px -2px;border-radius:50%;background:#fff}.sp-label[hidden]{display:none}.sp-sat{position:absolute;left:0;top:0;font:12px/16px system-ui,-apple-system,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000;will-change:transform;pointer-events:none}.sp-sat[hidden]{display:none}`;

/**
 * The `<chikyu-space>` custom element: the Earth, the Moon, the Sun and the planets where they are at a date and time, drawn with three.js through the shared renderer. It takes `center`, `time` (`now` or an ISO date), `speed` (1 is real time, 0 holds, 86400 is a day a second, negative runs backwards), `scale` (`compressed` or `true`), `labels` and `orbits` (`off` hides them); positions are computed in the browser by astronomy-engine, an optional peer dependency. It draws only when something changes, and nothing while it is out of sight.
 *
 * It carries kazoku-ui's controls itself: a drag turns the view, two fingers pinch, Ctrl and the wheel zoom (a plain wheel at Fit scrolls the page) and the arrow keys, + and - work once it is focused. The zoom runs from a millionth of Fit (the whole solar system) to 2.5 times, and from 0.5 to 6 times while riding from a body. `controls="none"` turns the hands off; `zoom-min` and `zoom-max` change the range. A `<kazoku-view-controls for="...">` on the element takes the hands over, and the page applies its events with `setView`.
 *
 * @example
 * ```ts no-run
 * import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const space = document.createElement("chikyu-space") as ChikyuSpace;
 * space.setAttribute("time", "2026-11-02T12:00Z");
 * space.setAttribute("speed", "0");
 * document.body.append(space);
 * ```
 */
export class ChikyuSpace extends HTMLElement {
  static observedAttributes = ["center", "time", "speed", "scale", "labels", "orbits", "bodies", "light"];

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
  #places: Record<BodyName, BodyPlace | null> | undefined;
  #chosenLabel: HTMLElement | undefined;
  #focusBeforeRide: BodyName = "Earth";
  #lostTold = false;
  #names: Partial<Record<BodyName, string>> = {};
  #hint = "choose to look at it";
  #tiers: Record<string, number> = {};
  #hands: ElementControls | undefined;
  #ridden: Partial<Record<keyof typeof RIDE_ZOOM, string>> = {};

  /** The controller behind the element's own hands (`set`, `fit`, `state`), while it is in a page. */
  get controller(): ViewController | undefined {
    return this.#hands?.controller;
  }

  connectedCallback(): void {
    this.#model.centre = readCentre(this.getAttribute("center")) ?? this.#model.centre;
    this.#mode = readTime(this.getAttribute("time"));
    this.#model.time = this.#mode === "now" ? Date.now() : this.#mode;
    this.#speed = this.#readSpeed();
    this.#model.mode = this.getAttribute("scale") === "true" ? "true" : "compressed";
    this.#model.labels = this.getAttribute("labels") !== "off";
    this.#model.orbits = this.getAttribute("orbits") !== "off";
    this.#model.bodies = this.getAttribute("bodies") ?? "";
    this.#model.light = readLight(this.getAttribute("light"));
    this.#model.stepMs = Math.max(1000, Math.abs(this.#speed) * 1000);
    this.#model.speed = this.#speed;
    if (!this.hasAttribute("role")) this.setAttribute("role", "img");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "The Earth, the Moon, the Sun and the planets in their places for the date shown");

    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<div id="stage"></div><div id="labels" aria-hidden="true"></div>`;
    adoptStyles(root, STYLE, this.nonce);
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
      onSelected: (place) => this.#placeChosen(place),
      onMoving: () => this.#gate?.request(),
      onRideLost: () => this.#rideLost(),
      onSatellitesError: (error) => this.dispatchEvent(new CustomEvent("chikyu-satellites-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      ...(painter ? { painter } : {}),
      onPainterError: (error) => this.dispatchEvent(new CustomEvent("chikyu-bodies-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
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
    this.addEventListener("pointerdown", this.#down);
    this.#hands = carryControls(this, { initial: this.#model.view, limits: LIMITS, onChange: (state, info) => this.setView(state, info.final) });
    this.#labelBox.addEventListener("click", this.#labelClick);
    this.#labelBox.addEventListener("focusin", this.#labelFocus);
  }

  disconnectedCallback(): void {
    this.#hands?.unbind();
    this.#hands = undefined;
    this.#zoomRange(false);
    this.removeEventListener("pointerdown", this.#down);
    window.removeEventListener("pointerup", this.#up, true);
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
    else if (name === "bodies") this.bodies = value ?? "";
    else if (name === "light") this.light = readLight(value);
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
    this.#model.speed = this.#speed;
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

  /**
   * How the Sun, the planets, Pluto and their moons are drawn: one of the `looks` of the body painter set with `setBodyPainter` (wakusei-planets has `realistic` and `painted`), or `plain` (the sphere in the right colour, no moons); empty for the painter's first.
   * With no painter they are plain spheres and this does nothing. Changing it draws the bodies again with the new look.
   */
  get bodies(): string {
    return this.#model.bodies;
  }
  set bodies(value: string) {
    this.#model.bodies = value;
    this.#gate?.request();
  }

  /** How the Earth is lit: `sun` (true, the default), `lit` (always lit, as if by daylight from the camera's side, so a ride on the night side is never a black frame) or `boost` (the true terminator, with the night side raised). The Sun, the Moon and the planets keep their true places. */
  get light(): LightMode {
    return this.#model.light;
  }
  set light(value: LightMode) {
    this.#model.light = value;
    this.#gate?.request();
  }

  /** The looks the body painter offers (empty with no painter), for a page to build its choice from. */
  get bodyLooks(): readonly string[] {
    return painter?.looks ?? [];
  }

  get orbits(): boolean {
    return this.#model.orbits;
  }
  set orbits(value: boolean) {
    this.#model.orbits = value;
    this.#gate?.request();
  }

  /**
   * The shared controls' camera: yaw and tilt turn the view (the Earth's surface moves right for a drag right and up for a drag up), zoom brings the camera in (1 shows the Earth, less shows the sky round it). Pan is not used. A turn that moves nothing on the screen by half a pixel is kept
   * for the next draw but does not cause one unless `final` is true (the default), so an Auto-turn at the Earth's own rate costs a draw every half minute, not thirty a second.
   *
   * @param view - The controls' yaw and tilt in degrees and zoom.
   * @param final - False for the frames of a turn that is still going on (Auto-turn, a drag); true when it has settled.
   */
  setView(view: { yaw: number; tilt: number; zoom: number }, final = true): void {
    const now = this.#model.view;
    if (view.yaw === now.yaw && view.tilt === now.tilt && view.zoom === now.zoom) return;
    this.#model.view = { yaw: view.yaw, tilt: view.tilt, zoom: view.zoom };
    const drawn = this.#model.drawnView;
    if (drawn && !final && view.zoom === drawn.zoom) {
      const turned = Math.max(Math.abs(view.yaw - drawn.yaw), Math.abs(view.tilt - drawn.tilt)) * RAD;
      if (turned * (this.#model.heightPx / 2) < 0.5) return;
    }
    this.#gate?.request();
  }

  /** The body the camera looks at: at zoom 1 it fills the view; the yaw and tilt turn the camera round it. */
  get body(): BodyName {
    return this.#model.focus;
  }
  set body(name: BodyName) {
    if (!BODY_NAMES.includes(name)) return;
    this.#model.focus = name;
    this.#gate?.request();
  }

  // --- riding along -------------------------------------------------------------------------------------------------------------------------------
  /**
   * Ride along with a body or a satellite. By default the camera sits at it and looks at the Earth, with the way it is going at the top of the picture, at its real place for the moment shown, so the
   * Earth turns and slides beneath as it moves along its orbit (an ISS view goes round about every 90 minutes). A drag looks about from there (a drag right turns the camera to its left and a drag up tips it towards the bottom of its picture, so the ground follows the pointer), the shared controls' zoom narrows the view.
   * A satellite is `{ group, index }` of a group set with `setSatellites`; it is placed exactly, one SGP4 call a frame, at any speed. Another call switches smoothly; `null` stops. The draw rate follows how
   * fast the picture moves, never more than 30 a second (one a second for a reader who asked for reduced motion), and nothing is drawn out of sight.
   *
   * @param target - A body name (`"Moon"`, `"Mars"`, ...) or a satellite `{ group, index }`, or `null` to stop.
   * @param options - `view`, `look`, `distanceKm`, `smooth` (see `RideOptions`).
   */
  ride(target: RideTarget | null, options: RideOptions = {}): void {
    const model = this.#model;
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wasRiding = model.ride !== null;
    if (target === null) {
      model.ride = null;
      model.focus = this.#focusBeforeRide;
    } else {
      if (typeof target === "string" && !BODY_NAMES.includes(target)) return;
      if (typeof target !== "string" && !model.satellites.groups.get(target.group)) return;
      if (!wasRiding) this.#focusBeforeRide = model.focus;
      const view = typeof target === "string" && target === "Earth" ? "follow" : (options.view ?? "from");
      model.ride = { target: typeof target === "string" ? target : { group: target.group, index: target.index }, view, look: options.look ?? "down", distanceKm: Math.max(100, options.distanceKm ?? 3000) };
      if (typeof target === "string" && view === "follow") model.focus = target;
      else if (wasRiding) model.focus = this.#focusBeforeRide;
    }
    this.#zoomRange(model.ride?.view === "from");
    this.#lostTold = false;
    const pose = model.pose;
    model.transition = (options.smooth ?? true) && !reduced && pose.valid ? { start: performance.now(), duration: 1200, from: { p: [pose.p[0], pose.p[1], pose.p[2]], q: [pose.q[0], pose.q[1], pose.q[2], pose.q[3]], fov: pose.fov } } : null;
    this.#last = performance.now();
    this.#schedule();
    this.#gate?.request();
    this.dispatchEvent(new CustomEvent("chikyu-ride", { detail: this.riding }));
  }

  /** From a body the zoom only narrows the field a little, so the range is 0.5 to 6: the `zoom-min` and `zoom-max` attributes, unless the page set them itself. */
  #zoomRange(from: boolean): void {
    for (const name of ["zoom-min", "zoom-max"] as const) {
      const mine = this.#ridden[name];
      if (this.hasAttribute(name) && this.getAttribute(name) !== mine) continue;
      if (from) {
        this.#ridden[name] = RIDE_ZOOM[name];
        this.setAttribute(name, RIDE_ZOOM[name]);
      } else {
        if (mine !== undefined) this.removeAttribute(name);
        delete this.#ridden[name];
      }
    }
  }

  /** What the camera is riding along with now, or null. */
  get riding(): Riding | null {
    const ride = this.#model.ride;
    return ride ? { ...ride, target: typeof ride.target === "string" ? ride.target : { ...ride.target } } : null;
  }

  #rideLost(): void {
    if (this.#lostTold) return;
    this.#lostTold = true;
    this.dispatchEvent(new CustomEvent("chikyu-ride-lost", { detail: this.riding }));
  }

  // --- satellites ---------------------------------------------------------------------------------------------------------------------------------
  /**
   * Show a group of satellites (made by `createSatellites`) under a name, or take the group away with `null`. A group is one draw call however many satellites it holds. Giving the name of a group
   * that is already shown replaces it. `style`: `color` and `size` (CSS pixels) of the dots, and `orbits` to draw every orbit (only for a group of 40 or fewer, such as the stations).
   * The groups are placed by SGP4 about once a second and interpolated between, and are hidden while the clock runs faster than `MAX_SATELLITE_SPEED`.
   *
   * @param group - The group's name, for `showSatellites`, `selectSatellite` and the events.
   * @param satellites - The group, or `null` to remove it.
   * @param style - How to draw it.
   */
  setSatellites(group: string, satellites: Satellites | null, style: Partial<SatelliteStyle> = {}): void {
    const groups = this.#model.satellites.groups;
    if (satellites === null) {
      groups.delete(group);
      if (this.#model.satellites.selected?.group === group) this.#model.satellites.selected = null;
    } else {
      const was = groups.get(group);
      groups.set(group, {
        satellites,
        color: style.color ?? was?.color ?? SATELLITE_COLORS[groups.size % SATELLITE_COLORS.length]!,
        size: style.size ?? was?.size ?? 3,
        orbits: (style.orbits ?? was?.orbits ?? false) && satellites.count <= MAX_ORBIT_GROUP,
        visible: was?.visible ?? true,
      });
    }
    this.#last = performance.now();
    this.#schedule();
    this.#gate?.request();
  }

  /** Show or hide a group without losing it. */
  showSatellites(group: string, on: boolean): void {
    const found = this.#model.satellites.groups.get(group);
    if (!found || found.visible === on) return;
    found.visible = on;
    this.#schedule();
    this.#gate?.request();
  }

  /** The groups now set, with how many satellites each holds and whether it is shown. */
  get satelliteGroups(): { name: string; count: number; visible: boolean }[] {
    return [...this.#model.satellites.groups].map(([name, group]) => ({ name, count: group.satellites.count, visible: group.visible }));
  }

  /** Mark one satellite: a larger ring round it, its orbit drawn, and its name beside it. `null` lets it go. */
  selectSatellite(ref: SatelliteRef | null): void {
    const found = ref ? this.#model.satellites.groups.get(ref.group) : undefined;
    this.#model.satellites.selected = ref && found && ref.index >= 0 && ref.index < found.satellites.count ? { group: ref.group, index: ref.index } : null;
    if (this.#chosenLabel) this.#chosenLabel.hidden = true;
    this.#gate?.request();
  }

  /** The satellite marked by `selectSatellite` or by a press on it, if any. */
  get selectedSatellite(): SatelliteRef | null {
    const chosen = this.#model.satellites.selected;
    return chosen ? { ...chosen } : null;
  }

  /** Facts about one satellite at the moment shown (name, number, element age, height, speed, period); undefined if it cannot be placed then. */
  satelliteInfo(ref: SatelliteRef): SatelliteInfo | undefined {
    return this.#model.satellites.groups.get(ref.group)?.satellites.info(ref.index, this.#model.time);
  }

  /** The words shown beside each body, for a page in another language (`{ Mars: "火星" }`). A body left out keeps its English name. */
  get bodyNames(): Partial<Record<BodyName, string>> {
    return { ...this.#names };
  }
  set bodyNames(value: Partial<Record<BodyName, string>>) {
    this.#names = { ...value };
    for (const [name, button] of this.#pool) this.#nameLabel(button, name);
  }

  /** What a screen reader hears after a body's name: "choose to look at it" by default, or the page's own words. */
  get bodyHint(): string {
    return this.#hint;
  }
  set bodyHint(value: string) {
    this.#hint = value;
    for (const [name, button] of this.#pool) this.#nameLabel(button, name);
  }

  /** The radius and the distance from the Earth of a body now, for a page's own caption. */
  bodyInfo(name: BodyName): BodyInfo {
    const frame = this.#model.drawn?.frame ?? frameAt(this.#model.time);
    const geo = name === "Earth" ? ([0, 0, 0] as const) : name === "Sun" ? frame.sun : name === "Moon" ? frame.moon : frame.planets[name];
    return { name, radiusKm: RADIUS_KM[name], distanceKm: Math.hypot(geo[0], geo[1], geo[2]) * (AU_IN_EARTH_RADII * EARTH_RADIUS_KM) };
  }

  /** The zoom that shows a part of the sky: the Earth alone, the Moon's orbit, the Sun, the planets out to Mars, or all of them, at this scale and moment. */
  zoomFor(preset: SpacePreset): number {
    if (preset.endsWith("-moons")) {
      const name = preset.slice(0, -6) as PlanetName;
      const sites = painter?.moons?.(name, this.#model.time) ?? [];
      const reach = Math.max(1, ...sites.map((site) => Math.hypot(...site.offset)).filter((r) => r <= 22));
      const radius = RADIUS[name]![this.#model.mode];
      return Math.min(1, (FIT_DISTANCE * radius) / ((reach * radius * 1.15) / Math.tan(17.5 * RAD)));
    }
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
    }[preset as Exclude<SpacePreset, `${string}-moons`>];
    return preset === "earth" ? 1 : FIT_DISTANCE / Math.max(FIT_DISTANCE, reach * 3.4);
  }

  /** What the element is doing, for a page or a test. */
  get stats(): {
    state: SpaceState;
    draws: number;
    contexts: number;
    canvas: { width: number; height: number; pixels: number };
    tiers: Record<string, number>;
    distance: number;
    assets: { entries: number; refs: number };
    time: number;
    lookups: number;
    satellites: SatelliteStats;
    ride: { riding: boolean; lost: boolean; gliding: boolean };
    /** The camera as the last draw left it: its place in Earth radii from the Earth's centre, and its field of view in degrees. */
    camera: { position: [number, number, number]; fov: number };
    /** What the body painter has made at the last draw: the Sun and planets with a drawing, and the moons shown round a planet that is near. */
    bodies: { look: string; painted: number; moons: number };
  } {
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
      satellites: this.#satelliteStats(),
      ride: { riding: this.#model.ride !== null, lost: this.#model.rideLost, gliding: this.#model.transition !== null },
      camera: { position: [this.#model.pose.p[0], this.#model.pose.p[1], this.#model.pose.p[2]], fov: this.#model.pose.fov },
      bodies: { look: this.#model.bodies || painter?.looks?.[0] || "plain", painted: this.#model.painted.bodies, moons: this.#model.painted.moons },
    };
  }

  #satelliteStats(): SatelliteStats {
    const drawn = this.#model.satellites.drawn;
    let propagations = 0;
    let lastBatchMs = 0;
    let maxBatchMs = 0;
    for (const group of this.#model.satellites.groups.values()) {
      propagations += group.satellites.propagations;
      lastBatchMs = Math.max(lastBatchMs, group.satellites.timing.lastBatchMs);
      maxBatchMs = Math.max(maxBatchMs, group.satellites.timing.maxBatchMs);
    }
    return { groups: this.#model.satellites.groups.size, placed: drawn.placed, tooFast: drawn.tooFast, propagations, lastBatchMs, maxBatchMs, updateMs: drawn.updateMs, maxUpdateMs: drawn.maxUpdateMs, averageUpdateMs: drawn.updates ? drawn.totalMs / drawn.updates : 0, updates: drawn.updates };
  }

  // --- the game clock ----------------------------------------------------------------------------------------------------------------------------
  #readSpeed(): number {
    const raw = this.getAttribute("speed");
    const value = raw === null || raw === "" ? 1 : Number(raw);
    return Number.isFinite(value) ? value : 1;
  }

  /** Is anything on show that moves faster than the Earth turns: a group of satellites the clock is slow enough to place? */
  #satellitesMoving(): boolean {
    if (Math.abs(this.#speed) > MAX_SATELLITE_SPEED) return false;
    for (const group of this.#model.satellites.groups.values()) if (group.visible && group.satellites.count > 0) return true;
    return false;
  }

  /** While time runs, draw as often as it shows: real time once a minute; faster time as often as the Earth's turn moves a pixel (1 to 30 times a second). Satellites go round in 90 minutes and a ride along moves the whole picture, so with either on show real time draws about as often as a pixel moves (once a second at least), and a reader who asked for reduced motion gets one step a second. */
  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.isConnected || this.#speed === 0) return;
    const satellites = this.#satellitesMoving();
    const riding = this.#model.ride !== null;
    const radius = this.#model.drawn?.radiusPx ?? 200;
    const pixelsPerSecond = Math.max((satellites ? SATELLITE_RATE : EARTH_RATE) * RAD * Math.abs(this.#speed) * radius, this.#model.rideMotion * Math.abs(this.#speed));
    let perSecond = Math.min(30, Math.max(1, pixelsPerSecond));
    if ((satellites || riding) && matchMedia("(prefers-reduced-motion: reduce)").matches) perSecond = 1;
    const wait = !satellites && !riding && this.#speed === 1 ? REAL_TIME_TICK_MS : 1000 / perSecond;
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
  #placeLabels(places: Record<BodyName, BodyPlace | null>): void {
    this.#places = places;
    const box = this.#labelBox;
    if (!box) return;
    for (const name of BODY_NAMES) {
      let label = this.#pool.get(name);
      const at = places[name];
      if (!label) {
        if (!at) continue;
        const button = box.ownerDocument.createElement("button");
        button.type = "button";
        button.className = "sp-label";
        button.dataset["body"] = name;
        this.#nameLabel(button, name);
        box.append(button);
        this.#pool.set(name, button);
        label = button;
      }
      if (!at) {
        if (!label.hidden) label.hidden = true;
        continue;
      }
      if (label.hidden) label.hidden = false;
      label.style.transform = `translate(${Math.round(at.x + Math.max(4, Math.min(at.r, 40)))}px,${Math.round(at.y - 8)}px)`;
    }
  }

  #placeChosen(place: { x: number; y: number } | null): void {
    const box = this.#labelBox;
    if (!box) return;
    if (!place) {
      if (this.#chosenLabel) this.#chosenLabel.hidden = true;
      return;
    }
    const chosen = this.#model.satellites.selected;
    const name = chosen ? this.satelliteInfo(chosen)?.name : undefined;
    if (!this.#chosenLabel) {
      this.#chosenLabel = box.ownerDocument.createElement("div");
      this.#chosenLabel.className = "sp-sat";
      box.append(this.#chosenLabel);
    }
    if (this.#chosenLabel.textContent !== (name ?? "")) this.#chosenLabel.textContent = name ?? "";
    this.#chosenLabel.hidden = !name;
    this.#chosenLabel.style.transform = `translate(${Math.round(place.x + 10)}px,${Math.round(place.y - 8)}px)`;
  }

  #nameLabel(button: HTMLElement, name: BodyName): void {
    const text = this.#names[name] ?? name;
    button.textContent = text;
    button.setAttribute("aria-label", `${text}: ${this.#hint}`);
  }

  // A body is chosen by pressing on it or on its name (and by Tab and Enter on the name); a drag that turns the view is not a choice.
  #downX = 0;
  #downY = 0;
  #down = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.#downX = event.clientX;
    this.#downY = event.clientY;
    window.addEventListener("pointerup", this.#up, { capture: true, once: true });
  };
  #up = (event: PointerEvent): void => {
    if (Math.hypot(event.clientX - this.#downX, event.clientY - this.#downY) > 6) return;
    const rect = this.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const satellite = this.#model.pick?.(x, y, 12);
    if (satellite) {
      this.dispatchEvent(new CustomEvent("chikyu-satellite-click", { detail: { ...satellite, info: this.satelliteInfo(satellite) }, bubbles: true, composed: true }));
      return;
    }
    if (!this.#places) return;
    let best: BodyName | undefined;
    let bestD = Infinity;
    for (const name of BODY_NAMES) {
      const at = this.#places[name];
      if (!at) continue;
      const d = Math.hypot(x - at.x, y - at.y);
      if (d <= Math.max(at.r, 14) && d < bestD) {
        best = name;
        bestD = d;
      }
    }
    if (best) this.dispatchEvent(new CustomEvent("chikyu-body-click", { detail: this.bodyInfo(best), bubbles: true, composed: true }));
  };
  #labelClick = (event: Event): void => {
    const name = (event.target as HTMLElement | null)?.dataset?.["body"] as BodyName | undefined;
    if (name) this.dispatchEvent(new CustomEvent("chikyu-body-click", { detail: this.bodyInfo(name), bubbles: true, composed: true }));
  };
  #labelFocus = (event: Event): void => {
    const name = (event.target as HTMLElement | null)?.dataset?.["body"] as BodyName | undefined;
    if (name) this.dispatchEvent(new CustomEvent("chikyu-body-focus", { detail: this.bodyInfo(name), bubbles: true, composed: true }));
  };

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

declare global {
  interface HTMLElementTagNameMap {
    "chikyu-space": ChikyuSpace;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-space")) {
  customElements.define("chikyu-space", ChikyuSpace);
}
