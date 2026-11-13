// The satellites in the space view: each group is one THREE.Points, which is one draw call however many satellites it holds, its positions written in place by the group's
// own interpolation (SGP4 about once a second, see src/satellites/track.ts). A chosen satellite gets a larger dot and its orbit; a small group (the stations) can show every orbit.
import type * as THREE from "three";
import { MAX_SATELLITE_SPEED } from "../satellites/limits.ts";
import type { SatelliteRef, Satellites } from "../satellites/types.ts";
import type { ThreeParts } from "../realistic/textures.ts";
import { satelliteEmphasis, type SatelliteFocus } from "./satellite-focus.ts";

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
   * The pixel ceiling of a streak's length on the screen above the interpolation limit, in CSS pixels at the Earth's own distance (`satellite-streak-max`). A streak is also never longer than {@link STREAK_REACH} Earth radii, so it shrinks with the Earth.
   * 0 draws the whole stretch one frame spans, however long that is.
   */
  streakMax: number;
  drawn: { placed: number; segments: number; tooFast: boolean; dotScale: number; longestStreakPx: number; streakCapPx: number; weight: number; fade: number; earthPx: number; updateMs: number; maxUpdateMs: number; updates: number; totalMs: number };
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

export const newSatelliteState = (): SatelliteState => ({ groups: new Map(), selected: null, marked: new Set(), pinned: [], orbitTint: false, focus: null, streakMax: DEFAULT_STREAK_MAX, drawn: { placed: 0, segments: 0, tooFast: false, dotScale: 1, longestStreakPx: 0, streakCapPx: 0, weight: 1, fade: 1, earthPx: 0, updateMs: 0, maxUpdateMs: 0, updates: 0, totalMs: 0 } });

/** The most orbits a group may draw all at once, one line each. */
export const MAX_ORBIT_GROUP = 40;
const ORBIT_POINTS = 120;
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
  if (ring > 0.5) {
    float a = smoothstep(0.30, 0.38, d) * (1.0 - smoothstep(0.44, 0.5, d));
    gl_FragColor = vec4(ink, a * (1.0 - 0.7 * vDim));
  } else {
    float rimEdge = smoothstep(0.28, 0.42, d);
    vec3 colour = mix(ink, vec3(0.04, 0.05, 0.08), rimEdge * rim);
    float a = smoothstep(0.50, 0.40, d);
    gl_FragColor = vec4(colour, a * (1.0 - 0.7 * vDim) * fade);
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
 * Where a satellite is on the screen now: in CSS pixels from the view's top left (which may lie outside the box), whether it can be seen, which edge it lies beyond, whether it is behind the camera, and how high it is.
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
}

export interface SatelliteLayer {
  /** Where one satellite of a shown group is on the screen as of the last update, or `null` when its group is not shown or it is not placed (its elements are too old). A satellite outside the picture or behind the camera is still returned, with `visible` false. */
  placeOf(ref: SatelliteRef, camera: THREE.Camera, size: { width: number; height: number }): SatelliteScreen | null;
  /** Place every shown group for `model.time` and the chosen satellite exactly. `earthPx` is the Earth's radius on the screen, so a dot grows as the view zooms in. */
  update(time: number, speed: number, earthPx?: number): void;
  /** Set the dot size from the Earth's radius on the screen for this frame, after the camera is known. */
  resize(earthPx: number): void;
  /** The satellite nearest to a point of the view (CSS pixels) within `radius`, if one is in front of the Earth. */
  pick(x: number, y: number, camera: THREE.Camera, size: { width: number; height: number }, radius: number): SatelliteRef | null;
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
  const selectedLine = { positions: new Float32Array(ORBIT_POINTS * 3), geometry: new three.BufferGeometry(), material: new three.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85 }) };
  selectedLine.geometry.setAttribute("position", new three.BufferAttribute(selectedLine.positions, 3));
  const selectedLoop = new three.LineLoop(selectedLine.geometry, selectedLine.material);
  selectedLoop.frustumCulled = false;
  selectedLoop.visible = false;
  scene.add(selectedLoop);
  let selectedKey = "";
  let selectedAt = 0;
  let selectedWall = 0;

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

  const orbitsOf = (entry: Drawn, group: SatelliteGroupState, time: number, wall: number): void => {
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

  const find = (ref: SatelliteRef): Satellites | undefined => state.groups.get(ref.group)?.satellites;

  return {
    update(time, speed, earthPx = 0) {
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
          entry = { source: group.satellites, points, geometry, material, positions, attribute, dim, dimVersion: -1, lines: [], linesAt: Number.NaN, linesWall: 0, style: "", streak, streakPositions, streakColours, streakAttribute, pinWall: 0, pinTime: 0, pinNext: 0 };
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
          orbitsOf(entry, group, time, started);
          const opacity = dimmed ? 0.15 : 0.45;
          for (const line of entry.lines) (line.loop.material as { opacity?: number }).opacity = opacity;
        }
      }

      const chosen = state.selected;
      const chosenGroup = chosen ? state.groups.get(chosen.group) : undefined;
      const chosenDrawn = chosen !== null && chosenGroup !== undefined && satelliteEmphasis(chosen.group, chosenGroup.visible, state.focus).drawn;
      const set = chosen ? find(chosen) : undefined;
      if (chosen && set && chosenDrawn && set.exact(chosen.index, time, tmp)) {
        selectedPosition[0] = tmp[0]!;
        selectedPosition[1] = tmp[1]!;
        selectedPosition[2] = tmp[2]!;
        (selectedGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        selectedPoints.visible = true;
        const key = `${chosen.group}:${chosen.index}`;
        if (key !== selectedKey || (Math.abs(time - selectedAt) > ORBIT_REFRESH_GAME_MS && started - selectedWall > ORBIT_REFRESH_WALL_MS)) {
          selectedKey = key;
          selectedAt = time;
          selectedWall = started;
          selectedLine.positions.set(set.orbit(chosen.index, time, ORBIT_POINTS).subarray(0, ORBIT_POINTS * 3));
          (selectedLine.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        }
        selectedLoop.visible = true;
        selectedMaterial.uniforms["size"]!.value = 14 * ratio();
      } else {
        selectedPoints.visible = false;
        selectedLoop.visible = false;
        selectedKey = "";
      }
      state.drawn.placed = placed;
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
            if (view.z < centreDepth && view.x * view.x + view.y * view.y < 0.996) continue;
          } else {
            // behind the Earth: the line from the camera to the satellite passes through the unit sphere before it gets there
            const px = world.x - c.x;
            const py = world.y - c.y;
            const pz = world.z - c.z;
            const len2 = px * px + py * py + pz * pz;
            const t = Math.max(0, Math.min(1, -(c.x * px + c.y * py + c.z * pz) / len2));
            const nx = c.x + px * t;
            const ny = c.y + py * t;
            const nz = c.z + pz * t;
            if (nx * nx + ny * ny + nz * nz < 0.998) continue;
          }
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
          hidden = depth < centreDepth && right * right + up * up < 0.996;
          world.set(p[i]!, p[i + 1]!, p[i + 2]!).applyMatrix4(scene.matrixWorld);
        } else {
          // behind the Earth: the line from the camera to the satellite passes through the unit sphere before it gets there
          const px = world.x - c.x;
          const py = world.y - c.y;
          const pz = world.z - c.z;
          const len2 = px * px + py * py + pz * pz;
          const t = Math.max(0, Math.min(1, -(c.x * px + c.y * py + c.z * pz) / len2));
          const nx = c.x + px * t;
          const ny = c.y + py * t;
          const nz = c.z + pz * t;
          hidden = nx * nx + ny * ny + nz * nz < 0.998;
        }
      }
      return { x, y, visible: !behind && !hidden && edge === null, heightKm, edge, behind };
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
      scene.remove(selectedPoints, selectedLoop);
      selectedGeometry.dispose();
      selectedMaterial.dispose();
      selectedLine.geometry.dispose();
      selectedLine.material.dispose();
    },
  };
}
