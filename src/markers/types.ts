/**
 * The shapes a marker can be drawn as: `dot`, `ring`, `square` or `diamond`.
 *
 * @example
 * ```ts
 * import type { MarkerIcon, MarkerInput } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const icon: MarkerIcon = "diamond";
 * const stadium: MarkerInput = { id: "camp-nou", lon: 2.12, lat: 41.38, icon, group: "Stadiums" };
 * console.log(stadium.icon);
 * ```
 */
export type MarkerIcon = "dot" | "ring" | "square" | "diamond";

/**
 * A place on the Earth. Chikyu ships none: the page brings its own.
 *
 * @example
 * ```ts
 * import type { MarkerInput } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const tokyo: MarkerInput = { id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo", group: "Cities", priority: 5, data: { population: 14_000_000 } };
 * console.log(tokyo.label);
 * ```
 */
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

/**
 * What the `chikyu-marker-hover`, `chikyu-marker-click` and `chikyu-marker-focus` events carry in `event.detail`. A cluster click has `marker: null` and `cluster` listing the ids in it.
 *
 * @example
 * ```ts
 * import type { MarkerEventDetail } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const on = (event: Event): void => {
 *   const detail = (event as CustomEvent<MarkerEventDetail>).detail;
 *   console.log(detail.marker?.label ?? `${detail.cluster?.length} places`, detail.x, detail.y);
 * };
 * console.log(typeof on);
 * ```
 */
export interface MarkerEventDetail {
  marker: MarkerInput | null;
  cluster?: string[];
  /** Where the pointer or the marker is, in CSS pixels inside the globe's box. */
  x: number;
  y: number;
}

/**
 * One group of markers: its name, how many it holds and whether it is shown.
 *
 * @example
 * ```ts
 * import type { GroupInfo } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const show = (groups: GroupInfo[]): string => groups.map((group) => `${group.name}: ${group.count}${group.visible ? "" : " (hidden)"}`).join(", ");
 * console.log(show([{ name: "Cities", count: 3, visible: true }]));
 * ```
 */
export interface GroupInfo {
  name: string;
  count: number;
  visible: boolean;
}
