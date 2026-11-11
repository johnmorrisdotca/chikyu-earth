// The name written on the Earth (the family's body label), in a real browser (Chromium, drawn in software): off unless `body-label` is set, drawn on the globe so the picture changes, in the page's language, taken away again, hidden while the Earth is small,
// the same in the space view, and nothing drawn at rest. The time is held, so the picture only changes when the name does.
import { expect, test, type Page } from "@playwright/test";
import { EARTH, openEarth } from "./gl.ts";

test.describe.configure({ mode: "serial" });
// the demo opens still for a reader who prefers reduced motion (no Auto-turn), so the picture only changes when the name does
test.use({ reducedMotion: "reduce" });

interface LabelStats {
  on: boolean;
  text: string;
  made: boolean;
  showing: boolean;
}
const HELD = "time=2026-06-21T12:00Z&speed=0&camera=ground&center=0,0";
const labelOf = (page: Page, tag: string): Promise<LabelStats> => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { bodyLabel: LabelStats }).bodyLabel);
const picture = (page: Page, tag: string): Promise<Buffer> => page.locator(tag).screenshot();
/** The picture once it has stopped changing: two in a row are the same (the textures are in and nothing is moving). */
async function still(page: Page, tag: string): Promise<Buffer> {
  let last = await picture(page, tag);
  await expect
    .poll(
      async () => {
        const next = await picture(page, tag);
        const same = next.equals(last);
        last = next;
        return same;
      },
      { timeout: 60_000, message: "the picture has stopped changing" },
    )
    .toBe(true);
  return last;
}

for (const [name, tag, open] of [
  ["the realistic Earth", EARTH, async (page: Page, query: string) => openEarth(page, query)],
  [
    "the space view",
    "chikyu-space",
    async (page: Page, query: string) => {
      await page.goto(`/chikyu-earth/?look=space&${query}`);
      await page.locator("chikyu-space[data-state=live]").waitFor();
    },
  ],
] as const) {
  test.describe(name, () => {
    test("off unless asked for; set, the name is written on the globe and the picture changes; set to null, it goes", async ({ page }) => {
      await open(page, HELD);
      expect(await labelOf(page, tag)).toMatchObject({ on: false, made: false, showing: false });
      const before = await still(page, tag);
      // facing: the name keeps facing the camera, so it is on the picture wherever the view looks from
      await page.locator(tag).evaluate((el) => Reflect.set(el, "bodyLabel", { look: "painted", strength: 1, facing: true }));
      await expect.poll(async () => (await labelOf(page, tag)).made, { timeout: 30_000, message: "the family's label is loaded and made" }).toBe(true);
      await expect.poll(async () => (await labelOf(page, tag)).showing).toBe(true);
      expect(await labelOf(page, tag)).toMatchObject({ on: true, text: "EARTH" });
      await expect.poll(async () => !(await picture(page, tag)).equals(before), { timeout: 30_000, message: "the name is on the picture" }).toBe(true);
      const named = await picture(page, tag);
      // the property is the attributes: the family's plain names
      expect(await page.locator(tag).evaluate((el) => [el.getAttribute("body-label"), el.getAttribute("body-label-strength")])).toEqual(["painted", "1"]);
      expect(await page.locator(tag).evaluate((el) => Reflect.get(el, "bodyLabel"))).toEqual({ look: "painted", strength: 1, repeat: "once", latitude: 0, facing: true });
      // nothing is drawn at rest: thirty frames of the page's own and the draw count has not moved
      const draws = await page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
      await page.evaluate(async () => {
        for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      expect(await page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws), "no draw at rest").toBe(draws);
      await page.locator(tag).evaluate((el) => Reflect.set(el, "bodyLabel", null));
      await expect.poll(async () => (await labelOf(page, tag)).made).toBe(false);
      await expect.poll(async () => !(await picture(page, tag)).equals(named), { timeout: 30_000, message: "and the picture is not the one with the name" }).toBe(true);
      expect(await page.locator(tag).evaluate((el) => el.hasAttribute("body-label"))).toBe(false);
    });

    test("each look and a strength of 0 are different pictures, and the name is in the page's language", async ({ page }) => {
      await open(page, `${HELD}&lang=ja&body-label=etched`);
      await page.locator(tag).evaluate((el) => el.setAttribute("body-label-facing", ""));
      await expect.poll(async () => (await labelOf(page, tag)).showing, { timeout: 30_000 }).toBe(true);
      expect((await labelOf(page, tag)).text).toBe("地球");
      await page.locator(tag).evaluate((el) => el.setAttribute("body-label-strength", "1"));
      const etched = await still(page, tag);
      await page.locator(tag).evaluate((el) => el.setAttribute("body-label", "burned"));
      await expect.poll(async () => !(await picture(page, tag)).equals(etched), { timeout: 30_000, message: "burned is not etched" }).toBe(true);
      await page.locator(tag).evaluate((el) => el.setAttribute("body-label-strength", "0"));
      const none = await still(page, tag);
      await page.locator(tag).evaluate((el) => el.removeAttribute("body-label"));
      await expect.poll(async () => (await labelOf(page, tag)).made).toBe(false);
      await expect.poll(async () => (await picture(page, tag)).equals(none), { timeout: 30_000, message: "at strength 0 the picture is the one with no name" }).toBe(true);
    });
  });
}

test("the demo's Name buttons set the look on the element and in the address, and No name takes it away", async ({ page }) => {
  await openEarth(page, HELD);
  await expect(page.locator('#body-label-look [data-body-label=""]')).toHaveClass(/\bon\b/);
  // a press scrolls the buttons into view, which can take the Earth out of sight, where nothing is drawn: a reader looks back at the Earth to see its name
  await page.locator('#body-label-look [data-body-label="etched"]').click();
  await page.locator(EARTH).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await labelOf(page, EARTH)).made, { timeout: 30_000 }).toBe(true);
  expect(await page.locator(EARTH).evaluate((el) => el.getAttribute("body-label"))).toBe("etched");
  await expect.poll(() => new URL(page.url()).searchParams.get("body-label")).toBe("etched");
  await expect(page.locator('#body-label-look [data-body-label="etched"]')).toHaveClass(/\bon\b/);
  await page.locator('#body-label-look [data-body-label=""]').click();
  await page.locator(EARTH).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await labelOf(page, EARTH)).made).toBe(false);
  await expect.poll(() => new URL(page.url()).searchParams.get("body-label")).toBeNull();
});

test("the name is hidden while the Earth is small on the screen, and comes back when it is large", async ({ page }) => {
  await openEarth(page, `${HELD}&body-label=painted`);
  await expect.poll(async () => (await labelOf(page, EARTH)).showing, { timeout: 30_000 }).toBe(true);
  await page.locator(EARTH).evaluate((el) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 0.1, panX: 0, panY: 0 }, true));
  await expect.poll(async () => (await labelOf(page, EARTH)).showing, { message: "under 24 pixels in radius there is no name" }).toBe(false);
  await page.locator(EARTH).evaluate((el) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 }, true));
  await expect.poll(async () => (await labelOf(page, EARTH)).showing).toBe(true);
});
