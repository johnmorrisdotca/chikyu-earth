// The Wide layout on the 3D looks: the globe grows with the page, and the realistic Earth and the space view draw again at the new size, sharp, in one context, inside the renderer's
// caps (4096 pixels a side, 6 million pixels). Software GL in Chromium, like the rest of the 3D tests.
import { withinPixelBudget } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, readCounts, settle } from "./gl.ts";

interface Stats {
  draws: number;
  contexts: number;
  canvas: { width: number; height: number; pixels: number };
}

const NOV2 = "2026-11-02T14:00Z";
const LOOKS = [
  { look: "realistic", tag: "chikyu-earth-realistic" },
  { look: "space", tag: "chikyu-space" },
] as const;

const statsOf = (page: Page, tag: string): Promise<Stats> => page.locator(tag).evaluate((el) => Reflect.get(el, "stats") as Stats);

for (const { look, tag } of LOOKS) {
  test(`the ${look} look grows in Wide and draws again at the new size, sharp and inside the caps`, async ({ page }) => {
    await page.addInitScript(COUNT_SCRIPT);
    await page.goto(`/chikyu-earth/?look=${look}&time=${NOV2}&speed=0&center=-100,40`);
    await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
    await expect.poll(async () => (await statsOf(page, tag)).draws).toBeGreaterThan(0);
    await settle(page);
    const before = await page.locator(tag).boundingBox();
    const small = await statsOf(page, tag);
    expect(before!.width).toBeLessThanOrEqual(420);

    await page.locator("kazoku-wide-toggle").getByRole("button").click();
    await expect(page.locator("html")).toHaveAttribute("data-wide", "on");
    await expect.poll(async () => (await page.locator(tag).boundingBox())!.width).toBeGreaterThan(before!.width * 1.3);
    // it draws again for the new size: the canvas is as big as the element, in device pixels, and still one context
    await expect.poll(async () => (await statsOf(page, tag)).canvas.width, { timeout: 15_000 }).toBeGreaterThan(small.canvas.width * 1.2);
    await settle(page);
    const box = (await page.locator(tag).boundingBox())!;
    const ratio = await page.evaluate(() => window.devicePixelRatio);
    const big = await statsOf(page, tag);
    expect(Math.abs(box.width - box.height), "round").toBeLessThan(1);
    expect(big.draws, "drawn again").toBeGreaterThan(small.draws);
    expect(big.canvas.width, "sharp: a device pixel for every pixel of the picture").toBeGreaterThanOrEqual(Math.floor(box.width * ratio) - 1);
    expect(withinPixelBudget({ pixels: big.canvas.pixels, side: Math.max(big.canvas.width, big.canvas.height), count: 1 })).toBe(true);
    expect((await readCounts(page)).contexts).toBe(1);

    // and back to Normal: the canvas goes back down with the element
    await page.keyboard.press("t");
    await expect(page.locator("html")).not.toHaveAttribute("data-wide", "on");
    await expect.poll(async () => (await page.locator(tag).boundingBox())!.width).toBeLessThanOrEqual(420);
    await expect.poll(async () => (await statsOf(page, tag)).canvas.width, { timeout: 15_000 }).toBeLessThanOrEqual(small.canvas.width + 1);
  });
}
