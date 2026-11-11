---
title: Meteors seen from space
section: how-to
order: 14
description: Switch on meteors over the realistic Earth, short streaks where meteors burn on the dark side, more of them under an active shower, and use the shower table and the rate functions by themselves. What is real and what is illustration.
---

From space a meteor is a brief streak in the thin air above the dark side of the Earth. `<chikyu-earth-realistic>` and `<chikyu-space>` can draw them: one attribute switches them on (and another makes them subtler), and a small entry point holds the year's meteor showers and the sums behind the picture, for a page that wants only the numbers.

## Switch them on

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Meteors over the night side</title>
    <script type="module">
      import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/realistic/element/+esm";
    </script>
  </head>
  <body>
    <chikyu-earth-realistic meteors center="-100,30" time="2026-12-14T08:00Z" speed="60" style="width: 420px"></chikyu-earth-realistic>
  </body>
</html>
```

That is the Geminids' maximum over North America at night, with the clock running a minute a second. In a script the property is a boolean: `earth.meteors = true`. `<chikyu-space meteors>` is the same attribute on the space view, where the streaks fall round the Earth among the satellites; there are none while the Earth is under 40 pixels in radius on the screen.

- **Off unless asked for.** Without `meteors` nothing of theirs is made or drawn.
- **Only while the clock runs.** A held clock (`speed="0"`, or a `time` with no `speed`) shows a still picture with no streaks. At real time they run too: a meteor lasts about half a second whatever the clock's speed.
- **Reduced motion.** For a reader who has asked their device for less motion there are no streaks until the page sets a `speed` after the element is in the page: a Play button, for example.
- **Nothing at rest.** No streak is started and nothing is drawn while the element is out of sight or the tab is hidden. All the streaks are one draw, at most 48 alive at once, and the picture is drawn at most 30 times a second.

## How strong they look

`meteors-strength` is a number from 0 to 1, and it chooses how subtle the streaks are. It scales two things together: how bright each streak is, and how many are drawn. Without it the strength is 1, the full look they have always had, so a page that says nothing is unchanged.

```html
<chikyu-earth-realistic meteors meteors-strength="0.3" center="-100,30" time="2026-12-14T08:00Z" speed="60" style="width: 420px"></chikyu-earth-realistic>
```

- **0.3** is subtle: about a third as many streaks, each a third as bright. **0.5** is half. **1** is the full look.
- **0 draws none.** The element is still on: the line under the picture is still there, the sky is still worked out and `chikyu-meteors` is still sent.
- **Only the drawing changes.** The hourly rates, the showers and their `zhr`, which the event and `stats.meteors` report, are the real figures at every strength. `stats.meteors.perSecond` is the number of streaks a second being drawn, so it falls with the strength, and `stats.meteors.strength` is the strength in use.
- **The line stays.** The streaks are an illustration at every strength, and the line under the picture says so.
- **In a script** the property is a number: `earth.meteorsStrength = 0.3`. It writes the attribute. A number below 0 is taken as 0 and one above 1 as 1; a value that is not a number is taken as 1. The same attribute and property are on `<chikyu-space>`.
- `readMeteorStrength(attribute)` and `streaksPerSecond(rate, strength)` in `@johnmorrisdotca/chikyu-earth/meteors` are the same sums, for a page that wants them by themselves:

```js
import { METEOR_STRENGTH_DEFAULT, readMeteorStrength, streaksPerSecond } from "@johnmorrisdotca/chikyu-earth/meteors";

// What a page's `meteors-strength` means: 1 when it says nothing, a number from 0 to 1 as written, and the nearest end outside.
console.log(METEOR_STRENGTH_DEFAULT, readMeteorStrength("0.3"), readMeteorStrength("7"), readMeteorStrength("soft"));

// Streaks drawn a second over a dark view on a night with no shower (8 meteors an hour): 2.5 at the full look, fewer at a low strength, none at 0.
for (const strength of [1, 0.3, 0]) console.log(`strength ${strength}: ${streaksPerSecond(8, strength)} a second`);
```

## What is real, and what is illustration

Real, worked out for the moment shown:

- **How many there are from place to place.** Each place has an hourly rate: a background of meteors that belong to no shower, somewhat more on the side of the Earth that faces the way it is travelling, plus each active shower's rate times the sine of its radiant's height there. So during a shower the streaks gather on the half of the Earth under the radiant.
- **Only where it is dark.** None where the Sun is up, all of them where it is 6 degrees or more below the horizon, and a share in the twilight between.
- **Which way they go.** A shower's meteors travel away from its radiant. The others come from any direction.
- **How high and how fast.** A streak runs from 110 km down to 85 km, inside the 80 to 120 km where meteors shine, at its shower's speed.
- **The showers.** Their dates, maxima, rates, radiants and speeds are the International Meteor Organization's working list for 2026.

Illustration:

- **Every single streak.** Its place and its moment are drawn at random. Nobody can say where the next meteor will fall.
- **The count.** A streak stands for a great many meteors. A view whose whole face is dark gets 2.5 streaks a second on a night with no shower, more under a shower (the rate to the power 0.6) and never more than 9, all of it times the strength (`meteors-strength`, 1 unless set).
- **The length.** A streak too short to see is lengthened, up to 14 times, to about 34 pixels. One that comes straight at the eye stays a flash.
- **The background rate.** 8 meteors an hour is an assumed round figure, and the lean towards the morning side is a simple stand-in for the real daily swing.
- **Each shower's curve.** The list gives the rate at the maximum and the first and last day; the rate between is the simplest curve through them.

The element says so in a line under the picture: "Meteor streaks are an illustration. How often they appear, and where, how high and when, follow real data." in English or Japanese, by the page's language. A page that says it in its own words takes the line away with `meteors-label="off"`.

## Which shower is active

`chikyu-meteors` is sent when the strongest active shower changes, with `detail: { shower, zhr }`; `shower` is `null` when none is active. `stats.meteors` has the counts.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/realistic/element";
import type { MeteorShower } from "@johnmorrisdotca/chikyu-earth/meteors";

const earth = document.querySelector("chikyu-earth-realistic")!;
earth.addEventListener("chikyu-meteors", (event) => {
  const { shower, zhr } = (event as CustomEvent<{ shower: MeteorShower | null; zhr: number }>).detail;
  console.log(shower ? `${shower.name}: about ${zhr.toFixed(0)} an hour under a dark sky with the radiant overhead` : "No shower tonight");
});
earth.meteors = true;
console.log(earth.stats.meteors); // { on, alive, spawned, perSecond, shower, zhr, strength }
```

## The table and the sums, by themselves

`@johnmorrisdotca/chikyu-earth/meteors` has no DOM and no three.js in it: it runs in a browser, in Node and inside another package.

```js
import { METEOR_SHOWERS, activeShowers, hourlyRateAt, meteorSky, pointBeneath } from "@johnmorrisdotca/chikyu-earth/meteors";

const moment = Date.UTC(2026, 7, 13, 2);
// The showers active on the night of the Perseids' maximum, strongest first.
for (const { shower, zhr } of activeShowers(moment)) console.log(`${shower.name} (${shower.code}): ${zhr.toFixed(1)} an hour`);

// Where the Perseids' radiant stands overhead then, and the rate an ideal watcher in Tokyo would count.
const perseids = METEOR_SHOWERS.find((shower) => shower.code === "PER");
const overhead = pointBeneath(perseids.radiant, moment);
console.log(`Overhead at ${overhead.lat} N, ${overhead.lon.toFixed(0)} E; Tokyo: ${hourlyRateAt(meteorSky(moment), { lon: 139.7, lat: 35.7 }).toFixed(0)} an hour`);
```

- `METEOR_SHOWERS`: the 37 showers, each with its code, IAU number, name in English and Japanese, first and last day, maximum (the day in 2026 and the Sun's longitude, which holds for any year), radiant, speed, population index, rate at the maximum (`null` where the list calls it variable) and parent body where the IAU Meteor Data Center names one.
- `showerRate(shower, ms)` and `activeShowers(ms)`: how strong a shower is at a moment.
- `pointBeneath(radiant, ms)` and `apexPoint(ms)`: the place a point of the sky, or the Earth's way, stands overhead.
- `meteorSky(ms)` and `hourlyRateAt(sky, place)`: the hourly rate for an ideal watcher at a place.
- `darkness(place, sun)`, `streaksPerSecond(rate, strength)` and `streakPath(place, radiant)`: what the layer draws from.

## Parent bodies and the IAU's lists

Each shower is linked to the comet or asteroid its meteors come from, by the shower's IAU code and the body's designation. The links, and the check of the table against the IAU Meteor Data Center's lists, are in the same entry point:

```js
import { METEOR_LINKS, parentBodyOf, showerSource, showersOfParent } from "@johnmorrisdotca/chikyu-earth/meteors";

// The Perseids' parent body, found by the shower's IAU code, and every shower that comes from comet Halley.
console.log(parentBodyOf("PER")?.designation, showersOfParent("1P/Halley").map((shower) => shower.name).join(", "));

// Where one row's figures come from.
console.log(showerSource(METEOR_LINKS.find((link) => link.code === "LYR")));
```

- `METEOR_LINKS`: for each shower its IAU name, whether the Data Center lists it as `established` or only on its working list, its parent body (`designation` and `kind`), the Data Center's solution its radiant and speed agree with, and whether each of the radiant and speed is the IMO table's or the Data Center's.
- `parentBodyOf(code)` gives a shower's parent body (`null` where the Data Center names none), and `showersOfParent(designation)` finds the showers of one body by its designation, its number (`2P`) or its name (`Encke`).
- `showerSource(link)` says in a sentence where a row's figures come from.
- **What was checked.** Each radiant and speed was held against the Data Center's solutions of 100 meteors or more whose mean solar longitude lies within 3 degrees of the maximum, with the radiant moved by the solution's own daily motion. Both stand when they are within 2 degrees and 2 km/s of one. Three rows were off by more than the Data Center's own solutions are from each other and took its figures: the April Lyrids' speed (47 km/s, not 49), the alpha-Monocerotids' speed (62, not 65) and the eta-Eridanids' radiant (right ascension 42, declination -13). The Data Center lists no maximum date and no rate, so the dates and rates are the IMO's. Four established showers have no solution that qualifies and keep the IMO's figures.
- **The Data Center's own words.** It gives the Draconids as the October Draconids and the Monocerotids as the December Monocerotids (`iauName`), and the IMO's Puppid-Velids (IAU 301) as the gamma-Puppids. Three of the showers (the alpha-Centaurids, the September Lyncids and the gamma-Puppids) are only on its working list. Cite it as Jenniskens and others (2020, Planetary and Space Science 182, 104821) and Jopek and Kanuchova (2017, Planetary and Space Science 143, 3-6), as its data files ask.

## Limits

- The maximum dates in the table are right for 2026; in another year a maximum can fall a day either side. The rate functions time it by the Sun's longitude, so they keep to the right hour.
- The Antihelion Source, a broad patch of weak activity with no fixed radiant, is not in the table.
- A shower the list calls variable (the June Bootids, for one) is given no meteors: nobody knows its rate ahead of time.
- Outbursts and storms that a model predicts for one year are not in it.
- The realistic Earth and the space view draw them. The line-drawn globe does not.
