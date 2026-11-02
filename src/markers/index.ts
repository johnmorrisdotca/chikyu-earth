// Markers on the globe: `attachMarkers(element)` for `<chikyu-earth>` or `<chikyu-earth-realistic>`. The pure parts (projection, clusters, label placement)
// import on a server.
export { attachMarkers, type Markers, type MarkerOptions, type OverlayElement, type OverlayHost, type OverlayPose } from "./layer.ts";
export { project, projectAll, canvasRatio, type Pose } from "./project.ts";
export { clusterPoints, type Cluster } from "./cluster.ts";
export { placeLabels, type LabelItem, type Placement } from "./labels.ts";
export type { GroupInfo, MarkerEventDetail, MarkerIcon, MarkerInput } from "./types.ts";
