import assert from "node:assert/strict";
import { test } from "node:test";
import { AIR_QUALITY, AIR_TOP, airFor, airFrag } from "../src/realistic/air.ts";

test("the air is a shell 100 km thick on the Earth's 6,371", () => {
  assert.ok(Math.abs((AIR_TOP - 1) * 6371 - 100) < 1e-6);
});

test("the light quality takes fewer samples than the full one, and the program says how many", () => {
  assert.ok(AIR_QUALITY.light.view < AIR_QUALITY.full.view);
  assert.ok(AIR_QUALITY.light.light < AIR_QUALITY.full.light);
  for (const quality of ["full", "light"] as const) {
    const source = airFrag(AIR_QUALITY[quality]);
    assert.ok(source.includes(`#define N_VIEW ${AIR_QUALITY[quality].view}\n`));
    assert.ok(source.includes(`#define N_LIGHT ${AIR_QUALITY[quality].light}\n`));
  }
});

test("the program differs between the qualities only by its two sample counts, and sums scattering rather than drawing a ring", () => {
  const source = airFrag(AIR_QUALITY.full);
  assert.ok(source.includes("BETA_R") && source.includes("BETA_M"));
  assert.ok(source.includes("phaseR") && source.includes("phaseM"));
  assert.equal(airFrag(AIR_QUALITY.light).replace(/#define N_(VIEW|LIGHT) \d+/g, ""), source.replace(/#define N_(VIEW|LIGHT) \d+/g, ""));
});

test("the page's air attribute decides, and only full and light are words", () => {
  assert.equal(airFor("full"), "full");
  assert.equal(airFor("light"), "light");
  assert.ok(["full", "light"].includes(airFor(null)));
  assert.ok(["full", "light"].includes(airFor("rich")));
});
