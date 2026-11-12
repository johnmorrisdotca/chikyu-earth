// The credit line under the space view follows the bodies drawn: the view reads the body painter's `credit` again when a body drawing asks for a redraw (a picture arrived, a window of tiles changed), writes the line only
// when its text changed, and hides it when there is none. A painter of the test's own stands in for wakusei-planets', whose credit names the pictures of the bodies the view holds. Chromium, drawn in software.
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
/** wakusei-planets 0.39 is the first whose painter carries `credit` for its pictures. */
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

  // the painter is asked only for the bodies in the view and big enough to show their map, so the credit names those pictures: an Earth view with no CC BY body in it shows no CC BY line (MODULES-1192)
  test("the credit names the pictures of the bodies in the view: none CC BY in an Earth view, Nestaeric's with Jupiter, Solar System Scope's with the Sun; and it is read after the bodies are made", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __made: string[]; __readsAfterMake: number; __wrapBodyPainter: (real: object) => object; __real: { credit: { en: string } } };
      w.__made = [];
      w.__readsAfterMake = 0;
      w.__wrapBodyPainter = (real) => {
        w.__real = real as { credit: { en: string } };
        return new Proxy(real, {
          get(target, key) {
            if (key === "make") {
              return (...args: unknown[]) => {
                w.__made.push(String(args[1]));
                return (Reflect.get(target, "make") as (...a: unknown[]) => unknown).apply(target, args);
              };
            }
            if (key === "credit" && w.__made.length > 0) w.__readsAfterMake += 1;
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      };
    });
    await page.goto("/chikyu-earth/?look=space&time=2026-11-10T04:00Z&speed=0&center=-100,40");
    await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
    const made = (): Promise<string[]> => page.evaluate(() => [...new Set((window as unknown as { __made: string[] }).__made)].sort());
    await expect.poll(async () => (await made()).length, { timeout: 60_000, message: "a body is made" }).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    // an Earth view: the Moon is in it, and no other body is big enough
    console.log(`bodies the painter made in an Earth view: ${(await made()).join(", ")}`);
    expect(await made(), "the Moon is made, no planet and not the Sun").toEqual(["Moon"]);
    await expect(note(page)).not.toContainText("CC BY");
    await expect(note(page)).not.toContainText("Nestaeric");
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "body", "Jupiter"));
    await expect(note(page)).toContainText("Nestaeric", { timeout: 60_000 });
    await expect(note(page)).toContainText("CC BY 4.0");
    expect(await made()).toContain("Jupiter");
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "body", "Sun"));
    await expect(note(page)).toContainText("Solar System Scope", { timeout: 60_000 });
    await expect(note(page)).toContainText("CC BY 4.0");
    console.log(`bodies the painter made by then: ${(await made()).join(", ")}`);
    // the line is the painter's credit as it is now, and the view read it after the bodies were made (not only when it was set up)
    expect(await page.evaluate(() => (window as unknown as { __readsAfterMake: number }).__readsAfterMake), "the credit is read after a body is made").toBeGreaterThan(0);
    const real = await page.evaluate(() => (window as unknown as { __real: { credit: { en: string } } }).__real.credit.en);
    await expect(note(page)).toHaveText(real);
  });
});
