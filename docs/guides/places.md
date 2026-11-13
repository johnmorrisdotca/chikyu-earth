---
title: "You are here, and places on the Earth"
section: how-to
order: 19
description: "Mark the reader's own place and any number of favourite places on the space view or the realistic Earth: a beam, a pin or a ring standing out of the ground, turning with the Earth, hidden on its far side and dimmer at night, with names that never overlap, thousands in one draw call, crowds gathered with their count, and goToPlace to turn to one. The page asks for the reader's place; the package stores nothing and sends nothing."
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
| `places` | `places` | A JSON array of places, each `{ id, lon, lat, label, kind, color }`. Setting the property writes the attribute; an empty list takes the attribute away. |
| `places-look` | `placesLook` | `beam` (the default): a light rising out of the ground with a ring at its foot. `pin`: a thin stick with a round head. `ring`: only the ring on the ground. |
| `here-city` | `hereCity` | Off by default (`false`). Set the attribute, or `on`, to name each `here` place with the nearest city within 100 km. A number is that limit in kilometres. `false` on the property turns it off. |

- **Kinds.** `kind: "here"` is the reader's own place: taller, brighter and with a quiet pulse round its foot. Any other place is a `favourite`: shorter, thinner and still. Colours come from `--chikyu-place-here` and `--chikyu-place-favourite` on the element or the page.
- **A colour of its own.** `color` gives one place its own colour: a hex colour (`#e8475f`), `rgb()` or `hsl()` with numbers, or a colour's name. Anything else is left out and the kind's colour is used.
- **Standing out of the ground.** The marker stands up from the ground as the picture sees it, so near the edge of the Earth it leans out sideways and its ring is seen almost edge on. Where the reader looks straight down on it, it leans towards the top of the screen instead of shrinking to a dot.
- **Names.** A place's `label` is shown at the top of its marker when there is room, `here` first and then in the order given. Names never overlap one another or the names of the bodies in the space view; a name with no free place is left out, and the marker is still drawn. The places come first among the names of the layers: the markers' labels, the cities' names, the stars' and the constellations' names all keep clear of a place's name, its marker and a ringed satellite, and never the other way round (see "The order of the layers" in the sky names guide). Names are measured in the page's own font.
- **Dimmer at night.** A place on the Earth's night side is drawn at half strength, and its name a little dimmer, so it can still be read; the twilight is between. With `light="lit"` the whole Earth is lit and nothing is dimmed.
- **Nothing at rest.** The places are laid out when the picture is drawn (the camera moved, the clock stepped, a setting changed) and not otherwise. The pulse is a CSS animation: it never draws the picture again, it stops while the element is out of sight, and a reader who asked for less motion gets none.
- **At most 5,000.** A longer list is cut to `MAX_PLACES`. A place with a longitude outside -180 to 180 or a latitude outside -90 to 90 is left out.

## Many places

A page can hand over thousands of places, and they stay cheap:

```js no-run
const places = shops.map((shop) => ({ id: shop.id, lon: shop.lon, lat: shop.lat, label: shop.name, color: shop.open ? "#7dd3fc" : "#94a3b8" }));
space.places = [...(here ? [here] : []), ...places];
```

- **Markers of their own for the first few.** The first `PLACE_MARKS` (32) places in sight, `here` first and then in the order given, stand up out of the ground with their names. Put the places that matter most first.
- **One draw call for the rest.** Every other place is a ring lying on the ground, all of them drawn together in one draw call, however many there are. The rings keep their size in pixels, turn with the Earth, fade at its edge, are left out on its far side and are dimmer on its night side, as the markers are.
- **Crowds are gathered.** Places closer than about `PLACE_GROUP_PX` (24) pixels on the screen become one larger ring with their count beside it. The ground is cut into cells fixed to it, so the groups turn with the Earth and change only when the zoom changes by about half or double. Zoom in and they come apart. The reader's own place is never gathered. `groupPlaces` and `groupCell` are the same rule for a page or a server. Gathering is on by default; `place-groups="off"` (or `placeGroups = false`) leaves every place its own ring.
- **What it costs.** `stats.places` has `places` (handed over), `shown` (in sight, those in groups counted), `marks` (standing on their own), `labels` (named), `sprites` (rings in the picture's one draw call; 0 when the picture cannot draw them), `dots` (those rings drawn instead as small circles in the page), `groups` (of the rings, the groups), `omitted` (places in sight that had no room) and `renders` (times laid out). Without three.js's `Points` (a subset of three.js that leaves it out) the picture cannot draw the rings, so the element draws them itself as small circles in the page, at most `PLACE_DOTS` (600). Those circles fade at the Earth's edge and are dimmer at night, as the rings in the picture are. Places in sight beyond that room are counted in `omitted`, and the element sends `chikyu-places-unavailable` once when that happens (`detail.reason` says why, `detail.omitted` how many): not merely because `Points` is missing, and not again. No place is left out without a count.

## Go to a place

`goToPlace` turns the view so a place is in the middle, at a pace a reader can follow (at once for a reader who asked for less motion). Name the place by its `id` or by its label:

```js no-run
const place = await space.goToPlace("tokyo");
if (!place) console.log("no such place");
```

- **The zoom stays.** Only the turn changes; the page zooms if it wants to.
- **Looking at the Earth.** In the space view the camera must be looking at the Earth: while it rides along or looks at another body, nothing moves and the call resolves `undefined`.
- **The tilt is held to 90 degrees** either way from `center`, as a drag is: a place more than 90 degrees of latitude from `center` comes as near the middle as that allows. Set `center` near the reader's own place.

## The reader's own place

The package never asks the browser where the reader is. The page does, and only when the reader asks for it:

```js no-run
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

## The nearest city's name

`here-city` names each `kind: "here"` marker with the nearest city, in the page's language. It is off by default, and nothing of kuni is loaded until it is on and a `here` place is set.

```html
<chikyu-earth-realistic here-city places='[{"id":"me","lon":139.69,"lat":35.69,"kind":"here","label":"You are here"}]'></chikyu-earth-realistic>
```

- **Off unless asked.** The default is off (`hereCity` is `false`). A favourite is never renamed.
- **How far.** A bare attribute, or `on`, uses 100 km (`HERE_CITY_KM`). `here-city="40"` looks only within 40 km. The furthest it accepts is 20,000 km (`HERE_CITY_MAX_KM`). A city further than the limit is not used, and the place's own `label` stays.
- **Whose cities.** kuni's `loadCities("capitals", "1m", "100k")`, an optional peer. A city of fewer than 100,000 people is not in that list, so a smaller town keeps the page's label. The name is English, or on a Japanese page the short Japanese name when kuni gives one, otherwise the Japanese name. kuni 1.6.1 gives no short form, so Tokyo is written `東京都` and Osaka `大阪市`.
- **The page's list is unchanged.** `places` still has the label the page set. Only the drawn name changes. `goToPlace` still finds the place by that label or by its id.
- **Nothing at rest.** The name is worked out when the places, the language or the limit changes, and once when the cities arrive. It is not worked out again while the picture is still.

## Favourite places

A favourite is any place without `kind: "here"`. The package has no list of its own and no picker: the page builds the reader's list (from a search of its own, or kuni's cities) and keeps it wherever it likes, then hands the whole list over each time it changes:

```js no-run
const saved = [{ id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo" }, { id: "cairo", lon: 31.24, lat: 30.04, label: "Cairo" }];
space.places = [...(here ? [here] : []), ...saved];
```

- **Where the list lives is the page's choice.** A site with accounts keeps it in the reader's account; the demo keeps the cities chosen in its own address (`fav=Tokyo,Cairo`), so a link opens with them. The reader's own place is never put there.
- **Quieter than here.** Favourites are shorter, thinner and still, so the reader's own place stands out among them. Their names give way to `here` when they crowd.

## The parts without a browser

`@johnmorrisdotca/chikyu-earth/markers` has the pure parts, for a page that draws places itself or on a server: `readPlaces` and `cleanPlaces` (a list made safe to draw), `nearby`, `orthoView` (a picture drawn straight on, from its centre point, radius and box), `layoutPlaces` (where each marker and name go in a picture, from a `PlaceView`, and with `sun` how far into the night each is), `groupPlaces` with `groupCell` (crowded places gathered, for an Earth so many pixels across), and `readHereCity` with `hereCityLabels` (the nearest city's name for a `here` place, from a list that has `nearest`, within a kilometre limit).
