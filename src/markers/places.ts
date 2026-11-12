// Places on the Earth, "you are here" and favourites, drawn as markers standing out of the surface: what a place is, reading the `places` attribute, how crowded places are gathered, and where each
// marker and its name fall on the screen. Pure: `<chikyu-space>` and `<chikyu-earth-realistic>` draw what this works out, and only when their picture is drawn.
import type { GeoPoint } from "../types.ts";
import { placeLabels } from "./labels.ts";
import { project, type Pose } from "./project.ts";

/**
 * What a place is to the reader: `here` (where they are, drawn bright, with a quiet pulse) or `favourite` (a place they keep, drawn quieter).
 *
 * @example
 * ```ts
 * import type { PlaceKind } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const kind: PlaceKind = "here";
 * console.log(kind);
 * ```
 */
export type PlaceKind = "here" | "favourite";

/**
 * One place for the `places` attribute or property of `<chikyu-space>` and `<chikyu-earth-realistic>`. The package keeps none and stores none: the page hands them over.
 *
 * @example
 * ```ts
 * import type { Place } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const places: Place[] = [
 *   { id: "me", lon: -79.4, lat: 43.7, label: "You are here", kind: "here" },
 *   { id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo", kind: "favourite" },
 * ];
 * console.log(places.length);
 * ```
 */
export interface Place {
  /** Your own unique name for it. */
  id: string;
  /** Degrees east and north. */
  lon: number;
  lat: number;
  /** Shown at the top of the marker when there is room. */
  label?: string;
  /** `here` or `favourite` (the default). */
  kind?: PlaceKind;
  /** A CSS colour for this place alone (`#e8475f`, `rgb(...)`, `hsl(...)` or a colour's name); left out, the kind's colour. */
  color?: string;
}

/**
 * How a place is drawn: `beam` (a light rising out of the ground with a ring at its foot), `pin` (a thin stick with a round head) or `ring` (only the ring on the ground).
 *
 * @example
 * ```ts
 * import { PLACE_LOOKS, type PlaceLook } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const look: PlaceLook = "pin";
 * console.log(PLACE_LOOKS.includes(look));
 * ```
 */
export type PlaceLook = "beam" | "pin" | "ring";

/**
 * Every look a place can have, the default first.
 *
 * @example
 * ```ts
 * import { PLACE_LOOKS } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(PLACE_LOOKS.join(", "));
 * ```
 */
export const PLACE_LOOKS: readonly PlaceLook[] = ["beam", "pin", "ring"];

/**
 * The most places one element draws; the rest of a longer list are left out.
 *
 * @example
 * ```ts
 * import { MAX_PLACES } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(MAX_PLACES); // 5000
 * ```
 */
export const MAX_PLACES = 5000;

/**
 * A point of the Earth's surface as one picture shows it: where it falls (CSS pixels in the box), which way is straight up from the ground there on the screen (`upX`, `upY`: a direction whose
 * length is how much of an upright stick the reader sees, 0 looking straight down on it and 1 seeing it side on) and `facing`, the cosine between the ground's upright and the way to the camera
 * (above 0 the point faces the reader, at or below it is on the far side).
 *
 * @example
 * ```ts
 * import type { SurfacePoint } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const middle: SurfacePoint = { x: 210, y: 210, upX: 0, upY: 0, facing: 1 };
 * console.log(middle.facing);
 * ```
 */
export interface SurfacePoint {
  x: number;
  y: number;
  upX: number;
  upY: number;
  facing: number;
}

/**
 * A picture of the Earth for places to be laid on: its box, and a way to find a point of the surface in it (false when the point is behind the camera).
 *
 * @example
 * ```ts
 * import { orthoView, type PlaceView } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const view: PlaceView = orthoView({ lon: 0, lat: 0, radius: 200, cx: 210, cy: 210, width: 420, height: 420 });
 * console.log(view.width);
 * ```
 */
export interface PlaceView {
  width: number;
  height: number;
  at(lon: number, lat: number, out: SurfacePoint): boolean;
  /** The Earth's radius in the picture, in CSS pixels: how close places may be before they are gathered into a group. Left out, none are gathered. */
  radius?: number;
}

/**
 * Where one place's marker is drawn: the foot on the ground, the top of the stick, the stick's turn and length, the ring's turn, how flat it is and its radius, and how strongly it shows (it fades at the Earth's edge).
 *
 * @example
 * ```ts
 * import { layoutPlaces, orthoView, type PlaceShape } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const shape: PlaceShape | undefined = layoutPlaces([{ id: "a", lon: 0, lat: 0 }], orthoView({ lon: 0, lat: 0, radius: 200, cx: 210, cy: 210, width: 420, height: 420 }), "beam").shapes[0];
 * console.log(shape?.length);
 * ```
 */
export interface PlaceShape {
  /** Index into the places given. */
  index: number;
  x: number;
  y: number;
  tipX: number;
  tipY: number;
  /** The stick's direction, degrees clockwise from straight up on the screen. */
  angle: number;
  /** The stick's length in CSS pixels (0 for the `ring` look). */
  length: number;
  /** The direction of the ring's short axis, degrees clockwise from straight up. */
  ringAngle: number;
  /** The ring's short axis over its long one: 1 seen from straight above, near 0 at the Earth's edge. */
  squash: number;
  /** The ring's radius in CSS pixels. */
  ring: number;
  opacity: number;
  /** How far into the night the place is: 0 by day, 1 in full night, between in the twilight. Always 0 when no Sun is given. */
  night: number;
}

/**
 * Where one place's name goes: which place it is and the top-left corner of its box.
 *
 * @example
 * ```ts
 * import type { PlaceLabelSpot } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const spot: PlaceLabelSpot = { index: 0, left: 120, top: 80 };
 * console.log(spot.left);
 * ```
 */
export interface PlaceLabelSpot {
  index: number;
  left: number;
  top: number;
}

/**
 * The markers and names of a set of places in one picture.
 *
 * @example
 * ```ts
 * import { layoutPlaces, orthoView, type PlaceLayout } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const layout: PlaceLayout = layoutPlaces([], orthoView({ lon: 0, lat: 0, radius: 200, cx: 210, cy: 210, width: 420, height: 420 }), "beam");
 * console.log(layout.shapes.length, layout.labels.length);
 * ```
 */
export interface PlaceLayout {
  shapes: PlaceShape[];
  labels: PlaceLabelSpot[];
}

/**
 * What {@link layoutPlaces} may be told: the size of each name as the page draws it (a place with no size gets no name), boxes another layer already uses, and the most names.
 *
 * @example
 * ```ts
 * import type { PlaceLayoutOptions } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const options: PlaceLayoutOptions = { size: () => ({ width: 60, height: 18 }), maxLabels: 8 };
 * console.log(options.maxLabels);
 * ```
 */
export interface PlaceLayoutOptions {
  size?: (place: Place, index: number) => { width: number; height: number } | null;
  taken?: readonly { left: number; top: number; width: number; height: number }[];
  maxLabels?: number;
  /** Where the Sun is overhead, for each shape's `night`; left out (or null), every place is in daylight. */
  sun?: GeoPoint | null;
}

const RAD = Math.PI / 180;
const toUnit = (lon: number, lat: number): [number, number, number] => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];
const dotUnit = (lon: number, lat: number, v: readonly [number, number, number]): number => {
  const u = toUnit(lon, lat);
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
};
/** A place this close to the Earth's edge (the cosine of its angle from the reader) is left out; up to FADE beyond it, it fades in. */
const EDGE = 0.02;
const FADE = 0.12;
const MARGIN = 60;
const SIZES: Record<PlaceKind, { length: number; ring: number }> = { here: { length: 46, ring: 9 }, favourite: { length: 28, ring: 6 } };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
/** A colour a page may give a place: a hex colour, `rgb()`/`hsl()` with numbers only, or a colour's name. Anything else is left out, so no other CSS gets in. */
const COLOR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\([0-9.,%\s/+-]{1,60}\)|[a-z]{3,24})$/i;

/**
 * How far into the night a point is, from the cosine of its angle from the point the Sun is overhead: 0 in daylight, 1 once the Sun is 7 degrees below the horizon, eased between.
 *
 * @param cosine - The cosine of the angle between the point and the sub-solar point.
 * @returns 0 to 1.
 */
const nightOf = (cosine: number): number => {
  const k = Math.max(0, Math.min(1, (0.05 - cosine) / 0.17));
  return k * k * (3 - 2 * k);
};

/**
 * The places of a list a page handed over, made safe to draw: each needs a longitude from -180 to 180 and a latitude from -90 to 90; one without an `id` is given its place in the list, a
 * label is cut to 80 letters, a kind that is not `here` is `favourite`, and a colour is kept only when it is a hex colour, `rgb()` or `hsl()` with numbers, or a colour's name. Anything else is left out,
 * and at most {@link MAX_PLACES} are kept.
 *
 * @param list - What the page gave: an array of places, or anything.
 * @returns The places to draw.
 *
 * @example
 * ```ts
 * import { cleanPlaces } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(cleanPlaces([{ lon: 2.35, lat: 48.86, label: "Paris", color: "#e8475f" }, { lon: 500, lat: 0 }]));
 * ```
 */
export function cleanPlaces(list: unknown): Place[] {
  if (!Array.isArray(list)) return [];
  const out: Place[] = [];
  for (const [i, item] of list.entries()) {
    if (out.length >= MAX_PLACES) break;
    if (!isObject(item)) continue;
    const lon = Number(item["lon"]);
    const lat = Number(item["lat"]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    const place: Place = { id: typeof item["id"] === "string" && item["id"] ? item["id"] : String(i), lon, lat, kind: item["kind"] === "here" ? "here" : "favourite" };
    if (typeof item["label"] === "string" && item["label"].trim()) place.label = item["label"].trim().slice(0, 80);
    if (typeof item["color"] === "string" && COLOR.test(item["color"].trim())) place.color = item["color"].trim();
    out.push(place);
  }
  return out;
}

/**
 * Read the `places` attribute: a JSON array of places (see {@link cleanPlaces}). Anything that is not JSON is no places.
 *
 * @param value - The attribute's text, or null.
 * @returns The places to draw.
 *
 * @example
 * ```ts
 * import { readPlaces } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(readPlaces('[{"id":"me","lon":-79.4,"lat":43.7,"kind":"here"}]'));
 * ```
 */
export function readPlaces(value: string | null | undefined): Place[] {
  if (!value) return [];
  try {
    return cleanPlaces(JSON.parse(value));
  } catch {
    return [];
  }
}

/**
 * A place made less exact: put on a grid about `km` kilometres across, so a reader's own place can be drawn without saying their street. Use it on what the browser's location gives before
 * it is drawn or kept.
 *
 * @param point - Longitude and latitude in degrees.
 * @param km - The grid's size in kilometres (10).
 * @returns The point on the grid, to four decimals.
 *
 * @example
 * ```ts
 * import { nearby } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(nearby({ lon: -79.38321, lat: 43.65348 }));
 * ```
 */
export function nearby(point: GeoPoint, km = 10): GeoPoint {
  const step = Math.max(km, 0.01) / 111.32;
  const lat = Math.max(-90, Math.min(90, Math.round(point.lat / step) * step));
  const lonStep = Math.min(360, step / Math.max(Math.cos(lat * RAD), 0.01));
  let lon = Math.round(point.lon / lonStep) * lonStep;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  const four = (n: number): number => Math.round(n * 10_000) / 10_000 || 0;
  return { lon: four(lon), lat: four(lat) };
}

/**
 * A view for places from a picture drawn straight on, as `<chikyu-earth-realistic>` and the line globe are: the point of the Earth in the middle, the disc's radius and centre and the box's size.
 *
 * @param pose - The view and the box.
 * @returns A view {@link layoutPlaces} can lay places on.
 *
 * @example
 * ```ts
 * import { orthoView } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const out = { x: 0, y: 0, upX: 0, upY: 0, facing: 0 };
 * orthoView({ lon: 0, lat: 0, radius: 200, cx: 210, cy: 210, width: 420, height: 420 }).at(90, 0, out);
 * console.log(Math.round(out.x), out.facing < 0.01);
 * ```
 */
export function orthoView(pose: Pose & { width: number; height: number }): PlaceView {
  return {
    width: pose.width,
    height: pose.height,
    radius: pose.radius,
    at(lon, lat, out) {
      const p = project(lon, lat, pose);
      out.x = p.x;
      out.y = p.y;
      out.upX = (p.x - pose.cx) / pose.radius;
      out.upY = (p.y - pose.cy) / pose.radius;
      out.facing = p.z;
      return true;
    },
  };
}

/**
 * Where each place's marker and name go in one picture. A place on the far side of the Earth, or off the picture, is left out; one near the Earth's edge fades. The stick stands up from the ground as the picture
 * sees it, leaning towards the top of the screen where the reader looks straight down on it, so it never shrinks to a dot; the ring at its foot is flattened as the ground is. A `here` place is taller and wider
 * than a favourite. Names go at the top of the stick, `here` first and then in the order given, never over one another or over a box in `taken`; a name with no free place is left out. With `sun`, each shape says
 * how far into the night its place is, so it can be drawn dimmer there.
 *
 * @param places - The places, as {@link cleanPlaces} makes them.
 * @param view - The picture.
 * @param look - `beam`, `pin` or `ring`.
 * @param options - The size of each name, boxes already used, the most names (16) and where the Sun is overhead.
 * @returns The markers to draw and where the names go.
 *
 * @example
 * ```ts
 * import { layoutPlaces, orthoView } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const view = orthoView({ lon: 139.69, lat: 35.69, radius: 200, cx: 210, cy: 210, width: 420, height: 420 });
 * const layout = layoutPlaces([{ id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo", kind: "here" }], view, "beam", { size: () => ({ width: 48, height: 18 }) });
 * console.log(layout.shapes[0]?.length, layout.labels.length);
 * ```
 */
export function layoutPlaces(places: readonly Place[], view: PlaceView, look: PlaceLook, options: PlaceLayoutOptions = {}): PlaceLayout {
  const point: SurfacePoint = { x: 0, y: 0, upX: 0, upY: 0, facing: 0 };
  const shapes: PlaceShape[] = [];
  const items: { x: number; y: number; r: number; w: number; h: number; priority: number }[] = [];
  const named: number[] = [];
  const sun = options.sun ? toUnit(options.sun.lon, options.sun.lat) : null;
  for (const [index, place] of places.entries()) {
    if (!view.at(place.lon, place.lat, point) || point.facing <= EDGE) continue;
    if (point.x < -MARGIN || point.y < -MARGIN || point.x > view.width + MARGIN || point.y > view.height + MARGIN) continue;
    const size = SIZES[place.kind === "here" ? "here" : "favourite"];
    const side = Math.min(1, Math.hypot(point.upX, point.upY));
    // straight up from the ground as seen, bent towards the top of the screen as the reader comes to look straight down on it
    let dx = point.upX;
    let dy = point.upY - (1 - side);
    const norm = Math.hypot(dx, dy);
    if (norm < 1e-6) {
      dx = 0;
      dy = -1;
    } else {
      dx /= norm;
      dy /= norm;
    }
    const length = look === "ring" ? 0 : size.length * (0.55 + 0.45 * side);
    const shape: PlaceShape = {
      index,
      x: point.x,
      y: point.y,
      tipX: point.x + dx * length,
      tipY: point.y + dy * length,
      angle: Math.atan2(dx, -dy) / RAD,
      length,
      ringAngle: side > 1e-4 ? Math.atan2(point.upX, -point.upY) / RAD : 0,
      squash: Math.max(0.08, Math.min(1, point.facing)),
      ring: size.ring,
      opacity: Math.min(1, (point.facing - EDGE) / FADE),
      night: sun ? nightOf(dotUnit(place.lon, place.lat, sun)) : 0,
    };
    shapes.push(shape);
    const box = place.label ? options.size?.(place, index) : null;
    if (box) {
      items.push({ x: shape.tipX, y: shape.tipY, r: look === "ring" ? size.ring : 3, w: box.width, h: box.height, priority: place.kind === "here" ? 1 : 0 });
      named.push(index);
    }
  }
  const placed = placeLabels(items, view.width, view.height, options.maxLabels ?? 16, 64, options.taken ?? []);
  return { shapes, labels: placed.map((p) => ({ index: named[p.item]!, left: p.left, top: p.top })) };
}

/**
 * Places gathered together on the ground: where the group is drawn (the middle of its places, or the place itself when it is alone) and which places of the list are in it.
 *
 * @example
 * ```ts
 * import { groupPlaces, type PlaceGroup } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const groups: PlaceGroup[] = groupPlaces([{ id: "a", lon: 0, lat: 0 }], 8);
 * console.log(groups[0]?.members);
 * ```
 */
export interface PlaceGroup {
  lon: number;
  lat: number;
  /** Indices of its places in the list given, in the list's order. */
  members: number[];
}

/**
 * About how many CSS pixels apart two places must be on the screen before they are drawn on their own rather than as one group.
 *
 * @example
 * ```ts
 * import { PLACE_GROUP_PX } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(PLACE_GROUP_PX); // 24
 * ```
 */
export const PLACE_GROUP_PX = 24;

/**
 * The size, in degrees, of the ground's cells that crowded places are gathered in, for an Earth drawn `radius` CSS pixels across: about {@link PLACE_GROUP_PX} on the screen, rounded up to a power of two so the
 * groups change at only a few zooms and stay put while the Earth turns. 0 (gather none) when a cell would be under 1/64 of a degree, about 1.7 km.
 *
 * @param radius - The Earth's radius on the screen, in CSS pixels.
 * @returns The cell's size in degrees, from 1/64 to 32, or 0.
 *
 * @example
 * ```ts
 * import { groupCell } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(groupCell(200), groupCell(1_000_000)); // 8 0
 * ```
 */
export function groupCell(radius: number): number {
  if (!(radius > 0)) return 0;
  const degrees = PLACE_GROUP_PX / radius / RAD;
  if (degrees < 1 / 64) return 0;
  return 2 ** Math.ceil(Math.log2(Math.min(degrees, 32)));
}

/**
 * Gather crowded places: the ground is cut into bands of `cell` degrees of latitude, and each band into cells about as wide on the ground, and the places in one cell become one group drawn at their middle.
 * The cells are fixed to the ground, so the groups turn with the Earth and do not change as it turns. A `here` place is never gathered. Groups come in the order of their first place; a `cell` of 0 leaves every
 * place on its own. Thousands of places cost one pass.
 *
 * @param places - The places, as {@link cleanPlaces} makes them.
 * @param cell - The cell's size in degrees ({@link groupCell}), or 0.
 * @returns The groups, a place on its own being a group of one.
 *
 * @example
 * ```ts
 * import { groupPlaces } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const places = [{ id: "a", lon: 139.69, lat: 35.69 }, { id: "b", lon: 139.75, lat: 35.66 }, { id: "c", lon: -0.13, lat: 51.51 }];
 * console.log(groupPlaces(places, 8).map((group) => group.members)); // [[0, 1], [2]]
 * ```
 */
export function groupPlaces(places: readonly Place[], cell: number): PlaceGroup[] {
  if (!(cell > 0)) return places.map((place, i) => ({ lon: place.lon, lat: place.lat, members: [i] }));
  const out: PlaceGroup[] = [];
  const sums: [number, number, number][] = [];
  const cells = new Map<number, number>();
  const bands = Math.ceil(180 / cell);
  for (const [i, place] of places.entries()) {
    if (place.kind === "here") {
      out.push({ lon: place.lon, lat: place.lat, members: [i] });
      sums.push([0, 0, 0]);
      continue;
    }
    const band = Math.min(bands - 1, Math.floor((place.lat + 90) / cell));
    const across = Math.max(1, Math.floor((360 * Math.cos((-90 + (band + 0.5) * cell) * RAD)) / cell));
    const key = band * 100_000 + Math.min(across - 1, Math.floor(((place.lon + 180) / 360) * across));
    const u = toUnit(place.lon, place.lat);
    const found = cells.get(key);
    if (found === undefined) {
      cells.set(key, out.length);
      out.push({ lon: place.lon, lat: place.lat, members: [i] });
      sums.push(u);
    } else {
      out[found]!.members.push(i);
      const sum = sums[found]!;
      sum[0] += u[0];
      sum[1] += u[1];
      sum[2] += u[2];
    }
  }
  for (const [g, group] of out.entries()) {
    if (group.members.length < 2) continue;
    const [x, y, z] = sums[g]!;
    const length = Math.hypot(x, y, z) || 1;
    group.lat = Math.asin(Math.max(-1, Math.min(1, y / length))) / RAD;
    group.lon = Math.atan2(x, z) / RAD;
  }
  return out;
}
