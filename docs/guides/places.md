---
title: "You are here, and places on the Earth"
section: how-to
order: 19
description: "Mark the reader's own place and their favourite places on the space view or the realistic Earth: a beam, a pin or a ring standing out of the ground, turning with the Earth, hidden on its far side, with names that never overlap. The page asks for the reader's place; the package stores nothing and sends nothing."
---

`<chikyu-space>` and `<chikyu-earth-realistic>` can mark places on the Earth: where the reader is, and places they keep. Each place stands out of the ground as a small marker that turns with the Earth, is hidden when it goes round to the far side, and keeps its size in pixels at any zoom.

```html
<chikyu-space
  places='[{"id":"me","lon":-79.4,"lat":43.7,"label":"You are here","kind":"here"},{"id":"tokyo","lon":139.69,"lat":35.69,"label":"Tokyo"}]'
  places-look="beam"
  style="width: 420px"
></chikyu-space>
```

| Attribute | Property | Means |
|---|---|---|
| `places` | `places` | A JSON array of places, each `{ id, lon, lat, label, kind }`. Setting the property writes the attribute; an empty list takes the attribute away. |
| `places-look` | `placesLook` | `beam` (the default): a light rising out of the ground with a ring at its foot. `pin`: a thin stick with a round head. `ring`: only the ring on the ground. |

- **Kinds.** `kind: "here"` is the reader's own place: taller, brighter and with a quiet pulse round its foot. Any other place is a `favourite`: shorter, thinner and still. Colours come from `--chikyu-place-here` and `--chikyu-place-favourite` on the element or the page.
- **Standing out of the ground.** The marker stands up from the ground as the picture sees it, so near the edge of the Earth it leans out sideways and its ring is seen almost edge on. Where the reader looks straight down on it, it leans towards the top of the screen instead of shrinking to a dot.
- **Names.** A place's `label` is shown at the top of its marker when there is room, `here` first and then in the order given. Names never overlap one another or the names of the bodies in the space view; a name with no free place is left out, and the marker is still drawn. Names are measured in the page's own font.
- **Nothing at rest.** The places are laid out when the picture is drawn (the camera moved, the clock stepped, a setting changed) and not otherwise. The pulse is a CSS animation: it never draws the picture again, it stops while the element is out of sight, and a reader who asked for less motion gets none. `stats.places` has `places`, `shown`, `labels` and `renders`.
- **At most 200.** A longer list is cut to `MAX_PLACES`. A place with a longitude outside -180 to 180 or a latitude outside -90 to 90 is left out.

## The reader's own place

The package never asks the browser where the reader is. The page does, and only when the reader asks for it:

```js
import { nearby } from "@johnmorrisdotca/chikyu-earth/markers";

const space = document.querySelector("chikyu-space");
document.querySelector("#here").addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition((position) => {
    const at = nearby({ lon: position.coords.longitude, lat: position.coords.latitude });
    space.places = [{ id: "here", lon: at.lon, lat: at.lat, label: "You are here", kind: "here" }];
  });
});
```

- **Ask on a press.** Call `getCurrentPosition` from the reader's own click, so the browser's question comes after they asked for it. Offer a way to take it away again (`space.places = []`).
- **Round it.** `nearby(point, km)` puts a place on a grid about `km` kilometres across (10 by default), so the marker never shows a street. Round before you draw it or keep it.
- **Keep it on the device.** The element stores nothing and sends nothing. Do not put the reader's place in the page's address or send it to a server unless they choose to share it. The demo keeps it only in the open page: it is gone when the page is closed.

## The parts without a browser

`@johnmorrisdotca/chikyu-earth/markers` has the pure parts, for a page that draws places itself or on a server: `readPlaces` and `cleanPlaces` (a list made safe to draw), `nearby`, `orthoView` (a picture drawn straight on, from its centre point, radius and box) and `layoutPlaces` (where each marker and name go in a picture, from a `PlaceView`).
