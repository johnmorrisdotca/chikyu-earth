// <chikyu-earth-realistic>: the Earth from space as a web component, drawn by kazoku-ui's shared 3D renderer (one WebGL context for the
// page) with three.js, which is the page's own. Optional entry point: the flat `<chikyu-earth>` needs neither. It draws only when something
// changes, at most 30 times a second, and nothing at all while it is out of sight or the tab is hidden.
import { carryControls, type ElementControls, type ViewController } from "@johnmorrisdotca/kazoku-ui/view-controls";
import { adoptStyles } from "../adopt.ts";
import type { SharedRenderer, View } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { GeoPoint, GlobeView } from "../types.ts";
import { airFor, readAirThickness } from "./air.ts";
import { IMMERSIVE_STYLE, immersiveWheel } from "./immersive.ts";
import { NOTES_STYLE, setAirNote } from "./air-note.ts";
import { cameraCentre, type CameraMode, createEarthItem, discRadius, lookAt, newModel, type EarthModel, type LightMode, type ThreeParts } from "./earth.ts";

import { createPaintState, paintedGround, paintedPeriod, type PaintSpec } from "../paint/buffer.ts";
import type { SatelliteInfo, SatelliteRef, Satellites } from "../satellites/types.ts";
import { MAX_ORBIT_GROUP, readStreakMax, type SatelliteStyle } from "../space/satellite-layer.ts";
import { applySatelliteFocus, satelliteEmphasis, satelliteGroupRows, shellRadiusOf, zoomForOrthographicShell, type SatelliteOthers } from "../space/satellite-focus.ts";
import { claimPress } from "../sky/claim.ts";
import { bindPaths, emptyPathStats, pointerOf, type PathControls, type PathStats } from "../space/path-controls.ts";
import { styleTable, type PathHit, type PathRequest, type PathStyle } from "../space/paths.ts";
import { bindSatelliteHover, hoverPathOn, hoverStyleOf, namesOnHover as namesHoverOn, type SatelliteHover } from "../space/satellite-hover.ts";
import { readMeteorStrength } from "../meteors/strength.ts";
import { METEOR_NOTE_STYLE, prefersLessMotion, setMeteorNote } from "../meteors/note.ts";
import type { Credit, DataSource } from "../data-door.ts";
import { createDoorHost, type DoorHost } from "../door/host.ts";
import { createFinerHolder, GIBS_ID } from "../door/gibs.ts";
import { folderSource } from "../door/map.ts";
import { ownCredit } from "../door/own.ts";
import { BODY_LABEL_ATTRIBUTES, bodyLabelText, loadMichroma, readBodyLabel, type BodyLabelSettings } from "./body-label.ts";
import { createSkyHost, SKY_ATTRIBUTES, SKY_STYLE, type SkyHost } from "../sky/host.ts";
import type { SkyKeepClear } from "../sky/keep-clear.ts";
import type { SkyLabelStyle } from "../sky/style.ts";
import { cleanPlaces, orthoView, readPlaceGroups, readPlaces, type Place, type PlaceLook } from "../markers/places.ts";
import { readHereCity } from "../markers/here-city.ts";
import { createHereCity, type HereCityHost } from "../markers/here-city-host.ts";
import { createPlaceLayer, PLACE_STYLE, placesLostNotice, readPlaceLook, type PlaceLayer } from "../markers/place-layer.ts";
import { aimAt, findPlace, glideView } from "../markers/go-to-place.ts";
import { subsolarPoint } from "./sun.ts";
import { CITY_NAMES_ATTRIBUTES, CITY_NAMES_STYLE, createCityHost, type CityHost, type CityNamesStyle } from "../cities/host.ts";
import { project } from "../markers/project.ts";
import { BORDER_ATTRIBUTES, readBorders, type BorderSets } from "../borders/lines.ts";
import type { BorderData, BorderStats } from "../borders/layer.ts";
import { GRID_ATTRIBUTES, readGrid } from "../grid/lines.ts";
import { readRoute, routeLeg, routeText, type RouteLeg } from "../route.ts";
import { applyRoute } from "../route/layer.ts";
import type { GridStats } from "../grid/layer.ts";
import { COUNTRY_NAMES_ATTRIBUTES, type CountryFrame } from "../country-names/geometry.ts";
import { COUNTRY_NAMES_STYLE, createCountryHost, type CountryHost, type CountryNamesStats, type CountryNamesStyle } from "../country-names/host.ts";
import { SEA_NAMES_ATTRIBUTES, readSeaNames } from "../sea-names/geometry.ts";
import { SEA_NAMES_STYLE, createSeaHost, type SeaHost, type SeaNamesStats } from "../sea-names/host.ts";

import { createGate, frameCap, type Gate } from "./gate.ts";
import { setSharedRenderer, setThreeLoader, takeRenderer } from "./shared.ts";
export { setSharedRenderer, setThreeLoader };
export type { CameraMode };
import type { OverlayHost, OverlayPose } from "../markers/layer.ts";
import { MAX_TEXTURE, TIERS, type Layer } from "./tiers.ts";
import type { TileSources, TileStats } from "./tile-set.ts";
import { mayWriteZoomMax, raisedZoomMax } from "./zoom-reach.ts";

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

const STYLE = ":host{display:block;aspect-ratio:1/1;position:relative;isolation:isolate}" + IMMERSIVE_STYLE + "#stage,#overlay{position:absolute;inset:0}#overlay{pointer-events:none}.sp-sat{position:absolute;left:0;top:0;font:12px/16px system-ui,-apple-system,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000;pointer-events:none}.sp-sat[hidden]{display:none}.sp-sat[data-hover]{transition:opacity 180ms linear}@media (prefers-reduced-motion: reduce){.sp-sat[data-hover]{transition:none}}" + PLACE_STYLE + SKY_STYLE + COUNTRY_NAMES_STYLE + SEA_NAMES_STYLE + CITY_NAMES_STYLE + METEOR_NOTE_STYLE + NOTES_STYLE;
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
/** The quickest a satellite goes round, degrees a second (a low orbit: 88 minutes). */
const SATELLITE_RATE = 360 / (88 * 60);
const SATELLITE_COLORS = ["#ffd54f", "#7fd4ff", "#ff8fa3", "#9ef0a8"];
type SatelliteStats = { groups: number; placed: number; segments: number; tooFast: boolean; dotScale: number; longestStreakPx: number; streakCapPx: number; weight: number; fade: number; earthPx: number; epochMs: number; propagations: number; lastBatchMs: number; maxBatchMs: number; updateMs: number; maxUpdateMs: number; averageUpdateMs: number; updates: number; selectedRing: boolean; hoverPath: boolean; hoverOpacity: number; selectedOpacity: number };

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
 * `borders` draws the borders on the land as thin lines that turn with the Earth: `countries` (chizu's, at any size), `regions` (provinces, states and the like, from the page's `borderData.regions`,
 * once the Earth is large enough to tell them apart), or both with a bare attribute. The shapes are loaded only when a set is switched on; `chikyu-borders-unavailable` is sent when they cannot be.
 *
 * `grid` draws the meridians and parallels on the Earth (every 30 degrees while it is small on the screen, every 15 once it is large), with the equator, the tropics, the polar circles and the prime
 * meridian picked out, light on the day side and dim on the night side. `country-names` names the countries at the middle of the part of each in view, in the page's language, never over another
 * name, as many as fit (40 at most, or the number given); the outlines are loaded only when it is set, and `chikyu-country-names-unavailable` is sent when they cannot be.
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
 * earth.placeGroups = false; // place-groups="off": every place keeps its own ring
 * earth.paint = { id: "25544", length: "1d", swath: "track" };
 * earth.clearPaint();
 * earth.setAttribute("star-names", "12");
 * earth.addEventListener("chikyu-sky-pick", (event) => {
 *   const pick = (event as CustomEvent<{ kind: string; name?: string; abbreviation?: string }>).detail;
 *   console.log(pick.kind, pick.name ?? pick.abbreviation);
 * });
 * earth.addEventListener("chikyu-timechange", (event) => {
 *   const { time, running } = (event as CustomEvent<{ time: number; running: boolean }>).detail;
 *   console.log(new Date(time).toISOString(), running ? "running" : "held");
 * });
 * document.body.append(earth);
 * ```
 */
export class ChikyuEarthRealistic extends HTMLElement {
  static observedAttributes = ["cloud-drift", "center", "time", "speed", "clouds", "lights", "light", "live-seconds", "tiles", "tiles-finer", "tiles-finer-layer", "tiles-finer-date", "tiles-finer-timeout", "data", "camera", "immersive", "meteors", "meteors-label", "meteors-strength", ...BODY_LABEL_ATTRIBUTES, ...SKY_ATTRIBUTES, ...CITY_NAMES_ATTRIBUTES, ...BORDER_ATTRIBUTES, ...GRID_ATTRIBUTES, ...COUNTRY_NAMES_ATTRIBUTES, ...SEA_NAMES_ATTRIBUTES, "air-thickness", "air-label", "lang", "places", "places-look", "place-groups", "here-city", "route", "satellite-tint", "satellite-streak-max", "hover-path", "names-on-hover", "selected-path", "path-hit"];

  #model: EarthModel = newModel();
  #paint = createPaintState();
  #mode: number | "now" = "now";
  #view: View | undefined;
  #gate: Gate | undefined;
  #tick: ReturnType<typeof setTimeout> | undefined;
  /** The clock's speed when `speed` is given (attribute or property); `null` follows `time`: real time for "now", held for a date. */
  #speed: number | null = null;
  /** The page's own clock, in milliseconds, at the last step. */
  #last = 0;
  #announced = -Infinity;
  /** The finer imagery (NASA's tile service), one source while the attributes stay the same. Off unless `tiles-finer="gibs"`. */
  #finerHold = createFinerHolder(() => new Date(this.#model.time), () => this.#gate?.soon());
  #finerNote: HTMLElement | undefined;
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
  /** The names of cities on the Earth (`city-names`), and the look of the names. */
  #cities: CityHost | undefined;
  #citiesStyle: CityNamesStyle = {};
  /** The names of the countries on the Earth (`country-names`), and the look of the names. */
  #countries: CountryHost | undefined;
  #seas: SeaHost | undefined;
  #countriesStyle: CountryNamesStyle = {};
  #listeners = new Set<(pose: OverlayPose) => void>();
  #placeLayer: PlaceLayer | undefined;
  /** The nearest city's name on a `here` marker (`here-city`), loaded only when that is on. */
  #here: HereCityHost | undefined;
  /** Whether the page has been told that places in sight were left undrawn. */
  #placesLost = { told: false };
  #placeList: Place[] = [];
  /** Counts the turns to a place, so a new one stops the one before. */
  #placeGlide = 0;
  #hands: ElementControls | undefined;
  /** The view from before a satellite group was framed, put back when the focus is cleared. */
  #focusView: GlobeView | null = null;
  /** The name and the faint orbit while the pointer rests on a satellite. */
  #hover: SatelliteHover | undefined;
  #pathControls: PathControls | undefined;
  #reach: string | null = null;
  /** The page has set a `speed` since the element came into the page: for a reader who prefers reduced motion, that is the Play that lets meteors start. */
  #played = false;
  #note: HTMLElement | undefined;
  /** The names of the stars and the constellation lines (`star-names`, `constellation-lines`), and the look of the names. */
  #sky: SkyHost | undefined;
  #skyStyle: Partial<SkyLabelStyle> = {};
  #keepClear: SkyKeepClear[] = [];
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
    root.innerHTML = `<div id="stage"></div><div id="places"></div><div id="overlay"></div><div id="notes"><p id="air-note" hidden></p><p id="meteor-note" hidden></p><p id="finer-credit" hidden></p></div>`;
    adoptStyles(root, STYLE, this.nonce);
    this.#stage = root.getElementById("stage")!;
    this.#overlay = root.getElementById("overlay")!;
    this.#note = root.getElementById("meteor-note")!;
    this.#airNote = root.getElementById("air-note")!;
    this.#finerNote = root.getElementById("finer-credit")!;
    this.#sky = createSkyHost({
      root,
      attribute: (name) => this.getAttribute(name),
      language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
      onError: (error) => this.dispatchEvent(new CustomEvent("chikyu-sky-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      loadFont: loadMichroma,
      taken: () => this.#boxesBeforeSky(),
    });
    this.#sky.setStyle(this.#skyStyle);
    this.#sky.setKeepClear(this.#keepClear);
    this.#placeLayer = createPlaceLayer(root.getElementById("places")!);
    this.#here = this.#openHereCity();
    this.#placeList = readPlaces(this.getAttribute("places"));
    this.#placeLayer.set(this.#here.named(this.#placeList));
    this.#placeLayer.look = readPlaceLook(this.getAttribute("places-look"));
    this.#placeLayer.grouping = readPlaceGroups(this.getAttribute("place-groups"));
    this.#cities = createCityHost({
      root,
      attribute: (name) => this.getAttribute(name),
      language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
      onError: (error) => this.dispatchEvent(new CustomEvent("chikyu-city-names-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      onLayout: () => this.#relayNames(false, true),
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
    this.#seas = createSeaHost({
      root,
      attribute: (name) => this.getAttribute(name),
      language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
    });
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
        if (mayWriteZoomMax(this.getAttribute("zoom-max"), this.#reach)) {
          // only ever raised, and lowered when the tiles are taken away (below), not before
          const reach = raisedZoomMax(this.#reach, layers);
          this.#reach = reach;
          if (this.getAttribute("zoom-max") !== reach) this.setAttribute("zoom-max", reach);
        }
        this.dispatchEvent(new CustomEvent("chikyu-tiles", { detail: { layers } }));
      },
      air: () => airFor(this.getAttribute("air")),
      invalidate: () => this.#gate?.soon(),
      onDraw: () => this.#gate?.drawn(),
      onTiled: () => {
        this.#showFinerCredit();
        this.#door.announce();
      },
      onSky: (sky) => this.#sky?.frame(sky),
      onLabelError: (error) => this.dispatchEvent(new CustomEvent("chikyu-body-label-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      placeSprites: () => this.#placeLayer?.sprites ?? null,
      onPose: (pose) => {
        if (this.#hands) this.#hands.controller.grabRadius = discRadius(pose.width, pose.height, 1);
        // the places first, then the markers (they keep off what the places take), then the cities', countries', stars' and constellations' names
        if (this.#placeLayer && (this.#placeList.length > 0 || this.#placeLayer.stats.shown > 0)) {
          this.#placeLayer.frame(orthoView(pose), [], [], this.#model.light === "lit" ? null : subsolarPoint(this.#model.time));
          this.#notePlacesLost();
        }
        this.#pose = { ...pose, transform: "" };
        this.#posing = true;
        try {
          for (const listener of this.#listeners) listener(this.#pose);
        } finally {
          this.#posing = false;
        }
        this.#cityFrame();
      },
      onPlaceRings: (drawn) => this.#ringsDrawn(drawn),
      onSatellitesError: (error) => this.dispatchEvent(new CustomEvent("chikyu-satellites-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
      onHover: (place) => this.#hover?.follow(place),
      paint: {
        data: () => this.#paint.data,
        width: this.#paint.width,
        height: this.#paint.height,
        step: (ms) => this.#paint.step(ms, (at) => paintedGround(this.#model.satellites.groups, this.#paint.id, at), paintedPeriod(this.#model.satellites.groups, this.#paint.id)),
        span: () => this.#paint.spanMinutes,
        on: () => this.#paint.on,
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
    this.addEventListener("pointerdown", this.#down);
    this.addEventListener("focusin", this.#take);
    // before the shared hands (which hear it after this): a plain wheel in an immersive view zooms
    this.addEventListener("wheel", this.#wheel, { capture: true, passive: false });
    this.#hands = carryControls(this, { initial: this.#model.view, limits: LIMITS, onChange: (state, info) => this.setView(state, info.final) });
    this.#hover = bindSatelliteHover({
      element: this,
      state: this.#model.satellites,
      pick: (x, y) => this.#model.pick?.(x, y, 12) ?? null,
      place: (ref) => this.placeSatellite(ref),
      name: (ref) => this.satelliteInfo(ref)?.name,
      selected: () => this.selectedSatellite,
      request: () => this.#gate?.soon(),
      labelParent: () => this.#overlay ?? null,
      pathOn: () => hoverPathOn(this.getAttribute("hover-path"), this.getAttribute("names-on-hover")),
      namesOn: () => namesHoverOn(this.getAttribute("names-on-hover")),
      style: () => hoverStyleOf(this),
    });
    this.#hover.sync();
    this.#pathControls = bindPaths({
      element: this,
      state: this.#model.satellites,
      request: () => this.#gate?.soon(),
      pathAt: (x, y, radius) => this.#model.pathAt?.(x, y, radius) ?? null,
      pick: (x, y) => this.#model.pick?.(x, y, 12) ?? null,
      riding: () => false,
    });
    this.#pathControls.sync();
    this.#startTick();
    document.addEventListener("visibilitychange", this.#onVisible);
  }

  disconnectedCallback(): void {
    this.#hover?.stop();
    this.#hover = undefined;
    this.#pathControls?.stop();
    this.#pathControls = undefined;
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
    this.#here?.dispose();
    this.#here = undefined;
    this.#placeLayer?.dispose();
    this.#placeLayer = undefined;
    this.#cities?.dispose();
    this.#cities = undefined;
    this.#countries?.dispose();
    this.#countries = undefined;
    this.#seas?.dispose();
    this.#seas = undefined;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "center") this.centre = readCentre(value) ?? { lon: 0, lat: 0 };
    else if (name === "time") this.time = readTime(value);
    else if (name === "speed") this.#setSpeed(readSpeed(value));
    else if (name === "clouds") this.clouds = value !== "off";
    else if (name === "lights") this.lights = value !== "off";
    else if (name === "light") this.light = readLight(value);
    else if (name === "live-seconds") this.#startTick();
    else if (name === "tiles" || name === "tiles-finer" || name === "tiles-finer-layer" || name === "tiles-finer-date" || name === "tiles-finer-timeout") this.#gate?.soon();
    else if (name === "data") {
      this.#door.book.ownOnly(value === "own");
      this.#gate?.soon();
    }
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
        this.#cities?.refresh();
        this.#seas?.refresh();
        this.#countries?.refresh();
        this.#here?.refresh();
        this.#showFinerCredit();
      }
    } else if ((BODY_LABEL_ATTRIBUTES as readonly string[]).includes(name)) this.#applyBodyLabel();
    else if ((SKY_ATTRIBUTES as readonly string[]).includes(name)) this.#sky?.refresh();
    else if (name === "places") {
      this.#placeList = readPlaces(value);
      this.#applyPlaces();
    } else if (name === "here-city") {
      this.#here?.setLimit(readHereCity(value));
      this.#applyPlaces();
    } else if (name === "places-look" && this.#placeLayer) {
      this.#placeLayer.look = readPlaceLook(value);
      this.#gate?.soon();
    } else if (name === "place-groups" && this.#placeLayer) {
      this.#placeLayer.grouping = readPlaceGroups(value);
      this.#gate?.soon();
    } else if (name === "route") {
      if (applyRoute(this.#model.route, readRoute(value))) this.#gate?.soon();
    }
    else if ((CITY_NAMES_ATTRIBUTES as readonly string[]).includes(name)) this.#cities?.refresh();
    else if ((SEA_NAMES_ATTRIBUTES as readonly string[]).includes(name)) {
      this.#seas?.refresh();
      this.#seaFrame();
      this.#countryFrame();
    }
    else if (name === "borders") {
      Object.assign(this.#model.borders, readBorders(value));
      this.#gate?.soon();
    } else if (name === "grid") {
      this.#model.grid.on = readGrid(value);
      this.#gate?.soon();
    } else if ((COUNTRY_NAMES_ATTRIBUTES as readonly string[]).includes(name)) this.#countries?.refresh();
    else if (name === "satellite-tint") {
      this.#model.satellites.orbitTint = value === "orbit";
      this.#gate?.soon();
    } else if (name === "hover-path" || name === "names-on-hover") this.#hover?.sync();
    else if (name === "selected-path") this.#pathControls?.sync();
    else if (name === "path-hit") { /* read at each press and move */ }
    else if (name === "satellite-streak-max") {
      this.#model.satellites.streakMax = readStreakMax(value);
      this.#gate?.soon();
    }
    if (name === "air-thickness" || name === "air-label" || name === "lang") setAirNote(this.#airNote, this, this.#model.airThickness);
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
   * A press or a tap on a named star, or on a figure, also sends `chikyu-sky-pick`: a star is `{ kind: "star", hr, name, designation, x, y, pointerType }` (`name` as drawn, `x` and `y` CSS pixels inside the element) and a figure is `{ kind: "constellation", abbreviation, pointerType }`. Each named star and each figure in view is a button, so a keyboard reaches it and Enter picks it, and the pick is read out; the keys `C` and `Shift`+`C` (the next and the previous figure) send it too. Nothing is drawn at rest.
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
   * and keep their size in pixels at any zoom. Names never overlap one another; one with no room is left out. The element stores nothing and sends nothing: the page hands the places over and keeps them where
   * it likes. Setting the property writes the attribute; at most `MAX_PLACES` are drawn. Nothing is drawn again at rest: the pulse is the page's own animation, stopped out of sight and for a reader who asked
   * for less motion.
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
   * Name each `here` place with the nearest city (the attribute `here-city`). `false` (the default) leaves the page's label and loads nothing.
   * `true` looks within 100 km (`HERE_CITY_KM`). A number is that limit in kilometres, at most 20,000 (`HERE_CITY_MAX_KM`); a city further away is not used, and the page's label stays.
   * The cities are kuni's capitals, the other cities of a million and the others of 100,000, an optional peer loaded only when this is on and a `here` place is set. The name follows the page's language
   * (the short Japanese name, then the Japanese name, else English). `places` is not changed: only the drawn name is. Nothing is drawn again at rest.
   *
   * @example
   * ```ts no-run
   * import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";
   *
   * const earth = document.querySelector("chikyu-earth-realistic") as ChikyuEarthRealistic;
   * earth.hereCity = true;
   * console.log(earth.hereCity); // 100
   * earth.hereCity = false;
   * ```
   */
  get hereCity(): false | number {
    return readHereCity(this.getAttribute("here-city"));
  }
  set hereCity(value: false | true | number) {
    if (value === true) this.setAttribute("here-city", "");
    else if (value === false) this.removeAttribute("here-city");
    else {
      const km = readHereCity(String(value));
      if (km === false) this.removeAttribute("here-city");
      else this.setAttribute("here-city", String(km));
    }
  }

  /** The cities for `here-city`, asked for only when the attribute is on. */
  #openHereCity(): HereCityHost {
    const host = createHereCity({
      language: () => ((this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en"),
      onChange: () => {
        if (this.isConnected) this.#applyPlaces();
      },
      onError: (error) => this.dispatchEvent(new CustomEvent("chikyu-here-city-unavailable", { detail: { reason: error instanceof Error ? error.message : String(error) } })),
    });
    host.setLimit(readHereCity(this.getAttribute("here-city")));
    return host;
  }

  /** Hand the places to the layer, with a here marker's city name when one is known, and draw once. */
  #applyPlaces(): void {
    const layer = this.#placeLayer;
    if (!layer) return;
    layer.set(this.#here?.named(this.#placeList) ?? this.#placeList);
    this.#gate?.soon();
  }

  /**
   * A route between two places (the attribute `route`, `lon,lat,lon,lat`). Null, the default, draws none. The line is the WGS84 geodesic, split at the date line, and it turns with the Earth.
   * Setting the property writes the attribute. Nothing is drawn again at rest: the line is drawn with the picture, and only when the route or the view changes.
   */
  get route(): { from: GeoPoint; to: GeoPoint } | null {
    return readRoute(this.getAttribute("route"));
  }
  set route(value: { from: GeoPoint; to: GeoPoint } | null) {
    if (!value) this.removeAttribute("route");
    else this.setAttribute("route", routeText(value));
  }

  /** The distance, bearings and flight-time estimate for `route`, or null when none is set. The flight time assumes 900 km/h. */
  get routeInfo(): RouteLeg | null {
    const route = this.route;
    return route ? routeLeg(route.from, route.to) : null;
  }

  /**
   * Turn the Earth so a place of `places` is in the middle, at a pace a reader can follow (at once with `smooth: false`, for a reader who asked for less motion, or before the picture is live); the zoom
   * and pan stay. The place is named by its `id`, or by its label in any case. The tilt is held to 90 degrees either way, so a place more than 90 degrees of latitude from `center` comes as near the middle
   * as that allows.
   *
   * @param text - The place's id or label.
   * @param options - `smooth` (true by default).
   * @returns The place, once the turn has started; `undefined` when there is no such place.
   */
  async goToPlace(text: string, options: { smooth?: boolean } = {}): Promise<Place | undefined> {
    const place = findPlace(this.#placeList, text);
    if (!place) return undefined;
    const view = this.#model.view;
    const from = { yaw: view.yaw, tilt: view.tilt };
    const to = aimAt(cameraCentre(this.#model), place, from);
    const bar = this.hasAttribute("data-kazoku-bar") && this.id ? (this.getRootNode() as Document | ShadowRoot).querySelector?.(`kazoku-view-controls[for="${CSS.escape(this.id)}"]`) : null;
    const controls = (bar ? (Reflect.get(bar, "controller") as ViewController | undefined) : undefined) ?? this.#hands?.controller;
    const glide = (this.#placeGlide += 1);
    const set = (yaw: number, tilt: number, final: boolean): void => {
      if (controls) controls.set({ yaw, tilt }, final, "place");
      else this.setView({ ...this.#model.view, yaw, tilt }, final);
    };
    glideView(set, from, to, options.smooth !== false && !prefersLessMotion() && this.#view?.live === true, () => glide === this.#placeGlide && this.isConnected);
    return { ...place };
  }

  /**
   * Whether places that crowd are gathered into one ring with their count (the attribute `place-groups`): on by default, `off` leaves every place its own ring. Setting the property writes the attribute.
   *
   * @example
   * ```ts no-run
   * import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";
   *
   * const earth = document.querySelector("chikyu-earth-realistic") as ChikyuEarthRealistic;
   * earth.placeGroups = false;
   * earth.getAttribute("place-groups"); // "off"
   * earth.placeGroups = true;
   * earth.hasAttribute("place-groups"); // false
   * ```
   */
  get placeGroups(): boolean {
    return this.#placeLayer?.grouping ?? readPlaceGroups(this.getAttribute("place-groups"));
  }
  set placeGroups(value: boolean) {
    if (value) this.removeAttribute("place-groups");
    else this.setAttribute("place-groups", "off");
  }

  /** The picture said whether it can draw the rings of the places that are not markers of their own. Without `Points` the places' layer draws them itself. */
  #ringsDrawn(drawn: boolean): void {
    if (!this.#placeLayer || this.#placeLayer.ringsInPicture === drawn) return;
    this.#placeLayer.ringsInPicture = drawn;
    this.#gate?.soon();
  }

  /** Tell the page once when places in sight had no room among the fallback circles. Missing `Points` alone leaves them drawn, so it says nothing. */
  #notePlacesLost(): void {
    const notice = placesLostNotice(this.#placesLost, this.#placeLayer?.stats.omitted ?? 0);
    if (!notice) return;
    this.dispatchEvent(new CustomEvent("chikyu-places-unavailable", { detail: notice }));
  }

  /** How the places are drawn (the attribute `places-look`): `beam` (a light rising out of the ground with a ring at its foot, the default), `pin` (a thin stick with a round head) or `ring` (only the ring on the ground). */
  get placesLook(): PlaceLook {
    return this.#placeLayer?.look ?? readPlaceLook(this.getAttribute("places-look"));
  }
  set placesLook(value: PlaceLook) {
    this.setAttribute("places-look", value);
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

  /** Whether the meridians and parallels are drawn (the attribute `grid`). Setting it writes the attribute, or takes it away. */
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
   * Names of oceans, seas and continents (the attribute `sea-names`). Off unless set: a bare attribute is on. Oceans and continents from far out, seas once the Earth is large on the screen. A city name keeps the space where both fit only one. Nothing is drawn again at rest.
   *
   * @example
   * ```ts no-run
   * import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";
   *
   * const earth = document.querySelector("chikyu-earth-realistic") as ChikyuEarthRealistic;
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
   * Which borders are drawn (the attribute `borders`): the countries' at any size, and the regions' (provinces, states, prefectures) once the Earth is large enough on the screen to tell them apart.
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
    this.#gate?.soon();
  }

  /** Tells the names of cities, then of countries, where the Earth is in the picture just drawn (the orthographic view the markers share); the countries' names keep clear of the places' and the cities'. */
  #cityFrame(): void {
    const pose = this.#pose;
    if (!this.#cities || !pose) return;
    const frame = {
      width: pose.width,
      height: pose.height,
      radius: pose.radius,
      disc: { x: pose.cx, y: pose.cy, radius: pose.radius },
      project: (lon: number, lat: number, out: { x: number; y: number }) => {
        const at = project(lon, lat, pose);
        out.x = at.x;
        out.y = at.y;
        return at.z;
      },
    };
    this.#nameFrame = frame;
    this.#relayNames(true, false);
  }

  /**
   * Lays the names that come after the places and the markers out on the last frame, in the order of the layers: the cities' names clear of the places' names, rings and marks and of the markers' labels; the countries' names clear of those and the cities'; the stars' and constellations'
   * names clear of all of them. `cities` says whether the cities are laid out again (a new frame), or only what follows them (the cities told that they changed); `sky` says whether the stars' names are laid out again, which a draw does itself after the names.
   */
  #relayNames(cities: boolean, sky: boolean): void {
    if (cities && this.#nameFrame) this.#cities?.frame(this.#nameFrame, this.#boxesBeforeCities());
    this.#seaFrame();
    this.#countryFrame();
    if (sky) this.#sky?.relayout();
  }

  /** What the cities' names keep off: what the places layer takes (names, rings, marks) and the markers' labels (a city is named beside its own dot, which a marker may sit on, so the marks are not kept clear of). The list is refilled, not made again. */
  #beforeCities: { left: number; top: number; width: number; height: number }[] = [];
  #boxesBeforeCities(): readonly { left: number; top: number; width: number; height: number }[] {
    const out = this.#beforeCities;
    out.length = 0;
    out.push(...(this.#placeLayer?.boxes ?? []));
    for (const boxes of this.#claimedNames.values()) out.push(...boxes);
    return out;
  }

  /** What the stars' and constellations' names keep off: everything before them, the cities' names last. The list is refilled, not made again. */
  #beforeSky: { left: number; top: number; width: number; height: number }[] = [];
  #boxesBeforeSky(): readonly { left: number; top: number; width: number; height: number }[] {
    const out = this.#beforeSky;
    out.length = 0;
    out.push(...(this.#placeLayer?.boxes ?? []));
    for (const boxes of this.#claims.values()) out.push(...boxes);
    out.push(...(this.#cities?.boxes ?? []), ...(this.#seas?.boxes ?? []));
    return out;
  }

  /** The frame the names were last laid out on. */
  #nameFrame: CountryFrame | null = null;

  /** Lays the ocean, sea and continent names out on the last frame, clear of the places' and the cities' names. A city that was placed first keeps the space. */
  #seaFrame(): void {
    const seas = this.#seas;
    if (!seas || !this.#nameFrame) return;
    seas.frame(this.#nameFrame, seas.stats.on ? [...(this.#placeLayer?.boxes ?? []), ...(this.#cities?.boxes ?? []), ...[...this.#claims.values()].flat()] : []);
  }

  /** Lays the countries' names out on the last frame, clear of the places', the cities' and the sea names as they are now. */
  #countryFrame(): void {
    const countries = this.#countries;
    if (!countries || !this.#nameFrame) return;
    countries.frame(this.#nameFrame, countries.stats.on ? [...(this.#placeLayer?.boxes ?? []), ...(this.#cities?.boxes ?? []), ...(this.#seas?.boxes ?? []), ...[...this.#claims.values()].flat()] : []);
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
    const finer = this.#finerHold.source((attr) => this.getAttribute(attr), this.getAttribute("data") === "own");
    return { ...(day ? { day } : {}), ...(night ? { night } : {}), ...(finer ? { finer } : {}) };
  }

  /** The acknowledgement for the finer imagery, shown only while those tiles are on the screen. */
  #showFinerCredit(): void {
    const note = this.#finerNote;
    if (!note) return;
    const count = this.#model.tiles?.stats.used[GIBS_ID] ?? 0;
    const lang = (this.closest("[lang]")?.getAttribute("lang") ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
    const finer = this.#finerHold.source((attr) => this.getAttribute(attr), this.getAttribute("data") === "own");
    const text = count > 0 && finer ? finer.info.credit[lang] : "";
    if (note.textContent !== text) note.textContent = text;
    if (note.lang !== lang) note.lang = lang;
    if (note.hidden !== (text === "")) note.hidden = text === "";
  }

  /** The package's own credits for the last drawn frame: its pictures while it is drawn, and its finer tiles when a window of them is in view (unless a page added the folder itself, which the door counts). */
  #ownCredits(): Credit[] {
    const used = this.#model.tiles?.stats.used ?? {};
    const own: Credit[] = [ownCredit("chikyu-pictures", this.#state === "live" ? 1 : 0)];
    if (this.#door.book.get("chikyu-tiles") === undefined) own.push(ownCredit("chikyu-tiles", used["chikyu-tiles"] ?? 0));
    const finer = this.#finerHold.source((attr) => this.getAttribute(attr), this.getAttribute("data") === "own");
    const finerUsed = used[GIBS_ID] ?? 0;
    if (finer && finerUsed > 0) own.push({ source: finer.info, own: false, used: finerUsed });
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

  /**
   * Finer imagery than the package's own tiles, read by the browser from NASA's imagery service. `gibs` turns it on; anything else, or leaving it out, leaves it off. The picture is NASA's Landsat annual true-colour mosaic (30 m, no cloud, land only, the year 2000), laid over the package's picture only where the view is closer than the package's own tiles; where it has no data (the sea, Antarctica, the far north) the package's picture stays. A tile that is slow or missing leaves the coarser picture in place.
   * `tiles-finer-layer` is `landsat` (the default), `today` (the daily MODIS Terra picture, with its clouds, for the most recent day that has one, looked for from the day before the moment on show back at most 10 days, one tile a day) or another layer's id. `tiles-finer-date` names a year of the Landsat mosaic by its date (`1990-06-01`), or, for a daily layer, is `latest` (the default), `previous-day`, `shown` or one day `yyyy-mm-dd`. `tiles-finer-timeout` is how many milliseconds a tile is given to arrive before it is left (2000 when the page says nothing).
   */
  get tilesFiner(): string | null {
    return this.getAttribute("tiles-finer") === "gibs" ? "gibs" : null;
  }
  set tilesFiner(value: string | null) {
    if (value === "gibs") this.setAttribute("tiles-finer", "gibs");
    else this.removeAttribute("tiles-finer");
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
      taken: () => this.#placeLayer?.boxes ?? [],
      claim: (owner, boxes, names) => {
        if (boxes.length === 0) {
          this.#claims.delete(owner);
          this.#claimedNames.delete(owner);
        } else {
          this.#claims.set(owner, boxes);
          this.#claimedNames.set(owner, names ?? boxes);
        }
        // laid out again only when the overlay changed between draws: at a draw the names are laid out after it anyway
        if (!this.#posing) this.#relayNames(true, true);
      },
    };
  }

  /** The boxes overlays on the element (markers) take, by overlay. */
  #claims = new Map<object, readonly { left: number; top: number; width: number; height: number }[]>();
  /** The part of each overlay's boxes that is its labels'. */
  #claimedNames = new Map<object, readonly { left: number; top: number; width: number; height: number }[]>();
  /** True while the overlays are told of a draw. */
  #posing = false;

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
    /** The page's paths: asked for, drawn (with the chosen satellite's own), left out over the cap of 16, unmatched, whether the chosen satellite's own orbit is drawn, draw calls they took at the last draw (0 or 1), the path under the mouse and the `chikyu-path-click` events sent. */
    paths: PathStats;
    draws: number;
    contexts: number;
    canvas: { width: number; height: number; pixels: number };
    assets: { entries: number; refs: number };
    /** The meteors: whether they are on, the streaks alive now and started so far, the streaks a second being drawn, and the strongest active shower's code and rate. */
    meteors: { on: boolean; strength: number; alive: number; spawned: number; perSecond: number; shower: string | null; zhr: number };
    /** The name written on the Earth: whether `body-label` is set, its text, the label is made, and it is showing (it is hidden while the Earth is small). */
    bodyLabel: { on: boolean; text: string; made: boolean; showing: boolean };
    /** The names of the stars and the constellation lines: whether one is asked for, whether hoshi-stars is loaded, the names and figures laid out at the last draw, the figure picked, how many times the layer was drawn, the language its names were last laid out in, and the named stars' own points on the screen (`stars`). */
    sky: { on: boolean; loaded: boolean; names: number; figures: number; picked: string | null; pick: string | null; hover: string | null; constellations: number; culture: string; renders: number; lang: string; stars: { text: string; x: number; y: number }[] };
    /** The places: how many were handed over, how many are drawn and named at the last draw, and how many times they were laid out. `sprites` is the rings in the picture's one draw call (0 when it cannot draw them); `dots` is the circles drawn in the page instead. */
    places: { places: number; shown: number; labels: number; renders: number; marks: number; groups: number; sprites: number; dots: number; omitted: number };
    /** The nearest city on a `here` marker (`here-city`): whether it is on, the kilometre limit (0 when off), whether kuni's cities have arrived, and whether that load is still going. */
    hereCity: { on: boolean; maxKm: number; loaded: boolean; pending: boolean };
    /** The names of cities: whether `city-names` is set and the most it asks for, the Earth's radius on the screen, the tiers of kuni's cities that have arrived and how many cities, the names shown at the last draw and how many times the layer was drawn. */
    cityNames: { on: boolean; max: number; radius: number; tiers: string[]; cities: number; names: number; renders: number };
    /** The borders: the segments of each set, whether each was drawn at the last draw, the countries whose regions have arrived, how many times a set's lines were made, and whether a set could not be loaded. */
    borders: BorderStats;
    /** The grid: whether it was drawn at the last draw, whether every 15 degrees (else 30), its segments then, how many times its lines were made, and whether it could not be made. */
    grid: GridStats;
    /** The route between two places: whether one is set, and its geodesic distance, great-circle distance and flight time at 900 km/h. */
    route: { on: boolean; kilometres: number; greatCircleKm: number; flightHours: number };
    /** The names of countries: whether `country-names` is set and the most it asks for, the countries loaded, the names shown at the last draw, how many times they were laid out, and whether the outlines could not be loaded. */
    countryNames: CountryNamesStats;
    /** The names of oceans, seas and continents: whether `sea-names` is on, the Earth's radius on the screen, the names shown at the last draw, and how many times the layer was laid out. */
    seaNames: SeaNamesStats;
  } {
    const stats = this.#taken?.renderer.stats;
    return {
      state: this.#state,
      tiers: { ...this.#tiers },
      satellites: this.#satelliteStats(),
      paths: this.#pathControls?.stats() ?? emptyPathStats(),
      tiles: this.#model.tiles?.stats ?? { ready: false, level: null, held: 0, shown: 0, loading: 0, failed: 0, requested: 0, heldBytes: 0, refused: 0, used: {}, finer: null, fading: false },
      draws: stats?.draws ?? 0,
      contexts: stats?.contexts ?? 0,
      canvas: stats?.canvas ?? { width: 0, height: 0, pixels: 0 },
      assets: { entries: stats?.assets.entries ?? 0, refs: stats?.assets.refs ?? 0 },
      meteors: { on: this.#model.meteors.on, strength: this.#model.meteors.strength, ...this.#model.meteors.drawn },
      bodyLabel: { on: this.#model.bodyLabel.settings !== null, text: this.#model.bodyLabel.text, ...this.#model.bodyLabel.drawn },
      sky: this.#sky?.stats ?? { on: false, loaded: false, names: 0, figures: 0, picked: null, pick: null, hover: null, constellations: 0, culture: "iau", renders: 0, lang: "", stars: [] },
      places: { ...(this.#placeLayer?.stats ?? { places: 0, shown: 0, labels: 0, renders: 0, marks: 0, groups: 0, sprites: 0, dots: 0, omitted: 0 }) },
      hereCity: this.#here?.stats ?? { on: false, maxKm: 0, loaded: false, pending: false },
      cityNames: this.#cities?.stats ?? { on: false, max: 0, radius: 0, tiers: [], cities: 0, names: 0, renders: 0 },
      borders: { ...this.#model.borders.stats, shown: { ...this.#model.borders.stats.shown }, loaded: [...this.#model.borders.stats.loaded] },
      grid: { ...this.#model.grid.stats },
      route: { ...this.#model.route.stats },
      countryNames: this.#countries?.stats ?? { on: false, max: 0, countries: 0, names: 0, renders: 0, failed: false },
      seaNames: this.#seas?.stats ?? { on: false, radius: 0, names: 0, renders: 0 },
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
   * The longest a satellite's streak may be on the screen, in CSS pixels (the attribute `satellite-streak-max`; 8 when the page says nothing; `0` or `off` for no cap). Above 60 times real time each satellite is drawn as a streak along its orbit
   * for the stretch one frame spans, and at a fast clock that stretch is long: at an hour a second a low satellite would cross a tenth of the Earth in one frame. The cap is a length on the screen, so a low and a high satellite are drawn equally long, and the streak keeps the look it has at 10 minutes a second at any speed. It is the smaller of this number of pixels and 0.025 of the Earth's drawn radius (about 160 km of orbit, what a low satellite covers in a frame at 10 minutes a second), so as the Earth is drawn smaller the streak shrinks in proportion, to a dot, instead of staying as long on a small Earth as on a large one. The marks also lose weight on a small Earth: below a drawn radius of 150 pixels the streaks are fainter and the dark rim of the dots fades, gone at 40 pixels, and a crowd of satellites on a small Earth is drawn fainter in proportion so thousands of them do not wash it. Pointing along the orbit and ending at the satellite, it is the same length at any frame rate. Off restores the whole stretch.
   *
   * @example
   * ```ts
   * import "@johnmorrisdotca/chikyu-earth/realistic/element";
   *
   * const earth = document.querySelector("chikyu-earth-realistic")!;
   * earth.satelliteStreakMax = 12;
   * ```
   */
  get satelliteStreakMax(): number {
    return this.#model.satellites.streakMax;
  }
  set satelliteStreakMax(value: number) {
    if (Number.isFinite(value) && value >= 0) this.setAttribute("satellite-streak-max", String(value));
    else this.removeAttribute("satellite-streak-max");
  }

  /**
   * Show a group of satellites (made by `createSatellites`) under a name, or take the group away with `null`. A group is one draw call however many satellites it holds, so every group of the catalogue can be shown at once. Giving the name of a group
   * that is already shown replaces it. `style`: `color` and `size` (CSS pixels) of the dots, and `orbits` to draw every orbit (only for a group of 40 or fewer, such as the stations). The groups are placed by SGP4 about once a second and interpolated
   * between. Above `MAX_SATELLITE_SPEED` each satellite is a short streak along its orbit instead of being hidden. They are hidden by the Earth when they are behind it, and draw at most 30 times a second and not at all while the clock holds.
   *
   * @param group - The group's name, for `showSatellites`, `selectSatellite` and the events.
   * @param satellites - The group, or `null` to remove it.
   * @param style - How to draw it.
   */
  /**
   * Paint one satellite's path on the Earth. `id` is a NORAD catalogue number or `group:index`. `length` is how long the trail is kept, in simulated time (`1d` when left out, or `1w`, `1m`). `swath` is `track` (the point under the satellite, the default) or `coverage` (where it is at least 10° above the horizon). Setting another satellite clears the trail. `null` clears it.
   */
  get paint(): PaintSpec | null {
    return this.#paint.on ? { id: this.#paint.id, length: this.#paint.length, swath: this.#paint.swath } : null;
  }
  set paint(value: PaintSpec | null) {
    this.#paint.set(value);
    this.#gate?.soon();
  }

  /** Take the painted trail off the Earth. */
  clearPaint(): void {
    this.#paint.clear();
    this.#gate?.soon();
  }

  /** Texels the trail has painted. 0 after `clearPaint`, and again when the painted satellite changes. */
  get paintPixels(): number {
    return this.#paint.pixels;
  }

  setSatellites(group: string, satellites: Satellites | null, style: Partial<SatelliteStyle> = {}): void {
    const groups = this.#model.satellites.groups;
    if (satellites === null) {
      groups.delete(group);
      if (this.#model.satellites.selected?.group === group) this.#model.satellites.selected = null;
      if (this.#model.satellites.focus?.name === group) {
        this.#model.satellites.focus = null;
        this.#restoreFocusView();
        this.dispatchEvent(new CustomEvent("chikyu-satellite-focus", { detail: { group: null, count: 0 }, bubbles: true, composed: true }));
      }
      if (this.#model.satellites.hover.ref?.group === group) {
        this.#model.satellites.hover.ref = null;
        this.#model.satellites.hover.fade = 0;
      }
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

  /**
   * The groups now set. `count` is how many satellites the group holds, `visible` is the shown state from `showSatellites` (a focus does not change it), `placed` is how many the last draw placed (0 when the group is not drawn) and `emphasis` is how a focus treats it: `focus`, `dim`, `hidden` or `plain` (no focus).
   */
  get satelliteGroups(): { name: string; count: number; visible: boolean; placed: number; emphasis: "focus" | "dim" | "hidden" | "plain" }[] {
    return satelliteGroupRows(this.#model.satellites);
  }

  /** The group `focusSatelliteGroup` is showing on its own, or `null`. */
  get focusedSatelliteGroup(): string | null {
    return this.#model.satellites.focus?.name ?? null;
  }

  /**
   * Show one group on its own. The others are drawn dimmer (`others: "dim"`, the default, through the same dimming an old element set uses) or not drawn (`"hide"`). `frame` (true by default) pulls the camera back, by this view's own zoom, until the group's orbits fit: the distance is the greatest apogee of the group, from each satellite's mean motion and eccentricity, and it stops at 8 Earth radii. `null` puts every group back to the shown state it had, and puts the camera back when it was moved. A name that `setSatellites` has not set returns `{ ok: false, reason: "not-set" }` and changes nothing. It does not throw. When the choice changes, `chikyu-satellite-focus` is sent with `{ group, count }`.
   *
   * @param name - The group's name, or `null` to clear the focus.
   * @param options - `others` and `frame`.
   * @returns `{ ok: true, group, count }` when the group is set (`group` is `null` and `count` is 0 when cleared). `{ ok: false, reason: "not-set" }` when it is not.
   */
  focusSatelliteGroup(name: string | null, options: { others?: SatelliteOthers; frame?: boolean } = {}): { ok: true; group: string | null; count: number } | { ok: false; reason: "not-set" } {
    const answer = applySatelliteFocus(this.#model.satellites, name, options);
    if (!answer.ok || answer.group === undefined || answer.count === undefined) return { ok: false, reason: "not-set" };
    if (answer.group === null) this.#restoreFocusView();
    else if (options.frame !== false) this.#frameSatelliteShell(answer.group);
    if (answer.changed) this.dispatchEvent(new CustomEvent("chikyu-satellite-focus", { detail: { group: answer.group, count: answer.count }, bubbles: true, composed: true }));
    // which groups are drawn decides how often time is drawn, so the next step is worked out again, as for `showSatellites`
    this.#startTick();
    this.#gate?.soon();
    return { ok: true, group: answer.group, count: answer.count };
  }

  /** The view's own zoom, far enough that the group's shell fills the picture, with the Earth back in the middle. */
  #frameSatelliteShell(name: string): void {
    const group = this.#model.satellites.groups.get(name);
    if (!group) return;
    const box = this.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    if (!this.#focusView) this.#focusView = { ...this.#model.view };
    const zoom = zoomForOrthographicShell(shellRadiusOf(group.satellites.sets), box.width, box.height, LIMITS.zoomMin, LIMITS.zoomMax);
    this.#applyCamera({ ...this.#model.view, zoom, panX: 0, panY: 0 });
  }

  /** Put back the view from before the shell was framed. */
  #restoreFocusView(): void {
    const saved = this.#focusView;
    this.#focusView = null;
    if (saved) this.#applyCamera(saved);
  }

  /** Hand a camera to the controls that are driving the view, or to the view itself when those are not there yet. */
  #applyCamera(view: GlobeView): void {
    const bar = this.hasAttribute("data-kazoku-bar") && this.id ? (this.getRootNode() as Document | ShadowRoot).querySelector?.(`kazoku-view-controls[for="${CSS.escape(this.id)}"]`) : null;
    const controls = (bar ? (Reflect.get(bar, "controller") as { set(next: GlobeView, final: boolean, why: string): void } | undefined) : undefined) ?? this.#hands?.controller;
    if (controls) controls.set(view, true, "satellites");
    else this.setView(view, true);
  }

  /**
   * Draw a faint orbit while the pointer rests on a satellite. On unless `hover-path="off"`. Left unset, it is on when `names-on-hover` is on.
   * The colour and the opacity are the custom properties `--chikyu-hover-path` and `--chikyu-hover-path-opacity`.
   */
  get hoverPath(): boolean {
    return hoverPathOn(this.getAttribute("hover-path"), this.getAttribute("names-on-hover"));
  }
  set hoverPath(value: boolean) {
    if (value) this.setAttribute("hover-path", "");
    else this.setAttribute("hover-path", "off");
  }

  /** Show a satellite's name while the pointer rests on it. On unless `names-on-hover="off"`. A touch does not rest, so it shows nothing. */
  get namesOnHover(): boolean {
    return namesHoverOn(this.getAttribute("names-on-hover"));
  }
  set namesOnHover(value: boolean) {
    if (value) this.removeAttribute("names-on-hover");
    else this.setAttribute("names-on-hover", "off");
  }

  /** Mark one satellite: a larger ring round it and its orbit drawn. `null` lets it go. */
  selectSatellite(ref: SatelliteRef | null): void {
    const found = ref ? this.#model.satellites.groups.get(ref.group) : undefined;
    this.#model.satellites.selected = ref && found && ref.index >= 0 && ref.index < found.satellites.count ? { group: ref.group, index: ref.index } : null;
    this.#gate?.soon();
  }

  /**
   * Where a satellite is on the screen as of the last draw: `{ x, y, visible, heightKm }` in CSS pixels from the view's top left, `visible` meaning it is inside the box and not behind the Earth. `null` when its group is not set or not shown, it cannot be placed, or it is behind the camera.
   */
  placeSatellite(ref: SatelliteRef): { x: number; y: number; visible: boolean; heightKm: number } | null {
    return this.#model.placeSatellite?.(ref) ?? null;
  }

  /** The satellite marked by `selectSatellite` or by a press on it, if any. */
  get selectedSatellite(): SatelliteRef | null {
    const chosen = this.#model.satellites.selected;
    return chosen ? { ...chosen } : null;
  }

  // --- paths -------------------------------------------------------------------------------------------------------------------------------------
  /**
   * Draw these satellites' orbits at once, each in a look from the table (`pathStyles`), without a satellite being chosen. One draw call for all of them and the chosen satellite's own orbit, and nothing is drawn at rest. At most 16 are kept, the last of the list.
   * `id` is a NORAD catalogue number or `group:index` (`stations:0`); an id that matches no satellite is skipped (`stats.paths.unresolved`). A satellite asked for twice is drawn once, in the later look. `style` is the name of a look (`selected`, `hovered`, `favourite`, `path`, or one of the page's own)
   * or a partial look over `path`. `[]` takes them all away. Where the pointer is on one, `chikyu-path-hover` and `chikyu-path-click` say which (`path-hit`).
   *
   * @param list - The paths, oldest first.
   *
   * @example
   * ```ts
   * import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space";
   *
   * const show = (space: ChikyuSpace): void => space.setPaths([{ id: 25544, style: "favourite" }, { id: "stations:1", style: { color: "#7fdbff", dash: [8, 4] } }]);
   * console.log(typeof show);
   * ```
   */
  setPaths(list: readonly PathRequest[]): void {
    this.#pathControls?.setPaths(list);
  }
  /** The paths in use, as set (the last 16). Setting it is `setPaths`. */
  get paths(): PathRequest[] {
    return this.#pathControls?.paths ?? [];
  }
  set paths(list: readonly PathRequest[]) {
    this.setPaths(list);
  }
  /**
   * Change the looks the paths are drawn in, by name. Each entry is a partial look over the built-in one of that name (or over `path`, for a name of the page's own); `null` takes the page's entry away. Without `replace` the entries are added to those already set.
   * The built-in looks differ by width and dash as well as colour: `selected` (white, 2 px, solid, also the look of the chosen satellite's own orbit), `hovered` (white, 1.5 px, dashed), `favourite` (amber, 1.75 px, dotted) and `path` (white, 1.5 px, solid).
   * A look is `{ color, width (0.5 to 8 CSS pixels), opacity (0 to 1), dash ([dash, gap] in CSS pixels, or null) }`.
   *
   * @param table - The entries by name.
   * @param replace - `true` to drop the entries set before.
   *
   * @example
   * ```ts
   * import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space";
   *
   * const quiet = (space: ChikyuSpace): void => space.setPathStyles({ selected: { color: "#ffd166", width: 3, dash: null } });
   * console.log(typeof quiet);
   * ```
   */
  setPathStyles(table: Readonly<Record<string, Partial<PathStyle> | null>>, replace = false): void {
    this.#pathControls?.setStyles(table, replace);
  }
  /** The table of looks in use, whole: the built-in ones with the page's own over them. A copy. */
  get pathStyles(): Record<string, PathStyle> {
    return this.#pathControls?.styles ?? styleTable({});
  }
  set pathStyles(table: Readonly<Record<string, Partial<PathStyle> | null>>) {
    this.setPathStyles(table, true);
  }
  /**
   * Draw the chosen satellite's own orbit (the attribute `selected-path`; on unless `off`). Off, `selectSatellite` still rings and names the satellite and a ride still follows it, but no line is drawn: the page draws it, with `setPaths` and the `selected` look, or its own. The look of the line when it is on is the `selected` entry of `pathStyles`.
   */
  get selectedPath(): boolean {
    return this.getAttribute("selected-path") !== "off";
  }
  set selectedPath(value: boolean) {
    if (value) this.removeAttribute("selected-path");
    else this.setAttribute("selected-path", "off");
  }
  /**
   * How near, in CSS pixels, the pointer has to be to a path for the pick and hover events to report it (the attribute `path-hit`; 8 when left out, 0 to 40; `0` or `off` turns the test off). A touch is given twice that, and at least 16.
   * The test covers the page's paths and the chosen satellite's own orbit, not the part of an orbit the Earth hides, and a satellite's dot under the pointer comes first. In a ride from a satellite the test is off unless the attribute is set.
   */
  get pathHit(): number {
    return this.#pathControls?.hit ?? 8;
  }
  set pathHit(value: number) {
    if (Number.isFinite(value) && value >= 0) this.setAttribute("path-hit", String(value));
    else this.removeAttribute("path-hit");
  }
  /**
   * The path under a point of the element, from the last draw: its id as given, the satellite (`ref`, the same shape as in `chikyu-satellite-click`), the name of its look, the nearest point on it and the distance to it, or `null`.
   *
   * @param x - CSS pixels from the element's left.
   * @param y - CSS pixels from its top.
   * @param radiusPx - How near the point must be, 0 to 200; `path-hit` when left out.
   * @returns The path, or `null` when none is within reach.
   *
   * @example
   * ```ts
   * import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space";
   *
   * const name = (space: ChikyuSpace, x: number, y: number): string => space.pathAt(x, y, 10)?.style ?? "none";
   * console.log(typeof name);
   * ```
   */
  pathAt(x: number, y: number, radiusPx?: number): PathHit | null {
    return this.#pathControls?.at(x, y, radiusPx) ?? null;
  }

  /** Facts about one satellite at the moment shown (name, number, element age, height, speed, period, and `ownerCountry` when the owner is one country); undefined if it cannot be placed then. */
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
    let epochMs = 0;
    for (const group of this.#model.satellites.groups.values()) epochMs = Math.max(epochMs, group.satellites.newestEpochMs);
    return { groups: this.#model.satellites.groups.size, placed: drawn.placed, segments: drawn.segments, tooFast: drawn.tooFast, dotScale: drawn.dotScale, longestStreakPx: drawn.longestStreakPx, streakCapPx: drawn.streakCapPx, weight: drawn.weight, fade: drawn.fade, earthPx: drawn.earthPx, epochMs, propagations, lastBatchMs, maxBatchMs, updateMs: drawn.updateMs, maxUpdateMs: drawn.maxUpdateMs, averageUpdateMs: drawn.updates ? drawn.totalMs / drawn.updates : 0, updates: drawn.updates, selectedRing: drawn.selectedRing, hoverPath: drawn.hoverPath, hoverOpacity: drawn.hoverOpacity, selectedOpacity: drawn.selectedOpacity };
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
    if (satellite) {
      claimPress(event);
      this.dispatchEvent(new CustomEvent("chikyu-satellite-click", { detail: { ...satellite, info: this.satelliteInfo(satellite) }, bubbles: true, composed: true }));
      return;
    }
    if (this.#pathControls?.press(event.clientX - rect.left, event.clientY - rect.top, pointerOf(event))) claimPress(event);
  };

  #wheel = (event: WheelEvent): void => immersiveWheel(this, event);

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

  /** Is anything on show that moves faster than the Earth turns: a group of satellites, including above the interpolation limit where they are drawn as streaks? */
  #satellitesMoving(): boolean {
    for (const [name, group] of this.#model.satellites.groups) if (satelliteEmphasis(name, group.visible, this.#model.satellites.focus).drawn && group.satellites.count > 0) return true;
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
}

declare global {
  interface HTMLElementTagNameMap {
    "chikyu-earth-realistic": ChikyuEarthRealistic;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-earth-realistic")) {
  customElements.define("chikyu-earth-realistic", ChikyuEarthRealistic);
}
