// The satellites in the space view: each group is one THREE.Points, which is one draw call however many satellites it holds, its positions written in place by the group's
// own interpolation (SGP4 about once a second, see src/satellites/track.ts). A chosen satellite gets a larger dot and its orbit; a small group (the stations) can show every orbit.
import type * as THREE from "three";
import { MAX_SATELLITE_SPEED } from "../satellites/limits.ts";
import type { SatelliteRef, Satellites } from "../satellites/types.ts";
import type { ThreeParts } from "../realistic/textures.ts";
import { satelliteEmphasis, type SatelliteFocus } from "./satellite-focus.ts";
import { BUILT_IN_PATH_STYLES, capPaths, nearestLoop, resolvePathId, styleOf, styleTable, type PathHit, type PathInfo, type PathRequest, type PathStyle } from "./paths.ts";
import { createPathRibbons, RIDE_PATH_FADE_KM, type RibbonPath } from "./path-ribbons.ts";

type Three = ThreeParts;

/** How a group looks: the colour of its dots and their size in CSS pixels, and whether every orbit is drawn (only for a small group). */
export interface SatelliteStyle {
  color: string;
  size: number;
  orbits: boolean;
}

export interface SatelliteGroupState extends SatelliteStyle {
  satellites: Satellites;
  visible: boolean;
  /** How many of this group the last draw placed. 0 before the first draw and when the group is not drawn. */
  placed?: number;
}

/** The part of the space view's model the satellites read and write. */
export interface SatelliteState {
  groups: Map<string, SatelliteGroupState>;
  selected: SatelliteRef | null;
  /** The groups whose members are ringed and named (`labelSatellites`): the scene tells the page where each is, at every draw. */
  marked: Set<string>;
  /** Satellites ringed besides a whole group: the nearest ones a page asked to mark. Empty unless set. */
  pinned: SatelliteRef[];
  /** Written at each draw: satellites placed, whether the clock is too fast for the groups, and the milliseconds the last update took. */
  /** Colour each dot by its orbit class. Off by default: a group keeps the one colour it was given. */
  orbitTint: boolean;
  /** One group shown on its own. `null` leaves every group as the page set it. */
  focus: SatelliteFocus | null;
  /**
   * The satellite the pointer rests on, and the faint orbit drawn for it. `fade` is 1 while the pointer rests and falls to 0 after it leaves.
   * `enabled` is off when the page turns the faint orbit off. The path is computed once per satellite, from the elements already loaded.
   */
  hover: { ref: SatelliteRef | null; fade: number; enabled: boolean; color: string; opacity: number };
  /**
   * The extra paths a page asked for (`setPaths`), the look table (`setPathStyles`: the page's entries over the built-in ones), whether the chosen satellite's own orbit is drawn (`selected-path`), and a number that goes up at each change so the layer
   * rewrites its buffers only when something changed. `info` is what the last draw resolved and kept: the paths drawn, in order; `dropped` how many the cap left out and `unresolved` how many matched no satellite.
   */
  paths: { requests: PathRequest[]; overrides: Record<string, Partial<PathStyle> | null>; selectedOn: boolean; version: number; info: PathInfo[]; dropped: number; unresolved: number };
  /** Set at each draw by the view: the satellite a ride is on, whose own orbit is drawn in the `selected` look while `selected-path` is on. `null` when none rides a satellite. */
  ridden: SatelliteRef | null;
  /**
   * The pixel ceiling of a streak's length on the screen above the interpolation limit, in CSS pixels at the Earth's own distance (`satellite-streak-max`). A streak is also never longer than {@link STREAK_REACH} Earth radii, so it shrinks with the Earth.
   * 0 draws the whole stretch one frame spans, however long that is.
   */
  streakMax: number;
  /** Set at each draw by the view: the satellite a ride shows as its model while the model is big enough to read. Its ring (the chosen marker) and name are left off while this is so; its orbit line stays. Clears with the ride, or when the model has handed over to the mark. */
  modelOver: SatelliteRef | null;
  drawn: { placed: number; segments: number; tooFast: boolean; dotScale: number; longestStreakPx: number; streakCapPx: number; weight: number; fade: number; earthPx: number; updateMs: number; maxUpdateMs: number; updates: number; totalMs: number; selectedRing: boolean; hoverPath: boolean; hoverOpacity: number; selectedOpacity: number; orbitLines: number; pathsDrawn: number; pathDraws: number; estimated: number };
}

/**
 * The longest a streak may be along its orbit, in Earth radii: 0.025, about 160 km, which is what a low satellite covers in a frame at 10 minutes a second (150 km). On the screen that is a share of the Earth's drawn radius, so a streak
 * is a few millimetres when the Earth fills the view, half as long when the Earth is half as large, and a dot when the Earth is tiny. A cap of so many pixels alone would leave the same length on a small Earth, where it looks long.
 */
export const STREAK_REACH = 0.025;

/** The Earth's drawn radius, in CSS pixels, below which the satellites' dark rims and streaks are faded out (no weight at 40) and from which they have their whole weight (150). */
export const WEIGHT_FROM = 40;
export const WEIGHT_FULL = 150;

/** How much of its weight a mark has at an Earth `radiusPx` on the screen, from 0 to 1: a smooth step from {@link WEIGHT_FROM} to {@link WEIGHT_FULL}. Many small dark marks on a small Earth would blacken it. */
export function markWeight(radiusPx: number): number {
  const t = Math.min(1, Math.max(0, (radiusPx - WEIGHT_FROM) / (WEIGHT_FULL - WEIGHT_FROM)));
  return t * t * (3 - 2 * t);
}

/**
 * The share of the near side of a small Earth that the marks may cover at full strength before they are drawn fainter in proportion: a crowd of marks on a small Earth is a haze over it, not a set of satellites. Dots are lighter ink
 * than streaks are (a dot is opaque and a streak a pixel wide), so they get the smaller share.
 */
export const CROWD_COVER_DOTS = 0.06;
export const CROWD_COVER_STREAKS = 0.35;

/**
 * How strongly each mark is drawn so a crowd does not wash a small Earth, from 0 to 1: the share of the near side they would cover (`marks`, half of them on this side, each `area` square pixels, over the disc of an Earth `radiusPx` in radius),
 * and `limit` over that when it is more. With `byWeight` (the default, for dots) it acts only as the Earth gets small (see {@link markWeight}): none at all from 150 pixels, so a whole Earth is drawn as it was however many satellites there are. Without it (streaks) the limit holds at every size: a streak is as wide as it is long, so the same number of satellites covers a half Earth twice over, and 16,000 of them leave a small Earth no more washed than a whole one.
 */
export function crowdFade(marks: number, area: number, radiusPx: number, limit: number, byWeight = true): number {
  const disc = Math.PI * radiusPx * radiusPx;
  if (!(disc > 0) || !(marks > 0)) return 1;
  const cover = (0.5 * marks * area) / disc;
  const crowd = cover <= limit ? 1 : limit / cover;
  return byWeight ? 1 - (1 - crowd) * (1 - markWeight(radiusPx)) : crowd;
}

/** The longest a streak is by default: the stretch a low satellite covers in one frame at 10 minutes a second, on a whole Earth with a radius of about 300 pixels: a few millimetres on the screen. */
export const DEFAULT_STREAK_MAX = 8;

/** Read `satellite-streak-max`: a number of CSS pixels, `off` or 0 for no cap, and the default for nothing, a negative number or anything else. */
export function readStreakMax(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_STREAK_MAX;
  const text = value.trim().toLowerCase();
  if (text === "off") return 0;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : DEFAULT_STREAK_MAX;
}

/** The longest streak, in CSS pixels, among the first `count` of `segments` (6 numbers each), with the Earth's radius `earthPx` on the screen: a length in Earth radii times the radius. */
export function longestStreak(segments: Float32Array, count: number, earthPx: number): number {
  let longest = 0;
  for (let i = 0; i < count; i += 1) {
    const w = i * 6;
    const length = Math.hypot(segments[w + 3]! - segments[w]!, segments[w + 4]! - segments[w + 1]!, segments[w + 5]! - segments[w + 2]!);
    if (length > longest) longest = length;
  }
  return longest * earthPx;
}

export const newSatelliteState = (): SatelliteState => ({ groups: new Map(), selected: null, marked: new Set(), pinned: [], orbitTint: false, focus: null, modelOver: null, hover: { ref: null, fade: 0, enabled: true, color: "#ffffff", opacity: HOVER_PATH_OPACITY }, paths: { requests: [], overrides: {}, selectedOn: true, version: 0, info: [], dropped: 0, unresolved: 0 }, ridden: null, streakMax: DEFAULT_STREAK_MAX, drawn: { placed: 0, segments: 0, tooFast: false, dotScale: 1, longestStreakPx: 0, streakCapPx: 0, weight: 1, fade: 1, earthPx: 0, updateMs: 0, maxUpdateMs: 0, updates: 0, totalMs: 0, selectedRing: false, hoverPath: false, hoverOpacity: 0, selectedOpacity: 0, orbitLines: 0, pathsDrawn: 0, pathDraws: 0, estimated: 0 } });

/** The most orbits a group may draw all at once, one line each. */
export const MAX_ORBIT_GROUP = 40;
const ORBIT_POINTS = 120;
/** The Earth's radius in kilometres: the unit of a position is one radius. */
const EARTH_KM = 6371;
/** How bright the chosen satellite's orbit is. The orbit under the pointer is about a third of this, so the two are told apart at a glance. */
export const SELECTED_PATH_OPACITY = BUILT_IN_PATH_STYLES["selected"]!.opacity;
/** The orbit under the pointer, before it fades. A page may set another with `--chikyu-hover-path-opacity`. */
export const HOVER_PATH_OPACITY = SELECTED_PATH_OPACITY / 3;

/** How long the faint orbit takes to go after the pointer leaves, in milliseconds. Reduced motion takes it away at once. */
export const HOVER_FADE_MS = 180;

/**
 * How much of the faint orbit is left `elapsedMs` into its fade, from `from` (1 while the pointer rests) down to 0.
 *
 * @param elapsedMs - Milliseconds since the pointer left.
 * @param from - The opacity share when the fade began, 0 to 1.
 * @returns The share still drawn, 0 when the fade is over.
 */
export const fadeLeft = (elapsedMs: number, from: number): number => from * (1 - Math.min(1, Math.max(0, elapsedMs) / HOVER_FADE_MS));
const ORBIT_REFRESH_GAME_MS = 30 * 60_000;
const ORBIT_REFRESH_WALL_MS = 1000;

const POINT_VERT = /* glsl */ `
uniform float size;
uniform float groupDim;
attribute float dim;
attribute vec3 cls;
varying float vDim;
varying vec3 vCls;
void main() {
  vDim = max(dim, groupDim);
  vCls = cls;
  gl_PointSize = size;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const POINT_FRAG = /* glsl */ `
uniform vec3 tint;
uniform float ring;
uniform float byClass;
uniform float rim;
uniform float fade;
varying float vDim;
varying vec3 vCls;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  vec3 ink = byClass > 0.5 ? vCls : tint;
  // a dim of 1 is an old element set; above 1 is an estimate (estimate-far): lighter, and fainter than an old one, so the two are told apart
  float estimated = step(1.5, vDim);
  float old = min(vDim, 1.0);
  ink = mix(ink, vec3(1.0), 0.5 * estimated);
  float weak = (1.0 - 0.7 * old) * (1.0 - 0.45 * estimated);
  if (ring > 0.5) {
    float a = smoothstep(0.30, 0.38, d) * (1.0 - smoothstep(0.44, 0.5, d));
    gl_FragColor = vec4(ink, a * weak);
  } else {
    float rimEdge = smoothstep(0.28, 0.42, d);
    vec3 colour = mix(ink, vec3(0.04, 0.05, 0.08), rimEdge * rim * (1.0 - 0.6 * estimated));
    float a = smoothstep(0.50, 0.40, d);
    gl_FragColor = vec4(colour, a * weak * fade);
  }
}`;

interface Drawn {
  source: Satellites;
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  positions: Float32Array;
  attribute: THREE.BufferAttribute;
  dim: THREE.BufferAttribute;
  dimVersion: number;
  lines: { loop: THREE.LineLoop; geometry: THREE.BufferGeometry; positions: Float32Array }[];
  linesAt: number;
  /** The indexes of the lines left out while their satellite is ridden (its path is drawn in the selected look instead), none otherwise. */
  hid: number[];
  linesWall: number;
  style: string;
  /** The streak drawn above the interpolation limit; none when the three.js parts handed over lack `LineSegments`, and the dots alone are drawn then. */
  streak: THREE.LineSegments | null;
  streakPositions: Float32Array;
  streakColours: Float32Array;
  streakAttribute: THREE.BufferAttribute;
  /** The wall-clock time of the last frame that pinned a slice of the group; 0 when the group is not being pinned (it is pinned whole at the first frame). */
  pinWall: number;
  /** The game time of that frame, to tell a jump of the clock. */
  pinTime: number;
  /** The first satellite of the next slice to pin. */
  pinNext: number;
}

/** How long, in milliseconds of wall time, a satellite's place is kept before SGP4 places it again when the clock is too fast to interpolate: about once a second. */
export const PIN_PERIOD_MS = 1000;

/**
 * How many satellites of a group to pin in a frame that comes `elapsedMs` after the last one, so that each is pinned again about once every {@link PIN_PERIOD_MS} and no frame that comes at a lively pace pins them all: a share of the group in
 * proportion to the time since the last frame (a 60 Hz frame pins about a sixtieth, a 30 Hz one a thirtieth), at least one. A frame that comes a second or more after the last one pins the whole group, as one always did: a picture that
 * is drawn that seldom has no frames for a single batch to hitch.
 *
 * @param count - How many satellites the group has.
 * @param elapsedMs - Wall-clock milliseconds since the last frame that pinned a slice.
 * @returns How many to pin now, from 0 (an empty group) to `count`. Internal: not exported from the package.
 */
export const pinSliceSize = (count: number, elapsedMs: number): number => (count <= 0 ? 0 : Math.min(count, Math.max(1, Math.ceil((count * Math.min(PIN_PERIOD_MS, Math.max(0, elapsedMs))) / PIN_PERIOD_MS))));

/**
 * The slice of a group to pin in this frame: up to two runs of satellites as `[first, count]` (the second when the slice reaches the end and goes on from the start), and where the next slice begins.
 *
 * @param count - How many satellites the group has.
 * @param next - Where the last slice ended (the first satellite of this one).
 * @param elapsedMs - Wall-clock milliseconds since the last frame that pinned a slice.
 * @returns The runs to pin and the start of the next slice. Internal: not exported from the package.
 */
export function pinPlan(count: number, next: number, elapsedMs: number): { runs: [number, number][]; next: number } {
  const slice = pinSliceSize(count, elapsedMs);
  if (slice === 0) return { runs: [], next: 0 };
  const first = next >= 0 && next < count ? Math.floor(next) : 0;
  const part = Math.min(slice, count - first);
  const runs: [number, number][] = [[first, part]];
  if (part < slice) runs.push([0, slice - part]);
  return { runs, next: (first + slice) % count };
}

/** An edge of the picture a satellite lies beyond. `null` when its place is inside the box. */
export type ScreenEdge = "top" | "right" | "bottom" | "left";

/**
 * Which edge of a box a point lies beyond. A corner goes to the edge it passes by more. Inside the box, `null`.
 *
 * @param x - CSS pixels from the left.
 * @param y - CSS pixels from the top.
 * @param width - The box width.
 * @param height - The box height.
 * @returns The edge, or `null` when the point is inside.
 */
export function screenEdge(x: number, y: number, width: number, height: number): ScreenEdge | null {
  const left = Math.max(0, -x);
  const right = Math.max(0, x - width);
  const top = Math.max(0, -y);
  const bottom = Math.max(0, y - height);
  const dx = Math.max(left, right);
  const dy = Math.max(top, bottom);
  if (dx === 0 && dy === 0) return null;
  if (dx >= dy) return left > 0 ? "left" : "right";
  return top > 0 ? "top" : "bottom";
}

/**
 * Which edge a point lies beyond, from the camera's own axes: `x` to the right, `y` up. Used when the point is behind the camera, whose picture would otherwise mirror it.
 *
 * @param x - To the camera's right.
 * @param y - Up, in the camera's axes.
 * @returns The edge.
 */
export function edgeBeyondCamera(x: number, y: number): ScreenEdge {
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? "left" : "right";
  return y >= 0 ? "top" : "bottom";
}

/**
 * Whether the Earth hides a satellite. The Earth is the unit sphere at the origin. True when the line from the camera to the satellite meets that sphere before it arrives. A graze at the limb is not hidden (the line only touches the sphere), and neither is a satellite in front of the Earth. This is not the test for a satellite behind the camera.
 *
 * @param camera - The camera, in the same units as the sphere (Earth radii).
 * @param satellite - The satellite, in those units.
 * @returns True when the globe is in the way.
 *
 * @example
 * ```ts
 * import { earthHides } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const camera = { x: 0, y: 0, z: 4 };
 * console.log(earthHides(camera, { x: 0, y: 0, z: 1.2 }));
 * console.log(earthHides(camera, { x: 0, y: 0, z: -1.2 }));
 * ```
 */
export function earthHides(camera: { x: number; y: number; z: number }, satellite: { x: number; y: number; z: number }): boolean {
  const px = satellite.x - camera.x;
  const py = satellite.y - camera.y;
  const pz = satellite.z - camera.z;
  const len2 = px * px + py * py + pz * pz;
  if (!(len2 > 0)) return false;
  const t = Math.max(0, Math.min(1, -(camera.x * px + camera.y * py + camera.z * pz) / len2));
  const nx = camera.x + px * t;
  const ny = camera.y + py * t;
  const nz = camera.z + pz * t;
  return nx * nx + ny * ny + nz * nz < 0.998;
}

/** An orthographic view: the satellite is behind the Earth's disc when it is further than the centre and inside the disc. A graze at the limb (just inside radius 1) is not hidden. */
const earthHidesDisc = (right: number, up: number, depth: number, centreDepth: number): boolean => depth < centreDepth && right * right + up * up < 0.996;

/**
 * Where a satellite is on the screen now: in CSS pixels from the view's top left (which may lie outside the box), whether it can be seen, which edge it lies beyond, whether it is behind the camera, whether the Earth hides it, and how high it is.
 *
 * @example
 * ```ts
 * import type { SatelliteScreen } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const seen = (place: SatelliteScreen | null): boolean => place !== null && place.visible;
 * console.log(typeof seen);
 * ```
 */
export interface SatelliteScreen {
  x: number;
  y: number;
  /** Inside the box, in front of the camera and not hidden by the Earth. */
  visible: boolean;
  /** Height above the mean Earth radius, in kilometres, at the moment drawn. */
  heightKm: number;
  /** The edge the satellite lies beyond, or `null` when its place is inside the box. Behind the camera, the edge is the way it lies in the camera's own axes, not the mirrored picture. */
  edge: ScreenEdge | null;
  /** The satellite is behind the camera. The picture would put it on the opposite side, so `edge` is taken from the camera's own axes. */
  behind: boolean;
  /** The Earth hides the satellite: the line from the camera meets the globe before the satellite. False at the limb, in front, and when the satellite is only behind the camera. */
  occluded: boolean;
  /** Its place is an estimate (`estimate-far`): the moment shown is beyond `maxAgeDays` from its elements. */
  estimated: boolean;
}

export interface SatelliteLayer {
  /** Where one satellite of a shown group is on the screen as of the last update, or `null` when its group is not shown or it is not placed (its elements are too old). A satellite outside the picture or behind the camera is still returned, with `visible` false. */
  placeOf(ref: SatelliteRef, camera: THREE.Camera, size: { width: number; height: number }): SatelliteScreen | null;
  /** Place every shown group for `model.time` and the chosen satellite exactly. `earthPx` is the Earth's radius on the screen, so a dot grows as the view zooms in. */
  update(time: number, speed: number, earthPx?: number, size?: { width: number; height: number }): void;
  /** Set the dot size from the Earth's radius on the screen for this frame, after the camera is known. */
  resize(earthPx: number): void;
  /** The satellite nearest to a point of the view (CSS pixels) within `radius`, if one is in front of the Earth. */
  pick(x: number, y: number, camera: THREE.Camera, size: { width: number; height: number }, radius: number): SatelliteRef | null;
  /** The path nearest to a point of the view (CSS pixels) within `radius`, if one is drawn there and not hidden by the Earth: the extra paths and the chosen satellite's own. */
  pathAt(x: number, y: number, camera: THREE.Camera, size: { width: number; height: number }, radius: number): Omit<PathHit, "pointer"> | null;
  /** Where the chosen satellite is in the view, if it is. */
  place(camera: THREE.Camera, size: { width: number; height: number }): { x: number; y: number } | null;
  /** The chosen satellite's position and velocity now (Earth radii, km/s), or false. */
  exact(ref: SatelliteRef, time: number, out: Float64Array): boolean;
  dispose(): void;
}

export function createSatelliteLayer(three: Three, scene: THREE.Object3D, state: SatelliteState, ratio: () => number): SatelliteLayer {
  if (!three.Points) throw new Error("Satellites need `Points` from three.js: add it to the parts the three loader hands over (see setThreeLoader)");
  const Points = three.Points;
  const LineSegments = three.LineSegments;
  let warned = false;
  /** Without `LineSegments` the streaks cannot be drawn, so above the interpolation limit the dots alone are shown. Said once, in the console, and nothing else is lost. */
  const warnNoStreaks = (): void => {
    if (warned) return;
    warned = true;
    console.warn("chikyu-earth: the three.js parts handed over lack `LineSegments`, so above 60 times real time the satellites are dots without streaks. Add `LineSegments` to the parts the three loader hands over (see setThreeLoader).");
  };
  const drawn = new Map<string, Drawn>();
  const tmp = new Float64Array(6);
  const projected = new three.Vector3();
  const world = new three.Vector3();
  const view = new three.Vector3();
  const ink = new three.Color();
  let basis = 0;
  let lastEarthPx = 0;

  const selectedMaterial = new three.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { size: { value: 14 }, tint: { value: new three.Color("#ffffff") }, ring: { value: 1 }, byClass: { value: 0 }, rim: { value: 1 }, fade: { value: 1 }, groupDim: { value: 0 } }, transparent: true, depthWrite: false });
  const selectedPosition = new Float32Array(3);
  const selectedGeometry = new three.BufferGeometry();
  selectedGeometry.setAttribute("position", new three.BufferAttribute(selectedPosition, 3));
  selectedGeometry.setAttribute("dim", new three.BufferAttribute(new Float32Array(1), 1));
  selectedGeometry.setAttribute("cls", new three.BufferAttribute(new Float32Array([1, 1, 1]), 3));
  const selectedPoints = new Points(selectedGeometry, selectedMaterial);
  selectedPoints.frustumCulled = false;
  selectedPoints.renderOrder = 6;
  selectedPoints.visible = false;
  scene.add(selectedPoints);
  // One line for the whole life of the layer, rewritten in place: a hover does not make a new buffer. It is about a third as bright as the chosen orbit, so it reads thinner and fainter. WebGL draws a line one pixel wide, and the chosen orbit is left as it is.
  const hoverLine = { positions: new Float32Array(ORBIT_POINTS * 3), geometry: new three.BufferGeometry(), material: new three.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: HOVER_PATH_OPACITY }) };
  hoverLine.geometry.setAttribute("position", new three.BufferAttribute(hoverLine.positions, 3));
  const hoverLoop = new three.LineLoop(hoverLine.geometry, hoverLine.material);
  hoverLoop.name = "hover-path";
  hoverLoop.frustumCulled = false;
  hoverLoop.visible = false;
  hoverLoop.renderOrder = 4;
  scene.add(hoverLoop);
  let hoverKey = "";
  // The page's paths and the chosen satellite's own orbit: one mesh, one draw call, buffers made once (see path-ribbons.ts).
  const ribbons = createPathRibbons(three, scene);
  interface PathSlot {
    key: string;
    info: PathInfo;
    style: PathStyle;
    /** Earth radii over which the path grows out of the camera: the ridden satellite's own orbit; 0 for every other. */
    fade: number;
    positions: Float32Array;
    screen: Float32Array;
    seen: Uint8Array;
    at: number;
    wall: number;
    /** The orbit could not be placed (its elements are too old): nothing to draw. */
    empty: boolean;
  }
  let slots: PathSlot[] = [];
  let slotsSignature = "";
  let resolvedFor: readonly Satellites[] = [];
  let resolvedVersion = -1;
  let resolved: { request: PathRequest; ref: SatelliteRef | null }[] = [];
  let pathDrawn = false;
  let table: Record<string, PathStyle> = styleTable({});

  const drop = (entry: Drawn): void => {
    scene.remove(entry.points);
    entry.geometry.dispose();
    entry.material.dispose();
    if (entry.streak) {
      scene.remove(entry.streak);
      entry.streak.geometry.dispose();
      (entry.streak.material as THREE.Material).dispose();
    }
    for (const line of entry.lines) {
      scene.remove(line.loop);
      line.geometry.dispose();
      (line.loop.material as THREE.Material).dispose();
    }
  };

  const placeOrbits = (entry: Drawn, group: SatelliteGroupState, time: number, wall: number): void => {
    const wanted = group.orbits && group.satellites.count <= MAX_ORBIT_GROUP;
    if (!wanted) {
      for (const line of entry.lines) line.loop.visible = false;
      return;
    }
    if (entry.lines.length === group.satellites.count && Math.abs(time - entry.linesAt) < ORBIT_REFRESH_GAME_MS && wall - entry.linesWall < 60_000) {
      for (const line of entry.lines) line.loop.visible = true;
      return;
    }
    if (entry.lines.length === group.satellites.count && wall - entry.linesWall < ORBIT_REFRESH_WALL_MS) return;
    while (entry.lines.length < group.satellites.count) {
      const positions = new Float32Array(ORBIT_POINTS * 3);
      const geometry = new three.BufferGeometry();
      geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
      const material = new three.LineBasicMaterial({ color: group.color, transparent: true, opacity: 0.45 });
      const loop = new three.LineLoop(geometry, material);
      loop.frustumCulled = false;
      scene.add(loop);
      entry.lines.push({ loop, geometry, positions });
    }
    for (let i = 0; i < group.satellites.count; i += 1) {
      const line = entry.lines[i]!;
      const path = group.satellites.orbit(i, time, ORBIT_POINTS);
      line.positions.set(path.subarray(0, ORBIT_POINTS * 3));
      (line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      line.loop.visible = group.satellites.visible(i) || path.some((v) => v !== 0);
    }
    entry.linesAt = time;
    entry.linesWall = wall;
  };

  /** The orbit of a line as a plane and a size: the unit normal of the plane (from two points a quarter of a loop apart) and the mean distance from the centre. */
  const planeOf = (positions: Float32Array): { nx: number; ny: number; nz: number; r: number } => {
    const q = (ORBIT_POINTS / 4) * 3;
    const [ax, ay, az, bx, by, bz] = [positions[0]!, positions[1]!, positions[2]!, positions[q]!, positions[q + 1]!, positions[q + 2]!];
    const [nx, ny, nz] = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    const n = Math.hypot(nx, ny, nz) || 1;
    return { nx: nx / n, ny: ny / n, nz: nz / n, r: (Math.hypot(ax, ay, az) + Math.hypot(bx, by, bz)) / 2 };
  };
  /** Two lines are one orbit when their planes are within half a degree and their sizes within 20 km: the modules of a station, each its own object, are one line drawn several times. */
  const COPLANAR = Math.cos((0.5 * Math.PI) / 180);
  const SAME_SIZE = 20 / EARTH_KM;

  /**
   * The group's own orbit lines, but not the ridden satellite's, nor any line that lies on it (the modules of a station are objects of their own with one orbit): its path is drawn by the ribbons in the `selected` look, with the fade
   * out of the camera (and by nothing at all when the page has that off), and the line would lie over it as a hard stroke. The other satellites keep theirs, and the lines come back when the ride ends.
   */
  const orbitsOf = (entry: Drawn, group: SatelliteGroupState, name: string, time: number, wall: number): void => {
    const ridden = state.ridden !== null && state.ridden.group === name ? state.ridden.index : -1;
    const wanted = group.orbits && group.satellites.count <= MAX_ORBIT_GROUP;
    placeOrbits(entry, group, time, wall);
    const mine = ridden >= 0 ? entry.lines[ridden] : undefined;
    const left: number[] = [];
    if (mine) {
      const own = planeOf(mine.positions);
      entry.lines.forEach((line, i) => {
        if (i === ridden) left.push(i);
        else if (own.r > 0) {
          const other = planeOf(line.positions);
          if (other.r > 0 && Math.abs(other.nx * own.nx + other.ny * own.ny + other.nz * own.nz) > COPLANAR && Math.abs(other.r - own.r) < SAME_SIZE) left.push(i);
        }
      });
    }
    for (const i of entry.hid) {
      const back = entry.lines[i];
      if (back && !left.includes(i)) back.loop.visible = wanted && (group.satellites.visible(i) || back.positions.some((v) => v !== 0));
    }
    for (const i of left) entry.lines[i]!.loop.visible = false;
    entry.hid = left;
  };

  const find = (ref: SatelliteRef): Satellites | undefined => state.groups.get(ref.group)?.satellites;

  const refKey = (ref: SatelliteRef): string => `${ref.group}:${ref.index}`;
  const cleanRef = (ref: SatelliteRef | null): SatelliteRef | null => {
    if (!ref) return null;
    const group = state.groups.get(ref.group);
    return group && ref.index >= 0 && ref.index < group.satellites.count && satelliteEmphasis(ref.group, group.visible, state.focus).drawn ? ref : null;
  };

  /**
   * The paths to draw now: the page's (the last 16 that match a satellite, in order), then the chosen satellite's own orbit and the ridden one's in the `selected` look, last, so they lie over the rest. The orbits are
   * computed once for a satellite and again only when the clock has moved half an hour and a second has passed, as the chosen orbit always was. The buffers are rewritten only when the list, a look or an orbit changed.
   */
  const syncPaths = (time: number, wall: number, chosen: SatelliteRef | null): void => {
    const pathState = state.paths;
    const sources = [...state.groups.values()].map((group) => group.satellites);
    const same = sources.length === resolvedFor.length && sources.every((source, i) => source === resolvedFor[i]);
    if (!same || resolvedVersion !== pathState.version) {
      resolvedFor = sources;
      resolvedVersion = pathState.version;
      table = styleTable(pathState.overrides);
      resolved = pathState.requests.map((request) => ({ request, ref: resolvePathId(request.id, state.groups) }));
    }
    // a satellite asked for twice is drawn once, in the place and look of the later request
    const byRef = new Map<string, { request: PathRequest; ref: SatelliteRef }>();
    for (const one of resolved) {
      if (!one.ref) continue;
      byRef.delete(refKey(one.ref));
      byRef.set(refKey(one.ref), { request: one.request, ref: one.ref });
    }
    const matched = [...byRef.values()];
    const capped = capPaths(matched);
    const wanted: { id: number | string; ref: SatelliteRef; name: string; style: PathStyle; fade: number }[] = [];
    for (const one of capped.kept) {
      const ref = cleanRef(one.ref);
      if (!ref) continue;
      const look = styleOf(one.request, table);
      wanted.push({ id: one.request.id, ref, name: look.name, style: look.style, fade: 0 });
    }
    if (pathState.selectedOn) {
      const ridingRef = cleanRef(state.ridden);
      const own = [chosen, state.ridden].map(cleanRef);
      const seen = new Set<string>();
      for (const ref of own) {
        if (!ref || seen.has(refKey(ref))) continue;
        seen.add(refKey(ref));
        const norad = find(ref)?.sets[ref.index]?.NORAD_CAT_ID;
        // the orbit of the satellite being ridden, seen from it, is a line from the craft to the edge of the picture: it grows out of the camera instead
        const riding = ridingRef !== null && refKey(ridingRef) === refKey(ref);
        wanted.push({ id: norad ?? refKey(ref), ref, name: "selected", style: table["selected"]!, fade: riding ? RIDE_PATH_FADE_KM / EARTH_KM : 0 });
      }
    }
    const signature = wanted.map((w) => `${refKey(w.ref)}|${w.name}|${w.style.color}|${w.style.width}|${w.style.opacity}|${w.style.dash ? w.style.dash.join(",") : "-"}|${w.fade}`).join(";");
    let dirty = signature !== slotsSignature;
    const old = new Map(slots.map((slot) => [slot.key, slot]));
    let empty = 0;
    const next: PathSlot[] = [];
    for (const w of wanted) {
      const key = `${refKey(w.ref)}|${w.name}`;
      let slot = old.get(key);
      const set = find(w.ref)!;
      if (!slot) {
        slot = { key, info: { id: w.id, ref: w.ref, style: w.name }, style: w.style, fade: w.fade, positions: new Float32Array(ORBIT_POINTS * 3), screen: new Float32Array(ORBIT_POINTS * 2), seen: new Uint8Array(ORBIT_POINTS), at: Number.NaN, wall: 0, empty: false };
        dirty = true;
      }
      old.delete(key);
      slot.info = { id: w.id, ref: w.ref, style: w.name };
      slot.style = w.style;
      slot.fade = w.fade;
      if (Number.isNaN(slot.at) || (Math.abs(time - slot.at) > ORBIT_REFRESH_GAME_MS && wall - slot.wall > ORBIT_REFRESH_WALL_MS)) {
        slot.at = time;
        slot.wall = wall;
        slot.positions.set(set.orbit(w.ref.index, time, ORBIT_POINTS).subarray(0, ORBIT_POINTS * 3));
        slot.empty = slot.positions.every((v) => v === 0);
        dirty = true;
      }
      if (slot.empty) empty += 1;
      next.push(slot);
    }
    slots = next;
    if (dirty) {
      slotsSignature = signature;
      ribbons.set(slots.filter((slot) => !slot.empty).map((slot): RibbonPath => ({ positions: slot.positions, style: slot.style, fade: slot.fade })));
    }
    const own = wanted.filter((w) => w.name === "selected" && pathState.selectedOn);
    pathState.info = slots.filter((slot) => !slot.empty).map((slot) => ({ ...slot.info }));
    pathState.dropped = capped.dropped;
    pathState.unresolved = resolved.length - matched.length + empty;
    pathDrawn = ribbons.mesh.visible;
    state.drawn.pathsDrawn = ribbons.count;
    state.drawn.pathDraws = pathDrawn ? 1 : 0;
    state.drawn.selectedOpacity = own.length > 0 ? own[0]!.style.opacity : 0;
  };

  return {
    update(time, speed, earthPx = 0, size) {
      const started = performance.now();
      const tooFast = Math.abs(speed) > MAX_SATELLITE_SPEED;
      const step = Math.min(60_000, Math.max(1000, Math.abs(speed) * 1000));
      if (basis === 0 && earthPx > 0) basis = earthPx;
      const dotScale = basis > 0 && earthPx > 0 ? Math.min(2.5, Math.max(0.45, Math.sqrt(earthPx / basis))) : 1;
      // One frame at the pace the picture is held to (30 a second), whatever the frames really take: a streak that grew with a slow frame would grow with a slow computer
      const span = tooFast ? speed * (1000 / 30) : 0;
      if (earthPx > 0) lastEarthPx = earthPx;
      const radius = earthPx > 0 ? earthPx : lastEarthPx > 0 ? lastEarthPx : 150;
      // the cap is a share of the Earth's drawn radius with a ceiling in pixels, so in Earth radii it is the pixels over the Earth's radius in pixels: a zoomed-out Earth allows a longer stretch of orbit than a zoomed-in one
      const capLength = state.streakMax > 0 ? Math.min(STREAK_REACH, state.streakMax / radius) : 0;
      const weight = markWeight(radius);
      // how crowded the near side of the Earth is with marks: the dots at their size and, above the interpolation limit, the streaks (a pixel wide) at the longest they may be
      let marks = 0;
      let dotArea = 0;
      for (const group of state.groups.values()) {
        if (!group.visible) continue;
        marks += group.satellites.count;
        dotArea += group.satellites.count * (group.size * dotScale) ** 2;
      }
      const dotFade = marks > 0 ? crowdFade(marks, dotArea / marks, radius, CROWD_COVER_DOTS) : 1;
      const streakFade = tooFast && capLength > 0 ? crowdFade(marks, Math.max(1, capLength * radius), radius, CROWD_COVER_STREAKS, false) : 1;
      let longest = 0;
      for (const [name, entry] of drawn) {
        if (state.groups.get(name)?.satellites !== entry.source) {
          drop(entry);
          drawn.delete(name);
        }
      }
      let placed = 0;
      let segments = 0;
      for (const [name, group] of state.groups) {
        let entry = drawn.get(name);
        if (!entry) {
          const count = group.satellites.count;
          const positions = new Float32Array(count * 3);
          const geometry = new three.BufferGeometry();
          const attribute = new three.BufferAttribute(positions, 3);
          geometry.setAttribute("position", attribute);
          const dim = new three.BufferAttribute(group.satellites.dimmed, 1);
          geometry.setAttribute("dim", dim);
          geometry.setAttribute("cls", new three.BufferAttribute(group.satellites.classColour, 3));
          const material = new three.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { size: { value: group.size * ratio() }, tint: { value: new three.Color(group.color) }, ring: { value: 0 }, byClass: { value: 0 }, rim: { value: 1 }, fade: { value: 1 }, groupDim: { value: 0 } }, transparent: true, depthWrite: false });
          const points = new Points(geometry, material);
          points.frustumCulled = false;
          points.renderOrder = 5;
          scene.add(points);
          const streakPositions = new Float32Array(count * 6);
          const streakColours = new Float32Array(count * 6);
          const streakGeometry = new three.BufferGeometry();
          const streakAttribute = new three.BufferAttribute(streakPositions, 3);
          streakGeometry.setAttribute("position", streakAttribute);
          streakGeometry.setAttribute("color", new three.BufferAttribute(streakColours, 3));
          let streak: THREE.LineSegments | null = null;
          if (LineSegments) {
            streak = new LineSegments(streakGeometry, new three.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
            streak.frustumCulled = false;
            streak.renderOrder = 4;
            streak.visible = false;
            scene.add(streak);
          }
          entry = { source: group.satellites, points, geometry, material, positions, attribute, dim, dimVersion: -1, lines: [], hid: [], linesAt: Number.NaN, linesWall: 0, style: "", streak, streakPositions, streakColours, streakAttribute, pinWall: 0, pinTime: 0, pinNext: 0 };
          drawn.set(name, entry);
        }
        const style = `${group.color}|${group.size}|${ratio()}|${dotScale}|${state.orbitTint ? 1 : 0}`;
        if (style !== entry.style) {
          entry.style = style;
          entry.material.uniforms["size"]!.value = group.size * dotScale * ratio();
          entry.material.uniforms["tint"]!.value.set(group.color);
          entry.material.uniforms["byClass"]!.value = state.orbitTint ? 1 : 0;
          ink.set(group.color);
          const colours = group.satellites.classColour;
          for (let i = 0; i < group.satellites.count; i += 1) {
            const r = state.orbitTint ? colours[i * 3]! : ink.r;
            const g = state.orbitTint ? colours[i * 3 + 1]! : ink.g;
            const b = state.orbitTint ? colours[i * 3 + 2]! : ink.b;
            for (const end of [0, 1]) {
              const c = i * 6 + end * 3;
              entry.streakColours[c] = r;
              entry.streakColours[c + 1] = g;
              entry.streakColours[c + 2] = b;
            }
          }
          if (entry.streak) (entry.streak.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
        }
        const choice = satelliteEmphasis(name, group.visible, state.focus);
        const show = choice.drawn;
        entry.material.uniforms["groupDim"]!.value = choice.dim;
        entry.points.visible = show;
        if (!show) {
          group.placed = 0;
          if (entry.streak) entry.streak.visible = false;
          for (const line of entry.lines) line.loop.visible = false;
          continue;
        }
        const dimmed = choice.dim > 0;
        // the streaks are fainter and the dark rims of the dots fade as the Earth is drawn smaller, so thousands of marks do not darken a small Earth
        if (entry.streak) (entry.streak.material as { opacity?: number }).opacity = (dimmed ? 0.3 : 0.95) * (0.4 + 0.6 * weight) * streakFade;
        entry.material.uniforms["rim"]!.value = weight;
        entry.material.uniforms["fade"]!.value = dotFade;
        if (tooFast) {
          // pinned whole at the first frame and when the time jumped (a date typed in, a scrub), so a place is never turned across days; after that a slice a frame, each satellite again about once a second,
          // so SGP4 never runs for the whole group (17,000 satellites take about 12 ms) in one frame
          const total = group.satellites.count;
          if (entry.pinWall === 0 || Math.abs(time - entry.pinTime) > 1500 * Math.abs(speed)) {
            group.satellites.pin(time);
            entry.pinNext = 0;
          } else {
            const plan = pinPlan(total, entry.pinNext, started - entry.pinWall);
            for (const [first, part] of plan.runs) group.satellites.pin(time, first, part);
            entry.pinNext = plan.next;
          }
          entry.pinWall = started;
          entry.pinTime = time;
          const n = group.satellites.arc(time, span, entry.positions, entry.streakPositions, capLength);
          entry.attribute.needsUpdate = true;
          if (entry.streak) {
            entry.streakAttribute.needsUpdate = true;
            entry.streak.visible = n > 0 && Math.abs(span) > 0;
          } else warnNoStreaks();
          if (entry.dimVersion !== group.satellites.dimVersion) {
            entry.dimVersion = group.satellites.dimVersion;
            entry.dim.needsUpdate = true;
          }
          for (const line of entry.lines) line.loop.visible = false;
          placed += n;
          group.placed = n;
          if (entry.streak) {
            segments += n;
            longest = Math.max(longest, longestStreak(entry.streakPositions, total, radius));
          }
        } else {
          if (entry.streak) entry.streak.visible = false;
          entry.pinWall = 0;
          group.satellites.setStep(step);
          group.satellites.at(time, entry.positions);
          entry.attribute.needsUpdate = true;
          if (entry.dimVersion !== group.satellites.dimVersion) {
            entry.dimVersion = group.satellites.dimVersion;
            entry.dim.needsUpdate = true;
          }
          placed += group.satellites.placed;
          group.placed = group.satellites.placed;
          orbitsOf(entry, group, name, time, started);
          const opacity = dimmed ? 0.15 : 0.45;
          for (const line of entry.lines) (line.loop.material as { opacity?: number }).opacity = opacity;
        }
      }

      let lines = 0;
      for (const entry of drawn.values()) for (const line of entry.lines) if (line.loop.visible) lines += 1;
      state.drawn.orbitLines = lines;
      if (size) ribbons.frame(size.width, size.height, radius);
      const chosen = state.selected;
      const chosenGroup = chosen ? state.groups.get(chosen.group) : undefined;
      const chosenDrawn = chosen !== null && chosenGroup !== undefined && satelliteEmphasis(chosen.group, chosenGroup.visible, state.focus).drawn;
      const set = chosen ? find(chosen) : undefined;
      if (chosen && set && chosenDrawn && set.exact(chosen.index, time, tmp)) {
        selectedPosition[0] = tmp[0]!;
        selectedPosition[1] = tmp[1]!;
        selectedPosition[2] = tmp[2]!;
        (selectedGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        const over = state.modelOver !== null && state.modelOver.group === chosen.group && state.modelOver.index === chosen.index;
        selectedPoints.visible = !over;
        state.drawn.selectedRing = !over;
        selectedMaterial.uniforms["size"]!.value = 14 * ratio();
      } else {
        selectedPoints.visible = false;
        state.drawn.selectedRing = false;
      }
      syncPaths(time, started, chosen !== null && set !== undefined && chosenDrawn ? chosen : null);

      // The faint orbit: one path at a time, computed once from the elements already loaded, hidden while it is the chosen satellite's own orbit.
      const hover = state.hover;
      const hoverRef = hover.enabled && hover.fade > 0 ? hover.ref : null;
      const hoverSet = hoverRef ? find(hoverRef) : undefined;
      const sameAsSelected = Boolean(hoverRef && state.selected && hoverRef.group === state.selected.group && hoverRef.index === state.selected.index);
      const hoverOk = Boolean(hoverRef && hoverSet && !sameAsSelected && hoverRef.index >= 0 && hoverRef.index < hoverSet.count && hoverSet.visible(hoverRef.index));
      if (hoverOk && hoverRef && hoverSet) {
        const key = `${hoverRef.group}:${hoverRef.index}`;
        if (key !== hoverKey) {
          hoverKey = key;
          hoverLine.positions.set(hoverSet.orbit(hoverRef.index, time, ORBIT_POINTS).subarray(0, ORBIT_POINTS * 3));
          (hoverLine.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        }
        hoverLine.material.color.set(hover.color || "#ffffff");
        hoverLine.material.opacity = hover.opacity * hover.fade;
        hoverLoop.visible = hoverLine.material.opacity > 0;
      } else {
        hoverLoop.visible = false;
        if (!hoverRef) hoverKey = "";
      }
      state.drawn.hoverPath = hoverLoop.visible;
      state.drawn.hoverOpacity = hoverLoop.visible ? hoverLine.material.opacity : 0;
      state.drawn.placed = placed;
      let estimated = 0;
      for (const group of state.groups.values()) if (group.visible) estimated += group.satellites.estimatedCount;
      state.drawn.estimated = estimated;
      state.drawn.segments = segments;
      state.drawn.longestStreakPx = longest;
      state.drawn.streakCapPx = capLength * radius;
      state.drawn.weight = weight;
      state.drawn.fade = Math.min(dotFade, streakFade);
      state.drawn.earthPx = radius;
      state.drawn.dotScale = dotScale;
      state.drawn.tooFast = tooFast;
      state.drawn.updateMs = performance.now() - started;
      if (state.drawn.updateMs > state.drawn.maxUpdateMs) state.drawn.maxUpdateMs = state.drawn.updateMs;
      state.drawn.updates += 1;
      state.drawn.totalMs += state.drawn.updateMs;
    },

    resize(earthPx) {
      if (!(earthPx > 0)) return;
      if (basis === 0) basis = earthPx;
      const dotScale = Math.min(2.5, Math.max(0.45, Math.sqrt(earthPx / basis)));
      state.drawn.dotScale = dotScale;
      for (const [name, entry] of drawn) {
        const group = state.groups.get(name);
        if (!group) continue;
        entry.material.uniforms["size"]!.value = group.size * dotScale * ratio();
      }
    },

    pick(x, y, camera, size, radius) {
      let best: SatelliteRef | null = null;
      let bestD = radius * radius;
      const c = camera.position;
      const ortho = (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera === true;
      // an orthographic view looks along one direction: what is behind the Earth is further than its centre and inside its disc
      const centreDepth = ortho ? view.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse).z : 0;
      for (const [name, entry] of drawn) {
        const group = state.groups.get(name);
        if (!group || !entry.points.visible) continue;
        const p = entry.positions;
        for (let i = 0; i < group.satellites.count; i += 1) {
          if (!group.satellites.visible(i)) continue;
          world.set(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!).applyMatrix4(scene.matrixWorld);
          projected.copy(world).project(camera);
          if (projected.z > 1 || projected.z < -1) continue;
          const dx = ((projected.x + 1) / 2) * size.width - x;
          const dy = ((1 - projected.y) / 2) * size.height - y;
          const d = dx * dx + dy * dy;
          if (d > bestD) continue;
          if (ortho) {
            view.copy(world).applyMatrix4(camera.matrixWorldInverse);
            if (earthHidesDisc(view.x, view.y, view.z, centreDepth)) continue;
          } else if (earthHides(c, world)) continue;
          best = { group: name, index: i };
          bestD = d;
        }
      }
      return best;
    },

    placeOf(ref, camera, size) {
      const entry = drawn.get(ref.group);
      const group = state.groups.get(ref.group);
      if (!entry || !group || !entry.points.visible || !Number.isInteger(ref.index) || ref.index < 0 || ref.index >= group.satellites.count || !group.satellites.visible(ref.index)) return null;
      const p = entry.positions;
      const i = ref.index * 3;
      world.set(p[i]!, p[i + 1]!, p[i + 2]!).applyMatrix4(scene.matrixWorld);
      const heightKm = (Math.hypot(p[i]!, p[i + 1]!, p[i + 2]!) - 1) * 6371;
      // the camera looks down its own -z, so a point in front has a negative z. A point behind would be mirrored by the picture, so its edge is read from these axes.
      view.copy(world).applyMatrix4(camera.matrixWorldInverse);
      const ortho = (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera === true;
      const behind = !ortho && view.z > 0;
      projected.copy(world).project(camera);
      let x = Number.isFinite(projected.x) ? ((projected.x + 1) / 2) * size.width : size.width / 2;
      let y = Number.isFinite(projected.y) ? ((1 - projected.y) / 2) * size.height : size.height / 2;
      const edge = behind ? edgeBeyondCamera(view.x, view.y) : screenEdge(x, y, size.width, size.height);
      if (behind) {
        if (edge === "left") x = -1;
        else if (edge === "right") x = size.width + 1;
        else if (edge === "top") y = -1;
        else y = size.height + 1;
      }
      const c = camera.position;
      let hidden = false;
      if (!behind) {
        if (ortho) {
          const right = view.x;
          const up = view.y;
          const depth = view.z;
          const centreDepth = world.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse).z;
          hidden = earthHidesDisc(right, up, depth, centreDepth);
          world.set(p[i]!, p[i + 1]!, p[i + 2]!).applyMatrix4(scene.matrixWorld);
        } else hidden = earthHides(c, world);
      }
      return { x, y, visible: !behind && !hidden && edge === null, heightKm, edge, behind, occluded: hidden, estimated: find(ref)?.estimated(ref.index) ?? false };
    },

    pathAt(x, y, camera, size, radius) {
      if (!(radius > 0)) return null;
      const c = camera.position;
      const ortho = (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera === true;
      const centreDepth = ortho ? view.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse).z : 0;
      const loops: { xy: Float32Array; ok: Uint8Array; count: number }[] = [];
      const drawn = slots.filter((slot) => !slot.empty);
      // the topmost look is the last drawn, so on a tie the later slot wins: walk them in reverse
      const order = drawn.map((slot, i) => ({ slot, i })).reverse();
      for (const { slot } of order) {
        for (let i = 0; i < ORBIT_POINTS; i += 1) {
          world.set(slot.positions[i * 3]!, slot.positions[i * 3 + 1]!, slot.positions[i * 3 + 2]!).applyMatrix4(scene.matrixWorld);
          projected.copy(world).project(camera);
          slot.screen[i * 2] = ((projected.x + 1) / 2) * size.width;
          slot.screen[i * 2 + 1] = ((1 - projected.y) / 2) * size.height;
          let seen = projected.z <= 1 && projected.z >= -1 && Number.isFinite(projected.x) && Number.isFinite(projected.y);
          if (seen) {
            if (ortho) {
              view.copy(world).applyMatrix4(camera.matrixWorldInverse);
              seen = !earthHidesDisc(view.x, view.y, view.z, centreDepth);
            } else seen = !earthHides(c, world);
          }
          slot.seen[i] = seen ? 1 : 0;
        }
        loops.push({ xy: slot.screen, ok: slot.seen, count: ORBIT_POINTS });
      }
      const best = nearestLoop(x, y, loops, radius);
      if (!best) return null;
      const slot = order[best.index]!.slot;
      return { ...slot.info, ref: { ...slot.info.ref }, x: best.x, y: best.y, distancePx: best.distance };
    },

    place(camera, size) {
      if (!selectedPoints.visible) return null;
      projected.set(selectedPosition[0]!, selectedPosition[1]!, selectedPosition[2]!).applyMatrix4(scene.matrixWorld).project(camera);
      if (projected.z > 1 || projected.z < -1) return null;
      return { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height };
    },

    exact(ref, time, out) {
      return find(ref)?.exact(ref.index, time, out) ?? false;
    },

    dispose() {
      for (const entry of drawn.values()) drop(entry);
      drawn.clear();
      scene.remove(selectedPoints, hoverLoop);
      ribbons.dispose();
      selectedGeometry.dispose();
      selectedMaterial.dispose();
      hoverLine.geometry.dispose();
      hoverLine.material.dispose();
    },
  };
}
