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
 * import type { BeamStats } from "@johnmorrisdotca/chikyu-earth/space";
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
attribute float shaft;
uniform vec3 sat;
uniform vec3 nadir;
uniform vec3 e1;
uniform vec3 e2;
uniform float lambda;
uniform float pitch;
uniform float circle;
uniform float weights;
uniform float cone0;
uniform float thin;
varying float vT;
varying float vFace;
varying float vRay;
varying float vDist;
varying float vWeight;
${MAP}
// the footprint's own cone (shaft 0) or the thin one to a cell (shaft 1)
vec3 rim(float phi) { return shaft > 0.5 ? ground(cone.zw * pitch + circle * thin * vec2(cos(phi), sin(phi))) : ground(vec2(cos(phi), sin(phi))); }
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
  vWeight = shaft > 0.5 ? weights : cone0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const CONE_FRAG = /* glsl */ `
uniform vec3 colour;
uniform float strength;
varying float vT;
varying float vFace;
varying float vRay;
varying float vDist;
varying float vWeight;
void main() {
  // brightest at the satellite, fading towards the ground; soft at the edges (a shaft is thickest through its middle), and a little streaked round
  float along = 0.04 + 0.96 * pow(1.0 - vT, 1.7);
  float body = 0.1 + 0.9 * pow(vFace, 1.4);
  float streaks = 0.88 + 0.12 * sin(vRay * 36.0);
  float near = smoothstep(0.004, 0.06, vDist);
  float a = strength * vWeight * along * body * streaks * near;
  gl_FragColor = vec4(colour, a);
}`;

// The footprint itself (kinds 2 and 3) and the cells (kinds 0 and 1), each a faint fill with a soft inner glow and a thin bright line, mapped from the footprint's flat units onto the sphere.
// The line is drawn in a band either side of the edge and shaped in pixels (from how fast the radius changes across the screen), so it is as thin on a small cell as on the whole footprint.
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
varying float vRing;
varying float vFill;
varying float vShare;
${MAP}
void main() {
  bool foot = disc.w > 1.5;
  vec2 q = vec2(cos(pol.y), sin(pol.y)) * pol.x;
  vec2 p = foot ? q : disc.xy * pitch + circle * q;
  vRho = pol.x;
  vRing = mod(disc.w, 2.0);
  vFill = foot ? 0.05 : 0.04;
  vShare = foot ? 1.0 : 0.8;
  gl_Position = projectionMatrix * viewMatrix * vec4(ground(p), 1.0);
}`;

const DISC_FRAG = /* glsl */ `
uniform vec3 colour;
uniform float strength;
varying float vRho;
varying float vRing;
varying float vFill;
varying float vShare;
void main() {
  float a;
  if (vRing > 0.5) {
    float d = (vRho - 1.0) / max(fwidth(vRho), 1e-5);
    float line = 1.0 - smoothstep(0.35, 1.1, abs(d));
    float glow = d < 0.0 ? 0.34 * exp(d / 7.0) : 0.2 * exp(-d / 4.0);
    a = vShare * min(1.0, line + glow);
  } else {
    a = vFill * (0.25 + 0.75 * pow(clamp(vRho, 0.0, 1.0), 5.0));
  }
  gl_FragColor = vec4(colour, strength * a);
}`;

/** The cones: the footprint's own, then one thin one for each lattice point. Each is a strip from the apex (t = 0) to the rim (t = 1), every phi round. */
function coneGeometry(three: ThreeParts, lattice: readonly (readonly number[])[]): THREE.BufferGeometry {
  const verts: number[] = [];
  const shaft: number[] = [];
  const index: number[] = [];
  const add = (x: number, y: number, thin: number, rows: number, segments: number): void => {
    const base = verts.length / 4;
    for (let r = 0; r <= rows; r += 1) {
      for (let s = 0; s <= segments; s += 1) {
        verts.push(r / rows, (s / segments) * Math.PI * 2, x, y);
        shaft.push(thin);
      }
    }
    for (let r = 0; r < rows; r += 1) {
      for (let s = 0; s < segments; s += 1) {
        const a = base + r * (segments + 1) + s;
        const b = a + segments + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  };
  add(0, 0, 0, 10, CONE_SEGMENTS);
  for (const point of lattice) add(point[0]!, point[1]!, 1, 6, 24);
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("cone", new three.BufferAttribute(new Float32Array(verts), 4));
  geometry.setAttribute("shaft", new three.BufferAttribute(new Float32Array(shaft), 1));
  geometry.setAttribute("position", new three.BufferAttribute(new Float32Array((verts.length / 4) * 3), 3));
  geometry.setIndex(index);
  return geometry;
}

/** The ground: the footprint's disc and ring (kinds 2 and 3), then each cell's (kinds 0 and 1). */
function groundGeometry(three: ThreeParts, lattice: readonly (readonly number[])[]): THREE.BufferGeometry {
  const disc: number[] = [];
  const pol: number[] = [];
  const index: number[] = [];
  const push = (x: number, y: number, kind: number, rho: number, phi: number, band = 0): number => {
    disc.push(x, y, band, kind);
    pol.push(rho, phi);
    return pol.length / 2 - 1;
  };
  const circleAt = (x: number, y: number, fillKind: number): void => {
    const fill = push(x, y, fillKind, 0, 0);
    const first = pol.length / 2;
    for (let r = 1; r <= DISC_RINGS; r += 1) for (let s = 0; s < DISC_SEGMENTS; s += 1) push(x, y, fillKind, (r / DISC_RINGS) * 0.985, (s / DISC_SEGMENTS) * Math.PI * 2);
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
    for (const w of [0, 1]) for (let s = 0; s < DISC_SEGMENTS; s += 1) push(x, y, fillKind + 1, 0.82 + 0.36 * w, (s / DISC_SEGMENTS) * Math.PI * 2, w);
    for (let s = 0; s < DISC_SEGMENTS; s += 1) {
      const a = band + s;
      const b = band + ((s + 1) % DISC_SEGMENTS);
      index.push(a, a + DISC_SEGMENTS, b, b, a + DISC_SEGMENTS, b + DISC_SEGMENTS);
    }
  };
  circleAt(0, 0, 2);
  for (const point of lattice) circleAt(point[0]!, point[1]!, 0);
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
    pitch: { value: 0.2 },
    circle: { value: 0.1 },
    weights: { value: 0.3 },
    cone0: { value: 0.42 },
    thin: { value: 0.5 },
  };
  // forceSinglePass: a double-sided transparent material is drawn twice (back faces, then front); added light does not care about the order, so once is enough and the beam costs half the draw calls.
  // Two draw calls in all: the cones (the footprint's own and the thin one to each cell), and the ground (the footprint's disc and ring and the cells').
  const common = { transparent: true, depthWrite: false, blending, forceSinglePass: true, side: three.DoubleSide, uniforms } as const;
  const coneMaterial = new three.ShaderMaterial({ vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, ...common });
  const groundMaterial = new three.ShaderMaterial({ vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, ...common });
  let cones: THREE.Mesh | null = null;
  let ground: THREE.Mesh | null = null;
  let cellKey = "";
  const make = (lattice: readonly (readonly number[])[]): void => {
    for (const old of [cones, ground]) {
      if (!old) continue;
      scene.remove(old);
      old.geometry.dispose();
    }
    cones = new three.Mesh(coneGeometry(three, lattice), coneMaterial);
    ground = new three.Mesh(groundGeometry(three, lattice), groundMaterial);
    for (const part of [cones, ground]) {
      part.frustumCulled = false;
      part.renderOrder = order;
      part.visible = false;
      scene.add(part);
    }
    state.stats.builds += 1;
  };
  const stats = state.stats;
  const up = new three.Vector3(0, 1, 0);
  const side = new three.Vector3();
  return {
    sync(position) {
      const height = position ? Math.hypot(position[0], position[1], position[2]) : 0;
      const on = state.on && position !== null && height > 1;
      stats.shown = on;
      if (cones) cones.visible = on;
      if (ground) ground.visible = on;
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
      stats.heightKm = heightKm;
      stats.radiusKm = footprintKm(heightKm, state.elevation);
      stats.angleDegrees = (lambda * 180) / Math.PI;
      stats.elevation = state.elevation;
      // the cells: the geometry is made again only when their number changes (and the first time); their size follows the footprint
      const wanted = beamCells(state.cells, stats.radiusKm, state.cellSize);
      const key = `${wanted.lattice.length}`;
      if (!cones || key !== cellKey) {
        cellKey = key;
        make(wanted.lattice);
      }
      cones!.visible = true;
      ground!.visible = true;
      uniforms.sat.value.set(position[0], position[1], position[2]);
      uniforms.nadir.value.set(position[0] / height, position[1] / height, position[2] / height);
      side.copy(Math.abs(uniforms.nadir.value.y) > 0.99 ? side.set(1, 0, 0) : up).cross(uniforms.nadir.value).normalize();
      uniforms.e1.value.copy(side);
      uniforms.e2.value.copy(uniforms.nadir.value).cross(side);
      uniforms.lambda.value = lambda;
      uniforms.colour.value.set(state.colour);
      uniforms.strength.value = state.strength;
      uniforms.pitch.value = wanted.pitch;
      uniforms.circle.value = wanted.radius;
      // the shafts are the beam's body when there are cells (the footprint's own cone is then a faint haze); each is dimmer the more there are, since they add up at the satellite
      uniforms.weights.value = 0.7 / Math.sqrt(Math.max(1, wanted.lattice.length / 7));
      uniforms.cone0.value = wanted.lattice.length > 0 ? 0.12 : 0.42;
      stats.cells = wanted.lattice.length;
      stats.cellRadiusKm = wanted.lattice.length > 0 ? wanted.radius * stats.radiusKm : 0;
    },
    dispose() {
      for (const part of [cones, ground]) {
        if (!part) continue;
        scene.remove(part);
        part.geometry.dispose();
      }
      coneMaterial.dispose();
      groundMaterial.dispose();
      stats.shown = false;
    },
  };
}
