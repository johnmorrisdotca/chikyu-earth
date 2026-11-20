// The space view's pure parts: where the bodies are (astronomy-engine, an optional peer) and the two scales. They import on a server. The element is
// `@johnmorrisdotca/chikyu-earth/space/element`.
export { AU_IN_EARTH_RADII, blend, createTrack, EARTH_RADIUS_KM, frameAt, orbitPath, PLANETS, type Frame, type PlanetName, type Vec3 } from "./ephemeris.ts";
export { compress, MOON_COMPRESSED, placeAround, placeMoon, placeSun, RADIUS, SUN_COMPRESSED, truePosition, type ScaleMode } from "./scale.ts";
export { fitDistance, plainPainter, type BodyDrawing, type RideTrack, type BodyMoon, type BodyPainter, type BodyView, type PaintContext, type SatellitePainter } from "./scene.ts";
export { faceOffset, OUTSIDE_KM, outsidePose, RIDE_FACES, RIDE_FOV, rideFov, rideGlideMs, ridePose, rideTiltLimits, rideTurnDegrees, type RideDrag, type RideFace, type RideInput, type RideLook, type RidePose, type RideModelSize, type RideViewpoint } from "./ride.ts";
export { GLIDE_FLOOR_KM, satelliteGlide, satelliteGlideKm, type GlidePose, type Quat } from "./ride-glide.ts";
export { earthHides, type SatelliteScreen } from "./satellite-layer.ts";
export { ABOVE_MODEL_KM, ABOVE_MODEL_SHARE, aboveAxes, aboveModelShare, MODEL_FADE_FROM_KM, MODEL_FADE_TO_KM, MODEL_HANDOVER_PX, MODEL_RADIUS_SHARE, modelMatrix, modelRadius, satelliteAxes } from "./satellite-model.ts";
export { localNorth, NORTH_UP_BLEND_DEG, NORTH_UP_POLE_DEG, northUpYaw, screenAngle, type RideUp } from "./north-up.ts";
export { genericSatellite, satelliteKind, type SatelliteKind } from "./generic-satellite.ts";
export { BEAM_ATTRIBUTES, BEAM_COLOUR, BEAM_ELEVATION, beamCells, footprintAngle, footprintKm, readBeam, type BeamCells, type BeamOptions } from "../beam/geometry.ts";
export type { BeamStats } from "../beam/layer.ts";
export { RIDE_PATH_FADE_KM } from "./path-ribbons.ts";
export { createTrailBuilder, TRAIL_DEFAULT_ORBITS, TRAIL_MAX_ORBITS, TRAIL_MAX_POINTS, TRAIL_POINTS_PER_ORBIT, trailOrbits, type PlaceAt, type TrailBuilder } from "./trail.ts";
export { descentFloorKm, FLY_FLOOR_KM, FLY_HEIGHT_KM, FLY_MIN_KM, flyAcrossMs, flyAim, flyAt, flyDistance, flyDownMs, flyLonLat, flyStateAt, flyStill, planFly, type FlyPhase, type FlyPlan, type FlyPoint, type FlyState } from "./fly.ts";
export { COMPASS_OFFSET, COMPASS_PLACE, readCompassOffset, readCompassPlace, type CompassOffset, type CompassPlace } from "./compass.ts";
