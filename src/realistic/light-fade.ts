// A short cross-fade when `light` changes to or from `lit`: the Earth's night lights and (in the realistic view) the direction of its light move from one look to the other over 300 ms instead of cutting. A reader who asked for reduced motion
// gets the cut. The fade is a state the draw steps: each draw asks for the next while it moves, and when it has arrived nothing is asked for, so at rest nothing is drawn.

/** How long the cross-fade takes, in milliseconds. */
export const LIGHT_FADE_MS = 300;

/** Where the fade is: `mix` is 0 for the true light and 1 for `lit`. */
export interface LightFade {
  mix: number;
  target: number;
  from: number;
  started: number;
  /** Whether the last step left it still moving, so another draw is wanted. */
  fading: boolean;
}

export const newLightFade = (lit = false): LightFade => ({ mix: lit ? 1 : 0, target: lit ? 1 : 0, from: lit ? 1 : 0, started: 0, fading: false });

/** A smooth start and end: 0 to 1 over `t` from 0 to 1. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Step the fade to `now`. `lit` is where it is going. A change of `lit` starts a fade from where the mix is now (a fade turned round half way goes back from there); with `reduced` it jumps. Returns the same object, updated.
 *
 * @param fade - The fade to step.
 * @param lit - Whether the light is `lit` now.
 * @param now - The clock, in milliseconds.
 * @param reduced - Whether the reader asked for less motion.
 * @returns The fade: `mix` for this frame and `fading` true while another frame is wanted.
 */
export function stepLightFade(fade: LightFade, lit: boolean, now: number, reduced: boolean): LightFade {
  const target = lit ? 1 : 0;
  if (target !== fade.target) {
    fade.target = target;
    fade.from = fade.mix;
    fade.started = now;
  }
  if (reduced || fade.mix === target) {
    fade.mix = target;
    fade.from = target;
    fade.fading = false;
    return fade;
  }
  const t = Math.min(1, Math.max(0, (now - fade.started) / LIGHT_FADE_MS));
  fade.mix = fade.from + (target - fade.from) * ease(t);
  if (t >= 1) fade.mix = target;
  fade.fading = fade.mix !== target;
  return fade;
}
