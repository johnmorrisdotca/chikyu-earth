import { METEOR_STRENGTH_DEFAULT, readMeteorStrength, streaksPerSecond } from "@johnmorrisdotca/chikyu-earth/meteors";

// What a page's `meteors-strength` means: 1 when it says nothing, a number from 0 to 1 as written, and the nearest end outside.
console.log(METEOR_STRENGTH_DEFAULT, readMeteorStrength("0.3"), readMeteorStrength("7"), readMeteorStrength("soft"));

// Streaks drawn a second over a dark view on a night with no shower (8 meteors an hour): 2.5 at the full look, fewer at a low strength, none at 0.
for (const strength of [1, 0.3, 0]) console.log(`strength ${strength}: ${streaksPerSecond(8, strength)} a second`);
