// The places that are not drawn as markers of their own (a crowd of them, and the groups they are gathered into): a ring on the ground for each, all of them one draw call. Each ring keeps its size in
// pixels at any zoom, lies flat on the ground as the picture sees it, fades at the Earth's edge, is left out on the far side and is dimmer at night. three.js is the page's own: this file takes it as an
// argument and never imports it. Nothing is drawn while no ring is shown, and the buffers are made again only when the places or their groups change.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";

/** What the places' layer hands the picture at each draw (see `PlaceLayer.sprites`). */
export interface PlaceSpriteData {
  /** Changes when the groups change: their places and colours are read again. */
  version: number;
  count: number;
  /** Each group's place on the Earth as a unit vector in the Earth's own axes (x, y, z). */
  points: Float32Array;
  /** Each group's colour, as CSS has it. */
  colors: readonly string[];
  /** Changes when `shapes` changes. */
  shapesVersion: number;
  /** For each group, its ring's radius in CSS pixels (0: not drawn here) and how much of the ring is filled (0 to 1, for a group of several places). */
  shapes: Float32Array;
}

/** The rings in one picture: hand them the places' data at each draw. */
export interface PlaceSprites {
  /** Bring the buffers up to date. `ratio` is device pixels to a CSS pixel, `width` and `height` the picture's size in CSS pixels, and `lit` true when the whole Earth is lit (no night to dim). */
  sync(data: PlaceSpriteData | null, ratio: number, width: number, height: number, lit: boolean): void;
  dispose(): void;
}

const VERT = /* glsl */ `
attribute vec3 tint;
attribute vec2 shape;
uniform float ratio;
uniform vec2 viewport;
uniform vec3 sunDir;
uniform float lit;
varying vec3 vTint;
varying float vAlpha;
varying vec2 vAxis;
varying float vSquash;
varying float vRing;
varying float vPx;
varying float vFill;
void main() {
  vec3 normal = normalize(mat3(modelMatrix) * position);
  vec4 world = modelMatrix * vec4(position * 1.002, 1.0);
  bool ortho = projectionMatrix[3][3] == 1.0;
  vec3 toCamera = ortho ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) : normalize(cameraPosition - world.xyz);
  float facing = dot(normal, toCamera);
  if (shape.x <= 0.0 || facing <= 0.02) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 1.0;
    return;
  }
  vec4 clip = projectionMatrix * viewMatrix * world;
  vec4 lifted = projectionMatrix * viewMatrix * vec4(world.xyz + normal * 0.01, 1.0);
  vec2 lean = (lifted.xy / lifted.w - clip.xy / clip.w) * viewport;
  vAxis = length(lean) > 1e-6 ? normalize(vec2(lean.x, -lean.y)) : vec2(0.0, -1.0);
  vSquash = clamp(facing, 0.08, 1.0);
  float extent = shape.x + 3.0;
  gl_PointSize = min(2.0 * extent * ratio, 64.0);
  vRing = shape.x / extent;
  vPx = 1.0 / extent;
  vFill = shape.y;
  float night = lit > 0.5 ? 0.0 : 1.0 - smoothstep(-0.12, 0.05, dot(normal, sunDir));
  vAlpha = min(1.0, (facing - 0.02) / 0.12) * mix(1.0, 0.5, night);
  vTint = tint;
  gl_Position = clip;
}
`;

const FRAG = /* glsl */ `
varying vec3 vTint;
varying float vAlpha;
varying vec2 vAxis;
varying float vSquash;
varying float vRing;
varying float vPx;
varying float vFill;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float along = dot(q, vAxis) / vSquash;
  float across = dot(q, vec2(-vAxis.y, vAxis.x));
  float r = length(vec2(along, across));
  float away = abs(r - vRing) / vPx;
  float stroke = 1.0 - smoothstep(0.5, 1.4, away);
  float glow = exp(-away * away / 5.0) * 0.45;
  float middle = 1.0 - smoothstep(0.2 * vRing - vPx, 0.2 * vRing + vPx, r);
  float inside = (1.0 - smoothstep(vRing - vPx, vRing, r)) * vFill;
  float alpha = max(max(stroke, glow), max(middle * 0.9, inside)) * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(mix(vTint, vec3(1.0), stroke * 0.25 + middle * 0.35), alpha);
}
`;

/**
 * Make the rings for one picture, as a child of the Earth (so they turn with it). Without three.js's `Points` (a subset of three.js that leaves it out) there are none: `null`.
 *
 * @param three - The page's three.js.
 * @param parent - The Earth, or the group that turns it (radius 1).
 * @param sun - The direction to the Sun in the scene's axes, the uniform the Earth's own surface uses.
 * @returns The rings, or null.
 */
export function createPlaceSprites(three: ThreeParts, parent: THREE.Object3D, sun: { value: THREE.Vector3 }): PlaceSprites | null {
  const Points = three.Points;
  if (!Points) return null;
  const material = new three.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ratio: { value: 1 }, viewport: { value: [1, 1] }, sunDir: sun, lit: { value: 0 } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  let points: THREE.Points | null = null;
  let capacity = 0;
  let version = -1;
  let shapesVersion = -1;
  const color = new three.Color();

  const drop = (): void => {
    if (!points) return;
    parent.remove(points);
    points.geometry.dispose();
    points = null;
    capacity = 0;
    version = -1;
    shapesVersion = -1;
  };

  return {
    sync(data, ratio, width, height, lit) {
      if (!data || data.count === 0) {
        drop();
        return;
      }
      if (data.count > capacity) {
        drop();
        capacity = 2 ** Math.ceil(Math.log2(Math.max(64, data.count)));
        const geometry = new three.BufferGeometry();
        geometry.setAttribute("position", new three.BufferAttribute(new Float32Array(capacity * 3), 3));
        geometry.setAttribute("tint", new three.BufferAttribute(new Float32Array(capacity * 3), 3));
        geometry.setAttribute("shape", new three.BufferAttribute(new Float32Array(capacity * 2), 2));
        points = new Points(geometry, material);
        points.frustumCulled = false;
        points.renderOrder = 6;
        parent.add(points);
      }
      const geometry = points!.geometry;
      if (data.version !== version) {
        version = data.version;
        const position = geometry.getAttribute("position") as THREE.BufferAttribute;
        const tint = geometry.getAttribute("tint") as THREE.BufferAttribute;
        (position.array as Float32Array).set(data.points.subarray(0, data.count * 3));
        const tints = tint.array as Float32Array;
        for (let i = 0; i < data.count; i += 1) {
          // the page's colour as CSS shows it: the shader writes it to the screen as it is
          color.set(0xffd27a);
          color.setStyle(data.colors[i] ?? "#ffd27a");
          const hex = color.getHex();
          tints[i * 3] = ((hex >> 16) & 255) / 255;
          tints[i * 3 + 1] = ((hex >> 8) & 255) / 255;
          tints[i * 3 + 2] = (hex & 255) / 255;
        }
        position.needsUpdate = true;
        tint.needsUpdate = true;
        geometry.setDrawRange(0, data.count);
        shapesVersion = -1;
      }
      if (data.shapesVersion !== shapesVersion) {
        shapesVersion = data.shapesVersion;
        const shape = geometry.getAttribute("shape") as THREE.BufferAttribute;
        const shapes = data.shapes.subarray(0, data.count * 2);
        (shape.array as Float32Array).set(shapes);
        shape.needsUpdate = true;
        // every place in sight has a marker of its own: no draw call at all for the rings
        let any = false;
        for (let i = 0; i < shapes.length && !any; i += 2) any = shapes[i]! > 0;
        points!.visible = any;
      }
      const uniforms = material.uniforms;
      uniforms["ratio"]!.value = ratio;
      uniforms["viewport"]!.value = [width / 2, height / 2];
      uniforms["lit"]!.value = lit ? 1 : 0;
    },
    dispose() {
      drop();
      material.dispose();
    },
  };
}
