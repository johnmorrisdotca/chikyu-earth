// The Earth-orbit catalogue's pure parts (`@johnmorrisdotca/chikyu-earth/catalogue`): the class of an orbit from its elements, the kind of an object, a colour and a legend for each, the fleets, and the packed file a refresh script
// writes and a page reads (up to 200,000 records, six-digit catalogue numbers held). No data is here: the elements come from a source you choose, through the data door (`packedElementsFrom`). No DOM, no dependency.
export { OBJECT_KINDS, KIND_LABELS, KIND_COLOURS, CLASS_COLOURS, CLASS_LABELS, ORBIT_CLASSES, legend, readKind, type LegendEntry, type ObjectKind, type OrbitClass } from "./kinds.ts";
export { CLASS_LIMITS, GEO_ALTITUDE_KM, classOfElements, orbitClass, orbitShape, type OrbitShape } from "./orbit.ts";
export { FLEETS, countFleets, fleetOf, type Fleet } from "./fleets.ts";
export { MAX_PACKED, MAX_PACKED_BYTES, PackError, gzipBytes, packCatalogue, unpackAny, unpackCatalogue, type CatalogueRecord, type PackedCatalogue, type RadarSize } from "./pack.ts";
export { readCatalogueRecords, type CatalogueRead } from "./omm.ts";
