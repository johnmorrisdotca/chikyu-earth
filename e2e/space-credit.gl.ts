// The credit line under the space view follows the bodies drawn: the view reads the body painter's `credit` again when a body drawing asks for a redraw (a picture arrived, a window of tiles changed), writes the line only
// when its text changed, and hides it when there is none. A painter of the test's own stands in for wakusei-planets', whose credit names the pictures on the screen now. Chromium, drawn in software.
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const WAKUSEI = (() => {
  try {
    return (createRequire(import.meta.url)("@johnmorrisdotca/wakusei-planets/package.json") as { version: string }).version;
  } catch {
    return "0.0.0";
  }
})();
const [WAKUSEI_MAJOR, WAKUSEI_MINOR] = WAKUSEI.split(".").map(Number) as [number, number];
/** wakusei-planets 0.39 is the first whose painter carries `credit` for the pictures on the screen. */
const HAS_CREDIT = WAKUSEI_MAJOR > 0 || WAKUSEI_MINOR >= 39;

const SPACE = "chikyu-space";
const NOTE = `${SPACE} #bodies-note`;

/** Hands the page a painter whose credit is `window.__credit` (the demo uses `window.__bodyPainter` in place of wakusei-planets'), and whose drawings keep the context they were given, so the test can ask for a redraw as a picture arriving would. */
async function stubPainter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __credit: { en: string; ja: string } | undefined; __redraws: (() => void)[]; __bodyPainter: unknown };
    w.__credit = { en: "Pictures: A", ja: "画像：A" };
    w.__redraws = [];
    w.__bodyPainter = {
      looks: ["stub"],
      get credit() {
        return w.__credit;
      },
      make(three: { Group: new () => unknown }, _name: string, context?: { invalidate(): void }) {
        if (context) w.__redraws.push(() => context.invalidate());
        return { object: new three.Group(), dispose: () => undefined };
      },
    };
  });
}

const note = (page: Page) => page.locator(NOTE);
const setCredit = async (page: Page, credit: { en: string; ja: string } | undefined): Promise<void> => {
  await page.evaluate((c) => Reflect.set(window, "__credit", c), credit);
};
const redraw = (page: Page): Promise<void> => page.evaluate(() => (Reflect.get(window, "__redraws") as (() => void)[])[0]!());

test("the credit follows the painter's credit at each redraw a body asks for, is written only when it changed, and goes when there is none", async ({ page }) => {
  await stubPainter(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-10T04:00Z&speed=0&center=-100,40");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  const told: unknown[] = [];
  await page.exposeFunction("__told", (detail: unknown) => told.push(detail));
  await page.locator(SPACE).evaluate((el) => el.addEventListener("chikyu-bodies-credit", (event) => (Reflect.get(window, "__told") as (d: unknown) => void)((event as CustomEvent).detail)));
  await expect.poll(async () => (await page.evaluate(() => (Reflect.get(window, "__redraws") as unknown[]).length)), { timeout: 30_000, message: "a body was made by the painter" }).toBeGreaterThan(0);
  await expect(note(page)).toHaveText("Pictures: A", { timeout: 30_000 });
  await expect(note(page)).toBeVisible();

  // a picture arrived: the credit now names another set, and the line follows at the redraw
  await setCredit(page, { en: "Pictures: B", ja: "画像：B" });
  await redraw(page);
  await expect(note(page)).toHaveText("Pictures: B");
  await expect.poll(() => told.at(-1), { message: "a page that writes the credit itself is told" }).toEqual({ en: "Pictures: B", ja: "画像：B" });
  const heard = told.length;

  // the same text asked for over and over writes nothing
  await page.evaluate(() => {
    const target = document.querySelector("chikyu-space")!.shadowRoot!.getElementById("bodies-note")!;
    const seen: number[] = [];
    Reflect.set(window, "__writes", seen);
    new MutationObserver((records) => seen.push(records.length)).observe(target, { childList: true, characterData: true, attributes: true, subtree: true });
  });
  for (let i = 0; i < 10; i += 1) await redraw(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (Reflect.get(window, "__writes") as number[]).length), "no write while the text is the same").toBe(0);
  expect(told.length, "and nothing is told").toBe(heard);

  // the Japanese page
  await page.locator(SPACE).evaluate((el) => el.setAttribute("lang", "ja"));
  await page.evaluate(() => document.documentElement.setAttribute("lang", "ja"));
  await redraw(page);
  await expect(note(page)).toHaveText("画像：B");

  // no credit, no line
  await setCredit(page, undefined);
  await redraw(page);
  await expect(note(page)).toBeHidden();
  await expect.poll(() => told.at(-1)).toBeNull();
});

test.describe("with wakusei-planets' own painter", () => {
  test.skip(!HAS_CREDIT, `wakusei-planets ${WAKUSEI} has no painter credit yet (0.39 and later)`);

  test("Jupiter drawn shows Nestaeric's credit, and a view with no CC BY body shows none", async ({ page }) => {
    await page.goto("/chikyu-earth/?look=space&time=2026-11-10T04:00Z&speed=0&center=-100,40");
    await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "body", "Jupiter"));
    await expect(note(page)).toContainText("Nestaeric", { timeout: 60_000 });
    await expect(note(page)).toContainText("CC BY 4.0");
    // the Earth and its Moon: public-domain pictures only, so no CC BY line
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "body", "Earth"));
    await expect(note(page)).not.toContainText("Nestaeric", { timeout: 60_000 });
    await expect(note(page)).not.toContainText("CC BY 4.0");
  });
});
