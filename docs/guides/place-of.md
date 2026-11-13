---
title: The place under a point
section: how-to
order: 22
description: Ask which country, sea, continent and city a longitude and latitude are over, and how that changes along a ground track.
---

`@johnmorrisdotca/chikyu-earth/place` answers "where is this?" for one point, or for a list of points that form a ground track. A page that never imports it does not load it. Nothing is drawn.

## One point

```js
import { alongTrack, placeOf } from "@johnmorrisdotca/chikyu-earth/place";

const paris = placeOf(2.35, 48.86);
const ocean = placeOf(-150, 0);
const cities = {
  nearest() {
    return { city: { id: "Q90", name: { en: "Paris", ja: "パリ" }, country: "FR", lat: 48.8566, lon: 2.3522 }, km: 0.5 };
  },
};
const named = placeOf(2.35, 48.86, { cities });
const track = alongTrack([
  { lon: -40, lat: 40, t: 0 },
  { lon: -3.7, lat: 40.4, t: 1 },
  { lon: 2.35, lat: 48.86, t: 2 },
]);
console.log(paris.country.code, paris.continent.id);
console.log(ocean.sea.id, ocean.country === null);
console.log(named.nearestCity.name, Math.round(named.nearestCity.bearingDeg));
console.log(track.map((row) => row.entering.id).join(" "));
```

`placeOf(lon, lat)` returns five fields.

- **country** is set when the point is inside a country outline. The outlines are the same Natural Earth 1:110m shapes the line globe draws. `code` is the two-letter code, or null for the few outlines that have none. `name` and `nameJa` are the English and Japanese names.
- **near** is set instead when the point is outside every outline and within 50 km of one (`PLACE_COAST_KM`). A line at that scale can sit tens of kilometres off a real coast, so a point that close is not reported as inside a country. `distanceKm` is how far the outline is. A page can read this as approaching that country.
- **sea** is set only when `country` is not. It is the nearest named sea, gulf, bay or ocean whose own point is within that water's reach (`SEA_REACH_KM`). A smaller water's point is nearer, so the Mediterranean wins over the Atlantic where both would fit. The five oceans do not divide the Earth by whichever label is nearest on the whole sphere: the Atlantic's point sits near the equator, and that rule would call the North Atlantic the Arctic. A point no water reaches has `sea` null.
- **continent** follows the country, or the nearby country, and is null over open water. The names are the sea-names list (Africa, Antarctica, Asia, Europe, North America, South America, Australia). Australia the country uses that continent. A country the outlines call Oceania, other than Australia, is `oceania` with the outlines' own name. Eastern Russia and French Guiana sit far from the continent their country is filed under: when another continent's point is at least 2,500 km nearer, that one is used.
- **nearestCity** is null unless the caller passes city lists. `cities` is the same shape `here-city` uses (capitals, cities of a million, cities of 100,000). `towns` is read only when it is passed, and only for the one or two countries those tiers name. `maxKm` defaults to 100 and stops at 20,000. `nameJa` is the short Japanese name, then the Japanese name, then the English name when neither is known. `bearingDeg` is degrees clockwise from north, from the point to the city.

The outlines are indexed on a 15° grid. After that index is built, one call is about 0.14 ms, so once a second is comfortable.

`lon` outside -180 to 180 is wrapped. A latitude that is not between -90 and 90 returns every field null.

## Along a track

`alongTrack(points)` takes `{ lon, lat, t }` in order and returns the changes. The first sample is included, with `leaving` null. Each later row is the sample where the country, the nearby country or the sea changed. `t` is that sample's own time, not a time guessed between samples. `entering.kind` is `country`, `near` or `sea`. A page can say "approaching" while the kind is `near`, and "leaving" from `leaving`.
