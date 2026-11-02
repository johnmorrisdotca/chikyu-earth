// The realistic Earth's pure parts, which import on a server and need neither three.js nor a browser. The element is
// `@johnmorrisdotca/chikyu-earth/realistic/element`.
export { subsolarPoint, unitVector, julianDay } from "./sun.ts";
export { chooseTier, textureBytes, textureCap, MAX_TEXTURE, TIERS, TEXELS_PER_RADIUS_PIXEL, type Layer } from "./tiers.ts";
export { createGate, frameCap, type Gate } from "./gate.ts";
export { lookAt, discRadius, ATMOSPHERE_OUTER } from "./earth.ts";
export type { ThreeParts } from "./earth.ts";
