// Pictures of the page's paths in the far view: 12 favourites and one chosen satellite, on a desktop screen and on a phone's. Written to the test's output folder, which the runner copies back.
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
interface Stats {
  draws: number;
  paths: { drawn: number; draws: number };
  satellites: { placed: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations&earth-size=0.35");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 30_000 }).toBeGreaterThan(5);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await untilStill(page);
}

/** Do `act` in the page and wait for the draw it asks for, the draw count read in the same turn as the change. */
async function change(page: Page, act: (api: { setPaths(list: unknown[]): void; selectSatellite(ref: unknown): void }) => void): Promise<Stats> {
  const before = await page.locator(SPACE).evaluate((el, source) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    (new Function(`return (${source})`)() as (api: unknown) => void)(el);
    return draws;
  }, act.toString());
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: "a draw after the change" }).toBeGreaterThan(before);
  await untilStill(page);
  return statsOf(page);
}

for (const [name, viewport, mobile] of [["desk", { width: 1280, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]] as const) {
  test.describe(`far view, ${name}`, () => {
    test.use({ viewport, hasTouch: mobile, isMobile: mobile });
    test(`pictures of the far view: 12 favourites and one chosen satellite, on ${name}`, async ({ page }) => {
      await open(page);
      await change(page, (api) => api.setPaths(Array.from({ length: 12 }, (_, index) => ({ id: `stations:${index + 1}`, style: "favourite" }))));
      const stats = await change(page, (api) => api.selectSatellite({ group: "stations", index: 0 }));
      expect(stats.paths).toMatchObject({ drawn: 13, draws: 1 });
      writeFileSync(test.info().outputPath(`far-${name}.png`), await page.locator(SPACE).screenshot());
    });
  });
}
