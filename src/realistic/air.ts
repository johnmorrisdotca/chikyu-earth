// The air round the Earth: light scattered once on its way through a shell 100 km thick, worked out for each pixel in the fragment shader and added to what is behind it.
// Both elements that draw the Earth (the realistic one and the space view) use this one program; it knows nothing of either, only the Earth at the origin with a radius of 1.

/**
 * The air's own top, in Earth radii: 100 km of the Earth's 6,371. The element leaves `ATMOSPHERE_OUTER` of room for it, so it is never cut at the box's edge.
 *
 * @example
 * ```ts
 * import { AIR_TOP } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(((AIR_TOP - 1) * 6371).toFixed(0), "km thick");
 * ```
 */
export const AIR_TOP = 1 + 100 / 6371;

/**
 * How many times its real thickness the air is drawn when a page says nothing: 3. The air is a shell 100 km thick on a globe 12,742 km across, a hair's breadth, and at whole-Earth zoom it comes to a line a pixel or two wide (on a phone, thinner still);
 * three times is a ring the eye can find, with the same physics and the same colours. `1` is the true thickness. The page's `air-thickness` attribute chooses.
 *
 * @example
 * ```ts
 * import { AIR_THICKNESS_DEFAULT } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(AIR_THICKNESS_DEFAULT);
 * ```
 */
export const AIR_THICKNESS_DEFAULT = 3;

/**
 * The most the air may be thickened: 5, which is as far as the element's box leaves room for (its top is then 1.0785 Earth radii out, inside the 1.08 the box is fitted to).
 *
 * @example
 * ```ts
 * import { AIR_THICKNESS_MAX } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(AIR_THICKNESS_MAX);
 * ```
 */
export const AIR_THICKNESS_MAX = 5;

/**
 * What a page's `air-thickness` attribute means: a number from 1 (the true thickness) to 5, given as it is written; with none, or something that is not a number, `AIR_THICKNESS_DEFAULT`. A number outside the range is brought to its nearest end.
 *
 * @param given - The attribute's value, or `null` when the page has none.
 * @returns How many times its real thickness the air is drawn, between 1 and 5.
 *
 * @example
 * ```ts
 * import { readAirThickness } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(readAirThickness(null), readAirThickness("1"), readAirThickness("9"));
 * ```
 */
export function readAirThickness(given: string | null): number {
  if (given === null || given.trim() === "") return AIR_THICKNESS_DEFAULT;
  const value = Number(given);
  if (!Number.isFinite(value)) return AIR_THICKNESS_DEFAULT;
  return Math.min(AIR_THICKNESS_MAX, Math.max(1, value));
}

/**
 * Where the air's top is, in Earth radii, when it is drawn `thickness` times its real thickness: 1 plus 100 km times that, over the Earth's 6,371.
 *
 * @param thickness - 1 for the true thickness (the top is then `AIR_TOP`).
 * @returns The radius of the shell's outside, in Earth radii.
 *
 * @example
 * ```ts
 * import { airTop } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(airTop(3).toFixed(4));
 * ```
 */
export const airTop = (thickness: number): number => 1 + (thickness * 100) / 6371;

/**
 * How many samples the air takes: along the ray toward the camera and, at each of those, along the ray toward the Sun.
 *
 * @example
 * ```ts
 * import { AIR_QUALITY, type AirSamples } from "@johnmorrisdotca/chikyu-earth/realistic";
 * const light: AirSamples = AIR_QUALITY.light;
 * console.log(light.view, light.light);
 * ```
 */
export interface AirSamples {
  view: number;
  light: number;
}

/**
 * The two costs of the air. `full` takes 12 samples along the ray toward the camera and 4 toward the Sun at each; `light` (a small or slow device) takes 6 and 2.
 * Both put their samples where the air is thick (close to the ground, or at the nearest point of a ray that skims it), not evenly, so even the light one has no bands.
 *
 * @example
 * ```ts
 * import { AIR_QUALITY } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(AIR_QUALITY.full);
 * ```
 */
export const AIR_QUALITY: Record<"full" | "light", AirSamples> = {
  full: { view: 12, light: 4 },
  light: { view: 6, light: 2 },
};

/**
 * How much the air costs for a page: what its `air` attribute says (`full` or `light`), else `light` on a small or slow device (4 cores or fewer, 4 GB of memory or less, or a touch screen with no mouse) and `full` on the rest.
 *
 * @param given - The page's `air` attribute, or `null` when it has none.
 * @returns `full` or `light`.
 *
 * @example
 * ```ts
 * import { airFor } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(airFor("light"));
 * ```
 */
export function airFor(given: string | null): "full" | "light" {
  if (given === "full" || given === "light") return given;
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number });
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (hover: none)").matches;
  return coarse || (nav?.hardwareConcurrency ?? 8) <= 4 || (nav?.deviceMemory ?? 8) <= 4 ? "light" : "full";
}

/**
 * The air's program: where the shell is, in the world's own axes (the Earth sits at the origin and does not turn here, the view turns round it).
 *
 * @example
 * ```ts
 * import { AIR_VERT } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(AIR_VERT.includes("vWorld"));
 * ```
 */
export const AIR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

/**
 * The air as light scattered once, worked out for each pixel: a ray from the camera through the shell, sampled `view` times, each sample looking `light` times toward the Sun.
 * Rayleigh scattering (the air's own molecules: thicker the longer the path, and bluer) and Mie scattering (haze and dust: a bright halo round the Sun's direction), with the
 * scale heights and coefficients of the standard sea-level air (Rayleigh 8 km, Mie 1.2 km; the Mie coefficient is that of very clear air, 0.4 of the usual, so the haze stays blue). What the sums give, and nothing drawn: the blue haze thickening toward the limb on the day side,
 * the glow toward the Sun, the reddening along the day and night line (the Sun's light has crossed a long, low path) and the thin lit ring seen from the night side looking toward the Sun.
 * The surface under it is dimmed by what the air takes out of the light (the shader's alpha is what gets through) and what it adds is the colour.
 * Our own code, from the published single-scattering model (Nishita and others, 1993; O'Neil, GPU Gems 2, chapter 16), no code taken from any project.
 * The air can be drawn thicker than it is (`thick`, a uniform: 1 is the true 100 km, 3 the default of the elements): the shell and both scale heights grow by it and what each unit of length holds shrinks by it, so the same air gives the same colours over a wider glow.
 * The Sun is in the world's axes (`sunDir`, toward the Sun); `ortho` is 1 when the camera looks down the z axis from far away (the realistic Earth) and 0 for a camera at a place (the space view).
 *
 * @param samples - How many samples to take (`AIR_QUALITY.full` or `AIR_QUALITY.light`).
 * @returns The fragment program's source, for a `ShaderMaterial`.
 *
 * @example
 * ```ts
 * import { airFrag, AIR_QUALITY } from "@johnmorrisdotca/chikyu-earth/realistic";
 * console.log(airFrag(AIR_QUALITY.light).includes("N_VIEW 6"));
 * ```
 */
export const airFrag = (samples: AirSamples): string => /* glsl */ `
#define N_VIEW ${samples.view}
#define N_LIGHT ${samples.light}
uniform vec3 sunDir;
uniform float ortho;
uniform float thick;
varying vec3 vWorld;
const float TOP1 = ${AIR_TOP.toFixed(6)};
const float HR1 = 0.001256;
const float HM1 = 0.000188;
// drawn thick times its real thickness: the shell and both scale heights are that many times larger
#define TOP (1.0 + (TOP1 - 1.0) * thick)
#define HR (HR1 * thick)
#define HM (HM1 * thick)
// the same amount of air, spread over the taller shell: each unit of length holds that much less of it, so the air looks straight down through is as thin a veil as ever, and only the glow at the limb is wider
#define DENS (1.0 / thick)
const vec3 BETA_R = vec3(36.95, 86.0, 210.9);
const float BETA_M = 53.5;
const float G = 0.76;
const float PI = 3.14159265358979;
const float SUN = 110.0;
// the nearest and the farthest point where a ray from o along d meets a sphere of radius r about the Earth's centre (-1 for both when it misses)
vec2 hit(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float h = b * b - (dot(o, o) - r * r);
  if (h < 0.0) return vec2(-1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
// Sample i of n along a ray of length tEnd whose air is thickest at tDense: half of them each side of it, close together near it and wide apart away from it. Gives where it is (t) and the length of ray it stands for (dt).
void place(int i, int n, float tDense, float tEnd, out float t, out float dt) {
  float near = tDense;
  float far = max(tEnd - tDense, 0.0);
  float nNear = near < 1e-6 ? 0.0 : (far < 1e-6 ? float(n) : floor(float(n) * 0.5));
  float fi = float(i);
  if (fi < nNear) {
    float w = 1.0 - (fi + 0.5) / nNear;
    t = near * (1.0 - w * w);
    dt = 2.0 * near * w / nNear;
  } else {
    float cnt = float(n) - nNear;
    float v = (fi - nNear + 0.5) / cnt;
    t = tDense + far * v * v;
    dt = 2.0 * far * v / cnt;
  }
}
// the air's thickness (Rayleigh, Mie) from p along dir to the top of the shell
vec2 column(vec3 p, vec3 dir) {
  float tEnd = hit(p, dir, TOP).y;
  float tDense = clamp(-dot(p, dir), 0.0, tEnd);
  vec2 sum = vec2(0.0);
  for (int j = 0; j < N_LIGHT; j++) {
    float t;
    float dt;
    place(j, N_LIGHT, tDense, tEnd, t, dt);
    float height = max(length(p + dir * t) - 1.0, 0.0);
    sum += vec2(exp(-height / HR), exp(-height / HM)) * dt;
  }
  return sum;
}
void main() {
  vec3 o = vWorld;
  vec3 d = ortho > 0.5 ? vec3(0.0, 0.0, -1.0) : normalize(vWorld - cameraPosition);
  float b = dot(o, d);
  // the ray ends where it meets the ground, or leaves the shell; the air is thickest at the ground, or at the nearest point of a ray that skims it
  vec2 ground = hit(o, d, 1.0);
  bool onGround = ground.x > 0.0;
  float tEnd = onGround ? ground.x : hit(o, d, TOP).y;
  float tDense = onGround ? ground.x : clamp(-b, 0.0, tEnd);
  float mu = dot(d, sunDir);
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - G * G) * (1.0 + mu * mu)) / ((2.0 + G * G) * pow(1.0 + G * G - 2.0 * G * mu, 1.5));
  // most of the disc is a short, steep path through the air: half the samples do for it, and only the limb takes them all
  int used = onGround && tEnd < 0.08 ? N_VIEW / 2 : N_VIEW;
  vec2 depth = vec2(0.0);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  for (int i = 0; i < N_VIEW; i++) {
    if (i >= used) break;
    float t;
    float dt;
    place(i, used, tDense, tEnd, t, dt);
    vec3 p = o + d * t;
    float height = max(length(p) - 1.0, 0.0);
    vec2 here = vec2(exp(-height / HR), exp(-height / HM)) * dt;
    float shade = 1.0;
    // behind the Earth's edge the Sun's light does not reach; the edge is soft by a few kilometres, as the lowest air makes it
    float ahead = dot(p, sunDir);
    if (ahead < 0.0) shade = smoothstep(1.0 - 0.003, 1.0 + 0.003, sqrt(max(dot(p, p) - ahead * ahead, 0.0)));
    vec2 sun = shade > 0.0 ? column(p, sunDir) : vec2(0.0);
    vec2 path = depth + 0.5 * here;
    vec3 gone = exp(-DENS * (BETA_R * (path.x + sun.x) + BETA_M * 1.1 * (path.y + sun.y)));
    sumR += gone * here.x * shade;
    sumM += gone * here.y * shade;
    depth += here;
  }
  vec3 colour = SUN * DENS * (sumR * BETA_R * phaseR + sumM * BETA_M * phaseM);
  vec3 through = exp(-DENS * (BETA_R * depth.x + BETA_M * 1.1 * depth.y));
  // the colour is premultiplied: what is added, and how much of what is behind it gets through
  // a steep look at the ground through the air has only a thin veil over it; the haze gathers toward the limb, where the path through the air is long
  colour *= onGround ? 0.1 + 0.9 * smoothstep(0.02, 0.16, tEnd) : 1.0;
  // brightness is squeezed to what a screen shows by its strongest channel, so a thick, bright path stays blue instead of going grey; the curve keeps thin air quiet
  float peak = max(max(colour.r, colour.g), colour.b);
  vec3 shown = colour * pow(1.0 - exp(-peak), 2.0) / max(peak, 1e-6);
  gl_FragColor = vec4(shown, 1.0 - through.g);
}`;
