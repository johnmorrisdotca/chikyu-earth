---
title: "Places on the Earth"
section: how-to
order: 16
description: "Hand the realistic Earth or the space view a list of places and each one stands out of the Earth as a ring, a beam and a head with its name beside it, the visitor's own place standing out and the others quieter, names that never overlap, nothing drawn at rest. The package never asks where anyone is and stores nothing."
---

A page can mark places on the Earth: the visitor's own place, favourite cities, anywhere. `<chikyu-earth-realistic>` and `<chikyu-space>` take a `places` list and draw each place as a thin beam standing out of the surface with a ring at its foot and a small bright head, turning with the Earth and hidden on the far side, with its name beside it.

The package only draws. It never asks where anyone is (a page that wants the visitor's place asks the visitor itself, with the browser's own prompt, and decides what to keep), it stores nothing and it calls no server.

## The list

```html
<chikyu-earth-realistic id="earth" center="139.69,35.68" camera="ground" style="width: 420px"></chikyu-earth-realistic>
<script type="module">
  import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/realistic/element/+esm";
  const earth = document.querySelector("#earth");
  earth.places = [
    { id: "here", lat: 35.68, lon: 139.69, label: "Tokyo", kind: "here" },
    { id: "seoul", lat: 37.57, lon: 126.98, label: "Seoul" },
  ];
  earth.addEventListener("chikyu-place-click", (event) => console.log("pressed", event.detail.place.id));
</script>
```

- **`id`** is the page's own name for the place: the click reports it. **`lat`** and **`lon`** are degrees (a longitude outside -180 to 180 is brought in). **`label`** is the name drawn (up to 60 characters). **`kind`** is `here` for the visitor's own place, which stands out and pulses quietly, or anything else for a favourite, which is smaller, softer and does not pulse.
- The same list is the attribute `places` as JSON: `places='[{"id":"tokyo","lat":35.68,"lon":139.69,"label":"Tokyo"}]'`. Setting the property replaces the whole list; the attribute and the property are one list, and the last one set wins.
- A place that cannot be drawn is left out and counted, never thrown at the page: no id (or an id already used), a latitude or longitude that is not a number, a latitude over 90 degrees. At most 200 places are kept. The page's own objects are copied, never kept or changed.
- A place on the far side is not drawn. The beam is a number of pixels tall, not a share of the Earth, so it reads at any zoom; seen end on (a place in the middle of the disc) it is short on the screen, as a pin seen end on is. None are drawn in the space view while the Earth is under 14 pixels in radius or the view rides along a body.

## Names never overlap

Each name is a real button beside its place: to the right of it if it fits, else to the left, above, below, and when none of the four is free the lesser place's name is left out. The visitor's own place is placed first, then the favourites in the order given. A name never covers another name, and every place has its name in a list for a screen reader whether it is drawn or not. A name pressed with the keyboard or a pointer sends `chikyu-place-click` with `detail: { place }`; with the attribute `places-turn` the view also turns to that place (`places-turn="off"` is the same as leaving it out).

## Saving the list

The package keeps nothing, so a page that saves the places (in its own account, in the address, wherever) hears about every change: `chikyu-places-change` is sent with `detail: { places }`, the whole list as the element now has it (a copy, with the entries that could not be drawn already left out). It is sent when the property is set, or the attribute changes, to a list that is not the one the element has; the same list again, or a first empty one, says nothing.

```js no-run
earth.addEventListener("chikyu-places-change", (event) => localStorage.setItem("places", JSON.stringify(event.detail.places)));
```

## Nothing at rest

The marks are drawn when the view changes or the list does. The one thing that moves by itself is the pulse of the visitor's own place: it pulses while the view moves, and for about two seconds after the place is added or changed (about twenty times a second), and then rests, so a view at rest draws nothing. It runs only while the Earth is in view, the tab is shown and the reader has not asked for less motion: for a reader who prefers reduced motion the marks are drawn still. `stats.places` has the counts (`places`, `facing`, `labels`, `renders`, `pulsing`).

## By themselves

`@johnmorrisdotca/chikyu-earth/places` has no DOM and no three.js: the list's checks (`readPlaces`, `readPlacesAttribute`) and the sums that put places on the screen (`orthographicProjector`, `putPlaces`, `destination`), for a page that draws its own.

```js
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
```
