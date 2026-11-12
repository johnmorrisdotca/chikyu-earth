// Turning a view to one of its places, for `goToPlace` on `<chikyu-space>` and `<chikyu-earth-realistic>`: which place a page names, and a short glide of the controls' yaw and tilt.
import type { GeoPoint } from "../types.ts";
import type { Place } from "./places.ts";

/** How long the turn to a place takes, in milliseconds: slow enough to follow. */
export const PLACE_GLIDE_MS = 900;

/** The place a page names: by its id, else by its name in any case. */
export const findPlace = (places: readonly Place[], text: string): Place | undefined => {
  const name = text.trim().toLowerCase();
  return places.find((place) => place.id === text) ?? places.find((place) => place.label?.toLowerCase() === name);
};

/**
 * The yaw and tilt that bring a place to the middle of a view whose yaw and tilt 0 look at `base` (yaw turns west, tilt tips south), the yaw taken the shorter way round from the one now and the tilt
 * held to 90 either way, as the controls hold it.
 */
export function aimAt(base: GeoPoint, place: GeoPoint, now: { yaw: number; tilt: number }): { yaw: number; tilt: number } {
  const yaw = base.lon - place.lon;
  return { yaw: now.yaw + ((((yaw - now.yaw + 180) % 360) + 360) % 360) - 180, tilt: Math.max(-90, Math.min(90, base.lat - place.lat)) };
}

/**
 * Move a view's yaw and tilt from `from` to `to`: eased over {@link PLACE_GLIDE_MS} one frame at a time, or at once when `smooth` is false. `alive` false stops it (another glide began, the element left the page).
 */
export function glideView(set: (yaw: number, tilt: number, final: boolean) => void, from: { yaw: number; tilt: number }, to: { yaw: number; tilt: number }, smooth: boolean, alive: () => boolean): void {
  if (!smooth || typeof requestAnimationFrame !== "function") {
    set(to.yaw, to.tilt, true);
    return;
  }
  const start = performance.now();
  const step = (): void => {
    if (!alive()) return;
    const k = Math.min(1, (performance.now() - start) / PLACE_GLIDE_MS);
    const ease = k * k * (3 - 2 * k);
    set(from.yaw + (to.yaw - from.yaw) * ease, from.tilt + (to.tilt - from.tilt) * ease, k >= 1);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
