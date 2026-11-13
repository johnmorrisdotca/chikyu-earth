// Oceans, seas and continents on the realistic Earth and the space view: off unless asked for, the Pacific and Africa at a wide view, the Sea of Japan and the Mediterranean once the Earth is large, and nothing drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { SEA_RADIUS } from "../src/sea-names/geometry.ts";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

interface Names {
  on: boolean;
  radius: number;
  names: number;
}
const statsOf = (page: Page, tag: string): Promise<Names> => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { seaNames: Names }).seaNames);
const textsOf = (page: Page, tag: string): Promise<string[]> =>
  page.locator(tag).evaluate((el) => [...el.shadowRoot!.querySelectorAll<HTMLElement>("#sea-names .sea-name")].filter((node) => !node.hidden).map((node) => node.textContent ?? ""));
const view = (page: Page, tag: string, zoom: number, center: string): Promise<void> =>
  page.locator(tag).evaluate(
    (el, [z, c]) => {
      el.setAttribute("center", c!);
      (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: Number(z), panX: 0, panY: 0 }, true);
    },
    [String(zoom), center] as const,
  );

for (const [name, tag, look] of [
  ["the realistic Earth", "chikyu-earth-realistic", "realistic"],
  ["the space view", "chikyu-space", "space"],
] as const) {
  test.describe(name, () => {
    test("a wide view names the Pacific and Africa, a closer view names the Sea of Japan and the Mediterranean, and rest draws nothing", async ({ page }) => {
      await page.addInitScript(COUNT_SCRIPT);
      await page.goto(`/chikyu-earth/?look=${look}&time=2026-06-21T12:00Z&speed=0&center=-145.5,-8`);
      await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
      expect(await statsOf(page, tag)).toMatchObject({ on: false, names: 0 });
      await page.locator(tag).evaluate((el) => el.setAttribute("sea-names", ""));
      let wide = 0.8;
      for (const zoom of [1.2, 1, 0.8, 0.6, 0.45]) {
        await view(page, tag, zoom, "-145.5,-8");
        const radius = (await statsOf(page, tag)).radius;
        if (radius > 0 && radius < SEA_RADIUS) {
          wide = zoom;
          break;
        }
      }
      await expect.poll(async () => (await textsOf(page, tag)).join(" | "), { timeout: 20_000 }).toContain("Pacific");
      expect((await textsOf(page, tag)).some((text) => text.includes("Sea of Japan") || text.includes("Mediterranean"))).toBe(false);
      await view(page, tag, wide, "16.5,7.21");
      await expect.poll(async () => (await textsOf(page, tag)).join(" | "), { timeout: 20_000 }).toContain("Africa");
      for (const zoom of [2, 4, 8]) {
        await view(page, tag, zoom, "135.81,41.78");
        if ((await statsOf(page, tag)).radius >= SEA_RADIUS) break;
      }
      await expect.poll(async () => (await textsOf(page, tag)).some((text) => text.includes("Sea of Japan")), { timeout: 20_000 }).toBe(true);
      await view(page, tag, 4, "20.41,35.33");
      if ((await statsOf(page, tag)).radius < SEA_RADIUS) await view(page, tag, 8, "20.41,35.33");
      await expect.poll(async () => (await textsOf(page, tag)).some((text) => text.includes("Mediterranean")), { timeout: 20_000 }).toBe(true);
      await untilStill(page);
      const held = await statsOf(page, tag);
      await untilStill(page);
      expect(await statsOf(page, tag)).toMatchObject({ names: held.names, radius: held.radius });
    });
  });
}
