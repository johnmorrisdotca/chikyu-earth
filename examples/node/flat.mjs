import { clusterPlanes, groupFacts } from "@johnmorrisdotca/chikyu-earth/flat";

// Six GPS satellites from one downloaded list, two in each of three planes: the same facts on a server as in a page, from the elements alone.
const gps = (RA_OF_ASC_NODE) => ({ MEAN_MOTION: 2.00563, ECCENTRICITY: 0.0102, INCLINATION: 55.1, RA_OF_ASC_NODE });
const sets = [gps(24), gps(26), gps(144), gps(146), gps(264), gps(266)];
const facts = groupFacts(sets);
const planes = clusterPlanes(sets).planes.map((plane) => `${plane.id}:${plane.count}`).join(" ");
console.log(`${facts.count} satellites, ${Math.round(facts.meanAltitudeKm)} km up, ${Math.round(facts.meanInclinationDeg)} degrees, ${facts.planeCount} planes (${planes})`);
