// The data door of the Earth (`@johnmorrisdotca/chikyu-earth/door`, MODULES-902): one way to hand the package outside data, and to see whose data is on the screen. A source is a small typed object that carries its own licence and
// credit. A map source (`EarthMapSource`) is the finer map of the Earth in tiles, and `earthTiles` is the package's own folder of them, which is what the `tiles` attribute means; a record source of orbital elements
// (`ElementRecordSource`, `elementsFrom`) is what `<chikyu-passes>` works the passes out from. `<chikyu-earth-realistic>` and `<chikyu-passes>` take `sources` and `addSource`, and `credits()` says whose data was in the last drawn frame.
// The shapes and the four small functions are `../data-door.ts`, the same file in every package of the family (kazoku-ui's templates/data-door.ts). Nothing here is imported by the main entry or the elements' own
// entries beyond what they use: a page that never uses the door pays nothing. With no outside source every view draws what it always drew. Pure: no DOM, no three.js, no clock.
export { createTileStore, creditLine, loadRecords, MAX_IN_FLIGHT, MAX_RECORDS, TILE_BUDGET_BYTES, validateSource } from "../data-door.ts";
export type { BitmapLike, Credit, DataSource, ImageTile, Licence, MapPlace, RecordsRead, RecordSource, SourceInfo, TileLoader, TileSource, TileStats, TileStore, TileStoreOptions } from "../data-door.ts";
export { DEFAULT_LEVELS, earthTiles, imageBytes, mapKeys, tileKeyParts, tilePlace, type EarthMapPlace, type EarthMapSource, type EarthTilesOptions, type MapLayer } from "./map.ts";
export { elementsFrom, mergeElementSets, readElementSets, type ElementRecordSource, type ElementSetsRead } from "./elements.ts";
export { OWN_SOURCES, ownCredit } from "./own.ts";
export { createSourceBook, creditsOf, type SourceBook, type SourceBookOptions, type SourceStats } from "./book.ts";
export { packedElementsFrom, readPackedFrom, type PackedElementsOptions } from "./packed.ts";
