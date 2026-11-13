// The space view's pure parts: where the bodies are (astronomy-engine, an optional peer) and the two scales. They import on a server. The element is
// `@johnmorrisdotca/chikyu-earth/space/element`.
export { AU_IN_EARTH_RADII, blend, createTrack, EARTH_RADIUS_KM, frameAt, orbitPath, PLANETS, type Frame, type PlanetName, type Vec3 } from "./ephemeris.ts";
export { compress, MOON_COMPRESSED, placeAround, placeMoon, placeSun, RADIUS, SUN_COMPRESSED, truePosition, type ScaleMode } from "./scale.ts";
export { fitDistance, plainPainter, type BodyDrawing, type BodyMoon, type BodyPainter, type BodyView, type PaintContext, type SatellitePainter } from "./scene.ts";
export { faceOffset, OUTSIDE_KM, outsidePose, RIDE_FACES, RIDE_FOV, rideFov, ridePose, rideTiltLimits, rideTurnDegrees, type RideFace, type RideInput, type RideLook, type RidePose, type RideViewpoint } from "./ride.ts";
export type { SatelliteScreen } from "./satellite-layer.ts";
export { aboveAxes, MODEL_RADIUS_SHARE, modelMatrix, modelRadius, satelliteAxes } from "./satellite-model.ts";
export { genericSatellite, satelliteKind, type SatelliteKind } from "./generic-satellite.ts";
