/** The shapes a marker can be drawn as. */
export type MarkerIcon = "dot" | "ring" | "square" | "diamond";

/** A place on the Earth. Chikyu ships none: the page brings its own. */
export interface MarkerInput {
  /** Your own unique name for it. */
  id: string;
  /** Degrees east and north. */
  lon: number;
  lat: number;
  /** Shown beside the dot when there is room; also its name for a screen reader. */
  label?: string;
  /** What a screen reader says instead of the label (a sentence). */
  description?: string;
  /** Any CSS colour. Default the accent. */
  color?: string;
  icon?: MarkerIcon;
  /** Diameter in CSS pixels, 4 to 32. Default 8. */
  size?: number;
  /** A name for a set of markers (cities, stadiums) that can be shown or hidden together. */
  group?: string;
  /** Higher keeps its label when labels crowd. Default 0. */
  priority?: number;
  /** Yours: given back in every event. */
  data?: unknown;
}

/** What `chikyu-marker-*` events carry. A cluster click has `marker: null` and `cluster` listing the ids in it. */
export interface MarkerEventDetail {
  marker: MarkerInput | null;
  cluster?: string[];
  /** Where the pointer or the marker is, in CSS pixels inside the globe's box. */
  x: number;
  y: number;
}

export interface GroupInfo {
  name: string;
  count: number;
  visible: boolean;
}
