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
// The package draws no orbit line for the chosen satellite: the page draws it, in a look of its own, with the other paths.
space.selectedPath = false;
space.selectSatellite({ group: "stations", index: 0 });
space.setPathStyles({ favourite: { color: "#7fdbff", width: 3, dash: [8, 5] } });
space.setPaths([{ id: 25544, style: "favourite" }]);
// A press or a mouse resting within 8 px of a path says which one, with the same ref as a click on the satellite.
space.addEventListener("chikyu-path-click", (event) => console.log((event as CustomEvent).detail.id, (event as CustomEvent).detail.ref));
space.addEventListener("chikyu-path-hover", (event) => console.log((event as CustomEvent).detail?.style ?? "off the path"));
console.log(space.pathAt(10, 10)); // { id, ref, style, x, y, distancePx, pointer } or null
