// Places on the Earth, "you are here" and favourites, drawn as markers standing out of the surface: what a place is, reading the `places` attribute, and where each
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
 * console.log(MAX_PLACES);
 * ```
 */
export const MAX_PLACES = 200;

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
}

const RAD = Math.PI / 180;
/** A place this close to the Earth's edge (the cosine of its angle from the reader) is left out; up to FADE beyond it, it fades in. */
const EDGE = 0.02;
const FADE = 0.12;
const MARGIN = 60;
const SIZES: Record<PlaceKind, { length: number; ring: number }> = { here: { length: 46, ring: 9 }, favourite: { length: 28, ring: 6 } };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/**
 * The places of a list a page handed over, made safe to draw: each needs a longitude from -180 to 180 and a latitude from -90 to 90; one without an `id` is given its place in the list, a
 * label is cut to 80 letters, a kind that is not `here` is `favourite`. Anything else is left out, and at most {@link MAX_PLACES} are kept.
 *
 * @param list - What the page gave: an array of places, or anything.
 * @returns The places to draw.
 *
 * @example
 * ```ts
 * import { cleanPlaces } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * console.log(cleanPlaces([{ lon: 2.35, lat: 48.86, label: "Paris" }, { lon: 500, lat: 0 }]));
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
 * than a favourite. Names go at the top of the stick, `here` first and then in the order given, never over one another or over a box in `taken`; a name with no free place is left out.
 *
 * @param places - The places, as {@link cleanPlaces} makes them.
 * @param view - The picture.
 * @param look - `beam`, `pin` or `ring`.
 * @param options - The size of each name, boxes already used and the most names (16).
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
