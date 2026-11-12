// The painter is asked for a body (and so loads and holds its pictures) only when the body is in the view and big enough to show its map (MODULES-1192): an Earth view loads none of the far planets' pictures and shows no
// CC BY line; going to Jupiter makes Jupiter and credits Nestaeric; coming back lets it go; the GPU objects are flat across the moves, and nothing is drawn at rest. Chromium, drawn in software.
import { alive, COUNT_SCRIPT, readCounts, settle } from "./gl.ts";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
const NOTE = `${SPACE} #bodies-note`;
interface Stats {
  draws: number;
  bodies: { look: string; painted: number; mapped?: number; moon: boolean };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
const mapped = async (page: Page): Promise<number> => (await statsOf(page)).bodies.mapped ?? -1;

/** The pictures of the planets requested so far, by body, with the bytes they took. */
function watchPictures(page: Page): { names: Set<string>; bytes: () => Promise<number> } {
  const names = new Set<string>();
  page.on("request", (request) => {
    const match = /\/planets\/(\w+)-\d+\.webp$/.exec(request.url());
    if (match) names.add(match[1]!);
  });
  return { names, bytes: () => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\/planets\/\w+-\d+\.webp$/.test(e.name)).reduce((sum, e) => sum + ((e as PerformanceResourceTiming).decodedBodySize || 0), 0)) };
}
async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-10T04:00Z&speed=0&center=-100,40`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).bodies.painted, { timeout: 30_000 }).toBe(9);
}
/** Nothing changing: no draw for a while. */
async function still(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = (await readCounts(page)).draws;
        await page.waitForTimeout(1500);
        return (await readCounts(page)).draws - before;
      },
      { timeout: 60_000, message: "the view is at rest" },
    )
    .toBe(0);
}
const body = async (page: Page, name: string): Promise<void> => {
  await page.locator(SPACE).evaluate((el, n) => Reflect.set(el, "body", n), name);
};
const gpu = async (page: Page): Promise<{ textures: number; buffers: number; objects: number }> => {
  const c = await readCounts(page);
  return { textures: alive(c, "Texture"), buffers: alive(c, "Buffer"), objects: Object.keys(c.created).reduce((sum, k) => sum + alive(c, k as keyof typeof c.created), 0) };
};

test("an Earth view loads the pictures of the bodies in it only, shows no CC BY line, and the planets out of it are plain spheres", async ({ page }) => {
  const pictures = watchPictures(page);
  await open(page);
  await still(page);
  await settle(page, 1500);
  const taken = await gpu(page);
  console.log(`Earth view: ${await mapped(page)} bodies with the painter's pictures, pictures requested: ${[...pictures.names].sort().join(", ") || "none"} (${await pictures.bytes()} bytes), live GL textures ${taken.textures}, buffers ${taken.buffers}, objects ${taken.objects}`);
  expect(await mapped(page), "only the bodies in the view and big enough have the painter's pictures").toBeLessThanOrEqual(2);
  for (const far of ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) expect(pictures.names.has(far), `${far}'s picture is not loaded in an Earth view`).toBe(false);
  // the bodies are still all drawn (as plain spheres)
  expect((await statsOf(page)).bodies.painted).toBe(9);
  // no body with a CC BY picture is in the view: no CC BY line
  const text = await page.locator(NOTE).textContent();
  expect(text ?? "", "no CC BY line in an Earth view").not.toContain("CC BY");
});

test("going to Jupiter makes Jupiter and credits it, coming back lets it go, the GPU objects are flat across the moves and nothing is drawn at rest", async ({ page }) => {
  const pictures = watchPictures(page);
  await open(page);
  await still(page);
  const home = await mapped(page);
  const counts: number[] = [];
  for (let round = 0; round < 4; round += 1) {
    await body(page, "Jupiter");
    await expect(page.locator(NOTE)).toContainText("Nestaeric", { timeout: 60_000 });
    await expect(page.locator(NOTE)).toContainText("CC BY 4.0");
    expect(pictures.names.has("jupiter"), "Jupiter's picture is loaded once it is the view").toBe(true);
    expect(await mapped(page)).toBeGreaterThan(home);
    await body(page, "Earth");
    // let go once it has been out of the view for a while
    await expect.poll(() => mapped(page), { timeout: 30_000, message: "Jupiter is let go" }).toBe(home);
    await still(page);
    counts.push((await gpu(page)).objects);
    expect((await readCounts(page)).contexts).toBe(1);
    await expect(page.locator(NOTE)).not.toContainText("Nestaeric", { timeout: 30_000 });
  }
  console.log(`live GPU objects after each round to Jupiter and back: ${counts.join(", ")} (${await pictures.bytes()} picture bytes in all)`);
  expect(Math.max(...counts.slice(1)), "no more GPU objects after four rounds than after the first, give or take three.js's own").toBeLessThanOrEqual(counts[0]! + 8);
  const before = (await readCounts(page)).draws;
  await page.waitForTimeout(3000);
  expect((await readCounts(page)).draws, "nothing is drawn at rest").toBe(before);
});
