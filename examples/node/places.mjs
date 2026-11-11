import { orthographicProjector, putPlaces, readPlaces } from "@johnmorrisdotca/chikyu-earth/places";

// The list a page hands to the Earth: each place is checked and copied, and one that cannot be drawn is left out and counted.
const read = readPlaces([
  { id: "here", lat: 35.68, lon: 139.69, label: "Tokyo", kind: "here" },
  { id: "lima", lat: -12.05, lon: -77.04, label: "Lima" },
  { id: "bad", lat: 120, lon: 0 },
]);
console.log(`${read.places.length} places, ${read.skipped} left out`);

// Where they fall when the view is centred on Tokyo: Tokyo faces the viewer, Lima is on the far side and is not drawn.
const view = orthographicProjector({ lon: 139.69, lat: 35.68, radius: 200, cx: 210, cy: 210 }, 420, 420);
for (const mark of putPlaces(read.places, view)) console.log(`${mark.place.label}: ${mark.facing ? "drawn" : "far side"}`);
