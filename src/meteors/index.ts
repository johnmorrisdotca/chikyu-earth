// Meteors: the showers of the year, when and where their meteors fall, and how the realistic Earth draws them from space.
// Everything here is pure (no DOM, no three.js) and imports in a browser, in Node and in another package. The streaks themselves
// are switched on with the `meteors` attribute of `<chikyu-earth-realistic>` (`@johnmorrisdotca/chikyu-earth/realistic/element`).
export { METEOR_SHOWERS, type MeteorShower } from "../data/meteor-showers.ts";
export { METEOR_HEIGHT_KM, SPORADIC_HOURLY_RATE, activeShowers, apexPoint, darkness, hourlyRateAt, meteorSky, placeVector, pointBeneath, showerRate, solarLongitude, type MeteorSky } from "./rate.ts";
export { METEORS_PER_SECOND_MAX, METEOR_SLOTS, streakPath, streaksPerSecond } from "./layer.ts";
export { METEOR_STRENGTH_DEFAULT, readMeteorStrength } from "./strength.ts";
