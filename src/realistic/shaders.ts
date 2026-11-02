// The three programs of the realistic Earth, as GLSL strings: the surface (day, night, sun glint, rim), the cloud layer and the
// atmosphere's glow. Colours are shaded in the textures' own (sRGB) space: a look, not a radiometric model.

export const SURFACE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const SURFACE_FRAG = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D waterMap;
uniform vec3 sunDir;
uniform float lights;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float ndl = dot(n, sunDir);
  float day = smoothstep(-0.10, 0.22, ndl);
  vec3 albedo = texture2D(dayMap, vUv).rgb;
  float water = texture2D(waterMap, vUv).r;

  vec3 lit = albedo * (0.07 + 1.0 * pow(max(ndl, 0.0), 0.5));
  float dusk = smoothstep(-0.14, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.30, ndl));
  lit += vec3(0.55, 0.28, 0.14) * dusk * 0.30 * (0.35 + 0.65 * albedo.g);

  vec3 h = normalize(sunDir + vec3(0.0, 0.0, 1.0));
  float glint = pow(max(dot(n, h), 0.0), 220.0) * water * day;
  lit += vec3(1.0, 0.93, 0.80) * glint * 0.7;

  vec3 night = texture2D(nightMap, vUv).rgb;
  night = night * night * vec3(1.6, 1.5, 1.3) * lights + night * 0.25;
  vec3 col = mix(night, lit, day);

  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
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
varying vec3 vView;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vView = view.xyz;
  gl_Position = projectionMatrix * view;
}`;

export const ATMOSPHERE_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform float outer;
varying vec3 vView;
void main() {
  float rho = length(vView.xy);
  float t = clamp((rho - 1.0) / (outer - 1.0), 0.0, 1.0);
  vec2 dir = rho > 0.0 ? vView.xy / rho : vec2(1.0, 0.0);
  float side = smoothstep(-0.40, 0.55, dot(vec3(dir, 0.0), sunDir));
  float glow = pow(1.0 - t, 3.0) * (0.10 + 0.90 * side);
  vec3 col = mix(vec3(0.10, 0.22, 0.60), vec3(0.42, 0.68, 1.0), side);
  gl_FragColor = vec4(col, glow * 0.9);
}`;
