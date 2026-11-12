// A satellite's name is constant for its ref and the page's language. #showMarks asks for that name on every frame, and the lookup must not
// propagate the orbit again after the first time. Taking the cache away makes the second lookup propagate, so this test fails.
import assert from "node:assert/strict";
import test from "node:test";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { madeUp } from "./madeup-elements.ts";

let lang = "en";
let closestCalls = 0;
class Stand {
  isConnected = false;
  closest(selector: string): { getAttribute(name: string): string | null } | null {
    if (selector === "[lang]") closestCalls += 1;
    return { getAttribute: () => lang };
  }
}
Object.assign(globalThis, { HTMLElement: Stand, customElements: { define: () => undefined, get: () => undefined } });

const { ChikyuSpace, setSatellitePainter } = await import("../src/space/element.ts");

const epoch = "2026-11-03T12:00:00";
const sets = madeUp("stations", 2, epoch) as unknown as ElementSet[];
sets[0]!.NORAD_CAT_ID = 25544;
sets[0]!.OBJECT_NAME = "ISS (ZARYA)";
sets[1]!.NORAD_CAT_ID = 20580;
sets[1]!.OBJECT_NAME = "HST";

test("a satellite name propagates once, then the lookup does not propagate again", () => {
  const group = createSatellites(sets);
  assert.equal(group.count, 2);
  const space = new ChikyuSpace();
  space.time = Date.parse(`${epoch}Z`);
  space.setSatellites("stations", group);
  setSatellitePainter({ has: () => true, make: async () => null });
  try {
    closestCalls = 0;
    const before = group.propagations;
    const first = space.largeSatellites();
    assert.equal(group.propagations - before, 2, "the first lookup propagates each satellite once");
    assert.equal(closestCalls, 1, "the language is read once for the lookup, not once a satellite");
    assert.deepEqual(
      first.map((one) => one.name),
      ["ISS", "Hubble"],
    );

    closestCalls = 0;
    const held = group.propagations;
    const again = space.largeSatellites();
    space.largeSatellites();
    assert.equal(group.propagations, held, "a later lookup runs no propagation");
    assert.equal(closestCalls, 2, "each later lookup reads the language once");
    assert.deepEqual(
      again.map((one) => one.name),
      ["ISS", "Hubble"],
    );

    space.satelliteNames = { 25544: "Station" };
    const renamedAt = group.propagations;
    const renamed = space.largeSatellites();
    assert.equal(group.propagations - renamedAt, 2, "a new satelliteNames drops the cache and propagates once more");
    assert.equal(renamed[0]!.name, "Station");
    const renamedHeld = group.propagations;
    space.largeSatellites();
    assert.equal(group.propagations, renamedHeld);

    lang = "ja";
    const jaAt = group.propagations;
    const ja = space.largeSatellites();
    assert.equal(group.propagations - jaAt, 2, "a new language drops the cache and propagates once more");
    assert.equal(ja[1]!.name, "ハッブル");
    assert.equal(ja[0]!.name, "Station");
    const jaHeld = group.propagations;
    space.largeSatellites();
    assert.equal(group.propagations, jaHeld);

    const swapped = createSatellites([sets[1]!]);
    space.setSatellites("stations", swapped);
    const swappedAt = swapped.propagations;
    const afterSwap = space.largeSatellites();
    assert.equal(afterSwap[0]!.name, "ハッブル", "a replaced group does not keep the name cached for that index");
    assert.equal(swapped.propagations - swappedAt, 1);
    const swapHeld = swapped.propagations;
    space.largeSatellites();
    assert.equal(swapped.propagations, swapHeld);
  } finally {
    setSatellitePainter(undefined);
  }
});
