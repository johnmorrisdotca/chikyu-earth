// The keyboard's way to the places on the Earth, on the realistic Earth and in the space view (Chromium, drawn in software): with the element focused, P goes to the next place from the left and
// Shift+P back, a ring shows which place it is, its name is said in the live region, Enter sends the same chikyu-place-click a press does, and the view's own keys still turn the view.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { COUNT_SCRIPT, EARTH, NOON, openEarth } from "./gl.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const TOKYO = { lon: 139.69, lat: 35.69 };
const PLACES = [
  { id: "here", lon: TOKYO.lon, lat: TOKYO.lat, label: "Tokyo", kind: "here" },
  { id: "osaka", lon: 135.5, lat: 34.69, label: "Osaka", kind: "favourite" },
  { id: "seoul", lon: 126.98, lat: 37.57, label: "Seoul", kind: "favourite" },
  { id: "far", lon: -40, lat: -30, label: "Far side", kind: "favourite" },
];

const setPlaces = (target: Locator, places: unknown[]): Promise<void> => target.evaluate((el, list) => void Reflect.set(el, "places", list), places);
const shown = (target: Locator): Promise<number> => target.evaluate((el) => (Reflect.get(el, "stats") as { places: { shown: number } }).places.shown);
const said = (target: Locator): Promise<string> => target.evaluate((el) => el.shadowRoot!.getElementById("place-live")!.textContent ?? "");
/** Where the ring is, its centre in the page, or null while it is not shown. */
const ring = (target: Locator): Promise<{ x: number; y: number } | null> =>
  target.evaluate((el) => {
    const mark = el.shadowRoot!.querySelector<HTMLElement>(".pl-current:not([hidden])");
    if (!mark) return null;
    const box = mark.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
/** Where the `here` marker's foot is, in the page. */
const hereFoot = (target: Locator): Promise<{ x: number; y: number }> =>
  target.evaluate((el) => {
    const box = el.shadowRoot!.querySelector<HTMLElement>(".pl-mark[data-kind=here]:not([hidden])")!.getBoundingClientRect();
    return { x: box.left, y: box.top };
  });
const record = (target: Locator): Promise<void> =>
  target.evaluate((el) => {
    const told: unknown[] = [];
    Reflect.set(window, "told", told);
    el.addEventListener("chikyu-place-click", (event) => told.push((event as CustomEvent).detail));
  });
const told = (page: Page): Promise<{ id: string; kind: string; label?: string; x: number; y: number }[]> => page.evaluate(() => Reflect.get(window, "told") as never);

async function openSpace(page: Page): Promise<Locator> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&speed=0&time=2026-11-02T03:00Z&center=${TOKYO.lon},${TOKYO.lat}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
  return page.locator(SPACE);
}

for (const where of ["earth", "space"] as const) {
  test.describe(where === "space" ? "in the space view" : "on the realistic Earth", () => {
    test.use({ reducedMotion: "reduce" });

    test("P moves between the places from the left, a ring and the live region say which, Enter sends chikyu-place-click and Escape lets go", async ({ page }) => {
      let target: Locator;
      if (where === "space") target = await openSpace(page);
      else {
        await openEarth(page, `time=${NOON}&center=${TOKYO.lon},${TOKYO.lat}&hide=Cities,Stadiums`);
        target = page.locator(EARTH);
      }
      await setPlaces(target, PLACES);
      await expect.poll(() => shown(target)).toBe(3);
      await record(target);
      expect(await target.getAttribute("role"), "with places it is a group, so a screen reader reads what is said").toBe("group");

      await target.focus();
      expect(await ring(target), "no ring before a key").toBeNull();
      await page.keyboard.press("p");
      expect(await said(target)).toBe("Seoul, 1 of 3");
      await page.keyboard.press("p");
      expect(await said(target)).toBe("Osaka, 2 of 3");
      await page.keyboard.press("p");
      expect(await said(target)).toBe("Tokyo, 3 of 3");
      expect(await target.ariaSnapshot(), "a screen reader is given the name").toContain("status: Tokyo, 3 of 3");

      const foot = await hereFoot(target);
      const at = (await ring(target))!;
      expect(Math.abs(at.x - foot.x), "the ring is on the place").toBeLessThan(1.5);
      expect(Math.abs(at.y - foot.y)).toBeLessThan(1.5);

      await page.keyboard.press("Shift+P");
      expect(await said(target)).toBe("Osaka, 2 of 3");
      await page.keyboard.press("Shift+P");
      await page.keyboard.press("Shift+P");
      expect(await said(target), "back round to the last").toBe("Tokyo, 3 of 3");
      await page.keyboard.press("p");
      expect(await said(target), "on round to the first").toBe("Seoul, 1 of 3");

      await page.keyboard.press("Shift+P");
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await told(page)).length).toBe(1);
      const [detail] = await told(page);
      expect(detail).toMatchObject({ id: "here", kind: "here", label: "Tokyo" });
      expect(Math.abs(detail!.x - (foot.x - (await target.boundingBox())!.x))).toBeLessThan(1.5);

      await page.keyboard.press("Escape");
      expect(await ring(target)).toBeNull();
      expect(await said(target)).toBe("");
      await page.keyboard.press("Enter");
      expect((await told(page)).length, "Enter with no place current tells nothing").toBe(1);
    });

    test("the view's own keys still turn the view and the ring follows it, and leaving the element lets go of the place", async ({ page }) => {
      let target: Locator;
      if (where === "space") target = await openSpace(page);
      else {
        await openEarth(page, `time=${NOON}&center=${TOKYO.lon},${TOKYO.lat}&hide=Cities,Stadiums`);
        target = page.locator(EARTH);
      }
      await setPlaces(target, PLACES);
      await expect.poll(() => shown(target)).toBe(3);
      await target.focus();
      await page.keyboard.press("Shift+P");
      expect(await said(target)).toBe("Tokyo, 3 of 3");
      const before = (await ring(target))!;

      await page.keyboard.press("ArrowLeft");
      await expect.poll(async () => ((await ring(target)) ?? { x: before.x }).x).not.toBe(before.x);
      const foot = await hereFoot(target);
      const at = (await ring(target))!;
      expect(Math.abs(at.x - foot.x), "the ring stayed on the place").toBeLessThan(1.5);

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      expect(await ring(target), "focus left the element").toBeNull();
    });

    test("the words are Japanese on a Japanese page, and a place off the globe is not pressed", async ({ page }) => {
      let target: Locator;
      if (where === "space") target = await openSpace(page);
      else {
        await openEarth(page, `time=${NOON}&center=${TOKYO.lon},${TOKYO.lat}&hide=Cities,Stadiums`);
        target = page.locator(EARTH);
      }
      await page.evaluate(() => document.documentElement.setAttribute("lang", "ja"));
      await setPlaces(target, PLACES);
      await expect.poll(() => shown(target)).toBe(3);
      await record(target);
      await target.focus();
      await page.keyboard.press("p");
      expect(await said(target)).toBe("Seoul、3か所のうち1番目");
      expect(await target.evaluate((el) => el.shadowRoot!.getElementById("place-live")!.lang)).toBe("ja");

      await target.evaluate((el) => el.setAttribute("center", "-40,-30"));
      await expect.poll(() => ring(target)).toBeNull();
      await page.keyboard.press("Enter");
      expect(await said(target)).toBe("Seoulは見えていません");
      expect((await told(page)).length).toBe(0);
    });
  });
}
