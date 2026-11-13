// The line globe names oceans and continents when the Earth is small, and seas when it is large. The same names, on the four browser projects.
import { expect, test, type Page } from "@playwright/test";
import { SEA_RADIUS } from "../src/sea-names/geometry.ts";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";

test.use({ reducedMotion: "reduce" });

const earth = (page: Page) => page.locator("chikyu-earth");
const radiusOf = (page: Page): Promise<number> => earth(page).evaluate((el) => (Reflect.get(el, "stats") as { seaNames: { radius: number } }).seaNames.radius);
const textsOf = (page: Page): Promise<string[]> =>
  earth(page).evaluate((el) => [...el.shadowRoot!.querySelectorAll<HTMLElement>("#sea-names .sea-name")].filter((node) => !node.hidden).map((node) => node.textContent ?? ""));
const view = (page: Page, zoom: number, center: string): Promise<void> =>
  earth(page).evaluate(
    (el, [z, c]) => {
      el.setAttribute("sea-names", "");
      el.setAttribute("center", c!);
      (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: Number(z), panX: 0, panY: 0 }, true);
    },
    [String(zoom), center] as const,
  );

test("the wide line globe names the Pacific and Africa, and a closer one names the Sea of Japan and the Mediterranean", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto("/chikyu-earth/?center=-145.5,-8");
  await earth(page).waitFor();
  await expect(page.locator("#sea-names")).toBeAttached();
  expect(await textsOf(page)).toEqual([]);
  let wide = 0.8;
  for (const zoom of [1.2, 1, 0.8, 0.6, 0.45]) {
    await view(page, zoom, "-145.5,-8");
    const radius = await radiusOf(page);
    if (radius > 0 && radius < SEA_RADIUS) {
      wide = zoom;
      break;
    }
  }
  await expect.poll(async () => (await textsOf(page)).join(" | "), { timeout: 20_000 }).toContain("Pacific");
  expect((await textsOf(page)).some((text) => text.includes("Sea of Japan") || text.includes("Mediterranean"))).toBe(false);
  await view(page, wide, "16.5,7.21");
  await expect.poll(async () => (await textsOf(page)).some((text) => text.includes("Africa"))).toBe(true);
  for (const zoom of [2, 4, 8]) {
    await view(page, zoom, "135.81,41.78");
    if ((await radiusOf(page)) >= SEA_RADIUS) break;
  }
  await expect.poll(async () => (await textsOf(page)).some((text) => text.includes("Sea of Japan"))).toBe(true);
  await view(page, 8, "20.41,35.33");
  await expect.poll(async () => (await textsOf(page)).some((text) => text.includes("Mediterranean"))).toBe(true);
  await untilStill(page);
  const before = await textsOf(page);
  await untilStill(page);
  expect(await textsOf(page)).toEqual(before);
});
