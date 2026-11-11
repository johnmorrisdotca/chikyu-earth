import { classOfElements, gzipBytes, legend, packCatalogue, readCatalogueRecords, unpackAny } from "@johnmorrisdotca/chikyu-earth/catalogue";

// Two made-up rows in the shape Space-Track's GP class answers (OMM as CSV), the second with a six-digit catalogue number.
const csv = [
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,NORAD_CAT_ID,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT,OBJECT_TYPE,COUNTRY_CODE,LAUNCH_DATE,RCS_SIZE",
  "MADE-UP COMSAT,2020-010A,2026-11-08T04:12:35,1.0027,0.0002,0.05,120.5,80.25,10.75,45678,0.0001,0.000001,0,PAYLOAD,FR,2020-02-02,LARGE",
  "MADE-UP DEB,2026-060C,2026-11-08T04:12:35,14.9,0.01,82,120.5,80.25,10.75,100123,0.0001,0.000001,0,DEBRIS,PRC,2026-07-09,SMALL",
].join("\n");
const { records } = readCatalogueRecords(csv);

// The class of each orbit, from its elements alone.
for (const { set, kind } of records) console.log(set.OBJECT_NAME, kind, classOfElements(set.MEAN_MOTION, set.ECCENTRICITY));

// Packed, gzipped and read back: the file a site hosts, and the legend a page shows beside it.
const file = await unpackAny(await gzipBytes(packCatalogue(records, { group: "example" })));
console.log(file.count, file.norad[1], file.recordAt(1).owner, legend("kind", "en").map((line) => line.label).join(", "));
