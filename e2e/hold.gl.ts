// A drag that is still going on turns the picture: a real pointer goes down, moves in steps and is NOT let go, and the picture changes between the moves, in every look, with the Auto-turn on and off.
// (The globe once stayed still under the pointer and jumped to the new angle when the button came up.)
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const LOOKS = [
  { name: "Line", element: "chikyu-earth", ready: "chikyu-earth svg" },
  { name: "Thick", element: "chikyu-earth", ready: "chikyu-earth svg" },
  { name: "Realistic", element: "chikyu-earth-realistic", ready: "chikyu-earth-realistic[data-state=live]" },
  { name: "Space", element: "chikyu-space", ready: "chikyu-space[data-state=live]" },
] as const;

/** How many pixels of two pictures (PNG, base64) differ. */
const differing = (page: Page, a: string, b: string): Promise<number> =>
  page.evaluate(async ([x, y]) => {
    const read = async (data: string): Promise<ImageData> => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    };
    const [p, q] = [await read(x!), await read(y!)];
    let count = 0;
    for (let i = 0; i < p.data.length; i += 4) if (Math.abs(p.data[i]! - q.data[i]!) + Math.abs(p.data[i + 1]! - q.data[i + 1]!) + Math.abs(p.data[i + 2]! - q.data[i + 2]!) > 30) count += 1;
    return count;
  }, [a, b] as const);

for (const look of LOOKS) {
  for (const auto of [true, false]) {
    test(`${look.name}, auto-turn ${auto ? "on" : "off"}: the picture turns while the button is still down`, async ({ page }) => {
      await page.goto(`/chikyu-earth/?look=${look.name.toLowerCase()}&time=2026-11-02T14:00Z&speed=0&center=10,20`);
      await page.locator(look.ready).first().waitFor({ timeout: 90_000 });
      await page.waitForTimeout(1500);
      await page.locator("kazoku-view-controls").evaluate((el, on) => {
        const controls = el as HTMLElement & { play(): void; pause(): void };
        if (on) controls.play();
        else controls.pause();
      }, auto);
      const view = page.locator("#globe");
      const box = (await view.boundingBox())!;
      const snap = async (): Promise<string> => (await view.screenshot()).toString("base64");
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width * 0.3, y);
      await page.mouse.down();
      let before = await snap();
      let changed = 0;
      for (let step = 1; step <= 5; step += 1) {
        await page.mouse.move(box.x + box.width * 0.3 + step * 36, y, { steps: 4 });
        await page.waitForTimeout(250);
        const after = await snap();
        if ((await differing(page, before, after)) > 300) changed += 1;
        before = after;
      }
      await page.mouse.up();
      expect(changed, "the picture changed between the moves of a drag that was not let go").toBeGreaterThanOrEqual(4);
    });
  }
}
