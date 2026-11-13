import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// Your page gets the elements (CelesTrak's JSON, within its usage policy) and passes them in; this is one downloaded element set.
const iss: ElementSet = {
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

const space = document.querySelector("chikyu-space")!;
space.setSatellites("stations", createSatellites([iss]), { color: "#ffd54f", size: 6 });
// The page's moment is 43 days after the elements, past the 30 days a satellite is placed within: `estimate-far` (in the page) keeps it on the picture, drawn lighter, as where it would be had its orbit not changed.
space.addEventListener("chikyu-satellite-click", (event) => {
  const { estimated, estimatedDays } = (event as CustomEvent).detail;
  console.log(estimated ? `estimated, ${Math.round(estimatedDays)} days from its last tracking` : "placed from current elements");
});
console.log(space.estimateFar, space.placeSatellite({ group: "stations", index: 0 })?.estimated); // true true
