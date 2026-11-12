// The sky culture of the figures (`constellation-culture`): the IAU's 88 unless the page sets another, exactly as it sets it (a Japanese page keeps the IAU's unless it says `japanese`), the Japanese set with its traditional figures (すばる),
// an unknown value falling back to the IAU's with one warning, and each culture's data fetched only when asked for. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
interface Sky {
  figures: number;
  pick: string | null;
  culture: string;
}
const sky = (page: Page): Promise<Sky> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { sky: Sky }).sky);

async function open(page: Page, query: string): Promise<{ scripts: string[] }> {
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (/\.js(\?|$)/.test(response.url())) scripts.push(response.url());
  });
  await routeElements(page);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,-24&constellation-lines=0.3${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator(SPACE).evaluate((el) => el.setAttribute("earth-size", "0.3"));
  return { scripts };
}
/** Whether any script the page fetched holds a text: a culture's data is in a file of its own, so a page that never asked for it never fetched the text. */
async function fetched(page: Page, scripts: string[], text: string): Promise<boolean> {
  for (const url of new Set(scripts)) if ((await (await page.request.get(url)).text()).includes(text)) return true;
  return false;
}
/** Turns the view round until some figure is in it. */
async function figuresInView(page: Page): Promise<void> {
  for (const lon of [-100, -70, -40, -10, 20, 50, 80, 110, 140, 170, 200, 230]) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("center", `${at},-24`), lon);
    try {
      await expect.poll(async () => (await sky(page)).figures, { timeout: 4000 }).toBeGreaterThan(0);
      return;
    } catch {
      // the next direction
    }
  }
  throw new Error("no figure came into view");
}

const IAU_ONLY = "hokkyokusei";
const CHINESE_ONLY = "jiao3-xiu4";

test("the IAU's 88 unless the page sets another: a Japanese page keeps them, and neither other culture's data is fetched", async ({ page }) => {
  const { scripts } = await open(page, "&lang=ja");
  await figuresInView(page);
  expect((await sky(page)).culture, "a Japanese page is still the IAU's").toBe("iau");
  expect(await fetched(page, scripts, CHINESE_ONLY), "the Chinese set is not fetched").toBe(false);
  expect(await fetched(page, scripts, IAU_ONLY), "nor the Japanese").toBe(false);
});

test("japanese: the Japanese set, with its traditional figures; the Chinese set is still not fetched", async ({ page }) => {
  const { scripts } = await open(page, "&lang=ja&constellation-culture=japanese");
  await expect.poll(async () => (await sky(page)).culture, { timeout: 30_000 }).toBe("japanese");
  await figuresInView(page);
  // すばる (the Pleiades) is a figure of this set and not of the IAU's: picked by the page, its name is in kana where it is in view
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "constellation", "subaru"));
  expect((await sky(page)).pick, "the traditional figure is one that can be picked").toBe("subaru");
  let name = "";
  for (const lon of [-100, -70, -40, -10, 20, 50, 80, 110, 140, 170, 200, 230]) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("center", `${at},-24`), lon);
    try {
      await expect
        .poll(async () => page.locator(SPACE).evaluate((el) => (el.shadowRoot!.querySelector<HTMLElement>("#sk-names .sk-figure")!.hidden ? "" : (el.shadowRoot!.querySelector("#sk-names .sk-figure")!.textContent ?? ""))), { timeout: 3000 })
        .not.toBe("");
      name = await page.locator(SPACE).evaluate((el) => el.shadowRoot!.querySelector("#sk-names .sk-figure")!.textContent ?? "");
      break;
    } catch {
      // the next direction
    }
  }
  expect(name, "its name is すばる, as a Japanese reader says it").toBe("すばる");
  // the 88 are in this set too, by their Japanese names
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "constellation", "Ori"));
  expect((await sky(page)).pick).toBe("Ori");
  expect(await fetched(page, scripts, IAU_ONLY), "the Japanese set was fetched").toBe(true);
  expect(await fetched(page, scripts, CHINESE_ONLY), "the Chinese set was not").toBe(false);
});

test("chinese: its figures, fetched only for it", async ({ page }) => {
  const { scripts } = await open(page, "&constellation-culture=chinese");
  await expect.poll(async () => (await sky(page)).culture, { timeout: 30_000 }).toBe("chinese");
  await figuresInView(page);
  expect(await fetched(page, scripts, CHINESE_ONLY), "the Chinese set was fetched").toBe(true);
  // the culture changes with the attribute: back to the IAU's, the picked figure is let go
  await page.locator(SPACE).evaluate((el) => el.setAttribute("constellation-culture", "iau"));
  await expect.poll(async () => (await sky(page)).culture).toBe("iau");
});

test("a value that is not a culture is the IAU's, with one warning", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("klingon")) warnings.push(message.text());
  });
  await open(page, "&constellation-culture=klingon");
  await figuresInView(page);
  expect((await sky(page)).culture).toBe("iau");
  await page.locator(SPACE).evaluate((el) => el.setAttribute("constellation-culture", "KLINGON"));
  await page.locator(SPACE).evaluate((el) => el.setAttribute("constellation-culture", "klingon"));
  await expect.poll(async () => warnings.length).toBe(1);
  expect(warnings[0]).toContain("constellation-culture");
});
