// Places the page keeps clear of the sky's names: a block of the page's own text laid over the element. No name box touches it, whether it is given by the property `keepClear` (an element, or a rectangle) or by the attribute `keep-clear` (a selector), the names
// come back when it is taken away, a block that is resized is read again, and nothing is drawn at rest. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { untilArrived } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
interface Box {
  text: string;
  l: number;
  t: number;
  r: number;
  b: number;
}
const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
async function atRest(page: Page): Promise<void> {
  // a view's bodies are made after the draw that showed them and each picture that arrives is a draw of its own (gathered to one a second for less motion): rest is after the last, which the page says (MODULES-1192)
  await untilArrived(page);
}
const names = (page: Page): Promise<Box[]> =>
  page.locator(SPACE).evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLElement>("#sk-names .sk-name, #sk-names .sk-designation")]
      .filter((b) => !b.hidden)
      .map((b) => {
        const box = b.getBoundingClientRect();
        return { text: b.textContent ?? "", l: box.left, t: box.top, r: box.right, b: box.bottom };
      }),
  );
const blockBox = (page: Page): Promise<{ l: number; t: number; r: number; b: number }> =>
  page.locator("#page-text").evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { l: box.left, t: box.top, r: box.right, b: box.bottom };
  });
const touching = (boxes: Box[], block: { l: number; t: number; r: number; b: number }): string[] => boxes.filter((n) => n.l < block.r && n.r > block.l && n.t < block.b && n.b > block.t).map((n) => n.text);

async function open(page: Page): Promise<void> {
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40&star-names=40");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator(SPACE).evaluate((el) => el.setAttribute("earth-size", "0.3"));
  for (const lon of [-100, -40, 20, 80, 140, 200]) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("center", `${at},20`), lon);
    await atRest(page);
    if ((await names(page)).length >= 6) break;
  }
  expect((await names(page)).length, "the sky shows names").toBeGreaterThanOrEqual(4);
  await page.locator(SPACE).scrollIntoViewIfNeeded();
  await atRest(page);
  // the page's text, laid over the middle band of the picture
  const own = (await page.locator(SPACE).boundingBox())!;
  await page.evaluate(
    ({ x, y, w, h }) => {
      const block = document.createElement("div");
      block.id = "page-text";
      block.textContent = "PAGE TEXT";
      block.style.cssText = `position:fixed;z-index:100;left:${x}px;top:${y}px;width:${w}px;height:${h}px;color:white`;
      document.body.append(block);
    },
    { x: own.x + own.width * 0.1, y: own.y + own.height * 0.15, w: own.width * 0.6, h: own.height * 0.5 },
  );
}

test("the property keepClear: no name touches the page's text, and the names come back when it is taken away", async ({ page }) => {
  await open(page);
  const block = await blockBox(page);
  const before = await names(page);
  expect(touching(before, block).length, "without it, some name was over the text").toBeGreaterThan(0);
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "keepClear", [document.getElementById("page-text")]));
  await atRest(page);
  expect(touching(await names(page), block), "no name touches the page's text").toEqual([]);
  expect((await names(page)).length, "names are still shown clear of it").toBeGreaterThan(0);
  const draw = await draws(page);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(await draws(page), "nothing is drawn at rest").toBe(draw);
  // a rectangle in the element's own pixels does the same
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "keepClear", []));
  await atRest(page);
  expect(touching(await names(page), block).length, "taken away, the names are back over the text").toBeGreaterThan(0);
  const own = (await page.locator(SPACE).boundingBox())!;
  await page.locator(SPACE).evaluate((el, r) => Reflect.set(el, "keepClear", [r]), { x: block.l - own.x, y: block.t - own.y, width: block.r - block.l, height: block.b - block.t });
  await atRest(page);
  expect(touching(await names(page), block), "a rectangle keeps names off it too").toEqual([]);
});

test("the attribute keep-clear takes a selector, and a block that is resized is read again", async ({ page }) => {
  await open(page);
  await page.locator(SPACE).evaluate((el) => el.setAttribute("keep-clear", "#page-text"));
  await atRest(page);
  const block = await blockBox(page);
  expect(touching(await names(page), block), "no name touches the page's text").toEqual([]);
  // the block grows over the whole picture: its new box is read, and the names go
  await page.locator("#page-text").evaluate((el) => {
    (el as HTMLElement).style.left = "0";
    (el as HTMLElement).style.top = "0";
    (el as HTMLElement).style.width = "100vw";
    (el as HTMLElement).style.height = "100vh";
  });
  await expect.poll(async () => (await names(page)).length, { timeout: 15_000, message: "a block that grows is read again" }).toBe(0);
  await page.locator(SPACE).evaluate((el) => el.removeAttribute("keep-clear"));
  await expect.poll(async () => (await names(page)).length, { timeout: 15_000, message: "without the attribute the names are back" }).toBeGreaterThan(0);
});

test("a block fixed on the screen is kept clear as the page scrolls under it: the names are laid out again, once, with no camera move", async ({ page }) => {
  await open(page);
  // the page grows below, so that it can scroll; the block is fixed on the screen, over the middle of the picture
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "3000px";
    document.body.append(spacer);
  });
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "keepClear", [document.getElementById("page-text")]));
  await atRest(page);
  const block = await blockBox(page);
  expect(touching(await names(page), block), "no name touches the block").toEqual([]);
  const before = await draws(page);
  await page.evaluate(() => window.scrollBy(0, 160));
  // the picture moved up the screen under the block: names that were clear of it are under it now, until the layer is laid out again
  await expect.poll(async () => touching(await names(page), await blockBox(page)), { timeout: 15_000, message: "after a scroll no name touches the block" }).toEqual([]);
  expect(await draws(page), "the picture is not drawn again for it").toBe(before);
});
