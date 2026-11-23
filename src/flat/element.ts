// <chikyu-flat>: satellites on a flat map of the world. A canvas for the map (land, day and night) and a canvas for the dots, the places worked out in the browser by SGP4 (satellite.js, an optional peer) from the elements the page hands over.
// Nothing runs on a timer when the clock is held, and nothing is drawn at rest, out of sight or in a hidden tab. This file registers nothing: `@johnmorrisdotca/chikyu-earth/flat/define` does.
import { geoCircle, geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { adoptStyles } from "../adopt.ts";
import { footprintAngle, BEAM_ELEVATION } from "../beam/geometry.ts";
import { orbitShape } from "../catalogue/orbit.ts";
import { COUNTRIES } from "../countries.ts";
import { creditLine } from "../data-door.ts";
import { ownCredit } from "../door/own.ts";
import { groundTrack } from "../passes/passes.ts";
import { subsolarPoint, greenwichSidereal } from "../realistic/sun.ts";
import { SATELLITE_GROUPS } from "../satellites/catalogue.ts";
import { SHORT_NAMES } from "../satellites/names.ts";
import { MAX_SATELLITE_SPEED } from "../satellites/limits.ts";
import { fetchElements } from "../satellites/source.ts";
import { createSatellites } from "../satellites/track.ts";
import type { ElementSet, Satellites } from "../satellites/types.ts";
import { GROUP_COLOURS, PLANE_COLOURS, SPARE_COLOUR, TRACK_SHADOW, TRACK_SUNLIT } from "./colours.ts";
import { clusterPlanes, groupFacts, type GroupFacts, type Plane, type PlaneClusters } from "./facts.ts";
import { FLATTENED, MAX_ZOOM, clampView, pixelsPerDegree, projectFlat, wrapLongitude, zoomAbout, type FlatView } from "./geometry.ts";
import { trackStateOfScene, type GroundTrackState } from "./track-state.ts";
import { pointText, placeOver } from "./marks.ts";
import { PhotoPictures, paintPhoto, readLook, type FlatLook } from "./photo.ts";
import { say, type FlatLang } from "./words.ts";

const RAD = Math.PI / 180;
/** The most satellites whose footprints are drawn at once when none is chosen. */
const FOOTPRINT_MAX = 80;
const TIME_EVENT_MS = 250;
/** How long, in real seconds, a fast clock's streak covers, and the longest it is drawn, in pixels. */
const STREAK_SECONDS = 0.25;
const STREAK_PX = 28;
/** ...and for a crowd (thousands of dots), where long streaks would be a tangle. */
const STREAK_PX_CROWD = 10;
/** The furthest a pointer may move between going down and coming up and still be a tap, pixels. */
const TAP_SLOP = 5;

/**
 * One satellite of a group, as a page is told of it: what `chikyu-flat-pick` carries.
 *
 * @example
 * ```ts
 * import type { FlatPick } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const show = (pick: FlatPick): string => `${pick.name} (${pick.id}) in ${pick.group}`;
 * console.log(typeof show);
 * ```
 */
export interface FlatPick {
  /** The NORAD catalogue number. */
  id: number;
  /** Where it is in its group's element sets. */
  index: number;
  group: string;
  name: string;
  /** The letter of its orbital plane (`A`), or null when it is in none. */
  plane: string | null;
  altitudeKm: number;
  /** True when the Sun lights it, false when it is in the Earth's shadow (the cylindrical model of `inEarthShadow`), at the moment shown. Null when it cannot be placed exactly then. */
  sunlit: boolean | null;
  /** The way its ground track runs, degrees clockwise from north (0 to 360), at the moment shown; null when it cannot be placed exactly. */
  bearingDeg: number | null;
  /** True going north, false going south; null when it cannot be placed exactly. */
  ascending: boolean | null;
  /** What chose it: a pointer going over it (`hover`), a tap or click (`tap`), or the keyboard (`key`). */
  via: "hover" | "tap" | "key";
}

/**
 * An orbital plane of a loaded group, with the group's id and the colour the map gives it: what the element's `planes` lists.
 *
 * @example
 * ```ts
 * import type { FlatPlane } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const chip = (plane: FlatPlane): string => `${plane.group} ${plane.id} (${plane.count})`;
 * console.log(typeof chip);
 * ```
 */
export interface FlatPlane extends Plane {
  group: string;
  colour: string;
}

/**
 * How a group looks and is called, when the package does not already know it (`SATELLITE_GROUPS` names the 14 it knows).
 *
 * @example
 * ```ts
 * import type { GroupStyle } from "@johnmorrisdotca/chikyu-earth/flat";
 *
 * const style: GroupStyle = { colour: "#ffffff", label: "My satellites", labelJa: "私の衛星" };
 * console.log(style.label);
 * ```
 */
export interface GroupStyle {
  colour?: string;
  label?: string;
  labelJa?: string;
}

interface Group {
  id: string;
  label: string;
  labelJa: string;
  colour: string;
  sats: Satellites;
  n: number;
  buf: Float32Array;
  lon: Float32Array;
  lat: Float32Array;
  alt: Float32Array;
  sx: Float32Array;
  sy: Float32Array;
  /** Where each satellite was a moment ago and is now, 6 numbers each, from `arc` (a fast clock draws a streak); made when first needed. */
  seg: Float32Array | null;
  /** The next satellite to pin again when a fast clock keeps SGP4 current a slice a frame. */
  cursor: number;
  /** 1 when the satellite was placed and is on show at the last draw. */
  on: Uint8Array;
  clusters: PlaneClusters;
  facts: GroupFacts;
}
/** A stretch of the ground track in one light: the points, and whether the Sun lights the satellite along it. */
interface TrackRun {
  sunlit: boolean;
  points: [number, number][];
}

/** Cut a ground track into stretches of sunlight and shadow. Each stretch ends on the first point of the next, so the line has no gap where the light changes. */
const trackRuns = (points: readonly { lon: number; lat: number; sunlit: boolean }[]): TrackRun[] => {
  const runs: TrackRun[] = [];
  let run: TrackRun | null = null;
  for (const p of points) {
    if (!run || run.sunlit !== p.sunlit) {
      const next: TrackRun = { sunlit: p.sunlit, points: [] };
      if (run && run.points.length > 0) next.points.push(run.points[run.points.length - 1]!);
      runs.push(next);
      run = next;
    }
    run.points.push([p.lon, p.lat]);
  }
  return runs;
};

interface Ref {
  g: Group;
  i: number;
}
/** The marks the map paints into its own picture, which have names and can be pressed. */
type Mark = "sun" | "home";
/** Where a mark was painted at the last draw: each copy of the world it shows in, and the place on the Earth. */
interface MarkSpot {
  xs: number[];
  y: number;
  lon: number;
  lat: number;
}
const sameRef = (a: Ref | null, b: Ref | null): boolean => a === b || (a !== null && b !== null && a.g === b.g && a.i === b.i);

const escape = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const flag = (value: string | null): boolean => value !== null && !/^(off|false|no|0)$/i.test(value.trim());
const estimateFarOf = (value: string | null): boolean | "steady" => (value !== null && value.trim().toLowerCase() === "steady" ? "steady" : flag(value));
const finite = (value: string | null, fallback: number): number => (value === null || value.trim() === "" || !Number.isFinite(Number(value)) ? fallback : Number(value));
const readTime = (value: string | null): number | "now" => {
  if (value === null || value.trim() === "" || value.trim().toLowerCase() === "now") return "now";
  const text = value.trim();
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) || !/T/.test(text) ? text : `${text}Z`);
  return Number.isFinite(ms) ? ms : "now";
};
const prefersLessMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const hidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden";

const CSS = `
:host{display:flex;flex-direction:column;gap:8px;color:inherit;font:inherit;container-type:inline-size;min-width:0}
:host([hidden]){display:none}
*{box-sizing:border-box}
.bar{display:grid;gap:6px}
.bar:empty{display:none}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding-bottom:2px}
.chips>*{flex:none}
@container (min-width:600px){.chips{flex-wrap:wrap;overflow:visible}}
.gap{flex:1 1 0}
.pair{display:inline-flex;gap:0}
.pair button:first-child{border-radius:999px 0 0 999px}
.pair button:last-child{border-radius:0 999px 999px 0;margin-left:-1px}
button{font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:999px;padding:3px 12px;min-height:32px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
button[aria-pressed="true"]{background:color-mix(in srgb,currentColor 14%,transparent);border-color:currentColor}
button:disabled{opacity:.45;cursor:default}
button:focus-visible{outline:3px solid #6cd0ff;outline-offset:2px}
@media (pointer:coarse){button{min-height:44px;padding:6px 14px}}
.chip .swatch{width:10px;height:10px;border-radius:50%;background:var(--c,#9aa5b1);flex:none}
.chip .n{opacity:.7;font-variant-numeric:tabular-nums;font-size:.85em}
.stage{position:relative;flex:1 1 auto;min-height:0;aspect-ratio:var(--chikyu-flat-aspect,2/1);overflow:hidden;border-radius:var(--chikyu-flat-radius,10px);background:var(--chikyu-flat-sea,#0b1830)}
@container (max-width:599px){.stage{aspect-ratio:var(--chikyu-flat-aspect-narrow,4/3)}}
canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.dots{outline:none;cursor:grab;touch-action:pan-y}
.dots[data-zoomed]{touch-action:none}
.dots:focus-visible{outline:3px solid #6cd0ff;outline-offset:-3px}
.ring{position:absolute;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;border:2px solid #fff;border-radius:50%;pointer-events:none;box-shadow:0 0 0 1px #000,inset 0 0 0 1px #000}
.ring.hov{width:14px;height:14px;margin:-7px 0 0 -7px;border-width:1px}
.ring[hidden],.tip[hidden]{display:none}
.tip{position:absolute;left:0;top:0;pointer-events:none;background:rgba(8,14,28,.94);color:#fff;padding:4px 8px;border-radius:6px;font-size:.85em;line-height:1.3;white-space:nowrap;border:1px solid rgba(255,255,255,.3)}
.key{position:absolute;left:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;padding:3px 8px;border-radius:6px;background:rgba(8,14,28,.82);color:#fff;font-size:.8em;line-height:1.3;pointer-events:none;max-width:calc(100% - 16px)}
.key[hidden]{display:none}
.key span{display:inline-flex;align-items:center;gap:6px}
.key i{display:inline-block;width:18px;height:0;border-top:3px solid var(--k,#fff);border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.55)}
button.mark{position:absolute;left:0;top:0;width:26px;height:26px;min-height:0;margin:-13px 0 0 -13px;padding:0;border:0;border-radius:50%;background:transparent;pointer-events:none}
button.mark[hidden]{display:none}
button.mark:focus-visible{outline:3px solid #6cd0ff;outline-offset:0}
.legend{font-size:.85em;line-height:1.3}
.legend[hidden],.legend ul[hidden]{display:none}
.legend button{min-height:28px;padding:1px 10px;font-size:inherit}
@media (pointer:coarse){.legend button{min-height:40px}}
.legend ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 16px}
.legend li{display:inline-flex;align-items:center;gap:6px}
.g{display:inline-flex;align-items:center;justify-content:center;gap:2px;flex:none;width:30px;height:20px;border-radius:4px;background:var(--chikyu-flat-sea,#0b1830)}
.g i{display:block;width:7px;height:7px;border-radius:50%;background:var(--c,#9aa5b1)}
.g.sun::before{content:"";width:10px;height:10px;border-radius:50%;background:#ffd54f;box-shadow:0 0 0 1px rgba(0,0,0,.55)}
.g.home::before{content:"";width:8px;height:8px;background:#fff;box-shadow:0 0 0 2px #0b1830;transform:rotate(45deg)}
.g.sat i{width:6px;height:6px}
.g.faint::before{content:"";width:7px;height:7px;border-radius:50%;background:#9aa5b1;opacity:.45}
.g.chosen::before{content:"";width:12px;height:12px;box-sizing:border-box;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000}
.g.footprint::before{content:"";width:16px;height:16px;box-sizing:border-box;border:1px solid rgba(255,255,255,.8);border-radius:50%;background:rgba(255,255,255,.12)}
.g.line i{width:20px;height:0;border-radius:2px;background:none;border-top:3px solid var(--c)}
.g.night{background:linear-gradient(90deg,#2a4a73,#07101f)}
.g.night-photo{background:radial-gradient(circle at 70% 55%,#ffd98a 0 1px,transparent 2px),radial-gradient(circle at 40% 40%,#ffe9b8 0 1px,transparent 2px),linear-gradient(90deg,#41648f,#02060f)}
.credit{position:absolute;right:8px;bottom:8px;margin:0;padding:2px 8px;border-radius:6px;background:rgba(8,14,28,.72);color:#fff;font-size:.7em;line-height:1.3;pointer-events:none;max-width:min(60%,calc(100% - 16px));text-align:right}
.credit[hidden]{display:none}
.msg{position:absolute;inset:0;display:grid;place-items:center;margin:0;padding:12px;text-align:center;color:#cfe0f5;pointer-events:none}
.msg:empty{display:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

/**
 * The `<chikyu-flat>` custom element: satellites on a flat map of the world, at the places SGP4 puts them for the time shown. Import `@johnmorrisdotca/chikyu-earth/flat/define` to register the tag; it needs `satellite.js` (an optional peer).
 *
 * The page gives it orbital elements: `setGroup(id, sets)` for each group (the ids of `SATELLITE_GROUPS` are known by name and colour), or the `elements` property for one, or `elements-src` (an address, read once, through `fetchElements`' rules). The package fetches nothing of its own.
 * Attributes: `center` (the longitude in the middle, degrees; 0, Greenwich, by default; the map wraps round the date line), `home-lon` and `home-lat` (the reader's place: a marker, and the "My place" button, which appear only when given; the element never asks the browser for a place),
 * `group` (which groups to show: `all`, one id, or several with commas), `off` (groups that are loaded but start off when `group` names none, such as `starlink`: the filter chip turns one on), `colour-by` (`group`, or `plane` to colour by orbital plane), `plane` (a plane letter: show that plane only), `footprint` and `track` (draw the coverage circle and the ground track, which is amber in sunlight and blue in the Earth's shadow, a cylinder, with a key: `--chikyu-flat-track-sun` and `--chikyu-flat-track-shadow` change the colours; the footprint is of the chosen satellite, or of every one shown when there are 80 or fewer),
 * `paused` (hold the clock and keep the speed; nothing is drawn while it is held), `trails` (`off` for no streaks at a fast clock), `footprint-elevation` (degrees above the horizon the circle is drawn for; 25 like the 3D beam), `selected` (a NORAD number: the chosen satellite), `time` (`now` or an ISO date; live when absent), `speed` (1 is real time, 0 holds, 86400 is a day a second, negative runs backwards), `estimate-far` (`steady` keeps each satellite's usual orbit beyond 30 days from its elements), `shade` (`off` for no night),
 * `dot-size` (pixels), `controls` (`none`, or any of `centre zoom footprint track chips key look`: the built-in buttons, filter chips, key and Map / Photo pair shown; all but `look` by default) and `lang` (`en` or `ja`; the page's language by default).
 * `look` is `map` (the drawn map, the default) or `photo` (NASA's picture of the Earth, with the night side's city lights; `borders="off"` leaves out the country lines, `texture-base` and `max-texture` are as on the realistic Earth; the pictures are fetched only while it is on, and `lookState` says how it stands).
 * The key under the map names every mark the map draws (`keyOpen` folds it open or shut: open on a wide map, shut on a phone until asked), and the yellow dot (the Sun overhead) and the white diamond (My place) name themselves, with where, when pointed at, pressed or reached with the Tab key.
 *
 * Events: `chikyu-flat-pick` (a satellite under the pointer, tapped, or reached by the keyboard: a `FlatPick`; `detail.id` is null when a tap lands on nothing and clears the choice), `chikyu-flat-filter` (a chip changed which groups or plane are shown: `{ groups, plane }`),
 * `chikyu-flat-planes` (the planes were worked out: `{ planes }`), `chikyu-flat-view` (the reader panned or zoomed: `{ center, zoom }`), `chikyu-flat-look` (the look or how it stands changed: `{ look, state }`), `chikyu-flat-mark` (the Sun's dot or the home diamond was pressed: `{ mark, name, text, lon, lat, place, via }`) and `chikyu-timechange` (`{ time, running }`, at most four a second while time runs).
 * Style it with the custom properties `--chikyu-flat-sea`, `--chikyu-flat-land`, `--chikyu-flat-line`, `--chikyu-flat-night`, `--chikyu-flat-aspect`, `--chikyu-flat-aspect-narrow` and `--chikyu-flat-radius`.
 *
 * @example
 * ```ts no-run
 * import "@johnmorrisdotca/chikyu-earth/flat/define";
 * import type { ChikyuFlat } from "@johnmorrisdotca/chikyu-earth/flat/define";
 * import type { ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * declare const gpsElements: ElementSet[]; // your page's own element sets
 * const flat = document.createElement("chikyu-flat") as ChikyuFlat;
 * flat.setAttribute("center", "139.7");
 * flat.setAttribute("colour-by", "plane");
 * flat.setGroup("gps", gpsElements);
 * document.body.append(flat);
 * flat.addEventListener("chikyu-flat-pick", (event) => console.log((event as CustomEvent).detail.name));
 * ```
 */
export class ChikyuFlat extends HTMLElement {
  static observedAttributes = ["paused", "trails", "off", "center", "home-lon", "home-lat", "group", "colour-by", "color-by", "plane", "footprint", "track", "footprint-elevation", "selected", "time", "speed", "estimate-far", "shade", "dot-size", "controls", "lang", "elements-src", "look", "borders", "texture-base", "max-texture"];

  #groups = new Map<string, Group>();
  #index = new Map<number, Ref>();
  #shown: Set<string> | null = null;
  /** Groups that start off when `group` names none: loaded, and one tap on their chip away. */
  #off = new Set<string>();
  #plane = "";
  #selected: Ref | null = null;
  #cursor: Ref | null = null;
  #hover: Ref | null = null;
  #footprint = false;
  #track = false;
  #view: FlatView = { width: 0, height: 0, centerLon: 0, centerLat: 0, zoom: 1 };
  #dpr = 1;
  #mode: number | "now" = "now";
  #time = 0;
  #speed = 1;
  #last = 0;
  #paused = false;
  /** The moment shown jumped (the page set it, the speed changed, the tab came back): fast placement pins every satellite again before it turns them. */
  #jump = true;
  #lastDraw = 0;
  #totalMs = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #exact = new Float64Array(6);
  #frame = 0;
  #inView = true;
  #connected = false;
  #problem = "";
  #waiting = false;
  #loaded: string | undefined;
  #fetch = 0;
  #viewSent = "";
  #announced = -Infinity;
  #mapKey = "";
  #look: FlatLook = "map";
  #photo: PhotoPictures | null = null;
  #photoFailed = false;
  #lookSent = "";
  #markAt: Record<Mark, MarkSpot | null> = { sun: null, home: null };
  #markHover: Mark | null = null;
  #markShown: Mark | null = null;
  #markNames = new Map<string, string>();
  #markButtons: Record<Mark, HTMLButtonElement | undefined> = { sun: undefined, home: undefined };
  #legend: HTMLElement | undefined;
  #legendKey = "";
  #legendOpen: boolean | null = null;
  #faint = false;
  #credit: HTMLElement | undefined;
  #trackKey = "";
  #trackLines: { past: TrackRun[]; future: TrackRun[] } | null = null;
  #key: HTMLElement | undefined;
  #stage: HTMLElement | undefined;
  #bar: HTMLElement | undefined;
  #mapCanvas: HTMLCanvasElement | undefined;
  #dotCanvas: HTMLCanvasElement | undefined;
  #selRing: HTMLElement | undefined;
  #hovRing: HTMLElement | undefined;
  #tip: HTMLElement | undefined;
  #live: HTMLElement | undefined;
  #msg: HTMLElement | undefined;
  #sizer: ResizeObserver | undefined;
  #watcher: IntersectionObserver | undefined;
  #pointers = new Map<number, { x: number; y: number }>();
  #drag: { x: number; y: number; moved: boolean; pinch: number } | null = null;
  #counts = { draws: 0, mapDraws: 0, dots: 0, lastMs: 0, maxMs: 0 };
  #buckets = new Map<string, number[]>();
  #streaks = new Map<string, number[]>();

  // --- the page's data -------------------------------------------------------------------------------------------------------------------------

  /**
   * Hand over a group's orbital elements, or take the group away with `null`. The satellites start SGP4 here (a Starlink-sized group takes a fraction of a second), the facts and orbital planes are worked out, and the next draw shows them.
   * `id` is a name of `SATELLITE_GROUPS` (`gps`, `starlink`: its words and colour are known) or any name of the page's own, with `style` for its colour and words.
   *
   * @param id - The group's name.
   * @param sets - Its element sets, as `createSatellites` takes them; `null` removes the group.
   * @param style - The colour and the English and Japanese names of a group the package does not know.
   */
  setGroup(id: string, sets: readonly ElementSet[] | null, style: GroupStyle = {}): void {
    const old = this.#groups.get(id);
    if (old) {
      for (const set of old.sats.sets) if (this.#index.get(set.NORAD_CAT_ID)?.g === old) this.#index.delete(set.NORAD_CAT_ID);
      if (this.#selected?.g === old) this.#selected = null;
      if (this.#cursor?.g === old) this.#cursor = null;
      if (this.#hover?.g === old) this.#hover = null;
      this.#groups.delete(id);
    }
    if (sets !== null) {
      const sats = createSatellites(sets);
      sats.estimateFar = estimateFarOf(this.getAttribute("estimate-far"));
      const known = SATELLITE_GROUPS.find((one) => one.id === id);
      const n = sats.count;
      const clusters = clusterPlanes(sats.sets);
      const group: Group = {
        id,
        label: style.label ?? known?.label ?? id,
        labelJa: style.labelJa ?? known?.labelJa ?? style.label ?? id,
        colour: style.colour ?? GROUP_COLOURS[id] ?? PLANE_COLOURS[this.#groups.size % PLANE_COLOURS.length]!,
        sats,
        n,
        buf: new Float32Array(n * 3),
        lon: new Float32Array(n),
        lat: new Float32Array(n),
        alt: new Float32Array(n),
        sx: new Float32Array(n),
        sy: new Float32Array(n),
        seg: null,
        cursor: 0,
        on: new Uint8Array(n),
        clusters,
        facts: groupFacts(sats.sets),
      };
      this.#groups.set(id, group);
      sats.sets.forEach((set, i) => this.#index.set(set.NORAD_CAT_ID, { g: group, i }));
      this.#waiting = false;
      this.#problem = "";
      this.#syncSpeed();
    }
    const wanted = Number(this.getAttribute("selected"));
    if (this.#selected === null && Number.isFinite(wanted) && this.#index.has(wanted)) this.#selected = this.#index.get(wanted) ?? null;
    this.#trackKey = "";
    this.#buildBar();
    this.dispatchEvent(new CustomEvent("chikyu-flat-planes", { detail: { planes: this.planes }, bubbles: true, composed: true }));
    this.#request();
    this.#schedule();
  }

  /** The element sets of the group the attributes name (`group`, else `satellites`): a shorthand for one group. Setting it calls `setGroup`. */
  get elements(): readonly ElementSet[] {
    return this.#groups.get(this.#defaultId())?.sats.sets ?? [];
  }
  set elements(sets: readonly ElementSet[]) {
    this.setGroup(this.#defaultId(), sets);
  }

  /** The groups loaded, in the order they were given: their name, words, colour and how many satellites started SGP4. */
  get groups(): readonly { id: string; label: string; labelJa: string; colour: string; count: number }[] {
    return [...this.#groups.values()].map((g) => ({ id: g.id, label: g.label, labelJa: g.labelJa, colour: g.colour, count: g.n }));
  }

  /** The facts (`groupFacts`) of a loaded group, or undefined. */
  facts(id: string): GroupFacts | undefined {
    return this.#groups.get(id)?.facts;
  }

  /** The orbital planes of every loaded group (by right ascension of the ascending node; see `clusterPlanes`): the letter, how many satellites, the colour the map gives it. A group with no planes to show has none here. */
  get planes(): readonly FlatPlane[] {
    const out: FlatPlane[] = [];
    for (const g of this.#groups.values()) for (const plane of g.clusters.planes) out.push({ ...plane, group: g.id, colour: PLANE_COLOURS[plane.index % PLANE_COLOURS.length]! });
    return out;
  }

  /** The groups on show: those the `group` attribute names, or the ones a chip chose; every loaded group when none is chosen. Set to a list of ids, or `null` for all. */
  get visibleGroups(): readonly string[] {
    return this.#shownGroups().map((g) => g.id);
  }
  set visibleGroups(ids: readonly string[] | null) {
    this.#shown = ids === null ? null : new Set(ids);
    this.#afterFilter();
  }

  /** The NORAD number of the chosen satellite, or null. Set it to choose one from code (no `chikyu-flat-pick` is sent), `null` to clear. */
  get selected(): number | null {
    return this.#selected ? (this.#selected.g.sats.sets[this.#selected.i]?.NORAD_CAT_ID ?? null) : null;
  }
  set selected(id: number | null) {
    this.#selected = id === null ? null : (this.#index.get(id) ?? null);
    this.#trackKey = "";
    this.#sync();
    this.#request();
  }

  /** The longitude in the middle, degrees. Set it to centre the map there; a reader's pan changes it, and `chikyu-flat-view` tells the page. */
  get center(): number {
    return this.#view.centerLon;
  }
  set center(lon: number) {
    this.#view = clampView({ ...this.#view, centerLon: lon });
    this.#sync();
    this.#request();
  }

  /** The zoom: 1 shows the whole world, up to 8. */
  get zoom(): number {
    return this.#view.zoom;
  }
  set zoom(value: number) {
    this.#view = clampView({ ...this.#view, zoom: value });
    this.#sync();
    this.#request();
  }

  /** The moment shown, in milliseconds since the Unix epoch. Set it to a number (or a `Date`) to move the clock, or "now" to go live. */
  get time(): number {
    this.#advance(performance.now());
    return this.#time;
  }
  set time(value: number | Date | "now") {
    this.#mode = value === "now" ? "now" : typeof value === "number" ? value : value.getTime();
    this.#time = this.#mode === "now" ? Date.now() : this.#mode;
    this.#last = performance.now();
    // a jump: the dots are placed again at once, from the new moment
    this.#jump = true;
    this.#request();
    this.#schedule();
  }

  /** How fast the clock runs: 1 is real time, 0 holds, 86400 is a day a second, negative runs backwards. */
  get speed(): number {
    return this.#speed;
  }
  set speed(value: number) {
    this.#advance(performance.now());
    this.#speed = Number.isFinite(value) ? value : 1;
    this.#jump = true;
    this.#syncSpeed();
    this.#schedule();
    this.#request();
  }

  /** True while the clock is held with its speed kept (the page's Pause): nothing is drawn but what the reader changes. Setting it false carries on from the moment shown at the same speed. */
  get paused(): boolean {
    return this.#paused;
  }
  set paused(value: boolean) {
    const now = performance.now();
    this.#advance(now);
    if (value === this.#paused) return;
    this.#paused = value;
    // held, the moment stays where it is even in real time (it does not jump to the clock's now when carried on)
    if (value && this.#mode === "now") this.#mode = this.#time;
    this.#last = now;
    this.#jump = true;
    this.#schedule();
    this.#request();
    this.dispatchEvent(new CustomEvent("chikyu-timechange", { detail: { time: this.#time, running: this.#running(), paused: value }, bubbles: true, composed: true }));
  }

  /** The language of the words: the `lang` attribute, else the page's. */
  get language(): FlatLang {
    return (this.getAttribute("lang") ?? this.ownerDocument.documentElement.lang ?? "en").toLowerCase().startsWith("ja") ? "ja" : "en";
  }

  /** The look of the map: `map`, the drawn map of countries (the default), or `photo`, NASA's picture of the Earth with the night side's city lights. The `look` attribute; the pictures are fetched only while the look is `photo`. */
  get look(): FlatLook {
    return this.#look;
  }
  set look(value: FlatLook) {
    this.setAttribute("look", readLook(value));
  }

  /** How the look stands: `map` (the drawn map is chosen), `loading` (the photo is chosen and its picture is on its way, the drawn map shows meanwhile), `photo` (the photo is shown) or `failed` (the picture could not be fetched, the drawn map shows). `chikyu-flat-look` tells the page when it changes. */
  get lookState(): "map" | "loading" | "photo" | "failed" {
    if (this.#look === "map") return "map";
    return this.#photoFailed ? "failed" : this.#photo?.day ? "photo" : "loading";
  }

  /** Counters for a test or a page: draws of the dots, draws of the map, the dots drawn at the last draw, the milliseconds the last draw and the slowest took, and the canvases' size in pixels. */
  get stats(): { draws: number; mapDraws: number; dots: number; lastDrawMs: number; maxDrawMs: number; running: boolean; paused: boolean; fast: boolean; averageDrawMs: number; canvases: { width: number; height: number }[] } {
    const canvases = [this.#mapCanvas, this.#dotCanvas].filter((c): c is HTMLCanvasElement => c !== undefined).map((c) => ({ width: c.width, height: c.height }));
    return { draws: this.#counts.draws, mapDraws: this.#counts.mapDraws, dots: this.#counts.dots, lastDrawMs: this.#counts.lastMs, maxDrawMs: this.#counts.maxMs, running: this.#running(), paused: this.#paused, fast: this.#fast(), averageDrawMs: this.#counts.draws > 0 ? this.#totalMs / this.#counts.draws : 0, canvases };
  }

  /** Where a satellite is on the screen as of the last draw, in CSS pixels from the map's top left, or null when it is not drawn (not loaded, filtered out, off the map or too old). */
  placeOf(id: number): { x: number; y: number; lon: number; lat: number; altitudeKm: number } | null {
    const ref = this.#index.get(id);
    if (!ref || ref.g.on[ref.i] !== 1) return null;
    return { x: ref.g.sx[ref.i]!, y: ref.g.sy[ref.i]!, lon: ref.g.lon[ref.i]!, lat: ref.g.lat[ref.i]!, altitudeKm: ref.g.alt[ref.i]! };
  }

  // --- the element's life ----------------------------------------------------------------------------------------------------------------------

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    adoptStyles(root, CSS, this.getAttribute("nonce") ?? "");
    if (!this.#stage) this.#build(root);
    this.#connected = true;
    this.#readAll();
    this.#advance(performance.now());
    this.#sizer = new ResizeObserver(() => {
      this.#measure();
      this.#request();
    });
    this.#sizer.observe(this.#stage!);
    if (typeof IntersectionObserver === "function") {
      this.#watcher = new IntersectionObserver((entries) => {
        const was = this.#visibleNow();
        this.#inView = entries[entries.length - 1]?.isIntersecting ?? true;
        if (!was && this.#visibleNow()) this.#wake();
      });
      this.#watcher.observe(this);
    }
    document.addEventListener("visibilitychange", this.#onVisibility);
    this.#measure();
    this.#buildBar();
    this.#request();
    this.#schedule();
  }

  disconnectedCallback(): void {
    this.#connected = false;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#sizer?.disconnect();
    this.#watcher?.disconnect();
    this.#sizer = undefined;
    this.#watcher = undefined;
    document.removeEventListener("visibilitychange", this.#onVisibility);
    // the pictures are let go with the element, and fetched again if it comes back
    this.#photo?.dispose();
    this.#photo = null;
  }

  attributeChangedCallback(name: string): void {
    if (!this.#connected) return;
    this.#read(name);
    if (name === "selected" || name === "footprint-elevation") this.#trackKey = "";
    if (name === "lang") {
      this.#showCredit();
      this.#placeMarkButtons();
    }
    if (name === "lang" || name === "controls" || name === "group" || name === "colour-by" || name === "color-by" || name === "home-lon" || name === "home-lat" || name === "plane") this.#buildBar();
    this.#sync();
    this.#request();
    this.#schedule();
  }

  #onVisibility = (): void => {
    if (this.#visibleNow()) this.#wake();
    else {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  };

  #visibleNow(): boolean {
    return this.#connected && this.#inView && !hidden();
  }

  /** Back in sight: bring the clock up to date, draw once, and start the timer again. */
  #wake(): void {
    this.#advance(performance.now());
    this.#jump = true;
    this.#request();
    this.#schedule();
  }

  /** Take in every attribute the element has: when it comes into the page. */
  #readAll(): void {
    for (const name of ChikyuFlat.observedAttributes) this.#read(name);
  }

  /** Take in one attribute. A change to one never undoes what the reader did with another (a chosen satellite, the pan). */
  #read(name: string): void {
    const value = this.getAttribute(name);
    if (name === "center") {
      const lon = finite(value, Number.NaN);
      if (Number.isFinite(lon)) this.#view = clampView({ ...this.#view, centerLon: lon });
      this.#mapKey = "";
    } else if (name === "group") {
      const ids = (value ?? "").split(/[\s,]+/).filter((one) => one !== "" && one.toLowerCase() !== "all");
      this.#shown = ids.length === 0 ? null : new Set(ids);
    } else if (name === "off") this.#off = new Set((value ?? "").split(/[\s,]+/).filter((one) => one !== ""));
    else if (name === "plane") this.#plane = (value ?? "").trim().toUpperCase();
    else if (name === "footprint") this.#footprint = flag(value);
    else if (name === "track") this.#track = flag(value);
    else if (name === "selected") {
      const id = value === null || value.trim() === "" ? null : Number(value);
      this.#selected = id !== null && Number.isFinite(id) ? (this.#index.get(id) ?? null) : null;
    } else if (name === "paused") {
      if (flag(value) !== this.#paused) this.paused = flag(value);
    } else if (name === "time" || name === "speed") this.#readClock();
    else if (name === "estimate-far") for (const g of this.#groups.values()) g.sats.estimateFar = estimateFarOf(value);
    else if (name === "elements-src") this.#load();
    else if (name === "look") this.#setLook(readLook(value));
    else if (name === "texture-base" && this.#photo) {
      this.#photo.dispose();
      this.#photo = this.#makePhoto();
      this.#mapKey = "";
    } else if (name === "shade" || name === "dot-size" || name === "borders" || name === "max-texture") this.#mapKey = "";
  }

  /** Where the pictures are served from: the `texture-base` attribute, else the package's own `textures/` folder beside this file, as for the realistic Earth. */
  #textureBase(): string {
    const base = this.getAttribute("texture-base") ?? new URL("../textures/", import.meta.url).href;
    return base.endsWith("/") ? base : `${base}/`;
  }

  /** The widest picture to hold: the `max-texture` attribute, 4096 at most, and 2048 on a device that reports 2 GB of memory or less. */
  #textureCap(): number {
    const given = Number(this.getAttribute("max-texture"));
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const cap = Number.isFinite(given) && given > 0 ? Math.min(given, 4096) : 4096;
    return memory !== undefined && memory <= 2 ? Math.min(cap, 2048) : cap;
  }

  #makePhoto(): PhotoPictures {
    const again = (): void => {
      this.#mapKey = "";
      this.#request();
      this.#announceLook();
    };
    return new PhotoPictures({
      base: () => this.#textureBase(),
      cap: () => this.#textureCap(),
      changed: again,
      failed: () => {
        this.#photoFailed = true;
        again();
      },
    });
  }

  #setLook(look: FlatLook): void {
    if (look === this.#look && (look === "map" || this.#photo)) return;
    this.#look = look;
    this.#photoFailed = false;
    this.#photo?.dispose();
    this.#photo = look === "photo" ? this.#makePhoto() : null;
    this.#mapKey = "";
    this.#showCredit();
    this.#announceLook();
  }

  /** `chikyu-flat-look`, when the look or how it stands changes. */
  #announceLook(): void {
    const state = this.lookState;
    const key = `${this.#look}/${state}`;
    this.#showCredit();
    if (key === this.#lookSent) return;
    const first = this.#lookSent === "";
    this.#lookSent = key;
    if (!first) this.dispatchEvent(new CustomEvent("chikyu-flat-look", { detail: { look: this.#look, state }, bubbles: true, composed: true }));
  }

  /** NASA's credit line, over the corner of the map while the photo is shown. */
  #showCredit(): void {
    const credit = this.#credit;
    if (!credit) return;
    const on = this.#look === "photo" && this.#photo?.day != null;
    credit.hidden = !on;
    if (!on) return;
    const lang = this.language;
    const line = creditLine([ownCredit("chikyu-pictures", 1)], lang);
    if (credit.textContent !== line) credit.textContent = line;
    credit.lang = lang;
  }

  #readClock(): void {
    this.#advance(performance.now());
    this.#mode = readTime(this.getAttribute("time"));
    this.#time = this.#mode === "now" ? Date.now() : this.#mode;
    const raw = this.getAttribute("speed");
    const speed = raw === null || raw.trim() === "" ? 1 : Number(raw);
    this.#speed = Number.isFinite(speed) ? speed : 1;
    this.#last = performance.now();
    this.#jump = true;
    this.#syncSpeed();
  }

  /** How far apart the two SGP4 batches are, so a fast clock does not run SGP4 more than once a (game) second. */
  #syncSpeed(): void {
    const step = Math.max(1000, Math.abs(this.#speed) * 1000);
    for (const g of this.#groups.values()) g.sats.setStep(step);
  }

  #defaultId(): string {
    return (this.getAttribute("group") ?? "").split(/[\s,]+/).find((one) => one !== "" && one.toLowerCase() !== "all") ?? "satellites";
  }

  #load(): void {
    const address = this.getAttribute("elements-src");
    if (!address || address === this.#loaded) return;
    this.#loaded = address;
    const turn = (this.#fetch += 1);
    this.#waiting = true;
    this.#showMessage();
    // one polite request when the element comes into the page: fetchElements keeps the answer and leaves a source that failed alone, and nothing here asks again
    void fetchElements(address).then(
      (got) => {
        if (turn === this.#fetch) this.elements = got.sets;
      },
      (error: unknown) => {
        if (turn !== this.#fetch) return;
        this.#waiting = false;
        this.#problem = error instanceof Error ? error.message : "no answer";
        this.#showMessage();
      },
    );
  }

  // --- the clock -------------------------------------------------------------------------------------------------------------------------------

  #advance(now: number): void {
    if (this.#paused || this.#speed === 0) {
      // held: the moment stays
    } else if (this.#speed === 1 && this.#mode === "now") this.#time = Date.now();
    else this.#time += (now - this.#last) * this.#speed;
    this.#last = now;
  }

  /** The clock is running and the element is in sight: it asks for frames. A held clock, a hidden tab and a view out of sight ask for none. */
  #running(): boolean {
    return this.#visibleNow() && this.#speed !== 0 && !this.#paused;
  }

  /** Is the clock fast enough that SGP4 cannot be run for every frame (the satellites turn along their orbits and are drawn as streaks)? */
  #fast(): boolean {
    return !this.#paused && Math.abs(this.#speed) > MAX_SATELLITE_SPEED;
  }

  /**
   * How often a running clock draws: as often as a satellite in a low orbit (about 0.07 degree of the map a second) moves half a pixel, up to every frame, and at least once a second; once a second at most for a reader who asked for reduced motion.
   * With nothing to show, the pace of the night's edge (the Earth turns 0.004 degree a second).
   */
  #rate(): number {
    const k = pixelsPerDegree(this.#view.width > 0 ? this.#view : { ...this.#view, width: 600, height: 300 });
    const dots = this.#shownGroups().length > 0;
    let perSecond = ((dots ? 0.07 : 0.0042) * Math.abs(this.#speed) * k) / 0.5;
    perSecond = Math.min(60, Math.max(dots ? 1 : 1 / 30, perSecond));
    if (prefersLessMotion()) perSecond = Math.min(perSecond, 1);
    return perSecond;
  }

  /** After a draw, or when something about the clock changed: ask for the next frame in time, a frame a time at the pace `#rate` gives, by a timer when frames are far apart. Nothing at all when the clock is held or out of sight. */
  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.#running()) return;
    const wait = 1000 / this.#rate() - (performance.now() - this.#lastDraw);
    if (wait > 14) {
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        this.#request();
      }, wait);
    } else this.#request();
  }

  /** `chikyu-timechange`: the moment shown, at most four times a second while time runs. */
  #announceTime(): void {
    const now = performance.now();
    if (!this.#running() || now - this.#announced < TIME_EVENT_MS) return;
    this.#announced = now;
    this.dispatchEvent(new CustomEvent("chikyu-timechange", { detail: { time: this.#time, running: true, paused: false }, bubbles: true, composed: true }));
  }

  // --- drawing ---------------------------------------------------------------------------------------------------------------------------------

  /** Ask for one draw at the next frame, however many reasons there are. Nothing is asked for out of sight or in a hidden tab: the draw is made when the element comes back. */
  #request(): void {
    if (!this.#connected) return;
    // out of sight or in a hidden tab nothing is asked for: `#wake` draws once when the element comes back
    if (!this.#visibleNow()) return;
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#draw();
    });
  }

  #shownGroups(): Group[] {
    const out: Group[] = [];
    for (const g of this.#groups.values()) if (this.#shown === null ? !this.#off.has(g.id) : this.#shown.has(g.id)) out.push(g);
    return out;
  }

  /** The plane letter the filter keeps, when exactly one group is on show and it has that plane. */
  #planeIndex(groups: readonly Group[]): number {
    if (this.#plane === "" || groups.length !== 1) return -1;
    return groups[0]!.clusters.planes.find((one) => one.id === this.#plane)?.index ?? -1;
  }

  #byPlane(groups: readonly Group[]): boolean {
    const by = (this.getAttribute("colour-by") ?? this.getAttribute("color-by") ?? "group").trim().toLowerCase();
    return by === "plane" && groups.some((g) => g.clusters.clustered);
  }

  #measure(): void {
    const stage = this.#stage;
    if (!stage) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    // the canvases stay inside 6 million pixels and 4096 a side, whatever the screen
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 3, width > 0 && height > 0 ? Math.sqrt(6_000_000 / (width * height)) : 3, width > 0 || height > 0 ? 4096 / Math.max(width, height) : 3));
    if (width === this.#view.width && height === this.#view.height && dpr === this.#dpr) return;
    this.#dpr = dpr;
    this.#view = clampView({ ...this.#view, width, height });
    this.#syncLegend();
    for (const canvas of [this.#mapCanvas, this.#dotCanvas]) {
      if (!canvas) continue;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    }
    this.#mapKey = "";
  }

  #colours(): { sea: string; land: string; line: string; night: string; grid: string } {
    const style = getComputedStyle(this);
    const pick = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
    return { sea: pick("--chikyu-flat-sea", "#0b1830"), land: pick("--chikyu-flat-land", "#1d3557"), line: pick("--chikyu-flat-line", "#46628a"), night: pick("--chikyu-flat-night", "rgba(2,6,18,0.16)"), grid: "rgba(150,180,220,0.13)" };
  }

  #projection(): ReturnType<typeof geoEquirectangular> {
    const v = this.#view;
    const k = pixelsPerDegree(v);
    return geoEquirectangular()
      .rotate([-v.centerLon, 0])
      .scale(k / RAD)
      .translate([v.width / 2, v.height / 2 + v.centerLat * k])
      .precision(0.4);
  }

  #drawMap(ms: number): void {
    const canvas = this.#mapCanvas;
    const v = this.#view;
    if (!canvas || v.width === 0) return;
    const sun = subsolarPoint(ms);
    const shade = this.getAttribute("shade") !== "off";
    const home = this.#home();
    const pictures = this.#look === "photo" ? this.#photo : null;
    pictures?.want(360 * pixelsPerDegree(v) * this.#dpr);
    const photo = pictures?.day ? pictures : null;
    // the map is drawn again only when the view, the home or the sun's place (about a quarter of a degree, half a degree over a photo, which costs more) changed
    const c = this.#colours();
    const per = photo ? 2 : 4;
    const key = [v.width, v.height, this.#dpr, v.centerLon.toFixed(3), v.centerLat.toFixed(3), v.zoom.toFixed(3), shade ? Math.round(sun.lon * per) : "x", shade ? Math.round(sun.lat * per) : "x", home ? `${home.lon},${home.lat}` : "", c.sea, c.land, c.line, c.night, photo ? `${photo.day!.width}/${photo.night?.width ?? 0}/${this.getAttribute("borders") === "off" ? "x" : "b"}` : "m"].join("|");
    if (key === this.#mapKey) return;
    this.#mapKey = key;
    this.#markAt = { sun: null, home: null };
    this.#counts.mapDraws += 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    ctx.fillStyle = c.sea;
    ctx.fillRect(0, 0, v.width, v.height);
    const projection = this.#projection();
    const path = geoPath(projection, ctx);
    if (photo) {
      // NASA's picture on the map, the borders thin and pale on it, then the night (the darkening and the city lights) over both
      paintPhoto(ctx, v, photo, shade ? sun : null, this.getAttribute("borders") === "off" ? null : () => {
        ctx.beginPath();
        path(COUNTRIES as never);
        ctx.strokeStyle = "rgba(255,255,255,0.32)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      });
    } else {
      ctx.beginPath();
      path(geoGraticule10());
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      path(COUNTRIES as never);
      ctx.fillStyle = c.land;
      ctx.fill();
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    if (shade) {
      // the night side: four bands from the sunset line towards midnight, each a little darker
      const anti: [number, number] = [wrapLongitude(sun.lon + 180), -sun.lat];
      ctx.fillStyle = c.night;
      for (const radius of photo ? [] : [90, 96, 102, 108]) {
        ctx.beginPath();
        path(geoCircle().center(anti).radius(radius).precision(2)());
        ctx.fill();
      }
      const at = projectFlat(v, sun.lon, sun.lat);
      const spot: MarkSpot = { xs: [], y: at.y, lon: sun.lon, lat: sun.lat };
      for (const x of [at.x, at.x - 360 * pixelsPerDegree(v), at.x + 360 * pixelsPerDegree(v)]) {
        if (x < -8 || x > v.width + 8) continue;
        spot.xs.push(x);
        ctx.beginPath();
        ctx.arc(x, at.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd54f";
        ctx.fill();
        // over a photo the dot has a dark edge and a pale ring round it, so it reads on cloud, desert and sea
        ctx.lineWidth = photo ? 2 : 1;
        ctx.strokeStyle = photo ? "rgba(0,0,0,.75)" : "rgba(0,0,0,.5)";
        ctx.stroke();
        if (photo) {
          ctx.beginPath();
          ctx.arc(x, at.y, 6.8, 0, Math.PI * 2);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,.85)";
          ctx.stroke();
        }
        ctx.fillStyle = c.night;
      }
      if (spot.xs.length > 0) this.#markAt.sun = spot;
    }
    if (home) {
      const at = projectFlat(v, home.lon, home.lat);
      const wrap = 360 * pixelsPerDegree(v);
      const spot: MarkSpot = { xs: [], y: at.y, lon: home.lon, lat: home.lat };
      for (const x of [at.x, at.x - wrap, at.x + wrap]) {
        if (x < -10 || x > v.width + 10) continue;
        spot.xs.push(x);
        ctx.save();
        ctx.translate(x, at.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#0b1830";
        ctx.lineWidth = 2;
        ctx.strokeRect(-4.5, -4.5, 9, 9);
        ctx.fillRect(-4.5, -4.5, 9, 9);
        ctx.restore();
      }
      if (spot.xs.length > 0) this.#markAt.home = spot;
    }
    this.#placeMarkButtons();
    this.#syncLegend();
  }

  #home(): { lon: number; lat: number } | null {
    const lon = finite(this.getAttribute("home-lon"), Number.NaN);
    const lat = finite(this.getAttribute("home-lat"), Number.NaN);
    return Number.isFinite(lon) && Number.isFinite(lat) ? { lon: wrapLongitude(lon), lat } : null;
  }

  #draw(): void {
    const started = performance.now();
    const canvas = this.#dotCanvas;
    const v = this.#view;
    if (!canvas || v.width === 0 || v.height === 0) return;
    this.#advance(started);
    const ms = this.#time;
    const gmst = greenwichSidereal(ms);
    this.#drawMap(ms);
    // a canvas the processor draws, not the graphics card: thousands of small shapes a frame are quicker that way (a machine with no graphics card, or drawing in software, ran 1 frame a second against 60) and the picture is small
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    ctx.clearRect(0, 0, v.width, v.height);
    const groups = this.#shownGroups();
    const k = pixelsPerDegree(v);
    const wrapPx = 360 * k;
    const planeAt = this.#planeIndex(groups);
    const byPlane = this.#byPlane(groups);
    const total = groups.reduce((sum, g) => sum + g.n, 0);
    const size = finite(this.getAttribute("dot-size"), 0);
    const r = size > 0 ? size / 2 : total > 5000 ? 1.1 : total > 1500 ? 1.5 : total > 300 ? 2 : 3;
    const radius = r * Math.min(1.8, 0.85 + v.zoom * 0.15);
    const pad = radius + 1;
    const buckets = this.#buckets;
    for (const list of buckets.values()) list.length = 0;
    const streaks = this.#streaks;
    for (const list of streaks.values()) list.length = 0;
    // a clock too fast for SGP4 to run for every frame: the satellites are turned along their orbits from a pinned place (SGP4 itself a slice of the group a frame, the whole group once a second) and drawn as streaks
    const fast = this.#fast();
    const streak = fast && this.getAttribute("trails") !== "off";
    const dtReal = this.#lastDraw === 0 ? 16 : Math.min(1000, Math.max(0, started - this.#lastDraw));
    const chosen = this.#selected;
    const streakPx = total > 3000 ? STREAK_PX_CROWD : STREAK_PX;
    let dots = 0;
    for (const g of groups) {
      if (fast) {
        g.seg ??= new Float32Array(g.n * 6);
        if (this.#jump) {
          g.sats.pin(ms);
          g.cursor = 0;
        } else {
          const slice = Math.max(1, Math.ceil(g.n * (dtReal / 1000)));
          g.sats.pin(ms, g.cursor, slice);
          g.cursor = g.cursor + slice >= g.n ? 0 : g.cursor + slice;
        }
        g.sats.arc(ms, this.#speed * 1000 * STREAK_SECONDS, g.buf, g.seg, (streakPx / k) * RAD);
      } else g.sats.at(ms, g.buf);
      // the chosen satellite is always where SGP4 puts it, to the frame
      if (chosen && chosen.g === g && g.sats.exact(chosen.i, ms, this.#exact)) {
        g.buf[chosen.i * 3] = this.#exact[0]!;
        g.buf[chosen.i * 3 + 1] = this.#exact[1]!;
        g.buf[chosen.i * 3 + 2] = this.#exact[2]!;
      }
      const { buf, lon, lat, alt, sx, sy, on, sats, seg } = g;
      const planeOf = g.clusters.planeOf;
      const dimmed = sats.dimmed;
      for (let i = 0; i < g.n; i += 1) {
        on[i] = 0;
        if (!sats.visible(i)) continue;
        if (planeAt >= 0 && planeOf[i] !== planeAt) continue;
        const x = buf[i * 3]!;
        const y = buf[i * 3 + 1]!;
        const z = buf[i * 3 + 2]!;
        const rr = Math.sqrt(x * x + y * y + z * z);
        const longitude = wrapLongitude((Math.atan2(-z, x) / RAD) - gmst);
        const latitude = (Math.atan(Math.tan(Math.asin(y / rr)) / FLATTENED)) / RAD;
        lon[i] = longitude;
        lat[i] = latitude;
        alt[i] = (rr - 1) * 6371;
        const px = v.width / 2 + wrapLongitude(longitude - v.centerLon) * k;
        const py = v.height / 2 - (latitude - v.centerLat) * k;
        if (py < -pad || py > v.height + pad || px < -pad || px > v.width + pad) {
          // the world is wider than the box when the box is wide, and the dot may be in view at the other copy of the world
          if (px < -pad && px + wrapPx <= v.width + pad && py >= -pad && py <= v.height + pad) {
            sx[i] = px + wrapPx;
          } else if (px > v.width + pad && px - wrapPx >= -pad && py >= -pad && py <= v.height + pad) {
            sx[i] = px - wrapPx;
          } else continue;
        } else sx[i] = px;
        sy[i] = py;
        on[i] = 1;
        dots += 1;
        const colour = byPlane ? (planeOf[i]! >= 0 ? PLANE_COLOURS[planeOf[i]! % PLANE_COLOURS.length]! : SPARE_COLOUR) : g.colour;
        const key = dimmed[i]! > 0 ? `${colour}~` : colour;
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(sx[i]!, py);
        // a dot on the map's edge is drawn again at the other side, so it wraps cleanly
        if (sx[i]! < pad && sx[i]! + wrapPx < v.width + pad) list.push(sx[i]! + wrapPx, py);
        else if (sx[i]! > v.width - pad && sx[i]! - wrapPx > -pad) list.push(sx[i]! - wrapPx, py);
        if (streak && seg) {
          // where it was a moment ago, on the same turn of the map as the dot
          const j = i * 6;
          const bx = seg[j]!;
          const by = seg[j + 1]!;
          const bz = seg[j + 2]!;
          const br = Math.sqrt(bx * bx + by * by + bz * bz);
          if (br > 0) {
            const lon0 = (Math.atan2(-bz, bx) / RAD) - gmst;
            const lat0 = Math.atan(Math.tan(Math.asin(by / br)) / FLATTENED) / RAD;
            const x0 = sx[i]! + wrapLongitude(lon0 - longitude) * k;
            const y0 = v.height / 2 - (lat0 - v.centerLat) * k;
            if (Math.abs(x0 - sx[i]!) < streakPx * 2 && Math.abs(y0 - py) < streakPx * 2) {
              let trail = streaks.get(colour);
              if (!trail) streaks.set(colour, (trail = []));
              trail.push(x0, y0, sx[i]!, py);
            }
          }
        }
      }
    }
    // the coverage circles and the track, under the dots
    this.#drawOver(ctx, groups, ms);
    if (streak) {
      // a butt cap and a hairline for a crowd: thousands of round, wide strokes cost the rasteriser more than the whole of the rest of the draw
      ctx.lineCap = "butt";
      ctx.lineWidth = total > 3000 ? 1 : Math.max(1, radius * 1.4);
      ctx.globalAlpha = 0.7;
      for (const [colour, list] of streaks) {
        if (list.length === 0) continue;
        ctx.strokeStyle = colour;
        ctx.beginPath();
        for (let j = 0; j < list.length; j += 4) {
          ctx.moveTo(list[j]!, list[j + 1]!);
          ctx.lineTo(list[j + 2]!, list[j + 3]!);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // over a photo each dot has a dark rim, so it reads on white cloud and on pale desert alike
    const rim = this.#look === "photo" && this.#photo?.day != null;
    for (const [key, list] of buckets) {
      if (list.length === 0) continue;
      const faint = key.endsWith("~");
      for (const pass of rim ? [true, false] : [false]) {
        const grown = pass ? radius + 1 : radius;
        ctx.fillStyle = pass ? "rgba(4,8,18,0.7)" : faint ? key.slice(0, -1) : key;
        ctx.globalAlpha = faint ? 0.45 : 1;
        if (grown <= 1.7) {
          const side = grown * 2;
          for (let j = 0; j < list.length; j += 2) ctx.fillRect(list[j]! - grown, list[j + 1]! - grown, side, side);
        } else {
          ctx.beginPath();
          for (let j = 0; j < list.length; j += 2) {
            ctx.moveTo(list[j]! + grown, list[j + 1]!);
            ctx.arc(list[j]!, list[j + 1]!, grown, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    // the key names the faint dots (old orbit data) only while there are some
    const faint = [...buckets].some(([colour, list]) => list.length > 0 && colour.endsWith("~"));
    if (faint !== this.#faint) {
      this.#faint = faint;
      this.#syncLegend();
    }
    this.#counts.draws += 1;
    this.#counts.dots = dots;
    this.#placeMarks();
    this.#showMessage(dots, groups.length);
    this.#jump = false;
    this.#lastDraw = started;
    const took = performance.now() - started;
    this.#totalMs += took;
    this.#counts.lastMs = took;
    if (took > this.#counts.maxMs) this.#counts.maxMs = took;
    this.#announceView();
    this.#announceTime();
    this.#schedule();
  }

  /** The footprints and the ground track, drawn before the dots so the dots lie on them. */
  #drawOver(ctx: CanvasRenderingContext2D, groups: readonly Group[], ms: number): void {
    const wantFootprint = this.#footprint;
    const wantTrack = this.#track;
    const chosen = this.#selected && this.#selected.g.on[this.#selected.i] === 1 ? this.#selected : null;
    if (!wantFootprint && !(wantTrack && chosen)) {
      this.#showKey(false);
      return;
    }
    const path = geoPath(this.#projection(), ctx);
    if (wantFootprint) {
      const elevation = finite(this.getAttribute("footprint-elevation"), BEAM_ELEVATION);
      const one = (g: Group, i: number): void => {
        const angle = footprintAngle(g.alt[i]!, elevation) / RAD;
        if (!(angle > 0)) return;
        ctx.beginPath();
        path(geoCircle().center([g.lon[i]!, g.lat[i]!]).radius(angle).precision(3)());
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fill();
        const onPhoto = this.#look === "photo" && this.#photo?.day != null;
        if (onPhoto) {
          ctx.strokeStyle = "rgba(4,8,18,0.55)";
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.strokeStyle = onPhoto ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      if (chosen) one(chosen.g, chosen.i);
      else {
        let shown = 0;
        for (const g of groups) shown += g.on.reduce((sum, flagged) => sum + flagged, 0);
        if (shown <= FOOTPRINT_MAX) for (const g of groups) for (let i = 0; i < g.n; i += 1) if (g.on[i] === 1) one(g, i);
      }
    }
    if (wantTrack && chosen) {
      const lines = this.#trackOf(chosen, ms);
      if (lines) {
        const colours = this.#trackColours();
        // each stretch is drawn over a dark edge, so it reads on a dark sea and on a light one; the part behind the satellite is dashed, the part ahead solid
        const stroke = (runs: readonly TrackRun[], dash: number[], sun: boolean): void => {
          ctx.setLineDash(dash);
          for (const run of runs) {
            if (run.sunlit !== sun || run.points.length < 2) continue;
            ctx.beginPath();
            path({ type: "LineString", coordinates: run.points });
            ctx.stroke();
          }
        };
        for (const pass of [0, 1] as const) {
          ctx.lineCap = "butt";
          for (const [runs, dash] of [[lines.past, [4, 4]], [lines.future, []]] as const) {
            for (const sun of [true, false]) {
              ctx.lineWidth = pass === 0 ? 4 : 2;
              ctx.strokeStyle = pass === 0 ? "rgba(4,8,18,0.55)" : sun ? colours.sun : colours.shadow;
              stroke(runs, [...dash], sun);
            }
          }
        }
        ctx.setLineDash([]);
      }
    }
    this.#showKey(wantTrack && chosen !== null);
  }

  /** The colours of the ground track: amber in sunlight, blue in the Earth's shadow, or the page's own (`--chikyu-flat-track-sun`, `--chikyu-flat-track-shadow`). */
  #trackColours(): { sun: string; shadow: string } {
    const style = getComputedStyle(this);
    return { sun: style.getPropertyValue("--chikyu-flat-track-sun").trim() || TRACK_SUNLIT, shadow: style.getPropertyValue("--chikyu-flat-track-shadow").trim() || TRACK_SHADOW };
  }

  /** The key to the track's two colours, shown while the track is. It changes only when the track appears or goes, or the language does. */
  #showKey(wanted: boolean): void {
    const key = this.#key;
    if (!key) return;
    const on = wanted && !(this.#wants().has("key") && this.#legendIsOpen());
    if (key.hidden === !on && (!on || key.lang === this.language)) return;
    key.hidden = !on;
    if (!on) return;
    const lang = this.language;
    const colours = this.#trackColours();
    key.lang = lang;
    key.setAttribute("aria-label", say(lang, "trackKey"));
    key.replaceChildren(...[["trackSunlit", colours.sun], ["trackShadow", colours.shadow]].map(([word, colour]) => {
      const item = key.ownerDocument.createElement("span");
      const line = key.ownerDocument.createElement("i");
      line.style.setProperty("--k", colour!);
      item.append(line, say(lang, word!));
      return item;
    }));
  }

  /** The ground track of the chosen satellite for one orbit, half behind it and half ahead, worked out again when the clock has moved a fortieth of an orbit. */
  #trackOf(ref: Ref, ms: number): { past: TrackRun[]; future: TrackRun[] } | null {
    const set = ref.g.sats.sets[ref.i];
    if (!set) return null;
    const shape = orbitShape(set.MEAN_MOTION, set.ECCENTRICITY);
    if (!shape) return null;
    const period = shape.periodMinutes * 60_000;
    // worked out again when the clock has moved a fortieth of an orbit, and, at a fast clock, once a (real) second: it would flicker if it were drawn for every frame
    const every = Math.max(period / 40, this.#fast() ? Math.abs(this.#speed) * 1000 : 0);
    const key = `${set.NORAD_CAT_ID}:${Math.round(ms / every)}`;
    if (key !== this.#trackKey || !this.#trackLines) {
      this.#trackKey = key;
      const step = Math.max(5, period / 1000 / 160);
      const points = groundTrack(set, ms - period / 2, ms + period / 2, step);
      this.#trackLines = { past: trackRuns(points.filter((p) => p.ms <= ms)), future: trackRuns(points.filter((p) => p.ms >= ms)) };
    }
    return this.#trackLines;
  }

  #announceView(): void {
    const v = this.#view;
    const key = `${v.centerLon.toFixed(2)},${v.centerLat.toFixed(2)},${v.zoom.toFixed(2)}`;
    if (key === this.#viewSent) return;
    const first = this.#viewSent === "";
    this.#viewSent = key;
    if (!first) this.dispatchEvent(new CustomEvent("chikyu-flat-view", { detail: { center: v.centerLon, zoom: v.zoom }, bubbles: true, composed: true }));
  }

  /** The rings round the chosen and the hovered satellite, and the name beside the one pointed at: a few DOM nodes moved, so they never ask for a draw of the dots. */
  #placeMarks(): void {
    const mark = (ring: HTMLElement | undefined, ref: Ref | null): { x: number; y: number } | null => {
      if (!ring) return null;
      if (!ref || ref.g.on[ref.i] !== 1) {
        ring.hidden = true;
        return null;
      }
      const x = ref.g.sx[ref.i]!;
      const y = ref.g.sy[ref.i]!;
      ring.hidden = false;
      ring.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      return { x, y };
    };
    const picked = this.#cursor ?? this.#selected;
    const at = mark(this.#selRing, picked);
    const over = mark(this.#hovRing, this.#hover && !sameRef(this.#hover, picked) ? this.#hover : null);
    const tip = this.#tip;
    if (!tip) return;
    // a satellite pointed at is named first, then a mark pointed at, then a mark pressed or reached by the keyboard, then the satellite chosen
    const named = this.#hover ? null : (this.#markHover ?? this.#markShown);
    const spot = named ? this.#markAt[named] : null;
    const ref = this.#hover ?? picked;
    const where = spot && named ? { x: spot.xs[0]!, y: spot.y } : this.#hover ? (over ?? at) : at;
    if (!where || (!spot && (!ref || ref.g.on[ref.i] !== 1))) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.textContent = spot && named ? this.#markText(named) : this.#describe(ref!);
    const wide = tip.offsetWidth;
    const left = where.x + 14 + wide > this.#view.width ? Math.max(0, where.x - 14 - wide) : where.x + 14;
    const top = Math.max(0, Math.min(this.#view.height - tip.offsetHeight, where.y - 10));
    tip.style.transform = `translate(${left.toFixed(1)}px,${top.toFixed(1)}px)`;
  }

  // --- the marks that name themselves ------------------------------------------------------------------------------------------------------------

  /** What a mark says about itself, in the page's language: what it is, what it is over, and where. Worked out once for each place (to a degree). */
  #markText(mark: Mark): string {
    const spot = this.#markAt[mark];
    if (!spot) return "";
    const lang = this.language;
    const id = `${mark}|${lang}|${Math.round(spot.lon)}|${Math.round(spot.lat)}`;
    let text = this.#markNames.get(id);
    if (text === undefined) {
      const what = say(lang, mark === "sun" ? "sunMark" : "homeMark");
      const point = pointText(spot.lon, spot.lat, lang);
      const place = placeOver(spot.lon, spot.lat, lang);
      text = place ? say(lang, mark === "sun" ? "sunOver" : "homeOver", { what, place, point }) : say(lang, mark === "sun" ? "sunAt" : "homeAt", { what, point });
      if (this.#markNames.size > 40) this.#markNames.clear();
      this.#markNames.set(id, text);
    }
    return text;
  }

  /** Of a satellite and a mark both within reach of a point, the one nearer it: a mark pointed at straight is not lost to a satellite that happens to be close. Returns the mark to use, or null when the satellite is to be. */
  #markOver(hit: Ref | null, x: number, y: number, reach: number): Mark | null {
    const mark = this.#markHit(x, y, reach);
    if (!mark || !hit) return mark;
    const spot = this.#markAt[mark]!;
    const away = Math.min(...spot.xs.map((at) => Math.hypot(at - x, spot.y - y)));
    return away < Math.hypot(hit.g.sx[hit.i]! - x, hit.g.sy[hit.i]! - y) ? mark : null;
  }

  /** The mark painted within `reach` pixels of a point, or null. */
  #markHit(x: number, y: number, reach: number): Mark | null {
    for (const mark of ["sun", "home"] as const) {
      const spot = this.#markAt[mark];
      if (spot && Math.abs(spot.y - y) <= reach && spot.xs.some((at) => Math.hypot(at - x, spot.y - y) <= reach)) return mark;
    }
    return null;
  }

  /** A press on a mark, with a finger, a mouse or the keyboard: its name stays beside it (a finger has no pointer to hover), it is read aloud, and the page is told with `chikyu-flat-mark`. */
  #pressMark(mark: Mark, via: "tap" | "key"): void {
    const spot = this.#markAt[mark];
    if (!spot) return;
    this.#markShown = mark;
    this.#placeMarks();
    const lang = this.language;
    const text = this.#markText(mark);
    if (this.#live) this.#live.textContent = text;
    this.dispatchEvent(new CustomEvent("chikyu-flat-mark", { detail: { mark, name: say(lang, mark === "sun" ? "sunMark" : "homeMark"), text, lon: spot.lon, lat: spot.lat, place: placeOver(spot.lon, spot.lat, lang), via }, bubbles: true, composed: true }));
  }

  /** The keyboard's way to the marks: a button over each, with its name, that takes no pointer. Moved when the map is drawn. */
  #placeMarkButtons(): void {
    const lang = this.language;
    for (const mark of ["sun", "home"] as const) {
      const button = this.#markButtons[mark];
      const spot = this.#markAt[mark];
      if (!button) continue;
      button.hidden = !spot;
      if (!spot) {
        if (this.#markShown === mark) this.#markShown = null;
        continue;
      }
      button.style.transform = `translate(${spot.xs[0]!.toFixed(1)}px,${spot.y.toFixed(1)}px)`;
      button.setAttribute("aria-label", this.#markText(mark));
      button.lang = lang;
    }
  }

  /** The key under the map: every mark the map draws now, each with the picture of it and its name. Made again only when what is drawn, the words or the fold change. */
  #syncLegend(): void {
    const box = this.#legend;
    if (!box) return;
    const lang = this.language;
    const wants = this.#wants().has("key");
    box.hidden = !wants;
    if (!wants) return;
    const open = this.#legendIsOpen();
    const shade = this.getAttribute("shade") !== "off";
    const photo = this.#look === "photo" && this.#photo?.day != null;
    const shown = this.#shownGroups();
    const byPlane = this.#byPlane(shown);
    const chosen = this.#selected !== null;
    const entries: { glyph: string; text: string; colours?: string[] }[] = [];
    if (shade) entries.push({ glyph: "sun", text: say(lang, "keySun") });
    if (this.#home()) entries.push({ glyph: "home", text: say(lang, "keyHome") });
    if (shown.length > 0) entries.push({ glyph: "sat", text: say(lang, byPlane ? "keySatPlane" : "keySatGroup"), colours: byPlane ? PLANE_COLOURS.slice(0, 3) : shown.slice(0, 3).map((g) => g.colour) });
    if (this.#faint) entries.push({ glyph: "faint", text: say(lang, "keyFaint") });
    if (chosen) entries.push({ glyph: "chosen", text: say(lang, "keyRing") });
    if (this.#footprint) entries.push({ glyph: "footprint", text: say(lang, "keyFootprint") });
    if (this.#track && chosen) {
      const colours = this.#trackColours();
      entries.push({ glyph: "line", text: say(lang, "trackSunlit"), colours: [colours.sun] }, { glyph: "line", text: say(lang, "trackShadow"), colours: [colours.shadow] });
    }
    if (shade) entries.push({ glyph: photo ? "night-photo" : "night", text: say(lang, photo ? "keyNightPhoto" : "keyNight") });
    const key = JSON.stringify([lang, open, entries]);
    if (key === this.#legendKey) return;
    this.#legendKey = key;
    const d = box.ownerDocument;
    const toggle = d.createElement("button");
    toggle.type = "button";
    toggle.dataset["act"] = "key";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-controls", "legend-list");
    toggle.setAttribute("aria-label", say(lang, open ? "keyHide" : "keyShow"));
    toggle.textContent = `${say(lang, "key")} ${open ? "▾" : "▸"}`;
    const list = d.createElement("ul");
    list.id = "legend-list";
    list.setAttribute("aria-label", say(lang, "keyMarks"));
    list.hidden = !open;
    for (const entry of entries) {
      const item = d.createElement("li");
      const glyph = d.createElement("span");
      glyph.className = `g ${entry.glyph}`;
      glyph.setAttribute("aria-hidden", "true");
      for (const colour of entry.colours ?? []) {
        const dot = d.createElement("i");
        dot.style.setProperty("--c", colour);
        glyph.append(dot);
      }
      item.append(glyph, entry.text);
      list.append(item);
    }
    box.replaceChildren(toggle, list);
    box.lang = lang;
  }

  /** Whether the key's list is open: what the reader chose, else open on a wide map and shut on a narrow one. */
  #legendIsOpen(): boolean {
    return this.#legendOpen ?? this.#view.width >= 600;
  }

  /** The key folded open or shut. A property so a page can set it; the reader's button does the same. */
  get keyOpen(): boolean {
    return this.#legendIsOpen();
  }
  set keyOpen(value: boolean) {
    this.#legendOpen = Boolean(value);
    this.#syncLegend();
    this.#request();
  }

  #nameOf(ref: Ref): string {
    const set = ref.g.sats.sets[ref.i]!;
    return SHORT_NAMES[set.NORAD_CAT_ID]?.[this.language] ?? set.OBJECT_NAME;
  }

  #planeOfRef(ref: Ref): string | null {
    const p = ref.g.clusters.planeOf[ref.i] ?? -1;
    return p >= 0 ? (ref.g.clusters.planes[p]?.id ?? null) : null;
  }

  #describe(ref: Ref): string {
    const lang = this.language;
    const plane = this.#planeOfRef(ref);
    return say(lang, "announce", { name: this.#nameOf(ref), group: lang === "ja" ? ref.g.labelJa : ref.g.label, altitude: Math.round(ref.g.alt[ref.i]!).toLocaleString(lang) }) + (plane && ref.g.clusters.clustered && this.#byPlane([ref.g]) ? say(lang, "announcePlane", { id: plane }) : "");
  }

  #showMessage(dots = -1, shown = this.#shownGroups().length): void {
    const msg = this.#msg;
    if (!msg) return;
    const lang = this.language;
    if (this.#problem) msg.textContent = say(lang, "unreadable", { why: this.#problem });
    else if (this.#groups.size === 0) msg.textContent = say(lang, this.#waiting || this.hasAttribute("elements-src") ? "waiting" : "nothing");
    else msg.textContent = dots === 0 && shown > 0 ? say(lang, "nothing") : "";
  }

  // --- the controls ----------------------------------------------------------------------------------------------------------------------------

  #build(root: ShadowRoot): void {
    const d = root.ownerDocument;
    const bar = Object.assign(d.createElement("div"), { className: "bar" });
    bar.addEventListener("click", this.#onBar);
    const stage = Object.assign(d.createElement("div"), { className: "stage" });
    const map = Object.assign(d.createElement("canvas"), { className: "map" });
    map.setAttribute("aria-hidden", "true");
    const dots = Object.assign(d.createElement("canvas"), { className: "dots", tabIndex: 0 });
    dots.setAttribute("role", "application");
    const selRing = Object.assign(d.createElement("div"), { className: "ring sel", hidden: true });
    const hovRing = Object.assign(d.createElement("div"), { className: "ring hov", hidden: true });
    const tip = Object.assign(d.createElement("div"), { className: "tip", hidden: true });
    tip.setAttribute("aria-hidden", "true");
    const msg = Object.assign(d.createElement("p"), { className: "msg" });
    msg.setAttribute("role", "status");
    const key = Object.assign(d.createElement("p"), { className: "key", hidden: true });
    key.setAttribute("role", "group");
    const credit = Object.assign(d.createElement("p"), { className: "credit", hidden: true });
    const legend = Object.assign(d.createElement("div"), { className: "legend", hidden: true });
    legend.setAttribute("role", "group");
    legend.addEventListener("click", this.#onLegend);
    const marks = (["sun", "home"] as const).map((mark) => {
      const button = Object.assign(d.createElement("button"), { className: "mark", type: "button", hidden: true });
      button.dataset["mark"] = mark;
      button.addEventListener("focus", () => {
        this.#markShown = mark;
        this.#placeMarks();
        if (this.#live) this.#live.textContent = this.#markText(mark);
      });
      button.addEventListener("blur", () => {
        if (this.#markShown !== mark) return;
        this.#markShown = null;
        this.#placeMarks();
      });
      button.addEventListener("click", () => this.#pressMark(mark, "key"));
      this.#markButtons[mark] = button;
      return button;
    });
    const live = Object.assign(d.createElement("p"), { className: "sr", id: "live" });
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    const help = Object.assign(d.createElement("p"), { className: "sr", id: "help" });
    dots.setAttribute("aria-describedby", "help live");
    stage.append(map, dots, selRing, hovRing, tip, ...marks, key, credit, msg);
    this.#key = key;
    this.#credit = credit;
    root.append(bar, stage, legend, live, help);
    this.#legend = legend;
    this.#bar = bar;
    this.#stage = stage;
    this.#mapCanvas = map;
    this.#dotCanvas = dots;
    this.#selRing = selRing;
    this.#hovRing = hovRing;
    this.#tip = tip;
    this.#msg = msg;
    this.#live = live;
    dots.addEventListener("pointerdown", this.#onDown);
    dots.addEventListener("pointermove", this.#onMove);
    dots.addEventListener("pointerup", this.#onUp);
    dots.addEventListener("pointercancel", this.#onCancel);
    dots.addEventListener("pointerleave", this.#onLeave);
    dots.addEventListener("wheel", this.#onWheel, { passive: false });
    dots.addEventListener("keydown", this.#onKey);
    dots.addEventListener("blur", () => {
      if (this.#cursor) {
        this.#cursor = null;
        this.#placeMarks();
      }
    });
  }

  /** Which controls the `controls` attribute asks for. */
  #wants(): Set<string> {
    const raw = (this.getAttribute("controls") ?? "").trim().toLowerCase();
    if (raw === "none" || raw === "off") return new Set();
    const all = ["centre", "zoom", "footprint", "track", "chips", "key"];
    if (raw === "" || raw === "all") return new Set(all);
    return new Set(raw.split(/[\s,]+/).map((one) => (one === "center" ? "centre" : one)));
  }

  /** The buttons and the filter chips, made again when the words, the groups, the planes or the home change. */
  #buildBar(): void {
    const bar = this.#bar;
    const dots = this.#dotCanvas;
    if (!bar || !dots) return;
    const lang = this.language;
    const wants = this.#wants();
    dots.setAttribute("aria-label", say(lang, "map"));
    (this.shadowRoot!.querySelector("#help") as HTMLElement).textContent = say(lang, "help");
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", say(lang, "controls"));
    const button = (act: string, label: string, extra = ""): string => `<button type="button" data-act="${act}"${extra}>${escape(label)}</button>`;
    const rows: string[] = [];
    const first: string[] = [];
    if (wants.has("centre")) {
      first.push(button("greenwich", say(lang, "greenwich"), ` aria-label="${escape(say(lang, "centreGreenwich"))}" aria-pressed="false"`));
      if (Number.isFinite(finite(this.getAttribute("home-lon"), Number.NaN))) first.push(button("home", say(lang, "myPlace"), ` aria-label="${escape(say(lang, "centreHome"))}" aria-pressed="false"`));
    }
    // the look's own pair of buttons, beside the centre buttons and not at the far end of the row (a page's own buttons often sit there): not among the defaults, so a page that has not asked for it sees no new button
    if (wants.has("look")) first.push(`<span class="pair" role="group" aria-label="${escape(say(lang, "lookGroup"))}">${button("look-map", say(lang, "lookMap"), ` aria-pressed="false"`)}${button("look-photo", say(lang, "lookPhoto"), ` aria-pressed="false"`)}</span>`);
    if (wants.has("zoom")) first.push(`<span class="gap"></span>`, button("zoomout", "−", ` aria-label="${escape(say(lang, "zoomOut"))}"`), button("zoomin", "+", ` aria-label="${escape(say(lang, "zoomIn"))}"`));
    else first.push(`<span class="gap"></span>`);
    if (wants.has("footprint")) first.push(button("footprint", say(lang, "footprint"), ` aria-pressed="false"`));
    if (wants.has("track")) first.push(button("track", say(lang, "groundTrack"), ` aria-pressed="false"`));
    if (first.length > 1) rows.push(`<div class="row">${first.join("")}</div>`);
    if (wants.has("chips")) {
      const groups = this.#shownGroupsForChips();
      const one = this.#shownGroups();
      if (groups === "planes" && one.length === 1) {
        const g = one[0]!;
        const chips = [button("plane", say(lang, "all"), ` class="chip" data-plane="" aria-pressed="false"`)];
        for (const plane of g.clusters.planes) chips.push(`<button type="button" class="chip" data-act="plane" data-plane="${plane.id}" data-i="${plane.index}" aria-pressed="false" aria-label="${escape(say(lang, "planeChip", { id: plane.id, count: plane.count }))}"><span class="swatch"></span>${escape(plane.id)} <span class="n">${plane.count}</span></button>`);
        rows.push(`<div class="row chips" role="group" aria-label="${escape(say(lang, "planesFilter"))}">${chips.join("")}</div>`);
      } else if (groups === "groups") {
        const chips = [`<button type="button" class="chip" data-act="group" data-group="*" aria-pressed="false">${escape(say(lang, "all"))}</button>`];
        for (const g of this.#groups.values()) chips.push(`<button type="button" class="chip" data-act="group" data-group="${escape(g.id)}" aria-pressed="false"><span class="swatch"></span>${escape(lang === "ja" ? g.labelJa : g.label)} <span class="n">${g.n.toLocaleString(lang)}</span></button>`);
        rows.push(`<div class="row chips" role="group" aria-label="${escape(say(lang, "groupsFilter"))}">${chips.join("")}</div>`);
      }
    }
    bar.innerHTML = rows.join("");
    // colours go on through the CSS object model: an inline style attribute in the markup would be refused by a strict Content-Security-Policy
    bar.querySelectorAll<HTMLElement>("[data-group] .swatch").forEach((swatch) => {
      const id = (swatch.parentElement as HTMLElement).dataset["group"]!;
      swatch.style.setProperty("--c", this.#groups.get(id)?.colour ?? SPARE_COLOUR);
    });
    bar.querySelectorAll<HTMLElement>("[data-i] .swatch").forEach((swatch) => {
      const i = Number((swatch.parentElement as HTMLElement).dataset["i"]);
      swatch.style.setProperty("--c", PLANE_COLOURS[i % PLANE_COLOURS.length]!);
    });
    this.#sync();
  }

  /** Which chips to offer: planes when one group with planes is on show and the map is coloured by plane; groups when there are two or more loaded. */
  #shownGroupsForChips(): "planes" | "groups" | "none" {
    const shown = this.#shownGroups();
    if (this.#byPlane(shown) && shown.length === 1 && shown[0]!.clusters.clustered) return "planes";
    if (this.#groups.size >= 2) return "groups";
    return "none";
  }

  /** Bring the pressed states of the buttons and chips up to date without making them again (a reader may be using one). */
  #sync(): void {
    const bar = this.#bar;
    if (!bar) return;
    const set = (selector: string, on: boolean): void => bar.querySelectorAll(selector).forEach((el) => el.setAttribute("aria-pressed", String(on)));
    const home = this.#home() ?? { lon: finite(this.getAttribute("home-lon"), Number.NaN), lat: 0 };
    set('[data-act="greenwich"]', Math.abs(wrapLongitude(this.#view.centerLon)) < 0.5);
    set('[data-act="home"]', Number.isFinite(home.lon) && Math.abs(wrapLongitude(this.#view.centerLon - home.lon)) < 0.5);
    set('[data-act="footprint"]', this.#footprint);
    set('[data-act="track"]', this.#track);
    set('[data-act="look-map"]', this.#look === "map");
    set('[data-act="look-photo"]', this.#look === "photo");
    const shown = this.#shownGroups();
    bar.querySelectorAll<HTMLElement>('[data-act="group"]').forEach((chip) => {
      const id = chip.dataset["group"]!;
      chip.setAttribute("aria-pressed", String(id === "*" ? this.#shown === null : shown.some((g) => g.id === id)));
    });
    bar.querySelectorAll<HTMLElement>('[data-act="plane"]').forEach((chip) => chip.setAttribute("aria-pressed", String((chip.dataset["plane"] ?? "") === this.#plane)));
    bar.querySelector<HTMLButtonElement>('[data-act="zoomin"]')?.toggleAttribute("disabled", this.#view.zoom >= MAX_ZOOM);
    bar.querySelector<HTMLButtonElement>('[data-act="zoomout"]')?.toggleAttribute("disabled", this.#view.zoom <= 1);
    if (this.#dotCanvas) this.#dotCanvas.toggleAttribute("data-zoomed", this.#view.zoom > 1);
    this.#syncLegend();
  }

  #afterFilter(): void {
    this.#buildBar();
    this.#request();
    this.#schedule();
    this.dispatchEvent(new CustomEvent("chikyu-flat-filter", { detail: { groups: this.visibleGroups, plane: this.#plane }, bubbles: true, composed: true }));
  }

  #onLegend = (event: Event): void => {
    if (!(event.target as Element | null)?.closest("button[data-act=key]")) return;
    this.keyOpen = !this.#legendIsOpen();
    this.#legend?.querySelector<HTMLButtonElement>("button[data-act=key]")?.focus();
  };

  #onBar = (event: Event): void => {
    const target = (event.target as Element | null)?.closest<HTMLElement>("button[data-act]");
    if (!target || target.hasAttribute("disabled")) return;
    const act = target.dataset["act"];
    const v = this.#view;
    if (act === "greenwich") this.#setView({ ...v, centerLon: 0 });
    else if (act === "home") {
      const home = this.#home();
      const lon = finite(this.getAttribute("home-lon"), 0);
      this.#setView({ ...v, centerLon: lon, centerLat: v.zoom > 1 && home ? home.lat : v.centerLat });
    } else if (act === "zoomin") this.#setView(zoomAbout(v, 1.6));
    else if (act === "zoomout") this.#setView(zoomAbout(v, 1 / 1.6));
    else if (act === "footprint") {
      this.#footprint = !this.#footprint;
      this.#sync();
      this.#request();
    } else if (act === "look-map" || act === "look-photo") {
      // the attribute is the look: the page that set the controls sees the change as it sees any other
      this.setAttribute("look", act === "look-photo" ? "photo" : "map");
    } else if (act === "track") {
      this.#track = !this.#track;
      this.#trackKey = "";
      this.#sync();
      this.#request();
    } else if (act === "group") {
      const id = target.dataset["group"]!;
      if (id === "*") this.#shown = null;
      else {
        const now = new Set(this.#shownGroups().map((g) => g.id));
        if (now.has(id)) now.delete(id);
        else now.add(id);
        const usual = [...this.#groups.keys()].filter((one) => !this.#off.has(one));
        this.#shown = now.size === usual.length && usual.every((one) => now.has(one)) ? null : now;
      }
      this.#plane = "";
      this.#afterFilter();
    } else if (act === "plane") {
      this.#plane = target.dataset["plane"] ?? "";
      this.#afterFilter();
    }
  };

  #setView(view: FlatView): void {
    this.#view = clampView(view);
    this.#mapKey = "";
    this.#sync();
    this.#request();
  }

  // --- the pointer and the keyboard ------------------------------------------------------------------------------------------------------------

  #local(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const box = this.#dotCanvas!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  /** The satellite drawn nearest to a point, within `reach` pixels. */
  #hit(x: number, y: number, reach: number): Ref | null {
    let best: Ref | null = null;
    let gap = reach * reach;
    for (const g of this.#shownGroups()) {
      const { sx, sy, on } = g;
      for (let i = 0; i < g.n; i += 1) {
        if (on[i] !== 1) continue;
        const dx = sx[i]! - x;
        const dy = sy[i]! - y;
        const d = dx * dx + dy * dy;
        if (d <= gap) {
          gap = d;
          best = { g, i };
        }
      }
    }
    return best;
  }

  #pick(ref: Ref | null, via: FlatPick["via"]): void {
    const state = ref ? this.#stateOf(ref) : null;
    const detail = ref
      ? ({ id: ref.g.sats.sets[ref.i]!.NORAD_CAT_ID, index: ref.i, group: ref.g.id, name: this.#nameOf(ref), plane: this.#planeOfRef(ref), altitudeKm: ref.g.alt[ref.i]!, sunlit: state?.sunlit ?? null, bearingDeg: state?.bearingDeg ?? null, ascending: state?.ascending ?? null, via } satisfies FlatPick)
      : { id: null, index: -1, group: null, name: null, plane: null, altitudeKm: null, sunlit: null, bearingDeg: null, ascending: null, via };
    this.dispatchEvent(new CustomEvent("chikyu-flat-pick", { detail, bubbles: true, composed: true }));
  }

  #choose(ref: Ref | null, via: FlatPick["via"]): void {
    const same = sameRef(ref, this.#selected);
    if (ref === null && this.#selected === null) return;
    if (!same) {
      this.#selected = ref;
      this.#trackKey = "";
      if (this.#footprint || this.#track) this.#request();
    }
    this.#sync();
    this.#placeMarks();
    if (ref) {
      this.#announceLive(ref);
      this.#pick(ref, via);
    } else if (!same) this.#pick(null, via);
  }

  #announceLive(ref: Ref): void {
    if (!this.#live) return;
    const state = this.#stateOf(ref);
    this.#live.textContent = this.#describe(ref) + (state ? say(this.language, state.sunlit ? "sunlitNow" : "shadowNow") : "");
  }

  /** Where one satellite is over the ground, which way it goes and whether the Sun lights it, at the moment shown (SGP4 placed exactly, one call); null when it cannot be placed then. */
  #stateOf(ref: Ref): GroundTrackState | null {
    const out = new Float64Array(6);
    if (!ref.g.sats.exact(ref.i, this.time, out)) return null;
    return trackStateOfScene([out[0]!, out[1]!, out[2]!], [out[3]!, out[4]!, out[5]!], this.time);
  }

  /**
   * Where a loaded satellite is over the ground at the moment shown, which way its ground track runs and whether the Sun lights it: `{ lat, lon, heightKm, bearingDeg, ascending, sunlit }` (see `GroundTrackState`), placed exactly by SGP4. Null when the number names no loaded satellite
   * or it cannot be placed at that moment. It is the same state that `chikyu-flat-pick` carries (`sunlit`, `bearingDeg`, `ascending`).
   *
   * @param id - The NORAD catalogue number.
   * @returns The state, or null.
   */
  stateOf(id: number): GroundTrackState | null {
    const ref = this.#index.get(id);
    return ref ? this.#stateOf(ref) : null;
  }

  /** The state (`stateOf`) of the chosen satellite, or null when none is chosen. */
  get selectedState(): GroundTrackState | null {
    return this.#selected ? this.#stateOf(this.#selected) : null;
  }

  #onDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = this.#local(event);
    this.#pointers.set(event.pointerId, at);
    try {
      this.#dotCanvas!.setPointerCapture(event.pointerId);
    } catch {
      // a pointer that is already gone
    }
    const pinch = this.#pointers.size === 2 ? this.#spread() : 0;
    this.#drag = { x: at.x, y: at.y, moved: this.#pointers.size === 2, pinch };
    this.#dotCanvas!.style.cursor = "grabbing";
  };

  #spread(): number {
    const [a, b] = [...this.#pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  #onMove = (event: PointerEvent): void => {
    const at = this.#local(event);
    if (!this.#pointers.has(event.pointerId)) {
      // a pointer going over the map with no button down: the one under it is named
      if (event.pointerType === "mouse") this.#hoverAt(at.x, at.y);
      return;
    }
    const before = this.#pointers.get(event.pointerId)!;
    this.#pointers.set(event.pointerId, at);
    const drag = this.#drag;
    if (!drag) return;
    if (this.#pointers.size >= 2) {
      const spread = this.#spread();
      const [a, b] = [...this.#pointers.values()];
      if (drag.pinch > 0 && spread > 0 && a && b) {
        const factor = spread / drag.pinch;
        this.#view = zoomAbout(this.#view, factor, (a.x + b.x) / 2, (a.y + b.y) / 2);
        drag.pinch = spread;
        drag.moved = true;
        this.#mapKey = "";
        this.#sync();
        this.#request();
      }
      return;
    }
    if (!drag.moved && Math.hypot(at.x - drag.x, at.y - drag.y) < TAP_SLOP) return;
    drag.moved = true;
    const k = pixelsPerDegree(this.#view);
    this.#view = clampView({ ...this.#view, centerLon: this.#view.centerLon - (at.x - before.x) / k, centerLat: this.#view.centerLat + (at.y - before.y) / k });
    this.#hover = null;
    this.#sync();
    this.#request();
  };

  #onUp = (event: PointerEvent): void => {
    const at = this.#local(event);
    const drag = this.#drag;
    this.#pointers.delete(event.pointerId);
    try {
      this.#dotCanvas!.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    if (this.#pointers.size === 0) {
      this.#drag = null;
      this.#dotCanvas!.style.cursor = "";
      if (drag && !drag.moved) {
        // a tap: a finger needs more room than a mouse
        const near = this.#hit(at.x, at.y, event.pointerType === "touch" ? 22 : 9);
        if (event.pointerType !== "mouse") this.#hover = null;
        const mark = this.#markOver(near, at.x, at.y, event.pointerType === "touch" ? 22 : 11);
        const hit = mark ? null : near;
        if (mark) {
          this.#pressMark(mark, "tap");
          return;
        }
        // a tap anywhere else puts a pressed mark's name away
        this.#markShown = null;
        this.#markHover = null;
        this.#placeMarks();
        this.#choose(hit, "tap");
      }
    } else if (drag) drag.pinch = this.#spread();
  };

  #onCancel = (event: PointerEvent): void => {
    this.#pointers.delete(event.pointerId);
    if (this.#pointers.size === 0) {
      this.#drag = null;
      this.#dotCanvas!.style.cursor = "";
    }
  };

  #onLeave = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse" || (this.#hover === null && this.#markHover === null)) return;
    this.#hover = null;
    this.#markHover = null;
    if (this.#dotCanvas) this.#dotCanvas.style.cursor = "";
    this.#placeMarks();
  };

  #hoverAt(x: number, y: number): void {
    const near = this.#hit(x, y, 8);
    const mark = this.#markOver(near, x, y, 11);
    const hit = mark ? null : near;
    if (this.#dotCanvas) this.#dotCanvas.style.cursor = mark ? "pointer" : "";
    if (sameRef(hit, this.#hover) && mark === this.#markHover) return;
    this.#hover = hit;
    this.#markHover = mark;
    this.#placeMarks();
    if (hit) this.#pick(hit, "hover");
  }

  #onWheel = (event: WheelEvent): void => {
    // a plain wheel scrolls the page; Control or Command with the wheel (and a trackpad's pinch, which arrives as one) zooms
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const at = this.#local(event);
    this.#setView(zoomAbout(this.#view, Math.exp(-event.deltaY * 0.01), at.x, at.y));
  };

  #onKey = (event: KeyboardEvent): void => {
    const key = event.key;
    if (key === "+" || key === "=") {
      event.preventDefault();
      this.#setView(zoomAbout(this.#view, 1.6));
      return;
    }
    if (key === "-" || key === "_") {
      event.preventDefault();
      this.#setView(zoomAbout(this.#view, 1 / 1.6));
      return;
    }
    if (key === "Escape") {
      if (this.#markShown) {
        this.#markShown = null;
        this.#placeMarks();
      }
      if (this.#cursor || this.#selected) {
        this.#cursor = null;
        this.#choose(null, "key");
      }
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      const ref = this.#cursor ?? this.#selected;
      if (ref) this.#choose(ref, "key");
      return;
    }
    const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : key === "PageDown" ? 10 : key === "PageUp" ? -10 : 0;
    if (step === 0 && key !== "Home" && key !== "End") return;
    event.preventDefault();
    // the satellites on show, from the left of the map to the right
    const list: Ref[] = [];
    for (const g of this.#shownGroups()) for (let i = 0; i < g.n; i += 1) if (g.on[i] === 1) list.push({ g, i });
    if (list.length === 0) return;
    list.sort((a, b) => a.g.sx[a.i]! - b.g.sx[b.i]! || a.g.sy[a.i]! - b.g.sy[b.i]!);
    const current = this.#cursor ?? this.#selected;
    const at = current ? list.findIndex((one) => one.g === current.g && one.i === current.i) : -1;
    const next = key === "Home" ? 0 : key === "End" ? list.length - 1 : at < 0 ? (step > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + step));
    this.#cursor = list[next]!;
    this.#placeMarks();
    this.#announceLive(this.#cursor);
    this.#pick(this.#cursor, "key");
  };

  /** Choose a satellite from code, as a reader's tap would, without sending `chikyu-flat-pick`. A NORAD number the groups do not hold, or `null`, clears the choice. */
  pick(id: number | null): void {
    this.selected = id;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "chikyu-flat": ChikyuFlat;
  }
}
