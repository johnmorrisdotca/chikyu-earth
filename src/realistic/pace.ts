// How often a running clock draws: the pure rule, with no browser in it, so a test can ask it anything. Both live views (the realistic Earth and the space view) use it.

/** The most frames a second a clock at real time (or up to 60 times it) draws by default: `smooth-fps` changes it. */
export const SMOOTH_FPS = 15;
/** The most `smooth-fps` allows. */
export const SMOOTH_FPS_MAX = 30;
/** How far, in CSS pixels, the fastest thing on show may move between two frames before the next one is drawn: half a pixel is under what the eye reads as a step. */
export const SMOOTH_STEP_PX = 0.5;
/** The fastest clock, in seconds of game time for each real second, that is paced by half a pixel and the `smooth-fps` cap (at real time exactly; above it never less often than a frame a pixel). Beyond it the picture is drawn once for each pixel moved, up to 30 a second. */
export const SMOOTH_UP_TO = 60;

/**
 * Read `smooth-fps`: a number of frames a second from 1 to 30, and 15 for nothing or anything else.
 *
 * @param value - The attribute's text, or `null` when it is not set.
 * @returns The frames a second.
 *
 * @example
 * ```ts
 * import { readSmoothFps } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(readSmoothFps(null), readSmoothFps("24"), readSmoothFps("500"), readSmoothFps("many"));
 * ```
 */
export function readSmoothFps(value: string | null): number {
  if (value === null || value.trim() === "") return SMOOTH_FPS;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(SMOOTH_FPS_MAX, Math.max(1, number)) : SMOOTH_FPS;
}

/**
 * The cap on the frames a second of a running clock for this device: `smoothFps`, or half of it (at least 1) on a small device (2 GB of memory or less, or 2 cores or fewer) or on a battery at 20% or lower that is not charging.
 *
 * @param smoothFps - The page's own cap (`smooth-fps`).
 * @param tight - Whether the device is small or its battery low.
 * @returns The frames a second to allow.
 *
 * @example
 * ```ts
 * import { smoothCap } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(smoothCap(15, false), smoothCap(15, true));
 * ```
 */
export function smoothCap(smoothFps: number, tight: boolean): number {
  return tight ? Math.max(1, Math.round(smoothFps / 2)) : Math.max(1, smoothFps);
}

/** What `framesPerSecond` reads. */
export interface PaceInput {
  /** How fast the quickest thing on show moves across the screen, in CSS pixels a second of real time: the Earth's turn at this zoom, a satellite dot, the ridden craft and the camera in a ride. */
  pixelsPerSecond: number;
  /** The clock's speed, in seconds of game time for each real second. */
  speed: number;
  /** The most frames a second from `smoothCap`. */
  cap: number;
  /** A reader who asked for reduced motion: at most one a second. */
  reduced?: boolean;
  /** Something moves that the Earth's own turn does not account for (satellites on show, a ride): at least one a second. Otherwise a still picture may be drawn less often than that. */
  always?: boolean;
}

/**
 * How many frames a second a running clock should draw (a number below 1 means a frame less often than every second, which only a picture with nothing quick in it gets).
 * At real time a frame is drawn each time the quickest thing has moved half a pixel on the screen, at most `cap` a second. Above real time, up to 60 times it, that or a frame for every pixel it moves (up to 30 a second, as it always was), whichever is more often,
 * so a faster clock is never drawn less often than it was; above that a frame for every pixel, up to 30 a second. A reader who asked for reduced motion gets one a second at most. At least one a second when `always` or the clock is faster than real time.
 *
 * @param input - How fast things move and the limits.
 * @returns Frames a second, 0 when nothing moves at all.
 *
 * @example
 * ```ts
 * import { framesPerSecond } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * // a low satellite on a whole Earth, then the same zoomed in, then a reader who asked for reduced motion
 * console.log(framesPerSecond({ pixelsPerSecond: 0.3, speed: 1, cap: 15, always: true }));
 * console.log(framesPerSecond({ pixelsPerSecond: 6, speed: 1, cap: 15, always: true }));
 * console.log(framesPerSecond({ pixelsPerSecond: 6, speed: 1, cap: 15, always: true, reduced: true }));
 * ```
 */
export function framesPerSecond(input: PaceInput): number {
  const pixels = Number.isFinite(input.pixelsPerSecond) ? Math.max(0, input.pixelsPerSecond) : 0;
  const speed = Math.abs(input.speed);
  const smooth = Math.min(Math.max(1, input.cap), pixels / SMOOTH_STEP_PX);
  const pixelwise = Math.min(SMOOTH_FPS_MAX, pixels);
  // real time is strictly within the cap; above it the picture is never drawn less often than it was (a frame for each pixel, up to 30 a second), and above 60 times it is that alone
  let rate = speed <= 1 ? smooth : speed <= SMOOTH_UP_TO ? Math.max(smooth, pixelwise) : pixelwise;
  if (input.reduced) rate = Math.min(rate, 1);
  if (input.always || speed > 1) rate = Math.max(rate, 1);
  return rate;
}

/**
 * The wait, in milliseconds, before the next frame at `perSecond`: never under a frame's share of a second and never over `longest`.
 *
 * @param perSecond - Frames a second from `framesPerSecond`.
 * @param longest - The longest wait, in milliseconds (a minute at real time with nothing quick on show).
 * @returns Milliseconds.
 *
 * @example
 * ```ts
 * import { waitFor } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(waitFor(4, 60_000), waitFor(0, 60_000));
 * ```
 */
export function waitFor(perSecond: number, longest: number): number {
  return perSecond > 0 ? Math.min(longest, 1000 / perSecond) : longest;
}

/**
 * Ask the browser (where it can say) whether the battery is at 20% or lower and not charging, and tell `set` when it is. Browsers without the battery API, and a refusal, say nothing: the device counts as plugged in.
 *
 * @param nav - `navigator`, or anything with its `getBattery`.
 * @param set - Called with `true` when the battery is low.
 *
 * @example
 * ```ts
 * import { watchLowBattery } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * watchLowBattery(navigator, (low) => console.log("low battery", low));
 * ```
 */
export function watchLowBattery(nav: object, set: (low: boolean) => void): void {
  (nav as { getBattery?: () => Promise<{ charging: boolean; level: number }> }).getBattery?.().then(
    (battery) => {
      if (!battery.charging && battery.level <= 0.2) set(true);
    },
    () => undefined,
  );
}
