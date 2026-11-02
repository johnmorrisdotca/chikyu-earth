// The space view's pure parts: where the bodies are (astronomy-engine, an optional peer) and the two scales. They import on a server. The element is
// `@johnmorrisdotca/chikyu-earth/space/element`.
export { AU_IN_EARTH_RADII, blend, createTrack, EARTH_RADIUS_KM, frameAt, orbitPath, PLANETS, type Frame, type PlanetName, type Vec3 } from "./ephemeris.ts";
export { compress, MOON_COMPRESSED, placeAround, placeMoon, placeSun, RADIUS, SUN_COMPRESSED, truePosition, type ScaleMode } from "./scale.ts";
export { plainPainter, type BodyDrawing, type BodyPainter } from "./scene.ts";
