// The grid drawn on the Earth's sphere: one batch of lines that turns with the Earth, under the clouds (their brightest parts cover it), light on the day side and dim on the night side.
// Every 30 degrees while the Earth is small on the screen, every 15 once it is large; the special lines always. Nothing is drawn here: the scene draws when asked.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";
import { GRID_FINE_RADIUS, gridLines } from "./lines.ts";

/** The lines sit this far above the ground (in Earth radii): over the map tiles and the sphere's flat facets, and under the clouds. */
const GRID_RADIUS = 1.0015;

/**
 * What the grid has done: whether it is drawn, whether it shows the lines every 15 degrees (else every 30), how many segments the last draw had, and how many times its lines were made.
 *
 * @example
 * ```ts no-run
 * import type { GridStats } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const none: GridStats = { shown: false, fine: false, segments: 0, builds: 0, failed: false };
 * console.log(none);
 * ```
 */
export interface GridStats {
  shown: boolean;
  fine: boolean;
  segments: number;
  builds: number;
  failed: boolean;
}

/** What the element and the scene share: whether the grid is on, and what it did. */
export interface GridState {
  on: boolean;
  onError?: (error: unknown) => void;
  stats: GridStats;
}

export const newGridState = (): GridState => ({ on: false, stats: { shown: false, fine: false, segments: 0, builds: 0, failed: false } });

export interface GridLayer {
  /** Shows or hides the grid for this draw, finer or coarser by the Earth's radius on the screen (CSS pixels). */
  sync(radius: number): void;
  dispose(): void;
}

const VERT = /* glsl */ `
attribute vec3 tint;
uniform vec3 sunDir;
varying vec3 vTint;
varying float vDay;
void main() {
  vTint = tint;
  vDay = smoothstep(-0.12, 0.18, dot(normalize(mat3(modelMatrix) * position), sunDir));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float opacity;
varying vec3 vTint;
varying float vDay;
void main() {
  gl_FragColor = vec4(vTint * mix(0.55, 1.0, vDay), opacity * mix(0.45, 1.0, vDay));
}`;

/**
 * Makes the grid under `parent` (the group that turns with the Earth).
 *
 * @param three - The page's three.js; it must have `LineSegments`.
 * @param parent - The Earth's own group.
 * @param state - The model's grid.
 * @param sunDir - The direction to the Sun in the world's axes, the uniform the Earth's surface is lit by.
 * @param order - The render order: after the ground, before the clouds.
 * @returns The layer.
 */
export function createGridLayer(three: ThreeParts, parent: THREE.Object3D, state: GridState, sunDir: { value: THREE.Vector3 }, order: number): GridLayer {
  const Lines = three.LineSegments;
  if (!Lines) throw new Error("the three.js handed over has no LineSegments, which the grid needs");
  const grid = gridLines();
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.BufferAttribute(grid.positions, 3));
  geometry.setAttribute("tint", new three.BufferAttribute(grid.colours, 3, true));
  const material = new three.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { sunDir, opacity: { value: 0.6 } }, transparent: true, depthWrite: false });
  const lines = new Lines(geometry, material);
  lines.scale.setScalar(GRID_RADIUS);
  lines.renderOrder = order;
  lines.visible = false;
  parent.add(lines);
  const stats = state.stats;
  stats.builds += 1;
  return {
    sync(radius) {
      const fine = radius >= GRID_FINE_RADIUS;
      const count = fine ? grid.points : grid.coarse;
      geometry.setDrawRange(0, count);
      lines.visible = state.on;
      stats.shown = state.on;
      stats.fine = state.on && fine;
      stats.segments = state.on ? count / 2 : 0;
    },
    dispose() {
      parent.remove(lines);
      geometry.dispose();
      material.dispose();
      stats.shown = false;
      stats.segments = 0;
    },
  };
}
