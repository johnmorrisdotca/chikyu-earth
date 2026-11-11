---
title: The catalogue of objects in Earth orbit
section: how-to
order: 16
description: The orbit class of any object from its elements, what kind of object it is, a colour and a legend for each, the fleets, and the packed file a site hosts so a page can read up to 200,000 objects at once. The package ships no data.
---

About 32,000 catalogued objects with public elements go round the Earth, and fewer than half of them are working satellites: the rest are satellites that have stopped, spent rocket stages and debris. `@johnmorrisdotca/chikyu-earth/catalogue` is the part of that picture that needs no data: the class of an orbit, the kind of an object, the colours and legend, the fleets, and a compact file format that holds the whole catalogue. The elements themselves come from a source you choose, through the data door; the package ships none (they are stale in days).

## What is in the entry point

```js
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
```

- **The class of an orbit** comes from two numbers every element set has, its mean motion and its eccentricity: `classOfElements(meanMotion, eccentricity)`, or `orbitShape` then `orbitClass` when you want the heights too. The thresholds are ours, and `CLASS_LIMITS` and `CLASS_LABELS` state them. Heights are above the mean Earth radius of 6,371 km.
  - **Highly elliptical** (`heo`): an eccentricity of 0.25 or more, whatever the heights.
  - **Low** (`leo`): the highest point is under 2,000 km.
  - **Geostationary** (`geo`): both the lowest and the highest point are within 1,500 km of 35,786 km.
  - **Medium** (`meo`): the lowest point is 2,000 km or more and the highest is under 34,286 km, which takes in the navigation satellites.
  - **Other**: what is left, above the geostationary belt or between the classes.
- **The kind of an object**, from the catalogue's own object type: `readKind` takes Space-Track's `PAYLOAD`, `ROCKET BODY`, `DEBRIS` and `TBA`, or the short codes `PAY`, `R/B`, `DEB` and `UNK`. Anything else is unknown.
- **A colour and a legend** for each class and kind, in English or Japanese: `legend("class", lang)` and `legend("kind", lang)` give the labels and colours in the order a legend lists them, and `CLASS_COLOURS` and `KIND_COLOURS` are the colours themselves, chosen for a dark background.
- **Fleets**: `FLEETS` lists Starlink, OneWeb, GPS, Galileo, GLONASS, BeiDou, Iridium and the space stations by the pattern their names follow. `fleetOf(name, kind)` says which one an object belongs to (only payloads belong to a fleet) and `countFleets` counts them, which is the "N of M" a filter shows. A satellite whose name does not say its fleet is not matched.

## The packed file

`packCatalogue(records, meta)` writes the records as a column for each number and a table of names, about 95 bytes an object and about 37 gzipped, so 32,000 objects are 3 MB unpacked and a download of about 1.2 MB. It keeps each element set's epoch to the microsecond and its mean motion in full, and the angles to 32-bit precision (about 0.00003 degrees), well inside what the elements are good to. A catalogue number may be anything up to 4,294,967,295, so the six-digit numbers that came after 99,999 are held as they are: only OMM carries them, and `readCatalogueRecords` reads OMM as JSON or CSV with the fields of Space-Track's GP class (`OBJECT_TYPE`, `COUNTRY_CODE`, `LAUNCH_DATE`, `RCS_SIZE`) beside the elements.

- A file holds at most 200,000 records, the most the data door holds. A bigger header is refused, and so is a file that gzips to more than 64 MB when unpacked.
- `gzipBytes` and `unpackAny` use the web's own `CompressionStream`, so the same code runs in a browser and in Node 18 or later; `unpackAny` finds gzip from the first two bytes.
- Reading is by column: `file.norad`, `file.meanMotion` and the rest are typed arrays, and `setAt(i)` or `recordAt(i)` makes an object only for the record you ask for.

## Reading a packed file through the data door

`packedElementsFrom(url, info)` in `@johnmorrisdotca/chikyu-earth/door` is a record source for a packed file at an address you chose: up to 200,000 element sets, asked once, with no cookies and no referrer, over `https` only (or `http` on `localhost`), and an answer that is not 200 or is too big is a failed read, never a retry. `info` says whose data it is, so the credit shows on screen with the rest.

```ts no-run
import { packedElementsFrom } from "@johnmorrisdotca/chikyu-earth/door";

const debris = packedElementsFrom("https://example.org/catalogue/debris.pack.gz", {
  id: "catalogue-debris",
  name: { en: "Debris in Earth orbit", ja: "地球周回軌道のデブリ" },
  credit: { en: "Data from Space-Track.org (USSPACECOM)", ja: "データ：Space-Track.org（USSPACECOM）" },
  licence: { name: "Space-Track basic SSA data, with citation", url: "https://www.space-track.org/documentation" },
  url: "https://www.space-track.org",
  retrieved: "2026-11-11",
});
console.log(debris.info.id);
```

`readPackedFrom(url)` does the same ask and gives the whole file, so a page can show an object's kind, owner and launch date as well as place it.

## Making the files

The repository's own `scripts/catalogue.ts` makes three files for a site to host, `payloads`, `rocket-bodies` and `debris` (each `.pack.gz`; `debris` also holds the unidentified objects), and a `manifest.json` that names the source and the citation "Data from Space-Track.org (USSPACECOM)", says how many objects each holds and when the elements were retrieved. It is a script for the demo's site and is not part of the package. Its rules:

- **One login, two asks.** One request for every object on orbit (Space-Track's own filter for objects that can be propagated), a pause, then one request for the SATCAT, only after 17:00 UTC. The first non-200 answer stops the asking.
- **Working and inactive payloads** can be told apart, but only on request: Space-Track has no field that says whether a payload still works. With `CATALOGUE_WORKING_LIST=celestrak` the script takes the catalogue numbers of CelesTrak's list of active satellites, one request, keeps nothing else from it, and writes `working` and `inactive` in place of `payloads`. Without it, CelesTrak is never asked.
- **If Space-Track fails** the last files are kept and the log says how old they are.
- **The total is stated honestly** as catalogued objects with public elements, not everything in orbit, and every object carries the age of its elements.

A scheduled workflow runs the script once a day and the site publishes the files. A page reads them with `packedElementsFrom`, only the groups that are switched on, so a first load stays small.
