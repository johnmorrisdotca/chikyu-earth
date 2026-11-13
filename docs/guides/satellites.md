---
title: Satellites on the globe
section: how-to
order: 8
description: Show the ISS, the space stations or thousands of Starlink satellites on the space view from orbital elements your page supplies, with the rules for getting them and the budget that keeps it light.
---

`<chikyu-space>` can draw satellites at the places SGP4 puts them for the date and time shown, with their orbits, and tell a reader about the one they press. It is optional and costs nothing unless you import it.

**The package fetches nothing and ships no orbital data.** Your page gets the orbital elements and passes them in. That keeps every question about who may be asked for data, how often, and what to credit, on the page that asks.

## Install

```sh
npm install @johnmorrisdotca/chikyu-earth three @johnmorrisdotca/kazoku-ui astronomy-engine satellite.js
```

`three`, `@johnmorrisdotca/kazoku-ui`, `astronomy-engine` and `satellite.js` ([MIT](https://github.com/shashwatak/satellite-js); use version 6, which is plain JavaScript of 10 KB gzipped) are optional peers: only the space view and `/satellites` use them.

## Getting orbital elements

The format is the "GP" JSON that [CelesTrak](https://celestrak.org) serves, one object for each satellite (`ElementSet` has the fields that are read). Read CelesTrak's [usage policy](https://celestrak.org/usage-policy.php) before you fetch, and credit it on your page. In short, on 3 November 2026:

- The data change every two hours at most. Ask for a list once for each update, not once for each visitor: fetch on a schedule or on your server, keep the answer, and serve your copy.
- Stop on any answer that is not 200. More than 50 errors in two hours puts your address in CelesTrak's firewall.
- A group such as Starlink is a subset of the full list: fetch one of them, not both.
- [Space-Track](https://www.space-track.org) serves the same elements to approved accounts. It needs a login, which a page cannot hold; its user agreement lets basic data (TLEs and OMMs) be passed on with a citation. The demo site's scheduled build uses it as a second source when CelesTrak has left a group stale, and credits it ("Data from Space-Track.org (USSPACECOM)"). [SatNOGS DB](https://db.satnogs.org) has an open licence (CC BY-SA 4.0) but no cross-origin header, so a browser cannot ask it directly.
- [docs/satellite-sources.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellite-sources.md) has every source's terms, quoted, with where each may go: your visitor's browser, a snapshot on your site, or a package.

Elements go stale: SGP4's error grows by a few kilometres a day. A satellite whose elements are more than 14 days from the moment shown (`dimAfterDays`) is still placed but flagged in `group.dimmed` so that it is drawn dimmer, one more than 30 days away (`maxAgeDays`) is left out, and `info(index, ms).ageDays` tells you how old they are. The demo's site refreshes its files from fourteen of CelesTrak's lists every six hours with a scheduled build (every fifth Starlink satellite, all the others whole), credited on its page; it shows how long ago they were downloaded, each satellite's age, and why a dimmer one is dimmer. Nothing runs when someone looks: they read files.

## Show them

The page, with the space view:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Satellites on the Earth from space</title>
  </head>
  <body>
    <chikyu-space center="-100,40" time="2026-11-02T12:00Z" speed="0" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

And its script. `createSatellites` starts SGP4 for each element set and lists any it could not use in `refused`; `setSatellites` puts the group on the view:

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// Your page gets the elements (CelesTrak's JSON, within its usage policy) and passes them in; this is one downloaded element set.
const iss: ElementSet = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-02T10:25:21.580320",
  MEAN_MOTION: 15.49150046,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: 20.6961,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
};

const space = document.querySelector("chikyu-space")!;
space.setSatellites("stations", createSatellites([iss]), { color: "#ffd54f", size: 6, orbits: true });
space.addEventListener("chikyu-satellite-click", (event) => console.log((event as CustomEvent).detail.info?.name));
```

A group is **one draw call** however many satellites it holds. Name each group (`"stations"`, `"starlink"`): `showSatellites(name, false)` hides one, `setSatellites(name, null)` takes it away and frees what it held. `orbits: true` draws every orbit of a group of 40 or fewer.

## One group at a time

`focusSatelliteGroup(name, options)` on `<chikyu-space>` and `<chikyu-earth-realistic>` shows one group that `setSatellites` has already set, and deals with the others. `options.others` is `"dim"` (the default: the others stay drawn, through the same dimming an old element set already uses, so they read as dimmer at a glance) or `"hide"` (they are not drawn). `options.frame` is true by default: the camera pulls back, by the view's own zoom, until the group's orbits fit. The distance is the greatest apogee of the group, from each satellite's mean motion and eccentricity (one revolution a day is 6.62 Earth radii), and it stops at 8 Earth radii so one satellite that swings far out does not shrink the Earth. `frame: false` leaves the camera where it is. `null` puts each group back to the shown or hidden state it had, and puts the camera back when the focus had moved it. A ride is left, because the camera has to look at the Earth to see the shell; clearing the focus restores the zoom and does not start the ride again.

`focusedSatelliteGroup` is the name, or `null`. `satelliteGroups` keeps `count` and adds `emphasis` (`"focus"`, `"dim"`, `"hidden"` or `"plain"`) and `placed` (how many of that group the last draw placed). A group that has not been set is refused: the call returns `{ ok: false, reason: "not-set" }` and changes nothing. It does not throw. A group that is set returns `{ ok: true, group, count }`. When the choice changes, `chikyu-satellite-focus` is sent with `{ group, count }`.

The focused group is drawn even if `showSatellites` had hidden it, and the choice never dims it (a satellite whose elements are old is still drawn dimmer, as before). Dimming adds nothing: it is the dim value the dots already carry. Nothing is drawn at rest.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector("chikyu-space")!;
space.addEventListener("chikyu-satellite-focus", (event) => console.log((event as CustomEvent).detail.group, (event as CustomEvent).detail.count));
const answer = space.focusSatelliteGroup("gps", { others: "dim" });
console.log(answer.ok, space.focusedSatelliteGroup);
space.focusSatelliteGroup(null);
```

## Ring and name a whole group

`space.labelSatellites("stations")` rings every member of a group and writes its name beside it, for a small group such as the stations. The names are in the page's language (`ISS`, `Tiangong` or `天宮`, `Hubble` or `ハッブル`; any other satellite under the name in its elements, or as `space.satelliteNames = { 25544: "Space Station" }` says). They are laid out after the names of `places` and never over them, a body's name or one another: each name goes to the right of its ring if it fits, else left, above, below, and one with no free place is left out. Only satellites that are in the picture and not behind the Earth are ringed, at most 80 over all the groups, and nothing is drawn at rest. `space.labelSatellites("stations", false)` stops; `space.labelledSatellites` lists the groups.

`space.placeSatellite({ group: "stations", index })` says where a satellite is on the screen as of the last draw: `{ x, y, visible, heightKm, edge, behind, occluded }` in CSS pixels from the view's top left. `visible` means inside the box, in front of the camera and not behind the Earth. `edge` is `"top"`, `"right"`, `"bottom"` or `"left"` when the place lies beyond that side of the picture, and `null` when it is inside; `behind` is true when the satellite is behind the camera. `occluded` is true when the Earth hides it: the line from the camera meets the globe before the satellite. It is false for a satellite in front, false at the limb (the line only grazes the globe), and false when the satellite is only behind the camera. `x` and `y` may lie outside the box. `null` only when its group is not shown or it cannot be placed. It is the picture's own camera maths and its own test for the Earth in the way, so a page that draws its own rings, or a mark on the edge for one that is out of the picture, need not repeat either. The package's own names, the stations included, are drawn at 45 percent opacity with no ring while `occluded` is true, and they come back as the satellite comes out. `dim-occluded="off"` (the property `dimOccluded`, on when the attribute is absent) leaves those names out. `chikyu-satellite-visibility` is sent with `detail: { ref, visible }` when a ringed satellite comes into view or goes out of it, not at every frame. `visible` there is still "in the picture and not hidden", so a dimmed name is not reported as in view.

`space.ringSatellites(refs)` rings and names the satellites you pass. The list is kept. One that is outside the picture has no ring yet: the ring is drawn on the first later draw in which it is in the picture (a turn of the view, a change of zoom), and nothing is drawn at rest just to wait for it.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector("chikyu-space")!;
space.labelSatellites("stations");
space.addEventListener("chikyu-satellite-visibility", (event) => console.log((event as CustomEvent).detail.ref.index, (event as CustomEvent).detail.visible));
console.log(space.placeSatellite({ group: "stations", index: 0 })); // { x, y, visible, heightKm } or null
```

## Choosing one

A press on a satellite (not a drag that turns the view, and not one behind the Earth) fires `chikyu-satellite-click` with `{ group, index, info }`; `info` has its name, NORAD number, the age of its elements, its height, speed and period, and `ownerCountry`, the owner's country as an ISO 3166-1 alpha-2 code (`CN`, `US`, `PK`), when the elements carry an owner code (`COUNTRY_CODE` or `OWNER`) and the owner is one country. An organisation (ESA, the ISS, Intelsat, SES), several countries, an unknown owner or a code the list does not give to one country (including `CIS`, the former Soviet registration) has none, and the field is left off. `ownerCountry(code)` and `OWNER_COUNTRIES` answer the same for any code. The package draws no flag. `selectSatellite({ group, index })` marks one from code (a ring, its orbit and its name beside it), and `satelliteInfo(ref)` tells you about it. A page with a search box or a list of names uses those two, so a keyboard reader can choose too.

## The orbit under the pointer

When the pointer rests on a satellite, its name is shown and its orbit is drawn faintly: about a third of the brightness of a chosen satellite's orbit, so the two are told apart at a glance. It is one pixel wide, thinner than the chosen satellite's orbit (2 px), and the lower brightness makes it read fainter still. The faint orbit goes when the pointer leaves, after a short fade (at once when the reader asks for reduced motion). One faint orbit at a time. A touch does not rest, so nothing new is drawn.

`hover-path` is on where satellites are shown and `names-on-hover` is on. `hover-path="off"` turns the faint orbit off. `names-on-hover="off"` turns the name off, and the faint orbit with it unless `hover-path` is set on its own. The colour and the opacity are `--chikyu-hover-path` and `--chikyu-hover-path-opacity` on the element. The path is worked out once from the elements already loaded, and nothing is drawn while the pointer is still and no satellite is under it.

## Paths of your own

A page can draw orbits for itself: a reader's favourite satellites, the one a search found, the one the pointer is on. The package draws each in a look from a small table, in **one draw call for all of them**, and nothing at rest.

- **`setPaths(list)`** (the property `paths`) takes up to 16 paths, `{ id, style }`: `id` is a NORAD catalogue number or `group:index` (`stations:0`), `style` the name of a look or a partial look `{ color, width, opacity, dash }`. A longer list keeps its last 16, the most recent; `stats.paths.dropped` counts the rest. An id that matches no satellite is skipped (`stats.paths.unresolved`). `[]` takes them all away.
- **`setPathStyles(table)`** (the property `pathStyles` is the whole table in use) changes the looks by name. The built-in ones differ by width and dash as well as colour, so they are told apart without it: `selected` (white, 2 px, solid), `hovered` (white, 1.5 px, long dashes), `favourite` (amber, 1.75 px, short dashes) and `path` (white, 1.5 px, solid, the look of a path that names none). Your entry is laid over the built-in one of its name; `null` takes it away. A look is `{ color: any CSS colour, width: 0.5 to 8 CSS pixels, opacity: 0 to 1, dash: [dash, gap] in CSS pixels, or null for solid }`. A dash is measured along the orbit at the Earth's drawn size, so it grows and shrinks with the Earth.
- **`selected-path="off"`** (the property `selectedPath`) stops the package drawing the chosen satellite's own orbit: the ring and the name stay, and a ride still follows it. The line, when it is drawn, has the `selected` look of the table, so a page that only wants another colour or width sets that entry and leaves the attribute alone. The chosen orbit is now 2 px wide, the width of the `selected` look; before it was 1 px.
- In a ride from a satellite, that satellite's own orbit is drawn in the `selected` look too (unless `selected-path="off"`).

### Which path is under the pointer

`path-hit` (the property `pathHit`) is how near the pointer must be, in CSS pixels, 8 when left out and 0 to 40; `off` or 0 turns the test off. A touch has twice that reach, and at least 16. The test covers your paths and the chosen satellite's own orbit, never the stretch of an orbit the Earth hides. In a ride it is off unless the attribute is set.

- `chikyu-path-hover` is sent when a mouse comes onto a path, moves to another and leaves (`detail` is `null` then). A touch sends none: it does not rest.
- `chikyu-path-click` is sent for a press or a tap that is not a drag. Both have `detail: { id, ref, style, x, y, distancePx, pointer }`: `id` as you gave it, `ref` the satellite as `{ group, index }`, the same as in `chikyu-satellite-click`, so no lookup is needed; `style` the look's name (`custom` for one given in the request), `x` and `y` the nearest point on the path in CSS pixels in the element, and `pointer` `mouse`, `pen` or `touch`.
- `pathAt(x, y, radiusPx?)` answers the same question for a point of your own (`null` when none is within reach).
- **One press, one meaning**, in this order: a satellite's dot (`chikyu-satellite-click`), then a path (`chikyu-path-click`), then the sky (`chikyu-sky-pick`). A press on a path that runs under a dot is the dot's; a press on a path that crosses a star is the path's, and the star hears nothing.

`stats.paths` says what is drawn: `{ requested, drawn, dropped, unresolved, selectedDrawn, draws, hover, hits }`. `draws` is 0 or 1, never more: the paths and the chosen orbit share a draw call. The page's example, the page first:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Orbit paths on the Earth from space</title>
  </head>
  <body>
    <chikyu-space center="-100,40" time="2026-11-02T12:00Z" speed="0" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

And its script. The chosen satellite's own line is left out, the page draws that satellite's orbit as a favourite in its own look, and a press on it is told:

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// Your page gets the elements (CelesTrak's JSON, within its usage policy) and passes them in; this is one downloaded element set.
const iss: ElementSet = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-02T10:25:21.580320",
  MEAN_MOTION: 15.49150046,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: 20.6961,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
};

const space = document.querySelector("chikyu-space")!;
space.setSatellites("stations", createSatellites([iss]), { color: "#ffd54f", size: 6 });
// The package draws no orbit line for the chosen satellite: the page draws it, in a look of its own, with the other paths.
space.selectedPath = false;
space.selectSatellite({ group: "stations", index: 0 });
space.setPathStyles({ favourite: { color: "#7fdbff", width: 3, dash: [8, 5] } });
space.setPaths([{ id: 25544, style: "favourite" }]);
// A press or a mouse resting within 8 px of a path says which one, with the same ref as a click on the satellite.
space.addEventListener("chikyu-path-click", (event) => console.log((event as CustomEvent).detail.id, (event as CustomEvent).detail.ref));
space.addEventListener("chikyu-path-hover", (event) => console.log((event as CustomEvent).detail?.style ?? "off the path"));
console.log(space.pathAt(10, 10)); // { id, ref, style, x, y, distancePx, pointer } or null
```

## Far from today: an estimate

A satellite is left out when the moment shown is more than 30 days (`maxAgeDays`) from its element set, because SGP4 has nothing true to say that far from the day the elements were taken. A page that scrubs the clock to next year, or back to last, sees the satellites go. **`estimate-far`** (the property `estimateFar`, or `createSatellites(sets, { estimateFar: true })`; off by default, so nothing changes unless you ask) keeps them: the same element set is carried forward or back by the same SGP4 code, and each satellite is drawn **lighter** than a dimmed one.

**What the estimate is.** It is where the satellite would be if its orbit had not changed since the elements were taken. Nothing more. It is worst where orbits change fastest: **a low orbit** (air drag shortens and slows it within days, and operators move their satellites with manoeuvres, so after weeks the estimate can be a long way along the orbit from the truth), and **a long time away** (months). A high orbit changes slowly and stays close for months. A satellite that has re-entered is not there at all. Say so on the page ("estimated"), and do not use an estimate for anything that has to be right, such as when a satellite will pass over a place.

- Each estimated satellite is `estimated: true` in `placeSatellite`, in `satelliteInfo` (with `estimatedDays`) and in the details of `chikyu-satellite-click` and `chikyu-satellite-visibility`, where `estimatedDays` is how far the moment shown is from its elements' own, in days, whichever way: a card can say "estimated, 36 days from its last tracking". `stats.satellites.estimated` is how many of those placed in the last draw are estimates. A satellite inside the 30 days is placed as ever and is not an estimate.
- Never before its launch or after its decay: when an element set carries `LAUNCH_DATE` and `DECAY_DATE` (CelesTrak's satellite catalogue writes them; `parseElements` keeps them) a satellite is not placed before the first or after the last day of the second. Without a launch date, the year in the international designator (`1998-067A`) is the earliest.
- When SGP4 cannot carry the elements that far, or brings the satellite down below about 120 km, it is left out and is not counted as placed: an estimate is never drawn inside the Earth or in the air it would have burned up in. Carried 400 days on, a low Starlink satellite is usually gone for this reason.
- Turning it on or off places every group again at the next draw, and nothing is drawn at rest. It applies to every group on the element, whether the page made the group with the option or not.

The page, with `estimate-far` set and a moment 43 days after the elements:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>A satellite far from its elements, as an estimate</title>
  </head>
  <body>
    <chikyu-space center="-100,40" time="2026-12-15T12:00Z" speed="0" estimate-far texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

And its script:

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// Your page gets the elements (CelesTrak's JSON, within its usage policy) and passes them in; this is one downloaded element set.
const iss: ElementSet = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-02T10:25:21.580320",
  MEAN_MOTION: 15.49150046,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: 20.6961,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
};

const space = document.querySelector("chikyu-space")!;
space.setSatellites("stations", createSatellites([iss]), { color: "#ffd54f", size: 6 });
// The page's moment is 43 days after the elements, past the 30 days a satellite is placed within: `estimate-far` (in the page) keeps it on the picture, drawn lighter, as where it would be had its orbit not changed.
space.addEventListener("chikyu-satellite-click", (event) => {
  const { estimated, estimatedDays } = (event as CustomEvent).detail;
  console.log(estimated ? `estimated, ${Math.round(estimatedDays)} days from its last tracking` : "placed from current elements");
});
console.log(space.estimateFar, space.placeSatellite({ group: "stations", index: 0 })?.estimated); // true true
```

## The catalogue

So that a page does not have to know which list holds the GPS satellites, the package carries a small catalogue of names, numbers and orbit kinds, in English and Japanese: fourteen groups (stations, famous ones, science, Earth observation, weather, geostationary, GPS, GLONASS, Galileo, BeiDou, amateur radio, OneWeb, Iridium, Starlink) and about forty satellites worth naming, from the ISS and Tiangong to Vanguard 1, the oldest satellite still in orbit. Each group says which CelesTrak list holds it (`celestrak`) or which numbers to ask for one by one (`catnr`). **It has no orbital elements**: your page still fetches those. Geostationary satellites (`still: true`) sit over one point of the equator and do not appear to move, and JWST is not in it because it is not in Earth orbit.

```js
import { SATELLITE_GROUPS, catalogueEntry, findInCatalogue } from "@johnmorrisdotca/chikyu-earth/satellites";

const gps = SATELLITE_GROUPS.find((group) => group.id === "gps");
console.log(`${gps.label}: ${gps.about} (CelesTrak list ${gps.celestrak})`);
console.log(catalogueEntry(5).about);
console.log(findInCatalogue("sentinel 2").map((entry) => entry.name).join(", "));
```

`findInCatalogue(text)` matches names, numbers and what a satellite does ("weather", "telescope"), ignoring case and punctuation. It also matches a Japanese name and a group's Japanese label, folding letter case, character width and kana: `はっぶる` finds `ハッブル` (`foldKana(text)` is that fold, hiragana to katakana and small kana to full-size, the long-vowel mark left alone, for a page's own search box; apply it to both sides of a comparison). Kanji are matched as typed. An English or numeric query returns the same entries as before. The demo's Find box uses it, then looks in the names of the satellites it has loaded.

`catalogueRows()` returns one plain row for every group and every named satellite, so a page can index them in its own search box. A row has `kind` (`group` or `satellite`), `id`, `names` in English and Japanese, and `orbit`. A satellite also has its `noradId` and `group`. The Japanese name is the short name where the package has one (the ISS, `天宮` for Tiangong, `ハッブル` for Hubble). Where it has none, the Japanese name is the English name: a name such as Sentinel-2A is written the same way in Japanese. `aka` lists other names already written in the catalogue, such as HST for Hubble. Pass `en` or `ja` for the language the page is showing; both names are always on the row, so one index serves either language.

```js
import { catalogueRows, findInCatalogue } from "@johnmorrisdotca/chikyu-earth/satellites";

const hubble = catalogueRows().find((row) => row.noradId === 20580);
console.log(`${hubble.names.en} / ${hubble.names.ja} (${hubble.aka.join(", ")})`);
console.log(findInCatalogue("ハッブル").map((entry) => entry.name).join(", "));
console.log(catalogueRows().filter((row) => row.kind === "group").length);
```

## Your own source

`fetchElements(url)` asks an address **you** choose, in the visitor's browser, for OMM JSON, OMM CSV or TLE text, and gives back element sets for `createSatellites`. The package has no address of its own: you pick the source and you read its terms ([docs/satellite-sources.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellite-sources.md) has what CelesTrak, Space-Track and the others say). It keeps the rules a polite client keeps:

- Only `https` (`http` on `localhost`), with no cookies and no referrer sent, and no redirects followed.
- The same address is not asked again within two hours (`minIntervalMs`): the answer already read is returned, from the page or from `localStorage`, with `fromCache: true`.
- Any answer that is not 200, or no answer, stops the asking: the address is left alone for an hour (`blockedMs`), a `ElementSourceError` with the status and the time it may be asked again is thrown, and the answer already read, if there is one, is used meanwhile.
- An answer of more than 20 million bytes or 50,000 element sets is refused. An element set with a missing number, a wrong TLE checksum or an impossible orbit is left out and listed in `skipped` with the reason.
- The source must send the headers a browser needs to let a page read it (CORS). CelesTrak does; one that does not cannot be read from a page, and nothing here works round that.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, fetchElements, ElementSourceError } from "@johnmorrisdotca/chikyu-earth/satellites";

const space = document.querySelector("chikyu-space")!;
try {
  // An address you chose, whose terms you have read (this one is made up).
  const source = await fetchElements("https://example.org/my-elements.json");
  space.setSatellites("mine", createSatellites(source.sets), { color: "#ffffff", size: 4 });
  console.log(`${source.sets.length} satellites, ${source.skipped.length} left out, ${source.fromCache ? "kept from earlier" : "just asked"}`);
} catch (error) {
  if (error instanceof ElementSourceError) console.log(error.message, error.status, error.retryAt);
}
```

`parseElements(text)` is the reading alone, with no request, for text you already have (it runs on a server too):

```js
import { parseElements } from "@johnmorrisdotca/chikyu-earth/satellites";

const tle = [
  "0 MADE-UP 1",
  "1 30001U 26001A   26307.50000000  .00001000  00000-0  10000-3 0  9991",
  "2 30001  53.0000   0.0000 0002000  90.0000   0.0000  2.00570000123454",
].join("\n");
const { sets, skipped, format } = parseElements(tle);
console.log(format, sets.length, skipped.length);
```

The demo has a box for it ("Your own source"): paste an address and press Load. The address is never asked for from the page's own address, only when the visitor presses the button.

## On a server

The same positions need no browser. Here is the ISS's height and speed from one element set:

```js
import { createSatellites } from "@johnmorrisdotca/chikyu-earth/satellites";

// SGP4 on a server: the same positions the space view draws, no browser needed.
const group = createSatellites([
  {
    OBJECT_NAME: "ISS (ZARYA)",
    OBJECT_ID: "1998-067A",
    EPOCH: "2026-11-02T10:25:21.580320",
    MEAN_MOTION: 15.49150046,
    ECCENTRICITY: 0.0007139,
    INCLINATION: 51.6332,
    RA_OF_ASC_NODE: 335.9757,
    ARG_OF_PERICENTER: 339.3739,
    MEAN_ANOMALY: 20.6961,
    NORAD_CAT_ID: 25544,
    BSTAR: 0.00012,
    MEAN_MOTION_DOT: 0.0001,
    MEAN_MOTION_DDOT: 0,
  },
]);
const info = group.info(0, Date.UTC(2026, 10, 2, 12));
console.log(`${info.name}: ${Math.round(info.altitudeKm)} km up, ${info.speedKmS.toFixed(2)} km/s`);
```

## Paint where it has been

`element.paint = { id, length, swath }` leaves a trail on the globe for one satellite, on `<chikyu-space>` and `<chikyu-earth-realistic>`. `id` is its NORAD catalogue number, or `group:index` of a group set with `setSatellites`. `length` is `1d` (the default), `1w` or `1m`: how much simulated time the trail keeps. `swath` is `track` (the point on the ground under the satellite, the default) or `coverage` (the ground where the satellite is at least 10° above the horizon, from its height). `clearPaint()` takes it off. Choosing another satellite clears it too.

The trail is one picture laid on the Earth. A frame adds only the ground the satellite has crossed since the frame before, so a clock at an hour a second still draws a continuous line, and a clock running backwards draws backwards. Nothing is uploaded while time is still, or while painting is off. A part of the trail older than `length` fades out. The line is split at the date line and at a pole, so it does not streak across the map. Samples are taken at most a third of a trip apart (from the satellite's mean motion), so a month at once, or a fast clock, follows the orbit and draws no chords. A clock run backwards lays down the older end that it uncovers, so the trail does not shrink. A coverage swath over the date line wraps to the other edge of the map. The picture (two megabytes) is made when the first satellite is painted, not when the view is made, and `clearPaint()` gives it back; a view that paints nothing holds none of it.

## The budget

The same rules as the rest of the space view, each tested at 6,000 satellites:

- Nothing at rest: paused, nothing is drawn, no frame is asked for, SGP4 does not run.
- SGP4 about once a second, whatever the frame rate: the whole group at two moments a step apart (the step is the clock's speed in seconds, from 1 to 60), and arithmetic between.
- At most 30 frames a second, and one a second at real time, or when the reader asked for reduced motion.
- Above 60 times real time the two moments would be too far apart to interpolate, so each satellite is drawn as a short streak along its orbit, covering the stretch one frame spans. The place comes from an SGP4 sample of that satellite about once a second, turned along the orbit by the mean motion, not a new SGP4 call every frame. The samples are spread over the frames, a slice of the group each (about a thirtieth at 30 frames a second), each satellite turned from its own sample, so a frame that comes at a lively pace does not pay for SGP4 over the whole group (17,000 satellites take about 12 ms in one batch). A picture that is drawn once a second or less still pins the group whole at each draw. An orbit with an eccentricity of 0.02 or more (a Molniya, a transfer orbit) is not turned that way, because it neither stays at one height nor goes round at a steady rate: SGP4 places it, and where it was one frame earlier, on every frame, which is two calls a frame for the few that are this eccentric. A chosen satellite is still placed exactly. `satellite-tint="orbit"` (off by default) colours each dot by its orbit class: low, medium, geostationary, highly elliptical or other. Dots grow as the Earth is drawn larger and shrink as it is drawn smaller, and each has a dark rim so a pale one shows on the bright ground. `stats.satellites.placed` is how many are drawn, `segments` how many streaks (0 at 60× and below), and `epochMs` the newest element set's moment.
- A streak has a longest length on the screen, so at an hour or a day a second it looks as it does at 10 minutes a second, a few millimetres when the Earth fills the view, and not a long straight line across the globe. It is the smaller of two things. One is a share of the Earth's drawn radius, 0.025 (about 160 km of orbit, what a low satellite covers in a frame at 10 minutes a second): as the Earth is drawn smaller the streak shrinks in proportion, down to a dot, where a fixed length would look long and heavy on a small Earth. The other is `satellite-streak-max` (the property `satelliteStreakMax`), a ceiling in CSS pixels, 8 when the page says nothing, which matters when the Earth is drawn larger than about 320 pixels in radius; `off` or `0` draws the whole stretch one frame spans, as before. It is a length on the screen, not seconds of travel, because a low satellite moves at about 7.7 km/s and a geostationary one at about 3 km/s: a cap in seconds would draw the high one less than half as long as the low one, and in this form both are as long as each other. The stretch is always one frame at 30 a second, whatever the frames really take, so a slow computer does not draw longer streaks. A streak ends at the satellite and points back along its orbit. The marks also lose weight on a small Earth: from a drawn radius of 150 pixels down to 40 the streaks grow fainter and the dark rim round each dot fades until it is gone, and where the satellites would cover more than a small share of the near side (6% for dots, 35% for streaks) they are drawn fainter in proportion, so 16,000 satellites do not wash a small Earth. A whole Earth is drawn as it always was. `stats.satellites.longestStreakPx` is the longest streak drawn now, `streakCapPx` the cap in force, `weight` the weight from 0 to 1 and `fade` the share of full strength a crowd is drawn at.
- Nothing is drawn out of sight or in a hidden tab, one WebGL context, everything freed when a group or the element is taken away, and a lost context comes back with the satellites.

The numbers and the tests are in [docs/satellites.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellites.md).
