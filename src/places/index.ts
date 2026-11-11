// Places on the Earth (`@johnmorrisdotca/chikyu-earth/places`): the list a page hands to `<chikyu-earth-realistic>` or `<chikyu-space>` as `places`, and the sums that put each one on the screen. No DOM, no three.js, no dependency.
// The layer the elements draw with is `./host.ts`; this entry is what a page or a test of its own can use by itself.
export { MAX_PLACES, readPlaces, readPlacesAttribute, type Place, type PlaceKind, type PlacesRead } from "./types.ts";
export { PLACE_STYLES, destination, orthographicProjector, putPlaces, type PlaceOnScreen, type PlaceProjector, type PlaceStyle } from "./geometry.ts";
