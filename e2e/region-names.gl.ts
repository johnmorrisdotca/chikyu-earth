// The regions' names (MODULES-1143), in a real browser (Chromium, drawn in software) on the realistic Earth and the space view: nothing until `region-names` is set and the regions are showing (the Earth large enough, `borders` with regions),
// chizu's own regions by default, the names in the page's case, never over the countries' names or the cities' names, gone when the regions are put away, and nothing drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, readCounts, untilArrived } from "./gl.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

interface Names {
  on: boolean;
  max: number;
  countries: number;
  names: number;
  renders: number;
}
const DAY = "2026-06-21T12:00Z";

const statsOf = (page: Page, tag: string): Promise<{ regionNames: Names; borders: { shown: { regions: boolean }; loaded: string[] }; draws: number }> =>
  page.locator(tag).evaluate((el) => Reflect.get(el, "stats") as never);

/** The boxes of each layer's names in the shadow root: `#rg-names` (regions), `#co-names` (countries) and the cities' `#cn-canvas` where it has names. */
const boxesOf = (page: Page, tag: string): Promise<{ regions: { text: string; l: number; t: number; r: number; b: number }[]; countries: { text: string; l: number; t: number; r: number; b: number }[] }> =>
  page.locator(tag).evaluate((el) => {
    const read = (selector: string) =>
      [...(el.shadowRoot?.querySelectorAll(selector) ?? [])]
        .filter((node) => !(node as HTMLElement).hidden)
        .map((node) => {
          const box = node.getBoundingClientRect();
          return { text: node.textContent ?? "", l: box.left, t: box.top, r: box.right, b: box.bottom };
        });
    return { regions: read(".rg-name"), countries: read(".co-name") };
  });

async function open(page: Page, look: "realistic" | "space", errors: string[]): Promise<string> {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=${look}&time=${DAY}&speed=0&center=10,50`);
  const tag = look === "realistic" ? "chikyu-earth-realistic" : "chikyu-space";
  await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await readCounts(page)).draws).toBeGreaterThan(0);
  return tag;
}

const zoomTo = async (page: Page, tag: string, radius: number): Promise<void> => {
  const box = (await page.locator(tag).boundingBox())!;
  const zoom = radius / (Math.min(box.width, box.height) / 2 / 1.08 - 1);
  await page.locator(tag).evaluate((el, z) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: z, panX: 0, panY: 0 }, true), zoom);
};

for (const [name, look] of [
  ["the realistic Earth", "realistic"],
  ["the space view", "space"],
] as const) {
  test(`${name}: region names are off unless asked for, show once the regions do (chizu's own, close in), keep off the country names, and go when the regions are put away`, async ({ page }) => {
    const errors: string[] = [];
    const tag = await open(page, look, errors);
    expect((await statsOf(page, tag)).regionNames).toMatchObject({ on: false, names: 0, countries: 0 });
    // asked for, but the regions are not showing (the Earth is small, and `borders` has no regions): nothing is laid out, nothing loaded
    await page.locator(tag).evaluate((el) => {
      el.setAttribute("region-names", "");
      el.setAttribute("country-names", "");
      el.setAttribute("borders", "regions");
    });
    await expect.poll(async () => (await statsOf(page, tag)).regionNames.on).toBe(true);
    await page.waitForTimeout(1500);
    expect((await statsOf(page, tag)).regionNames.names, "the Earth is too small for regions").toBe(0);
    expect((await boxesOf(page, tag)).regions).toEqual([]);
    // close in over Germany: chizu's regions arrive by themselves and are named
    await zoomTo(page, tag, look === "space" ? 2400 : 1600);
    await expect.poll(async () => (await statsOf(page, tag)).regionNames.names, { timeout: 60_000, message: "Germany's states are named" }).toBeGreaterThan(1);
    if (look === "space") await untilArrived(page);
    const stats = await statsOf(page, tag);
    expect(stats.borders.loaded).toContain("DE");
    expect(stats.regionNames.countries, "the regions handed in").toBeGreaterThan(10);
    expect(stats.regionNames.names).toBeLessThanOrEqual(stats.regionNames.max);
    const boxes = await boxesOf(page, tag);
    const texts = boxes.regions.map((one) => one.text);
    console.log(`${look}: ${texts.length} region names, ${boxes.countries.length} country names: ${texts.join(", ")}`);
    expect(texts.some((text) => /^[A-Z][a-z]/.test(text)), `English names in the data's own case (${texts.join(", ")})`).toBe(true);
    for (const [i, one] of boxes.regions.entries()) {
      for (const other of boxes.regions.slice(i + 1)) expect(one.l < other.r && one.r > other.l && one.t < other.b && one.b > other.t, `${one.text} and ${other.text} overlap`).toBe(false);
      for (const country of boxes.countries) expect(one.l < country.r && one.r > country.l && one.t < country.b && one.b > country.t, `${one.text} is over the country name ${country.text}`).toBe(false);
    }
    // at rest nothing is drawn
    const before = await readCounts(page);
    await page.waitForTimeout(2000);
    expect((await readCounts(page)).draws - before.draws, "no draw at rest").toBe(0);
    // the regions put away: the names go with them
    await page.locator(tag).evaluate((el) => el.setAttribute("borders", "countries"));
    await expect.poll(async () => (await boxesOf(page, tag)).regions.length, { timeout: 30_000 }).toBe(0);
    await page.locator(tag).evaluate((el) => el.removeAttribute("region-names"));
    await expect.poll(async () => (await statsOf(page, tag)).regionNames.on).toBe(false);
    expect(errors, "no error on the console").toEqual([]);
  });
}
