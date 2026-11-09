// The passes' pure parts: when a satellite crosses the sky over a place, how it looks, and the sky dome that draws it. They need satellite.js (an optional peer) and import in a browser or on a server.
export {
  compassOf,
  findPasses,
  groundTrack,
  passPath,
  satelliteAt,
  skyAt,
  sunAltitude,
  type Compass,
  type GroundPoint,
  type Observer,
  type PassOptions,
  type PassPoint,
  type PassReason,
  type PassWindow,
  type PathPoint,
  type SatellitePass,
  type SkyName,
  type VisiblePart,
} from "./passes.ts";
export { ESTIMATED_CROSS_SECTIONS, magnitude, standardMagnitude, STANDARD_MAGNITUDES } from "./magnitudes.ts";
export { skySvg, type SkyLabels, type SkyOptions } from "./sky.ts";
