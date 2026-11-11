// Where a place stands on the screen, and the shapes drawn at it. Pure: no DOM, no three.js. A view tells these functions where a place is (a `PlaceProjector`); they decide what is drawn.
import type { Place } from "./types.ts";

const RAD = Math.PI / 180;

/**
 * What a view tells the places about its picture: where a point `up` Earth radii above the surface at a longitude and latitude falls on the screen (in CSS pixels from the view's top left), whether it faces the viewer, how many pixels an Earth radius is on the screen, and the size of the box.
 *
 * @example
 * ```ts
 * import type { PlaceProjector } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const flat: PlaceProjector = { at: (lon, lat) => ({ x: lon, y: -lat, facing: true }), radiusPx: 100, width: 400, height: 300 };
 * console.log(flat.at(10, 20, 0));
 * ```
 */
export interface PlaceProjector {
  at(lon: number, lat: number, up: number): { x: number; y: number; facing: boolean };
  radiusPx: number;
  width: number;
  height: number;
}

/**
 * The orthographic projector of a view that looks straight at a place (the realistic Earth): the pose is where the middle of the disc is, the disc's radius in pixels and where its middle is in the box. A point `up` radii above the surface is
 * that much further from the middle of the Earth, so its beam comes out of the disc and rises past the edge. A point faces the viewer when it is on the near side (within the last degree of the edge it is left out, so a place does not flicker on the rim).
 *
 * @param pose - Where the middle of the disc is (`lon`, `lat`), its `radius` in pixels and its centre `cx`, `cy`.
 * @param width - The box's width in pixels.
 * @param height - The box's height in pixels.
 * @returns The projector.
 *
 * @example
 * ```ts
 * import { orthographicProjector } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const view = orthographicProjector({ lon: 139.7, lat: 35.7, radius: 200, cx: 210, cy: 210 }, 420, 420);
 * console.log(view.at(139.7, 35.7, 0), view.at(139.7, 35.7, 0.2).facing);
 * ```
 */
export function orthographicProjector(pose: { lon: number; lat: number; radius: number; cx: number; cy: number }, width: number, height: number): PlaceProjector {
  const phi0 = pose.lat * RAD;
  const sin0 = Math.sin(phi0);
  const cos0 = Math.cos(phi0);
  return {
    radiusPx: pose.radius,
    width,
    height,
    at(lon, lat, up) {
      const phi = lat * RAD;
      const delta = (lon - pose.lon) * RAD;
      const cosPhi = Math.cos(phi);
      const scale = pose.radius * (1 + up);
      const z = sin0 * Math.sin(phi) + cos0 * cosPhi * Math.cos(delta);
      return { x: pose.cx + scale * cosPhi * Math.sin(delta), y: pose.cy - scale * (cos0 * Math.sin(phi) - sin0 * cosPhi * Math.cos(delta)), facing: z > 0.02 };
    },
  };
}

/**
 * The place a given distance from a place along a bearing on the Earth's surface (a great circle), in degrees.
 *
 * @param lon - Longitude in degrees.
 * @param lat - Latitude in degrees.
 * @param bearing - The direction in degrees from north, clockwise.
 * @param angle - The distance as an angle at the Earth's middle, in radians.
 * @returns The longitude and latitude reached.
 *
 * @example
 * ```ts
 * import { destination } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * console.log(destination(0, 0, 90, Math.PI / 2)); // a quarter of the way round to the east
 * ```
 */
export function destination(lon: number, lat: number, bearing: number, angle: number): { lon: number; lat: number } {
  const phi = lat * RAD;
  const theta = bearing * RAD;
  const sinPhi2 = Math.sin(phi) * Math.cos(angle) + Math.cos(phi) * Math.sin(angle) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lon2 = lon * RAD + Math.atan2(Math.sin(theta) * Math.sin(angle) * Math.cos(phi), Math.cos(angle) - Math.sin(phi) * sinPhi2);
  return { lon: ((((lon2 / RAD + 180) % 360) + 360) % 360) - 180, lat: phi2 / RAD };
}

/**
 * How a kind of place is drawn: the colour, the sizes in pixels (the beam's length, the ring's radius, the head's radius), how opaque, and whether it pulses.
 *
 * @example
 * ```ts
 * import type { PlaceStyle } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const quiet: PlaceStyle = { color: "#ffd28a", beamPx: 24, ringPx: 6, headPx: 2.2, alpha: 0.6, pulse: false };
 * console.log(quiet.beamPx);
 * ```
 */
export interface PlaceStyle {
  color: string;
  beamPx: number;
  ringPx: number;
  headPx: number;
  alpha: number;
  pulse: boolean;
}

/**
 * How the two kinds of place are drawn when a page says nothing: `here` stands out (a cool white-cyan, a long beam, a pulse), `favourite` is quiet (a smaller, softer amber with a short beam and no pulse).
 *
 * @example
 * ```ts
 * import { PLACE_STYLES } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * console.log(PLACE_STYLES.here.beamPx > PLACE_STYLES.favourite.beamPx);
 * ```
 */
export const PLACE_STYLES: Record<"here" | "favourite", PlaceStyle> = {
  here: { color: "#7fe8ff", beamPx: 46, ringPx: 11, headPx: 3.2, alpha: 1, pulse: true },
  favourite: { color: "#ffd28a", beamPx: 24, ringPx: 6, headPx: 2.2, alpha: 0.62, pulse: false },
};

/**
 * A place as it falls on the screen at one draw: its foot, the head of its beam, its foot ring (the ground round it seen from here) and whether it is on the near side.
 *
 * @example
 * ```ts
 * import { orthographicProjector, putPlaces, type PlaceOnScreen } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const view = orthographicProjector({ lon: 0, lat: 0, radius: 200, cx: 210, cy: 210 }, 420, 420);
 * const [mark]: PlaceOnScreen[] = putPlaces([{ id: "p", lat: 10, lon: 20 }], view);
 * console.log(mark?.footX, mark?.ring.length);
 * ```
 */
export interface PlaceOnScreen {
  place: Place;
  footX: number;
  footY: number;
  headX: number;
  headY: number;
  /** The foot's ring, as points of the surface seen from here (a closed loop). */
  ring: { x: number; y: number }[];
  facing: boolean;
}

/** The beam is never taller than this many Earth radii, however short the Earth looks. */
const MAX_UP = 0.5;
/** The ring is drawn with this many points. */
const RING_POINTS = 28;
/** The places of the ring's points on the ground, worked out once for a place and a ring size: they depend on nothing the view does, so only the projection is done at each draw. */
const ringCache = new WeakMap<Place, { angle: number; lons: Float64Array; lats: Float64Array }>();

const ringOn = (place: Place, angle: number): { lons: Float64Array; lats: Float64Array } => {
  const held = ringCache.get(place);
  if (held && held.angle === angle) return held;
  const lons = new Float64Array(RING_POINTS);
  const lats = new Float64Array(RING_POINTS);
  for (let k = 0; k < RING_POINTS; k += 1) {
    const at = destination(place.lon, place.lat, (360 * k) / RING_POINTS, angle);
    lons[k] = at.lon;
    lats[k] = at.lat;
  }
  const made = { angle, lons, lats };
  ringCache.set(place, made);
  return made;
};

/**
 * Puts places on the screen: for each one, its foot, the head of a beam `beamPx` tall (taken as a height above the surface that is that many pixels, kept to half an Earth radius), and its foot ring of `ringPx` pixels across the surface. The beam is
 * sized in pixels, so it reads at any zoom; where the beam points at the viewer (a place in the middle of the disc) it is short on the screen, as a pin seen end on is. A place on the far side is `facing: false` and is not drawn.
 *
 * @param places - The places.
 * @param view - What the view tells about its picture.
 * @param styles - How each kind is drawn (`PLACE_STYLES` where left out).
 * @returns Each place on the screen, in the order given.
 *
 * @example
 * ```ts
 * import { orthographicProjector, putPlaces } from "@johnmorrisdotca/chikyu-earth/places";
 *
 * const view = orthographicProjector({ lon: 0, lat: 0, radius: 200, cx: 210, cy: 210 }, 420, 420);
 * const [tokyo] = putPlaces([{ id: "t", lat: 35.7, lon: 139.7 }, { id: "q", lat: 0, lon: 60 }], view);
 * console.log(tokyo?.facing);
 * ```
 */
export function putPlaces(places: readonly Place[], view: PlaceProjector, styles: Record<"here" | "favourite", PlaceStyle> = PLACE_STYLES): PlaceOnScreen[] {
  const out: PlaceOnScreen[] = [];
  for (const place of places) {
    const style = styles[place.kind === "here" ? "here" : "favourite"];
    const foot = view.at(place.lon, place.lat, 0);
    const up = Math.min(MAX_UP, style.beamPx / Math.max(view.radiusPx, 1));
    const head = view.at(place.lon, place.lat, up);
    const angle = style.ringPx / Math.max(view.radiusPx, 1);
    const ring: { x: number; y: number }[] = [];
    if (foot.facing) {
      const ground = ringOn(place, angle);
      for (let k = 0; k < RING_POINTS; k += 1) {
        const point = view.at(ground.lons[k]!, ground.lats[k]!, 0);
        ring.push({ x: point.x, y: point.y });
      }
    }
    out.push({ place, footX: foot.x, footY: foot.y, headX: head.x, headY: head.y, ring, facing: foot.facing });
  }
  return out;
}
