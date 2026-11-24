// The places' markers in an element: a small box for each of the first places in sight (`here` first), moved by CSS transforms when the picture is drawn, and a name for each that has room. Every other place,
// and every group of crowded places, is a ring in the picture's one draw call (place-sprites.ts), with the group's count as a name. The pulse of a `here` place is a CSS animation, so the picture is never
// drawn again for it; it stops while the element is out of sight, and a reader who asked for less motion gets none. Names are measured as the page draws them.
import type { GeoPoint } from "../types.ts";
import { placeLabels, type LabelItem } from "./labels.ts";
import type { PlaceSpriteData } from "./place-sprites.ts";
import { groupCell, groupPlaces, layoutPlaces, PLACE_LOOKS, ringOf, shownPlaces, type Place, type PlaceGroup, type PlaceKind, type PlaceLook, type PlaceView, type SurfacePoint } from "./places.ts";

/** A `places-look` attribute: one of `PLACE_LOOKS`, else `beam`. */
export const readPlaceLook = (value: string | null): PlaceLook => (PLACE_LOOKS as readonly string[]).includes(value ?? "") ? (value as PlaceLook) : "beam";

/** The places' look, for the element's own style sheet. Colours: `--chikyu-place-here` and `--chikyu-place-favourite` on the element or the page. */
export const PLACE_STYLE =
  "#places{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  ".pl-mark{position:absolute;left:0;top:0;width:0;height:0;will-change:transform,opacity;--c:var(--chikyu-place-favourite,#ffd27a)}" +
  ".pl-mark[data-kind=here]{--c:var(--chikyu-place-here,#7df9ff)}" +
  ".pl-mark[hidden],.pl-name[hidden]{display:none}" +
  ".pl-disc{position:absolute;left:calc(var(--r) * -1);top:calc(var(--r) * -1);width:calc(var(--r) * 2);height:calc(var(--r) * 2)}" +
  ".pl-ring,.pl-pulse{position:absolute;inset:0;box-sizing:border-box;border-radius:50%;border:1.5px solid var(--c)}" +
  ".pl-ring{box-shadow:0 0 6px var(--c),inset 0 0 4px var(--c);background:radial-gradient(circle,var(--c) 0 18%,transparent 22%)}" +
  ".pl-pulse{opacity:0}" +
  ".pl-mark[data-kind=here] .pl-pulse{animation:pl-pulse 2.6s ease-out infinite}" +
  "#places.pl-still .pl-pulse{animation-play-state:paused}" +
  "@keyframes pl-pulse{0%{transform:scale(1);opacity:.75}100%{transform:scale(2.8);opacity:0}}" +
  "@media (prefers-reduced-motion:reduce){.pl-mark[data-kind=here] .pl-pulse{animation:none}}" +
  ".pl-stick{position:absolute;left:-1px;bottom:0;width:2px;height:100px;transform-origin:50% 100%;background:linear-gradient(to top,var(--c),color-mix(in srgb,var(--c) 40%,transparent) 70%,transparent);box-shadow:0 0 5px var(--c);border-radius:1px}" +
  ".pl-head{position:absolute;left:-2.5px;top:-2.5px;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 0 6px 1px var(--c)}" +
  ".pl-mark[data-kind=favourite] .pl-stick{width:1.5px;opacity:.8}" +
  ".pl-mark[data-kind=favourite] .pl-head{opacity:.85}" +
  ".pl-mark[data-look=pin] .pl-stick{background:var(--c);box-shadow:none;width:1.5px}" +
  ".pl-mark[data-look=pin] .pl-head{left:-4px;top:-4px;width:8px;height:8px;background:var(--c);box-shadow:0 0 0 1.5px rgba(4,10,20,.75)}" +
  ".pl-mark[data-look=pin] .pl-ring{box-shadow:none;background:none;opacity:.7}" +
  ".pl-mark[data-look=ring] .pl-stick,.pl-mark[data-look=ring] .pl-head{display:none}" +
  ".pl-name{position:absolute;left:0;top:0;box-sizing:border-box;padding:1px 6px;font:600 11px/16px system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.04em;white-space:nowrap;color:#eefcff;background:rgba(4,10,20,.72);border:1px solid color-mix(in srgb,var(--c) 60%,transparent);border-radius:3px;will-change:transform;--c:var(--chikyu-place-favourite,#ffd27a)}" +
  ".pl-name[data-kind=here]{--c:var(--chikyu-place-here,#7df9ff);color:#fff}" +
  ".pl-name[data-kind=group]{padding:0 5px;font-size:10px;line-height:14px;border-radius:7px;background:rgba(4,10,20,.6)}" +
  ".pl-name[data-night]{opacity:.82}" +
  ".pl-name[data-kind=satellite]{--c:#cfeaff;color:#cfeaff;font-weight:500;background:rgba(4,10,20,.5);border-color:transparent}" +
  ".pl-name[data-occluded]{opacity:.45}" +
  ".pl-sat{position:absolute;left:-8px;top:-8px;width:16px;height:16px;box-sizing:border-box;border:1.2px solid #cfeaff;border-radius:50%;opacity:.85;will-change:transform}" +
  ".pl-sat[hidden]{display:none}" +
  ".pl-dot{position:absolute;left:0;top:0;box-sizing:border-box;border:1.5px solid var(--c);border-radius:50%;opacity:.9}" +
  ".pl-dot[hidden]{display:none}" +
  ".pl-name.pl-measure{visibility:hidden}" +
  ".pl-current{position:absolute;left:-14px;top:-14px;width:28px;height:28px;box-sizing:border-box;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px rgba(4,10,20,.85),0 0 0 4px #fff;will-change:transform}" +
  ".pl-current[hidden]{display:none}" +
  "#place-live{position:absolute;width:1px;height:1px;margin:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}";

/** A satellite ringed and named in the picture just drawn: its name, where it is and whether it can be seen (in the box and not behind the Earth). */
export interface SatelliteMark {
  id: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
  /** The Earth hides it. The name is dimmed and the ring is left off, unless dimming is off. */
  occluded?: boolean;
}

/** The ring round a named satellite, in CSS pixels. */
const SATELLITE_RING = 8;

/**
 * The most places in sight drawn as markers of their own (a beam, a pin or a ring standing out of the ground, and a name): `here` first, then the places that have a `label`, then the rest in the order given. Every other place is a ring on the ground, all of them one draw call.
 *
 * @example
 * ```ts
 * import { PLACE_MARKS } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(PLACE_MARKS); // 32
 * ```
 */
export const PLACE_MARKS = 32;
/**
 * The most rings the layer draws itself, as small circles in the page, when the picture cannot draw them (the three.js parts handed over lack `Points`). Places in sight beyond it are counted in `stats.omitted`, not dropped quietly.
 *
 * @example
 * ```ts
 * import { PLACE_DOTS } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(PLACE_DOTS); // 600
 * ```
 */
export const PLACE_DOTS = 600;

/**
 * The page is told once, and only when places in sight had no room in the fallback circles. Missing `Points` alone is not a loss: the circles still draw, up to {@link PLACE_DOTS}. Returns null when nothing new was lost; otherwise
 * the detail of `chikyu-places-unavailable`: `reason` says why and `omitted` how many places in sight had no room.
 */
export function placesLostNotice(state: { told: boolean }, omitted: number): { reason: string; omitted: number } | null {
  if (state.told || !(omitted > 0)) return null;
  state.told = true;
  return { reason: `the three.js parts handed over lack Points: the places' rings are drawn as small circles in the page, at most ${PLACE_DOTS}, and ${omitted} places in sight had no room (stats.places.omitted counts them)`, omitted };
}
/** The most names a group's count gets. */
const GROUP_NAMES = 24;
const EDGE = 0.02;
/** How far past the edge a ring fades in, the same span the picture's rings use. */
const LIMB = 0.12;
const MARGIN = 60;
const FALLBACK = { here: "#7df9ff", favourite: "#ffd27a" };
type Box = { left: number; top: number; width: number; height: number };

/**
 * What `chikyu-place-click` carries in `event.detail`: the place that was pressed, and where the press was in CSS pixels inside the element's box.
 *
 * @example
 * ```ts
 * import type { PlaceClickDetail } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const on = (event: Event): void => {
 *   const { id, kind, layer } = (event as CustomEvent<PlaceClickDetail>).detail;
 *   console.log(id, kind, layer ?? "no layer");
 * };
 * console.log(typeof on);
 * ```
 */
export interface PlaceClickDetail {
  id: string;
  /** `here` or `favourite`. */
  kind: PlaceKind;
  /** The place's `layer`, when it has one. */
  layer?: string;
  label?: string;
  lon: number;
  lat: number;
  /** Where the press was, in CSS pixels inside the element's box. */
  x: number;
  y: number;
}

/** The detail of `chikyu-place-click` for a pressed place. */
export const placeClick = (place: Place, x: number, y: number): PlaceClickDetail => {
  const detail: PlaceClickDetail = { id: place.id, kind: place.kind === "here" ? "here" : "favourite", lon: place.lon, lat: place.lat, x, y };
  if (place.layer) detail.layer = place.layer;
  if (place.label) detail.label = place.label;
  return detail;
};

/** How far from a place's mark a press still counts as on it, in CSS pixels, as for a satellite's dot. */
const PRESS_REACH = 12;

/**
 * The places' markers in one element: hand it the places and the look, and a view at each draw.
 */
export interface PlaceLayer {
  set(places: readonly Place[]): void;
  /** Which layers are shown: a layer's name to false hides every place of it (see {@link shownPlaces}). A layer not named is shown. */
  layers: Readonly<Record<string, boolean>>;
  look: PlaceLook;
  /**
   * Lay the places on the picture just drawn; `null` hides them (the Earth is not in the picture). `taken` is boxes other names use; `marks` are satellites to ring and name, after the places' names and
   * never over them; `sun` is where the Sun is overhead (null when the whole Earth is lit), for the night side's dimmer markers.
   */
  frame(view: PlaceView | null, taken?: readonly Box[], marks?: readonly SatelliteMark[], sun?: GeoPoint | null): void;
  /**
   * Lay the names of the places whose `namePriority` is `low`, after the layers that come before them: `taken` gives those layers' boxes (the cities' names), asked for only when there is a name to lay, and a name with no free place is left out. Call it after each `frame`
   * and again when those layers change; with no such place it does nothing.
   */
  late(taken?: () => readonly Box[]): void;
  /** The place under a point of the element (CSS pixels from its top left) in the last picture: a marker's stick or foot, or a ring, within a few pixels; null when there is none. A group of several is not a place. */
  pick(x: number, y: number): Place | null;
  /** The places a press can reach in the last picture, as {@link PlaceLayer.pick} does, from the left of the picture to the right (top first where they share a column); empty while there are none. */
  reachable(): readonly { place: Place; x: number; y: number }[];
  /** The place the keys are on, ringed in the picture, or null. Setting a place that is not in the list clears it. */
  current: Place | null;
  /** Move the keys' place to the next (or, with a negative step, the previous) reachable one; starts at the first (or the last) when none is current or the current one is out of reach. Null when nothing is reachable. */
  step(delta: number): { place: Place; position: number; total: number } | null;
  /** Where a place is in the last picture, in CSS pixels, or null when the picture does not show it (off the box or on the far side). */
  where(place: Place): { x: number; y: number } | null;
  /** The rings the picture draws for the places that are not markers of their own, as of the last `frame`; null while there are none. */
  readonly sprites: PlaceSpriteData | null;
  /**
   * Whether places that crowd are gathered into one ring with their count (the attribute `place-groups`; true by default). False leaves every place its own ring.
   */
  grouping: boolean;
  /**
   * Whether the picture draws the rings that are not markers of their own (true by default). False when the three.js parts lack `Points`: the layer then draws those rings itself as small circles in the page, up to {@link PLACE_DOTS},
   * fading at the Earth's edge and dimmer at night, and `stats.omitted` counts the places in sight it had no room for. `stats.sprites` counts only the rings the picture draws; `stats.dots` counts the circles.
   */
  ringsInPicture: boolean;
  /** Dim a name the Earth hides, and leave its ring off. On by default. Off leaves that name out. */
  dimOccluded: boolean;
  readonly stats: { places: number; hidden: number; shown: number; labels: number; renders: number; rings: number; satelliteNames: number; marks: number; groups: number; sprites: number; dots: number; omitted: number };
  /** The boxes the names and the markers' heads take in the picture just drawn, for other names to keep clear of; the low-priority names, once `late` has laid them, are in it. */
  readonly boxes: readonly { left: number; top: number; width: number; height: number }[];
  /** The same without the low-priority names, which the cities' names are laid out after. */
  readonly earlyBoxes: readonly { left: number; top: number; width: number; height: number }[];
  dispose(): void;
}

interface Mark {
  root: HTMLElement;
  disc: HTMLElement;
  stick: HTMLElement;
  head: HTMLElement;
  kind: string;
  look: string;
  ring: number;
  color: string;
}

/**
 * Make the places' layer in a box of an element's shadow root (the box is `#places`, styled by {@link PLACE_STYLE}).
 *
 * @param box - The element's `#places` box.
 * @returns The layer.
 */
export function createPlaceLayer(box: HTMLElement): PlaceLayer {
  const doc = box.ownerDocument;
  box.setAttribute("aria-hidden", "true");
  box.dataset["look"] = "beam";
  let everything: readonly Place[] = [];
  let places: readonly Place[] = [];
  let switches: Readonly<Record<string, boolean>> = {};
  let look: PlaceLook = "beam";
  const marks: Mark[] = [];
  const names: HTMLElement[] = [];
  const sizes = new Map<string, { width: number; height: number }>();
  const stats = { places: 0, hidden: 0, shown: 0, labels: 0, renders: 0, rings: 0, satelliteNames: 0, marks: 0, groups: 0, sprites: 0, dots: 0, omitted: 0 };
  let grouping = true;
  let ringsInPicture = true;
  let dimOccluded = true;
  // the small circles that stand in for the picture's rings when it cannot draw them: the element, and what it was last written with
  const dots: { root: HTMLElement; r: number; color: string; fill: number; x: string; y: string; opacity: string }[] = [];
  // where each group fell on the screen the last time the picture could not draw the rings: x, y, facing. Grown when the groups grow, never one array a frame.
  let projected = new Float32Array(0);
  // the ring sizes written last, so a frame that changes none does not copy the buffer
  let shapeHeld = new Float32Array(0);
  let boxes: Box[] = [];
  let earlyBoxes: Box[] = [];
  // the names that wait for the layers before them, and the last picture's markers, for `late` and `pick`
  let lateItems: LabelItem[] = [];
  let lateOwners: Place[] = [];
  let lateFrom = 0;
  let earlyLabels = 0;
  let lastView: PlaceView | null = null;
  let lastShapes: ReturnType<typeof layoutPlaces>["shapes"] = [];
  let lastOwn: Place[] = [];
  const rings: HTMLElement[] = [];
  const measures: HTMLElement[] = [];
  // the groups of the places for the cell they were made with, and the rings' data the picture reads
  let groups: PlaceGroup[] = [];
  let groupedFor: readonly Place[] | null = null;
  let groupedCell = -1;
  let sprites: PlaceSpriteData | null = null;
  const point: SurfacePoint = { x: 0, y: 0, upX: 0, upY: 0, facing: 0 };
  const colorOk = (value: string | undefined): value is string => !!value && (typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("color", value));

  type Named = Pick<Place, "label" | "kind"> | { label: string; kind: "satellite" | "group" };
  const keyOf = (place: Named): string | null => {
    if (!place.label) return null;
    const kind = place.kind === "here" || place.kind === "satellite" || place.kind === "group" ? place.kind : "favourite";
    return `${kind}\n${place.label}`;
  };
  // the names not measured yet are written all at once and read all at once: one layout for the lot
  const measureAll = (list: readonly Named[]): void => {
    const todo: string[] = [];
    for (const place of list) {
      const key = keyOf(place);
      if (key && !sizes.has(key) && !todo.includes(key)) todo.push(key);
    }
    if (todo.length === 0) return;
    if (sizes.size + todo.length > 600) sizes.clear();
    for (const [i, key] of todo.entries()) {
      let span = measures[i];
      if (!span) {
        span = doc.createElement("span");
        span.className = "pl-name pl-measure";
        box.append(span);
        measures[i] = span;
      }
      const cut = key.indexOf("\n");
      span.hidden = false;
      span.dataset["kind"] = key.slice(0, cut);
      span.textContent = key.slice(cut + 1);
    }
    for (const [i, key] of todo.entries()) {
      const rect = measures[i]!.getBoundingClientRect();
      if (rect.width > 0) sizes.set(key, { width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
    }
    for (const span of measures) span.hidden = true;
  };
  const size = (place: Named): { width: number; height: number } | null => {
    const key = keyOf(place);
    if (!key) return null;
    if (!sizes.has(key)) measureAll([place]);
    return sizes.get(key) ?? null;
  };
  // a font that arrives later draws the names wider or narrower: measure them again
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  const refit = (): void => sizes.clear();
  fonts?.addEventListener?.("loadingdone", refit);

  const markAt = (i: number): Mark => {
    let mark = marks[i];
    if (!mark) {
      const root = doc.createElement("div");
      root.className = "pl-mark";
      const disc = doc.createElement("div");
      disc.className = "pl-disc";
      disc.innerHTML = '<i class="pl-ring"></i><i class="pl-pulse"></i>';
      const stick = doc.createElement("i");
      stick.className = "pl-stick";
      const head = doc.createElement("i");
      head.className = "pl-head";
      root.append(disc, stick, head);
      box.append(root);
      mark = { root, disc, stick, head, kind: "", look: "", ring: 0, color: "" };
      marks[i] = mark;
    }
    return mark;
  };
  const nameAt = (i: number): HTMLElement => {
    let name = names[i];
    if (!name) {
      name = doc.createElement("span");
      name.className = "pl-name";
      box.append(name);
      names[i] = name;
    }
    return name;
  };
  const hideFrom = (list: HTMLElement[], from: number): void => {
    for (let i = from; i < list.length; i += 1) if (!list[i]!.hidden) list[i]!.hidden = true;
  };
  const showName = (name: HTMLElement, text: string, kind: string, left: number, top: number, color: string | undefined, night: boolean, occluded = false): void => {
    if (name.textContent !== text) name.textContent = text;
    if (name.dataset["kind"] !== kind) name.dataset["kind"] = kind;
    if (colorOk(color)) name.style.setProperty("--c", color);
    else if (name.style.getPropertyValue("--c")) name.style.removeProperty("--c");
    name.toggleAttribute("data-night", night);
    name.toggleAttribute("data-occluded", occluded);
    if (occluded) name.style.opacity = "0.45";
    else if (name.style.opacity === "0.45") name.style.opacity = "";
    if (name.hidden) name.hidden = false;
    name.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
  };

  const unitOf = (lon: number, lat: number): [number, number, number] => {
    const lonR = (lon * Math.PI) / 180;
    const latR = (lat * Math.PI) / 180;
    return [Math.cos(latR) * Math.sin(lonR), Math.sin(latR), Math.cos(latR) * Math.cos(lonR)];
  };
  // the same night as the picture's rings: 0 in daylight, 1 once the Sun is about 7 degrees below the horizon
  const nightAt = (lon: number, lat: number, sun: readonly [number, number, number] | null): number => {
    if (!sun) return 0;
    const u = unitOf(lon, lat);
    const cosine = u[0] * sun[0] + u[1] * sun[1] + u[2] * sun[2];
    const k = Math.max(0, Math.min(1, (0.05 - cosine) / 0.17));
    return k * k * (3 - 2 * k);
  };
  // a small circle standing in for a ring the picture cannot draw: `fill` is how much of it is solid (a group of several). A place that has not moved is left as it was.
  const showDot = (i: number, x: number, y: number, r: number, fill: number, color: string, facing: number, night: number): void => {
    let dot = dots[i];
    if (!dot) {
      const root = doc.createElement("i");
      root.className = "pl-dot";
      box.append(root);
      dot = { root, r: -1, color: "", fill: -1, x: "", y: "", opacity: "" };
      dots[i] = dot;
    }
    if (dot.r !== r) {
      dot.r = r;
      dot.root.style.width = `${2 * r}px`;
      dot.root.style.height = `${2 * r}px`;
      dot.root.style.marginLeft = `${-r}px`;
      dot.root.style.marginTop = `${-r}px`;
    }
    if (dot.color !== color) {
      dot.color = color;
      dot.root.style.setProperty("--c", color);
    }
    if (dot.fill !== fill) {
      dot.fill = fill;
      dot.root.style.background = fill > 0 ? `color-mix(in srgb, ${color} ${Math.round(fill * 100)}%, transparent)` : "none";
    }
    if (dot.root.hidden) dot.root.hidden = false;
    const xText = x.toFixed(1);
    const yText = y.toFixed(1);
    if (dot.x !== xText || dot.y !== yText) {
      dot.x = xText;
      dot.y = yText;
      dot.root.style.transform = `translate(${xText}px,${yText}px)`;
    }
    const opacity = (Math.min(1, (facing - EDGE) / LIMB) * (1 - 0.5 * night) * 0.9).toFixed(2);
    if (dot.opacity !== opacity) {
      dot.opacity = opacity;
      dot.root.style.opacity = opacity;
    }
  };
  const hideDots = (from: number): void => {
    for (let i = from; i < dots.length; i += 1) if (!dots[i]!.root.hidden) dots[i]!.root.hidden = true;
  };

  /** Gather the places again for a new list or a new cell, and write the rings' places and colours. */
  const regroup = (cell: number): void => {
    groupedFor = places;
    groupedCell = cell;
    groups = groupPlaces(places, cell);
    if (groups.length === 0) {
      sprites = null;
      return;
    }
    const style = typeof getComputedStyle === "function" ? getComputedStyle(box) : null;
    const kindColor = { here: style?.getPropertyValue("--chikyu-place-here").trim() || FALLBACK.here, favourite: style?.getPropertyValue("--chikyu-place-favourite").trim() || FALLBACK.favourite };
    const points = sprites && sprites.points.length >= groups.length * 3 ? sprites.points : new Float32Array(groups.length * 3);
    const shapes = sprites && sprites.shapes.length >= groups.length * 2 ? sprites.shapes : new Float32Array(groups.length * 2);
    const colors: string[] = [];
    for (const [g, group] of groups.entries()) {
      const lon = (group.lon * Math.PI) / 180;
      const lat = (group.lat * Math.PI) / 180;
      points[g * 3] = Math.cos(lat) * Math.sin(lon);
      points[g * 3 + 1] = Math.sin(lat);
      points[g * 3 + 2] = Math.cos(lat) * Math.cos(lon);
      const first = places[group.members[0]!]!;
      const own = colorOk(first.color) && group.members.every((m) => places[m]!.color === first.color) ? first.color : undefined;
      colors.push(own ?? kindColor[first.kind === "here" && group.members.length === 1 ? "here" : "favourite"]);
    }
    sprites = { version: (sprites?.version ?? 0) + 1, count: groups.length, points, colors, shapesVersion: (sprites?.shapesVersion ?? 0) + 1, shapes };
  };

  // the pulse stops while the element is out of sight
  const watcher = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => box.classList.toggle("pl-still", !entries.some((entry) => entry.isIntersecting))) : null;
  watcher?.observe(box);

  const same = (a: Place, b: Place): boolean => a.id === b.id && a.kind === b.kind;
  let current: Place | null = null;
  let currentRing: HTMLElement | undefined;
  const whereIs = (place: Place): { x: number; y: number } | null => {
    if (!lastView) return null;
    for (const shape of lastShapes) if (same(lastOwn[shape.index]!, place)) return { x: shape.x, y: shape.y };
    if (!lastView.at(place.lon, place.lat, point) || point.facing <= EDGE) return null;
    if (point.x < 0 || point.y < 0 || point.x > lastView.width || point.y > lastView.height) return null;
    return { x: point.x, y: point.y };
  };
  const showCurrent = (): void => {
    const at = current ? whereIs(current) : null;
    if (!at) {
      if (currentRing && !currentRing.hidden) currentRing.hidden = true;
      return;
    }
    if (!currentRing) {
      currentRing = doc.createElement("i");
      currentRing.className = "pl-current";
      box.append(currentRing);
    }
    if (currentRing.hidden) currentRing.hidden = false;
    currentRing.style.transform = `translate(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px)`;
  };
  const keep = (): void => {
    if (!current) return;
    current = places.find((place) => same(place, current!)) ?? null;
    showCurrent();
  };
  const reach = (): { place: Place; x: number; y: number }[] => {
    const found: { place: Place; x: number; y: number }[] = [];
    if (!lastView || !groupedFor) return found;
    const marked = new Set<Place>();
    for (const shape of lastShapes) {
      const place = lastOwn[shape.index]!;
      marked.add(place);
      found.push({ place, x: shape.x, y: shape.y });
    }
    for (const group of groups) {
      if (group.members.length !== 1) continue;
      const place = groupedFor[group.members[0]!]!;
      if (marked.has(place) || !lastView.at(group.lon, group.lat, point) || point.facing <= EDGE) continue;
      if (point.x < 0 || point.y < 0 || point.x > lastView.width || point.y > lastView.height) continue;
      found.push({ place, x: point.x, y: point.y });
    }
    return found.sort((a, b) => a.x - b.x || a.y - b.y);
  };

  const clear = (): void => {
    if (currentRing && !currentRing.hidden) currentRing.hidden = true;
    hideFrom(marks.map((m) => m.root), 0);
    hideFrom(names, 0);
    hideFrom(rings, 0);
    hideDots(0);
    stats.omitted = 0;
    stats.shown = 0;
    stats.labels = 0;
    stats.rings = 0;
    stats.satelliteNames = 0;
    stats.marks = 0;
    stats.groups = 0;
    stats.sprites = 0;
    stats.dots = 0;
    lastView = null;
    lastShapes = [];
    lastOwn = [];
    lateItems = [];
    lateOwners = [];
    earlyLabels = 0;
    if (sprites && sprites.shapes.some((v) => v !== 0)) {
      sprites.shapes.fill(0);
      sprites.shapesVersion += 1;
    }
  };

  return {
    set(next) {
      everything = next;
      lastView = null;
      places = shownPlaces(next, switches);
      stats.places = next.length;
      stats.hidden = next.length - places.length;
      keep();
      if (places.length === 0) {
        groups = [];
        groupedFor = places;
        sprites = null;
      }
    },
    get layers() {
      return switches;
    },
    set layers(value) {
      switches = value;
      lastView = null;
      places = shownPlaces(everything, switches);
      stats.hidden = everything.length - places.length;
      if (places.length === 0) {
        groups = [];
        groupedFor = places;
        sprites = null;
      }
      keep();
    },
    get look() {
      return look;
    },
    set look(value) {
      look = value;
      box.dataset["look"] = value;
    },
    get grouping() {
      return grouping;
    },
    set grouping(value) {
      if (value === grouping) return;
      grouping = value;
    },
    get ringsInPicture() {
      return ringsInPicture;
    },
    set ringsInPicture(value) {
      ringsInPicture = value;
    },
    get dimOccluded() {
      return dimOccluded;
    },
    set dimOccluded(value) {
      dimOccluded = value;
    },
    get sprites() {
      return sprites;
    },
    frame(view, taken = [], satellites = [], sun = null) {
      if (!view || (places.length === 0 && satellites.length === 0)) {
        clear();
        if (places.length > 0) stats.renders += 1;
        boxes = [];
        earlyBoxes = [];
        return;
      }
      stats.renders += 1;
      const cell = grouping ? groupCell(view.radius ?? 0) : 0;
      if (groupedFor !== places || groupedCell !== cell) regroup(cell);
      // which groups are in sight, and the places that get markers of their own: `here` first, then in the order given.
      // without the picture's rings the screen place is kept, so each group is projected once
      const fallback = !ringsInPicture;
      if (fallback && projected.length < groups.length * 3) projected = new Float32Array(groups.length * 3);
      const sunUnit = sun ? unitOf(sun.lon, sun.lat) : null;
      const inSight: number[] = [];
      let shown = 0;
      for (const [g, group] of groups.entries()) {
        if (!view.at(group.lon, group.lat, point) || point.facing <= EDGE) continue;
        if (point.x < -MARGIN || point.y < -MARGIN || point.x > view.width + MARGIN || point.y > view.height + MARGIN) continue;
        if (fallback) {
          projected[g * 3] = point.x;
          projected[g * 3 + 1] = point.y;
          projected[g * 3 + 2] = point.facing;
        }
        inSight.push(g);
        shown += group.members.length;
      }
      const singles = inSight.filter((g) => groups[g]!.members.length === 1);
      // `here` first, then the places that have a name (so a name is never lost to a crowd of unnamed places that came before it), then the rest, each in the order given
      const rank = (g: number): number => {
        const place = places[groups[g]!.members[0]!]!;
        return place.kind === "here" ? 0 : place.label ? 1 : 2;
      };
      const chosen = [0, 1, 2].flatMap((r) => singles.filter((g) => rank(g) === r)).slice(0, PLACE_MARKS);
      const own = chosen.map((g) => places[groups[g]!.members[0]!]!);
      measureAll(own);
      const layout = layoutPlaces(own, view, look, { size: (place) => (place.namePriority === "low" ? null : size(place)), taken, sun });
      lastView = view;
      lastShapes = layout.shapes;
      lastOwn = own;
      // favourites first, so a `here` marker is drawn over them
      const order = [...layout.shapes].sort((a, b) => (own[a.index]!.kind === "here" ? 1 : 0) - (own[b.index]!.kind === "here" ? 1 : 0));
      for (const [i, shape] of order.entries()) {
        const place = own[shape.index]!;
        const mark = markAt(i);
        const kind = place.kind === "here" ? "here" : "favourite";
        if (mark.kind !== kind) {
          mark.kind = kind;
          mark.root.dataset["kind"] = kind;
        }
        const shown = place.look ?? look;
        if (mark.look !== shown) {
          mark.look = shown;
          mark.root.dataset["look"] = shown;
        }
        if (mark.ring !== shape.ring) {
          mark.ring = shape.ring;
          mark.root.style.setProperty("--r", `${shape.ring}px`);
        }
        const color = colorOk(place.color) ? place.color : "";
        if (mark.color !== color) {
          mark.color = color;
          if (color) mark.root.style.setProperty("--c", color);
          else mark.root.style.removeProperty("--c");
        }
        if (mark.root.hidden) mark.root.hidden = false;
        const opacity = shape.opacity * (1 - 0.5 * shape.night);
        mark.root.style.transform = `translate(${shape.x.toFixed(1)}px,${shape.y.toFixed(1)}px)`;
        mark.root.style.opacity = opacity >= 1 ? "" : opacity.toFixed(2);
        mark.disc.style.transform = `rotate(${shape.ringAngle.toFixed(1)}deg) scale(1,${shape.squash.toFixed(3)})`;
        mark.stick.style.transform = `rotate(${shape.angle.toFixed(1)}deg) scaleY(${(shape.length / 100).toFixed(3)})`;
        mark.head.style.transform = `translate(${(shape.tipX - shape.x).toFixed(1)}px,${(shape.tipY - shape.y).toFixed(1)}px)`;
      }
      hideFrom(marks.map((m) => m.root), order.length);
      const nightOf = new Map(layout.shapes.map((shape) => [shape.index, shape.night]));
      lateItems = [];
      lateOwners = [];
      for (const shape of layout.shapes) {
        const place = own[shape.index]!;
        const found = place.namePriority === "low" ? size(place) : null;
        if (!found) continue;
        lateItems.push({ x: shape.tipX, y: shape.tipY, r: (place.look ?? look) === "ring" ? shape.ring : 3, w: found.width, h: found.height, priority: 0 });
        lateOwners.push(place);
      }
      for (const [i, spot] of layout.labels.entries()) {
        const place = own[spot.index]!;
        showName(nameAt(i), place.label ?? "", place.kind === "here" ? "here" : "favourite", spot.left, spot.top, place.color, (nightOf.get(spot.index) ?? 0) > 0.5);
      }
      let used = layout.labels.length;
      const busy: Box[] = [...taken];
      for (const spot of layout.labels) {
        const found = size(own[spot.index]!);
        if (found) busy.push({ left: spot.left, top: spot.top, ...found });
      }
      // the rings in the one draw call: every place in sight that has no marker of its own, and every group, larger as it holds more
      let drawnSprites = 0;
      let drawnGroups = 0;
      let drawnDots = 0;
      let omitted = 0;
      if (sprites) {
        const shapes = sprites.shapes;
        const span = groups.length * 2;
        if (shapeHeld.length < span) {
          const next = new Float32Array(span);
          next.set(shapeHeld);
          shapeHeld = next;
        }
        shapes.fill(0, 0, span);
        const marked = new Set(layout.shapes.map((shape) => chosen[shape.index]!));
        const counts: { x: number; y: number; r: number; w: number; h: number; priority: number }[] = [];
        const owners: number[] = [];
        for (const g of inSight) {
          if (marked.has(g)) continue;
          const group = groups[g]!;
          const n = group.members.length;
          const first = places[group.members[0]!]!;
          const ring = n > 1 ? Math.min(14, 6 + 2.2 * Math.log2(n)) : ringOf(first);
          shapes[g * 2] = ring;
          shapes[g * 2 + 1] = n > 1 ? 0.3 : 0;
          if (fallback) {
            point.x = projected[g * 3]!;
            point.y = projected[g * 3 + 1]!;
            point.facing = projected[g * 3 + 2]!;
          } else if (n > 1) view.at(group.lon, group.lat, point);
          if (ringsInPicture) drawnSprites += 1;
          else if (drawnDots < PLACE_DOTS) {
            showDot(drawnDots, point.x, point.y, ring, n > 1 ? 0.3 : 0, sprites.colors[g]!, point.facing, nightAt(group.lon, group.lat, sunUnit));
            drawnDots += 1;
          } else {
            omitted += n;
            continue;
          }
          if (n > 1) {
            drawnGroups += 1;
            if (counts.length < GROUP_NAMES * 2) {
              const found = size({ label: String(n), kind: "group" });
              if (found) {
                counts.push({ x: point.x, y: point.y, r: ring, w: found.width, h: found.height, priority: n });
                owners.push(g);
              }
            }
          }
        }
        let shapesChanged = false;
        for (let i = 0; i < span; i += 1) {
          if (shapes[i] !== shapeHeld[i]) shapesChanged = true;
          shapeHeld[i] = shapes[i]!;
        }
        if (shapesChanged) sprites.shapesVersion += 1;
        const placed = placeLabels(counts, view.width, view.height, GROUP_NAMES, 64, busy);
        for (const spot of placed) {
          const group = groups[owners[spot.item]!]!;
          const count = String(group.members.length);
          const first = places[group.members[0]!]!;
          showName(nameAt(used), count, "group", spot.left, spot.top, group.members.every((m) => places[m]!.color === first.color) ? first.color : undefined, false);
          const found = size({ label: count, kind: "group" });
          if (found) busy.push({ left: spot.left, top: spot.top, ...found });
          used += 1;
        }
      }
      hideDots(drawnDots);
      stats.omitted = omitted;
      // a ring round each satellite that can be seen. A name the Earth hides is dimmed and has no ring, unless that dimming is off, in which case the name is left out.
      const seen = satellites.filter((mark) => mark.visible);
      const labelled = dimOccluded ? satellites.filter((mark) => mark.visible || mark.occluded) : seen;
      for (const [i, mark] of seen.entries()) {
        let ring = rings[i];
        if (!ring) {
          ring = doc.createElement("i");
          ring.className = "pl-sat";
          box.append(ring);
          rings[i] = ring;
        }
        if (ring.hidden) ring.hidden = false;
        ring.style.transform = `translate(${mark.x.toFixed(1)}px,${mark.y.toFixed(1)}px)`;
      }
      hideFrom(rings, seen.length);
      const items: { x: number; y: number; r: number; w: number; h: number; priority: number }[] = [];
      const owners: SatelliteMark[] = [];
      measureAll(labelled.filter((mark) => mark.label).map((mark) => ({ label: mark.label, kind: "satellite" as const })));
      for (const [i, mark] of labelled.entries()) {
        const found = mark.label ? size({ label: mark.label, kind: "satellite" }) : null;
        if (!found) continue;
        items.push({ x: mark.x, y: mark.y, r: mark.occluded ? 2 : SATELLITE_RING + 2, w: found.width, h: found.height, priority: -i });
        owners.push(mark);
      }
      const placed = placeLabels(items, view.width, view.height, 24, 64, busy);
      for (const spot of placed) {
        const mark = owners[spot.item]!;
        showName(nameAt(used), mark.label, "satellite", spot.left, spot.top, undefined, false, mark.occluded === true);
        used += 1;
      }
      hideFrom(names, used);
      earlyBoxes = busy.slice(taken.length);
      for (const spot of placed) earlyBoxes.push({ left: spot.left, top: spot.top, width: items[spot.item]!.w, height: items[spot.item]!.h });
      for (const shape of layout.shapes) earlyBoxes.push({ left: shape.tipX - 5, top: shape.tipY - 5, width: 10, height: 10 });
      // the ring round each satellite that can be seen: other layers' names keep off it as they keep off its name
      for (const mark of seen) earlyBoxes.push({ left: mark.x - SATELLITE_RING, top: mark.y - SATELLITE_RING, width: SATELLITE_RING * 2, height: SATELLITE_RING * 2 });
      boxes = earlyBoxes;
      lateFrom = used;
      earlyLabels = layout.labels.length;
      stats.shown = shown;
      stats.marks = order.length;
      stats.labels = layout.labels.length;
      stats.groups = drawnGroups;
      stats.sprites = drawnSprites;
      stats.dots = drawnDots;
      stats.rings = seen.length;
      stats.satelliteNames = placed.length;
      showCurrent();
    },
    stats,
    get boxes() {
      return boxes;
    },
    get earlyBoxes() {
      return earlyBoxes;
    },
    late(taken) {
      if (lateItems.length === 0 || !lastView) return;
      const placed = placeLabels(lateItems, lastView.width, lastView.height, 16, 64, [...(taken?.() ?? []), ...earlyBoxes]);
      let at = lateFrom;
      const added: Box[] = [];
      for (const spot of placed) {
        const place = lateOwners[spot.item]!;
        showName(nameAt(at), place.label ?? "", place.kind === "here" ? "here" : "favourite", spot.left, spot.top, place.color, false);
        added.push({ left: spot.left, top: spot.top, width: lateItems[spot.item]!.w, height: lateItems[spot.item]!.h });
        at += 1;
      }
      hideFrom(names, at);
      boxes = [...earlyBoxes, ...added];
      stats.labels = earlyLabels + placed.length;
    },
    pick(x, y) {
      if (!lastView || !groupedFor) return null;
      const marked = new Set<Place>();
      let best: Place | null = null;
      let near = PRESS_REACH;
      for (const shape of lastShapes) {
        const place = lastOwn[shape.index]!;
        marked.add(place);
        // the foot, or anywhere along the stick from the foot to its top
        const dx = shape.tipX - shape.x;
        const dy = shape.tipY - shape.y;
        const along = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((x - shape.x) * dx + (y - shape.y) * dy) / (dx * dx + dy * dy)));
        const d = Math.hypot(x - (shape.x + dx * along), y - (shape.y + dy * along));
        if (d < near || (d === near && best === null)) {
          best = place;
          near = d;
        }
      }
      for (const group of groups) {
        if (group.members.length !== 1) continue;
        const place = groupedFor[group.members[0]!]!;
        if (marked.has(place) || !lastView.at(group.lon, group.lat, point) || point.facing <= EDGE) continue;
        const d = Math.hypot(x - point.x, y - point.y);
        if (d < near) {
          best = place;
          near = d;
        }
      }
      return best;
    },
    reachable: reach,
    get current() {
      return current;
    },
    set current(value) {
      current = value ? (places.find((place) => same(place, value)) ?? null) : null;
      showCurrent();
    },
    step(delta) {
      const list = reach();
      if (list.length === 0) return null;
      const at = current ? list.findIndex((item) => same(item.place, current!)) : -1;
      const to = at < 0 ? (delta > 0 ? 0 : list.length - 1) : (((at + delta) % list.length) + list.length) % list.length;
      current = list[to]!.place;
      showCurrent();
      return { place: current, position: to + 1, total: list.length };
    },
    where: whereIs,
    dispose() {
      watcher?.disconnect();
      fonts?.removeEventListener?.("loadingdone", refit);
      box.replaceChildren();
      currentRing = undefined;
      current = null;
      marks.length = 0;
      names.length = 0;
      measures.length = 0;
      sprites = null;
    },
  };
}
