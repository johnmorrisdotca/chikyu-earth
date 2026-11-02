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

export const SURFACE_FRAG = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D waterMap;
uniform vec3 sunDir;
uniform float lights;
uniform float ortho;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 toEye = ortho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - vWorld);
  float ndl = dot(n, sunDir);
  float day = smoothstep(-0.10, 0.22, ndl);
  vec3 albedo = texture2D(dayMap, vUv).rgb;
  float water = texture2D(waterMap, vUv).r;

  vec3 lit = albedo * (0.07 + 1.0 * pow(max(ndl, 0.0), 0.5));
  float dusk = smoothstep(-0.14, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.30, ndl));
  lit += vec3(0.55, 0.28, 0.14) * dusk * 0.30 * (0.35 + 0.65 * albedo.g);

  vec3 h = normalize(sunDir + toEye);
  float glint = pow(max(dot(n, h), 0.0), 220.0) * water * day;
  lit += vec3(1.0, 0.93, 0.80) * glint * 0.7;

  vec3 night = texture2D(nightMap, vUv).rgb;
  night = night * night * vec3(1.6, 1.5, 1.3) * lights + night * 0.25;
  vec3 col = mix(night, lit, day);

  float rim = pow(1.0 - clamp(dot(n, toEye), 0.0, 1.0), 3.0);
  float sunSide = 0.12 + 0.88 * smoothstep(-0.25, 0.5, ndl);
  col += vec3(0.20, 0.45, 1.0) * rim * sunSide * 0.55;
  gl_FragColor = vec4(col, 1.0);
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
  float side = smoothstep(-0.40, 0.55, dot(vec3(dir, 0.0), sunView));
  float glow = pow(1.0 - t, 3.0) * (0.10 + 0.90 * side);
  vec3 col = mix(vec3(0.10, 0.22, 0.60), vec3(0.42, 0.68, 1.0), side);
  gl_FragColor = vec4(col, glow * 0.9);
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
