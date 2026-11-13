import test from "node:test";
import assert from "node:assert/strict";
import { fadeLeft, HOVER_FADE_MS } from "../src/space/satellite-layer.ts";
import { hoverOpacityOf, hoverPathOn, namesOnHover } from "../src/space/satellite-hover.ts";

test("the faint orbit fades across a short span and is gone at the end", () => {
  assert.equal(fadeLeft(0, 1), 1);
  assert.ok(Math.abs(fadeLeft(HOVER_FADE_MS / 2, 1) - 0.5) < 1e-9);
  assert.equal(fadeLeft(HOVER_FADE_MS, 1), 0);
  assert.equal(fadeLeft(HOVER_FADE_MS + 40, 1), 0);
});

test("the faint orbit is on with the names, and either attribute can turn it off", () => {
  assert.equal(hoverPathOn(null, null), true);
  assert.equal(namesOnHover(null), true);
  assert.equal(hoverPathOn(null, "off"), false, "left unset, it follows the names");
  assert.equal(hoverPathOn("off", null), false);
  assert.equal(hoverPathOn("", "off"), true, "set on its own, the orbit stays when the names are off");
  assert.equal(namesOnHover("off"), false);
  assert.ok(Math.abs(hoverOpacityOf("") - 0.85 / 3) < 1e-9, "a blank property is the default, not zero");
  assert.equal(hoverOpacityOf("0"), 0);
  assert.equal(hoverOpacityOf("0.5"), 0.5);
  assert.ok(Math.abs(hoverOpacityOf("nope") - 0.85 / 3) < 1e-9);
});
