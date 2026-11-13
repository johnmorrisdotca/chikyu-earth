// A satellite model made by a page's painter must not bring a light of its own into the scene (MODULES-1293): the demo's painted ISS carries one, and while it was drawn every lit material (the clouds, the plain bodies) got a second program of the
// same text, kept until it was let go. The scene owns the Sun's light now; the model's own is switched off and its look worn by the scene's. Here: ride the ISS from outside until its model is drawn, and no program is in the list twice, and the ones
// that were there before are there once. The page's clock is the test's own (`speed=0`). The picture of the model is written to the test's output folder, to compare with one made before the strip.
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { duplicates, listPrograms, PROGRAMS_SCRIPT } from "./programs.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
const ISS = 25544;
const statsOf = (page: Page): Promise<{ draws: number; followModel: { shown: boolean } | null }> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as { draws: number; followModel: { shown: boolean } | null });

test("riding the ISS from outside until its model is drawn adds no program: none is in the list twice, and every one from before is there once", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.addInitScript(PROGRAMS_SCRIPT);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations&clouds=on");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await untilStill(page);
  const before = await listPrograms(page);
  expect(duplicates(before), "the programs at rest are each made once").toEqual([]);

  await page.locator(SPACE).evaluate((el) => {
    el.setAttribute("ride-viewpoint", "outside");
    const space = el as unknown as { satelliteGroups: { name: string; count: number }[]; satelliteInfo(r: unknown): { noradId: number } | undefined; ride(t: unknown, o: unknown): void };
    const count = space.satelliteGroups.find((group) => group.name === "stations")!.count;
    for (let index = 0; index < count; index += 1) {
      if (space.satelliteInfo({ group: "stations", index })?.noradId === 25544) space.ride({ group: "stations", index }, { view: "from", look: "horizon", smooth: false });
    }
  });
  await expect.poll(async () => (await statsOf(page)).followModel?.shown ?? false, { timeout: 60_000, message: `the model of ${ISS} is drawn` }).toBe(true);
  await untilStill(page);
  const after = await listPrograms(page);
  expect(duplicates(after), "no program is kept twice for two numbers of lights").toEqual([]);
  for (const one of before) expect(after, "a program that was there is still there").toContain(one);
  await page.screenshot({ path: test.info().outputPath("iss-model-page.png") });
  writeFileSync(test.info().outputPath("iss-model.png"), await page.locator(SPACE).screenshot());
});
