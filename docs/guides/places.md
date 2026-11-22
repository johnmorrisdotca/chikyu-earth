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
| `places` | `places` | A JSON array of places, each `{ id, lon, lat, label, kind, color }`, and optionally `layer`, `size`, `look` and `namePriority` (below). Setting the property writes the attribute; an empty list takes the attribute away. |
| `place-layers` | `placeLayers` | A JSON object of a layer's name to true or false, such as `{"harbours":false}`: the layers shown and hidden (see "Layers of places"). |
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
- **What it costs.** `stats.places` has `places` (handed over), `hidden` (of those, left out because their layer is off), `shown` (in sight, those in groups counted), `marks` (standing on their own), `labels` (named), `sprites` (rings in the picture's one draw call; 0 when the picture cannot draw them), `dots` (those rings drawn instead as small circles in the page), `groups` (of the rings, the groups), `omitted` (places in sight that had no room) and `renders` (times laid out). Without three.js's `Points` (a subset of three.js that leaves it out) the picture cannot draw the rings, so the element draws them itself as small circles in the page, at most `PLACE_DOTS` (600). Those circles fade at the Earth's edge and are dimmer at night, as the rings in the picture are. Places in sight beyond that room are counted in `omitted`, and the element sends `chikyu-places-unavailable` once when that happens (`detail.reason` says why, `detail.omitted` how many): not merely because `Points` is missing, and not again. No place is left out without a count.

## A press on a place

A press that does not turn the view, on a place's marker (its stick or its foot) or on its ring, sends `chikyu-place-click` with the place's `id` and `kind`, so a page need not read the markers' boxes:

```js no-run
space.addEventListener("chikyu-place-click", (event) => {
  const { id, kind, layer, label, lon, lat, x, y } = event.detail;
  console.log(id, kind, layer, label, lon, lat, x, y);
});
```

- **What it carries.** `id` and `kind` (`here` or `favourite`) always; `layer`, `label`, `lon`, `lat` and `x`, `y` (where the press was, in CSS pixels inside the element). The place is the one the last picture drew: a place whose layer is off, or one on the far side, cannot be pressed, and nothing can be pressed between the list or a switch changing and the next picture.
- **The nearest within 12 pixels.** A press reaches a marker's stick from its foot to its top, and a ring. A group of several places is not a place: it sends nothing. The press is also `chikyu-satellite-click`'s and `chikyu-body-click`'s, as before: the event is added to them, it takes nothing from them, and a satellite's dot is heard first.
- **Nothing at rest.** The element looks for the place when the reader presses, from what the last picture drew, and not otherwise.

## Reaching a place with the keyboard

With `<chikyu-space>` or `<chikyu-earth-realistic>` focused (Tab to it, or a click), `P` goes to the next place in the picture from the left, `Shift`+`P` to the one before, and `Enter` sends the same `chikyu-place-click` as a press, with the place's `id`, `kind` and `label`, and `x`, `y` at the place's foot. `Escape` lets go of the place. The arrow keys, `+`, `-`, `0`, `Home`, `Space` and the ride's `W`, `A`, `S`, `D`, `R`, `F` keep their jobs, and so does `C` for the constellations; `Ctrl`, `Cmd` and `Alt` with a key are left to the browser.

- **Which place it is.** A white ring with a dark edge is drawn on the place the keys are on. It turns with the Earth, so the arrow keys can move the view while a place is chosen. The ring is on the page's own layer, not a new draw: the picture is not drawn again for it.
- **Said aloud.** The element speaks the place's name through a live region of its own: "Osaka, 2 of 5" (`label`, else `id`), and the same in Japanese on a page whose `lang` is Japanese. An element with places is a `group` for a screen reader, not an `img` (a screen reader skips what is inside an image), unless the page set its own `role`. With no place in sight it says "No places in view".
- **What it reaches.** The places a press can reach: markers and rings in sight, not the far side, not a layer that is off. A place inside a crowd's counted ring is reached once the zoom opens the crowd (`+`). The keys start at the first place from the left, or the last with `Shift`+`P`, when none is chosen or the chosen one has left the picture.
- **Letting go.** The place is let go of when focus leaves the element, on `Escape`, and when the page's list no longer has its `id`. `Enter` on a place that has turned out of sight sends nothing and says so.

## A look and a size of each place

A place can be drawn differently from the rest, so a harbour is a short mark beside a city, and "You are here" stays the tall beam:

```js no-run
space.places = [
  { id: "me", lon: -79.4, lat: 43.7, label: "You are here", kind: "here" },
  { id: "cavan", lon: -123.1, lat: 49.29, label: "Vancouver harbour", size: "small", look: "ring" },
];
```

- **`size: "small"`** is a stick about half as long and a ring about 30 per cent smaller than the kind's own. The default is the kind's size.
- **`look`** is `beam`, `pin` or `ring`, and wins over `places-look` for this place. Left out, the place takes `places-look`.

## Layers of places

Give places a `layer` (a name of your own, up to 40 letters) and switch the layers with `place-layers`, so the page hands the list over once instead of building one for every switch:

```js no-run
space.places = [...spaceports.map((p) => ({ ...p, layer: "spaceports" })), ...harbours.map((p) => ({ ...p, layer: "harbours", size: "small" }))];
space.placeLayers = { harbours: false };
space.setPlaceLayer("harbours", true);
```

- **Shown unless switched off.** A place with no layer is always shown, and so is a layer that `place-layers` does not name. Only `false` hides one. `placeLayers` reads the switches back; `setPlaceLayer(name, shown)` changes one and keeps the others.
- **Left out whole.** A place of a layer that is off is not drawn, not named, not gathered into a group and not pressable, and it takes none of the `PLACE_MARKS`. `stats.places.hidden` counts them, and `stats.places.places` is still what was handed over. `readPlaceLayers` and `shownPlaces` are the same rules for a page or a server.
- **No fetching.** The package loads nothing for a layer. A page that fetches a layer's places when its switch goes on hands them over as it likes.

## Names that give way to the cities' names

A place's name is laid before the cities' names, which keep clear of it. A place with `namePriority: "low"` is the other way round: its name is laid after the cities' names, and is left out where a city's name lies, while its marker is still drawn:

```js no-run
space.places = [{ id: "cape-canaveral", lon: -80.58, lat: 28.39, label: "Cape Canaveral", layer: "spaceports", namePriority: "low" }];
```

- **After the cities, before the other names.** The sea and country names, and the stars' names, keep clear of a low-priority name once it is laid, as they keep clear of the others.
- **Cities first.** With `city-names` on, a city's name stays where it would be with no place there; the place's name takes the room that is left, and a name with none is left out. With `city-names` off there is nothing to give way to, and the name is laid as the others are.
- **Still nothing at rest.** The low-priority names are laid in the same picture as the others, and again only when the cities' names change.

## Go to a place

`goToPlace` turns the view so a place is in the middle, at a pace a reader can follow (at once for a reader who asked for less motion). Name the place by its `id` or by its label:

```js no-run
const place = await space.goToPlace("tokyo");
if (!place) console.log("no such place");
```

- **The zoom stays.** Only the turn changes; the page zooms if it wants to.
- **Looking at the Earth.** In the space view the camera must be looking at the Earth: while it rides along or looks at another body, nothing moves and the call resolves `undefined`.
- **The tilt is held to 90 degrees** either way from `center`, as a drag is: a place more than 90 degrees of latitude from `center` comes as near the middle as that allows. Set `center` near the reader's own place.
- **A new place bends the turn.** A `goToPlace` while one is still turning does not stop it and start again: the view keeps the speed and the way it is going and curves smoothly toward the new place (on both elements, and in the space view also into and out of a `flyTo`).

## Fly to a place

In the space view, `flyTo(lat, lon, options)` takes the camera to a place in two parts: **across**, the Earth turns under the camera at the height it has until the place is below (along a great circle), then **down**, a descent to `height` kilometres over it (30 by default: the whole of a city in view, still sharp with the finer 30 m pictures). It resolves once the move has ended:

```js no-run
const space = document.querySelector("chikyu-space");
space.setAttribute("tiles-finer", "gibs");
const end = await space.flyTo(35.69, 139.69, { height: 30 });
console.log(end.reason, Math.round(end.heightKm), end.held); // "arrived" 30 null
```

- **One part at a time.** `phase: "across"` only turns, `phase: "down"` only comes down, and `"both"` (the default) does one after the other, so a page can take a reader there one press at a time.
- **A new move bends the one running.** A `flyTo` or `goToPlace` while one is moving never stops it dead: the camera keeps its speed and the way it is going and curves into the new path, and a descent cut short slows to rest without turning back before the new move goes across. The move taken over resolves `"redirected"`.
- **A hand ends it where it is.** A drag, a pinch, the wheel or a key on the view, or `signal` (an `AbortSignal`), ends it at once, `"stopped"`; so do a ride and the element leaving the page.
- **Where the pictures stop being sharp.** The descent comes all the way down only over land with `tiles-finer` on, from 60 degrees south to 80 degrees north, where the finer pictures are. Over the sea, Antarctica and the far north, or without `tiles-finer`, it stops at 400 km (`FLY_FLOOR_KM`), as low as the package's own pictures stay sharp, and `held` is `"no-finer"`. A `zoom-max` the page set holds it too (`"zoom-max"`). It never goes below 15 km (`FLY_MIN_KM`).
- **The zoom follows it down.** Once a fly-to has come lower than about 320 km, the zoom reaches as low as it came, so a reader can zoom out and back in. The view's own turn (Auto-turn) is paused, so the place stays below.
- **Less motion.** A reader who asked for less motion, `smooth: false`, or a picture that is not live yet goes straight there, height and all.
- **Events and stats.** `chikyu-fly-start` (`{ lon, lat, phase, heightKm, held }`) and `chikyu-fly-end` (what `flyTo` resolves to) are sent; `stats.fly` says whether a move is going and in which part, the height now, what held the last descent and how many moves were taken over. Nothing runs at rest: a move asks for one frame at a time, at the view's own frame cap, and none once it ends.
- **The pure parts.** `planFly`, `flyAt` and `flyStateAt` in `@johnmorrisdotca/chikyu-earth/space` are the move itself, for a test or a page's own camera: the turn and the height are each a quintic that starts with the speed and acceleration the camera has, so the speed and the way it goes are continuous at a change.

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
- **Whose cities.** kuni's capitals, the other cities of a million and the others of 100,000, then the smaller cities of at most two countries (`citiesOf`, one file each, kept and not asked again). The first country is the nearest city of those three tiers, however far it is. The second is added only when another country also has one of them within the limit, which is how a place near a border is read. A town nearer than the big city wins, and only while it is within the limit. Nothing of kuni is loaded until `here-city` is on and a `here` place is set. The name is English, or on a Japanese page the short Japanese name when kuni gives one, otherwise the Japanese name.
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

`@johnmorrisdotca/chikyu-earth/markers` has the pure parts, for a page that draws places itself or on a server: `readPlaces` and `cleanPlaces` (a list made safe to draw), `readPlaceLayers` and `shownPlaces` (the layers' switches and the places they leave), `nearby`, `orthoView` (a picture drawn straight on, from its centre point, radius and box), `layoutPlaces` (where each marker and name go in a picture, from a `PlaceView`, and with `sun` how far into the night each is), `groupPlaces` with `groupCell` (crowded places gathered, for an Earth so many pixels across), and `readHereCity` with `hereCityLabels` (the nearest city's name for a `here` place, from a list that has `nearest`, within a kilometre limit).
