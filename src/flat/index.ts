// The flat map's pure parts and the element's types (`@johnmorrisdotca/chikyu-earth/flat`): the facts of a group of satellites, the orbital planes, the map's geometry, the colours and words. They import on a server and need no dependency, not even satellite.js.
// The element itself is in `@johnmorrisdotca/chikyu-earth/flat/define`, which registers `<chikyu-flat>`.
export { clusterPlanes, groupFacts, planeLetter, type FlatElements, type GroupFacts, type Plane, type PlaneClusters, type PlaneOptions } from "./facts.ts";
export { FLATTENED, MAX_ZOOM, clampView, groundPoint, pixelsPerDegree, projectFlat, unprojectFlat, wrapLongitude, zoomAbout, type FlatView } from "./geometry.ts";
export { COMPASS_POINTS, SHADOW_RADIUS_KM, compassPoint, inEarthShadow, shadowFlags, sunDirection, sunDirectionScene, trackStateOf, trackStateOfScene, type CompassPoint, type GroundTrackState } from "./track-state.ts";
export { GROUP_COLOURS, PLANE_COLOURS, SPARE_COLOUR, TRACK_SHADOW, TRACK_SUNLIT } from "./colours.ts";
export { FLAT_WORDS, type FlatLang } from "./words.ts";
export { MASK_COLS, MASK_ROWS, nightWeights, photoPieces, photoWidth, readLook, type FlatLook, type PhotoPiece } from "./photo.ts";
export type { ChikyuFlat, FlatPick, FlatPlane, GroupStyle } from "./element.ts";
