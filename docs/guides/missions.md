---
title: Space Shuttle flights and the Hubble visits
section: how-to
order: 9
description: Every Space Shuttle flight from STS-1 to STS-135 with NASA's facts, and where the orbiter (and the Hubble Space Telescope) was at any moment of a flight, worked out from the element sets Space-Track kept at the time.
---

The `satellites` entry has the 135 Space Shuttle flights, STS-1 (12 April 1981) to STS-135 (8 July 2011): the orbiter, the liftoff and landing in UTC, the people NASA's page lists, and the main payload in a few words (English and Japanese). The facts are NASA's mission pages (public domain, read on 2026-11-08); the flights that deployed or serviced the Hubble Space Telescope (STS-31, STS-61, STS-82, STS-103, STS-109 and STS-125) say so in `hubble`. The orbiter's place at a moment of a flight is worked out by the same SGP4 as the rest of the satellites, from the element sets Space-Track kept while the orbiter was up.

## The facts and a place

`missions()` lists the flights in the order they launched, `missionOf` finds one by `"STS-31"`, `"31"` or `31`, and `missionPosition(sets, ms, flight)` gives the latitude, longitude, height and speed from the element set nearest in time. It needs satellite.js, like the rest of the entry, and runs in a browser or on a server:

```js
import { missionOf, missionPosition, missions } from "@johnmorrisdotca/chikyu-earth/satellites";

// The Space Shuttle flights, and where the craft was at a moment of one, from the element sets Space-Track kept at the time (two of STS-1's, here).
const sets = [
  { OBJECT_NAME: "STS 1 (OFT-1)", EPOCH: "1981-04-12T20:49:32.182176", MEAN_MOTION: 16.01389059, ECCENTRICITY: 0.0004879, INCLINATION: 40.3433, RA_OF_ASC_NODE: 259.625, ARG_OF_PERICENTER: 296.3562, MEAN_ANOMALY: 63.4235, NORAD_CAT_ID: 12399, BSTAR: 0.002351, MEAN_MOTION_DOT: 0.01317629, MEAN_MOTION_DDOT: 0.0011342 },
  { OBJECT_NAME: "STS 1 (OFT-1)", EPOCH: "1981-04-13T08:47:54.639168", MEAN_MOTION: 16.01452947, ECCENTRICITY: 0.0006363, INCLINATION: 40.3379, RA_OF_ASC_NODE: 256.3348, ARG_OF_PERICENTER: 298.5494, MEAN_ANOMALY: 61.4705, NORAD_CAT_ID: 12399, BSTAR: 0.002351, MEAN_MOTION_DOT: 0.01372851, MEAN_MOTION_DDOT: 0.0000027732 },
];
const flight = missionOf("STS-1");
const place = missionPosition(sets, Date.UTC(1981, 3, 13, 6), flight);
console.log(`${missions().length} flights; ${flight.name} ${flight.orbiter}, ${flight.crew} crew: ${place.altitudeKm.toFixed(0)} km up over ${place.latitude.toFixed(0)} degrees`);
```

Give `missionPosition` the flight and it gives nothing before liftoff or after landing (the orbiter is on the ground). Elements more than two days from the moment give nothing either. STS-51L, which broke up 73 seconds after liftoff, has no landing and no elements.

## Where the elements are

The package ships no elements. The demo site carries one small file for each flight, `missions/sts-31.json` and so on, made once from Space-Track's SATCAT and its `gp_history` class (134 files, about 3,100 element sets and 410 kB, 180 kB compressed; the telescope's sets are in the files of its six flights). `missionElements(file)` turns one into element sets by NORAD catalogue number, which `missionPosition` takes. The numbers are what Space-Track kept at the time, thinned to one set in three hours at most, with the few typed-over ones left out (`scripts/missions.ts`). Data from Space-Track.org (USSPACECOM); the page [Satellites on the globe](satellites.md) says where each source's terms stand.

## How exact it is

An old set is a few hours of orbit, no more. The ground track agrees with a second, independent propagator (two-body motion with the J2 drift) to within 60 km over the 90 minutes either side of a set, and the height to 25 km. Between two sets the craft is placed from the nearer one, so after it changed orbit (a burn, a rendezvous) the place can jump by some hundreds of kilometres where the sets change. A flight with few sets (STS-27 has one) is placed only for two days around them.

## In the demo

In the space look, the Space Shuttle flights row has the Hubble visits and each orbiter's flights as buttons; pressing one puts the orbiter (and the telescope) on the globe at liftoff, and Play runs the flight at 600, 3600 or 21600 times real speed. The address keeps the flight and the moment (`?look=space&mission=sts-31&time=1990-04-25T00:00Z`).
