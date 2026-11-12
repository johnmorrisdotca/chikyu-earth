// The satellites' two limits, apart from the SGP4 code so the space view can read them without needing satellite.js.

/**
 * How old, in days, an element set may be at the moment shown before the satellite is left out altogether (30 by default). Between `DEFAULT_DIM_AFTER_DAYS` and this the satellite is still placed, but drawn dimmer, because SGP4's error grows by a few kilometres a day.
 *
 * @example
 * ```ts
 * import { DEFAULT_MAX_AGE_DAYS } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(DEFAULT_MAX_AGE_DAYS);
 * ```
 */
export const DEFAULT_MAX_AGE_DAYS = 30;

/**
 * How old, in days, an element set may be at the moment shown before the satellite is drawn dimmer to say its place is less exact: SGP4's error grows by a few kilometres a day, so a fortnight is as far as a picture should trust it fully.
 *
 * @example
 * ```ts
 * import { DEFAULT_DIM_AFTER_DAYS } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(DEFAULT_DIM_AFTER_DAYS);
 * ```
 */
export const DEFAULT_DIM_AFTER_DAYS = 14;

/**
 * The fastest clock, in game seconds a second, at which a group of satellites is still placed by interpolating two SGP4 samples. Above it those two moments would be too far apart, so each satellite is drawn as a short streak along its orbit instead: about a thirtieth of the group is sampled with SGP4 each frame (the whole group about once a second), and each is turned from its own sample by its mean motion, covering the stretch one frame spans. Nothing is hidden. A satellite chosen with `selectSatellite` or ridden along is still placed exactly, one SGP4 call a frame.
 *
 * @example
 * ```ts
 * import { MAX_SATELLITE_SPEED } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(MAX_SATELLITE_SPEED);
 * ```
 */
export const MAX_SATELLITE_SPEED = 60;
