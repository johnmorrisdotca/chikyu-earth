---
title: How it stays light
section: explanation
order: 10
description: What the globe draws, when, and the limits it keeps so a page with it never works the processor for nothing.
---

A globe on a page is easy to make expensive: a frame loop that never stops, a canvas the size of a monitor, a WebGL context per globe. Chikyu keeps rules instead.

## Draws on demand

Nothing runs while nothing changes. The flat globe redraws its SVG when the view settles; during a gesture it moves one transform. Auto-turn is slow (one turn a sidereal day) so it redraws about once a second, which is smooth and exact at that speed. The realistic Earth draws when something changes, at most 30 times a second (20 on a small device, fewer on a low battery), and not at all while it is out of sight or the tab is hidden: the frame loop is stopped, not skipped.

## Capped

The realistic canvas is held to 4096 pixels a side and 6 million pixels in all, however large the screen or the pixel ratio. Textures come in sizes (1024, 2048 and 4096 across) and the one held is the smallest that gives a texel a little larger than a screen pixel at the current zoom; it grows when you zoom and is freed a few seconds after you stop. Low-memory phones stop at 2048.

## One WebGL context

The shared renderer in kazoku-ui keeps one context for the page. Several realistic globes on one page share it, one drawn at a time: another takes it when pressed or focused, and the rest show their last picture. Taking an element out of the page frees every GPU object it held.

## Pure and small

`globe()` is pure: no clock, no DOM, the same markup for the same options. The outlines come from chizu's `world-geo` (Natural Earth 1:110m, public domain), shaped once at load; nothing is fetched at run time. The runtime dependencies are d3-geo and chizu.

## Why `look` and not `style`

The first versions read the look from a `style` attribute, which is a real HTML attribute (inline CSS). Browsers ignore a CSS they cannot parse, so it worked by accident in plain HTML, but React throws on a string `style`, and Vue and Angular try to parse it. `look` is the same choice under a name no framework reads. `style` still works.
