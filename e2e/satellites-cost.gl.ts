// What the satellites cost the page in JavaScript a frame: its own file, run with nothing beside it (`pnpm test:demo` runs it after the other files, with one worker; CI has a job for it). The page times `update()` with the wall clock,
// so a second browser drawing at the same time (three at once on a loaded Mac, throttled) took its CPU and doubled the reading while the work was the same. The rest of the moving-satellite tests are in satellites-moving.gl.ts.
import { expect, test } from "@playwright/test";
import { routeElements } from "./recorded.ts";
import { addMany, open, setSpeed, statsOf } from "./satellites-common.ts";

test.beforeEach(({ page }) => routeElements(page));
test.use({ reducedMotion: "no-preference" });

// The page's own stopwatch, not the test's clock: what is measured here is how long the work takes.
test("6,000 satellites at 60 times real time: a few milliseconds of JavaScript a frame, one SGP4 batch in well under a frame's worth of a second", async ({ page }) => {
  await open(page, "", "stations,starlink");
  await setSpeed(page, 60);
  await addMany(page);
  // the page counts its own work, so the test waits on that, never on a fixed time
  const all = 2252 + 6000;
  const total = (s: { averageUpdateMs: number; updates: number }): number => s.averageUpdateMs * s.updates;
  const added = (await statsOf(page)).satellites;
  // The window starts after the 6,000 are added and SGP4 has gone over every satellite once since (the first batch after the add has run) ...
  await expect.poll(async () => (await statsOf(page)).satellites.propagations - added.propagations, { timeout: 30_000, message: "the first SGP4 pass over every satellite after the add" }).toBeGreaterThanOrEqual(all);
  const from = (await statsOf(page)).satellites;
  // ... and runs for 120 frames and two more SGP4 passes, so the once-a-second batch is in it as often as it is in a second of frames
  await expect
    .poll(
      async () => {
        const now = (await statsOf(page)).satellites;
        return now.propagations - from.propagations >= 2 * all && now.updates - from.updates >= 120;
      },
      { timeout: 60_000, message: "120 frames and two SGP4 passes over every satellite" },
    )
    .toBe(true);
  const { satellites } = await statsOf(page);
  // The page reports a mean since it loaded, so the window's mean is the difference of two readings of the total (mean times frames) over the frames between them. Not the since-load mean: the one-off first placement, the
  // add of the group and the once-a-second SGP4 batch dominate a mean over the first few dozen frames (3.1 ms at 4x on a quiet machine, over 4 under load, for a steady 1.5), and the budget is about the steady cost of a frame.
  const frames = satellites.updates - from.updates;
  const windowMs = (total(satellites) - total(from)) / frames;
  console.log(`JavaScript a frame over ${frames} frames after the add: ${windowMs.toFixed(2)} ms (since load: ${satellites.averageUpdateMs.toFixed(2)} ms)`);
  expect(windowMs, "JavaScript a frame, over a window after the add and the first SGP4 batch").toBeLessThan(4);
  expect(satellites.maxBatchMs, "one SGP4 batch").toBeLessThan(120);
});
