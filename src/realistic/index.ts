// The realistic Earth's pure parts, which import on a server and need neither three.js nor a browser. The element is
// `@johnmorrisdotca/chikyu-earth/realistic/element`.
export { greenwichSidereal, subsolarPoint, unitVector, julianDay } from "./sun.ts";
export { chooseTier, textureBytes, textureCap, MAX_TEXTURE, TIERS, TEXELS_PER_RADIUS_PIXEL, type Layer } from "./tiers.ts";
export { createGate, frameCap, type Gate } from "./gate.ts";
export { lookAt, discRadius, ATMOSPHERE_OUTER, cameraCentre, type CameraMode, type LightMode } from "./earth.ts";
export type { ThreeParts } from "./earth.ts";
export { TEXEL_SLACK, coveringTile, gridTilesInView, parseManifest, pointOnEarth, tileColumns, tileLevel, tileRect, tileRows, tilesInView, type TileCamera, type TileId, type TileLayer, type TilePerspective, type VisibleTile } from "./tiles.ts";
export { TILE_KEEP_MS, TILE_LIMIT } from "./tile-set.ts";
export { BODY_LABEL_ATTRIBUTES, bodyLabelText, readBodyLabel, loadMichroma, setBodyLabelFontUrl, type BodyLabelSettings } from "./body-label.ts";
export { AIR_QUALITY, AIR_THICKNESS_DEFAULT, AIR_THICKNESS_MAX, AIR_TOP, AIR_VERT, airFor, airFrag, airTop, readAirThickness, type AirSamples } from "./air.ts";
export { AIR_NOTE } from "./air-note.ts";
export type { SkyLabelStyle } from "../sky/style.ts";
export type { SkyKeepClear } from "../sky/keep-clear.ts";
export { CITY_NAMES_DEFAULT, CITY_NAMES_MAX, TIER_RADIUS, cityNameText, cityRank, cityTiersFor, layoutCities, nameWidth, readCityNames, type CityFrame, type CityLayoutOptions, type CityName, type CityNameTier, type NamedCity } from "../cities/geometry.ts";
export { CITY_NAMES_ATTRIBUTES, type CityNamesStyle } from "../cities/host.ts";
export { BORDER_ATTRIBUTES, BORDER_REGIONS_RADIUS, codesNear, readBorders, shapeBoxes, sharedEdges, type BorderFeature, type BorderSets, type BorderShapes } from "../borders/lines.ts";
export type { BorderData, BorderStats } from "../borders/layer.ts";
export { EARTH_TILT, GRID_ATTRIBUTES, GRID_FINE_RADIUS, gridLines, readGrid, type GridLines } from "../grid/lines.ts";
export type { GridStats } from "../grid/layer.ts";
export { COUNTRY_LETTER_SPACING, COUNTRY_NAMES_ATTRIBUTES, COUNTRY_NAMES_DEFAULT, COUNTRY_NAMES_MAX, countryNameBox, countryNameText, countrySpots, layoutCountryNames, readCountryNames, type CountryFrame, type CountryLayoutOptions, type CountryName, type CountrySpots, type NamedShape } from "../country-names/geometry.ts";
export { SEA_FEATURES, SEA_RADIUS, layoutSeaNames, readSeaNames, seaNamesFor, type SeaFeature, type SeaName } from "../sea-names/geometry.ts";
export type { CountryNamesStats, CountryNamesStyle } from "../country-names/host.ts";
