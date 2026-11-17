---
title: Pictures of the ground under a point
section: how-to
order: 23
description: Make the address of a real NASA satellite picture of the ground under a point or under a satellite, with the days to try when one is missing and the credit line to show.
---

`@johnmorrisdotca/chikyu-earth/photos` turns a latitude, a longitude, a size and a day into the address of a real satellite picture (NASA GIBS, the imagery behind Worldview), and gives the credit line NASA asks for. It only makes strings: nothing is fetched, nothing is drawn, and a page that never imports it does not load it. The reader's browser fetches the picture straight from NASA. There is no key and no account, and the service answers any page.

## The address

```js
import { photoCredit, photoFallbacks, photoPieces, photoUrl } from "@johnmorrisdotca/chikyu-earth/photos";

const tokyo = { lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10", widthPx: 512 };
const url = new URL(photoUrl(tokyo));
const fiji = photoPieces({ lat: -17.7, lon: 179.9, sizeKm: 200, date: "2026-11-10", widthPx: 512 });
const days = photoFallbacks(tokyo, 3).map((shot) => shot.date);
console.log(url.searchParams.get("LAYERS"), url.searchParams.get("TIME"));
console.log(fiji.length, fiji.map((piece) => piece.widthPx).join("+"));
console.log(days.join(" "));
console.log(photoCredit("en"));
```

`photoUrl({ lat, lon, sizeKm, date, widthPx })` is a WMS GetMap request on the plain latitude and longitude grid (EPSG:4326, JPEG). The picture is a square box on the ground, `sizeKm` on a side (held between 1 and 4,000 km), `widthPx` pixels wide and high (512 by default, at most 2,048). The date is `yyyy-mm-dd`, a `Date` or milliseconds, and means the UTC day. A number that is not finite, or a date that is not a day, throws a `RangeError`.

The shape of the address is:

```text
https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=<layer>&STYLES=&FORMAT=image%2Fjpeg&SRS=EPSG%3A4326&BBOX=<west>,<south>,<east>,<north>&WIDTH=<px>&HEIGHT=<px>&TIME=<day>
```

## Which layer, and which days

All the layers are daily true colour (what a camera would see), about 250 m a pixel, with the clouds left in. `photoLayer(day)` names the one used: the first of NOAA-20 VIIRS (every day from 2018-01-05 to the latest), Suomi NPP VIIRS (2015-11-24 to 2026-11-02, when it ends) and MODIS Terra (2000-02-24 to the latest) that has the day. Before 2000-02-24 there is no picture and `photoUrl` returns `null`. The days are those NASA's capabilities document listed on 2026-11-17; a day after the last of a layer that is still running is asked for.

At 250 m a pixel you see coasts, cities, rivers, islands, snow and cloud, not buildings.

## The box

A degree of longitude is shorter away from the equator, so `photoBox` makes the box as many degrees wide as it takes to be `sizeKm` wide on the ground: the picture is square, and the farther from the equator, the more degrees of longitude it spans.

- **The date line.** A box over longitude 180 cannot be one request. `photoPieces` gives it as two, left to right (`offsetPx` and `widthPx` say where each goes), so a page lays them side by side and the point stays in the middle. `photoUrl` keeps to one request and moves the box inside the world, so the point is then off centre.
- **The poles.** A box that would run past a pole is moved down to stay on the Earth, so the pole is at its edge. Near a pole a degree of longitude is very short, so the box is about 115 degrees wide.

## When a day is missing

NASA makes a day's picture some hours after the day, and a day with no pass over the box comes back as a black picture, not an error. `photoFallbacks(options, days)` lists the days to try, newest first (the day asked for and the two before it by default), each with its layer, address and pieces. A page tries the first, and when the picture is black or does not arrive, the next. The demo reads the picture into a small canvas, which works because the service allows it, and `samplesAreBlank` in `/door` tells a black one.

```js no-run
import { photoUrl } from "@johnmorrisdotca/chikyu-earth/photos";

const image = new Image();
image.crossOrigin = "anonymous";
image.src = photoUrl({ lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10" });
document.body.append(image);
```

## The credit

`photoCredit("en")` is the short line to show beside a picture: it names NASA as the source and says it is not an endorsement. `photoCredit("en", true)` is the acknowledgement sentence NASA asks every client of GIBS to show, word for word; the Japanese version of it is this package's translation, because NASA publishes none. Show one of them wherever a picture is shown. NASA says its imagery is generally not subject to copyright in the United States; the terms and the day they were read are in `NOTICE.md`.

## In the demo

The flat map page has a panel "The ground under it". Choose a satellite on the map, pick the width of the box (100, 300 or 1,000 km) and press the button: the picture of the place under the satellite then, with the credit line under it.
