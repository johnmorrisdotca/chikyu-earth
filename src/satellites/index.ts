// The satellites' pure parts: orbital elements in, positions out (SGP4 by satellite.js, an optional peer). They import on a server. The space view takes a group with `setSatellites`.
export { createSatellites, type SatellitesOptions } from "./track.ts";
export { DEFAULT_DIM_AFTER_DAYS, DEFAULT_MAX_AGE_DAYS, MAX_SATELLITE_SPEED } from "./limits.ts";
export type { ElementSet, RefusedElementSet, SatelliteInfo, SatelliteRef, Satellites } from "./types.ts";
export { CATALOGUE, SATELLITE_GROUPS, catalogueEntry, findInCatalogue, type CatalogueEntry, type OrbitKind, type SatelliteGroupInfo } from "./catalogue.ts";
export { ElementSourceError, fetchElements, forgetElements, parseElements, type ElementFormat, type ElementSource, type FetchElementsOptions, type ParsedElements } from "./source.ts";
export { missionElements, missionOf, missionPosition, missions, type HubbleVisit, type Mission, type MissionFile, type MissionPosition, type Orbiter } from "./missions.ts";
