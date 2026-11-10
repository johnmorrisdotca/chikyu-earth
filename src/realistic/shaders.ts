// The three programs of the realistic Earth, as GLSL strings: the surface (day, night, sun glint, rim), the cloud layer and the
// atmosphere's glow. Colours are shaded in the textures' own (sRGB) space: a look, not a radiometric model.

export const SURFACE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * position);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * The surface program. `tile` is the program of a map tile laid over the whole-Earth pictures: the day picture is read at the tile's own coordinates, the rest at the whole Earth's.
 *
 * What it shades, in the textures' own (sRGB) space (a look, not a radiometric model):
 * - the Sun's light reddens towards the terminator and the twilight has a warm band on the lit side and a blue hour beyond it;
 * - the ocean is deeper, with a hard glint under the Sun, a broad sheen round it, and the sky reflected at grazing angles; clouds hide the glint;
 * - the clouds throw a shadow on the ground, displaced away from the Sun and longer as it gets low;
 * - the night side has the city lights warm and softly spread, dimmed where cloud covers them;
 * - the air shows as a rim on the limb, blue by day and orange along the terminator.
 */
const surfaceFrag = (tile: boolean): string => /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D waterMap;
uniform sampler2D cloudMap;
uniform vec3 sunDir;
uniform vec3 sunLocal;
uniform float cloudShift;
uniform float lights;
uniform float boost;
uniform float ortho;
${tile ? "uniform vec4 nightRect;\nvarying vec2 vUvG;" : ""}
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
const float PI = 3.14159265358979;
void main() {
  vec3 n = normalize(vNormal);
  vec3 toEye = ortho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - vWorld);
  float ndl = dot(n, sunDir);
  float ndv = clamp(dot(n, toEye), 0.0, 1.0);
  float day = smoothstep(-0.10, 0.22, ndl);
  vec2 g = ${tile ? "vUvG" : "vUv"};
  vec3 albedo = texture2D(dayMap, vUv).rgb;
  float water = texture2D(waterMap, g).r;
  albedo *= mix(vec3(1.0), vec3(0.80, 0.91, 1.07), water);

  // the cloud over this point, and the cloud whose shadow falls on it (found by going back along the Sun's ground track)
  float lat = (0.5 - g.y) * PI;
  float lon = (g.x - 0.5) * 2.0 * PI;
  vec3 east = vec3(cos(lon), 0.0, -sin(lon));
  vec3 north = vec3(-sin(lat) * sin(lon), cos(lat), -sin(lat) * cos(lon));
  vec2 away = -vec2(dot(sunLocal, east), dot(sunLocal, north)) / max(ndl, 0.2);
  vec2 cu = vec2(g.x + cloudShift, g.y);
  vec2 shadowAt = cu + vec2(away.x * 0.012 / (2.0 * PI * max(cos(lat), 0.15)), -away.y * 0.012 / PI);
  float cover = smoothstep(0.28, 0.88, texture2D(cloudMap, cu).r);
  float shadow = smoothstep(0.28, 0.88, texture2D(cloudMap, shadowAt).r);

  vec3 sunColour = mix(vec3(1.0, 0.62, 0.38), vec3(1.0, 0.97, 0.91), smoothstep(0.0, 0.22, ndl));
  vec3 lit = albedo * sunColour * (0.07 + 1.0 * pow(max(ndl, 0.0), 0.5));
  lit *= 1.0 - 0.5 * shadow * smoothstep(0.02, 0.3, ndl);
  float dusk = smoothstep(-0.14, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.30, ndl));
  lit += vec3(0.55, 0.28, 0.14) * dusk * 0.30 * (0.35 + 0.65 * albedo.g);

  // the ocean: a hard glint, a broad sheen round it, the sky at grazing angles
  vec3 h = normalize(sunDir + toEye);
  float nh = max(dot(n, h), 0.0);
  float open = water * (1.0 - 0.9 * cover) * day;
  float spec = pow(nh, 500.0) * 1.5 + pow(nh, 60.0) * 0.2;
  lit += vec3(1.0, 0.93, 0.80) * spec * open;
  lit += vec3(0.28, 0.50, 0.95) * pow(1.0 - ndv, 4.0) * 0.5 * open;

  vec2 nuv = ${tile ? "(vUvG - nightRect.xy) / nightRect.zw" : "vUv"};
  vec3 lamp = texture2D(nightMap, nuv).rgb;
  ${tile ? "vec3 spread = lamp;" : "vec3 spread = (texture2D(nightMap, nuv + vec2(0.0007, 0.0)).rgb + texture2D(nightMap, nuv - vec2(0.0007, 0.0)).rgb + texture2D(nightMap, nuv + vec2(0.0, 0.0014)).rgb + texture2D(nightMap, nuv - vec2(0.0, 0.0014)).rgb) * 0.25;"}
  vec3 lamps = (lamp * lamp * vec3(1.6, 1.4, 1.1) + spread * vec3(0.55, 0.40, 0.22)) * lights * (1.0 - 0.7 * cover);
  vec3 night = lamps + lamp * 0.25;
  // the blue hour just beyond the terminator
  night += vec3(0.04, 0.08, 0.20) * smoothstep(-0.22, -0.04, ndl) * (1.0 - smoothstep(-0.04, 0.08, ndl)) * 0.45;
  vec3 col = mix(night, lit, day);
  col += pow(albedo, vec3(0.75)) * boost * 0.65 * (1.0 - day);

  float rim = pow(1.0 - ndv, 3.0);
  float sunSide = 0.12 + 0.88 * smoothstep(-0.25, 0.5, ndl);
  vec3 rimColour = mix(vec3(0.20, 0.45, 1.0), vec3(1.0, 0.45, 0.18), 0.8 * (1.0 - smoothstep(0.0, 0.30, abs(ndl))));
  col += rimColour * rim * sunSide * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;

export const SURFACE_FRAG = surfaceFrag(false);

/** The same surface for a map tile: the tile's own program. */
export const TILE_FRAG = surfaceFrag(true);

/**
 * A map tile's corners: one 0 to 1 grid for every tile, put on the sphere here from the tile's longitude and latitude range (`rect`: west, north, east, south, in radians) at `radius`.
 * `vUvG` is where the point is on the whole-Earth pictures.
 */
export const TILE_VERT = /* glsl */ `
uniform vec4 rect;
uniform float radius;
varying vec2 vUv;
varying vec2 vUvG;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  float lon = mix(rect.x, rect.z, uv.x);
  float lat = mix(rect.y, rect.w, uv.y);
  vec3 unit = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  vUvG = vec2((lon + 3.14159265358979) / 6.28318530717959, 0.5 - lat / 3.14159265358979);
  vNormal = normalize(mat3(modelMatrix) * unit);
  vec4 world = modelMatrix * vec4(unit * radius, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const CLOUD_FRAG = /* glsl */ `
uniform sampler2D cloudMap;
uniform vec3 sunDir;
uniform float shift;
uniform float opacity;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float ndl = dot(n, sunDir);
  float c = texture2D(cloudMap, vec2(vUv.x + shift, vUv.y)).r;
  float a = smoothstep(0.28, 0.88, c) * opacity;
  float day = smoothstep(-0.10, 0.25, ndl);
  vec3 col = mix(vec3(0.015, 0.02, 0.04), vec3(1.0), day * (0.18 + 0.82 * pow(max(ndl, 0.0), 0.45)));
  col += vec3(0.55, 0.28, 0.14) * smoothstep(-0.14, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.25, ndl)) * 0.35;
  gl_FragColor = vec4(col, a);
}`;

export const ATMOSPHERE_VERT = /* glsl */ `
varying vec3 vPosView;
varying vec3 vNormalView;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vPosView = view.xyz;
  vNormalView = normalize(normalMatrix * position);
  gl_Position = projectionMatrix * view;
}`;

export const ATMOSPHERE_FRAG = /* glsl */ `
uniform vec3 sunView;
uniform float outer;
uniform float ortho;
varying vec3 vPosView;
varying vec3 vNormalView;
void main() {
  vec3 n = normalize(vNormalView);
  vec3 v = ortho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-vPosView);
  float nz = clamp(dot(n, v), -1.0, 1.0);
  float rho = outer * sqrt(max(0.0, 1.0 - nz * nz));
  float t = clamp((rho - 1.0) / (outer - 1.0), 0.0, 1.0);
  vec2 dir = normalize(n.xy + vec2(1e-5, 0.0));
  // the Sun's light at this point of the limb: 1 where the Sun stands behind it, 0 at the terminator, -1 on the night side
  float toward = dot(vec3(dir, 0.0), sunView);
  float side = smoothstep(-0.45, 0.45, toward);
  // a thin bright layer on the limb and a wide faint halo, both fading to nothing at the outer edge
  float limb = pow(1.0 - t, 5.0);
  float halo = pow(1.0 - t, 2.2);
  float glow = (limb * 0.85 + halo * 0.35) * (0.06 + 0.94 * side);
  vec3 day = mix(vec3(0.30, 0.52, 0.95), vec3(0.50, 0.74, 1.0), limb);
  vec3 dusk = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.62, 0.30), limb);
  float band = exp(-pow(toward / 0.32, 2.0));
  vec3 col = mix(mix(vec3(0.06, 0.12, 0.35), day, side), dusk, band * 0.85);
  gl_FragColor = vec4(col, clamp(glow, 0.0, 1.0) * (1.0 - t));
}`;

/** The Moon and other plain bodies: a picture (or a flat colour) lit by the Sun, with a trace of light on the dark side. */
export const BODY_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 tint;
uniform float textured;
uniform float ambient;
uniform vec3 sunDir;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float ndl = dot(n, sunDir);
  vec3 albedo = textured > 0.5 ? texture2D(map, vUv).rgb : tint;
  float lit = smoothstep(-0.04, 0.12, ndl) * (0.10 + 0.95 * pow(max(ndl, 0.0), 0.6));
  gl_FragColor = vec4(albedo * (ambient + lit), 1.0);
}`;

/** A flat quad facing the camera: the Sun's disc and its glow. */
export const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const GLOW_FRAG = /* glsl */ `
uniform vec3 tint;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.10, 0.14, r);
  float halo = pow(max(0.0, 1.0 - r), 2.5);
  vec3 col = mix(tint, vec3(1.0), core);
  gl_FragColor = vec4(col, clamp(core + halo * 0.85, 0.0, 1.0));
}`;
