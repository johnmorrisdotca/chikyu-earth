// The beam in the space view: a soft cone of light from the chosen satellite to the ground below it, ending in a lit footprint ring on the surface (and, when asked, spot cells inside it). Everything is
// worked out in the vertex shader from a few numbers (the satellite, the point below it, the footprint's angle), so a draw changes uniforms and nothing is rebuilt; the geometry is made once, and again only
// when the cells change. Nothing is drawn here: the scene draws when asked, and the beam is part of that draw. The geometry is hidden behind the Earth by the depth test, which is the limb's clip.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";
import { BEAM_COLOUR, beamCells, footprintAngle, footprintKm, type BeamOptions } from "./geometry.ts";

/** Earth radii: the Earth's radius in kilometres, the unit the scene measures in. */
const EARTH_KM = 6371;
/** The footprint sits this far above the ground (in Earth radii): over the map tiles and the sphere's flat facets, as the grid does. */
const GROUND = 1.0015;
const CONE_SEGMENTS = 72;
const DISC_SEGMENTS = 64;
const DISC_RINGS = 6;

/**
 * What the beam has done: whether it is drawn, the chosen satellite's height, the footprint's radius along the ground in kilometres and its angle at the Earth's centre, the elevation it was worked for,
 * the cells drawn and a cell's radius in kilometres, and how many times its geometry was made.
 *
 * @example
 * ```ts no-run
 * import type { BeamStats } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const none: BeamStats = { shown: false, heightKm: 0, radiusKm: 0, angleDegrees: 0, elevation: 25, cells: 0, cellRadiusKm: 0, builds: 0, failed: false };
 * console.log(none);
 * ```
 */
export interface BeamStats {
  shown: boolean;
  heightKm: number;
  radiusKm: number;
  angleDegrees: number;
  elevation: number;
  cells: number;
  cellRadiusKm: number;
  builds: number;
  failed: boolean;
}

/** What the element and the scene share: the options the attributes give, and what the beam did. */
export interface BeamState extends BeamOptions {
  onError?: (error: unknown) => void;
  stats: BeamStats;
}

export const newBeamState = (): BeamState => ({ on: false, elevation: 25, cells: 0, cellSize: 0, colour: BEAM_COLOUR, strength: 0.6, stats: { shown: false, heightKm: 0, radiusKm: 0, angleDegrees: 0, elevation: 25, cells: 0, cellRadiusKm: 0, builds: 0, failed: false } });

export interface BeamLayer {
  /** Places the beam for this draw: the chosen satellite's place in Earth radii (the scene's axes), or `null` for none. */
  sync(position: readonly [number, number, number] | null): void;
  dispose(): void;
}

// The footprint's flat units (its radius is 1) mapped onto the sphere about the point below the satellite, the angle growing with the distance from the middle: the same map the rings use.
const MAP = /* glsl */ `
vec3 ground(vec2 p) {
  float r = length(p);
  vec2 d = r > 1e-6 ? p / r : vec2(1.0, 0.0);
  float a = r * lambda;
  return (nadir * cos(a) + (e1 * d.x + e2 * d.y) * sin(a)) * ${GROUND.toFixed(4)};
}`;

const CONE_VERT = /* glsl */ `
attribute vec4 cone;
uniform vec3 sat;
uniform vec3 nadir;
uniform vec3 e1;
uniform vec3 e2;
uniform float lambda;
uniform float pitch;
uniform float circle;
varying float vT;
varying float vFace;
varying float vRay;
varying float vDist;
${MAP}
vec3 rim(float phi) { return ground(cone.zw * pitch + circle * vec2(cos(phi), sin(phi))); }
vec3 at(float t, float phi) { return mix(sat, rim(phi), t); }
void main() {
  float t = cone.x;
  float s = clamp(t, 0.05, 1.0);
  vec3 p = at(t, cone.y);
  vec3 dp = at(s, cone.y + 0.01) - at(s, cone.y - 0.01);
  vec3 n = normalize(cross(dp, rim(cone.y) - sat));
  vec3 v = cameraPosition - p;
  vDist = length(v);
  vFace = abs(dot(n, normalize(v)));
  vT = t;
  vRay = cone.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const CONE_FRAG = /* glsl */ `
uniform vec3 colour;
uniform float strength;
uniform float weight;
varying float vT;
varying float vFace;
varying float vRay;
varying float vDist;
void main() {
  float along = 0.06 + 0.94 * pow(1.0 - vT, 1.5);
  float body = 0.18 + 0.82 * pow(vFace, 0.8);
  float shafts = 0.82 + 0.18 * sin(vRay * 36.0);
  float near = smoothstep(0.004, 0.06, vDist);
  float a = strength * weight * along * body * shafts * near;
  gl_FragColor = vec4(colour, a);
}`;

// A circle on the ground, or a ring round one, mapped from the footprint's own flat units onto the sphere.
const DISC_VERT = /* glsl */ `
attribute vec4 disc;
attribute vec2 pol;
uniform vec3 nadir;
uniform vec3 e1;
uniform vec3 e2;
uniform float lambda;
uniform float pitch;
uniform float circle;
varying float vRho;
varying float vKind;
varying float vBand;
${MAP}
void main() {
  vRho = pol.x;
  vKind = disc.w;
  vBand = disc.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(ground(disc.xy * pitch + circle * pol.x * vec2(cos(pol.y), sin(pol.y))), 1.0);
}`;

const DISC_FRAG = /* glsl */ `
uniform vec3 colour;
uniform float strength;
uniform float fillShare;
uniform float ringShare;
varying float vRho;
varying float vKind;
varying float vBand;
void main() {
  float ring = ringShare * sin(3.14159265 * clamp(vBand, 0.0, 1.0));
  float fill = fillShare * (0.55 + 0.45 * vRho);
  float a = strength * (vKind > 0.5 ? ring : fill);
  gl_FragColor = vec4(colour, a);
}`;

/** The cones: for each lattice point, a strip from the apex (t = 0) to the rim (t = 1), every phi round. */
function coneGeometry(three: ThreeParts, lattice: readonly (readonly number[])[], rows: number, segments: number): THREE.BufferGeometry {
  const verts: number[] = [];
  const index: number[] = [];
  for (const point of lattice) {
    const base = verts.length / 4;
    for (let r = 0; r <= rows; r += 1) for (let s = 0; s <= segments; s += 1) verts.push(r / rows, (s / segments) * Math.PI * 2, point[0]!, point[1]!);
    for (let r = 0; r < rows; r += 1) {
      for (let s = 0; s < segments; s += 1) {
        const a = base + r * (segments + 1) + s;
        const b = a + segments + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("cone", new three.BufferAttribute(new Float32Array(verts), 4));
  geometry.setAttribute("position", new three.BufferAttribute(new Float32Array((verts.length / 4) * 3), 3));
  geometry.setIndex(index);
  return geometry;
}

/** Circles for the disc shader: each is a filled disc (kind 0) and a soft ring (kind 1) at the lattice point (x, y). */
function discGeometry(three: ThreeParts, lattice: readonly (readonly number[])[]): THREE.BufferGeometry {
  const disc: number[] = [];
  const pol: number[] = [];
  const index: number[] = [];
  const push = (x: number, y: number, kind: number, rho: number, phi: number, band = 0): number => {
    disc.push(x, y, band, kind);
    pol.push(rho, phi);
    return pol.length / 2 - 1;
  };
  for (const point of lattice) {
    const [x, y] = [point[0]!, point[1]!];
    // the fill: a fan of rings
    const fill = push(x, y, 0, 0, 0);
    const first = pol.length / 2;
    for (let r = 1; r <= DISC_RINGS; r += 1) for (let s = 0; s < DISC_SEGMENTS; s += 1) push(x, y, 0, (r / DISC_RINGS) * 0.985, (s / DISC_SEGMENTS) * Math.PI * 2);
    for (let s = 0; s < DISC_SEGMENTS; s += 1) index.push(fill, first + s, first + ((s + 1) % DISC_SEGMENTS));
    for (let r = 1; r < DISC_RINGS; r += 1) {
      for (let s = 0; s < DISC_SEGMENTS; s += 1) {
        const a = first + (r - 1) * DISC_SEGMENTS + s;
        const b = first + (r - 1) * DISC_SEGMENTS + ((s + 1) % DISC_SEGMENTS);
        index.push(a, a + DISC_SEGMENTS, b, b, a + DISC_SEGMENTS, b + DISC_SEGMENTS);
      }
    }
    // the ring: a band just inside the edge, brightest in the middle of it
    const band = pol.length / 2;
    for (const w of [0, 1]) for (let s = 0; s < DISC_SEGMENTS; s += 1) push(x, y, 1, 0.88 + 0.12 * w, (s / DISC_SEGMENTS) * Math.PI * 2, w);
    for (let s = 0; s < DISC_SEGMENTS; s += 1) {
      const a = band + s;
      const b = band + ((s + 1) % DISC_SEGMENTS);
      index.push(a, a + DISC_SEGMENTS, b, b, a + DISC_SEGMENTS, b + DISC_SEGMENTS);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("disc", new three.BufferAttribute(new Float32Array(disc), 4));
  geometry.setAttribute("pol", new three.BufferAttribute(new Float32Array(pol), 2));
  geometry.setAttribute("position", new three.BufferAttribute(new Float32Array((pol.length / 2) * 3), 3));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Makes the beam in `scene` (the world the satellites are in, not the Earth's turning group: the footprint is worked out for the satellite's place now).
 *
 * @param three - The page's three.js; it must have `AdditiveBlending`.
 * @param scene - The scene the satellites are in.
 * @param state - The model's beam.
 * @param order - The render order: after the satellites' dots.
 * @returns The layer.
 */
export function createBeamLayer(three: ThreeParts, scene: THREE.Object3D, state: BeamState, order: number): BeamLayer {
  if (three.AdditiveBlending === undefined) throw new Error("the three.js handed over has no AdditiveBlending, which the beam needs");
  const blending = three.AdditiveBlending;
  const uniforms = {
    sat: { value: new three.Vector3() },
    nadir: { value: new three.Vector3(0, 1, 0) },
    e1: { value: new three.Vector3(1, 0, 0) },
    e2: { value: new three.Vector3(0, 0, 1) },
    lambda: { value: 0 },
    colour: { value: new three.Color(state.colour) },
    strength: { value: state.strength },
  };
  const common = { transparent: true, depthWrite: false, blending } as const;
  const coneUniforms = { ...uniforms, pitch: { value: 0 }, circle: { value: 1 }, weight: { value: 0.42 } };
  const coneMaterial = new three.ShaderMaterial({ vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, uniforms: coneUniforms, side: three.DoubleSide, ...common });
  const cone = new three.Mesh(coneGeometry(three, [[0, 0]], 10, CONE_SEGMENTS), coneMaterial);
  const shaftUniforms = { ...uniforms, pitch: { value: 0.2 }, circle: { value: 0.1 }, weight: { value: 0.32 } };
  const shaftMaterial = new three.ShaderMaterial({ vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, uniforms: shaftUniforms, side: three.DoubleSide, ...common });
  const footUniforms = { ...uniforms, pitch: { value: 0 }, circle: { value: 1 }, fillShare: { value: 0.1 }, ringShare: { value: 0.95 } };
  const footMaterial = new three.ShaderMaterial({ vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, uniforms: footUniforms, side: three.DoubleSide, ...common });
  const foot = new three.Mesh(discGeometry(three, [[0, 0]]), footMaterial);
  const cellUniforms = { ...uniforms, pitch: { value: 0.2 }, circle: { value: 0.1 }, fillShare: { value: 0.16 }, ringShare: { value: 0.7 } };
  const cellMaterial = new three.ShaderMaterial({ vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, uniforms: cellUniforms, side: three.DoubleSide, ...common });
  let cells: THREE.Mesh | null = null;
  let shafts: THREE.Mesh | null = null;
  let cellKey = "";
  for (const part of [cone, foot]) {
    part.frustumCulled = false;
    part.renderOrder = order;
    part.visible = false;
    scene.add(part);
  }
  const stats = state.stats;
  stats.builds += 1;
  const up = new three.Vector3(0, 1, 0);
  const side = new three.Vector3();
  return {
    sync(position) {
      const height = position ? Math.hypot(position[0], position[1], position[2]) : 0;
      const on = state.on && position !== null && height > 1;
      cone.visible = on;
      foot.visible = on;
      if (cells) cells.visible = on;
      if (shafts) shafts.visible = on;
      stats.shown = on;
      if (!on || !position) {
        stats.heightKm = 0;
        stats.radiusKm = 0;
        stats.angleDegrees = 0;
        stats.cells = 0;
        stats.cellRadiusKm = 0;
        return;
      }
      const heightKm = (height - 1) * EARTH_KM;
      const lambda = footprintAngle(heightKm, state.elevation);
      uniforms.sat.value.set(position[0], position[1], position[2]);
      uniforms.nadir.value.set(position[0] / height, position[1] / height, position[2] / height);
      side.copy(Math.abs(uniforms.nadir.value.y) > 0.99 ? side.set(1, 0, 0) : up).cross(uniforms.nadir.value).normalize();
      uniforms.e1.value.copy(side);
      uniforms.e2.value.copy(uniforms.nadir.value).cross(side);
      uniforms.lambda.value = lambda;
      uniforms.colour.value.set(state.colour);
      uniforms.strength.value = state.strength;
      stats.heightKm = heightKm;
      stats.radiusKm = footprintKm(heightKm, state.elevation);
      stats.angleDegrees = (lambda * 180) / Math.PI;
      stats.elevation = state.elevation;
      // the cells: their geometry is made again only when their number changes; their size follows the footprint
      const wanted = beamCells(state.cells, stats.radiusKm, state.cellSize);
      const key = `${wanted.lattice.length}`;
      if (key !== cellKey) {
        cellKey = key;
        for (const old of [cells, shafts]) {
          if (!old) continue;
          scene.remove(old);
          old.geometry.dispose();
        }
        cells = null;
        shafts = null;
        if (wanted.lattice.length > 0) {
          cells = new three.Mesh(discGeometry(three, wanted.lattice), cellMaterial);
          shafts = new three.Mesh(coneGeometry(three, wanted.lattice, 6, 24), shaftMaterial);
          for (const part of [cells, shafts]) {
            part.frustumCulled = false;
            part.renderOrder = order;
            scene.add(part);
          }
          stats.builds += 1;
        }
      }
      if (cells) cells.visible = true;
      if (shafts) shafts.visible = true;
      shaftUniforms.weight.value = 0.34 / Math.sqrt(Math.max(1, wanted.lattice.length / 7)); // many shafts add up at the satellite: each is dimmer the more there are
      shaftUniforms.pitch.value = wanted.pitch;
      shaftUniforms.circle.value = wanted.radius;
      cellUniforms.pitch.value = wanted.pitch;
      cellUniforms.circle.value = wanted.radius;
      stats.cells = wanted.lattice.length;
      stats.cellRadiusKm = wanted.lattice.length > 0 ? wanted.radius * stats.radiusKm : 0;
    },
    dispose() {
      for (const part of [cone, foot, cells, shafts]) {
        if (!part) continue;
        scene.remove(part);
        part.geometry.dispose();
      }
      coneMaterial.dispose();
      shaftMaterial.dispose();
      footMaterial.dispose();
      cellMaterial.dispose();
      stats.shown = false;
    },
  };
}
