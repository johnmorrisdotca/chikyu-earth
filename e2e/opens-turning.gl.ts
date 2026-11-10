// A link that says nothing opens the 3D looks turning (MODULES-849): Auto-turn is on at a speed that can be seen, the clock runs, and the camera is held in the stars, so the Earth turns on the screen within two seconds, untouched.
// These tests do not ask for reduced motion (the config's default): a reader who does gets a still view, which date-play.demo.ts checks.
import { expect, test, type Page } from "@playwright/test";

test.use({ reducedMotion: "no-preference" });

const LOOKS = [
  { look: "realistic", tag: "chikyu-earth-realistic" },
  { look: "space", tag: "chikyu-space" },
] as const;

/** The share of the picture (grey steps above 24) that is not what it was two seconds before. */
async function changed(page: Page, tag: string): Promise<number> {
  const first = (await page.locator(tag).screenshot()).toString("base64");
  await page.waitForTimeout(2000);
  const second = (await page.locator(tag).screenshot()).toString("base64");
  return page.evaluate(
    async ([a, b]) => {
      const read = async (data: string): Promise<Uint8ClampedArray> => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const [one, two] = [await read(a!), await read(b!)];
      let different = 0;
      for (let i = 0; i < one.length; i += 4) if (Math.abs(one[i]! - two[i]!) + Math.abs(one[i + 1]! - two[i + 1]!) + Math.abs(one[i + 2]! - two[i + 2]!) > 24) different += 1;
      return different / (one.length / 4);
    },
    [first, second] as const,
  );
}

for (const { look, tag } of LOOKS) {
  test(`${look}: with nothing touched, the Earth on the screen turns within two seconds`, async ({ page }) => {
    await page.goto(`/chikyu-earth/?look=${look}`);
    await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    const share = await changed(page, tag);
    expect(share, `${(share * 100).toFixed(1)}% of the picture changed in two seconds`).toBeGreaterThan(0.04);
    // Auto-turn is on, at a speed that can be seen: a turn in about a minute
    const bar = await page.locator("kazoku-view-controls").evaluate((el) => ({ turning: Reflect.get(el, "state").turning as boolean, speed: Reflect.get(el, "controller").speed as number }));
    expect(bar.turning).toBe(true);
    expect(bar.speed).toBeGreaterThanOrEqual(3);
  });

  test(`${look}: the camera is held in the stars by default, the ground-fixed camera is the option`, async ({ page }) => {
    await page.goto(`/chikyu-earth/?look=${look}&time=2026-11-02T14:00Z&speed=0`);
    await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
    expect(await page.locator(tag).evaluate((el) => Reflect.get(el, "camera"))).toBe("space");
    await page.getByRole("button", { name: "Ground", exact: true }).click();
    expect(await page.locator(tag).evaluate((el) => Reflect.get(el, "camera"))).toBe("ground");
  });
}
