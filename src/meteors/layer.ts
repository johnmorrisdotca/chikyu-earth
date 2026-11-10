// Meteors seen from space: short streaks where meteors burn, 80 to 120 km up, on the dark side of the Earth and in its twilight.
// What is real: how many there are from place to place (the sporadic background and the active showers, by `hourlyRateAt`), that they
// are seen only where it is dark, the way each shower's meteors travel (away from its radiant), their height and their speed.
// What is illustration: every single streak. Its place and its moment are drawn at random, a streak stands for a great many
// meteors, and a short one is lengthened until it can be seen.
// All the streaks are one mesh and one draw call. three.js is the page's own: this file takes it as an argument and never imports it.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";
import type { MeteorShower } from "../data/meteor-showers.ts";
import { METEOR_HEIGHT_KM, SPORADIC_HOURLY_RATE, darkness, hourlyRateAt, meteorSky, type MeteorSky } from "./rate.ts";

type Three = ThreeParts;
type Vec3 = [number, number, number];

const EARTH_KM = 6371;
/**
 * The most streaks alive at once: the size of the one mesh they are drawn as.
 *
 * @example
 * ```ts
 * import { METEOR_SLOTS } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(METEOR_SLOTS); // 48
 * ```
 */
export const METEOR_SLOTS = 48;
/** Streaks a second across a view whose whole face is dark, on a night with no shower. */
const BASE_PER_SECOND = 2.5;
/**
 * The most streaks drawn in a second, however strong the shower.
 *
 * @example
 * ```ts
 * import { METEORS_PER_SECOND_MAX } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(METEORS_PER_SECOND_MAX); // 9
 * ```
 */
export const METEORS_PER_SECOND_MAX = 9;
/** A streak is lengthened to at least this many CSS pixels, so it can be seen. */
const MIN_STREAK_PX = 34;
/** The most a streak is lengthened by. One that comes straight at the eye stays short: it is a flash, as it would be. */
const MAX_STRETCH = 14;
/** The longest path drawn, in kilometres (a meteor that comes in low skims a long way). */
const MAX_PATH_KM = 260;
/** The sky is worked out again when the moment shown has moved this far, or this much real time has passed. */
const SKY_GAME_MS = 60_000;
const SKY_WALL_MS = 1500;
const SAMPLES = 160;
/** The Earth's radius on the screen, in CSS pixels, below which no streak is drawn. */
const MIN_EARTH_PX = 40;
const FRAME_MS = 33;

/** The meteors' part of the Earth's model: what the element sets, and what the layer wrote at its last step. */
export interface MeteorState {
  on: boolean;
  /** Whether new streaks may start now (the clock runs, the page is in view, and a reader who asked for less motion has pressed Play). */
  running: () => boolean;
  /** Told when the strongest active shower changes, with `null` when none is active. */
  onShower?: (shower: MeteorShower | null, zhr: number) => void;
  random: () => number;
  drawn: { alive: number; spawned: number; perSecond: number; shower: string | null; zhr: number };
}

export const newMeteorState = (): MeteorState => ({ on: false, running: () => false, random: Math.random, drawn: { alive: 0, spawned: 0, perSecond: 0, shower: null, zhr: 0 } });

/** What the layer needs at each step. The vectors are in the Earth's own axes (see `placeVector`). */
export interface MeteorStep {
  /** The page's clock, in milliseconds (`performance.now()`). */
  now: number;
  /** The moment shown, in milliseconds since the epoch. */
  time: number;
  /** The place at the middle of the view. */
  facing: Vec3;
  /** The place the Sun is overhead. */
  sun: Vec3;
  /** The Earth's radius on the screen, in CSS pixels. */
  radius: number;
  width: number;
  height: number;
}

export interface MeteorLayer {
  /** Put the streaks right for now; returns the milliseconds until the next draw is wanted, or `Infinity` when nothing is moving and nothing is due. */
  step(input: MeteorStep): number;
  dispose(): void;
}

/**
 * How many streaks a second are drawn for a mean hourly rate over the dark part of the view: 2.5 a second where the whole view is dark on a
 * night with no shower, more with a shower but squeezed (the 0.6th power) and never over nine, none where nothing in view is dark.
 * A streak stands for a great many meteors: the count follows the real rate, it does not equal it.
 *
 * @param meanHourlyRate - The mean over the view of each place's hourly rate times how dark it is there (`hourlyRateAt`, `darkness`).
 * @returns Streaks a second.
 *
 * @example
 * ```ts
 * import { streaksPerSecond } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(streaksPerSecond(8), streaksPerSecond(0), streaksPerSecond(100000)); // 2.5 0 9
 * ```
 */
export function streaksPerSecond(meanHourlyRate: number): number {
  if (!(meanHourlyRate > 0)) return 0;
  return Math.min(METEORS_PER_SECOND_MAX, BASE_PER_SECOND * Math.pow(meanHourlyRate / SPORADIC_HOURLY_RATE, 0.6));
}

const VERT = /* glsl */ `
uniform float now;
uniform float vw;
uniform float vh;
uniform float thick;
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec2 aTime;
attribute vec2 aCorner;
attribute float aGlow;
varying float vAlong;
varying float vSide;
varying float vFade;
void main() {
  float age = (now - aTime.x) / max(aTime.y, 0.001);
  float u = clamp(age, 0.0, 1.0);
  vec3 headAt = mix(aStart, aEnd, u);
  vec3 tailAt = mix(aStart, aEnd, max(0.0, u - 0.75));
  vec4 head = projectionMatrix * modelViewMatrix * vec4(headAt, 1.0);
  vec4 tail = projectionMatrix * modelViewMatrix * vec4(tailAt, 1.0);
  vec2 halfSize = vec2(vw, vh) * 0.5;
  vec2 along = head.xy / head.w * halfSize - tail.xy / tail.w * halfSize;
  float len = length(along);
  along = len > 0.0001 ? along / len : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  vec4 at = aCorner.x > 0.5 ? head : tail;
  vec2 push = across * aCorner.y * thick + along * (aCorner.x > 0.5 ? thick : -thick);
  at.xy += push / halfSize * at.w;
  // a streak is there from its start to a short afterglow, and nowhere before or after
  float alive = step(0.0, age) * (1.0 - smoothstep(1.0, 1.35, age));
  vFade = alive * aGlow * smoothstep(0.0, 0.12, age);
  vAlong = aCorner.x;
  vSide = aCorner.y;
  gl_Position = alive > 0.0 ? at : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 tint;
varying float vAlong;
varying float vSide;
varying float vFade;
void main() {
  float core = 1.0 - abs(vSide);
  // a thin tail that brightens towards the head, and the head itself a small bright point
  float tail = pow(vAlong, 1.2) * smoothstep(0.0, 0.6, core);
  float head = smoothstep(0.8, 1.0, vAlong) * smoothstep(0.0, 0.35, core);
  float alpha = vFade * min(1.0, tail + head);
  gl_FragColor = vec4(tint, alpha);
}`;

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): Vec3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (v: readonly number[]): Vec3 => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};

/**
 * Where one streak runs: from `start` to `end`, in Earth radii from the centre, in the Earth's own axes.
 * It ends `METEOR_HEIGHT_KM.bottom + 5` km up and comes down the line from the radiant; its true length is the drop in height
 * divided by the sine of the radiant's height, at most 260 km, and `stretch` (1 or more) lengthens it for the eye.
 *
 * @param place - The unit vector of the place it ends over.
 * @param radiant - The unit vector towards the radiant (it must stand above that place's horizon).
 * @param stretch - How many times longer than true to draw it; 1 is true.
 * @returns The two ends, and the true length in kilometres.
 *
 * @example
 * ```ts
 * import { placeVector, streakPath } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const place = placeVector({ lon: 0, lat: 0 });
 * // Straight down from overhead: it falls 25 km, from 110 km up to 85 km.
 * const path = streakPath(place, place, 1);
 * console.log(path.km.toFixed(0), ((Math.hypot(...path.start) - 1) * 6371).toFixed(0)); // "25" "110"
 * ```
 */
export function streakPath(place: readonly [number, number, number], radiant: readonly [number, number, number], stretch = 1): { start: Vec3; end: Vec3; km: number } {
  const bottom = METEOR_HEIGHT_KM.bottom + 5;
  const top = METEOR_HEIGHT_KM.top - 10;
  const sine = Math.max(0.05, dot(place, radiant));
  const km = Math.min(MAX_PATH_KM, (top - bottom) / sine);
  const end: Vec3 = [place[0] * (1 + bottom / EARTH_KM), place[1] * (1 + bottom / EARTH_KM), place[2] * (1 + bottom / EARTH_KM)];
  const back = (km * Math.max(1, stretch)) / EARTH_KM;
  return { start: [end[0] + radiant[0] * back, end[1] + radiant[1] * back, end[2] + radiant[2] * back], end, km };
}

/** Make the layer inside `parent`, an object that turns with the Earth and has the Earth's own axes and a radius of 1 (a group, or the Earth's own mesh). Nothing is drawn until `step` starts a streak. */
export function createMeteorLayer(three: Three, parent: THREE.Object3D, state: MeteorState): MeteorLayer {
  const corners = [0, -1, 0, 1, 1, -1, 1, 1];
  const count = METEOR_SLOTS * 4;
  const starts = new Float32Array(count * 3);
  const ends = new Float32Array(count * 3);
  const times = new Float32Array(count * 2).fill(-1000);
  const cornerOf = new Float32Array(count * 2);
  const glows = new Float32Array(count);
  const index: number[] = [];
  for (let slot = 0; slot < METEOR_SLOTS; slot += 1) {
    for (let v = 0; v < 4; v += 1) {
      cornerOf[(slot * 4 + v) * 2] = corners[v * 2]!;
      cornerOf[(slot * 4 + v) * 2 + 1] = corners[v * 2 + 1]!;
      times[(slot * 4 + v) * 2 + 1] = 1;
    }
    const a = slot * 4;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new three.BufferGeometry();
  const startAttr = new three.BufferAttribute(starts, 3);
  const endAttr = new three.BufferAttribute(ends, 3);
  const timeAttr = new three.BufferAttribute(times, 2);
  const glowAttr = new three.BufferAttribute(glows, 1);
  // three.js wants a `position`; the shader places every corner itself
  geometry.setAttribute("position", new three.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aStart", startAttr);
  geometry.setAttribute("aEnd", endAttr);
  geometry.setAttribute("aTime", timeAttr);
  geometry.setAttribute("aCorner", new three.BufferAttribute(cornerOf, 2));
  geometry.setAttribute("aGlow", glowAttr);
  geometry.setIndex(index);
  const uniforms = { now: { value: 0 }, vw: { value: 1 }, vh: { value: 1 }, thick: { value: 1.8 }, tint: { value: new three.Vector3(1, 0.96, 0.86) } };
  const material = new three.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, side: three.DoubleSide });
  const mesh = new three.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  parent.add(mesh);

  const origin = performance.now();
  /** The page's clock, in milliseconds, at which each slot's streak is over (afterglow and all). */
  const over = new Float64Array(METEOR_SLOTS);
  let sky: MeteorSky | null = null;
  let skyAt = -Infinity;
  let peak = 0;
  let perSecond = 0;
  let nextAt = 0;
  let last = 0;
  let told: string | null | undefined;

  /** A random place on the half of the Earth that faces the view. */
  const somewhere = (facing: Vec3): Vec3 => {
    const z = state.random() * 2 - 1;
    const angle = state.random() * 2 * Math.PI;
    const r = Math.sqrt(1 - z * z);
    const p: Vec3 = [r * Math.cos(angle), z, r * Math.sin(angle)];
    return dot(p, facing) < 0 ? [-p[0], -p[1], -p[2]] : p;
  };

  function survey(input: MeteorStep): void {
    sky = meteorSky(input.time);
    skyAt = input.now;
    let sum = 0;
    peak = 0;
    for (let i = 0; i < SAMPLES; i += 1) {
      const p = somewhere(input.facing);
      const weight = hourlyRateAt(sky, p) * darkness(p, input.sun);
      sum += weight;
      if (weight > peak) peak = weight;
    }
    perSecond = streaksPerSecond(sum / SAMPLES);
    const top = sky.showers[0];
    state.drawn.perSecond = perSecond;
    state.drawn.shower = top?.shower.code ?? null;
    state.drawn.zhr = top?.zhr ?? 0;
    if (told !== state.drawn.shower) {
      told = state.drawn.shower;
      state.onShower?.(top?.shower ?? null, top?.zhr ?? 0);
    }
  }

  /** Start one streak in a free slot: where the dark sky and the rate say, travelling the way its shower (or, for a sporadic, chance) says. */
  function spawn(input: MeteorStep): void {
    const slot = over.findIndex((until) => until <= input.now);
    if (slot < 0 || !sky || peak <= 0) return;
    let place: Vec3 | null = null;
    for (let attempt = 0; attempt < 40 && !place; attempt += 1) {
      const p = somewhere(input.facing);
      if (state.random() * peak < hourlyRateAt(sky, p) * darkness(p, input.sun)) place = p;
    }
    if (!place) return;
    // which stream it belongs to, by each one's share of the rate at that place
    let pick = state.random() * hourlyRateAt(sky, place);
    let radiant: Vec3 | null = null;
    let speed = 20 + state.random() * 45;
    for (const entry of sky.showers) {
      const share = entry.zhr * Math.max(0, dot(place, entry.overhead));
      if (pick < share) {
        radiant = entry.overhead;
        speed = entry.shower.speedKmS;
        break;
      }
      pick -= share;
    }
    if (!radiant) {
      // a sporadic: from any compass point, 15 to 80 degrees above the horizon
      const east = unit(cross([0, 1, 0], place));
      const north = cross(place, east);
      const bearing = state.random() * 2 * Math.PI;
      const height = ((15 + state.random() * 65) * Math.PI) / 180;
      const flat = Math.cos(height);
      radiant = [
        place[0] * Math.sin(height) + flat * (east[0] * Math.sin(bearing) + north[0] * Math.cos(bearing)),
        place[1] * Math.sin(height) + flat * (east[1] * Math.sin(bearing) + north[1] * Math.cos(bearing)),
        place[2] * Math.sin(height) + flat * (east[2] * Math.sin(bearing) + north[2] * Math.cos(bearing)),
      ];
    }
    const truth = streakPath(place, radiant, 1);
    // its length as the view sees it: the part of the path that lies across the line of sight
    const along = dot(radiant, input.facing);
    const pixels = (truth.km / EARTH_KM) * Math.sqrt(Math.max(0, 1 - along * along)) * input.radius;
    const path = pixels < MIN_STREAK_PX ? streakPath(place, radiant, Math.min(MAX_STRETCH, MIN_STREAK_PX / Math.max(pixels, 0.001))) : truth;
    const life = Math.min(1.1, Math.max(0.3, truth.km / speed));
    const born = (input.now - origin) / 1000;
    const glow = 0.7 + 0.3 * state.random() ** 2;
    for (let v = 0; v < 4; v += 1) {
      const i = slot * 4 + v;
      starts.set(path.start, i * 3);
      ends.set(path.end, i * 3);
      times[i * 2] = born;
      times[i * 2 + 1] = life;
      glows[i] = glow;
    }
    startAttr.needsUpdate = true;
    endAttr.needsUpdate = true;
    timeAttr.needsUpdate = true;
    glowAttr.needsUpdate = true;
    over[slot] = input.now + life * 1350;
    state.drawn.spawned += 1;
  }

  return {
    step(input) {
      // on an Earth too small on the screen to show a streak there are none
      const running = state.on && state.running() && input.radius >= MIN_EARTH_PX;
      if (!running) {
        // held, hidden or switched off: every streak goes at once and nothing more is asked for, so a paused picture is a still one
        over.fill(0);
        nextAt = 0;
        last = input.now;
        state.drawn.alive = 0;
        state.drawn.perSecond = 0;
        mesh.visible = false;
        return Infinity;
      }
      if (!sky || Math.abs(input.time - sky.ms) > SKY_GAME_MS || input.now - skyAt > SKY_WALL_MS) survey(input);
      if (perSecond > 0) {
        // after a rest the clock starts again from now, so a pause is not made up for with a burst
        if (input.now - last > 1000 || nextAt === 0) nextAt = input.now + (-Math.log(1 - state.random()) / perSecond) * 1000;
        let started = 0;
        while (nextAt <= input.now && started < 4) {
          spawn(input);
          started += 1;
          nextAt += (-Math.log(1 - state.random()) / perSecond) * 1000;
        }
        if (nextAt <= input.now) nextAt = input.now + FRAME_MS;
      } else nextAt = 0;
      last = input.now;
      let alive = 0;
      for (let slot = 0; slot < METEOR_SLOTS; slot += 1) if (over[slot]! > input.now) alive += 1;
      state.drawn.alive = alive;
      mesh.visible = alive > 0;
      uniforms.now.value = (input.now - origin) / 1000;
      uniforms.vw.value = input.width;
      uniforms.vh.value = input.height;
      if (alive > 0) return FRAME_MS;
      // nothing alive: sleep until the next one is due, or, where nothing in view is dark, look again in a while (the Earth turns)
      return perSecond > 0 ? Math.max(FRAME_MS, nextAt - input.now) : SKY_WALL_MS;
    },
    dispose() {
      parent.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
