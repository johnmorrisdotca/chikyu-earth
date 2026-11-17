import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatelliteHistory, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// The ISS's element sets (see the satellites guide for where to get them: your page brings them, chikyu fetches nothing).
const sets: ElementSet[] = [
  {
    OBJECT_NAME: "ISS (ZARYA)",
    OBJECT_ID: "1998-067A",
    EPOCH: "2026-11-02T10:25:21.580320",
    MEAN_MOTION: 15.49150046,
    ECCENTRICITY: 0.0007139,
    INCLINATION: 51.6332,
    RA_OF_ASC_NODE: 335.9757,
    ARG_OF_PERICENTER: 339.3739,
    MEAN_ANOMALY: 20.6961,
    NORAD_CAT_ID: 25544,
    BSTAR: 0.00012,
    MEAN_MOTION_DOT: 0.0001,
    MEAN_MOTION_DDOT: 0,
    LAUNCH_DATE: "1998-11-20",
  },
];

const space = document.querySelector("chikyu-space")!;
// The history places it from the set nearest each moment, not before its launch, shaded (a prediction) after its newest set.
const history = createSatelliteHistory(sets);
space.setSatelliteHistory(25544, history);
// Observe: the camera outside the satellite, the Earth turning beneath, and its path over its last 3 orbits behind it.
space.observe(25544, { orbits: 3 });
const now = history.describe(Date.parse("2026-11-02T20:00:00Z"));
console.log(now.status, `within ${Math.round(now.uncertaintyKm)} km`); // predicted within 2 km
