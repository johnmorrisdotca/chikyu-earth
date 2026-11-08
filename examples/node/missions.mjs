import { missionOf, missionPosition, missions } from "@johnmorrisdotca/chikyu-earth/satellites";

// The Space Shuttle flights, and where the craft was at a moment of one, from the element sets Space-Track kept at the time (two of STS-1's, here).
const sets = [
  { OBJECT_NAME: "STS 1 (OFT-1)", EPOCH: "1981-04-12T20:49:32.182176", MEAN_MOTION: 16.01389059, ECCENTRICITY: 0.0004879, INCLINATION: 40.3433, RA_OF_ASC_NODE: 259.625, ARG_OF_PERICENTER: 296.3562, MEAN_ANOMALY: 63.4235, NORAD_CAT_ID: 12399, BSTAR: 0.002351, MEAN_MOTION_DOT: 0.01317629, MEAN_MOTION_DDOT: 0.0011342 },
  { OBJECT_NAME: "STS 1 (OFT-1)", EPOCH: "1981-04-13T08:47:54.639168", MEAN_MOTION: 16.01452947, ECCENTRICITY: 0.0006363, INCLINATION: 40.3379, RA_OF_ASC_NODE: 256.3348, ARG_OF_PERICENTER: 298.5494, MEAN_ANOMALY: 61.4705, NORAD_CAT_ID: 12399, BSTAR: 0.002351, MEAN_MOTION_DOT: 0.01372851, MEAN_MOTION_DDOT: 0.0000027732 },
];
const flight = missionOf("STS-1");
const place = missionPosition(sets, Date.UTC(1981, 3, 13, 6), flight);
console.log(`${missions().length} flights; ${flight.name} ${flight.orbiter}, ${flight.crew} crew: ${place.altitudeKm.toFixed(0)} km up over ${place.latitude.toFixed(0)} degrees`);
