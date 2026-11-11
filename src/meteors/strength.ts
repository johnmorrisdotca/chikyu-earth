// How strongly the meteors are drawn: one number from 0 to 1 that a page sets with `meteors-strength`. It scales how bright a streak is and how many are drawn.
// It changes nothing that is real: the hourly rates, the showers and the `chikyu-meteors` event are the same at every strength.

/**
 * How strongly the meteors are drawn when a page says nothing: 1, the look they have always had. The page's `meteors-strength` attribute chooses.
 *
 * @example
 * ```ts
 * import { METEOR_STRENGTH_DEFAULT } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(METEOR_STRENGTH_DEFAULT); // 1
 * ```
 */
export const METEOR_STRENGTH_DEFAULT = 1;

/**
 * What a page's `meteors-strength` attribute means: a number from 0 (no streaks are drawn) to 1 (the full look), given as it is written; with none, or something that
 * is not a number, `METEOR_STRENGTH_DEFAULT`. A number outside the range is brought to its nearest end.
 *
 * @param given - The attribute's value, or `null` when the page has none.
 * @returns How strongly the streaks are drawn, between 0 and 1.
 *
 * @example
 * ```ts
 * import { readMeteorStrength } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(readMeteorStrength(null), readMeteorStrength("0.3"), readMeteorStrength("7"), readMeteorStrength("-1"), readMeteorStrength("soft")); // 1 0.3 1 0 1
 * ```
 */
export function readMeteorStrength(given: string | null): number {
  if (given === null || given.trim() === "") return METEOR_STRENGTH_DEFAULT;
  const value = Number(given);
  if (!Number.isFinite(value)) return METEOR_STRENGTH_DEFAULT;
  return Math.min(1, Math.max(0, value));
}
