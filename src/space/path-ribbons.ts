// Orbit lines with a real width and dashes, drawn in ONE call: every path of the page and the chosen satellite's own orbit are the segments of one mesh. WebGL draws a line one pixel wide, so each segment of an orbit
// is a quad that the vertex shader widens on the screen. The buffers are made once, for the most paths there can be, and are only rewritten when a path or a look changes: adding or taking away a path makes and frees nothing.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";
import { MAX_PATHS, type PathStyle } from "./paths.ts";

type Three = ThreeParts;

/** Points on each orbit loop. The same as the chosen orbit has always had. */
export const PATH_POINTS = 120;
/** The paths the mesh can hold: those of the page and the chosen satellite's own. */
export const PATH_SLOTS = MAX_PATHS + 1;

const VERT = /* glsl */ `
uniform vec2 res;
uniform float dashScale;
attribute vec3 other;
attribute vec2 corner;
attribute vec4 ink;
attribute vec4 look;
attribute float span;
attribute float grow;
varying vec3 vWorld;
varying float vGrow;
varying vec4 vInk;
varying float vEdge;
varying float vHalf;
varying float vAlong;
varying vec2 vDash;
void main() {
  mat4 m = projectionMatrix * modelViewMatrix;
  vec4 a = m * vec4(position, 1.0);
  vec4 b = m * vec4(other, 1.0);
  vec3 wa = position;
  vec3 wb = other;
  // a path that grows out of the camera is drawn right up to it (the camera of a ride is a few kilometres from the craft); the others stop 64 km short of it, as they always have
  float near = grow > 0.0 ? 0.00002 : 0.01;
  if (a.w < near && b.w < near) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (a.w < near) {
    float t = (near - a.w) / (b.w - a.w);
    a = mix(a, b, t);
    wa = mix(wa, wb, t);
  } else if (b.w < near) {
    float t = (near - b.w) / (a.w - b.w);
    b = mix(b, a, t);
    wb = mix(wb, wa, t);
  }
  vec2 hres = res * 0.5;
  vec2 sa = a.xy / a.w * hres;
  vec2 sb = b.xy / b.w * hres;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  bool atB = corner.x > 0.5;
  vec4 p = atB ? b : a;
  vec2 s = atB ? sb : sa;
  float reach = look.x * 0.5 + 0.5;
  vec2 at = s + normal * corner.y * reach;
  gl_Position = vec4(at / hres * p.w, p.z, p.w);
  vInk = ink;
  vWorld = atB ? wb : wa;
  vGrow = grow;
  vEdge = corner.y * reach;
  vHalf = look.x * 0.5;
  vAlong = (look.w + (atB ? span : 0.0)) * dashScale;
  vDash = look.yz;
}`;

const FRAG = /* glsl */ `
varying vec3 vWorld;
varying float vGrow;
varying vec4 vInk;
varying float vEdge;
varying float vHalf;
varying float vAlong;
varying vec2 vDash;
void main() {
  float cover = clamp(vHalf + 0.5 - abs(vEdge), 0.0, 1.0);
  if (vDash.x > 0.0) {
    float period = vDash.x + vDash.y;
    float m = mod(vAlong, period);
    float inside = m < vDash.x ? min(m, vDash.x - m) : -min(m - vDash.x, period - m);
    cover *= clamp(inside + 0.5, 0.0, 1.0);
  }
  // a path being ridden grows out of the camera: the distance is the point's own on the chord (the loop is 120 points, some 350 km apart, so a fade taken at the ends alone would not reach nothing at the craft)
  float grown = vGrow > 0.0 ? smoothstep(0.0, vGrow, distance(vWorld, cameraPosition)) : 1.0;
  cover *= grown;
  if (cover <= 0.0) discard;
  gl_FragColor = vec4(vInk.rgb, vInk.a * cover);
  #include <colorspace_fragment>
}`;

/** The distance, in kilometres, over which the orbit of a satellite being ridden grows out of the camera: nothing at the camera, all of its look by this far along the path. */
export const RIDE_PATH_FADE_KM = 300;

/** What one slot is told: the loop's points (3 numbers each, {@link PATH_POINTS} of them) and its look. */
export interface RibbonPath {
  positions: Float32Array;
  style: PathStyle;
  /** Earth radii from the camera over which the path fades in (nothing at the camera, all of its opacity at this distance); 0 or missing draws it at its look everywhere. */
  fade?: number;
}

export interface PathRibbons {
  /** Write the paths into the buffers, none for an empty list. Costs nothing on the GPU until the next draw, and nothing is drawn while there are no paths. */
  set(paths: readonly RibbonPath[]): void;
  /** The size of the picture in CSS pixels and the Earth's radius on it, which a dash is measured against. */
  frame(width: number, height: number, earthPx: number): void;
  /** How many paths are in the buffers. */
  readonly count: number;
  readonly mesh: THREE.Mesh;
  dispose(): void;
}

export function createPathRibbons(three: Three, scene: THREE.Object3D): PathRibbons {
  // The quads face either way (a segment's left and right turn with its direction on the screen), so neither side is culled.
  const verts = PATH_SLOTS * PATH_POINTS * 4;
  const position = new Float32Array(verts * 3);
  const other = new Float32Array(verts * 3);
  const corner = new Float32Array(verts * 2);
  const ink = new Float32Array(verts * 4);
  const look = new Float32Array(verts * 4);
  const span = new Float32Array(verts);
  const grow = new Float32Array(verts);
  const index = new Uint16Array(PATH_SLOTS * PATH_POINTS * 6);
  for (let q = 0; q < PATH_SLOTS * PATH_POINTS; q += 1) {
    const v = q * 4;
    // the quad's corners: start-left, start-right, end-left, end-right
    corner.set([0, -1, 0, 1, 1, -1, 1, 1], v * 2);
    index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
  }
  const geometry = new three.BufferGeometry();
  const attributes = {
    position: new three.BufferAttribute(position, 3),
    other: new three.BufferAttribute(other, 3),
    ink: new three.BufferAttribute(ink, 4),
    look: new three.BufferAttribute(look, 4),
    span: new three.BufferAttribute(span, 1),
    grow: new three.BufferAttribute(grow, 1),
  };
  for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
  geometry.setAttribute("corner", new three.BufferAttribute(corner, 2));
  geometry.setIndex(new three.BufferAttribute(index, 1));
  geometry.setDrawRange(0, 0);
  const material = new three.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { res: { value: [1, 1] }, dashScale: { value: 1 } }, transparent: true, depthWrite: false, side: three.DoubleSide });
  const mesh = new three.Mesh(geometry, material);
  mesh.name = "paths";
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  scene.add(mesh);
  const colour = new three.Color();
  let count = 0;

  return {
    set(paths) {
      count = Math.min(PATH_SLOTS, paths.length);
      for (let p = 0; p < count; p += 1) {
        const { positions, style, fade = 0 } = paths[p]!;
        colour.set(style.color);
        // the arc length at each point, in Earth radii, for the dashes
        let along = 0;
        for (let i = 0; i < PATH_POINTS; i += 1) {
          const j = (i + 1) % PATH_POINTS;
          const ax = positions[i * 3]!;
          const ay = positions[i * 3 + 1]!;
          const az = positions[i * 3 + 2]!;
          const bx = positions[j * 3]!;
          const by = positions[j * 3 + 1]!;
          const bz = positions[j * 3 + 2]!;
          const length = Math.hypot(bx - ax, by - ay, bz - az);
          const q = p * PATH_POINTS + i;
          for (let k = 0; k < 4; k += 1) {
            const v = q * 4 + k;
            position[v * 3] = ax;
            position[v * 3 + 1] = ay;
            position[v * 3 + 2] = az;
            other[v * 3] = bx;
            other[v * 3 + 1] = by;
            other[v * 3 + 2] = bz;
            ink[v * 4] = colour.r;
            ink[v * 4 + 1] = colour.g;
            ink[v * 4 + 2] = colour.b;
            ink[v * 4 + 3] = style.opacity;
            look[v * 4] = style.width;
            look[v * 4 + 1] = style.dash ? style.dash[0] : 0;
            look[v * 4 + 2] = style.dash ? style.dash[1] : 0;
            look[v * 4 + 3] = along;
            span[v] = length;
            grow[v] = fade;
          }
          along += length;
        }
      }
      for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
      geometry.setDrawRange(0, count * PATH_POINTS * 6);
      mesh.visible = count > 0;
    },
    frame(width, height, earthPx) {
      const value = material.uniforms["res"]!.value as number[];
      value[0] = Math.max(1, width);
      value[1] = Math.max(1, height);
      material.uniforms["dashScale"]!.value = Math.max(1, earthPx);
    },
    get count() {
      return count;
    },
    mesh,
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
