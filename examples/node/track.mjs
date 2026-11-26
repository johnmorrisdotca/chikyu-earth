import { nightSide, trackPicture } from "@johnmorrisdotca/chikyu-earth/track";

const iss = {
  OBJECT_NAME: "ISS (ZARYA)",
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
const noon = Date.UTC(2026, 10, 3, 12);
const picture = trackPicture(iss, noon, 90);
const mark = picture.some((item) => item.kind === "mark");
const night = nightSide(noon).length > 3;
console.log(`${mark ? "mark" : "none"} ${night ? "night" : "day"}`);
