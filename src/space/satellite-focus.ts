// Which satellite group a view is showing on its own, and how far the camera has to pull back for that group's orbits.
// The choice is pure. The elements apply it; the satellite layer only reads it.
import type { ElementSet } from "../satellites/types.ts";
import type { SatelliteState } from "./satellite-layer.ts";

/** What happens to the groups that are not the one in focus. `dim` draws them dimmer. `hide` does not draw them. */
export type SatelliteOthers = "dim" | "hide";

/** The group a view is showing on its own, and what it does with the others. `null` when every group is as the page set it. */
export interface SatelliteFocus {
  name: string;
  others: SatelliteOthers;
}

/** How one group is drawn while a focus is set. `focus` is the chosen group, `dim` a group drawn dimmer, `hidden` a group not drawn, `plain` a group with no focus in force. */
export type SatelliteEmphasis = "focus" | "dim" | "hidden" | "plain";

/** What `focusSatelliteGroup` returns. `reason: "not-set"` is a group `setSatellites` has not set; the call changes nothing and does not throw. */
export interface SatelliteFocusAnswer {
  ok: boolean;
  group?: string | null;
  count?: number;
  changed?: boolean;
  reason?: "not-set";
}

/**
 * Whether a group is drawn, and whether its dots take the dim value, for a focus. A group the page hid stays hidden unless it is the one in focus. The page's own shown state is not an input that this changes.
 *
 * @param name - The group's name.
 * @param ownVisible - Whether the page is showing the group (`showSatellites`).
 * @param focus - The focus in force, or `null`.
 * @returns `drawn` (the group is placed), `dim` (1 to draw it dimmer, 0 to leave it) and `emphasis`.
 */
export function satelliteEmphasis(name: string, ownVisible: boolean, focus: SatelliteFocus | null): { drawn: boolean; dim: number; emphasis: SatelliteEmphasis } {
  if (!focus) return { drawn: ownVisible, dim: 0, emphasis: "plain" };
  if (focus.name === name) return { drawn: true, dim: 0, emphasis: "focus" };
  if (focus.others === "hide" || !ownVisible) return { drawn: false, dim: 0, emphasis: "hidden" };
  return { drawn: true, dim: 1, emphasis: "dim" };
}

/**
 * Put the focus on one group, or clear it with `null`. A name that is not a group already set is refused.
 *
 * @param state - The view's satellite state.
 * @param name - The group's name, or `null` to clear.
 * @param options - `others` is `dim` when left out. `frame` is read by the element, not here.
 * @returns The answer. `changed` is false when the focus was already that.
 */
export function applySatelliteFocus(state: SatelliteState, name: string | null, options: { others?: SatelliteOthers } = {}): SatelliteFocusAnswer {
  if (name === null) {
    const changed = state.focus !== null;
    state.focus = null;
    return { ok: true, group: null, count: 0, changed };
  }
  const found = state.groups.get(name);
  if (!found) return { ok: false, reason: "not-set" };
  const others: SatelliteOthers = options.others === "hide" ? "hide" : "dim";
  const changed = state.focus?.name !== name || state.focus.others !== others;
  state.focus = { name, others };
  return { ok: true, group: name, count: found.satellites.count, changed };
}

/** One group as `satelliteGroups` reports it: the page's own shown state, how the focus treats it, and how many the last draw placed. */
export interface SatelliteGroupRow {
  name: string;
  count: number;
  visible: boolean;
  placed: number;
  emphasis: SatelliteEmphasis;
}

/**
 * The groups now set, in the order they were set, with the focus applied for reading. `placed` is 0 when the group is not drawn.
 *
 * @param state - The view's satellite state.
 * @returns One row a group.
 */
export function satelliteGroupRows(state: SatelliteState): SatelliteGroupRow[] {
  return [...state.groups].map(([name, group]) => {
    const choice = satelliteEmphasis(name, group.visible, state.focus);
    return { name, count: group.satellites.count, visible: group.visible, placed: choice.drawn ? (group.placed ?? 0) : 0, emphasis: choice.emphasis };
  });
}

/** The greatest apogee a shell is pulled out to, in Earth radii. Past this, one far satellite would shrink the Earth instead of showing the group. */
export const SHELL_CAP = 8;

/**
 * The shell of a group, in Earth radii from the Earth's centre: the greatest apogee of its element sets, from the mean motion (revolutions a day) and the eccentricity.
 * One revolution a day is 6.62 Earth radii (Kepler's third law, an Earth of 6371 km). A group with no usable set is the Earth's own radius. The result is never above {@link SHELL_CAP}.
 *
 * @param sets - The group's element sets.
 * @returns The shell, from 1 to 8.
 */
export function shellRadiusOf(sets: readonly Pick<ElementSet, "MEAN_MOTION" | "ECCENTRICITY">[]): number {
  let far = 1;
  for (const set of sets) {
    if (!(set.MEAN_MOTION > 0) || !Number.isFinite(set.ECCENTRICITY)) continue;
    const apogee = 6.62 * (1 / set.MEAN_MOTION) ** (2 / 3) * (1 + Math.max(0, set.ECCENTRICITY));
    if (Number.isFinite(apogee)) far = Math.max(far, apogee);
  }
  return Math.min(SHELL_CAP, far);
}

/** The space view's field of view, in degrees. The same number `fitDistance` uses. */
const FOV = 35;
const RAD = Math.PI / 180;

/** The camera's distance, in radii, at which a body of radius 1 fills `size` of the view's shorter side. The same sum as `fitDistance`. */
const fitDistance = (size: number, aspect: number): number => {
  const across = Math.max(0.02, Math.min(50, size)) * Math.min(1, Math.max(0.05, aspect));
  return Math.sqrt(1 + 1 / (across * Math.tan((FOV / 2) * RAD)) ** 2);
};

/**
 * The zoom that puts a shell of `shell` Earth radii inside the space view. At zoom 1 the Earth fills `earthSize` of the shorter side. The shell fills about 0.92 of that side.
 *
 * @param shell - The shell, in Earth radii.
 * @param earthSize - The share of the shorter side the Earth fills at zoom 1.
 * @param aspect - The view's width over its height.
 * @param min - The least zoom the view allows.
 * @param max - The greatest zoom the view allows.
 * @returns The zoom.
 */
export function zoomForPerspectiveShell(shell: number, earthSize: number, aspect: number, min: number, max: number): number {
  const wanted = Math.max(1.02, shell) * fitDistance(0.92, aspect);
  return Math.min(max, Math.max(min, fitDistance(earthSize, aspect) / wanted));
}

/**
 * The zoom that puts a shell of `shell` Earth radii inside the realistic Earth's picture. At zoom 1 the Earth and its glow fill the shorter side (the glow is 1.08 radii). The shell fills about 0.92 of that side.
 *
 * @param shell - The shell, in Earth radii.
 * @param width - The view's width in CSS pixels.
 * @param height - The view's height in CSS pixels.
 * @param min - The least zoom the view allows.
 * @param max - The greatest zoom the view allows.
 * @returns The zoom.
 */
export function zoomForOrthographicShell(shell: number, width: number, height: number, min: number, max: number): number {
  const shorter = Math.max(1, Math.min(width, height));
  const discAt1 = Math.max(1, shorter / 2 / 1.08 - 1);
  const halfAt1 = shorter / 2 / discAt1;
  return Math.min(max, Math.max(min, (halfAt1 * 0.92) / Math.max(1.02, shell)));
}
