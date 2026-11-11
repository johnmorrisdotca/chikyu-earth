// <chikyu-space>: the Earth, the Moon, the Sun and the planets where they are at a date and time, drawn with three.js through kazoku-ui's shared renderer. Optional:
// the line globe and the Earth from space need neither this nor astronomy-engine. It draws only when something changes, at most 30 times a second.
import type { SharedRenderer, View } from "@johnmorrisdotca/kazoku-ui/renderer";
import { carryControls, type ElementControls, type ViewController } from "@johnmorrisdotca/kazoku-ui/view-controls";
import { adoptStyles } from "../adopt.ts";
import type { GeoPoint } from "../types.ts";
import { airFor, readAirThickness } from "../realistic/air.ts";
import { BODY_LABEL_ATTRIBUTES, bodyLabelText, readBodyLabel, type BodyLabelSettings } from "../realistic/body-label.ts";
import { createPlacesHost, PLACES_STYLE, type PlacesHost } from "../places/host.ts";
import { SHORT_NAMES } from "../satellites/names.ts";
import { readPlaces, readPlacesAttribute, type Place } from "../places/types.ts";
import { createGate, frameCap, type Gate } from "../realistic/gate.ts";
import { setThreeLoader, takeRenderer } from "../realistic/shared.ts";
import type { ThreeParts } from "../realistic/textures.ts";
import type { LightMode } from "../realistic/earth.ts";
import { NOTES_STYLE, setAirNote } from "../realistic/air-note.ts";
import { readMeteorStrength } from "../meteors/strength.ts";
import { METEOR_NOTE_STYLE, prefersLessMotion, setMeteorNote } from "../meteors/note.ts";
import { MAX_TEXTURE, type Layer } from "../realistic/tiers.ts";
import { MAX_SATELLITE_SPEED } from "../satellites/limits.ts";
import type { SatelliteInfo, SatelliteRef, Satellites } from "../satellites/types.ts";
import { AU_IN_EARTH_RADII, EARTH_RADIUS_KM, frameAt, type PlanetName } from "./ephemeris.ts";
import { MAX_ORBIT_GROUP, type SatelliteStyle } from "./satellite-layer.ts";
import type { RideLook } from "./ride.ts";
import { placeAround, placeMoon, placeSun, RADIUS, type ScaleMode } from "./scale.ts";
import { BODY_NAMES, type CameraMode, createSpaceItem, DEFAULT_EARTH_SIZE, newSpaceModel, type BodyName, type BodyPainter, type BodyPlace, type RideTarget, type SpaceModel } from "./scene.ts";

export { BODY_NAMES, type BodyName, type CameraMode, type RideTarget };

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
/** A `camera` attribute: `ground` or `sun`, else the camera held in the stars (the default: the Earth turns beneath it). */
const readCamera = (value: string | null): CameraMode => (value === "ground" || value === "sun" ? value : "space");
/** A number attribute within a range, or the fallback. */
const readNumber = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
/** The Earth's own turn, degrees a second. */
const EARTH_RATE = 360 / 86_164.0905;
/** The quickest a satellite goes round, degrees a second (a low orbit: 88 minutes). */
const SATELLITE_RATE = 360 / (88 * 60);
const SATELLITE_COLORS = ["#ffd54f", "#7fd4ff", "#ff8fa3", "#9ef0a8"];
const REAL_TIME_TICK_MS = 60_000;
/** The least time between two `chikyu-timechange` events while time runs: a few a second at most, however fast the picture is drawn. */
const TIME_EVENT_MS = 250;
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

const STYLE = `:host{display:block;aspect-ratio:1/1;position:relative;overflow:hidden}#stage,#labels{position:absolute;inset:0}#labels{pointer-events:none;overflow:hidden}.sp-label{position:absolute;left:0;top:0;margin:0;padding:0;border:0;background:none;font:12px/16px system-ui,-apple-system,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000;will-change:transform;pointer-events:none}.sp-label:focus-visible{outline:2px solid #6cd0ff;outline-offset:2px;border-radius:4px}.sp-label::before{content:"";display:inline-block;width:5px;height:5px;margin:0 5px 1px -2px;border-radius:50%;background:#fff}.sp-label[hidden]{display:none}.sp-sat{position:absolute;left:0;top:0;font:12px/16px system-ui,-apple-system,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000;will-change:transform;pointer-events:none}.sp-sat[hidden]{display:none}${METEOR_NOTE_STYLE}${NOTES_STYLE}${PLACES_STYLE}`;

/**
 * The `<chikyu-space>` custom element: the Earth, the Moon, the Sun and the planets where they are at a date and time, drawn with three.js through the shared renderer. It takes `center`, `time` (`now` or an ISO date), `speed` (1 is real time, 0 holds, 86400 is a day a second, negative runs backwards), `scale` (`compressed` or `true`), `labels` and `orbits` (`off` hides them); positions are computed in the browser by astronomy-engine, an optional peer dependency. It draws only when something changes, and nothing while it is out of sight.
 *
 * It carries kazoku-ui's controls itself: a drag turns the view, two fingers pinch, Ctrl and the wheel zoom (a plain wheel at Fit scrolls the page) and the arrow keys, + and - work once it is focused. The zoom runs from a millionth of Fit (the whole solar system) to 2.5 times, and from 0.5 to 6 times while riding from a body. `controls="none"` turns the hands off; `zoom-min` and `zoom-max` change the range. A `<kazoku-view-controls for="...">` on the element takes the hands over, and the page applies its events with `setView`.
 *
 * While time runs (`speed` is not 0) it sends `chikyu-timechange` with `detail: { time, running: true }`, `time` being the moment shown in milliseconds since 1970, at most four times a second however fast the picture is
 * drawn (and, with the clock at real time, as often as it steps: once a minute, or once a second with satellites or a ride on show), only while the tab is shown, and once with `running: false` when the clock holds
 * (`speed` set to 0): a page writes the date into its date box from it. It is not sent for a `time` the page sets itself. `chikyu-time` is the older event of every step the clock takes (up to thirty a second):
 * it is kept for pages that use it, but a page that shows the date wants `chikyu-timechange`.
 *
 * @example
 * ```ts no-run
 * import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const space = document.createElement("chikyu-space") as ChikyuSpace;
 * space.setAttribute("time", "2026-11-02T12:00Z");
 * space.setAttribute("speed", "86400");
 * space.addEventListener("chikyu-timechange", (event) => {
 *   const { time, running } = (event as CustomEvent<{ time: number; running: boolean }>).detail;
 *   console.log(new Date(time).toISOString(), running ? "running" : "held");
 * });
 * document.body.append(space);
 * ```
 */
export class ChikyuSpace extends HTMLElement {
  static observedAttributes = ["cloud-drift", "camera", "earth-size", "earth-x", "earth-y", "center", "time", "speed", "scale", "labels", "orbits", "bodies", "light", "meteors", "meteors-label", "meteors-strength", "places", "places-turn", ...BODY_LABEL_ATTRIBUTES, "air-thickness", "air-label", "lang"];

  #model: SpaceModel = newSpaceModel();
  #mode: number | "now" = "now";
  #speed = 1;
  #view: View | undefined;
  /** The page has set a `speed` since the element came into the page: for a reader who prefers reduced motion, that is the Play that lets meteors start. */
  #played = false;
  #note: HTMLElement | undefined;
  /** The places the page marks on the Earth (`places`), and the layer that draws them. */
  #marked: Place[] = [];
  #satNames: Record<number, string> = {};
  #placesHost: PlacesHost | undefined;
  #airNote: HTMLElement | undefined;
  #gate: Gate | undefined;
  #taken: { renderer: SharedRenderer<Three>; release(): void } | undefined;
  #stage: HTMLElement | undefined;
  #labelBox: HTMLElement | undefined;
  #state: SpaceState = "loading";
  #timer: ReturnType<typeof setTimeout> | undefined;
  #last = 0;
  #announced = -Infinity;
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
    this.#model.camera = readCamera(this.getAttribute("camera"));
    this.#model.cloudDrift = Number.isFinite(Number(this.getAttribute("cloud-drift") ?? "0")) ? Number(this.getAttribute("cloud-drift") ?? "0") : 0;
    this.#model.earth = { size: readNumber(this.getAttribute("earth-size"), DEFAULT_EARTH_SIZE, 0.02, 50), x: readNumber(this.getAttribute("earth-x"), 0.5, -2, 3), y: readNumber(this.getAttribute("earth-y"), 0.5, -2, 3) };
    this.#model.stepMs = Math.max(1000, Math.abs(this.#speed) * 1000);
    this.#model.speed = this.#speed;
    if (!this.hasAttribute("role")) this.setAttribute("role", "img");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "The Earth, the Moon, the Sun and the planets in their places for the date shown");

    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<div id="stage"></div><div id="labels" aria-hidden="true"></div><div id="notes"><p id="air-note" hidden></p><p id="meteor-note" hidden></p></div>`;
    adoptStyles(root, STYLE, this.nonce);
    this.#stage = root.getElementById("stage")!;
    this.#labelBox = root.getElementById("labels")!;
    this.#note = root.getElementById("meteor-note")!;
    this.#airNote = root.getElementById("air-note")!;
    this.#placesHost = createPlacesHost(root, { onClick: (place) => this.#placeClick(place), reducedMotion: prefersLessMotion });
    if (this.hasAttribute("places")) this.#marked = readPlacesAttribute(this.getAttribute("places")).places;
    if (this.#marked.length > 0) this.#placesHost.set(this.#marked);
    this.#model.airThickness = readAirThickness(this.getAttribute("air-thickness"));
    this.#applyBodyLabel();
    setAirNote(this.#airNote, this, this.#model.airThickness);
    this.#played = false;
    this.#model.meteors.on = this.#meteorsAsked();
    this.#model.meteors.strength = readMeteorStrength(this.getAttribute("meteors-strength"));
    this.#model.meteors.running = () => this.#speed !== 0 && document.visibilityState !== "hidden" && (this.#played || !prefersLessMotion());
    this.#model.meteors.onShower = (shower, zhr) => this.dispatchEvent(new CustomEvent("chikyu-meteors", { detail: { shower, zhr } }));
    setMeteorNote(this.#note, this, this.#model.meteors.on);
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
      air: () => airFor(this.getAttribute("air")),
      invalidate: () => this.#gate?.request(),
      onError: (error) => this.#fail(error instanceof Error ? error.message : String(error)),
      onTier: (layer: Layer, width: number) => {
        this.#tiers[layer] = width;
      },
      onLabels: (places) => this.#placeLabels(places),
      onLabelError: (error) => this.dispatchEvent(new CustomEvent("chikyu-body-label-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      onPlaces: (view) => this.#placesHost?.frame(view),
      onSatelliteMarks: (marks) => this.#showMarks(marks),
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
    this.#placesHost?.dispose();
    this.#placesHost = undefined;
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
    else if (name === "camera") this.camera = readCamera(value);
    else if (name === "cloud-drift") {
      this.#model.cloudDrift = Number.isFinite(Number(value ?? "0")) ? Number(value ?? "0") : 0;
      this.#gate?.request();
    }
    else if (name === "earth-size") this.earthSize = readNumber(value, DEFAULT_EARTH_SIZE, 0.02, 50);
    else if (name === "earth-x") this.earthX = readNumber(value, 0.5, -2, 3);
    else if (name === "earth-y") this.earthY = readNumber(value, 0.5, -2, 3);
    else if (name === "meteors") this.meteors = this.#meteorsAsked();
    else if (name === "places") this.places = readPlacesAttribute(value).places;
    else if (name === "meteors-strength") {
      this.#model.meteors.strength = readMeteorStrength(value);
      this.#gate?.request();
    }
    else if (name === "air-thickness") {
      this.#model.airThickness = readAirThickness(value);
      this.#gate?.request();
    }
    else if (name === "meteors-label" || name === "lang") {
      setMeteorNote(this.#note, this, this.#model.meteors.on);
      if (name === "lang") this.#applyBodyLabel();
    } else if ((BODY_LABEL_ATTRIBUTES as readonly string[]).includes(name)) this.#applyBodyLabel();
    if (name === "air-thickness" || name === "air-label" || name === "lang") setAirNote(this.#airNote, this, this.#model.airThickness);
  }

  #meteorsAsked(): boolean {
    return this.hasAttribute("meteors") && this.getAttribute("meteors") !== "off";
  }

  /**
   * Meteors seen from space, on or off (the attribute `meteors`): short streaks where meteors burn, on the dark side of the Earth and in its twilight, more of them under an active shower, only while the
   * clock runs, and for a reader who prefers reduced motion only once the page has set a `speed` (a Play). Each streak's place and moment are drawn at random, and a line under the picture says so
   * (`meteors-label="off"` takes it away); how often they appear, where, how high and when follow real data (`@johnmorrisdotca/chikyu-earth/meteors`). None are drawn while the Earth is under 40 pixels in radius.
   * `chikyu-meteors` is sent when the strongest active shower changes, with `detail: { shower, zhr }`. Off by default, and nothing of theirs is made until they are first switched on.
   */
  get meteors(): boolean {
    return this.#model.meteors.on;
  }
  set meteors(value: boolean) {
    if (value !== this.#meteorsAsked()) {
      if (value) this.setAttribute("meteors", "");
      else this.removeAttribute("meteors");
      return;
    }
    this.#model.meteors.on = value;
    setMeteorNote(this.#note, this, value);
    this.#gate?.request();
  }

  /**
   * How strongly the meteors are drawn, from 0 to 1 (the attribute `meteors-strength`; 1, the full look, when the page says nothing): it scales how bright each streak is and how many are drawn, so 0.3 is
   * fewer and fainter and 0 draws none. It changes nothing that is real: the rates, the showers and `chikyu-meteors` are the same at every strength, and the line under the picture still says the streaks are an illustration.
   * A number outside the range is brought to its nearest end; setting the property writes the attribute.
   */

  get meteorsStrength(): number {
    return this.#model.meteors.strength;
  }
  set meteorsStrength(value: number) {
    this.setAttribute("meteors-strength", String(value));
  }

  /**
   * The name written on the Earth, as the family's body label: `EARTH` (`地球` on a Japanese page) laid on the globe so it turns with it, the surface showing through the letters. Off (`null`) unless the page sets it. The plain attributes are the family's:
   * `body-label` (`painted`, `etched`, `outline` or `burned`; absent, no label), `body-label-strength` (0 to 1, 0.5), `body-label-repeat` (`once`, `both` or `around`), `body-label-latitude` (degrees), `body-label-facing` (present: always facing the reader),
   * `body-label-font` (a CSS font family the page has loaded; Michroma, fetched once, when left out) and `body-label-fallback-font` (for letters the font has none of, such as Japanese). The property is the same options as an object, or `null`; setting it writes the attributes.
   * Nothing of it is fetched or made until it is first set, it is not drawn while the Earth is under 24 pixels in radius, and nothing is drawn at rest. A three.js handed over with `setThreeLoader` must include `CanvasTexture`, `SphereGeometry`, `MeshLambertMaterial`, `SRGBColorSpace`, `NormalBlending`
   * and `AdditiveBlending`; without them `chikyu-body-label-unavailable` is sent and the name is not drawn.
   */
  get bodyLabel(): BodyLabelSettings | null {
    return readBodyLabel((name) => this.getAttribute(name));
  }
  set bodyLabel(value: Partial<BodyLabelSettings> | null) {
    for (const name of BODY_LABEL_ATTRIBUTES) this.removeAttribute(name);
    if (value === null) return;
    this.setAttribute("body-label", value.look ?? "painted");
    if (value.strength !== undefined) this.setAttribute("body-label-strength", String(value.strength));
    if (value.repeat !== undefined) this.setAttribute("body-label-repeat", value.repeat);
    if (value.latitude !== undefined) this.setAttribute("body-label-latitude", String(value.latitude));
    if (value.facing) this.setAttribute("body-label-facing", "");
    if (value.font) this.setAttribute("body-label-font", value.font);
    if (value.fallbackFont) this.setAttribute("body-label-fallback-font", value.fallbackFont);
  }

  /** Puts the name's settings and text right from the attributes (`body-label` and its family, `lang`). */
  #applyBodyLabel(): void {
    this.#model.bodyLabel.settings = readBodyLabel((name) => this.getAttribute(name));
    this.#model.bodyLabel.text = bodyLabelText((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en");
    this.#gate?.request();
  }

  /**
   * How many times its real thickness the air is drawn, from 1 (the true thickness) to 5 (the attribute `air-thickness`; 3 when the page says nothing): see `<chikyu-earth-realistic>`. While it is above 1 the element says so in a line
   * under the picture (`air-label="off"` takes the line away, for a page that says it itself).
   */
  get airThickness(): number {
    return this.#model.airThickness;
  }
  set airThickness(value: number) {
    this.setAttribute("air-thickness", String(value));
  }

  /**
   * The places the page marks on the Earth (the attribute `places` is the same list as JSON): see `<chikyu-earth-realistic>`. Each `{ id, lat, lon, label?, kind? }` stands out of the Earth as a ring on the ground and a beam with a head, turning with it and
   * hidden on the far side, with its name beside it that never overlaps another name or marker. `kind: "here"` is the visitor's own place and stands out; any other kind is `favourite`, quieter. None are drawn while the Earth is under 14 pixels in
   * radius or the view rides along a body. Pressing a name sends `chikyu-place-click`, and the attribute `places-turn` turns the view to the place.
   */
  get places(): readonly Place[] {
    return this.#marked;
  }
  set places(list: readonly Place[]) {
    this.#marked = readPlaces(list).places;
    this.#placesHost?.set(this.#marked);
  }

  #placeClick(place: Place): void {
    this.dispatchEvent(new CustomEvent("chikyu-place-click", { detail: { place }, bubbles: true, composed: true }));
    if (this.hasAttribute("places-turn") && this.getAttribute("places-turn") !== "off") this.centre = { lon: place.lon, lat: place.lat };
  }

  get centre(): GeoPoint {
    return { ...this.#model.centre };
  }
  set centre(value: GeoPoint) {
    this.#model.centre = { ...value };
    this.#model.cameraSpin = null;
    this.#gate?.request();
  }

  /**
   * How the camera is held (the `camera` attribute). `space` (the default): held in the stars, looking at the place `center` names as it is at the moment the camera is set (when the element opens, and again when `time` or `center` is set), so the Earth
   * turns beneath it as the clock runs, with the day and night line where the Sun really is. `ground`: held over `center` on the ground, so the Earth keeps still and the clock moves the light across it. `sun`: held on the Sun's side, `center` being the
   * longitude and latitude from the sub-solar point (`0,0` looks straight at the noon place), so the day and night line keeps its place on the screen while the Earth turns beneath.
   */
  get camera(): CameraMode {
    return this.#model.camera;
  }
  set camera(value: CameraMode) {
    this.#model.camera = value;
    this.#model.cameraSpin = null;
    this.#gate?.request();
  }

  /** The share of the view's shorter side the Earth's disc fills at zoom 1 (the `earth-size` attribute): 0.9 by default, so the atmosphere's glow is never cut at any shape of box. Above 1 the Earth is larger than the view. */
  get earthSize(): number {
    return this.#model.earth.size;
  }
  set earthSize(value: number) {
    this.#model.earth.size = Number.isFinite(value) ? Math.min(50, Math.max(0.02, value)) : DEFAULT_EARTH_SIZE;
    this.#gate?.request();
  }

  /** Where the Earth's centre is across the view (the `earth-x` attribute): 0 at the left edge, 0.5 in the middle (the default), 1 at the right edge. */
  get earthX(): number {
    return this.#model.earth.x;
  }
  set earthX(value: number) {
    this.#model.earth.x = Number.isFinite(value) ? value : 0.5;
    this.#gate?.request();
  }

  /** Where the Earth's centre is down the view (the `earth-y` attribute): 0 at the top, 0.5 in the middle (the default), 1 at the bottom. */
  get earthY(): number {
    return this.#model.earth.y;
  }
  set earthY(value: number) {
    this.#model.earth.y = Number.isFinite(value) ? value : 0.5;
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
    // time up to this moment is worked out at the old speed, so a hold keeps the moment the reader saw last
    if (this.#speed !== 0 && this.isConnected) this.#advance(performance.now());
    const was = this.#speed;
    if (this.isConnected && this.#view) this.#played = true;
    this.#speed = Number.isFinite(value) ? value : 1;
    this.#model.speed = this.#speed;
    this.#model.stepMs = Math.max(1000, Math.abs(this.#speed) * 1000);
    this.#last = performance.now();
    this.#schedule();
    this.#gate?.request();
    if (this.#speed === 0 && was !== 0) this.#announce(false);
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

  /**
   * Ring and name every satellite of a group (or stop): a ring round each and its name beside it, in the page's language (the ISS, Tiangong and Hubble by their short names, the rest as their elements name them, or as `satelliteNames` says), never over another name, a place's or a ring's.
   * Names and rings are drawn with the places, only for satellites that are in the picture and not behind the Earth, and nothing is drawn at rest. `chikyu-satellite-visibility` is sent with `detail: { ref, visible }` when a labelled satellite comes into view or goes out of it (not at every frame).
   * At most 80 satellites are ringed, over all the groups. A group that is not set, or is not shown, has none.
   *
   * @param group - The group's name, as given to `setSatellites`.
   * @param on - `true` to ring and name its members (the default), `false` to stop.
   */
  labelSatellites(group: string, on = true): void {
    if (on) this.#model.satellites.marked.add(group);
    else this.#model.satellites.marked.delete(group);
    this.#gate?.request();
  }

  /** The groups whose satellites are ringed and named now (`labelSatellites`). */
  get labelledSatellites(): string[] {
    return [...this.#model.satellites.marked];
  }

  /**
   * The names written beside the ringed satellites, by NORAD number, for a page in another language or with names of its own (`{ 25544: "Space Station" }`). One left out keeps its short name (the ISS, Tiangong and Hubble) or the name in its elements.
   */
  get satelliteNames(): Record<number, string> {
    return { ...this.#satNames };
  }
  set satelliteNames(value: Record<number, string>) {
    this.#satNames = { ...value };
    this.#gate?.request();
  }

  /**
   * Where a satellite is on the screen as of the last draw: `{ x, y, visible, heightKm }` in CSS pixels from the view's top left, `visible` meaning it is inside the box and not behind the Earth. `null` when its group is not set or not shown, it cannot be
   * placed (its elements are too old), or it is behind the camera. It is the picture's own camera maths and its own test for the Earth in the way, so a page that draws its own rings need not repeat either.
   */
  placeSatellite(ref: SatelliteRef): { x: number; y: number; visible: boolean; heightKm: number } | null {
    return this.#model.placeSatellite?.(ref) ?? null;
  }

  /** The name beside a ringed satellite: the page's own (`satelliteNames`), else the short one in the page's language, else the name in its elements. */
  #satelliteName(ref: SatelliteRef): string {
    const info = this.satelliteInfo(ref);
    if (!info) return "";
    const lang = (this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
    return this.#satNames[info.noradId] ?? SHORT_NAMES[info.noradId]?.[lang] ?? info.name;
  }

  #markSeen = new Map<string, boolean>();

  /** Hands the places layer the ringed satellites of this draw, and tells the page when one comes into view or goes out of it. */
  #showMarks(marks: readonly { ref: SatelliteRef; x: number; y: number; visible: boolean }[]): void {
    this.#placesHost?.setMarks(marks.map((m) => ({ id: `${m.ref.group}:${m.ref.index}`, label: this.#satelliteName(m.ref), x: m.x, y: m.y, visible: m.visible })));
    const now = new Map<string, boolean>();
    for (const m of marks) {
      const key = `${m.ref.group}:${m.ref.index}`;
      now.set(key, m.visible);
      if (this.#markSeen.get(key) !== m.visible && (this.#markSeen.has(key) || m.visible)) this.dispatchEvent(new CustomEvent("chikyu-satellite-visibility", { detail: { ref: m.ref, visible: m.visible }, bubbles: true, composed: true }));
    }
    for (const [key, was] of this.#markSeen) {
      if (!now.has(key) && was) {
        const [group, index] = key.split(":");
        this.dispatchEvent(new CustomEvent("chikyu-satellite-visibility", { detail: { ref: { group: group!, index: Number(index) }, visible: false }, bubbles: true, composed: true }));
      }
    }
    this.#markSeen = now;
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
      return Math.min(1, (this.#model.fit * radius) / ((reach * radius * 1.15) / Math.tan(17.5 * RAD)));
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
    return preset === "earth" ? 1 : this.#model.fit / Math.max(this.#model.fit, reach * 3.4);
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
    /** The meteors: whether they are on, the streaks alive now and started so far, the streaks a second being drawn, and the strongest active shower's code and rate. */
    meteors: { on: boolean; strength: number; alive: number; spawned: number; perSecond: number; shower: string | null; zhr: number };
    /** The name written on the Earth: whether `body-label` is set, its text, the label is made, and it is showing (it is hidden while the Earth is small). */
    bodyLabel: { on: boolean; text: string; made: boolean; showing: boolean };
    /** The places: how many were handed in, how many face the viewer, the names shown, the times the layer was drawn, and whether its pulse is running. */
    places: { places: number; facing: number; labels: number; renders: number; pulsing: boolean };
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
      meteors: { on: this.#model.meteors.on, strength: this.#model.meteors.strength, ...this.#model.meteors.drawn },
      bodyLabel: { on: this.#model.bodyLabel.settings !== null, text: this.#model.bodyLabel.text, ...this.#model.bodyLabel.drawn },
      places: this.#placesHost?.stats ?? { places: this.#marked.length, facing: 0, labels: 0, renders: 0, pulsing: false },
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

  /** Bring the moment shown up to `now` (the page's own clock, in milliseconds) at the speed it has run at. */
  #advance(now: number): void {
    if (this.#speed === 1 && this.#mode === "now") this.#model.time = Date.now();
    else this.#model.time += (now - this.#last) * this.#speed;
    this.#last = now;
  }

  /** Tell the page the moment shown: at most four times a second while time runs (`running`, and not from a hidden tab), and once, at once, when it holds. */
  #announce(running: boolean): void {
    const now = performance.now();
    if (running && (now - this.#announced < TIME_EVENT_MS || document.visibilityState === "hidden")) return;
    this.#announced = running ? now : -Infinity;
    this.dispatchEvent(new CustomEvent("chikyu-timechange", { detail: { time: this.#model.time, running } }));
  }

  #tick = (): void => {
    this.#advance(performance.now());
    this.#gate?.request();
    this.#schedule();
    this.dispatchEvent(new CustomEvent("chikyu-time", { detail: { time: this.#model.time } }));
    this.#announce(this.#speed !== 0);
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
