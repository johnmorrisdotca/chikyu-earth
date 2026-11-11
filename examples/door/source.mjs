import { createSourceBook, creditLine, mapKeys, mergeElementSets, ownCredit } from "@johnmorrisdotca/chikyu-earth/door";

// A map of your own: here a day picture with no pictures behind it, only the keys it would answer. A real one fetches tiles, and says whose they are and under what licence.
const info = (id, name) => ({
  id,
  name: { en: name, ja: "私のデータ" },
  credit: { en: `${name}, A. Person (2026)`, ja: `私のデータ（A. Person、2026年）` },
  licence: { name: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/", nonCommercial: true },
  url: "https://example.org/mine",
  retrieved: "2026-11-11",
});
const myMap = {
  kind: "tiles",
  layer: "day",
  info: info("my-map", "My map"),
  need: (place, detail) => mapKeys(place, detail, undefined, "mine/"),
  load: async () => ({ width: 512, height: 512, image: { width: 512, height: 512 } }),
  bytes: (tile) => tile.width * tile.height * 4,
};

// An element keeps a book like this one: `earth.addSource(myMap)` is `book.addSource(myMap)`, and `passes.addSource(mine)` is the same for orbit data.
const book = createSourceBook();
book.addSource(myMap);
const mine = {
  kind: "records",
  info: info("my-orbits", "My orbits"),
  records: () => [
    { OBJECT_NAME: "ISS (ZARYA)", EPOCH: "2026-11-10T00:00:00", MEAN_MOTION: 15.49, ECCENTRICITY: 0.0007, INCLINATION: 51.6, RA_OF_ASC_NODE: 335.9, ARG_OF_PERICENTER: 339.3, MEAN_ANOMALY: 20.6, NORAD_CAT_ID: 25544, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0 },
    { OBJECT_NAME: "Broken", EPOCH: "2026-11-10T00:00:00", MEAN_MOTION: Number.NaN, ECCENTRICITY: 0, INCLINATION: 0, RA_OF_ASC_NODE: 0, ARG_OF_PERICENTER: 0, MEAN_ANOMALY: 0, NORAD_CAT_ID: 1, BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0 },
  ],
};
book.addSource(mine);
await book.ready();
const sets = mergeElementSets(book.elementLists());
console.log(`${sets.length} element set kept, ${book.stats().records["my-orbits"].skipped} left out: ${sets[0].set.OBJECT_NAME}`);
console.log(`the day map answers ${book.mapSources("day")[0].need({ lonMin: -10, lonMax: 10, latMin: -5, latMax: 5 }, 8192).join(", ")}`);
const credits = [ownCredit("chikyu-pictures", 1), { source: myMap.info, own: false, used: 6 }];
console.log(creditLine(credits, "en"));
console.log(creditLine(credits, "ja"));

book.enableSource("my-map", false);
console.log(`${book.mapSources("day").length} day maps with the source off`);
