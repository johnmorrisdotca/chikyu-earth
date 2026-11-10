---
title: The date follows the clock, and Play
section: how-to
order: 11
description: Show the date the clock of the space view or the realistic Earth has reached, and run it from a date with Play, Pause and Back: the speed, the event, how often it is sent, and what the demo keeps in its address.
---

`<chikyu-space>` has a clock: `time` is the moment shown and `speed` is how many seconds pass for each real second (`0` holds it still, `3600` is an hour a second, `86400` a day a second, a negative number runs backwards). A page with a date box wants to show the date the clock has reached, and a reader wants to start it from the date in the box and stop it again. This guide is the event that carries the date and the controls the demo puts round it.

## Showing the date while time runs

`<chikyu-space>` sends `chikyu-timechange` with `detail: { time, running }`, `time` being the moment shown in milliseconds since 1970:

- While the clock runs (`speed` not 0) it is sent four times a second at most, however fast the picture is drawn, and only while the tab is shown. At real time the clock steps once a minute (once a second with satellites on show or a ride along), and the event goes with each step.
- When the clock holds (`speed` set to 0) it is sent once with `running: false`, so a page writes the date it stopped on into its address.
- It is not sent for a `time` the page sets itself, and `time` reads the moment shown at any moment.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector("chikyu-space")!;
const box = document.querySelector<HTMLInputElement>("#when")!;
space.setAttribute("time", "2026-11-02T12:00Z");
space.setAttribute("speed", "86400");
space.addEventListener("chikyu-timechange", (event) => {
  const { time, running } = (event as CustomEvent<{ time: number; running: boolean }>).detail;
  // the box follows the clock, but never while the reader is typing in it
  if (document.activeElement !== box) box.value = new Date(time).toISOString().slice(0, 16);
  if (!running) history.replaceState(null, "", `?time=${new Date(time).toISOString()}`);
});
```

`chikyu-time` is the older event of every step the clock takes, up to thirty a second. It is kept for pages that already listen for it and is not thinned out; a page that shows a date wants `chikyu-timechange`.

## The realistic Earth

`<chikyu-earth-realistic>` has the same clock, with the same names: `speed` is how many seconds pass for each real second (`0` holds, `3600` is an hour a second, `86400` a day a second, a negative number runs backwards), and the clock runs on from the date shown. The Sun's light, the night side and the clouds follow it, and a page's date box follows through the same event, `chikyu-timechange`, under the same rules: four a second at most while the clock runs, only while the tab is shown, and once with `running: false` when it holds.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.querySelector("chikyu-earth-realistic")!;
earth.setAttribute("time", "2026-11-02T12:00Z");
earth.setAttribute("speed", "86400");
earth.addEventListener("chikyu-timechange", (event) => {
  const { time, running } = (event as CustomEvent<{ time: number; running: boolean }>).detail;
  console.log(new Date(time).toISOString(), running ? "running" : "held");
});
```

- **Links from before keep working.** With no `speed`, the clock follows `time` as it always did: `time="now"` (or no `time`) follows the real clock, and the Sun and the clouds are put right every `live-seconds` (a minute by default, a second at the least); a date holds still. Giving a `speed` runs the clock from the moment shown (from now, when `time` is `now`), `speed="0"` holds it, and taking the attribute off goes back to following `time`. Setting the `speed` property is setting the attribute.
- **Frames.** At real time the picture is put right every `live-seconds`. Faster, it is drawn as often as the Sun's turn moves a pixel: once a second at least and 30 a second at most, and a reader who prefers reduced motion gets one step a second. While it holds, is out of sight or is in a hidden tab, nothing is drawn and no frame is asked for.
- **`time` reads the moment reached** while the clock runs, or `"now"` while it follows the real clock.

## Play, Pause and Back

The demo's Time row is the family's replay bar (kazoku-ui's `<kazoku-replay-bar>`) next to the date field, with the speeds `1 3600 86400 -3600`, read as multiples of real time:

- **Play** runs the clock from the date shown, and the date box follows it. A date that was "now" becomes that moment, so the clock does not jump to a later now.
- **Pause** holds the clock there and writes the date reached into the address (`time`). A held view draws nothing.
- **Back to the date** returns to the date the reader chose (the address, the box or Now) and holds it.
- Riding along a body or a satellite starts the clock, so the date moves with the ride.

The address keeps `play=on` and `speed` (an hour a second is the default and is left out), and `time` when the clock stops and when the reader leaves the page. A reader who prefers reduced motion gets Play left off, even from an address that asks for it.

The Time row runs on both the space view and the realistic Earth. The space view opens held. The realistic Earth opens as it always did, following the real clock at `now` and holding a date: Play from `now` starts from the moment shown and writes it into `time`, and Back returns to following the real clock when the date was `now`. A link from before the bar still works: `speed=0` is held, a link that names another speed and no `play` keeps running at it, as it did, and a link with neither opens held.
