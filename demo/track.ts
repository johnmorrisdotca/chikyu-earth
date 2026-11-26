// The small map: one satellite, chizu's world, no WebGL. The elements are this page's own copy of a published ISS set. `?at=` holds the clock so a test does not depend on the minute it runs.
import "../src/track/define.ts";
import type { ChikyuTrack } from "../src/track/define.ts";
import type { ElementSet } from "../src/satellites/types.ts";

const iss: ElementSet = {
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

const track = document.querySelector<ChikyuTrack>("#track")!;
const at = new URLSearchParams(location.search).get("at");
if (at) track.setAttribute("time", at);
track.satellite = iss;
