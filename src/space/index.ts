// The space view's pure parts: where the bodies are (astronomy-engine, an optional peer) and the two scales. They import on a server. The element is
// `@johnmorrisdotca/chikyu-earth/space/element`.
export { AU_IN_EARTH_RADII, blend, createTrack, EARTH_RADIUS_KM, frameAt, orbitPath, PLANETS, type Frame, type PlanetName, type Vec3 } from "./ephemeris.ts";
export { compress, MOON_COMPRESSED, placeAround, placeMoon, placeSun, RADIUS, SUN_COMPRESSED, truePosition, type ScaleMode } from "./scale.ts";
export { fitDistance, plainPainter, type BodyDrawing, type BodyMoon, type BodyPainter, type PaintContext } from "./scene.ts";
export { RIDE_FOV, rideFov, ridePose, rideTiltLimits, rideTurnDegrees, type RideInput, type RideLook, type RidePose } from "./ride.ts";
export type { SatelliteScreen } from "./satellite-layer.ts";
