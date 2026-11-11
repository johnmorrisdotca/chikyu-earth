---
title: Outside data, the data door
section: how-to
order: 15
description: How to hand the package your own map of the Earth or your own orbit data as a source with its own licence and credit, how to switch one off, and how a page shows whose data is on the screen. Non-commercial and share-alike sources are allowed from a caller, with the licence printed beside the credit.
---

The package draws, and you bring the data. `@johnmorrisdotca/chikyu-earth/door` is the one way to hand it a finer map of the Earth or a list of satellites' orbit data, and the same door shows whose data is on the screen. With no source the package draws what it always drew, from its own data: the whole-Earth pictures and the finer map tiles cut from NASA's maps (`OWN_SOURCES`, written from `NOTICE.md`). The package bundles only data that is clear to pass on; a source of yours may be non-commercial or share-alike, and the credit line prints that beside the licence.

The shapes (`SourceInfo`, `Licence`, `RecordSource`, `TileSource`, `Credit`, `MapPlace`, `ImageTile`) and four small functions (`validateSource`, `creditLine`, `loadRecords`, `createTileStore`) are the family's data door, one file copied unchanged into each package (`src/data-door.ts`, from kazoku-ui's `templates/data-door.ts`). The door re-exports them, so one import is enough.

## A source says who it is

`info` says who the source is: an `id` (lower-case letters, digits and hyphens, unique in the view, and never one of the package's own: `chikyu-pictures`, `chikyu-tiles`), a `name` and a `credit` in English and Japanese (never empty), the `licence` (a name and a link, with `nonCommercial` or `shareAlike` where it is so), the source's page and the day it was retrieved.

```js
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
```

`createSourceBook` is the part of an element that keeps the sources; the element's `addSource` is the book's. A source is checked with `validateSource` when it is added, so an empty credit, no licence, a clashing id, a layer the Earth does not know or a missing function is a `TypeError` at once, not at the first draw.

## A map of the Earth

A map source is a source of tiles: `need(place, detail)` names the keys of the tiles a place needs, `load(key, signal)` fetches one as an `ImageTile` (a width, a height and a picture), and `bytes(tile)` says what it holds, for the budget. It also says which `layer` it is for: `day` and `night` are the pictures `<chikyu-earth-realistic>` lays tiles over, and `clouds` and `water` are accepted for the whole-Earth layers they are but not tiled or drawn yet (a source for them is kept and never credited, because nothing of it is drawn). The place is the family's `MapPlace` (longitude and latitude in degrees), and the detail is the pixels across the whole circumference, not a level number. The pyramid is the package's own: level L is `1024 * 2^L` pixels round in 512 pixel tiles, `2^(L+1)` columns and `2^L` rows, column 0 at longitude -180 and row 0 at latitude 90, and a tile's key ends in `level/column/row`. `mapKeys(place, detail, levels)` gives those keys, so a source of your own can build its `need` on it; the levels a source has are told by an optional `levels(layer, signal)` (levels 3 and 4, 8192 and 16384 pixels across, where it is left out). The Earth asks a source about each tile it wants, one tile's place at a time, and takes the key that ends in that tile's level, column and row.

A map source for a layer takes the place of the package's folder of tiles for that layer, and the window of tiles in view is laid over the package's own 4096 pixel picture as before, which stays under it as the far view. Night tiles go with day tiles: a night source with no day source draws nothing. With two sources for one layer the last one added is the one drawn.

`earthTiles(base)` is the package's own folder as a source: a `manifest.json` and a tile for each layer, level and place at `<layer>/<level>/<column>/<row>.webp`. It is what the `tiles` attribute means, and the attribute stays as the short way to say it: `tiles="/my-tiles/"` and `addSource(earthTiles("/my-tiles/"))` are the same.

## Orbit data

A source of orbital elements is a list that fits in memory, at most 200,000 element sets (`MAX_RECORDS`), read once when the source is added. Each record is an `ElementSet` (the OMM "GP" shape CelesTrak and Space-Track serve). `elementsFrom(url, info)` makes a source of an address you chose, through `fetchElements` and its politeness rules (nothing is asked until the source is read, then once in two hours at most). `<chikyu-passes>` works the passes out from the sources' sets together with its own `elements` and `elements-src`; where two lists have the same satellite the newer epoch wins. A set that cannot be used (a number that is not finite, a name that is not text, an orbit that is not an ellipse) is left out and counted.

## On an element

`<chikyu-earth-realistic>` takes map sources and `<chikyu-passes>` takes orbit data. Both have the same calls:

```js no-run
import { creditLine } from "@johnmorrisdotca/chikyu-earth/door";
import "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.querySelector("chikyu-earth-realistic");
const remove = earth.addSource(myMap); // checked at once; returns the way to take it away
earth.addEventListener("chikyu-creditschange", () => (credit.textContent = creditLine(earth.credits(), "en")));
earth.enableSource("my-map", false); // a layers panel's switch
```

`sources` is a property (never an attribute: data is not text): assign a list to replace the sources, and if one is refused nothing changes. `removeSource(id)` and the `remove()` that `addSource` returns take a source away; `enableSource(id, false)` switches it off and keeps it in the view; the attribute `data="own"` ignores every source that is not the package's own, at once.

## Whose data is on the screen

`credits()` lists the sources that gave at least one tile or satellite to the last drawn frame, the package's own first: the whole-Earth pictures, the finer map tiles when a window of them is in view, and each source of yours that gave tiles (the passes: satellites listed). `creditLine(credits, "en" | "ja")` writes them as a line with the licence beside each: "Earth pictures: NASA Earth Observatory (...) (Public domain); My map, A. Person (2026) (CC BY-NC 4.0; non-commercial)." The element sends `chikyu-creditschange` with `detail: { credits }` when the set changes, not at each frame. `<chikyu-passes>` shows the line under its list after the text of its `credit` attribute, which stays. The demo's Earth page puts the line under the view, in the page's language, and reads `?data=own` from the address.

## Off

`remove()`, `removeSource(id)`, `enableSource(id, false)` and `data="own"` do the same: they abort that source's loads (their `AbortSignal`), free its tiles and records, take its window off the picture, draw again, and drop its credit. The picture is the first one again, and a source that is switched on again is read again.

## The limits

- **Memory.** One budget for all the tiles of a view, `TILE_BUDGET`: 72 MB of decoded tiles (a 512 pixel tile counts with its mipmaps, 1.4 MB: the 48 tiles the view has always held), the least recently used out first, and never a tile the window in view needs. A tile that arrives when everything held is needed does not fit and is refused and counted (`stats.tiles.refused`): the Earth keeps the picture it has. The template's own default is 48 MB; the Earth's is larger so that no existing picture loses a tile.
- **Requests.** At most six loads in flight for a layer, and a load starts only because the view changed: at rest the door sends nothing. A tile that failed is asked for again only after the view has moved away from it and back, not on a timer and not while it stays in view.
- **Bad data.** A tile that throws, comes back empty, is not a picture or has a size that is not a number is counted in `stats.tiles.failed` and never drawn. An element set with a number that is not finite is left out and counted.
- **Terms.** The package's own sources are never non-commercial or share-alike, and a test holds that. A caller's may be either, and the credit line says so.

## What stays as it was

Every attribute and function is as it was. With no source the picture is the same one, drawn from the same tiles, and `credits()` names the package's own sources only. `tiles`, `texture-base`, `elements`, `elements-src` and `credit` mean what they meant. One thing is different: a tile that could not be fetched is no longer tried again after 30 seconds; it is tried again after the view has moved away from it and back. Three small additions to `stats.tiles`: `heldBytes`, `refused` and `used` (the tiles in view from each source).
