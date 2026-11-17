---
title: How accurate it is
section: explanation
order: 13
description: The measured error of the Sun's overhead point, the line between day and night, and the SGP4 satellite places, each against a published reference, with the source and the date it was read, and the limits a test holds.
---

Three things on the globe come from a calculation, not from a picture: the point where the Sun is straight overhead, the line between day and night, and where a satellite is. This page says how far each is from a published reference, measured on 2026-11-17, and which limit the test suite holds it to (`test/accuracy.test.ts`; the reference values, with their sources in comments, are in `test/accuracy/references.ts`).

## The Sun's overhead point, and the line between day and night

`subsolarPoint(ms)` gives the longitude and latitude where the Sun stands at the zenith. The line between day and night (`terminator(ms)`, the line the day and night sheet draws) is the circle of points 90 degrees from it, so it can be no more wrong than that point is.

**Reference.** NASA/JPL Horizons, <https://ssd.jpl.nasa.gov/api/horizons.api>, read on 2026-11-17. Two requests, times in UT: the Sun's airless apparent right ascension and declination of date as seen from the Earth's centre (quantity 2), and the Greenwich apparent sidereal time (quantity 7, at longitude 0). The overhead latitude is the declination and the overhead longitude (east) is the right ascension less the sidereal time. The exact request is in the comments of `test/accuracy/references.ts`.

| Moment (UTC) | Latitude error | Longitude error | Angle from Horizons | On the ground | Day and night line, worst point |
|---|---|---|---|---|---|
| 1950-05-05 03:00 | +0.0003° | -0.0004° | 0.0005° | 0.05 km | 0.0005° |
| 1980-02-29 06:00 | +0.0005° | +0.0011° | 0.0012° | 0.13 km | 0.0012° |
| 2000-01-01 12:00 | -0.0001° | +0.0019° | 0.0018° | 0.20 km | 0.0018° |
| 2026-03-20 14:46 | +0.0022° | +0.0070° | 0.0074° | 0.82 km | 0.0074° |
| 2026-06-21 08:24 | +0.0002° | +0.0048° | 0.0044° | 0.49 km | 0.0044° |
| 2026-09-23 00:05 | +0.0012° | -0.0006° | 0.0014° | 0.15 km | 0.0013° |
| 2026-12-21 20:50 | -0.0004° | +0.0028° | 0.0026° | 0.29 km | 0.0026° |
| 2075-01-15 21:30 | -0.0000° | -0.0035° | 0.0033° | 0.37 km | 0.0033° |

Errors are the package's value less Horizons'. **The worst is 0.0074 degree, 0.8 km on the ground (the equinox of 2026-03-20).**

**Limits the test holds:** the angle at most 0.010° (about a third above the worst measured), the latitude at most 0.003°, the longitude at most 0.010°, and every point of the day and night line within 0.010° of the circle 90 degrees from Horizons' Sun.

What this does not say:

- The day and night line is measured against Horizons' Sun, not against a second, independent reading of where the night starts. It is the geometric line (the Sun's centre on the horizon). Real sunrise and sunset are about 0.8 degree further out, because of the Sun's size and the bending of light in the air, and twilight goes on past it; the package does not draw those.
- NOAA's solar calculator is the model the code follows, but it is a page you operate, not a file with values to read, so no NOAA figure is in the table.
- The dates run from 1950 to 2075. The formulas are stated for 1900 to 2100; the ends of that range were not measured.

## Satellites: SGP4

`createSatellites` runs SGP4 (the `satellite.js` code) and puts each satellite where the element set says. This is the check that the package feeds SGP4 its elements correctly and takes the answer out in the right axes, against the verification set published with Vallado and others, "Revisiting Spacetrack Report #3" (AIAA 2006-6753, 2006).

**Reference.** The element sets are lines of CelesTrak's copy of Vallado's `SGP4-VER.TLE` (<https://raw.githubusercontent.com/CelesTrak/fundamentals-of-astrodynamics/main/datalib/SGP4-VER.TLE>). The expected places are the TEME positions in the STK ephemeris files of Vallado's own SGP4 program in CelesTrak's repository (`software/cpp/TestSGP4/TestSGP4/<number>.e` in <https://github.com/CelesTrak/fundamentals-of-astrodynamics>). Both read on 2026-11-17. The test turns each element set into the same JSON CelesTrak serves, asks `createSatellites(...).exact` for the place at each published minute, and compares in kilometres.

| Element set | Orbit | Places compared | Worst distance |
|---|---|---|---|
| 00005 | near Earth, eccentricity 0.19, 0 to 4,320 min | 13 | 0.000000007 km (7 micrometres) |
| 88888 | near Earth, the Spacetrack Report #3 test, 0 to 840 min | 8 | 0.000000006 km (6 micrometres) |
| 06251 | near Earth, strong drag, 0 to 840 min | 8 | 0.000000007 km (7 micrometres) |
| 11801 | deep space, eccentricity 0.73, 12 hour period, 0 to 1,440 min | 5 | 0.000000007 km (7 micrometres) |

The published places are written to 8 decimals of a kilometre, so this is agreement to every digit published: the rounding of the last digit, and nothing else. **Limit the test holds:** 0.000001 km (1 millimetre) for every place.

What this does not say:

- It says the package and SGP4 agree. It does not say SGP4 agrees with where a satellite really is: an element set is good to about a kilometre at its epoch and loses a few kilometres a day after it ([satellites](satellites.md) has the ages the package accepts).
- The paper's own printed tables, and the file `tcppver.out` in its zip, were not read: CelesTrak's page for the paper offers only a zip of the source, which was not downloaded. The `.e` files are the same program's output for the same element sets.
- Only four of the verification set's element sets are in the table: one each of near Earth, a low high-drag orbit and deep space, and the Report #3 case. The error-code cases (decay, bad elements) were left out.
- The step from the inertial place to a longitude and latitude on the ground (the Earth's turn) is not part of this table.

## Holding the numbers

`pnpm test` runs `test/accuracy.test.ts`. Each limit in it carries the worst error measured and the margin, and each was shown to fail when the code was broken (the Sun's longitude moved by 0.02°, the satellite's axes swapped, an element changed in the seventh decimal) and when a limit was cut below the measured error. A limit is never to be raised to make the test pass: if a change to the code moves a number past its limit, that is a finding to look into first.
