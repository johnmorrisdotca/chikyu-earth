// The realistic Earth's pure parts, which import on a server and need neither three.js nor a browser. The element is
// `@johnmorrisdotca/chikyu-earth/realistic/element`.
export { greenwichSidereal, subsolarPoint, unitVector, julianDay } from "./sun.ts";
export { chooseTier, textureBytes, textureCap, MAX_TEXTURE, TIERS, TEXELS_PER_RADIUS_PIXEL, type Layer } from "./tiers.ts";
export { createGate, frameCap, type Gate } from "./gate.ts";
export { lookAt, discRadius, ATMOSPHERE_OUTER, cameraCentre, type CameraMode, type LightMode } from "./earth.ts";
export type { ThreeParts } from "./earth.ts";
export { TEXEL_SLACK, coveringTile, parseManifest, pointOnEarth, tileColumns, tileLevel, tileRect, tileRows, tilesInView, type TileCamera, type TileId, type TileLayer, type VisibleTile } from "./tiles.ts";
export { TILE_KEEP_MS, TILE_LIMIT } from "./tile-set.ts";
export { BODY_LABEL_ATTRIBUTES, bodyLabelText, readBodyLabel, loadMichroma, setBodyLabelFontUrl, type BodyLabelSettings } from "./body-label.ts";
export { AIR_QUALITY, AIR_THICKNESS_DEFAULT, AIR_THICKNESS_MAX, AIR_TOP, AIR_VERT, airFor, airFrag, airTop, readAirThickness, type AirSamples } from "./air.ts";
export { AIR_NOTE } from "./air-note.ts";
export { CITY_NAMES_DEFAULT, CITY_NAMES_MAX, TIER_RADIUS, cityNameText, cityRank, cityTiersFor, layoutCities, nameWidth, readCityNames, type CityFrame, type CityLayoutOptions, type CityName, type CityNameTier, type NamedCity } from "../cities/geometry.ts";
export { CITY_NAMES_ATTRIBUTES, type CityNamesStyle } from "../cities/host.ts";
