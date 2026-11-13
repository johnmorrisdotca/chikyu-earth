import assert from "node:assert/strict";
import test from "node:test";
import { LIGHT_FADE_MS, newLightFade, stepLightFade } from "../src/realistic/light-fade.ts";

test("a change to lit takes 300 ms, only goes on, ends at 1 and then asks for nothing", () => {
  const fade = newLightFade();
  assert.equal(LIGHT_FADE_MS, 300);
  stepLightFade(fade, false, 0, false);
  assert.deepEqual([fade.mix, fade.fading], [0, false], "nothing changed, nothing to draw");
  stepLightFade(fade, true, 1000, false);
  assert.equal(fade.mix, 0, "the change starts the fade at its start");
  assert.equal(fade.fading, true);
  let last = 0;
  for (let ms = 1010; ms < 1300; ms += 10) {
    stepLightFade(fade, true, ms, false);
    assert.ok(fade.mix >= last, `${ms - 1000} ms: it only goes on`);
    assert.equal(fade.fading, true, `${ms - 1000} ms: another frame is wanted`);
    last = fade.mix;
  }
  stepLightFade(fade, true, 1150, false);
  assert.ok(Math.abs(fade.mix - 0.5) < 1e-9, "half way at 150 ms");
  stepLightFade(fade, true, 1300, false);
  assert.deepEqual([fade.mix, fade.fading], [1, false], "arrived at 300 ms and asks for no more");
  stepLightFade(fade, true, 5000, false);
  assert.deepEqual([fade.mix, fade.fading], [1, false]);
});

test("a change to sun goes down the same way, and one turned round half way goes back from where it was", () => {
  const fade = newLightFade(true);
  stepLightFade(fade, false, 0, false);
  stepLightFade(fade, false, 150, false);
  assert.ok(Math.abs(fade.mix - 0.5) < 1e-9);
  stepLightFade(fade, true, 150, false);
  assert.ok(Math.abs(fade.mix - 0.5) < 1e-9, "turned round, it starts where it is");
  stepLightFade(fade, true, 300, false);
  assert.ok(fade.mix > 0.5 && fade.mix < 1);
  stepLightFade(fade, true, 450, false);
  assert.equal(fade.mix, 1);
  assert.equal(fade.fading, false);
});

test("a reader who asked for less motion gets the cut, with nothing fading", () => {
  const fade = newLightFade();
  stepLightFade(fade, true, 0, true);
  assert.deepEqual([fade.mix, fade.fading], [1, false]);
  stepLightFade(fade, false, 10, true);
  assert.deepEqual([fade.mix, fade.fading], [0, false]);
});

test("a clock that runs backwards or stands still does not move the fade out of its range", () => {
  const fade = newLightFade();
  stepLightFade(fade, true, 1000, false);
  stepLightFade(fade, true, 500, false);
  assert.ok(fade.mix >= 0 && fade.mix <= 1);
  stepLightFade(fade, true, 1000, false);
  assert.equal(fade.mix, 0);
});
