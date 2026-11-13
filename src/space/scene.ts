// The space view as a scene for kazoku-ui's shared renderer: the Earth (as in the realistic look), the Moon, the Sun and the planets in their real directions from
// the Earth's centre, lit by the Sun so that the Moon's phase and the Earth's day side come out of the light, not out of a table. Draws only when asked.
import type * as THREE from "three";
import type { AssetCache, BuildContext, Item3D, Scene3D } from "@johnmorrisdotca/kazoku-ui/renderer";
import { AIR_QUALITY, AIR_THICKNESS_DEFAULT, AIR_VERT, airFrag, airTop } from "../realistic/air.ts";
import { sphere } from "../realistic/earth.ts";
import { BODY_FRAG, CLOUD_FRAG, GLOW_FRAG, GLOW_VERT, SURFACE_FRAG, SURFACE_VERT } from "../realistic/shaders.ts";
import { createTextureSet, type ThreeParts } from "../realistic/textures.ts";
import { createTileSet, type TileSet, type TileSources } from "../realistic/tile-set.ts";
import type { TilePerspective } from "../realistic/tiles.ts";
import type { Layer } from "../realistic/tiers.ts";
import type { LightMode } from "../realistic/earth.ts";
import { createTrack, orbitPath, PLANETS, type Frame, type PlanetName, type Vec3 } from "./ephemeris.ts";
import { placeAround, placeMoon, placeSun, RADIUS, type ScaleMode } from "./scale.ts";
import type { SatelliteRef } from "../satellites/types.ts";
import { faceOffset, outsidePose, ridePose, type RideFace, type RideLook, type RideModelSize, type RideViewpoint } from "./ride.ts";
import { genericSatellite, satelliteKind } from "./generic-satellite.ts";
import { followSpin } from "./follow.ts";
import { coverBody, covers } from "../sky/cover.ts";
import type { SkyFrame } from "../sky/frame.ts";
import type { PlaceView } from "../markers/places.ts";
import { beginPlaceSprites, createPlaceSprites, type PlaceSpriteData, type PlaceSprites } from "../markers/place-sprites.ts";
import type { CountryFrame } from "../country-names/geometry.ts";
import type { GeoPoint } from "../types.ts";
import { ABOVE_MODEL_SHARE, aboveAxes, aboveModelShare, MODEL_HANDOVER_PX, MODEL_RADIUS_SHARE, modelMatrix, modelRadius, satelliteAxes } from "./satellite-model.ts";
import { createSatelliteLayer, newSatelliteState, type SatelliteLayer, type SatelliteScreen, type SatelliteState } from "./satellite-layer.ts";
import { paintMinute } from "../paint/buffer.ts";
import { createPaintTexture } from "../paint/texture.ts";
import { createBodyLabelLayer, newBodyLabelState, type BodyLabelLayer, type BodyLabelState } from "../realistic/body-label.ts";
import { createMeteorLayer, newMeteorState, type MeteorLayer, type MeteorState } from "../meteors/layer.ts";
import { createBorderLayer, newBorderState, type BorderLayer, type BorderState } from "../borders/layer.ts";
import { createGridLayer, newGridState, type GridLayer, type GridState } from "../grid/layer.ts";
import { createRouteLayer, newRouteState, type RouteLayer, type RouteState } from "../route/layer.ts";
import { subsolarPoint, unitVector } from "../realistic/sun.ts";

type Three = ThreeParts;
/** The most satellites ringed and named at once, over all the labelled groups. */
const MAX_MARKED = 80;
const RAD = Math.PI / 180;
const FOV = 35;
/** How big a satellite seen from outside by a ride from itself is drawn: its radius is this share of the height of the view (a model about a fifth of the height across; the satellite is a few metres, so this is not to scale). */
const OUTSIDE_RADIUS_SHARE = 0.1;
/** The share of the view's height an outside ride along (looking along the way it goes) draws the satellite's radius at: it sits at the bottom middle with part of it below the bottom edge, large enough to read and to be drawn sharp (MODULES-1303). */
const OUTSIDE_ALONG_SHARE = 0.17;
/** How much of the view's shorter side the Earth's disc fills at zoom 1 when the page does not say: 0.9, so the atmosphere's glow (8% beyond the disc) is inside the view and never cut. */
export const DEFAULT_EARTH_SIZE = 0.9;

/**
 * The camera's distance, in radii of the body it looks at, at which the body's disc fills `size` of the view's shorter side (`aspect` is the view's width over its height; the field of view is vertical).
 * Pure; `size` may be above 1 for a body drawn larger than the view.
 *
 * @param size - Share of the shorter side the disc's diameter fills.
 * @param aspect - Width over height of the view.
 * @returns The distance, in the body's radii.
 *
 * @example
 * ```ts
 * import { fitDistance } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(fitDistance(0.9, 16 / 9).toFixed(2));
 * ```
 */
export function fitDistance(size: number, aspect: number): number {
  const across = Math.max(0.02, Math.min(50, size)) * Math.min(1, Math.max(0.05, aspect));
  return Math.sqrt(1 + 1 / (across * Math.tan((FOV / 2) * RAD)) ** 2);
}

/**
 * The camera at the centre of the Earth's view: `ground` is held over a place on the ground (the Earth keeps still, the clock moves the light), `space` is held in the stars at the direction the place was in when it was set (the Earth turns beneath it), `sun` is held on the Sun's side (the day and night line keeps its place while the Earth turns).
 *
 * @example
 * ```ts no-run
 * import type { CameraMode, ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const hold = (space: ChikyuSpace, mode: CameraMode): void => {
 *   space.camera = mode;
 * };
 * console.log(typeof hold);
 * ```
 */
export type CameraMode = "ground" | "space" | "sun";
const LAYERS: Layer[] = ["day", "night", "clouds", "water", "moon"];
/** The moons of a planet are shown once the planet is this many CSS pixels across its radius, and each is drawn at least this many pixels across its radius. */
const MOON_MIN_PLANET_PX = 4;
const MOON_MIN_PX = 2.2;
/** A moon that has been out of sight this long is let go (its pictures too). */
export const MOON_KEEP_MS = 4000;
/**
 * A body of the Sun, the Moon and the planets is made by the painter (and so gets its mapped picture) only when it is in the view and at least this many CSS pixels across its radius; a smaller one, or one out of the view, is a plain sphere of the right colour (the Moon, the view's own Moon).
 * It is let go (its pictures with it) once it has been smaller than `BODY_LET_GO_PX`, or out of the view, for `BODY_KEEP_MS`.
 */
export const BODY_MAKE_PX = 6;
export const BODY_LET_GO_PX = 3;
export const BODY_KEEP_MS = MOON_KEEP_MS;
/** For a reader who asked for reduced motion, the pictures that arrive within this time of one that was drawn ask for one draw between them (none at all while the clock steps). */
export const ARRIVAL_GATHER_MS = 1000;

const PLAIN_COLOR = (name: string): string => (name === "Sun" ? "#ffb347" : (COLORS as Record<string, string>)[name] ?? "#9a948b");
/**
 * The eleven bodies the space view places, names and lets a reader choose: the Earth, the Sun, the Moon, the seven other planets and Pluto.
 *
 * @example
 * ```ts no-run
 * import { BODY_NAMES } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * console.log(BODY_NAMES.join(", "));
 * ```
 */
export const BODY_NAMES = ["Earth", "Sun", "Moon", ...PLANETS] as const;

/**
 * The name of one of the bodies in `BODY_NAMES`.
 *
 * @example
 * ```ts no-run
 * import { BODY_NAMES, type BodyName } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const mars: BodyName = "Mars";
 * console.log(BODY_NAMES.includes(mars));
 * ```
 */
export type BodyName = (typeof BODY_NAMES)[number];

const COLORS: Record<PlanetName, string> = { Mercury: "#a79f96", Venus: "#e3c98a", Mars: "#c1593a", Jupiter: "#d2b48c", Saturn: "#e4d4a0", Uranus: "#9fd6dc", Neptune: "#4a6bd6", Pluto: "#c9b8a6" };
const ORBIT_COLORS: Record<PlanetName, string> = { Mercury: "#6b655f", Venus: "#8c7c55", Mars: "#7a4034", Jupiter: "#85735a", Saturn: "#8d8567", Uranus: "#5f8a8e", Neptune: "#34499a", Pluto: "#7d7468" };

/**
 * What a camera can ride along with: the name of one of the bodies, or a satellite of a group (`{ group, index }`).
 *
 * @example
 * ```ts no-run
 * import type { RideTarget } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const targets: RideTarget[] = ["Moon", { group: "stations", index: 0 }];
 * console.log(targets.length);
 * ```
 */
export type RideTarget = BodyName | SatelliteRef;

export interface RideState {
  target: RideTarget;
  /** `from`: the camera is at the body, looking at the Earth. `follow`: the camera keeps a fixed distance from it, looking at it. `above` (a satellite): the camera is on the line from the Earth's centre through the satellite, looking straight down. */
  view: "from" | "follow" | "above";
  look: RideLook;
  /** The facing the yaw and tilt look round from, or null. */
  face: RideFace | null;
  /** For `follow` a satellite: how far the camera keeps, in kilometres. */
  distanceKm: number;
  /** `outside`: a ridden satellite is in the picture (the camera a little behind and above it in `from`, a drawing of it where the page has no model); `inside`: as a ride was before, the camera at the satellite and no drawing of it where the page has no model. */
  viewpoint: RideViewpoint;
  /** How the model of a satellite seen from above is sized as the camera rises: `distance` shrinks it and hands over to the mark, `fixed` keeps one share of the picture. */
  modelSize: RideModelSize;
}

/** The camera as the last draw left it, for the next one to start from when the ride changes. */
export interface Pose {
  p: Vec3;
  q: [number, number, number, number];
  fov: number;
  valid: boolean;
}

export interface SpaceModel {
  /** Moment shown, milliseconds since the epoch. */
  time: number;
  mode: ScaleMode;
  /** The shared controls' yaw, tilt and zoom. */
  view: { yaw: number; tilt: number; zoom: number };
  /** The home place: the camera starts above it. */
  centre: { lon: number; lat: number };
  /** Which way the camera is held (see `CameraMode`). */
  camera: CameraMode;
  /** How many times its real thickness the air is drawn, 1 to 5 (`AIR_THICKNESS_DEFAULT` until the element says otherwise); read at every draw. */
  airThickness: number;
  /** Degrees an hour the cloud picture is made to move eastward against the ground: 0, the default (it is one snapshot, not a forecast). */
  cloudDrift: number;
  /** For the `space` camera: the Earth's turn against the stars (degrees) at the moment the camera was set, so it stays in the stars while the Earth turns beneath; null until the next draw sets it. */
  cameraSpin: number | null;
  /** How much of the Earth's turn the space camera takes: 0 holds the stars, 1 turns with the Earth. */
  follow: number;
  /** The share of the view's shorter side the Earth's disc fills at zoom 1, and where its centre is in the view (0 to 1 across and down; 0.5, 0.5 is the middle). */
  earth: { size: number; x: number; y: number };
  /** The camera's distance at zoom 1 in radii of the body it looks at, as the last draw worked it out from the view's shape and `earth.size`. */
  fit: number;
  orbits: boolean;
  labels: boolean;
  /** Milliseconds of game time one second of wall time covers (the ephemeris is looked up once per such span). */
  stepMs: number;
  /** The body the camera looks at, and (in `zoom`) fills the view with at 1x. */
  focus: BodyName;
  /** How the Earth is lit (see `LightMode`); the Sun, the Moon and the planets keep their true places either way. */
  light: LightMode;
  /** How the painter draws the Sun, the planets and their moons (one of its `looks`, or `plain` for the sphere in the right colour); empty for its first. */
  bodies: string;
  /** Filled at each draw. */
  drawn: { frame: Frame; distance: number; radiusPx: number } | null;
  /** What the painter has made now: the Sun and planets with a drawing, the moons shown and the moons held (shown, or gone from the view for less than `MOON_KEEP_MS`), whether the Moon is the painter's, and the bodies with finer map tiles on them (set at each draw). */
  painted: { bodies: number; moons: number; held: number; moon: boolean; tiles: number; mapped: number; pending: number };
  /** How many times astronomy-engine has been asked for a frame. */
  lookups: number;
  /** Game seconds a second (the clock's speed). */
  speed: number;
  /** The satellites shown, the one chosen, and what the last draw did with them. */
  satellites: SatelliteState;
  /** Meteors seen from space, on the Earth (src/meteors/layer.ts): off unless the element switches them on. */
  meteors: MeteorState;
  /** The name written on the Earth (src/realistic/body-label.ts): off unless the element sets it. */
  bodyLabel: BodyLabelState;
  /** The borders of the countries and of their regions, on the Earth (src/borders/layer.ts): off unless the element switches them on. */
  borders: BorderState;
  /** The meridians and parallels on the Earth (src/grid/layer.ts): off unless the element switches them on. */
  grid: GridState;
  /** A route between two places, on the Earth (src/route/layer.ts): off unless the element sets it. */
  route: RouteState;
  /** The body or satellite the camera rides along with, or null. */
  ride: RideState | null;
  /** Set at each draw: the target of the ride could not be placed (a satellite whose elements are too old, or that is gone), so the ordinary camera was used. */
  rideLost: boolean;
  /** A camera move in progress from where the last draw left it: when it began (ms of the page's clock), how long it takes. */
  transition: { start: number; duration: number; from: { p: Vec3; q: [number, number, number, number]; fov: number } } | null;
  /** The shared controls' view as the last draw used it, and how tall the view was (CSS pixels): `setView` skips a draw for a turn that moves nothing by half a pixel. */
  drawnView: { yaw: number; tilt: number; zoom: number } | null;
  /** The point of the ground the view would look at with yaw and tilt 0, as of the last draw (the middle of the view is this less the yaw and tilt), or null while the camera rides or looks at another body. */
  lookBase: GeoPoint | null;
  heightPx: number;
  pose: Pose;
  /** Pixels a second that riding makes things move on the screen at 1x clock speed (0 when not riding): the draw rate follows it. */
  rideMotion: number;
  /** The heading of a riding camera in degrees, added up change by change from the controls' wrapped yaw (`rideTurnDegrees`): a drag the whole way round is a turn the whole way round, and a change of zoom swings nothing. */
  rideTurn: number;
  /** How far the riding camera is from the Earth's centre in Earth radii as of the last draw, or null when none rides: the range of tilt that does something follows it. */
  rideDistance: number | null;
  /** The satellite at a point of the view (CSS pixels), within a radius, if a draw has been made and one is there. */
  pick: ((x: number, y: number, radius: number) => SatelliteRef | null) | null;
  /** The followed satellite's model, when there is one drawn: where its middle is on the screen (CSS pixels), as of the last draw. */
  followModel: { x: number; y: number; shown: boolean; parts: number; radiusPx: number; box: { left: number; top: number; right: number; bottom: number }; axes: { x: Vec3; y: Vec3; z: Vec3 } } | null;
  /** The map tiles laid over the Earth while the scene is built: what they are doing, for a page or a test. */
  tiles: TileSet | null;
  /** Where a satellite of a shown group is on the screen as of the last draw (`placeSatellite`), or `null`. */
  placeSatellite: ((ref: SatelliteRef) => SatelliteScreen | null) | null;
  ratio(): number;
}

export const newSpaceModel = (): SpaceModel => ({
  time: Date.now(),
  mode: "compressed",
  view: { yaw: 0, tilt: 0, zoom: 1 },
  centre: { lon: 0, lat: 0 },
  camera: "space",
  airThickness: AIR_THICKNESS_DEFAULT,
  cloudDrift: 0,
  cameraSpin: null,
  follow: 0,
  earth: { size: DEFAULT_EARTH_SIZE, x: 0.5, y: 0.5 },
  fit: fitDistance(DEFAULT_EARTH_SIZE, 1),
  orbits: true,
  labels: true,
  stepMs: 1000,
  focus: "Earth",
  bodies: "",
  light: "sun",
  drawn: null,
  painted: { bodies: 0, moons: 0, held: 0, moon: false, tiles: 0, mapped: 0, pending: 0 },
  lookups: 0,
  speed: 1,
  ride: null,
  rideLost: false,
  transition: null,
  drawnView: null,
  lookBase: null,
  heightPx: 420,
  pose: { p: [0, 0, 0], q: [0, 0, 0, 1], fov: FOV, valid: false },
  rideMotion: 0,
  rideTurn: 0,
  rideDistance: null,
  satellites: newSatelliteState(),
  meteors: newMeteorState(),
  bodyLabel: newBodyLabelState(),
  borders: newBorderState(),
  grid: newGridState(),
  route: newRouteState(),
  pick: null,
  placeSatellite: null,
  followModel: null,
  tiles: null,
  ratio: () => Math.min(globalThis.devicePixelRatio || 1, 2),
});

/** Where a body is on the screen: its centre and its apparent radius, in CSS pixels in the box. */
export interface BodyPlace {
  x: number;
  y: number;
  r: number;
}

/**
 * One body as drawn by a painter: an object of radius 1 at the origin, which the scene places, scales and (for the Sun) turns to face the camera.
 *
 * @example
 * ```ts no-run
 * import type { BodyDrawing } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const drawing = { object: undefined as never, dispose: () => undefined } satisfies BodyDrawing;
 * console.log(typeof drawing.dispose);
 * ```
 */
export interface BodyDrawing {
  object: THREE.Object3D;
  /** Told at each draw the unit direction from the body to the Sun, in scene axes (x to the vernal equinox, y north). */
  light?(toSun: Vec3): void;
  /**
   * Told at each draw, after the object is placed and scaled: the direction to the Sun, the moment shown, how many CSS pixels across its radius the body is (a sharper picture is worth fetching only for a big one), and the
   * camera with the size of the view in CSS pixels (`view`), so a body big in the view can lay finer map tiles over the part of it that is seen, and a glow can face the camera.
   */
  update?(info: { toSun: Vec3; ms: number; radiusPx: number; view?: BodyView }): void;
  /** What the window of finer map tiles on the body is doing (`shown` is the level on it now, or `null`), for a drawing that has one. */
  readonly tiles?: { shown: number | null } | undefined;
  /** True to have the scene turn the object to face the camera (a disc or a glow). */
  billboard?: boolean;
  dispose(): void;
}

/**
 * The camera that draws the bodies and the size of its view in CSS pixels, as the space view tells a drawing at each draw. The camera's matrices are current.
 *
 * @example
 * ```ts no-run
 * import type { BodyView } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const across = (view: BodyView): number => view.width;
 * console.log(typeof across);
 * ```
 */
export interface BodyView {
  camera: THREE.Camera;
  width: number;
  height: number;
}

/**
 * The seam for drawing a followed satellite as a 3D model: the package ships no model, the page supplies them. `has` says whether there is a model for a satellite (by NORAD number: `25544` is the ISS); `make` makes it as a drawing of radius 1
 * (its middle at the origin, its long axis along +x, its top, the side that faces space, along +z, and its left along +y), at once or later (a promise); the view places it where the satellite is, points it the way it flies, sizes it to read and
 * gives it the Sun's direction (`light`, `update`). `null` from `make` is no model: the satellite stays a dot.
 *
 * @example
 * ```ts no-run
 * import type { SatellitePainter } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const painter: SatellitePainter = { has: (norad) => norad === 25544, make: async () => null };
 * console.log(painter.has(25544));
 * ```
 */
export interface SatellitePainter {
  has(noradId: number): boolean;
  make(three: Three, noradId: number, context: PaintContext): BodyDrawing | null | Promise<BodyDrawing | null>;
}

/**
 * What the scene tells a painter when it makes a body.
 *
 * @example
 * ```ts no-run
 * import type { PaintContext } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const context: PaintContext = { look: "painted", invalidate: () => undefined, ratio: 2, maxTexture: 2048 };
 * console.log(context.look);
 * ```
 */
export interface PaintContext {
  /** The look asked for: one of the painter's `looks`, or empty for its first. */
  look: string;
  /** Ask for a new draw (a picture has arrived). */
  invalidate(): void;
  /** Device pixels to a CSS pixel. */
  ratio: number;
  /** The widest picture, in pixels, the GPU should be given. */
  maxTexture: number;
  /** True to draw every body that has a surface picture from it, in any look but `plain`: the space view asks for this, so a planet or the Moon is never shown shaded where it has a real map. */
  mapped?: boolean;
}

/**
 * One moon of a planet at a moment: its name, where it is from the planet's centre and how big it is, both in radii of the planet, in scene axes.
 *
 * @example
 * ```ts no-run
 * import type { BodyMoon } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const io: BodyMoon = { name: "Io", offset: [5.9, 0, 0], radius: 0.0255 };
 * console.log(io.name);
 * ```
 */
export interface BodyMoon {
  name: string;
  offset: Readonly<Vec3>;
  radius: number;
}

/**
 * The seam for drawing the Sun, the planets and their moons. The space view places them, sizes them, lights them and labels them; a painter only makes what is drawn at
 * each place. The default (`plainPainter`) is a sphere in the body's colour, and a glow for the Sun. Another package can supply better looking ones:
 * `@johnmorrisdotca/wakusei-planets/painter` draws the real Sun, planets, Pluto and moons.
 * `make` may return a drawing at once or later (a promise); a drawing may update itself and ask for a redraw when a picture arrives. `moons` is optional: the moons the painter can
 * draw for a planet at a moment, which the view shows round the planet when it is near enough to see them. `looks` names what `context.look` may be.
 *
 * @example
 * ```ts no-run
 * import { plainPainter, type BodyPainter } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const painter: BodyPainter = { make: (three, name) => plainPainter.make(three, name) };
 * console.log(typeof painter.make);
 * ```
 */
export interface BodyPainter {
  make(three: ThreeParts, name: string, context?: PaintContext): BodyDrawing | Promise<BodyDrawing>;
  moons?(planet: PlanetName, ms: number): readonly BodyMoon[];
  looks?: readonly string[];
  /** Whose pictures the painter draws, in English and Japanese: the space view writes it under the picture while the painter draws the bodies. */
  credit?: { en: string; ja: string };
}

export interface SpaceDeps {
  assets: AssetCache;
  textureBase: () => string;
  cap: () => number;
  invalidate: () => void;
  onError?: (error: unknown) => void;
  onTier?: (layer: Layer, width: number) => void;
  /** How much the air costs: `full` (12 samples along the ray and 4 toward the Sun) or `light` (6 and 2, for a small or slow device). Read once, when the scene is built. */
  air?: () => "full" | "light";
  /** Where each body is on the screen, in CSS pixels in the box, or null when it is behind the camera. Called at each draw. */
  onLabels?: (places: Record<BodyName, BodyPlace | null>) => void;
  /** Where the sky falls on the screen at this draw, and the bodies that cover it (the names of the stars and the constellation lines are laid over it). Called at each draw. */
  onSky?: (frame: SkyFrame) => void;
  /** Where points of the Earth's surface fall on the screen at this draw, for the places drawn on it. Called at each draw. */
  onPlaces?: (view: PlaceView) => void;
  /** The rings the places' layer wants drawn in one draw call, read right after `onPlaces`. */
  placeSprites?: () => PlaceSpriteData | null;
  /** Told once, when the rings of the places that are not markers of their own were first wanted: whether the picture can draw them (false when the three.js parts handed over lack `Points`). */
  onPlaceRings?: (drawn: boolean) => void;
  /** Where the Earth is on the screen (its disc) and how to find a place on it, for the names of cities and countries. Called at each draw, with `null` while no Earth is shown. */
  onCities?: (frame: CountryFrame | null) => void;
  /** The name written on the Earth could not be made. */
  onLabelError?: (error: unknown) => void;
  /** Where the chosen satellite is on the screen, or null. Called at each draw while a satellite is chosen (and once when it is let go). */
  onSelected?: (place: { x: number; y: number } | null) => void;
  /** Where the satellite under the pointer is, or null. Called at each draw while one is under the pointer (and once when it is let go). */
  onHover?: (place: { x: number; y: number; visible: boolean } | null) => void;
  /** Where each member of a labelled group is on the screen at this draw (the groups of `model.satellites.marked`); an empty list once when the last group is let go. */
  onSatelliteMarks?: (marks: { ref: SatelliteRef; x: number; y: number; visible: boolean; heightKm: number; occluded: boolean }[]) => void;
  /** Called at the end of a draw while the camera is moving from one ride to another, so the next frame is asked for (at the page's frame cap). */
  onMoving?: () => void;
  /** The target of the ride could not be placed at this draw. */
  onRideLost?: () => void;
  /** The satellites could not be drawn (the three.js parts handed over lack `Points`). */
  onSatellitesError?: (error: unknown) => void;
  /** The painted satellite trail. Read at every draw; nothing is uploaded while `step` returns false. */
  paint?: { data(): Uint8Array; width: number; height: number; step(ms: number): boolean; span(): number; on(): boolean };
  /** How the Sun, the planets and their moons are drawn; left out, plain spheres in the right colours (see `BodyPainter`). */
  painter?: BodyPainter;
  /** The models of large satellites, for a followed satellite (see `SatellitePainter`); none, and a satellite is a dot. */
  satellitePainter?: () => SatellitePainter | undefined;
  /** The painter could not make a body (the three.js parts handed over lack something it needs); the body is drawn plain instead. */
  onPainterError?: (error: unknown) => void;
  /** A body the painter drew changed (a picture arrived, a window of its tiles changed, a body was made): the painter's credit, which names the pictures on the screen now, may have changed. Told before the redraw is asked for. */
  onBodies?: () => void;
  /** The map source of each layer now (the folder of the `tiles` attribute), or none: the Earth then keeps the package's own pictures. Read at every draw. */
  sources?: () => TileSources;
  /** Told once when the tile set has been read: the width in pixels of the finest level of each of its layers. */
  onTiles?: (layers: Record<string, number>) => void;
  /** Told at the end of a draw, after the map tiles are placed, so a credit line can follow which tiles are on screen. */
  onTilesDrawn?: () => void;
}

/** An inertial direction from the Earth's centre, in scene axes, for right ascension and declination in degrees. */
const direction = (ra: number, dec: number): Vec3 => [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.sin(dec * RAD), -Math.cos(dec * RAD) * Math.sin(ra * RAD)];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A square facing +z, 2 x 2, with uvs 0 to 1. */
function quad(three: Three): THREE.BufferGeometry {
  const g = new three.BufferGeometry();
  g.setAttribute("position", new three.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setAttribute("uv", new three.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/**
 * The default look: a sphere in the planet's colour, lit by the Sun, and for the Sun a glowing disc.
 *
 * @example
 * ```ts no-run
 * import { plainPainter } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(typeof plainPainter.make);
 * ```
 */
export const plainPainter: { make(three: ThreeParts, name: string): BodyDrawing } & BodyPainter = {
  make(three, name) {
    if (name === "Sun") {
      const geometry = quad(three);
      const material = new three.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { tint: { value: new three.Color(PLAIN_COLOR(name)) } }, transparent: true, depthWrite: false });
      const mesh = new three.Mesh(geometry, material);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      mesh.scale.setScalar(3.2);
      const group = new three.Group();
      group.add(mesh);
      return {
        object: group,
        billboard: true,
        dispose() {
          geometry.dispose();
          material.dispose();
        },
      };
    }
    const geometry = sphere(three, 48, 24);
    const sun = { value: new three.Vector3(1, 0, 0) };
    const material = new three.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: BODY_FRAG, uniforms: { map: { value: null }, tint: { value: new three.Color(PLAIN_COLOR(name)) }, textured: { value: 0 }, sunDir: sun, ambient: { value: 0.2 } } });
    return {
      object: new three.Mesh(geometry, material),
      light(toSun) {
        sun.value.set(toSun[0], toSun[1], toSun[2]);
      },
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    };
  },
};

export function createSpaceItem(model: SpaceModel, deps: SpaceDeps): Item3D<Three> {
  return {
    key: "chikyu-earth:space",
    async build({ three, width, height }: BuildContext<Three>): Promise<Scene3D> {
      let size = { width, height };
      let ended = false;
      // Pictures arrive one by one (the Earth's maps, its finer tiles, a body's), each asking for a draw. For a reader who asked for reduced motion they are gathered, to at most one draw a second: while the clock steps
      // (at least once a second) the next step shows them, so they ask for nothing; at rest, one after a quiet second is drawn at once and those that follow within the second ask for one draw when it ends.
      let arrivalAt = Number.NEGATIVE_INFINITY;
      let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
      const arrivalDraw = (): void => {
        if (!(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
          deps.invalidate();
          return;
        }
        // real time steps once a minute unless something rides, so it is gathered like rest
        if (model.speed !== 0 && (model.speed !== 1 || model.ride !== null)) return;
        if (arrivalTimer !== undefined) return;
        const now = performance.now();
        if (now - arrivalAt >= ARRIVAL_GATHER_MS) {
          arrivalAt = now;
          deps.invalidate();
          return;
        }
        model.painted.pending += 1;
        arrivalTimer = setTimeout(() => {
          arrivalTimer = undefined;
          if (ended) return;
          model.painted.pending -= 1;
          arrivalAt = performance.now();
          deps.invalidate();
        }, arrivalAt + ARRIVAL_GATHER_MS - now);
      };
      const textures = await createTextureSet(three, LAYERS, {
        assets: deps.assets,
        textureBase: deps.textureBase,
        cap: deps.cap,
        invalidate: arrivalDraw,
        ...(deps.onError ? { onError: deps.onError } : {}),
        ...(deps.onTier ? { onTier: deps.onTier } : {}),
      });
      const uniform = textures.uniforms as Record<Layer, { value: THREE.Texture | null }>;
      const track = createTrack(model.stepMs);
      let trackStep = model.stepMs;

      const sunEarth = { value: new three.Vector3(1, 0, 0) };
      /** The Sun in the Earth's own axes (the surface program finds where a cloud's shadow falls from it). */
      const sunLocal = { value: new three.Vector3(1, 0, 0) };
      const cloudShift = { value: 0 };
      const grid = sphere(three, 96, 48);
      const solid = sphere(three, 48, 24);

      const earthMaterial = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: SURFACE_FRAG,
        uniforms: { dayMap: uniform.day, nightMap: uniform.night, waterMap: uniform.water, cloudMap: uniform.clouds, sunDir: sunEarth, sunLocal, cloudShift, lights: { value: 1 }, boost: { value: 0 }, ortho: { value: 0 } },
      });
      const paint = createPaintTexture(three, { data: () => deps.paint?.data() ?? new Uint8Array(4), width: deps.paint?.width ?? 1, height: deps.paint?.height ?? 1 });
      Object.assign(earthMaterial.uniforms, paint.uniforms);
      const cloudMaterial = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: { cloudMap: uniform.clouds, sunDir: sunEarth, shift: cloudShift, opacity: { value: 0.9 } },
        transparent: true,
        depthWrite: false,
      });
      // the air: light scattered once on its way through a shell 100 km thick, worked out for each pixel (the same program as the realistic Earth's), in the world's own axes
      const atmosphereMaterial = new three.ShaderMaterial({
        vertexShader: AIR_VERT,
        fragmentShader: airFrag(AIR_QUALITY[deps.air?.() ?? "full"]),
        uniforms: { sunDir: sunEarth, ortho: { value: 0 }, thick: { value: model.airThickness } },
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
      });

      const earth = new three.Mesh(grid, earthMaterial);
      // the finer map tiles, laid over the Earth's own picture where the camera is near enough to need them (they turn with the Earth: they are its children)
      const tiles: TileSet = createTileSet(
        three,
        earth as unknown as THREE.Group,
        { sunDir: sunEarth, lights: earthMaterial.uniforms["lights"] as { value: number }, boost: earthMaterial.uniforms["boost"] as { value: number }, ortho: earthMaterial.uniforms["ortho"] as { value: number }, water: uniform.water, night: uniform.night, extra: { cloudMap: uniform.clouds, sunLocal, cloudShift } },
        { assets: deps.assets, sources: () => deps.sources?.() ?? {}, cap: deps.cap, invalidate: arrivalDraw, ...(deps.onTiles ? { onManifest: deps.onTiles } : {}) },
      );
      model.tiles = tiles;
      const clouds = new three.Mesh(grid, cloudMaterial);
      clouds.scale.setScalar(1.006);
      clouds.renderOrder = 3;
      const glow = new three.Mesh(grid, atmosphereMaterial);
      glow.scale.setScalar(airTop(model.airThickness));
      glow.renderOrder = 4;
      glow.frustumCulled = false;

      const moonSun = { value: new three.Vector3(1, 0, 0) };
      const moon = new three.Mesh(
        solid,
        new three.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: BODY_FRAG, uniforms: { map: uniform.moon, tint: { value: new three.Color("#bbbbbb") }, textured: { value: 1 }, sunDir: moonSun, ambient: { value: 0.03 } } }),
      );

      const painter = deps.painter ?? plainPainter;
      const scene = new three.Scene();
      scene.add(earth, clouds, glow, moon);

      // the Sun, the planets and the moons are made by the painter, one slot each: a slot is filled again when the look changes, and may be filled later (a painter may be slow)
      interface Slot {
        name: string;
        drawing: BodyDrawing | undefined;
        look: string | null;
        token: number;
        plain: boolean;
        /** True while the body is out of the view or too small for its map: it is then a plain sphere (or none, the Moon), and the painter is not asked for it. */
        small: boolean;
        /** When it was last in the view and big enough. */
        bigAt: number;
        /** Whether the drawing in the slot is the painter's (not a plain sphere): the pictures the painter holds. */
        mapped: boolean;
      }
      const newSlot = (name: string): Slot => ({ name, drawing: undefined, look: null, token: 0, plain: false, small: true, bigAt: 0, mapped: false });
      /** How many drawings the painter's pictures are on now: told to the element, which writes the painter's credit only while there are any. */
      const tally = (): void => {
        let mapped = sunSlot.mapped ? 1 : 0;
        if (moonSlot.mapped) mapped += 1;
        for (const p of planets.values()) if (p.slot.mapped) mapped += 1;
        for (const held of moonSlots.values()) if (held.slot.mapped) mapped += 1;
        model.painted.mapped = mapped;
      };
      const lookNow = (): string => model.bodies || painter.looks?.[0] || "";
      const empty = (slot: Slot): void => {
        slot.token += 1;
        if (!slot.drawing) return;
        scene.remove(slot.drawing.object);
        slot.drawing.dispose();
        slot.drawing = undefined;
        slot.mapped = false;
      };
      const fill = (slot: Slot, isMoon = false): void => {
        const look = lookNow();
        const key = slot.small && !isMoon ? `small|${look}` : look;
        if (slot.look === key) return;
        empty(slot);
        slot.look = key;
        const token = slot.token;
        const viaPainter = !(slot.plain || look === "plain" || (slot.small && !isMoon));
        const arrive = (made: BodyDrawing): void => {
          if (ended || slot.token !== token) {
            made.dispose();
            return;
          }
          slot.drawing = made;
          slot.mapped = viaPainter;
          scene.add(made.object);
          tally();
          deps.onBodies?.();
          arrivalDraw();
        };
        const fail = (error: unknown): void => {
          if (ended || slot.token !== token) return;
          deps.onPainterError?.(error);
          if (!isMoon && !slot.plain) {
            slot.plain = true;
            slot.look = null;
            fill(slot);
          }
        };
        try {
          const made = (viaPainter ? painter : plainPainter).make(three, slot.name, { look, invalidate: () => (deps.onBodies?.(), arrivalDraw()), ratio: model.ratio(), maxTexture: deps.cap(), mapped: true });
          if (typeof (made as Promise<BodyDrawing>).then === "function") {
            // a picture asked for and not yet here is counted, so a page (a test) can tell that more draws are still to come
            model.painted.pending += 1;
            (made as Promise<BodyDrawing>).then(
              (drawing) => {
                if (!ended) model.painted.pending -= 1;
                arrive(drawing);
              },
              (error: unknown) => {
                if (!ended) model.painted.pending -= 1;
                fail(error);
              },
            );
          } else arrive(made as BodyDrawing);
        } catch (error) {
          fail(error);
        }
      };
      const sunSlot = newSlot("Sun");
      // the Moon from the painter when there is one (its picture, and finer tiles where it has them); the view's own Moon until it arrives, and if it cannot be made
      const moonSlot = newSlot("Moon");
      type Planet = { slot: Slot; orbit: THREE.LineLoop; positions: Float32Array; samples: Vec3[]; epoch: number; toSun: Vec3 };
      const planets = new Map<PlanetName, Planet>();
      for (const name of PLANETS) {
        const positions = new Float32Array(96 * 3);
        const lineGeometry = new three.BufferGeometry();
        lineGeometry.setAttribute("position", new three.BufferAttribute(positions, 3));
        const orbit = new three.LineLoop(lineGeometry, new three.LineBasicMaterial({ color: ORBIT_COLORS[name], transparent: true, opacity: 0.7 }));
        orbit.frustumCulled = false;
        scene.add(orbit);
        planets.set(name, { slot: newSlot(name), orbit, positions, samples: [], epoch: Number.NaN, toSun: [1, 0, 0] });
      }
      const moonSlots = new Map<string, { slot: Slot; seen: number }>();
      let releaseTimer: ReturnType<typeof setTimeout> | undefined;
      /** Asks for one more draw when a body that has shrunk or gone from the view is due to be let go (a view at rest draws nothing, so it would be kept for ever). */
      let bodyTimer: ReturnType<typeof setTimeout> | undefined;
      let meteors: MeteorLayer | null = null;
      let meteorTimer: ReturnType<typeof setTimeout> | undefined;
      let nameOn: BodyLabelLayer | null = null;
      let borders: BorderLayer | null = null;
      const placeRings: { sprites: PlaceSprites | null; tried: boolean } = { sprites: null, tried: false };
      let gridLayer: GridLayer | null = null;
      let routeLayer: RouteLayer | null = null;
      let marksTold = false;
      // the followed satellite's model: which satellite it is for, the drawing once it is made, and a count so that a model made for a satellite no longer followed is let go
      const modelSlot: { key: string; drawing: BodyDrawing | null; turn: number; parts: number; axes: { x: Vec3; y: Vec3; z: Vec3 } | null } = { key: "", drawing: null, turn: 0, parts: 0, axes: null };
      const dropModel = (): void => {
        if (!modelSlot.drawing) return;
        scene.remove(modelSlot.drawing.object);
        modelSlot.drawing.dispose();
        modelSlot.drawing = null;
      };

      let layer: SatelliteLayer | undefined;
      let hoverShown = false;
      const rideState = new Float64Array(6);
      let selectedShown = false;
      const camera = new three.PerspectiveCamera(FOV, width / Math.max(1, height), 0.05, 1000);
      const target = new three.Vector3();
      const desiredQ = camera.quaternion.clone();
      const fromQ = camera.quaternion.clone();
      const projected = new three.Vector3();
      const upAxis = new three.Vector3(0, 1, 0);
      const eye = new three.Vector3();
      const ray = new three.Vector3();

      const placeAll = (at: Frame): Record<BodyName, Vec3> => {
        const sunAt = placeSun(model.mode, at.sun);
        const all = { Earth: [0, 0, 0] as Vec3, Moon: placeMoon(model.mode, at.moon), Sun: sunAt } as Record<BodyName, Vec3>;
        for (const name of PLANETS) all[name] = placeAround(model.mode, sunAt, [at.planets[name][0] - at.sun[0], at.planets[name][1] - at.sun[1], at.planets[name][2] - at.sun[2]]);
        return all;
      };
      const labelFor = (v: Vec3): { x: number; y: number } | null => {
        projected.set(v[0], v[1], v[2]).project(camera);
        if (projected.z > 1 || projected.z < -1) return null;
        return { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height };
      };

      return {
        scene,
        camera,
        update() {
          const fit = fitDistance(model.earth.size, size.width / Math.max(1, size.height));
          model.fit = fit;
          const frame = track.at(model.time);
          model.lookups = track.lookups;
          if (model.stepMs !== trackStep) {
            trackStep = model.stepMs;
            track.setStep(model.stepMs);
          }
          const mode = model.mode;
          const sunPos = placeSun(mode, frame.sun);
          const moonPos = placeMoon(mode, frame.moon);
          const helioOf = (planet: Vec3): Vec3 => [planet[0] - frame.sun[0], planet[1] - frame.sun[1], planet[2] - frame.sun[2]];

          // the Earth, turned by the sidereal time; light from the Sun
          earth.rotation.set(0, (frame.spin + 90) * RAD, 0);
          clouds.rotation.copy(earth.rotation);
          const toSun = unit(frame.sun);
          sunEarth.value.set(toSun[0], toSun[1], toSun[2]);
          {
            // the Earth is turned about the y axis by spin + 90 degrees: the Sun in its own axes is turned back by as much
            const back = -(frame.spin + 90) * RAD;
            sunLocal.value.set(toSun[0] * Math.cos(back) + toSun[2] * Math.sin(back), toSun[1], -toSun[0] * Math.sin(back) + toSun[2] * Math.cos(back));
          }
          cloudShift.value = -(((model.time / 3_600_000) * model.cloudDrift) % 360) / 360;
          atmosphereMaterial.uniforms["thick"]!.value = model.airThickness;
          glow.scale.setScalar(airTop(model.airThickness));
          earthMaterial.uniforms["lights"]!.value = model.light === "lit" ? 0 : 1;
          earthMaterial.uniforms["boost"]!.value = model.light === "boost" ? 1 : 0;
          if (deps.paint) {
            const changed = deps.paint.step(model.time);
            paint.sync(deps.paint.on(), changed);
            paint.uniforms.paintNow.value = paintMinute(model.time);
            paint.uniforms.paintSpan.value = deps.paint.span();
            paint.uniforms.paintOn.value = deps.paint.on() ? 1 : 0;
          }

          // the Moon, with its near side to the Earth
          moon.position.set(moonPos[0], moonPos[1], moonPos[2]);
          moon.scale.setScalar(RADIUS["Moon"]![mode]);
          moon.up.set(0, 1, 0);
          moon.lookAt(0, 0, 0);
          const moonToSun = unit([frame.sun[0] - frame.moon[0], frame.sun[1] - frame.moon[1], frame.sun[2] - frame.moon[2]]);
          moonSun.value.set(moonToSun[0], moonToSun[1], moonToSun[2]);

          // where everything is, and how big
          const pos = { Earth: [0, 0, 0] as Vec3, Moon: moonPos, Sun: sunPos } as Record<BodyName, Vec3>;
          for (const name of PLANETS) pos[name] = placeAround(mode, sunPos, helioOf(frame.planets[name]));
          const radiusOf = (name: BodyName): number => (name === "Earth" ? 1 : RADIUS[name]![mode]);

          if (deps.painter && lookNow() !== "plain" && !moonSlot.small) fill(moonSlot, true);
          else if (moonSlot.look !== null) {
            empty(moonSlot);
            moonSlot.look = null;
            tally();
            deps.onBodies?.();
          }
          const paintedMoon = moonSlot.drawing;
          if (paintedMoon) {
            paintedMoon.object.position.set(moonPos[0], moonPos[1], moonPos[2]);
            paintedMoon.object.scale.setScalar(RADIUS["Moon"]![mode]);
            paintedMoon.light?.(moonToSun);
          }

          // the Sun and the planets, drawn by the painter, and the planets' orbits round the Sun
          fill(sunSlot);
          const sunDrawing = sunSlot.drawing;
          if (sunDrawing) {
            sunDrawing.object.position.set(sunPos[0], sunPos[1], sunPos[2]);
            sunDrawing.object.scale.setScalar(radiusOf("Sun"));
            if (sunDrawing.billboard) sunDrawing.object.quaternion.copy(camera.quaternion);
          }
          for (const name of PLANETS) {
            const p = planets.get(name)!;
            fill(p.slot);
            p.toSun = unit([frame.sun[0] - frame.planets[name][0], frame.sun[1] - frame.planets[name][1], frame.sun[2] - frame.planets[name][2]]);
            if (p.slot.drawing) {
              p.slot.drawing.object.position.set(pos[name][0], pos[name][1], pos[name][2]);
              p.slot.drawing.object.scale.setScalar(radiusOf(name));
              p.slot.drawing.light?.(p.toSun);
            }
            p.orbit.visible = model.orbits;
            if (model.orbits) {
              if (!Number.isFinite(p.epoch) || Math.abs(model.time - p.epoch) > 365 * 86_400_000) {
                p.samples = orbitPath(name, model.time, 96).slice(0, 96);
                p.epoch = model.time;
              }
              for (let i = 0; i < 96; i += 1) {
                const o = placeAround(mode, sunPos, p.samples[i]!);
                p.positions[i * 3] = o[0];
                p.positions[i * 3 + 1] = o[1];
                p.positions[i * 3 + 2] = o[2];
              }
              (p.orbit.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
            }
          }

          if (!layer && model.satellites.groups.size > 0) {
            try {
              layer = createSatelliteLayer(three, scene, model.satellites, model.ratio);
            } catch (error) {
              model.satellites.groups.clear();
              deps.onSatellitesError?.(error);
            }
          }
          // the ridden satellite is drawn as its model while the model is big enough to read; its ring and name (the page's choice of it, or the marks) are left off exactly then, and come back when the model has shrunk to the size of a ring (MODULES-1303, 1306)
          {
            const riding = model.ride;
            let over: SatelliteRef | null = null;
            if (riding && riding.viewpoint === "outside" && typeof riding.target !== "string") {
              const kmAbove = riding.distanceKm / Math.max(1e-9, model.view.zoom);
              const would = riding.view === "above" ? (riding.modelSize === "fixed" ? ABOVE_MODEL_SHARE : aboveModelShare(kmAbove)) : riding.view === "from" ? (riding.look === "horizon" ? OUTSIDE_ALONG_SHARE : OUTSIDE_RADIUS_SHARE) : MODEL_RADIUS_SHARE;
              if (would * size.height >= MODEL_HANDOVER_PX) over = riding.target;
            }
            model.satellites.modelOver = over;
          }
          layer?.update(model.time, model.speed, model.drawn?.radiusPx ?? 0);
          model.pick = layer ? (x, y, radius) => layer!.pick(x, y, camera, size, radius) : null;

          // the camera: looks at the focus body from the direction the sky was in when it was last moved, turned by yaw and tilt, as far as the zoom says; or, riding along, sits at the
          // body and looks at the Earth
          let focus: BodyName = model.focus;
          let focusPos: Vec3 = pos[focus];
          let focusRadius = radiusOf(focus);
          let rideFrom: { position: Vec3; velocity: Vec3; hidden: BodyName | null; gameSeconds: number } | null = null;
          let followed: { place: Vec3; velocity: Vec3; ref: SatelliteRef } | null = null;
          // a satellite ridden from itself: where it is, so that an outside ride can show it
          let ridden: { place: Vec3; velocity: Vec3; ref: SatelliteRef } | null = null;
          model.rideLost = false;
          model.lookBase = null;
          model.rideMotion = 0;
          model.rideDistance = null;
          const ride = model.ride;
          if (ride) {
            if (typeof ride.target === "string") {
              if (ride.view === "follow") {
                focus = ride.target;
                focusPos = pos[focus];
                focusRadius = radiusOf(focus);
              } else {
                const ends = track.ends();
                const was = ends ? placeAll(ends[0])[ride.target] : pos[ride.target];
                const will = ends ? placeAll(ends[1])[ride.target] : pos[ride.target];
                const seconds = ends ? Math.max(1e-3, (ends[1].ms - ends[0].ms) / 1000) : 1;
                rideFrom = { position: pos[ride.target], velocity: [will[0] - was[0], will[1] - was[1], will[2] - was[2]], hidden: ride.target, gameSeconds: seconds };
              }
            } else if (layer?.exact(ride.target, model.time, rideState)) {
              const place: Vec3 = [rideState[0]!, rideState[1]!, rideState[2]!];
              if (ride.view === "follow" || ride.view === "above") {
                focusPos = place;
                focusRadius = Math.max(1e-4, ride.distanceKm / 6371 / fit);
                followed = { place, velocity: [rideState[3]!, rideState[4]!, rideState[5]!], ref: ride.target };
              } else {
                rideFrom = { position: place, velocity: [rideState[3]!, rideState[4]!, rideState[5]!], hidden: null, gameSeconds: 0 };
                ridden = { place, velocity: rideFrom.velocity, ref: ride.target };
              }
            } else model.rideLost = true;
          }
          const hidden = rideFrom?.hidden ?? null;
          moon.visible = hidden !== "Moon" && !paintedMoon;
          if (paintedMoon) paintedMoon.object.visible = hidden !== "Moon";
          if (sunDrawing) sunDrawing.object.visible = hidden !== "Sun";
          for (const [name, p] of planets) if (p.slot.drawing) p.slot.drawing.object.visible = hidden !== name;

          let fovNow = FOV;
          let distance = 0;
          if (rideFrom) {
            let pose = ridePose({ position: rideFrom.position, velocity: rideFrom.velocity, look: ride!.look, yaw: model.view.yaw, tilt: model.view.tilt, zoom: model.view.zoom, turn: model.rideTurn, ...(ride!.face ? { face: ride!.face } : {}) });
            model.rideDistance = Math.hypot(...rideFrom.position);
            // an outside ride: the same look, from a little way back along it, so the satellite is in the picture
            let outsideAway = Infinity;
            if (ridden && ride!.viewpoint === "outside") {
              const out = outsidePose(pose, ride!.look);
              pose = out.pose;
              outsideAway = out.distance;
            }
            camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
            camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
            camera.lookAt(pose.position[0] + pose.forward[0], pose.position[1] + pose.forward[1], pose.position[2] + pose.forward[2]);
            fovNow = pose.fov;
            const away = Math.hypot(...rideFrom.position);
            camera.near = outsideAway < Infinity ? Math.max(1e-5, outsideAway * 0.1) : Math.max(0.0008, Math.min(0.05, (away - 1) * 0.1));
            camera.far = Math.max(2000, 400 + (mode === "true" ? 40 * 23_481 : 0));
            // how fast the ground goes by under the camera, in pixels a second at 1x: the speed over the height for a satellite, the turn of the direction to the Earth for a body
            const focal = (size.height / 2) / Math.tan((fovNow / 2) * RAD);
            const speed = Math.hypot(...rideFrom.velocity);
            model.rideMotion = typeof ride!.target === "string" ? ((speed / Math.max(1e-9, away)) / rideFrom.gameSeconds) * focal : (speed / Math.max(50, (away - 1) * 6371)) * focal;
          } else {
            // where the camera is held: over a place on the ground (the Earth's own turn is added to it), in the stars (the turn at the moment it was set), or on the Sun's side (the Sun's right ascension and, for the latitude, its declination)
            let spin = frame.spin;
            let baseLat = model.centre.lat;
            if (model.camera === "space") {
              if (model.cameraSpin === null) model.cameraSpin = frame.spin;
              // 0 holds the stars (the anchor alone, as before). 1 uses the Earth's turn now. In between, that share of the turn since the anchor.
              spin = followSpin(model.cameraSpin, frame.spin, model.follow);
            } else if (model.camera === "sun") {
              spin = Math.atan2(-frame.sun[2], frame.sun[0]) / RAD;
              baseLat += Math.asin(Math.max(-1, Math.min(1, frame.sun[1] / (Math.hypot(...frame.sun) || 1)))) / RAD;
            }
            // behind a satellite the Earth is the far side of what the camera looks at, so it moves with the camera's side-step; the view is mirrored for the ground to follow the pointer
            const way = ride && ride.view === "follow" && typeof ride.target !== "string" ? -1 : 1;
            const lon = model.centre.lon - way * model.view.yaw;
            const lat = Math.max(-90, Math.min(90, baseLat - way * model.view.tilt));
            const aim = direction(spin + lon, lat);
            if (followed && ride && (ride.view === "above" || (ride.view === "follow" && ride.face))) {
              // above the satellite, or a follow that was asked to face a way: on a line from the satellite, looking at it. With no facing, straight above, the way it is going at the top of the picture.
              // A facing puts the camera ahead, behind, left, right, down or up; a drag turns and tips from there.
              distance = Math.max(1e-4, ride.distanceKm / 6371 / Math.max(1e-9, model.view.zoom));
              const base = ride.face ? faceOffset(ride.face) : { yaw: 0, tilt: 0 };
              const up = aboveAxes(followed.place, followed.velocity, base.yaw + model.view.yaw * RAD, base.tilt + Math.max(-80, Math.min(80, model.view.tilt)) * RAD);
              target.set(focusPos[0], focusPos[1], focusPos[2]);
              camera.position.set(target.x + up.offset[0] * distance, target.y + up.offset[1] * distance, target.z + up.offset[2] * distance);
              camera.up.set(up.up[0], up.up[1], up.up[2]);
              camera.lookAt(target);
              camera.near = Math.max(1e-4, distance * 0.02);
              camera.far = Math.max(2000, distance * 4 + (mode === "true" ? 40 * 23_481 : 400));
            } else {
              if (way === 1 && focus === "Earth") model.lookBase = { lon: model.centre.lon + spin - frame.spin, lat: baseLat };
              distance = Math.max(1.05 * focusRadius, (fit * focusRadius) / Math.max(1e-9, model.view.zoom));
              target.set(focusPos[0], focusPos[1], focusPos[2]);
              camera.position.set(target.x + aim[0] * distance, target.y + aim[1] * distance, target.z + aim[2] * distance);
              camera.up.set(0, 1, 0);
              camera.lookAt(target);
              camera.near = Math.max(0.0005, distance * 0.02 - focusRadius * 0.5, focusRadius * 0.01);
              camera.far = Math.max(2000, distance * 4 + (mode === "true" ? 40 * 23_481 : 400));
            }
            if (ride && (ride.view === "follow" || ride.view === "above") && typeof ride.target !== "string") {
              const focal = (size.height / 2) / Math.tan((fovNow / 2) * RAD);
              model.rideMotion = (Math.hypot(rideState[3]!, rideState[4]!, rideState[5]!) / Math.max(50, ride.distanceKm / Math.max(1e-9, model.view.zoom))) * focal;
            }
          }

          // a ride that changed: glide from where the last draw left the camera (a jump for a reader who asked for reduced motion; the element does not start one then)
          const glide = model.transition;
          if (glide) {
            const k = Math.min(1, (performance.now() - glide.start) / glide.duration);
            const ease = k * k * (3 - 2 * k);
            desiredQ.copy(camera.quaternion);
            camera.position.set(glide.from.p[0] + (camera.position.x - glide.from.p[0]) * ease, glide.from.p[1] + (camera.position.y - glide.from.p[1]) * ease, glide.from.p[2] + (camera.position.z - glide.from.p[2]) * ease);
            fromQ.set(glide.from.q[0], glide.from.q[1], glide.from.q[2], glide.from.q[3]);
            camera.quaternion.copy(fromQ.slerp(desiredQ, ease));
            fovNow = glide.from.fov + (fovNow - glide.from.fov) * ease;
            if (k >= 1) model.transition = null;
          }
          camera.fov = fovNow;
          camera.aspect = size.width / Math.max(1, size.height);
          // the Earth's place in the view: the picture is moved, not the camera (a camera riding from a body, or above a satellite, keeps the middle)
          const centred = rideFrom !== null || (ride?.view === "above" && followed !== null);
          const shiftX = centred ? 0 : (model.earth.x - 0.5) * size.width;
          const shiftY = centred ? 0 : (model.earth.y - 0.5) * size.height;
          if (shiftX !== 0 || shiftY !== 0) camera.setViewOffset(size.width, size.height, -shiftX, -shiftY, size.width, size.height);
          else if (camera.view) camera.clearViewOffset();
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          // always lit: the light comes from the camera's side of the Earth (the Sun, Moon and planets stay where they are)
          if (model.light === "lit") sunEarth.value.set(camera.position.x, camera.position.y, camera.position.z).normalize();
          const pose = model.pose;
          pose.p[0] = camera.position.x;
          pose.p[1] = camera.position.y;
          pose.p[2] = camera.position.z;
          pose.q[0] = camera.quaternion.x;
          pose.q[1] = camera.quaternion.y;
          pose.q[2] = camera.quaternion.z;
          pose.q[3] = camera.quaternion.w;
          pose.fov = fovNow;
          pose.valid = true;
          model.drawnView = { yaw: model.view.yaw, tilt: model.view.tilt, zoom: model.view.zoom };
          model.heightPx = size.height;

          // how many pixels across each body is: for the pictures the Earth and the Moon need, and for what is chosen
          const half = Math.tan((fovNow / 2) * RAD);
          const radiusPxOf = (name: BodyName): number => {
            const d = Math.hypot(pos[name][0] - camera.position.x, pos[name][1] - camera.position.y, pos[name][2] - camera.position.z);
            const r = radiusOf(name);
            return d <= r * 1.001 ? 1e5 : ((size.height / 2) * (r / Math.sqrt(d * d - r * r))) / half;
          };
          const px = {} as Record<BodyName, number>;
          for (const name of BODY_NAMES) px[name] = radiusPxOf(name);
          model.drawn = { frame, distance, radiusPx: px.Earth };
          layer?.resize(px.Earth);
          // which bodies get their mapped pictures: those in the view and big enough to show a map. The others are plain spheres (the Moon, the view's own) and the painter is not asked for them, so it loads and holds nothing for a body too small to see.
          // The choice is made here, from this draw's sizes, and acted on at the next (a body that changes asks for it); a body that has shrunk or gone is let go after `BODY_KEEP_MS`, so one that comes and goes is not made again and again.
          {
            const at = performance.now();
            let changed = false;
            let soonest = Number.POSITIVE_INFINITY;
            const judge = (name: BodyName, slot: Slot): void => {
              projected.set(pos[name][0], pos[name][1], pos[name][2]).project(camera);
              const reach = Math.min(px[name], 1e5);
              const inView = reach >= 1e5 || (projected.z > -1 && projected.z < 1 && Math.abs(projected.x) * (size.width / 2) <= size.width / 2 + reach && Math.abs(projected.y) * (size.height / 2) <= size.height / 2 + reach);
              if (slot.small) {
                if (inView && px[name] >= BODY_MAKE_PX) {
                  slot.small = false;
                  slot.bigAt = at;
                  changed = true;
                }
              } else if (inView && px[name] >= BODY_LET_GO_PX) slot.bigAt = at;
              else if (at - slot.bigAt > BODY_KEEP_MS) {
                slot.small = true;
                changed = true;
              } else soonest = Math.min(soonest, slot.bigAt + BODY_KEEP_MS - at);
            };
            if (deps.painter && lookNow() !== "plain") {
              judge("Sun", sunSlot);
              judge("Moon", moonSlot);
              for (const name of PLANETS) judge(name, planets.get(name)!.slot);
            }
            if (bodyTimer !== undefined) clearTimeout(bodyTimer);
            bodyTimer = soonest < Number.POSITIVE_INFINITY ? setTimeout(() => deps.invalidate(), soonest + 50) : undefined;
            if (changed) deps.invalidate();
          }
          // the finer map tiles: the camera as the Earth's own axes have it, so a camera a few kilometres up asks for the tiles under it at the level its height needs
          {
            // the Earth is turned about the y axis and sits at the origin, so its own axes are the world's turned back by that angle
            const turn = earth.rotation.y;
            eye.copy(camera.position).applyAxisAngle(upAxis, -turn);
            const away = Math.max(1e-4, eye.length() - 1);
            const focal = size.height / 2 / half;
            const look: TilePerspective = {
              eye: [eye.x, eye.y, eye.z],
              project: (point) => {
                projected.set(point[0], point[1], point[2]).applyAxisAngle(upAxis, turn).project(camera);
                if (projected.z > 1 || projected.z < -1) return null;
                return { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height };
              },
              ground: (x, y) => {
                ray.set((x / size.width) * 2 - 1, 1 - (y / size.height) * 2, 0.5).unproject(camera).sub(camera.position).normalize().applyAxisAngle(upAxis, -turn);
                // the nearer point where the line from the camera meets the unit sphere, if it does
                const b = eye.dot(ray);
                const rest = b * b - (eye.lengthSq() - 1);
                if (rest < 0) return null;
                const t = -b - Math.sqrt(rest);
                return t < 0 ? null : [eye.x + t * ray.x, eye.y + t * ray.y, eye.z + t * ray.z];
              },
            };
            tiles.sync({ lon: 0, lat: 0, width: size.width, height: size.height, panX: 0, panY: 0, radius: focal / away, perspective: look }, [sunLocal.value.x, sunLocal.value.y, sunLocal.value.z], true, model.ratio());
            deps.onTilesDrawn?.();
          }
          let paintedBodies = sunSlot.drawing ? 1 : 0;
          for (const p of planets.values()) if (p.slot.drawing) paintedBodies += 1;
          let paintedMoons = 0;
          for (const held of moonSlots.values()) if (held.slot.drawing?.object.visible) paintedMoons += 1;
          let tiled = 0;
          for (const drawing of [sunSlot.drawing, moonSlot.drawing, ...[...planets.values()].map((p) => p.slot.drawing), ...[...moonSlots.values()].map((held) => held.slot.drawing)]) if (drawing?.tiles?.shown != null) tiled += 1;
          model.painted = { bodies: paintedBodies, moons: paintedMoons, held: 0, moon: paintedMoon !== undefined, tiles: tiled, mapped: model.painted.mapped, pending: model.painted.pending };
          // the followed satellite as a model, when the page has one for it: made once, placed where the satellite is, pointed the way it flies, sized to read and lit by the Sun
          const satellitePainter = deps.satellitePainter?.();
          // the satellite to draw: the one followed or seen from above, or (an outside ride from the satellite itself) the one ridden
          const candidate = followed ?? ridden;
          const shownSat = followed ?? (ride?.viewpoint === "outside" ? ridden : null);
          const group = candidate ? model.satellites.groups.get(candidate.ref.group) : undefined;
          const set = candidate && group ? group.satellites.sets[candidate.ref.index] : undefined;
          const norad = set?.NORAD_CAT_ID;
          // a model the page made for it, drawn only while the camera is outside it (followed or above it, or an outside ride); else the package's own small drawing by kind, kept (hidden) while the ride stays on the satellite, and let go when it ends
          const painted = norad !== undefined && satellitePainter?.has(norad) === true;
          const genericKey = set ? `generic:${satelliteKind(set.OBJECT_NAME ?? "")}` : "";
          const modelKey = set === undefined || norad === undefined ? "" : painted ? (shownSat ? String(norad) : "") : ride?.viewpoint === "outside" || modelSlot.key === genericKey ? genericKey : "";
          if (modelKey !== modelSlot.key) {
            dropModel();
            modelSlot.key = modelKey;
            const turn = (modelSlot.turn += 1);
            const adopt = (made: BodyDrawing): void => {
              made.object.matrixAutoUpdate = false;
              made.object.visible = false;
              scene.add(made.object);
              modelSlot.drawing = made;
              // how many meshes the model is made of: a draw call each, which a test of the draw budget adds to the scene's own
              modelSlot.parts = 0;
              made.object.traverse((part) => {
                if ((part as THREE.Mesh).isMesh) modelSlot.parts += 1;
              });
              deps.invalidate();
            };
            if (modelKey.startsWith("generic:")) adopt(genericSatellite(three as unknown as typeof THREE, modelKey.slice(8) as ReturnType<typeof satelliteKind>));
            else if (modelKey && satellitePainter && norad !== undefined) {
              void Promise.resolve(satellitePainter.make(three, norad, { look: "", invalidate: () => deps.invalidate(), ratio: model.ratio(), maxTexture: deps.cap() }))
                .then((made) => {
                  if (!made) return;
                  if (ended || modelSlot.turn !== turn) {
                    made.dispose();
                    return;
                  }
                  adopt(made);
                })
                .catch((error: unknown) => deps.onPainterError?.(error));
            }
          }
          // the model's attitude is the track frame (x along the way it goes, level; z straight up). A moment with no level speed keeps the last good frame, so the model neither drops nor turns (MODULES-1303)
          const freshAxes = shownSat ? satelliteAxes(shownSat.place, shownSat.velocity) : null;
          if (freshAxes) modelSlot.axes = freshAxes;
          else if (!shownSat) modelSlot.axes = null;
          const axes = freshAxes ?? (shownSat ? modelSlot.axes : null);
          // a generic drawing is for an outside ride only; a page's model is drawn wherever the camera is not at the satellite
          const drawn = shownSat !== null && (ride?.viewpoint === "outside" || (followed !== null && painted));
          const aboveShare = followed && ride?.view === "above" && ride.modelSize !== "fixed" ? aboveModelShare(Math.hypot(shownSat!.place[0] - camera.position.x, shownSat!.place[1] - camera.position.y, shownSat!.place[2] - camera.position.z) * 6371) : 1;
          // from far above the satellite is a point: the model has shrunk to nothing and the ordinary mark is all there is
          if (modelSlot.drawing && shownSat && axes && drawn && aboveShare * size.height >= 0.5) {
            const object = modelSlot.drawing.object;
            const away = Math.hypot(shownSat.place[0] - camera.position.x, shownSat.place[1] - camera.position.y, shownSat.place[2] - camera.position.z);
            const share = followed ? (ride?.view === "above" ? (ride.modelSize === "fixed" ? ABOVE_MODEL_SHARE : aboveModelShare(away * 6371)) : MODEL_RADIUS_SHARE) : ride?.look === "horizon" ? OUTSIDE_ALONG_SHARE : OUTSIDE_RADIUS_SHARE;
            object.matrix.set(...(modelMatrix(shownSat.place, axes, modelRadius(away, half, share, 1e-9)) as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));
            object.matrixWorldNeedsUpdate = true;
            object.visible = true;
            const toSunNow = unit(frame.sun);
            modelSlot.drawing.light?.(toSunNow);
            modelSlot.drawing.update?.({ toSun: toSunNow, ms: model.time, radiusPx: size.height * share });
            projected.set(shownSat.place[0], shownSat.place[1], shownSat.place[2]).project(camera);
            const sx = ((projected.x + 1) / 2) * size.width;
            const sy = ((1 - projected.y) / 2) * size.height;
            const radiusPx = size.height * share;
            model.followModel = { x: sx, y: sy, shown: true, parts: modelSlot.parts, radiusPx, box: { left: sx - radiusPx, top: sy - radiusPx, right: sx + radiusPx, bottom: sy + radiusPx }, axes };
          } else {
            if (modelSlot.drawing) modelSlot.drawing.object.visible = false;
            model.followModel = null;
          }
          const sunToSun = unit([-frame.sun[0], -frame.sun[1], -frame.sun[2]]);
          const bodyView = { camera, width: size.width, height: size.height };
          sunDrawing?.update?.({ toSun: sunToSun, ms: model.time, radiusPx: px.Sun, view: bodyView });
          paintedMoon?.update?.({ toSun: moonToSun, ms: model.time, radiusPx: px.Moon, view: bodyView });
          for (const name of PLANETS) {
            const p = planets.get(name)!;
            p.slot.drawing?.update?.({ toSun: p.toSun, ms: model.time, radiusPx: px[name], view: bodyView });
          }
          if (painter.moons && lookNow() !== "plain") {
            const now = performance.now();
            const seen = new Set<string>();
            for (const name of PLANETS) {
              const p = planets.get(name)!;
              const planet = p.slot.drawing;
              if (!planet || !planet.object.visible || px[name] < MOON_MIN_PLANET_PX) continue;
              const radius = radiusOf(name);
              for (const site of painter.moons(name, model.time)) {
                const at: Vec3 = [pos[name][0] + site.offset[0] * radius, pos[name][1] + site.offset[1] * radius, pos[name][2] + site.offset[2] * radius];
                projected.set(at[0], at[1], at[2]).project(camera);
                if (projected.z > 1 || Math.abs(projected.x) > 1.25 || Math.abs(projected.y) > 1.25) continue;
                let held = moonSlots.get(site.name);
                if (!held) moonSlots.set(site.name, (held = { slot: newSlot(site.name), seen: now }));
                held.seen = now;
                seen.add(site.name);
                fill(held.slot, true);
                const drawing = held.slot.drawing;
                if (!drawing) continue;
                const away = Math.hypot(at[0] - camera.position.x, at[1] - camera.position.y, at[2] - camera.position.z);
                const drawn = Math.max(site.radius * radius, (away * half * MOON_MIN_PX) / (size.height / 2));
                drawing.object.visible = true;
                drawing.object.position.set(at[0], at[1], at[2]);
                drawing.object.scale.setScalar(drawn);
                const moonPx = away <= drawn * 1.001 ? 1e5 : ((size.height / 2) * (drawn / Math.sqrt(away * away - drawn * drawn))) / half;
                drawing.light?.(p.toSun);
                drawing.update?.({ toSun: p.toSun, ms: model.time, radiusPx: moonPx, view: bodyView });
              }
            }
            let soonest = Number.POSITIVE_INFINITY;
            for (const [key, held] of moonSlots) {
              if (seen.has(key)) continue;
              if (held.slot.drawing) held.slot.drawing.object.visible = false;
              if (now - held.seen > MOON_KEEP_MS) {
                empty(held.slot);
                moonSlots.delete(key);
              } else soonest = Math.min(soonest, held.seen + MOON_KEEP_MS - now);
            }
            // a view that is at rest draws nothing, so a moon that has gone from the view would be kept for ever: ask for one more draw when the first of them is due to be let go
            if (releaseTimer !== undefined) clearTimeout(releaseTimer);
            releaseTimer = soonest < Number.POSITIVE_INFINITY ? setTimeout(() => deps.invalidate(), soonest + 50) : undefined;
          }
          model.painted.held = moonSlots.size;
          const ratio = model.ratio();
          const earthPx = Math.min(px.Earth, 1e5) * ratio;
          textures.sync({ day: earthPx, night: earthPx, clouds: earthPx, water: earthPx, moon: paintedMoon ? 0 : Math.min(px.Moon, 1e5) * ratio });
          if (deps.onLabels && model.labels) {
            const places = {} as Record<BodyName, BodyPlace | null>;
            for (const name of BODY_NAMES) {
              const at = name === hidden || (rideFrom && name === "Earth") ? null : labelFor(pos[name]);
              places[name] = at ? { x: at.x, y: at.y, r: px[name] } : null;
            }
            deps.onLabels(places);
          }
          // the ringed satellites first, so their names are laid out with the places' in this same draw
          model.placeSatellite = layer ? (ref) => layer!.placeOf(ref, camera, size) : null;
          if (deps.onSatelliteMarks) {
            if (layer && (model.satellites.marked.size > 0 || model.satellites.pinned.length > 0)) {
              const marks: { ref: SatelliteRef; x: number; y: number; visible: boolean; heightKm: number; occluded: boolean }[] = [];
              for (const name of model.satellites.marked) {
                const group = model.satellites.groups.get(name);
                if (!group) continue;
                for (let index = 0; index < group.satellites.count && marks.length < MAX_MARKED; index += 1) {
                  const ref = { group: name, index };
                  const at = layer.placeOf(ref, camera, size);
                  if (at) marks.push({ ref, ...at });
                }
              }
              for (const ref of model.satellites.pinned) {
                if (marks.length >= MAX_MARKED) break;
                if (marks.some((mark) => mark.ref.group === ref.group && mark.ref.index === ref.index)) continue;
                const at = layer.placeOf(ref, camera, size);
                if (at) marks.push({ ref, ...at });
              }
              marksTold = true;
              deps.onSatelliteMarks(marks);
            } else if (marksTold) {
              marksTold = false;
              deps.onSatelliteMarks([]);
            }
          }
          if (deps.onPlaces) {
            // a place on the ground, turned with the Earth into the scene's axes, seen through the camera: where it falls, which way its upright points on the screen, and whether it faces the camera
            const turn = earth.rotation.y;
            const cos = Math.cos(turn);
            const sin = Math.sin(turn);
            const eye = camera.position;
            deps.onPlaces({
              width: size.width,
              height: size.height,
              radius: hidden === "Earth" || rideFrom ? 0 : Math.min(px.Earth, 1e5),
              at(lon, lat, out) {
                const la = lat * RAD;
                const lo = lon * RAD;
                const lx = Math.cos(la) * Math.sin(lo);
                const lz = Math.cos(la) * Math.cos(lo);
                const wx = lx * cos + lz * sin;
                const wy = Math.sin(la);
                const wz = -lx * sin + lz * cos;
                const away = Math.hypot(eye.x - wx, eye.y - wy, eye.z - wz) || 1;
                out.facing = (wx * (eye.x - wx) + wy * (eye.y - wy) + wz * (eye.z - wz)) / away;
                projected.set(wx, wy, wz).project(camera);
                if (projected.z > 1 || projected.z < -1) return false;
                out.x = ((projected.x + 1) / 2) * size.width;
                out.y = ((1 - projected.y) / 2) * size.height;
                projected.set(wx * 1.001, wy * 1.001, wz * 1.001).project(camera);
                const dx = ((projected.x + 1) / 2) * size.width - out.x;
                const dy = ((1 - projected.y) / 2) * size.height - out.y;
                const seen = Math.hypot(dx, dy);
                const side = Math.sqrt(Math.max(0, 1 - out.facing * out.facing));
                out.upX = seen > 0 ? (dx / seen) * side : 0;
                out.upY = seen > 0 ? (dy / seen) * side : 0;
                return true;
              },
            });
          }
          const spriteData = deps.placeSprites?.() ?? null;
          if (beginPlaceSprites(placeRings, spriteData, () => createPlaceSprites(three, earth, sunEarth))) {
            // told once: without `Points` the page's layer draws these rings itself
            deps.onPlaceRings?.(placeRings.sprites !== null);
          }
          placeRings.sprites?.sync(spriteData, model.ratio(), size.width, size.height, model.light === "lit");
          // the name written on the Earth: made the first time the settings ask for it; none while a ride along a body hides the Earth
          if (model.bodyLabel.settings && !nameOn) nameOn = createBodyLabelLayer(three, earth, model.bodyLabel, { invalidate: () => deps.invalidate(), ...(deps.onLabelError ? { onError: deps.onLabelError } : {}) });
          nameOn?.sync(camera, rideFrom ? 0 : Math.min(px.Earth, 1e5));
          if (deps.onCities) {
            if (hidden === "Earth") deps.onCities(null);
            else {
              // a place on the ground, turned with the Earth (the Earth is at the middle, one unit in radius): in sight when the viewer is above its horizon, found through the camera
              const ground = new three.Vector3();
              const eye = camera.position;
              const turned = earth.quaternion;
              ground.set(0, 0, 0).project(camera);
              const disc = { x: ((ground.x + 1) / 2) * size.width, y: ((1 - ground.y) / 2) * size.height, radius: Math.min(px.Earth, 1e5) };
              deps.onCities({
                width: size.width,
                height: size.height,
                radius: Math.min(px.Earth, 1e5),
                ...(ground.z > -1 && ground.z < 1 ? { disc } : {}),
                project(lon, lat, out) {
                  const phi = lat * RAD;
                  const lambda = lon * RAD;
                  ground.set(Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)).applyQuaternion(turned);
                  const dx = eye.x - ground.x;
                  const dy = eye.y - ground.y;
                  const dz = eye.z - ground.z;
                  const facing = (ground.x * dx + ground.y * dy + ground.z * dz) / (Math.hypot(dx, dy, dz) || 1);
                  ground.project(camera);
                  out.x = ((ground.x + 1) / 2) * size.width;
                  out.y = ((1 - ground.y) / 2) * size.height;
                  return ground.z > 1 || ground.z < -1 ? -1 : facing;
                },
              });
            }
          }
          // the sky after the places and the city names, so its names keep clear of what they take as it is laid out
          if (deps.onSky) {
            const sky = new three.Vector3();
            // stars are directions: a point far along the direction from the camera, in the scene's axes (x to the vernal equinox, y north, z completing the hand), seen through the camera
            const reach = Math.max(10, Math.min(camera.far * 0.5, 1000));
            const discs: { x: number; y: number; radius: number }[] = [];
            for (const name of ["Earth", "Moon", "Sun"] as const) {
              const at = pos[name];
              sky.set(at[0], at[1], at[2]).project(camera);
              if (sky.z > 1 || sky.z < -1) continue;
              discs.push({ x: ((sky.x + 1) / 2) * size.width, y: ((1 - sky.y) / 2) * size.height, radius: Math.min(px[name], 1e5) });
            }
            // a body covers the sky where the ray through a pixel passes within the body's angular radius of its centre: exact for any field of view, where a circle on the screen is right only on the axis
            const ray = new three.Vector3();
            const bodies = (["Earth", "Moon", "Sun"] as const).map((name) => coverBody(pos[name], [camera.position.x, camera.position.y, camera.position.z], name === "Earth" ? radiusOf(name) * airTop(model.airThickness) : radiusOf(name)));
            deps.onSky({
              width: size.width,
              height: size.height,
              discs,
              covered(x, y) {
                ray.set((x / size.width) * 2 - 1, 1 - (y / size.height) * 2, 0.5).unproject(camera).sub(camera.position);
                const length = ray.length() || 1;
                const rx = ray.x / length;
                const ry = ray.y / length;
                const rz = ray.z / length;
                return covers(bodies, rx, ry, rz);
              },
              project(rightAscension, declination, out) {
                const r = rightAscension * RAD;
                const d = declination * RAD;
                sky.set(Math.cos(d) * Math.cos(r), Math.sin(d), -Math.cos(d) * Math.sin(r)).multiplyScalar(reach).add(camera.position).project(camera);
                out.x = ((sky.x + 1) / 2) * size.width;
                out.y = ((1 - sky.y) / 2) * size.height;
                return sky.z > -1 && sky.z < 1;
              },
            });
          }
          if (layer && deps.onSelected) {
            const at = model.satellites.selected ? layer.place(camera, size) : null;
            if (at || selectedShown) deps.onSelected(at);
            selectedShown = at !== null;
          }
          if (layer && deps.onHover) {
            const hover = model.satellites.hover;
            const ref = hover.enabled && hover.ref && hover.fade > 0 ? hover.ref : null;
            const at = ref ? layer.placeOf(ref, camera, size) : null;
            const place = at ? { x: at.x, y: at.y, visible: at.visible } : null;
            if (place || hoverShown) deps.onHover(place);
            hoverShown = place !== null;
          }
          // the meteors, on the Earth: made the first time they are switched on, and asking for their own next draw while a streak is alive or one is due
          if (model.meteors.on && !meteors) meteors = createMeteorLayer(three, earth, model.meteors);
          if (meteors) {
            // the camera's place, turned into the Earth's own axes (the Earth is at the middle of the scene and turns about its pole)
            const turn = earth.rotation.y;
            const fx = camera.position.x * Math.cos(turn) - camera.position.z * Math.sin(turn);
            const fz = camera.position.x * Math.sin(turn) + camera.position.z * Math.cos(turn);
            const far = Math.hypot(fx, camera.position.y, fz) || 1;
            const wait = meteors.step({ now: performance.now(), time: model.time, facing: [fx / far, camera.position.y / far, fz / far], sun: unitVector(subsolarPoint(model.time)), radius: Math.min(px.Earth, 1e5), width: size.width, height: size.height });
            if (meteorTimer !== undefined) clearTimeout(meteorTimer);
            meteorTimer = Number.isFinite(wait) ? setTimeout(() => deps.invalidate(), wait) : undefined;
          }
          // the borders, on the Earth: made the first time a set is switched on, above the clouds and under the air; the view's middle is the point under the camera, as far round as its horizon
          if ((model.borders.countries || model.borders.regions) && !borders && !model.borders.stats.failed) {
            try {
              borders = createBorderLayer(three, earth, model.borders, () => deps.invalidate(), 3.5);
            } catch (error) {
              model.borders.stats.failed = true;
              model.borders.onError?.(error);
            }
          }
          if (borders) {
            const turn = earth.rotation.y;
            const fx = camera.position.x * Math.cos(turn) - camera.position.z * Math.sin(turn);
            const fz = camera.position.x * Math.sin(turn) + camera.position.z * Math.cos(turn);
            const far = Math.hypot(fx, camera.position.y, fz) || 1;
            borders.sync({ points: [{ lon: Math.atan2(fx, fz) / RAD, lat: Math.asin(Math.max(-1, Math.min(1, camera.position.y / far))) / RAD }], angle: Math.acos(Math.min(1, 1 / far)) / RAD, radius: Math.min(px.Earth, 1e5) });
          }
          // the grid, on the Earth: made the first time it is switched on, over the ground and under the clouds
          if (model.grid.on && !gridLayer && !model.grid.stats.failed) {
            try {
              gridLayer = createGridLayer(three, earth, model.grid, sunEarth, 2.5);
            } catch (error) {
              model.grid.stats.failed = true;
              model.grid.onError?.(error);
            }
          }
          gridLayer?.sync(Math.min(px.Earth, 1e5));
          if ((model.route.ends || routeLayer) && !routeLayer && !model.route.failed) {
            try {
              routeLayer = createRouteLayer(three, earth, model.route);
            } catch (error) {
              model.route.failed = true;
              console.warn(error instanceof Error ? error.message : error);
            }
          }
          routeLayer?.sync();
          if (model.rideLost) deps.onRideLost?.();
          if (model.transition) deps.onMoving?.();
          return false;
        },
        resize(w, h) {
          size = { width: w, height: h };
        },
        dispose() {
          if (releaseTimer !== undefined) clearTimeout(releaseTimer);
          if (bodyTimer !== undefined) clearTimeout(bodyTimer);
          if (arrivalTimer !== undefined) clearTimeout(arrivalTimer);
          if (meteorTimer !== undefined) clearTimeout(meteorTimer);
          meteors?.dispose();
          nameOn?.dispose();
          borders?.dispose();
          placeRings.sprites?.dispose();
          gridLayer?.dispose();
          routeLayer?.dispose();
          modelSlot.turn += 1;
          dropModel();
          layer?.dispose();
          model.pick = null;
          model.placeSatellite = null;
          model.tiles = null;
          tiles.dispose();
          textures.dispose();
          ended = true;
          model.painted.pending = 0;
          empty(sunSlot);
          empty(moonSlot);
          for (const held of moonSlots.values()) empty(held.slot);
          moonSlots.clear();
          for (const p of planets.values()) {
            empty(p.slot);
            p.orbit.geometry.dispose();
            (p.orbit.material as THREE.Material).dispose();
          }
          grid.dispose();
          solid.dispose();
          paint.dispose();
          earthMaterial.dispose();
          cloudMaterial.dispose();
          atmosphereMaterial.dispose();
          (moon.material as THREE.Material).dispose();
        },
      };
    },
  };
}
