import "@johnmorrisdotca/chikyu-earth/space/element";
import type { PlaceClickDetail } from "@johnmorrisdotca/chikyu-earth/markers";

const space = document.querySelector("chikyu-space")!;
space.places = [
  { id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo" },
  { id: "me", lon: -79.4, lat: 43.7, label: "You are here", kind: "here" },
];
// A press or a tap on a place's marker says which place (not a drag, and not a place hidden by the Earth or gathered into a group).
space.addEventListener("chikyu-place-click", (event) => {
  const { place, pointer } = (event as CustomEvent<PlaceClickDetail>).detail;
  console.log(`${place.label ?? place.id} pressed with a ${pointer}`);
});
