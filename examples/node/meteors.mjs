import { METEOR_SHOWERS, activeShowers, hourlyRateAt, meteorSky, pointBeneath } from "@johnmorrisdotca/chikyu-earth/meteors";

const moment = Date.UTC(2026, 7, 13, 2);
// The showers active on the night of the Perseids' maximum, strongest first.
for (const { shower, zhr } of activeShowers(moment)) console.log(`${shower.name} (${shower.code}): ${zhr.toFixed(1)} an hour`);

// Where the Perseids' radiant stands overhead then, and the rate an ideal watcher in Tokyo would count.
const perseids = METEOR_SHOWERS.find((shower) => shower.code === "PER");
const overhead = pointBeneath(perseids.radiant, moment);
console.log(`Overhead at ${overhead.lat} N, ${overhead.lon.toFixed(0)} E; Tokyo: ${hourlyRateAt(meteorSky(moment), { lon: 139.7, lat: 35.7 }).toFixed(0)} an hour`);
