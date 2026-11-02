// The satellites' pure parts: orbital elements in, positions out (SGP4 by satellite.js, an optional peer). They import on a server. The space view takes a group with `setSatellites`.
export { createSatellites, type SatellitesOptions } from "./track.ts";
export { DEFAULT_MAX_AGE_DAYS, MAX_SATELLITE_SPEED } from "./limits.ts";
export type { ElementSet, RefusedElementSet, SatelliteInfo, SatelliteRef, Satellites } from "./types.ts";
