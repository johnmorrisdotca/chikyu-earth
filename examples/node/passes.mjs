import { findPasses } from "@johnmorrisdotca/chikyu-earth/passes";

// When the ISS crosses the sky over London, from one downloaded element set: the same answer on a server as in a page.
const iss = {
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
};
const day = Date.UTC(2026, 10, 3);
const [pass] = findPasses(iss, { latitude: 51.5074, longitude: -0.1278 }, { from: day, to: day + 3 * 86_400_000 }, { all: true });
console.log(`${pass.name}: highest ${Math.round(pass.highest.altitude)} degrees in the ${pass.highest.compass}, ${pass.reason}`);
