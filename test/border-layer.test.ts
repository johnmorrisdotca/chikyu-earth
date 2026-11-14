// The border layer's sets and when each is loaded and drawn (MODULES-1143): the countries at any size, the same countries from the finer outlines once the Earth is large on the screen, and the regions of the countries in view
// once it is larger still, chizu's by default. No browser: the layer only builds geometry, so three.js runs in node, and the clock is the layer's own `invalidate`, called when a set of shapes has arrived.
import assert from "node:assert/strict";
import test from "node:test";
import * as three from "three";
import { BORDER_DETAIL_RADIUS, BORDER_REGIONS_RADIUS } from "../src/borders/lines.ts";
import { createBorderLayer, newBorderState, type BorderState } from "../src/borders/layer.ts";
import type { ThreeParts } from "../src/realistic/textures.ts";

const TOKYO = { lon: 139.69, lat: 35.69 };
const view = (radius: number) => ({ points: [TOKYO], angle: 8, radius });

/** A layer and a way to wait for what it has not yet loaded: `until` resolves when the condition holds, checked each time the layer asks for a draw. */
function make(state: BorderState) {
  const waiting: (() => void)[] = [];
  const layer = createBorderLayer(three as unknown as ThreeParts, new three.Group(), state, () => waiting.splice(0).forEach((wake) => wake()), 1);
  const until = async (condition: () => boolean): Promise<void> => {
    while (!condition()) await new Promise<void>((resolve) => waiting.push(resolve));
  };
  return { layer, until };
}
const on = (data: BorderState["data"] = {}): BorderState => ({ ...newBorderState(), countries: true, regions: true, data });

test("at a small size only the countries are loaded and drawn: neither the finer outlines nor any region is asked for", { timeout: 30_000 }, async () => {
  let detail = 0;
  let regions = 0;
  const state = on({ detail: async () => (detail += 1, { features: [] }), regions: async () => (regions += 1, null) });
  const { layer, until } = make(state);
  layer.sync(view(BORDER_DETAIL_RADIUS - 1));
  await until(() => state.stats.countries > 0);
  layer.sync(view(BORDER_DETAIL_RADIUS - 1));
  assert.equal(detail, 0);
  assert.equal(regions, 0);
  assert.deepEqual(state.stats.shown, { countries: true, detail: false, regions: false });
});

test("from BORDER_DETAIL_RADIUS the countries come from chizu's finer world, asked for once, and the coarse lines are put away", { timeout: 30_000 }, async () => {
  const state = on();
  const { layer, until } = make(state);
  layer.sync(view(BORDER_DETAIL_RADIUS - 1));
  await until(() => state.stats.countries > 0);
  layer.sync(view(BORDER_DETAIL_RADIUS));
  await until(() => state.stats.detail > 0);
  layer.sync(view(BORDER_DETAIL_RADIUS));
  assert.ok(state.stats.detail > state.stats.countries * 3, "the 1:50m world has many more segments than the 1:110m one");
  assert.deepEqual(state.stats.shown, { countries: false, detail: true, regions: false }, "no border is drawn twice, and no region is shown below its size");
  layer.sync(view(BORDER_DETAIL_RADIUS - 1));
  assert.deepEqual(state.stats.shown, { countries: true, detail: false, regions: false }, "zoomed out the coarse lines come back");
  layer.dispose();
});

test("from BORDER_REGIONS_RADIUS the regions of the countries in view come from chizu's divisions-geo, with no loader of the page's", { timeout: 30_000 }, async () => {
  const state = on();
  const { layer, until } = make(state);
  layer.sync(view(BORDER_REGIONS_RADIUS));
  await until(() => state.stats.countries > 0);
  layer.sync(view(BORDER_REGIONS_RADIUS));
  await until(() => state.stats.regions > 0);
  assert.ok(state.stats.loaded.includes("JP"), `Japan's regions arrived (${state.stats.loaded.join(" ")})`);
  assert.ok(state.stats.regions > 100, "Japan's prefectures have borders");
  layer.sync(view(BORDER_REGIONS_RADIUS));
  assert.equal(state.stats.shown.regions, true);
  layer.sync(view(BORDER_REGIONS_RADIUS - 1));
  assert.equal(state.stats.shown.regions, false, "zoomed out they are put away");
  layer.dispose();
});

test("a loader the page gives is used in place of chizu's, for the countries, the finer countries and the regions", { timeout: 30_000 }, async () => {
  const square = (code: string) => ({ features: [{ properties: { code }, geometry: { type: "Polygon", coordinates: [[[139, 35], [140, 35], [140, 36], [139, 36], [139, 35]]] } }] });
  const asked: string[] = [];
  const state = on({
    countries: async () => (asked.push("countries"), square("JP")),
    detail: async () => (asked.push("detail"), square("JP")),
    regions: async (code) => (asked.push(`regions ${code}`), null),
  });
  const { layer, until } = make(state);
  layer.sync(view(BORDER_REGIONS_RADIUS));
  await until(() => state.stats.countries > 0 || asked.includes("countries"));
  layer.sync(view(BORDER_REGIONS_RADIUS));
  await until(() => asked.includes("detail") && asked.includes("regions JP"));
  assert.deepEqual([...new Set(asked)].sort(), ["countries", "detail", "regions JP"]);
  layer.dispose();
});

test("countries off asks for none of them, and regions off asks for no region, however large the Earth", { timeout: 30_000 }, async () => {
  let asked = 0;
  const state: BorderState = { ...newBorderState(), countries: false, regions: false, data: { countries: async () => (asked += 1, { features: [] }), detail: async () => (asked += 1, { features: [] }), regions: async () => (asked += 1, null) } };
  const { layer } = make(state);
  layer.sync(view(5000));
  assert.equal(asked, 0);
});
