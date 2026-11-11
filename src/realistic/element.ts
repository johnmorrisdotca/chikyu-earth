// <chikyu-earth-realistic>: the Earth from space as a web component, drawn by kazoku-ui's shared 3D renderer (one WebGL context for the
// page) with three.js, which is the page's own. Optional entry point: the flat `<chikyu-earth>` needs neither. It draws only when something
// changes, at most 30 times a second, and nothing at all while it is out of sight or the tab is hidden.
import { carryControls, type ElementControls, type ViewController } from "@johnmorrisdotca/kazoku-ui/view-controls";
import { adoptStyles } from "../adopt.ts";
import type { SharedRenderer, View } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { GeoPoint, GlobeView } from "../types.ts";
import { airFor, readAirThickness } from "./air.ts";
import { NOTES_STYLE, setAirNote } from "./air-note.ts";
import { cameraCentre, type CameraMode, createEarthItem, discRadius, lookAt, newModel, type EarthModel, type LightMode, type ThreeParts } from "./earth.ts";
import { MAX_SATELLITE_SPEED } from "../satellites/limits.ts";
import { setSatelliteNote } from "../satellites/note.ts";
import type { SatelliteInfo, SatelliteRef, Satellites } from "../satellites/types.ts";
import { MAX_ORBIT_GROUP, newestEpoch, type SatelliteStyle } from "../space/satellite-layer.ts";
import { readMeteorStrength } from "../meteors/strength.ts";
import { METEOR_NOTE_STYLE, prefersLessMotion, setMeteorNote } from "../meteors/note.ts";
import type { Credit, DataSource } from "../data-door.ts";
import { createDoorHost, type DoorHost } from "../door/host.ts";
import { folderSource } from "../door/map.ts";
import { ownCredit } from "../door/own.ts";
import { BODY_LABEL_ATTRIBUTES, bodyLabelText, loadMichroma, readBodyLabel, type BodyLabelSettings } from "./body-label.ts";
import { createSkyHost, SKY_ATTRIBUTES, SKY_STYLE, type SkyHost } from "../sky/host.ts";
import { cleanPlaces, orthoView, readPlaces, type Place, type PlaceLook } from "../markers/places.ts";
import { createPlaceLayer, PLACE_STYLE, readPlaceLook, type PlaceLayer } from "../markers/place-layer.ts";
import type { LabelStyle } from "@johnmorrisdotca/hoshi-stars/sky-labels";

import { createGate, frameCap, type Gate } from "./gate.ts";
import { setSharedRenderer, setThreeLoader, takeRenderer } from "./shared.ts";
export { setSharedRenderer, setThreeLoader };
export type { CameraMode };
import type { OverlayHost, OverlayPose } from "../markers/layer.ts";
import { MAX_TEXTURE, TIERS, type Layer } from "./tiers.ts";
import type { TileSources, TileStats } from "./tile-set.ts";

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

const STYLE = ":host{display:block;aspect-ratio:1/1;position:relative}:host([immersive]){aspect-ratio:auto;width:100%;height:100%;touch-action:none!important;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}#stage,#overlay{position:absolute;inset:0}#overlay{pointer-events:none}" + PLACE_STYLE + SKY_STYLE + METEOR_NOTE_STYLE + NOTES_STYLE;
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

/** A `camera` attribute: `ground` or `sun`, else the camera held in the stars (the default: the Earth turns beneath it). */
const readCamera = (value: string | null): CameraMode => (value === "ground" || value === "sun" ? value : "space");
/** A `cloud-drift` attribute: degrees an hour the clouds are made to move eastward against the ground (0, the default: where the picture has them). */
const readDrift = (value: string | null): number => (value !== null && Number.isFinite(Number(value)) ? Number(value) : 0);
/** The plain wheel in an immersive view is a pinch of this share: a notch (100) zooms about 1.2 times, as the family's mouse wheel does with Alt. */
const WHEEL_AS_PINCH = 0.2;
/** The quickest a satellite goes round, degrees a second (a low orbit: 88 minutes). */
const SATELLITE_RATE = 360 / (88 * 60);
const SATELLITE_COLORS = ["#ffd54f", "#7fd4ff", "#ff8fa3", "#9ef0a8"];
type SatelliteStats = { groups: number; placed: number; tooFast: boolean; heldAt: number | null; propagations: number; lastBatchMs: number; maxBatchMs: number; updateMs: number; maxUpdateMs: number; averageUpdateMs: number; updates: number };

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
 * `meteors` (the attribute, with or without a value other than `off`; the property is a boolean) draws meteors as they look from space: short streaks 80 to 120 km up,
 * only where it is dark or twilight, more of them where an active shower's radiant stands high and on the side that faces the Earth's way. Each streak's place and
 * moment are drawn at random (and said so in a line under the picture, which `meteors-label="off"` takes away for a page that says it itself); how many there are,
 * where they fall, their height and the showers' dates are real (`@johnmorrisdotca/chikyu-earth/meteors`). They run while the clock runs, at any speed, and not
 * at all while it is held, out of sight, in a hidden tab, or for a reader who prefers reduced motion until the page sets a `speed` (a Play). `chikyu-meteors`
 * is sent when the strongest active shower changes, with `detail: { shower, zhr }` (`shower` is `null` when none is active).
 * `meteors-strength` (0 to 1, the property `meteorsStrength`; 1 when the page says nothing) makes them subtler: fewer streaks and fainter ones, none at 0, and nothing that is real changes.
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
  static observedAttributes = ["cloud-drift", "center", "time", "speed", "clouds", "lights", "light", "live-seconds", "tiles", "data", "camera", "immersive", "meteors", "meteors-label", "satellites-label", "meteors-strength", ...BODY_LABEL_ATTRIBUTES, ...SKY_ATTRIBUTES, "air-thickness", "air-label", "lang", "places", "places-look"];

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
  /** The data door: the outside sources of map this Earth draws from, and whose data is on the screen. */
  #door: DoorHost = createDoorHost(
    this,
    {
      own: () => this.#ownCredits(),
      used: () => new Map(Object.entries(this.#model.tiles?.stats.used ?? {})),
    },
    { kinds: ["tiles"] },
    () => this.#gate?.soon(),
  );
  #stage: HTMLElement | undefined;
  #overlay: HTMLElement | undefined;
  #pose: OverlayPose | null = null;
  #listeners = new Set<(pose: OverlayPose) => void>();
  #placeLayer: PlaceLayer | undefined;
  #placeList: Place[] = [];
  #hands: ElementControls | undefined;
  #reach: string | null = null;
  /** The page has set a `speed` since the element came into the page: for a reader who prefers reduced motion, that is the Play that lets meteors start. */
  #played = false;
  #note: HTMLElement | undefined;
  /** The line under the picture while the clock is too fast to follow the satellites. */
  #satNote: HTMLElement | undefined;
  /** The names of the stars and the constellation lines (`star-names`, `constellation-lines`), and the look of the names. */
  #sky: SkyHost | undefined;
  #skyStyle: Partial<LabelStyle> = {};
  #airNote: HTMLElement | undefined;
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
    this.#model.camera = readCamera(this.getAttribute("camera"));
    this.#model.cloudDrift = readDrift(this.getAttribute("cloud-drift"));
    this.#model.airThickness = readAirThickness(this.getAttribute("air-thickness"));
    this.#applyBodyLabel();
    this.#door.book.ownOnly(this.getAttribute("data") === "own");
    this.#model.speed = this.speed;
    if (!this.hasAttribute("role")) this.setAttribute("role", "img");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "The Earth from space, with its sunlit and dark sides");

    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<div id="stage"></div><div id="places"></div><div id="overlay"></div><div id="notes"><p id="air-note" hidden></p><p id="meteor-note" hidden></p><p id="sat-note" hidden></p></div>`;
    adoptStyles(root, STYLE, this.nonce);
    this.#stage = root.getElementById("stage")!;
    this.#overlay = root.getElementById("overlay")!;
    this.#note = root.getElementById("meteor-note")!;
    this.#satNote = root.getElementById("sat-note")!;
    this.#airNote = root.getElementById("air-note")!;
    this.#sky = createSkyHost({
      root,
      attribute: (name) => this.getAttribute(name),
      language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
      onError: (error) => this.dispatchEvent(new CustomEvent("chikyu-sky-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      loadFont: loadMichroma,
    });
    this.#sky.setStyle(this.#skyStyle);
    this.#placeLayer = createPlaceLayer(root.getElementById("places")!);
    this.#placeList = readPlaces(this.getAttribute("places"));
    this.#placeLayer.set(this.#placeList);
    this.#placeLayer.look = readPlaceLook(this.getAttribute("places-look"));
    this.#played = false;
    this.#model.meteors.on = this.#meteorsAsked();
    this.#model.meteors.strength = readMeteorStrength(this.getAttribute("meteors-strength"));
    this.#model.meteors.running = () => this.speed !== 0 && document.visibilityState !== "hidden" && (this.#played || !prefersLessMotion());
    this.#model.meteors.onShower = (shower, zhr) => this.dispatchEvent(new CustomEvent("chikyu-meteors", { detail: { shower, zhr } }));
    this.#meteorNote();
    setAirNote(this.#airNote, this, this.#model.airThickness);
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
      sources: () => this.#tileSources(),
      onTiles: (layers) => {
        if (!this.hasAttribute("zoom-max") || this.getAttribute("zoom-max") === this.#reach) {
          this.#reach = TILES_ZOOM_MAX;
          // not written again when it is already there: the view controls take a written attribute as a new limit and bring the view back to fit, which a change of source must not do to a reader's zoom
          if (this.getAttribute("zoom-max") !== TILES_ZOOM_MAX) this.setAttribute("zoom-max", TILES_ZOOM_MAX);
        }
        this.dispatchEvent(new CustomEvent("chikyu-tiles", { detail: { layers } }));
      },
      air: () => airFor(this.getAttribute("air")),
      invalidate: () => this.#gate?.soon(),
      onDraw: () => this.#gate?.drawn(),
      onTiled: () => this.#door.announce(),
      onSky: (sky) => this.#sky?.frame(sky),
      onLabelError: (error) => this.dispatchEvent(new CustomEvent("chikyu-body-label-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      onPose: (pose) => {
        if (this.#hands) this.#hands.controller.grabRadius = discRadius(pose.width, pose.height, 1);
        this.#pose = { ...pose, transform: "" };
        for (const listener of this.#listeners) listener(this.#pose);
        if (this.#placeLayer && (this.#placeList.length > 0 || this.#placeLayer.stats.shown > 0)) this.#placeLayer.frame(orthoView(pose));
      },
      onSatellitesError: (error) => this.dispatchEvent(new CustomEvent("chikyu-satellites-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
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
    this.addEventListener("pointerdown", this.#down);
    this.addEventListener("focusin", this.#take);
    // before the shared hands (which hear it after this): a plain wheel in an immersive view zooms
    this.addEventListener("wheel", this.#wheel, { capture: true, passive: false });
    this.#hands = carryControls(this, { initial: this.#model.view, limits: LIMITS, onChange: (state, info) => this.setView(state, info.final) });
    this.#startTick();
    document.addEventListener("visibilitychange", this.#onVisible);
    this.#locate();
  }

  disconnectedCallback(): void {
    this.removeEventListener("pointerdown", this.#take);
    this.removeEventListener("pointerdown", this.#down);
    this.removeEventListener("wheel", this.#wheel, { capture: true });
    window.removeEventListener("pointerup", this.#up, true);
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
    this.#sky?.dispose();
    this.#sky = undefined;
    this.#placeLayer?.dispose();
    this.#placeLayer = undefined;
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
    else if (name === "data") this.#door.book.ownOnly(value === "own");
    else if (name === "camera") this.camera = readCamera(value);
    else if (name === "cloud-drift") {
      this.#model.cloudDrift = readDrift(value);
      this.#gate?.soon();
    }
    else if (name === "meteors") this.meteors = this.#meteorsAsked();
    else if (name === "meteors-strength") {
      this.#model.meteors.strength = readMeteorStrength(value);
      this.#gate?.soon();
    }
    else if (name === "air-thickness") {
      this.#model.airThickness = readAirThickness(value);
      this.#gate?.soon();
    }
    else if (name === "meteors-label" || name === "lang") {
      this.#meteorNote();
      if (name === "lang") {
        this.#applyBodyLabel();
        this.#sky?.refresh();
      }
    } else if ((BODY_LABEL_ATTRIBUTES as readonly string[]).includes(name)) this.#applyBodyLabel();
    else if ((SKY_ATTRIBUTES as readonly string[]).includes(name)) this.#sky?.refresh();
    else if (name === "places") {
      this.#placeList = readPlaces(value);
      this.#placeLayer?.set(this.#placeList);
      this.#gate?.soon();
    } else if (name === "places-look" && this.#placeLayer) {
      this.#placeLayer.look = readPlaceLook(value);
      this.#gate?.soon();
    }
    if (name === "air-thickness" || name === "air-label" || name === "lang") setAirNote(this.#airNote, this, this.#model.airThickness);
    if (name === "satellites-label" || name === "lang") this.#noteSatellites();
  }

  #meteorsAsked(): boolean {
    return this.hasAttribute("meteors") && this.getAttribute("meteors") !== "off";
  }

  /** The line under the picture that says the streaks are an illustration, in the language of the element or the page. */
  #meteorNote(): void {
    setMeteorNote(this.#note, this, this.#model.meteors.on);
  }

  /**
   * How many times its real thickness the air is drawn, from 1 (the true thickness) to 5 (the attribute `air-thickness`; 3 when the page says nothing). The shell, and the heights over which the air thins, are that many times larger, and the
   * air's own light is the same, so a ring that is a hair's breadth at whole-Earth zoom can be seen. While it is above 1 the element says so in a line under the picture (`air-label="off"` takes the line away, for a page that says it itself).
   */
  get airThickness(): number {
    return this.#model.airThickness;
  }
  set airThickness(value: number) {
    this.setAttribute("air-thickness", String(value));
  }

  /**
   * Meteors seen from space, on or off (the attribute `meteors`): see the class's description. Off by default, and nothing of theirs is made until they are first switched on.
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
    this.#meteorNote();
    this.#gate?.soon();
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

  /**
   * The names of the brightest stars and the constellations as faint lines, laid over the sky the page draws (hoshi-stars' `sky-labels`, an optional peer loaded only when one of these is set). The plain attributes are hoshi's: `star-names` (a count of the brightest stars in view and not covered by the
   * Earth, the Moon or the Sun; bare is 10), `star-names-magnitude` (only stars at least that bright) and `constellation-lines` (the 88 figures as lines at this strength, 0 to 1; bare is 0.16): none of them, and nothing is loaded. The figure under the pointer or touched is at full strength and shows its name. Names are in the
   * page's language and never overlap. Nothing is redrawn at rest. `chikyu-sky-unavailable` is sent when hoshi-stars is not there. The property is the look of the names, a partial hoshi-stars `LabelStyle` (font, size, case, ring, leader and the rest).
   */
  get skyStyle(): Partial<LabelStyle> {
    return { ...this.#skyStyle };
  }
  set skyStyle(value: Partial<LabelStyle>) {
    this.#skyStyle = { ...value };
    this.#sky?.setStyle(this.#skyStyle);
  }

  /**
   * Places marked on the Earth (the attribute `places`, a JSON array): each `{ id, lon, lat, label, kind }`, `kind` being `here` (where the reader is: drawn bright and taller, with a quiet pulse) or `favourite`
   * (the default: quieter). Each stands up out of the ground, turns with the Earth, is hidden on its far side and keeps its size in pixels at any zoom. Names go at the top, `here` first, and never overlap
   * one another; one with no room is left out. The element stores nothing and sends nothing: the page hands the places over and keeps them where it likes. Setting the property writes the attribute; at most
   * `MAX_PLACES` are drawn. Nothing is drawn again at rest: the pulse is the page's own animation, stopped out of sight and for a reader who asked for less motion.
   */
  get places(): Place[] {
    return this.#placeList.map((place) => ({ ...place }));
  }
  set places(value: readonly Place[]) {
    const clean = cleanPlaces(value);
    if (clean.length === 0) this.removeAttribute("places");
    else this.setAttribute("places", JSON.stringify(clean));
  }

  /** How the places are drawn (the attribute `places-look`): `beam` (a light rising out of the ground with a ring at its foot, the default), `pin` (a thin stick with a round head) or `ring` (only the ring on the ground). */
  get placesLook(): PlaceLook {
    return this.#placeLayer?.look ?? readPlaceLook(this.getAttribute("places-look"));
  }
  set placesLook(value: PlaceLook) {
    this.setAttribute("places-look", value);
  }

  /** Puts the name's settings and text right from the attributes (`body-label` and its family, `lang`). */
  #applyBodyLabel(): void {
    this.#model.bodyLabel.settings = readBodyLabel((name) => this.getAttribute(name));
    this.#model.bodyLabel.text = bodyLabelText((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en");
    this.#gate?.soon();
  }

  /** The controller behind the element's own hands (`set`, `fit`, `state`), while it is in a page. */
  get controller(): ViewController | undefined {
    return this.#hands?.controller;
  }

  /** The map source of each layer now: the last one a page added for it, else the folder of the `tiles` attribute. */
  #tileSources(): TileSources {
    const folder = this.tiles === null ? undefined : folderSource(this.tiles);
    const day = this.#door.book.mapSources("day")[0] ?? folder;
    const night = this.#door.book.mapSources("night")[0] ?? folder;
    return { ...(day ? { day } : {}), ...(night ? { night } : {}) };
  }

  /** The package's own credits for the last drawn frame: its pictures while it is drawn, and its finer tiles when a window of them is in view (unless a page added the folder itself, which the door counts). */
  #ownCredits(): Credit[] {
    const used = this.#model.tiles?.stats.used ?? {};
    const own: Credit[] = [ownCredit("chikyu-pictures", this.#state === "live" ? 1 : 0)];
    if (this.#door.book.get("chikyu-tiles") === undefined) own.push(ownCredit("chikyu-tiles", used["chikyu-tiles"] ?? 0));
    return own;
  }

  /**
   * The outside sources of map this Earth draws from (the data door): each carries its own licence and credit, and a map source for the `day` or `night` layer takes the place of the folder of tiles for that layer. Assign a list to
   * replace them; a source that is refused (an empty credit, no licence, a clashing id, a kind the Earth does not draw, a layer it does not know) throws a `TypeError` and nothing changes. A property, never an attribute: data is not text.
   */
  get sources(): readonly DataSource[] {
    return this.#door.sources();
  }
  set sources(list: readonly unknown[]) {
    this.#door.setSources(list);
  }

  /** Adds an outside source of map: checked at once (a `TypeError` for one that is refused), and the Earth draws from it. Returns the function that takes it away. */
  addSource(source: unknown): () => void {
    return this.#door.book.addSource(source);
  }

  /** Takes a source away by its id: its loads stop, its tiles are freed, its credit goes. Returns whether there was one. */
  removeSource(id: string): boolean {
    return this.#door.book.removeSource(id);
  }

  /** Switches a source off (`false`) or on again, and keeps it in the Earth: a layers panel's switch. The attribute `data="own"` ignores every outside source at once. */
  enableSource(id: string, on: boolean): void {
    this.#door.book.enableSource(id, on);
  }

  /**
   * Whose data is in the last drawn frame: the package's own first (its pictures; its finer tiles while a window of them is in view) and then each outside source that gave a tile, with how many (`used`). `creditLine(credits, "en" | "ja")`
   * from `@johnmorrisdotca/chikyu-earth/door` writes them as a line with the licences. `chikyu-creditschange` fires when this set changes (not at each frame), with `detail: { credits }`.
   */
  credits(): Credit[] {
    return this.#door.credits();
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
    this.#model.cameraSpin = null;
    this.#gate?.soon();
  }

  /**
   * How the camera is held (the `camera` attribute). `space` (the default): held in the stars, looking at the place `center` names as it is at the
   * moment the camera is set (when the element opens, and again when `time` or `center` is set), so the Earth turns beneath it as the clock runs, with the day and night line where the Sun really is. `ground`: over the place `center` names on the ground, so the Earth keeps still and the clock moves the light across it. `sun`: held on the Sun's side, `center` being the longitude and
   * latitude from the sub-solar point (`0,0` looks straight at the noon place and shows no night), so the day and night line keeps its place on the screen while the Earth turns beneath. A drag turns the view about the same body in any of them.
   */
  get camera(): CameraMode {
    return this.#model.camera;
  }
  set camera(value: CameraMode) {
    this.#model.camera = value;
    this.#model.cameraSpin = null;
    this.#gate?.soon();
  }

  /** True for the full-screen mode (the `immersive` attribute): the element fills its box in any shape, a plain wheel zooms instead of scrolling the page, and a touch drag turns the view instead of scrolling. */
  get immersive(): boolean {
    return this.hasAttribute("immersive");
  }
  set immersive(value: boolean) {
    this.toggleAttribute("immersive", value);
  }

  /** The moment shown: milliseconds since the epoch, or "now" while it follows the real clock. The clock runs from it at `speed`, so a number read while time runs is the moment it has reached. */
  get time(): number | "now" {
    return this.#mode === "now" && this.speed === 1 ? "now" : this.#model.time;
  }
  set time(value: number | Date | "now") {
    this.#mode = value instanceof Date ? value.getTime() : value;
    if (this.#mode === "now") this.#model.time = Date.now();
    else this.#model.time = this.#mode;
    this.#model.cameraSpin = null;
    this.#model.speed = this.speed;
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
    if (this.isConnected && this.#view) this.#played = true;
    this.#speed = next;
    this.#model.speed = this.speed;
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
  get stats(): {
    state: EarthState;
    tiers: Record<EarthLayer, number>;
    tiles: TileStats;
    satellites: SatelliteStats;
    draws: number;
    contexts: number;
    canvas: { width: number; height: number; pixels: number };
    assets: { entries: number; refs: number };
    /** The meteors: whether they are on, the streaks alive now and started so far, the streaks a second being drawn, and the strongest active shower's code and rate. */
    meteors: { on: boolean; strength: number; alive: number; spawned: number; perSecond: number; shower: string | null; zhr: number };
    /** The name written on the Earth: whether `body-label` is set, its text, the label is made, and it is showing (it is hidden while the Earth is small). */
    bodyLabel: { on: boolean; text: string; made: boolean; showing: boolean };
    /** The names of the stars and the constellation lines: whether one is asked for, whether hoshi-stars is loaded, the names and figures laid out at the last draw, the figure picked, how many times the layer was drawn and the language its names were last laid out in. */
    sky: { on: boolean; loaded: boolean; names: number; figures: number; picked: string | null; renders: number; lang: string };
    /** The places: how many were handed over, how many are drawn and named at the last draw, and how many times they were laid out. */
    places: { places: number; shown: number; labels: number; renders: number };
  } {
    const stats = this.#taken?.renderer.stats;
    return {
      state: this.#state,
      tiers: { ...this.#tiers },
      satellites: this.#satelliteStats(),
      tiles: this.#model.tiles?.stats ?? { ready: false, level: null, held: 0, shown: 0, loading: 0, failed: 0, requested: 0, heldBytes: 0, refused: 0, used: {} },
      draws: stats?.draws ?? 0,
      contexts: stats?.contexts ?? 0,
      canvas: stats?.canvas ?? { width: 0, height: 0, pixels: 0 },
      assets: { entries: stats?.assets.entries ?? 0, refs: stats?.assets.refs ?? 0 },
      meteors: { on: this.#model.meteors.on, strength: this.#model.meteors.strength, ...this.#model.meteors.drawn },
      bodyLabel: { on: this.#model.bodyLabel.settings !== null, text: this.#model.bodyLabel.text, ...this.#model.bodyLabel.drawn },
      sky: this.#sky?.stats ?? { on: false, loaded: false, names: 0, figures: 0, picked: null, renders: 0, lang: "" },
      places: { ...(this.#placeLayer?.stats ?? { places: 0, shown: 0, labels: 0, renders: 0 }) },
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
    const b = lookAt(cameraCentre(this.#model), view);
    const px = (Math.abs(b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RAD) + Math.abs(b.lat - a.lat)) * RAD * drawn.radius;
    if (shifted || px >= 0.5 || (final && px > 0.01)) this.#gate?.soon();
  }

  // --- satellites ---------------------------------------------------------------------------------------------------------------------------------
  /**
   * Show a group of satellites (made by `createSatellites`) under a name, or take the group away with `null`. A group is one draw call however many satellites it holds, so every group of the catalogue can be shown at once. Giving the name of a group
   * that is already shown replaces it. `style`: `color` (`orbit` colours each dot by its orbit class: low, medium, geostationary, highly elliptical or other, as the catalogue's `CLASS_COLOURS`) and `size` (CSS pixels at the Earth's opening size; the dots grow a little as the Earth is drawn bigger) of the dots, and `orbits` to draw every orbit (only for a group of 40 or fewer, such as the stations). The groups are placed by SGP4 about once a second and interpolated
   * between, are placed at the moment shown about once a second and held there while the clock runs faster than `MAX_SATELLITE_SPEED` (a line under the picture says so; `satellites-label="off"` takes it away), are hidden by the Earth when they are behind it, and draw at most 30 times a second and not at all while the clock holds.
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
    this.#startTick();
    this.#gate?.soon();
  }

  /** Show or hide a group without losing it. */
  showSatellites(group: string, on: boolean): void {
    const found = this.#model.satellites.groups.get(group);
    if (!found || found.visible === on) return;
    found.visible = on;
    this.#startTick();
    this.#gate?.soon();
  }

  /** The groups now set: how many satellites each holds, whether it is shown, how many were placed at the last draw (those whose elements are not too old for the moment shown), and `newest`, the date of its newest element set (milliseconds since 1970), for a page to say how old its data is. */
  get satelliteGroups(): { name: string; count: number; visible: boolean; placed: number; newest: number | null }[] {
    return [...this.#model.satellites.groups].map(([name, group]) => ({ name, count: group.satellites.count, visible: group.visible, placed: group.satellites.placed, newest: newestEpoch(group.satellites) }));
  }

  /** Mark one satellite: a larger ring round it and its orbit drawn. `null` lets it go. */
  selectSatellite(ref: SatelliteRef | null): void {
    const found = ref ? this.#model.satellites.groups.get(ref.group) : undefined;
    this.#model.satellites.selected = ref && found && ref.index >= 0 && ref.index < found.satellites.count ? { group: ref.group, index: ref.index } : null;
    this.#gate?.soon();
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
    return { groups: this.#model.satellites.groups.size, placed: drawn.placed, tooFast: drawn.tooFast, heldAt: drawn.heldAt, propagations, lastBatchMs, maxBatchMs, updateMs: drawn.updateMs, maxUpdateMs: drawn.maxUpdateMs, averageUpdateMs: drawn.updates ? drawn.totalMs / drawn.updates : 0, updates: drawn.updates };
  }

  // A press that does not turn the view (under 6 pixels) on a satellite tells the page, which chooses it with `selectSatellite` if it likes.
  #downX = 0;
  #downY = 0;
  #down = (event: PointerEvent): void => {
    if (event.button !== 0 || this.#model.satellites.groups.size === 0) return;
    this.#downX = event.clientX;
    this.#downY = event.clientY;
    window.addEventListener("pointerup", this.#up, { capture: true, once: true });
  };
  #up = (event: PointerEvent): void => {
    if (Math.hypot(event.clientX - this.#downX, event.clientY - this.#downY) > 6) return;
    const rect = this.getBoundingClientRect();
    const satellite = this.#model.pick?.(event.clientX - rect.left, event.clientY - rect.top, 12);
    if (satellite) this.dispatchEvent(new CustomEvent("chikyu-satellite-click", { detail: { ...satellite, info: this.satelliteInfo(satellite) }, bubbles: true, composed: true }));
  };

  // In an immersive view a plain wheel zooms. It is passed on to the shared hands as the wheel's own pinch (Ctrl and a small step), so whichever hands hold the view (the element's, or a bar bound to it) apply it with their limits;
  // Ctrl, Command, Alt and Shift with the wheel are the family's own and are left alone.
  #wheel = (event: WheelEvent): void => {
    if (!this.hasAttribute("immersive") || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const pixels = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * 800 : event.deltaY;
    this.dispatchEvent(new WheelEvent("wheel", { deltaY: Math.max(-250, Math.min(250, pixels)) * WHEEL_AS_PINCH, deltaMode: 0, clientX: event.clientX, clientY: event.clientY, ctrlKey: true, bubbles: true, cancelable: true, composed: true }));
  };

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
    const satellites = this.#satellitesMoving();
    // satellites go round in 90 minutes, so with any on show even real time is drawn about once a second
    if (speed <= 1 && !satellites) return live;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return Math.min(live, 1000);
    const radius = this.#model.drawn?.radius ?? 200;
    return Math.min(live, 1000 / Math.min(30, Math.max(1, (satellites ? SATELLITE_RATE : SUN_RATE) * RAD * speed * radius)));
  }

  /** Says under the picture that the satellites are held, while the clock is too fast to follow them and a group is on show. */
  #noteSatellites(): void {
    let shown = false;
    for (const group of this.#model.satellites.groups.values()) if (group.visible && group.satellites.count > 0) shown = true;
    setSatelliteNote(this.#satNote, this, shown && Math.abs(this.speed) > MAX_SATELLITE_SPEED);
  }

  /** Is anything on show that moves faster than the Earth turns: a group of satellites the clock is slow enough to place? */
  #satellitesMoving(): boolean {
    if (Math.abs(this.speed) > MAX_SATELLITE_SPEED) return false;
    for (const group of this.#model.satellites.groups.values()) if (group.visible && group.satellites.count > 0) return true;
    return false;
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
    this.#noteSatellites();
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
