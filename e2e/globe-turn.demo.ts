// The line and thick globes open turning where it can be seen (MODULES-898): Auto-turn is on and the pace is a turn in about a minute, with nothing touched, and 1× on the buttons is still real time.
// A reader who prefers reduced motion gets a still globe with Play ready. The config's default is reduced motion, so the first test asks for no preference.
import { expect, test, type Page } from "@playwright/test";

const CONTROLS = "kazoku-view-controls";
const controller = <T>(page: Page, read: string): Promise<T> => page.locator(CONTROLS).evaluate((el, key) => Reflect.get(Reflect.get(el, "controller"), key as string) as T, read);

/** The share of the picture (grey steps above 24) that is not what it was two seconds before. */
async function changed(page: Page): Promise<number> {
  const first = (await page.locator("#globe chikyu-earth").screenshot()).toString("base64");
  await page.waitForTimeout(2000);
  const second = (await page.locator("#globe chikyu-earth").screenshot()).toString("base64");
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

test.describe("with no preference for reduced motion", () => {
  test.use({ reducedMotion: "no-preference" });

  for (const look of ["line", "thick"] as const) {
    test(`${look}: with nothing touched, the globe's picture changes within two seconds, a turn in about a minute`, async ({ page }) => {
      await page.goto(look === "line" ? "/chikyu-earth/" : "/chikyu-earth/?look=thick");
      await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
      await expect(page.locator(`${CONTROLS} [data-b="play"]`)).toHaveAttribute("aria-pressed", "true");
      await page.waitForTimeout(500);
      const share = await changed(page);
      expect(share, `${(share * 100).toFixed(2)}% of the picture changed in two seconds`).toBeGreaterThan(0.002);
      // about 6 degrees a second: a turn in a minute
      const degrees = await controller<number>(page, "speed");
      expect(Math.abs(degrees)).toBeGreaterThan(5);
      expect(Math.abs(degrees)).toBeLessThan(7);
    });
  }

  test("the buttons are named by the time a turn takes, the 1× is still the Earth's own rate, and the page opens on the 1440× one (a day a minute: a turn in 60 s)", async ({ page }) => {
    await page.goto("/chikyu-earth/");
    await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
    if ((await page.locator(`${CONTROLS} [data-b="more"]`).getAttribute("aria-expanded")) !== "true") await page.locator(`${CONTROLS} [data-b="more"]`).click();
    const buttons = page.locator(`${CONTROLS} kazoku-speed-buttons button`);
    await expect(buttons).toHaveText(["2900 min", "1400 min", "720 min", "60 s"]);
    await expect(page.locator(`${CONTROLS} kazoku-speed-buttons button[data-v="1440"]`)).toHaveAttribute("aria-pressed", "true");
    await page.locator(`${CONTROLS} kazoku-speed-buttons button[data-v="1"]`).click();
    expect(Math.abs(await controller<number>(page, "speed"))).toBeCloseTo(0.004178, 6);
  });
});

test("with reduced motion the globe opens still, with Play ready", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
  const play = page.locator(`${CONTROLS} [data-b="play"]`);
  await expect(play).toBeVisible();
  await expect(play).toBeEnabled();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "state").turning as boolean)).toBe(false);
  expect(await changed(page)).toBe(0);
});
