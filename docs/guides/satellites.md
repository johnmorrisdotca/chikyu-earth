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

## Ring and name a whole group

`space.labelSatellites("stations")` rings every member of a group and writes its name beside it, for a small group such as the stations. The names are in the page's language (`ISS`, `Tiangong` or `天宮`, `Hubble` or `ハッブル`; any other satellite under the name in its elements, or as `space.satelliteNames = { 25544: "Space Station" }` says). They are laid out after the names of `places` and never over them, a body's name or one another: each name goes to the right of its ring if it fits, else left, above, below, and one with no free place is left out. Only satellites that are in the picture and not behind the Earth are ringed, at most 80 over all the groups, and nothing is drawn at rest. `space.labelSatellites("stations", false)` stops; `space.labelledSatellites` lists the groups.

`space.placeSatellite({ group: "stations", index })` says where a satellite is on the screen as of the last draw: `{ x, y, visible, heightKm }` in CSS pixels from the view's top left, `visible` meaning inside the box and not behind the Earth, and `null` when its group is not shown or it cannot be placed. It is the picture's own camera maths and its own test for the Earth in the way, so a page that draws its own rings need not repeat either. `chikyu-satellite-visibility` is sent with `detail: { ref, visible }` when a ringed satellite comes into view or goes out of it, not at every frame.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector("chikyu-space")!;
space.labelSatellites("stations");
space.addEventListener("chikyu-satellite-visibility", (event) => console.log((event as CustomEvent).detail.ref.index, (event as CustomEvent).detail.visible));
console.log(space.placeSatellite({ group: "stations", index: 0 })); // { x, y, visible, heightKm } or null
```

## Choosing one

A press on a satellite (not a drag that turns the view, and not one behind the Earth) fires `chikyu-satellite-click` with `{ group, index, info }`; `info` has its name, NORAD number, the age of its elements, its height, speed and period, and `ownerCountry`, the owner's country as an ISO 3166-1 alpha-2 code (`CN`, `US`, `PK`), when the elements carry an owner code (`COUNTRY_CODE` or `OWNER`) and the owner is one country. An organisation (ESA, the ISS, Intelsat, SES), several countries, an unknown owner or a code the list does not give to one country (including `CIS`, the former Soviet registration) has none, and the field is left off. `ownerCountry(code)` and `OWNER_COUNTRIES` answer the same for any code. The package draws no flag. `selectSatellite({ group, index })` marks one from code (a ring, its orbit and its name beside it), and `satelliteInfo(ref)` tells you about it. A page with a search box or a list of names uses those two, so a keyboard reader can choose too.

## The catalogue

So that a page does not have to know which list holds the GPS satellites, the package carries a small catalogue of names, numbers and orbit kinds, in English and Japanese: fourteen groups (stations, famous ones, science, Earth observation, weather, geostationary, GPS, GLONASS, Galileo, BeiDou, amateur radio, OneWeb, Iridium, Starlink) and about forty satellites worth naming, from the ISS and Tiangong to Vanguard 1, the oldest satellite still in orbit. Each group says which CelesTrak list holds it (`celestrak`) or which numbers to ask for one by one (`catnr`). **It has no orbital elements**: your page still fetches those. Geostationary satellites (`still: true`) sit over one point of the equator and do not appear to move, and JWST is not in it because it is not in Earth orbit.

```js
import { SATELLITE_GROUPS, catalogueEntry, findInCatalogue } from "@johnmorrisdotca/chikyu-earth/satellites";

const gps = SATELLITE_GROUPS.find((group) => group.id === "gps");
console.log(`${gps.label}: ${gps.about} (CelesTrak list ${gps.celestrak})`);
console.log(catalogueEntry(5).about);
console.log(findInCatalogue("sentinel 2").map((entry) => entry.name).join(", "));
```

`findInCatalogue(text)` matches names, numbers and what a satellite does ("weather", "telescope"), ignoring case and punctuation. The demo's Find box uses it, then looks in the names of the satellites it has loaded.

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

## The budget

The same rules as the rest of the space view, each tested at 6,000 satellites:

- Nothing at rest: paused, nothing is drawn, no frame is asked for, SGP4 does not run.
- SGP4 about once a second, whatever the frame rate: the whole group at two moments a step apart (the step is the clock's speed in seconds, from 1 to 60), and arithmetic between.
- At most 30 frames a second, and one a second at real time, or when the reader asked for reduced motion.
- Above 60 times real time the two moments would be too far apart to interpolate, so each satellite is drawn as a short streak along its orbit, covering the stretch one frame spans. The place comes from an SGP4 sample of that satellite about once a second, turned along the orbit by the mean motion, not a new SGP4 call every frame. The samples are spread over the frames, a slice of the group each (about a thirtieth at 30 frames a second), each satellite turned from its own sample, so a frame that comes at a lively pace does not pay for SGP4 over the whole group (17,000 satellites take about 12 ms in one batch). A picture that is drawn once a second or less still pins the group whole at each draw. An orbit with an eccentricity of 0.02 or more (a Molniya, a transfer orbit) is not turned that way, because it neither stays at one height nor goes round at a steady rate: SGP4 places it, and where it was one frame earlier, on every frame, which is two calls a frame for the few that are this eccentric. A chosen satellite is still placed exactly. `satellite-tint="orbit"` (off by default) colours each dot by its orbit class: low, medium, geostationary, highly elliptical or other. Dots grow as the Earth is drawn larger and shrink as it is drawn smaller, and each has a dark rim so a pale one shows on the bright ground. `stats.satellites.placed` is how many are drawn, `segments` how many streaks (0 at 60× and below), and `epochMs` the newest element set's moment.
- Nothing is drawn out of sight or in a hidden tab, one WebGL context, everything freed when a group or the element is taken away, and a lost context comes back with the satellites.

The numbers and the tests are in [docs/satellites.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellites.md).
