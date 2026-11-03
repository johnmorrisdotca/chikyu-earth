// The page's one renderer: made by the package, or handed over by the page (and then never disposed here).
import assert from "node:assert/strict";
import test from "node:test";
import type { SharedRenderer } from "@johnmorrisdotca/kazoku-ui/renderer";
import { setSharedRenderer, takeRenderer } from "../src/realistic/shared.ts";
import type { ThreeParts } from "../src/realistic/textures.ts";

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const fake = (): { renderer: SharedRenderer<ThreeParts>; disposed: () => number } => {
  let disposed = 0;
  return { renderer: { dispose: () => (disposed += 1) } as unknown as SharedRenderer<ThreeParts>, disposed: () => disposed };
};

test("a renderer the page hands over is the one the elements get, and is never disposed", async () => {
  const mine = fake();
  setSharedRenderer(mine.renderer);
  const a = takeRenderer(() => undefined);
  const b = takeRenderer(() => undefined, 1);
  assert.equal(a.renderer, mine.renderer);
  assert.equal(b.renderer, mine.renderer);
  a.release();
  b.release();
  await pause(1100);
  assert.equal(mine.disposed(), 0, "the page owns it");
  setSharedRenderer(undefined);
  assert.equal(mine.disposed(), 0, "and going back to the package's own does not dispose it either");
});

test("a renderer cannot be handed over while an element holds one", () => {
  const first = takeRenderer(() => undefined);
  assert.throws(() => setSharedRenderer(fake().renderer), /before an element connects/);
  first.release();
});

test("the package's own renderer is shared, and a lower max-ratio makes a new one only when no element holds it", async () => {
  const a = takeRenderer(() => undefined, 1);
  const b = takeRenderer(() => undefined, 1);
  assert.equal(a.renderer, b.renderer, "elements share one");
  const c = takeRenderer(() => undefined, 0.5);
  assert.equal(c.renderer, a.renderer, "one that is in use is not replaced");
  a.release();
  b.release();
  c.release();
  const d = takeRenderer(() => undefined, 1);
  assert.equal(d.renderer, a.renderer, "the same ratio keeps it");
  d.release();
  const e = takeRenderer(() => undefined, 0.5);
  assert.notEqual(e.renderer, d.renderer, "another ratio with nobody holding it makes a new one");
  e.release();
  await pause(1100);
});
