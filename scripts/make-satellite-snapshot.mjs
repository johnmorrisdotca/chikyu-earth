// Makes demo/celestrak-snapshot.json from two files that were each downloaded from CelesTrak once (this script fetches nothing):
//   node scripts/make-satellite-snapshot.mjs stations.json starlink.json "2026-11-02T17:07Z"
// stations.json is https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json and starlink.json is the same with GROUP=starlink.
// The snapshot keeps every station and every fifth Starlink satellite (by catalogue number), as arrays of numbers, so the demo's file is small.
import { readFileSync, writeFileSync } from "node:fs";

const [stationsFile, starlinkFile, retrieved] = process.argv.slice(2);
if (!stationsFile || !starlinkFile || !retrieved) throw new Error("usage: make-satellite-snapshot.mjs stations.json starlink.json <time retrieved, UTC>");
const FIELDS = ["NORAD_CAT_ID", "OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"];
const rows = (file, every) =>
  JSON.parse(readFileSync(file, "utf8"))
    .sort((x, y) => x.NORAD_CAT_ID - y.NORAD_CAT_ID)
    .filter((_, index) => index % every === 0)
    .map((set) => FIELDS.map((field) => set[field]));
const stations = rows(stationsFile, 1);
const starlink = rows(starlinkFile, 5);
const all = JSON.parse(readFileSync(starlinkFile, "utf8")).length;
const snapshot = {
  source: "CelesTrak (https://celestrak.org), GP element sets from the U.S. Space Force's 18th Space Defense Squadron, and for Starlink SpaceX's own supplemental elements",
  retrieved,
  note: `One download of each list on ${retrieved.slice(0, 10)}, within CelesTrak's usage policy. The Starlink group had ${all} satellites that day; this keeps every fifth. Not live: the demo shows the age of the elements.`,
  fields: FIELDS,
  groups: { stations, starlink },
};
writeFileSync(new URL("../demo/celestrak-snapshot.json", import.meta.url), `${JSON.stringify(snapshot)}\n`);
console.log(`stations ${stations.length}, starlink ${starlink.length} of ${all}`);
