---
title: "Marks from a list your page hands in"
section: how-to
order: 19
description: "Draw a list of your own places on the Earth, such as the site's fireballs: each with a latitude, a longitude, a size in pixels, an optional name and colour. Off until the page sets the list, one draw call however many there are, hidden on the far side of the Earth, a press that tells the page the mark's id, and names that keep clear of the cities' names and the page's own boxes."
---

A page that has a list of places of its own (888 fireballs, each with a latitude, a longitude, an energy and a date) hands it to `<chikyu-space>` or `<chikyu-earth-realistic>` as `places`. There is no other mark layer to learn: the places layer of [the places guide](places.md) already draws a page's list, and this page shows the way to use it for marks the page sizes itself.

```js no-run
const marks = fireballs.map((fireball) => ({
  id: fireball.id,
  lat: fireball.lat,
  lon: fireball.lon,
  size: 2 + 10 * Math.sqrt(fireball.energy / maxEnergy),
  ...(fireball.famous ? { label: fireball.place } : {}),
  color: "#ff6b8a",
}));
space.placeGroups = false;
space.places = marks;
space.addEventListener("chikyu-place-click", (event) => {
  const fireball = byId.get(event.detail.id);
  console.log(fireball.place, fireball.date, fireball.energy);
});
```

- **A mark is `{ id, lat, lon, size, label, color }`.** `id` is yours: it comes back in the press. `size` is the radius of the mark's ring on the ground in CSS pixels, from `MIN_PLACE_RING` (1.5) to `MAX_PLACE_RING` (14); a number outside that is brought into it, and the size does not change with the zoom. The page decides what a size means (an energy, a count); the package only draws it. `label` is the mark's name, `color` is any CSS colour. `size` may also be `"small"`, as in the places guide, and a mark with none is the kind's own size.
- **Off until the page asks.** With no `places` the layer has no mark in the page, lays out nothing and draws nothing (`stats.places.shown` is 0). Set `places = []` to take them away again.
- **One draw call.** The first `PLACE_MARKS` (32) marks in sight stand up with their names: `here` first, then the marks that have a `label`, even when they come late in the list, then the rest in the order given. Every other mark is a ring lying on the ground, all of them in the picture's one draw call, however many there are. `places-look="ring"` (or `look: "ring"` on a mark) makes the standing marks plain rings too, so every mark looks alike.
- **Crowds.** By default marks closer than about 24 pixels are gathered into one larger ring with their count, and come apart as the Earth is zoomed. A page that wants each mark kept on its own sets `placeGroups = false` (the attribute `place-groups="off"`). A group of several is not a mark: pressing it tells the page nothing.
- **Not behind the Earth.** A mark on the far side is not drawn, not named, not counted in `stats.places.shown` and cannot be pressed. It fades near the edge and is dimmer on the night side.
- **A press tells the id.** `chikyu-place-click` carries `detail: { id, kind, label?, layer?, lon, lat, x, y }` for the mark under the press (the nearest within 12 pixels), a ring or a standing mark; the page looks up the rest (the energy, the date) by `id`. The keyboard reaches the marks too: `P`, `Shift`+`P` and `Enter`.
- **Names keep clear.** A mark's name is laid out before the cities' names, which keep clear of it, and it keeps clear of the other marks' names, the bodies' names in the space view and the boxes of `keepOut`: the page's bar or card laid over the picture. A name that finds no room is left out; its mark is still drawn and can still be pressed.
- **Showing and hiding a set.** Give the marks a `layer` (`"fireballs"`) and switch it with `placeLayers = { fireballs: false }`: the list is handed over once.
- **Nothing at rest.** The marks are laid out when the picture is drawn, and not otherwise; `stats.places.renders` does not move while the page is still. At most `MAX_PLACES` (5,000) marks are kept; one outside -180 to 180 or -90 to 90 is left out.

## On `<chikyu-earth>`

The line globe has no `places`. It has the canvas marker layer `attachMarkers(earth)` of [the realistic guide](realistic-and-markers.md), which takes `{ id, lon, lat, size (4 to 32 pixels across), label, color, icon, group }`, gathers crowds into clusters, and sends `chikyu-marker-click`. It works on `<chikyu-earth-realistic>` as well.

## What the page needs to do

Map the data to the list above, choose each size (a square root of an energy keeps a huge fireball from hiding the rest), name only the few that deserve it, listen for `chikyu-place-click`, and show its own card from the `id`. The package keeps no list of its own and sends nothing anywhere.
