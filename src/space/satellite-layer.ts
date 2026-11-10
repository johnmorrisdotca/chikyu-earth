// The satellites in the space view: each group is one THREE.Points, which is one draw call however many satellites it holds, its positions written in place by the group's
// own interpolation (SGP4 about once a second, see src/satellites/track.ts). A chosen satellite gets a larger dot and its orbit; a small group (the stations) can show every orbit.
import type * as THREE from "three";
import { MAX_SATELLITE_SPEED } from "../satellites/limits.ts";
import type { SatelliteRef, Satellites } from "../satellites/types.ts";
import type { ThreeParts } from "../realistic/textures.ts";

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
}

/** The part of the space view's model the satellites read and write. */
export interface SatelliteState {
  groups: Map<string, SatelliteGroupState>;
  selected: SatelliteRef | null;
  /** Written at each draw: satellites placed, whether the clock is too fast for the groups, and the milliseconds the last update took. */
  drawn: { placed: number; tooFast: boolean; updateMs: number; maxUpdateMs: number; updates: number; totalMs: number };
}

export const newSatelliteState = (): SatelliteState => ({ groups: new Map(), selected: null, drawn: { placed: 0, tooFast: false, updateMs: 0, maxUpdateMs: 0, updates: 0, totalMs: 0 } });

/** The most orbits a group may draw all at once, one line each. */
export const MAX_ORBIT_GROUP = 40;
const ORBIT_POINTS = 120;
const ORBIT_REFRESH_GAME_MS = 30 * 60_000;
const ORBIT_REFRESH_WALL_MS = 1000;

const POINT_VERT = /* glsl */ `
uniform float size;
attribute float dim;
varying float vDim;
void main() {
  vDim = dim;
  gl_PointSize = size;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const POINT_FRAG = /* glsl */ `
uniform vec3 tint;
uniform float ring;
varying float vDim;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  float a = ring > 0.5 ? smoothstep(0.30, 0.38, d) * (1.0 - smoothstep(0.44, 0.5, d)) : smoothstep(0.5, 0.2, d);
  gl_FragColor = vec4(tint, a * (1.0 - 0.7 * vDim));
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
}

export interface SatelliteLayer {
  /** Place every shown group for `model.time` and the chosen satellite exactly. */
  update(time: number, speed: number): void;
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
  const drawn = new Map<string, Drawn>();
  const tmp = new Float64Array(6);
  const projected = new three.Vector3();
  const world = new three.Vector3();
  const view = new three.Vector3();

  const selectedMaterial = new three.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { size: { value: 14 }, tint: { value: new three.Color("#ffffff") }, ring: { value: 1 } }, transparent: true, depthWrite: false });
  const selectedPosition = new Float32Array(3);
  const selectedGeometry = new three.BufferGeometry();
  selectedGeometry.setAttribute("position", new three.BufferAttribute(selectedPosition, 3));
  selectedGeometry.setAttribute("dim", new three.BufferAttribute(new Float32Array(1), 1));
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
    update(time, speed) {
      const started = performance.now();
      const tooFast = Math.abs(speed) > MAX_SATELLITE_SPEED;
      const step = Math.min(60_000, Math.max(1000, Math.abs(speed) * 1000));
      for (const [name, entry] of drawn) {
        if (state.groups.get(name)?.satellites !== entry.source) {
          drop(entry);
          drawn.delete(name);
        }
      }
      let placed = 0;
      for (const [name, group] of state.groups) {
        let entry = drawn.get(name);
        if (!entry) {
          const positions = new Float32Array(group.satellites.count * 3);
          const geometry = new three.BufferGeometry();
          const attribute = new three.BufferAttribute(positions, 3);
          geometry.setAttribute("position", attribute);
          const dim = new three.BufferAttribute(group.satellites.dimmed, 1);
          geometry.setAttribute("dim", dim);
          const material = new three.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { size: { value: group.size * ratio() }, tint: { value: new three.Color(group.color) }, ring: { value: 0 } }, transparent: true, depthWrite: false });
          const points = new Points(geometry, material);
          points.frustumCulled = false;
          points.renderOrder = 5;
          scene.add(points);
          entry = { source: group.satellites, points, geometry, material, positions, attribute, dim, dimVersion: -1, lines: [], linesAt: Number.NaN, linesWall: 0, style: "" };
          drawn.set(name, entry);
        }
        const style = `${group.color}|${group.size}|${ratio()}`;
        if (style !== entry.style) {
          entry.style = style;
          entry.material.uniforms["size"]!.value = group.size * ratio();
          entry.material.uniforms["tint"]!.value.set(group.color);
        }
        const show = group.visible && !tooFast;
        entry.points.visible = show;
        if (!show) {
          for (const line of entry.lines) line.loop.visible = false;
          continue;
        }
        group.satellites.setStep(step);
        group.satellites.at(time, entry.positions);
        entry.attribute.needsUpdate = true;
        if (entry.dimVersion !== group.satellites.dimVersion) {
          entry.dimVersion = group.satellites.dimVersion;
          entry.dim.needsUpdate = true;
        }
        placed += group.satellites.placed;
        orbitsOf(entry, group, time, started);
      }

      const chosen = state.selected;
      const set = chosen ? find(chosen) : undefined;
      if (chosen && set && set.exact(chosen.index, time, tmp)) {
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
      state.drawn.tooFast = tooFast;
      state.drawn.updateMs = performance.now() - started;
      if (state.drawn.updateMs > state.drawn.maxUpdateMs) state.drawn.maxUpdateMs = state.drawn.updateMs;
      state.drawn.updates += 1;
      state.drawn.totalMs += state.drawn.updateMs;
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
