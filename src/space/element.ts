// <chikyu-space>: the Earth, the Moon, the Sun and the planets where they are at a date and time, drawn with three.js through kazoku-ui's shared renderer. Optional:
// the line globe and the Earth from space need neither this nor astronomy-engine. It draws only when something changes, at most 30 times a second.
import type { SharedRenderer, View } from "@johnmorrisdotca/kazoku-ui/renderer";
import { carryControls, wrapYaw, type ElementControls, type ViewController } from "@johnmorrisdotca/kazoku-ui/view-controls";
import { adoptStyles } from "../adopt.ts";
import type { GeoPoint } from "../types.ts";
import { airFor, readAirThickness } from "../realistic/air.ts";
import { BODY_LABEL_ATTRIBUTES, bodyLabelText, loadMichroma, readBodyLabel, type BodyLabelSettings } from "../realistic/body-label.ts";
import { createSkyHost, SKY_ATTRIBUTES, SKY_STYLE, type SkyHost } from "../sky/host.ts";
import type { SkyKeepClear } from "../sky/keep-clear.ts";
import type { SkyLabelStyle } from "../sky/style.ts";
import { cleanPlaces, readPlaceGroups, readPlaces, type Place, type PlaceLook, type PlaceView } from "../markers/places.ts";
import { createPlaceLayer, PLACE_STYLE, readPlaceLook, type PlaceLayer, type SatelliteMark } from "../markers/place-layer.ts";
import { aimAt, findPlace, glideView } from "../markers/go-to-place.ts";
import { subsolarPoint } from "../realistic/sun.ts";
import { SHORT_NAMES } from "../satellites/names.ts";
import { CITY_NAMES_ATTRIBUTES, CITY_NAMES_STYLE, createCityHost, type CityHost, type CityNamesStyle } from "../cities/host.ts";
import { BORDER_ATTRIBUTES, readBorders, type BorderSets } from "../borders/lines.ts";
import type { BorderData, BorderStats } from "../borders/layer.ts";
import { GRID_ATTRIBUTES, readGrid } from "../grid/lines.ts";
import type { GridStats } from "../grid/layer.ts";
import { COUNTRY_NAMES_ATTRIBUTES, type CountryFrame } from "../country-names/geometry.ts";
import { COUNTRY_NAMES_STYLE, createCountryHost, type CountryHost, type CountryNamesStats, type CountryNamesStyle } from "../country-names/host.ts";

import { createGate, frameCap, type Gate } from "../realistic/gate.ts";
import { setThreeLoader, takeRenderer } from "../realistic/shared.ts";
import type { ThreeParts } from "../realistic/textures.ts";
import type { LightMode } from "../realistic/earth.ts";
import { NOTES_STYLE, setAirNote } from "../realistic/air-note.ts";
import { IMMERSIVE_STYLE, immersiveWheel } from "../realistic/immersive.ts";
import { readMeteorStrength } from "../meteors/strength.ts";
import { METEOR_NOTE_STYLE, prefersLessMotion, setMeteorNote } from "../meteors/note.ts";
import { MAX_TEXTURE, type Layer } from "../realistic/tiers.ts";
import type { SatelliteInfo, SatelliteRef, Satellites } from "../satellites/types.ts";
import { AU_IN_EARTH_RADII, EARTH_RADIUS_KM, frameAt, type PlanetName } from "./ephemeris.ts";
import { MAX_ORBIT_GROUP, type SatelliteStyle } from "./satellite-layer.ts";
import { RIDE_FACES, rideTiltLimits, rideTurnDegrees, type RideFace, type RideLook } from "./ride.ts";
import { placeAround, placeMoon, placeSun, RADIUS, type ScaleMode } from "./scale.ts";
import { BODY_NAMES, type CameraMode, createSpaceItem, DEFAULT_EARTH_SIZE, newSpaceModel, type BodyName, type BodyPainter, type BodyPlace, type RideTarget, type SatellitePainter, type SpaceModel } from "./scene.ts";

export { BODY_NAMES, type BodyName, type CameraMode, type RideTarget };

let painter: BodyPainter | undefined;
let satellitePainter: SatellitePainter | undefined;

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

/**
 * Where the 3D models of large satellites come from if the page has any: the package ships none. With a painter set, a satellite followed (`ride(ref, { view: "follow" })`) that the painter has a model for is drawn as that model, in the middle
 * of the picture at a size that reads, pointed the way it flies, lit by the Sun; a satellite it has none for stays a dot. See `SatellitePainter`.
 *
 * @param next - The painter, or `undefined` for none.
 *
 * @example
 * ```ts no-run
 * import { setSatellitePainter } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * setSatellitePainter({ has: (norad) => norad === 25544, make: async () => null });
 * ```
 */
export function setSatellitePainter(next: SatellitePainter | undefined): void {
  satellitePainter = next;
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
 * for a satellite; a planet or the Moon is kept at the distance the zoom says); `above` (a satellite only; a body is followed) puts it on the line from the Earth's centre through the satellite, `distanceKm` (divided by the zoom) above it, looking straight down at it with the way it is going at the top
 * of the picture, the satellite held in the middle while the Earth turns beneath (a drag turns the picture about the satellite and tips the camera back or ahead of it); `look` `down` (the default) or `horizon` is where a camera at the body points; `face` opens looking one way (see `face`); `smooth` (the default) glides
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
  view?: "from" | "follow" | "above";
  look?: RideLook;
  /** Face this way as the ride opens (`face`). */
  face?: RideFace;
  distanceKm?: number;
  smooth?: boolean;
}

/**
 * What the camera is riding along with now: the body or satellite, how (`from`, `follow` or `above`), where it looks, the facing it looks round from (`null` when none was chosen), and the distance kept for a satellite.
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
  view: "from" | "follow" | "above";
  look: RideLook;
  face: RideFace | null;
  distanceKm: number;
}

const FACE_KEYS: Record<string, RideFace> = { w: "ahead", s: "behind", a: "left", d: "right", r: "up", f: "down" };

type SatelliteStats = { groups: number; placed: number; segments: number; tooFast: boolean; dotScale: number; epochMs: number; propagations: number; lastBatchMs: number; maxBatchMs: number; updateMs: number; maxUpdateMs: number; averageUpdateMs: number; updates: number };

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

const STYLE = `:host{display:block;aspect-ratio:1/1;position:relative;overflow:hidden;isolation:isolate}${IMMERSIVE_STYLE}#stage,#labels{position:absolute;inset:0}#labels{pointer-events:none;overflow:hidden}.sp-label{position:absolute;left:0;top:0;margin:0;padding:0;border:0;background:none;font:12px/16px system-ui,-apple-system,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000;will-change:transform;pointer-events:none}.sp-label:focus-visible{outline:2px solid #6cd0ff;outline-offset:2px;border-radius:4px}.sp-label::before{content:"";display:inline-block;width:5px;height:5px;margin:0 5px 1px -2px;border-radius:50%;background:#fff}.sp-label[hidden]{display:none}.sp-sat{position:absolute;left:0;top:0;font:12px/16px system-ui,-apple-system,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000;will-change:transform;pointer-events:none}.sp-sat[hidden]{display:none}${PLACE_STYLE}${SKY_STYLE}${COUNTRY_NAMES_STYLE}${CITY_NAMES_STYLE}${METEOR_NOTE_STYLE}${NOTES_STYLE}`;

/**
 * The `<chikyu-space>` custom element: the Earth, the Moon, the Sun and the planets where they are at a date and time, drawn with three.js through the shared renderer. It takes `center`, `time` (`now` or an ISO date), `speed` (1 is real time, 0 holds, 86400 is a day a second, negative runs backwards), `scale` (`compressed` or `true`), `labels` and `orbits` (`off` hides them); positions are computed in the browser by astronomy-engine, an optional peer dependency. It draws only when something changes, and nothing while it is out of sight.
 *
 * It carries kazoku-ui's controls itself: a drag turns the view, two fingers pinch, Ctrl and the wheel zoom (a plain wheel at Fit scrolls the page) and the arrow keys, + and - work once it is focused. The zoom runs from a millionth of Fit (the whole solar system) to 2.5 times, and from 0.5 to 6 times while riding from a body. `controls="none"` turns the hands off; `zoom-min` and `zoom-max` change the range. A `<kazoku-view-controls for="...">` on the element takes the hands over, and the page applies its events with `setView`. `immersive` is the full-screen mode: any shape of box, a plain wheel zooms and a drag anywhere turns.
 *
 * With a body painter that carries a `credit` (`setBodyPainter`), the credit of its pictures is written under the picture while it draws the bodies; `bodies-credit="off"` takes the line away.
 *
 * While time runs (`speed` is not 0) it sends `chikyu-timechange` with `detail: { time, running: true }`, `time` being the moment shown in milliseconds since 1970, at most four times a second however fast the picture is
 * drawn (and, with the clock at real time, as often as it steps: once a minute, or once a second with satellites or a ride on show), only while the tab is shown, and once with `running: false` when the clock holds
 * (`speed` set to 0): a page writes the date into its date box from it. It is not sent for a `time` the page sets itself. `chikyu-time` is the older event of every step the clock takes (up to thirty a second):
 * it is kept for pages that use it, but a page that shows the date wants `chikyu-timechange`.
 *
 * `borders` draws the borders on the Earth's land as thin lines that turn with it, as on `<chikyu-earth-realistic>`: `countries`, `regions` (from the page's `borderData.regions`, once the Earth is
 * large enough), or both with a bare attribute; `chikyu-borders-unavailable` is sent when the shapes cannot be loaded.
 *
 * `grid` draws the meridians and parallels on the Earth, and `country-names` names its countries, as on `<chikyu-earth-realistic>`: the names keep clear of the bodies', the places' and the
 * cities' names and stay on the Earth's disc; `chikyu-country-names-unavailable` is sent when the outlines cannot be loaded.
 *
 * @example
 * ```ts no-run
 * import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const space = document.createElement("chikyu-space") as ChikyuSpace;
 * space.setAttribute("time", "2026-11-02T12:00Z");
 * space.setAttribute("speed", "86400");
 * space.setAttribute("star-names", "12");
 * space.addEventListener("chikyu-sky-pick", (event) => {
 *   const pick = (event as CustomEvent<{ kind: string; name?: string; abbreviation?: string }>).detail;
 *   console.log(pick.kind, pick.name ?? pick.abbreviation);
 * });
 * space.addEventListener("chikyu-timechange", (event) => {
 *   const { time, running } = (event as CustomEvent<{ time: number; running: boolean }>).detail;
 *   console.log(new Date(time).toISOString(), running ? "running" : "held");
 * });
 * document.body.append(space);
 * ```
 */
export class ChikyuSpace extends HTMLElement {
  static observedAttributes = ["cloud-drift", "camera", "earth-size", "earth-x", "earth-y", "center", "time", "speed", "scale", "labels", "orbits", "bodies", "light", "meteors", "meteors-label", "meteors-strength", ...BODY_LABEL_ATTRIBUTES, ...SKY_ATTRIBUTES, ...CITY_NAMES_ATTRIBUTES, ...BORDER_ATTRIBUTES, ...GRID_ATTRIBUTES, ...COUNTRY_NAMES_ATTRIBUTES, "air-thickness", "air-label", "lang", "places", "places-look", "place-groups", "bodies-credit", "satellite-tint"];

  #model: SpaceModel = newSpaceModel();
  #mode: number | "now" = "now";
  #speed = 1;
  #view: View | undefined;
  /** The page has set a `speed` since the element came into the page: for a reader who prefers reduced motion, that is the Play that lets meteors start. */
  #played = false;
  #note: HTMLElement | undefined;
  /** The names of the stars and the constellation lines (`star-names`, `constellation-lines`), and the look of the names. */
  #sky: SkyHost | undefined;
  #skyStyle: Partial<SkyLabelStyle> = {};
  #keepClear: SkyKeepClear[] = [];
  /** The names of cities on the Earth (`city-names`), and the look of the names. */
  #cities: CityHost | undefined;
  #citiesStyle: CityNamesStyle = {};
  /** The names of the countries on the Earth (`country-names`), and the look of the names. */
  #countries: CountryHost | undefined;
  #countriesStyle: CountryNamesStyle = {};
  #satNames: Record<number, string> = {};
  /** A ringed satellite's name, by `group:index`, for `#satLabelLang`. The name does not depend on the moment, so a frame reads it and does not propagate the orbit again. */
  #satLabelCache = new Map<string, string>();
  /** `en` or `ja` once that language has been read for the cached names; empty until the first read. */
  #satLabelLang = "";
  /** The ringed satellites of the last draw (`labelSatellites`), laid out with the places. */
  #marks: SatelliteMark[] = [];
  #airNote: HTMLElement | undefined;
  #bodiesNote: HTMLElement | undefined;
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
  #toldFacing: RideFace | null = null;
  #placeLayer: PlaceLayer | undefined;
  #placeList: Place[] = [];
  /** Counts the turns to a place, so a new one stops the one before. */
  #placeGlide = 0;
  #nameBoxes = new Map<string, { width: number; height: number }>();
  /** A font that arrives after the names were measured: the boxes are read again on the next layout. The satellites' marks are not touched, or the page would be told again about each one already in view. */
  #onFonts = (): void => {
    this.#nameBoxes.clear();
  };

  /** The controller behind the element's own hands (`set`, `fit`, `state`), while it is in a page. */
  get controller(): ViewController | undefined {
    return this.#hands?.controller;
  }

  connectedCallback(): void {
    document.fonts?.addEventListener?.("loadingdone", this.#onFonts);
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
    root.innerHTML = `<div id="stage"></div><div id="places"></div><div id="labels" aria-hidden="true"></div><div id="notes"><p id="air-note" hidden></p><p id="meteor-note" hidden></p><p id="bodies-note" hidden></p></div>`;
    adoptStyles(root, STYLE, this.nonce);
    this.#stage = root.getElementById("stage")!;
    this.#labelBox = root.getElementById("labels")!;
    this.#note = root.getElementById("meteor-note")!;
    this.#airNote = root.getElementById("air-note")!;
    this.#bodiesNote = root.getElementById("bodies-note")!;
    this.#sky = createSkyHost({
      root,
      attribute: (name) => this.getAttribute(name),
      language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
      onError: (error) => this.dispatchEvent(new CustomEvent("chikyu-sky-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      loadFont: loadMichroma,
    });
    this.#sky.setStyle(this.#skyStyle);
    this.#sky.setKeepClear(this.#keepClear);
    this.#placeLayer = createPlaceLayer(root.getElementById("places")!);
    this.#placeList = readPlaces(this.getAttribute("places"));
    this.#placeLayer.set(this.#placeList);
    this.#placeLayer.look = readPlaceLook(this.getAttribute("places-look"));
    this.#placeLayer.grouping = readPlaceGroups(this.getAttribute("place-groups"));
    this.#cities = createCityHost({
      root,
      attribute: (name) => this.getAttribute(name),
      language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
      onError: (error) => this.dispatchEvent(new CustomEvent("chikyu-city-names-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      onLayout: () => this.#countryFrame(),
    });
    this.#cities.setStyle(this.#citiesStyle);
    Object.assign(this.#model.borders, readBorders(this.getAttribute("borders")));
    this.#model.borders.onError = (error) => this.dispatchEvent(new CustomEvent("chikyu-borders-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } }));
    this.#model.grid.on = readGrid(this.getAttribute("grid"));
    this.#model.grid.onError = (error) => this.dispatchEvent(new CustomEvent("chikyu-grid-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } }));
    this.#countries = createCountryHost({
      root,
      attribute: (name) => this.getAttribute(name),
      language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
      onError: (error) => this.dispatchEvent(new CustomEvent("chikyu-country-names-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
    });
    this.#countries.setStyle(this.#countriesStyle);
    this.#model.airThickness = readAirThickness(this.getAttribute("air-thickness"));
    this.#applyBodyLabel();
    setAirNote(this.#airNote, this, this.#model.airThickness);
    this.#showBodiesCredit();
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
      onSky: (sky) => this.#sky?.frame(sky),
      onPlaces: (view) => this.#drawPlaces(view),
      placeSprites: () => this.#placeLayer?.sprites ?? null,
      onCities: (frame) => this.#nameFrame(frame),
      onLabelError: (error) => this.dispatchEvent(new CustomEvent("chikyu-body-label-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      onSatelliteMarks: (marks) => this.#showMarks(marks),
      onSelected: (place) => this.#placeChosen(place),
      onMoving: () => this.#gate?.request(),
      onRideLost: () => this.#rideLost(),
      onPlaceRings: (drawn) => this.#ringsDrawn(drawn),
      onSatellitesError: (error) => this.dispatchEvent(new CustomEvent("chikyu-satellites-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      ...(painter ? { painter } : {}),
      satellitePainter: () => satellitePainter,
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
    // before the shared hands (which hear it after this): a plain wheel in an immersive view zooms
    this.addEventListener("wheel", this.#wheel, { capture: true, passive: false });
    this.addEventListener("keydown", this.#faceKey);
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.#hands = carryControls(this, { initial: this.#model.view, limits: LIMITS, onChange: (state, info) => this.setView(state, info.final) });
    this.#labelBox.addEventListener("click", this.#labelClick);
    this.#labelBox.addEventListener("focusin", this.#labelFocus);
  }

  disconnectedCallback(): void {
    document.fonts?.removeEventListener?.("loadingdone", this.#onFonts);
    this.#marks = [];
    this.#markSeen.clear();
    this.#nameBoxes.clear();
    this.#hands?.unbind();
    this.#hands = undefined;
    this.#zoomRange(false);
    this.removeEventListener("pointerdown", this.#down);
    this.removeEventListener("wheel", this.#wheel, { capture: true });
    this.removeEventListener("keydown", this.#faceKey);
    window.removeEventListener("pointerup", this.#up, true);
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#gate?.cancel();
    this.#view?.dispose();
    this.#view = undefined;
    this.#taken?.release();
    this.#taken = undefined;
    this.#sky?.dispose();
    this.#sky = undefined;
    this.#placeLayer?.dispose();
    this.#placeLayer = undefined;
    this.#cities?.dispose();
    this.#countries?.dispose();
    this.#countries = undefined;
    this.#cities = undefined;
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
      if (name === "lang") {
        this.#applyBodyLabel();
        this.#sky?.refresh();
        this.#cities?.refresh();
        this.#countries?.refresh();
      }
    } else if ((BODY_LABEL_ATTRIBUTES as readonly string[]).includes(name)) this.#applyBodyLabel();
    else if ((SKY_ATTRIBUTES as readonly string[]).includes(name)) this.#sky?.refresh();
    else if (name === "places") {
      this.#placeList = readPlaces(value);
      this.#placeLayer?.set(this.#placeList);
      this.#gate?.request();
    } else if (name === "places-look" && this.#placeLayer) {
      this.#placeLayer.look = readPlaceLook(value);
      this.#gate?.request();
    } else if (name === "place-groups" && this.#placeLayer) {
      this.#placeLayer.grouping = readPlaceGroups(value);
      this.#gate?.request();
    }
    else if ((CITY_NAMES_ATTRIBUTES as readonly string[]).includes(name)) this.#cities?.refresh();
    else if (name === "borders") {
      Object.assign(this.#model.borders, readBorders(value));
      this.#gate?.request();
    } else if (name === "grid") {
      this.#model.grid.on = readGrid(value);
      this.#gate?.request();
    } else if ((COUNTRY_NAMES_ATTRIBUTES as readonly string[]).includes(name)) this.#countries?.refresh();
    else if (name === "satellite-tint") {
      this.#model.satellites.orbitTint = value === "orbit";
      this.#gate?.request();
    }
    if (name === "air-thickness" || name === "air-label" || name === "lang") setAirNote(this.#airNote, this, this.#model.airThickness);
    if (name === "bodies-credit" || name === "lang") this.#showBodiesCredit();
  }

  #wheel = (event: WheelEvent): void => immersiveWheel(this, event);

  /** The body painter's credit under the picture, in the element's or the page's language: shown while the painter draws the bodies (not `plain`), unless `bodies-credit` is `off`. */
  #showBodiesCredit(): void {
    const note = this.#bodiesNote;
    if (!note) return;
    const lang = (this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
    const credit = painter?.credit?.[lang] ?? "";
    note.textContent = credit;
    note.lang = lang;
    note.hidden = credit === "" || this.bodies === "plain" || this.getAttribute("bodies-credit") === "off";
  }

  /**
   * True for the full-screen mode (the `immersive` attribute): the element fills its box in any shape (the Earth fits the shorter side with its glow inside it, `earth-size`), a plain wheel zooms instead of scrolling
   * the page, a drag anywhere on it turns the view, and a touch drag turns it instead of scrolling. A notch of the wheel is about 1.2 times; out far enough the Moon, the Sun and the planets come into view.
   */
  get immersive(): boolean {
    return this.hasAttribute("immersive");
  }
  set immersive(value: boolean) {
    this.toggleAttribute("immersive", value);
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

  /**
   * The names of the brightest stars and the constellations as faint lines, laid over the sky the page draws (hoshi-stars' `sky-labels`, an optional peer loaded only when one of these is set). The plain attributes are hoshi's: `star-names` (a count of the brightest stars in view and not covered by the
   * Earth, the Moon or the Sun; bare is 10), `star-names-magnitude` (only stars at least that bright) and `constellation-lines` (the 88 figures as lines at this strength, 0 to 1; bare is 0.16): none of them, and nothing is loaded. The figure under the pointer or touched is at full strength and shows its name. Names are in the
   * page's language and never overlap. Nothing is redrawn at rest. `chikyu-sky-unavailable` is sent when hoshi-stars is not there. The property is the look of the names, a partial `SkyLabelStyle` (font, size, case, ring, leader and the rest).
   */
  get skyStyle(): Partial<SkyLabelStyle> {
    return { ...this.#skyStyle };
  }
  set skyStyle(value: Partial<SkyLabelStyle>) {
    this.#skyStyle = { ...value };
    this.#sky?.setStyle(this.#skyStyle);
  }

  /**
   * The constellation that is picked, by its IAU abbreviation (`Ori`), or `null`. A reader picks one by a click or a tap on its lines or inside its figure (and with the key `C`, or `Shift`+`C` for the previous, while the element has the focus); a click on empty sky, or `Escape`, lets it go. The picked figure's lines are lit and its name is
   * shown at the middle of the part of it in view, until another is picked or it is let go. A page sets the property to pick one itself, which sends no event. `chikyu-constellation-pick` is sent at each pick of the reader's, with `detail` `{ abbreviation, id, name, english, japanese, kind, culture }` (`culture` is `iau` unless `constellation-culture` names another), and `null` when it is let go; `chikyu-constellation-hover` is sent the same way as a mouse rests on a figure and leaves it.
   * A press or a tap on a named star, or on a figure, also sends `chikyu-sky-pick`: a star is `{ kind: "star", hr, name, designation, x, y, pointerType }` (`name` as drawn, `x` and `y` CSS pixels inside the element) and a figure is `{ kind: "constellation", abbreviation }`. Each named star and each figure in view is a button, so a keyboard reaches it and Enter picks it, and the pick is read out; the keys `C` and `Shift`+`C` (the next and the previous figure) send it too. Nothing is drawn at rest.
   * Needs `constellation-lines` set. `constellation-culture` (`iau` by default, `western`, `japanese` or `chinese`; each is fetched only when asked for, and the value is exactly what the page sets) makes the figures, the pick and the names those of that sky culture. The attribute `constellation-names` (off by default) writes the name of every figure in view at the middle of the part of it that is on the picture, quieter than the star names and clear of them, of the Earth, the Moon, the Sun, the places and satellites named, and of the places kept clear (`keepClear`).
   */
  get constellation(): string | null {
    return this.#sky?.picked ?? null;
  }
  set constellation(value: string | null) {
    this.#sky?.pick(value);
  }

  /**
   * Places on the picture where the sky's names must not go: a page's own text laid over the element, say. Each is a rectangle in the element's own CSS pixels from its top left (`{ x, y, width, height }`), or an element of the page whose box is read. A star name whose box touches
   * one is left out, and so is a star whose point is in one (the next star is named instead); the picked constellation's name is moved clear of it. The lines are still drawn. The boxes are read when the list changes, when the page or an element is resized or scrolled, and not at each frame: a
   * page that moves its text without resizing it sets the property again. The attribute `keep-clear` takes a CSS selector for the same (`keep-clear=".hero h1, .hero .lead"`). Nothing is redrawn at rest.
   */
  get keepClear(): SkyKeepClear[] {
    return [...this.#keepClear];
  }
  set keepClear(value: readonly SkyKeepClear[] | null) {
    this.#keepClear = value ? [...value] : [];
    this.#sky?.setKeepClear(this.#keepClear);
  }

  /**
   * Places marked on the Earth (the attribute `places`, a JSON array): each `{ id, lon, lat, label, kind, color }`, `kind` being `here` (where the reader is: drawn bright and taller, with a quiet pulse) or `favourite`
   * (the default: quieter), and `color` an optional CSS colour of its own. The first `PLACE_MARKS` in sight (`here` first, then in the order given) stand up out of the ground with their names; every other place
   * is a ring on the ground, all of them one draw call, and places that crowd are gathered into one ring with their count. They turn with the Earth, are hidden on its far side, are dimmer on its night side
   * and keep their size in pixels at any zoom. Names never overlap one another or the bodies' names; one with no room is left out. The element stores nothing and sends nothing: the page hands the places
   * over and keeps them where it likes. Setting the property writes the attribute; at most `MAX_PLACES` are drawn. Nothing is drawn again at rest: the pulse is the page's own animation, stopped out of sight
   * and for a reader who asked for less motion.
   */
  get places(): Place[] {
    return this.#placeList.map((place) => ({ ...place }));
  }
  set places(value: readonly Place[]) {
    const clean = cleanPlaces(value);
    if (clean.length === 0) this.removeAttribute("places");
    else this.setAttribute("places", JSON.stringify(clean));
  }

  /**
   * Turn the view so a place of `places` is in the middle, at a pace a reader can follow (at once with `smooth: false`, for a reader who asked for less motion, or before the picture is live); the zoom stays.
   * The place is named by its `id`, or by its label in any case. The camera must be looking at the Earth: while it rides along or looks at another body nothing moves. The tilt is held to 90 degrees either
   * way, so a place more than 90 degrees of latitude from `center` comes as near the middle as that allows.
   *
   * @param text - The place's id or label.
   * @param options - `smooth` (true by default).
   * @returns The place, once the turn has started; `undefined` when there is no such place or the camera is not looking at the Earth.
   */
  async goToPlace(text: string, options: { smooth?: boolean } = {}): Promise<Place | undefined> {
    const place = findPlace(this.#placeList, text);
    const base = this.#model.lookBase;
    if (!place || !base || this.#model.ride) return undefined;
    const controls = this.#controls();
    const from = { yaw: this.#model.view.yaw, tilt: this.#model.view.tilt };
    const to = aimAt(base, place, from);
    const glide = (this.#placeGlide += 1);
    const set = (yaw: number, tilt: number, final: boolean): void => {
      if (controls) controls.set({ yaw, tilt, zoom: this.#model.view.zoom }, final, "place");
      else this.setView({ yaw, tilt, zoom: this.#model.view.zoom }, final);
    };
    glideView(set, from, to, options.smooth !== false && !prefersLessMotion() && this.#view?.live === true, () => glide === this.#placeGlide && this.isConnected);
    return { ...place };
  }

  /**
   * Whether places that crowd are gathered into one ring with their count (the attribute `place-groups`): on by default, `off` leaves every place its own ring. Setting the property writes the attribute.
   */
  get placeGroups(): boolean {
    return this.#placeLayer?.grouping ?? readPlaceGroups(this.getAttribute("place-groups"));
  }
  set placeGroups(value: boolean) {
    if (value) this.removeAttribute("place-groups");
    else this.setAttribute("place-groups", "off");
  }

  /** The picture said whether it can draw the rings of the places that are not markers of their own. Without `Points` the places' layer draws them itself and the page is told once, so no place is lost without a word. */
  #ringsDrawn(drawn: boolean): void {
    if (!this.#placeLayer || this.#placeLayer.ringsInPicture === drawn) return;
    this.#placeLayer.ringsInPicture = drawn;
    if (!drawn) this.dispatchEvent(new CustomEvent("chikyu-places-unavailable", { detail: { reason: "the three.js parts handed over lack Points: the places' rings are drawn as small circles in the page, at most 600, and stats.places.omitted counts the rest" } }));
    this.#gate?.request();
  }

  /** How the places are drawn (the attribute `places-look`): `beam` (a light rising out of the ground with a ring at its foot, the default), `pin` (a thin stick with a round head) or `ring` (only the ring on the ground). */
  get placesLook(): PlaceLook {
    return this.#placeLayer?.look ?? readPlaceLook(this.getAttribute("places-look"));
  }
  set placesLook(value: PlaceLook) {
    this.setAttribute("places-look", value);
  }

  /** Lays the places on the picture just drawn, clear of the bodies' names shown beside it. */
  #drawPlaces(view: PlaceView): void {
    const layer = this.#placeLayer;
    if (!layer || (this.#placeList.length === 0 && this.#marks.length === 0 && layer.stats.shown === 0 && layer.stats.rings === 0)) return;
    layer.frame(view, this.#bodyNameBoxes(), this.#marks, this.#model.light === "lit" ? null : subsolarPoint(this.#model.time));
  }

  /** Tells the names of cities, then of countries, where the Earth is in the picture just drawn; the countries' names keep clear of the bodies', the places' and the cities'. */
  #nameFrame(frame: CountryFrame | null): void {
    this.#cities?.frame(frame);
    this.#lastNameFrame = frame;
    this.#countryFrame();
  }

  /** The frame the names were last laid out on. */
  #lastNameFrame: CountryFrame | null = null;

  /** Lays the countries' names out on the last frame, clear of the bodies', the places' and the cities' names as they are now. */
  #countryFrame(): void {
    const countries = this.#countries;
    if (!countries) return;
    const frame = this.#lastNameFrame;
    countries.frame(frame, countries.stats.on && frame ? [...this.#bodyNameBoxes(), ...(this.#placeLayer?.boxes ?? []), ...(this.#cities?.boxes ?? [])] : []);
  }

  /** The boxes the bodies' names take beside them in the picture just drawn. */
  #bodyNameBoxes(): { left: number; top: number; width: number; height: number }[] {
    const taken: { left: number; top: number; width: number; height: number }[] = [];
    if (this.#model.labels && this.#places) {
      for (const name of BODY_NAMES) {
        const at = this.#places[name];
        const label = this.#pool.get(name);
        if (!at || !label || label.hidden) continue;
        const text = label.textContent ?? "";
        let box = this.#nameBoxes.get(text);
        if (!box) {
          const rect = label.getBoundingClientRect();
          box = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
          if (box.width > 0) this.#nameBoxes.set(text, box);
        }
        taken.push({ left: at.x + Math.max(4, Math.min(at.r, 40)), top: at.y - 8, ...box });
      }
    }
    return taken;
  }

  /**
   * The look of the names of cities (`city-names`): font, size, weight, colour, the outline round the text, and the dot's colour and size. Any of them may be left out; the Earth's size, the language and the data are not set here.
   */
  get cityNamesStyle(): CityNamesStyle {
    return { ...this.#citiesStyle };
  }
  set cityNamesStyle(value: CityNamesStyle) {
    this.#citiesStyle = { ...value };
    this.#cities?.setStyle(this.#citiesStyle);
  }

  /** Whether the meridians and parallels are drawn on the Earth (the attribute `grid`). Setting it writes the attribute, or takes it away. */
  get grid(): boolean {
    return readGrid(this.getAttribute("grid"));
  }
  set grid(value: boolean) {
    if (value) this.setAttribute("grid", "");
    else this.removeAttribute("grid");
  }

  /**
   * The look of the names of countries (`country-names`): font, weight, colour, the outline round the text, and the smallest and largest text size. Any of them may be left out; the Earth's size, the
   * language and the data are not set here.
   */
  get countryNamesStyle(): CountryNamesStyle {
    return { ...this.#countriesStyle };
  }
  set countryNamesStyle(value: CountryNamesStyle) {
    this.#countriesStyle = { ...value };
    this.#countries?.setStyle(this.#countriesStyle);
  }

  /**
   * Which borders are drawn on the Earth (the attribute `borders`): the countries' at any size, and the regions' (provinces, states, prefectures) once the Earth is large enough on the screen to tell them apart.
   * Setting it writes the attribute: both sets as `borders="countries regions"`, one as its own word, none takes the attribute away.
   */
  get borders(): BorderSets {
    return readBorders(this.getAttribute("borders"));
  }
  set borders(value: BorderSets) {
    const words = [value.countries ? "countries" : "", value.regions ? "regions" : ""].filter(Boolean);
    if (words.length === 0) this.removeAttribute("borders");
    else this.setAttribute("borders", words.join(" "));
  }

  /**
   * Where the borders' shapes come from (see `BorderData`): `countries` in place of chizu's `world-geo`, and `regions`, a country's regions by its code, which draws the regions; without it none are drawn.
   * Set it before `borders` is switched on: shapes already loaded are kept.
   */
  get borderData(): BorderData {
    return { ...this.#model.borders.data };
  }
  set borderData(value: BorderData) {
    this.#model.borders.data = { ...value };
    this.#gate?.request();
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
    this.#showBodiesCredit();
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
    const model = this.#model;
    // a riding camera that looks round adds up its turn change by change: the controls wrap their yaw into -180..180, so the yaw alone cannot say how far round the camera has gone, and a change of zoom must not swing it
    if (view.yaw !== now.yaw) model.rideTurn += rideTurnDegrees(wrapYaw(view.yaw - now.yaw), view.zoom);
    // and the tilt is held to what does something in the look: past it a drag would have to come back before anything moved (the controls driving the view are handed the held tilt, the bar's own when one is bound)
    let tilt = view.tilt;
    const limits = model.ride && model.ride.view === "from" && model.rideDistance !== null ? rideTiltLimits(model.rideDistance, model.ride.look, view.zoom) : null;
    if (limits) tilt = Math.max(limits.min, Math.min(limits.max, tilt));
    this.#model.view = { yaw: view.yaw, tilt, zoom: view.zoom };
    // the whole view is handed back, the yaw as it is, so the controls keep what they held and the element hears nothing it did not already have
    if (tilt !== view.tilt) this.#controls()?.set({ yaw: view.yaw, tilt, zoom: view.zoom }, final, "ride");
    const drawn = this.#model.drawnView;
    if (drawn && !final && view.zoom === drawn.zoom) {
      const turned = Math.max(Math.abs(view.yaw - drawn.yaw), Math.abs(view.tilt - drawn.tilt)) * RAD;
      if (turned * (this.#model.heightPx / 2) < 0.5) return;
    }
    this.#gate?.request();
    this.#tellFacing();
  }

  /**
   * The controls that are driving this view: a `<kazoku-view-controls for="...">` bound to it (its hands are then the only ones and its controller holds the yaw and tilt), else the element's own hands.
   */
  #controls(): { set(view: { yaw: number; tilt: number; zoom: number }, final: boolean, why: string): void } | undefined {
    if (this.hasAttribute("data-kazoku-bar") && this.id) {
      const root = this.getRootNode() as Document | ShadowRoot;
      const bar = root.querySelector?.(`kazoku-view-controls[for="${CSS.escape(this.id)}"]`);
      const held = bar ? (Reflect.get(bar, "controller") as { set(view: unknown, final: boolean, why: string): void } | undefined) : undefined;
      if (held) return held;
    }
    return this.#hands?.controller;
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
      model.rideTurn = 0;
      model.focus = this.#focusBeforeRide;
    } else {
      if (typeof target === "string" && !BODY_NAMES.includes(target)) return;
      if (typeof target !== "string" && !model.satellites.groups.get(target.group)) return;
      if (!wasRiding) this.#focusBeforeRide = model.focus;
      // the heading starts from the yaw the controls already hold (an address that carries `yaw` is read before the ride begins), so a ride opened from the address looks where the one that was dragged there looked
      model.rideTurn = rideTurnDegrees(model.view.yaw, model.view.zoom);
      const asked = options.view ?? "from";
      // above a body is meant for a satellite: a body is followed
      const view = typeof target === "string" && (target === "Earth" || asked === "above") ? "follow" : asked;
      // a body followed (a planet, the Moon, the Earth) is looked at from round it as the view turns: it has no ways to face
      const faceable = !(view === "follow" && typeof target === "string");
      const face = faceable && options.face && RIDE_FACES.includes(options.face) ? options.face : null;
      model.ride = { target: typeof target === "string" ? target : { group: target.group, index: target.index }, view, look: face && view === "from" ? "horizon" : (options.look ?? "down"), face, distanceKm: Math.max(100, options.distanceKm ?? 3000) };
      if (face) {
        model.view = { yaw: 0, tilt: 0, zoom: model.view.zoom };
        model.rideTurn = 0;
        this.#controls()?.set({ yaw: 0, tilt: 0, zoom: model.view.zoom }, true, "ride");
      }
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
    this.#tellFacing();
  }

  /**
   * Face one way while riding: `ahead` along the way it goes, `behind`, `left` or `right` (as seen facing ahead), `down` straight at the Earth, `up` straight away from it.
   * In the `above` view, `down` looks straight down at the satellite and the Earth below it. The camera glides there in half a second (at once for a reader who asked for reduced motion) and keeps the zoom.
   * The facing stays pressed until the view is turned or tipped. `chikyu-ride-face` is sent with `{ face }` (`null` when it is let go). Keys, while the element is focused: W ahead, S behind, A left, D right, R up, F down. The arrow keys stay with the view controls.
   *
   * @param face - The way to face.
   * Following a body (a planet, the Moon) there is no way to face: it returns `false`. Held keys do not repeat, and keys typed in a field or in editable text are left to it.
   *
   * @returns Whether the camera faces that way now (`true` too when it already did, and nothing moves).
   */
  face(face: RideFace): boolean {
    const model = this.#model;
    const ride = model.ride;
    if (!ride || !RIDE_FACES.includes(face)) return false;
    // following a body there is no way to face: only from a body or a satellite, following a satellite, or above it
    if (ride.view === "follow" && typeof ride.target === "string") return false;
    // already facing that way: nothing to turn, and no glide started again
    if (this.facing === face) return true;
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pose = model.pose;
    const zoom = model.view.zoom;
    model.ride = { ...ride, look: ride.view === "from" ? "horizon" : ride.look, face };
    model.view = { yaw: 0, tilt: 0, zoom };
    model.rideTurn = 0;
    this.#controls()?.set({ yaw: 0, tilt: 0, zoom }, true, "ride");
    model.rideTurn = 0;
    model.view = { yaw: 0, tilt: 0, zoom };
    model.transition = !reduced && pose.valid ? { start: performance.now(), duration: 500, from: { p: [pose.p[0], pose.p[1], pose.p[2]], q: [pose.q[0], pose.q[1], pose.q[2], pose.q[3]], fov: pose.fov } } : null;
    this.#last = performance.now();
    this.#schedule();
    this.#gate?.request();
    this.#tellFacing();
    return true;
  }

  /** The facing (`face`), while the view has not been turned or tipped from it; `null` otherwise. */
  get facing(): RideFace | null {
    const ride = this.#model.ride;
    const view = this.#model.view;
    return ride?.face && view.yaw === 0 && view.tilt === 0 ? ride.face : null;
  }

  #tellFacing(): void {
    const now = this.facing;
    if (now === this.#toldFacing) return;
    this.#toldFacing = now;
    this.dispatchEvent(new CustomEvent("chikyu-ride-face", { detail: { face: now } }));
  }

  /** W ahead, S behind, A left, D right, R up, F down, while this element is focused and a ride is on. */
  #faceKey = (event: KeyboardEvent): void => {
    // a held key repeats: the first press turns, the repeats would only start the glide again and again
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || event.repeat) return;
    // typing in a field anywhere on the way to this element (its own shadow root and slots included), or in editable text, is typing, not facing
    const typing = event.composedPath().some((node) => node instanceof HTMLElement && (node.matches("input, textarea, select") || node.isContentEditable));
    if (typing) return;
    const face = FACE_KEYS[event.key.toLowerCase()];
    if (face && this.face(face)) event.preventDefault();
  };

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

  /**
   * The satellites the page has a model for (`setSatellitePainter`) in the groups now set, each with its name in the page's language: the large satellites that can be followed as a model. Empty with no painter.
   */
  largeSatellites(): { ref: SatelliteRef; noradId: number; name: string }[] {
    const out: { ref: SatelliteRef; noradId: number; name: string }[] = [];
    if (!satellitePainter) return out;
    this.#prepareSatLabelLang();
    for (const [group, state] of this.#model.satellites.groups) {
      state.satellites.sets.forEach((set, index) => {
        if (satellitePainter!.has(set.NORAD_CAT_ID)) out.push({ ref: { group, index }, noradId: set.NORAD_CAT_ID, name: this.#satelliteName({ group, index }) });
      });
    }
    return out;
  }

  /**
   * Follow the next (or, with a negative `step`, the previous) of the large satellites in `largeSatellites()`, going round: the first when none is followed yet. The followed satellite stays in the middle of the picture, as a model where the page has one,
   * with the Earth turning and sliding beneath. Returns the satellite now followed, or `null` when there is none to follow.
   *
   * @param step - How many places to hop: 1 (the default) is the next.
   */
  followNext(step = 1): { ref: SatelliteRef; noradId: number; name: string } | null {
    const list = this.largeSatellites();
    if (list.length === 0) return null;
    const ride = this.#model.ride;
    const current = ride && typeof ride.target !== "string" ? list.findIndex((one) => one.ref.group === (ride.target as SatelliteRef).group && one.ref.index === (ride.target as SatelliteRef).index) : -1;
    const next = list[(((current < 0 ? (step > 0 ? -1 : 0) : current) + step) % list.length + list.length) % list.length]!;
    this.ride(next.ref, { view: "follow" });
    return next;
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
   * Colour each satellite by its orbit class (low, medium, geostationary, highly elliptical, other). Off by default, so a group keeps the colour it was given. The attribute is `satellite-tint="orbit"`.
   */
  get satelliteTint(): "off" | "orbit" {
    return this.#model.satellites.orbitTint ? "orbit" : "off";
  }
  set satelliteTint(value: "off" | "orbit") {
    if (value === "orbit") this.setAttribute("satellite-tint", "orbit");
    else this.removeAttribute("satellite-tint");
  }

  /**
   * Show a group of satellites (made by `createSatellites`) under a name, or take the group away with `null`. A group is one draw call however many satellites it holds. Giving the name of a group
   * that is already shown replaces it. `style`: `color` and `size` (CSS pixels) of the dots, and `orbits` to draw every orbit (only for a group of 40 or fewer, such as the stations).
   * The groups are placed by SGP4 about once a second and interpolated between. Above `MAX_SATELLITE_SPEED` each satellite is a short streak along its orbit instead of being hidden.
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
    // a group's index may now be a different satellite, so a cached name for that ref is no longer its name
    this.#satLabelCache.clear();
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
    this.#satLabelCache.clear();
    this.#gate?.request();
  }

  /**
   * Where a satellite is on the screen as of the last draw: `{ x, y, visible, heightKm }` in CSS pixels from the view's top left, `visible` meaning it is inside the box and not behind the Earth. `null` when its group is not set or not shown, it cannot be
   * placed (its elements are too old), or it is behind the camera. It is the picture's own camera maths and its own test for the Earth in the way, so a page that draws its own rings need not repeat either.
   */
  placeSatellite(ref: SatelliteRef): { x: number; y: number; visible: boolean; heightKm: number } | null {
    return this.#model.placeSatellite?.(ref) ?? null;
  }

  /** The page's language for a satellite name: Japanese when the nearest `lang` starts with `ja`, otherwise English. Read once per pass, not once per satellite. */
  #readSatLabelLang(): "en" | "ja" {
    return (this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
  }

  /** Remember the page's language and drop cached names when it changes. One `closest("[lang]")` for the pass. */
  #prepareSatLabelLang(): void {
    const lang = this.#readSatLabelLang();
    if (lang !== this.#satLabelLang) {
      this.#satLabelCache.clear();
      this.#satLabelLang = lang;
    }
  }

  /** The name beside a ringed satellite: the page's own (`satelliteNames`), else the short one in the page's language, else the name in its elements. Cached per ref and language: the name is constant, and reading it does not propagate the orbit again. */
  #satelliteName(ref: SatelliteRef): string {
    const key = `${ref.group}:${ref.index}`;
    const cached = this.#satLabelCache.get(key);
    if (cached !== undefined) return cached;
    const info = this.satelliteInfo(ref);
    if (!info) return "";
    const lang = this.#satLabelLang === "ja" ? "ja" : "en";
    const name = this.#satNames[info.noradId] ?? SHORT_NAMES[info.noradId]?.[lang] ?? info.name;
    this.#satLabelCache.set(key, name);
    return name;
  }

  #markSeen = new Map<string, boolean>();

  /** Hands the places layer the ringed satellites of this draw, and tells the page when one comes into view or goes out of it. */
  #showMarks(marks: readonly { ref: SatelliteRef; x: number; y: number; visible: boolean }[]): void {
    if (marks.length > 0) this.#prepareSatLabelLang();
    this.#marks = marks.map((m) => ({ id: `${m.ref.group}:${m.ref.index}`, label: this.#satelliteName(m.ref), x: m.x, y: m.y, visible: m.visible }));
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

  /** Facts about one satellite at the moment shown (name, number, element age, height, speed, period, and `ownerCountry` when the owner is one country); undefined if it cannot be placed then. */
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
    ride: { riding: boolean; lost: boolean; gliding: boolean; facing: RideFace | null };
    /** The camera as the last draw left it: its place in Earth radii from the Earth's centre, the way it is turned (a unit quaternion, x y z w) and its field of view in degrees. */
    camera: { position: [number, number, number]; quaternion: [number, number, number, number]; fov: number };
    /** What the body painter has made at the last draw: the Sun and planets with a drawing, the moons shown round a planet that is near and the moons held (shown, or gone from the view for less than four seconds), whether the Moon is the painter's (`moon`), and the bodies with finer map tiles on them (`tiles`). */
    bodies: { look: string; painted: number; moons: number; held: number; moon: boolean; tiles: number };
    /** The meteors: whether they are on, the streaks alive now and started so far, the streaks a second being drawn, and the strongest active shower's code and rate. */
    meteors: { on: boolean; strength: number; alive: number; spawned: number; perSecond: number; shower: string | null; zhr: number };
    /** The name written on the Earth: whether `body-label` is set, its text, the label is made, and it is showing (it is hidden while the Earth is small). */
    bodyLabel: { on: boolean; text: string; made: boolean; showing: boolean };
    /** The names of the stars and the constellation lines: whether one is asked for, whether hoshi-stars is loaded, the names and figures laid out at the last draw, the figure picked, how many times the layer was drawn, the language its names were last laid out in, and the named stars' own points on the screen (`stars`). */
    sky: { on: boolean; loaded: boolean; names: number; figures: number; picked: string | null; pick: string | null; hover: string | null; constellations: number; culture: string; renders: number; lang: string; stars: { text: string; x: number; y: number }[] };
    /** The followed satellite's model (`setSatellitePainter`), when one is drawn: where its middle is on the screen, in CSS pixels, as of the last draw; `null` otherwise. */
    followModel: { x: number; y: number; shown: boolean; parts: number } | null;
    /**
     * The places: how many were handed over, how many are in sight at the last draw (`shown`, those gathered into groups included), how many stand up as markers of their own (`marks`) and are named (`labels`),
     * how many rings the one draw call draws (`sprites`) and how many of those are groups (`groups`), the satellites ringed and named, and how many times they were laid out.
     */
    places: { places: number; shown: number; labels: number; renders: number; rings: number; satelliteNames: number; marks: number; groups: number; sprites: number; omitted: number };
    /** The names of cities: whether `city-names` is set and the most it asks for, the Earth's radius on the screen, the tiers of kuni's cities that have arrived and how many cities, the names shown at the last draw and how many times the layer was drawn. */
    cityNames: { on: boolean; max: number; radius: number; tiers: string[]; cities: number; names: number; renders: number };
    /** The borders: the segments of each set, whether each was drawn at the last draw, the countries whose regions have arrived, how many times a set's lines were made, and whether a set could not be loaded. */
    borders: BorderStats;
    /** The grid: whether it was drawn at the last draw, whether every 15 degrees (else 30), its segments then, how many times its lines were made, and whether it could not be made. */
    grid: GridStats;
    /** The names of countries: whether `country-names` is set and the most it asks for, the countries loaded, the names shown at the last draw, how many times they were laid out, and whether the outlines could not be loaded. */
    countryNames: CountryNamesStats;
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
      ride: { riding: this.#model.ride !== null, lost: this.#model.rideLost, gliding: this.#model.transition !== null, facing: this.facing },
      camera: { position: [this.#model.pose.p[0], this.#model.pose.p[1], this.#model.pose.p[2]], quaternion: [this.#model.pose.q[0], this.#model.pose.q[1], this.#model.pose.q[2], this.#model.pose.q[3]], fov: this.#model.pose.fov },
      bodies: { look: this.#model.bodies || painter?.looks?.[0] || "plain", painted: this.#model.painted.bodies, moons: this.#model.painted.moons, held: this.#model.painted.held, moon: this.#model.painted.moon, tiles: this.#model.painted.tiles },
      meteors: { on: this.#model.meteors.on, strength: this.#model.meteors.strength, ...this.#model.meteors.drawn },
      bodyLabel: { on: this.#model.bodyLabel.settings !== null, text: this.#model.bodyLabel.text, ...this.#model.bodyLabel.drawn },
      sky: this.#sky?.stats ?? { on: false, loaded: false, names: 0, figures: 0, picked: null, pick: null, hover: null, constellations: 0, culture: "iau", renders: 0, lang: "", stars: [] },
      followModel: this.#model.followModel,
      places: { ...(this.#placeLayer?.stats ?? { places: 0, shown: 0, labels: 0, renders: 0, rings: 0, satelliteNames: 0, marks: 0, groups: 0, sprites: 0, omitted: 0 }) },
      cityNames: this.#cities?.stats ?? { on: false, max: 0, radius: 0, tiers: [], cities: 0, names: 0, renders: 0 },
      borders: { ...this.#model.borders.stats, shown: { ...this.#model.borders.stats.shown }, loaded: [...this.#model.borders.stats.loaded] },
      grid: { ...this.#model.grid.stats },
      countryNames: this.#countries?.stats ?? { on: false, max: 0, countries: 0, names: 0, renders: 0, failed: false },
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
    let epochMs = 0;
    for (const group of this.#model.satellites.groups.values()) epochMs = Math.max(epochMs, group.satellites.newestEpochMs);
    return { groups: this.#model.satellites.groups.size, placed: drawn.placed, segments: drawn.segments, tooFast: drawn.tooFast, dotScale: drawn.dotScale, epochMs, propagations, lastBatchMs, maxBatchMs, updateMs: drawn.updateMs, maxUpdateMs: drawn.maxUpdateMs, averageUpdateMs: drawn.updates ? drawn.totalMs / drawn.updates : 0, updates: drawn.updates };
  }

  // --- the game clock ----------------------------------------------------------------------------------------------------------------------------
  #readSpeed(): number {
    const raw = this.getAttribute("speed");
    const value = raw === null || raw === "" ? 1 : Number(raw);
    return Number.isFinite(value) ? value : 1;
  }

  /** Is anything on show that moves faster than the Earth turns: a group of satellites, including above the interpolation limit where they are drawn as streaks? */
  #satellitesMoving(): boolean {
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
