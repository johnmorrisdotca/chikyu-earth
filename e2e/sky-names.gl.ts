// The names of the brightest stars and the constellations as faint lines, over the space view's sky (hoshi-stars' sky labels), in a real browser (Chromium, drawn in software): off unless an attribute asks for it, names that never overlap and are
// in the page's language, none behind the Earth, a figure lit by the pointer, and nothing drawn at rest.
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
const HELD = "time=2026-11-02T14:00Z&speed=0&center=-100,40";
interface Sky {
  on: boolean;
  loaded: boolean;
  names: number;
  figures: number;
  picked: string | null;
  renders: number;
}
const skyOf = (page: Page): Promise<Sky> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { sky: Sky }).sky);

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/chikyu-earth/?look=space&${HELD}${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
}
const names = (page: Page): Promise<{ text: string; l: number; t: number; r: number; b: number }[]> =>
  page.locator(SPACE).evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLElement>("#sk-names .sk-name")]
      .filter((b) => !b.hidden)
      .map((b) => {
        const box = b.getBoundingClientRect();
        return { text: b.textContent ?? "", l: box.left, t: box.top, r: box.right, b: box.bottom };
      }),
  );
/** A point on the canvas that is drawn on (a line of a figure), found by looking, in CSS pixels from the element's top left. */
const aLine = (page: Page): Promise<{ x: number; y: number } | null> =>
  page.locator(SPACE).evaluate((el) => {
    const canvas = el.shadowRoot!.getElementById("sk-canvas") as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const rect = el.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y += 3) for (let x = 0; x < canvas.width; x += 3) if (data[(y * canvas.width + x) * 4 + 3]! > 6) return { x: x / sx, y: y / sy };
    return null;
  });

test("off unless asked for: no layer, nothing loaded, then the attributes switch it on and off", async ({ page }) => {
  await open(page);
  expect(await skyOf(page)).toMatchObject({ on: false, loaded: false, names: 0, figures: 0 });
  expect(await page.locator(SPACE).evaluate((el) => el.shadowRoot!.getElementById("sk-canvas"))).toBeNull();
  await page.locator(SPACE).evaluate((el) => el.setAttribute("star-names", "12"));
  await expect.poll(async () => (await skyOf(page)).loaded, { timeout: 30_000, message: "hoshi-stars is loaded when asked for" }).toBe(true);
  await expect.poll(async () => (await skyOf(page)).names, { timeout: 30_000, message: "the font is in, and the names are laid out" }).toBeGreaterThan(0);
  await expect.poll(async () => (await names(page)).length, { timeout: 30_000, message: "and they are on the page" }).toBeGreaterThan(0);
  expect((await names(page)).length).toBeLessThanOrEqual(12);
  await page.locator(SPACE).evaluate((el) => el.removeAttribute("star-names"));
  await expect.poll(async () => (await skyOf(page)).names, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => (await names(page)).length, { timeout: 30_000 }).toBe(0);
});

test("the names are of stars in view, in the page's language, never overlap, and fewer where the Earth covers the sky", async ({ page }) => {
  await open(page, "&lang=ja&star-names=12");
  // what the reader sees is the names on the page: wait for those, not for the count the layer reports
  await expect.poll(async () => (await names(page)).length, { timeout: 30_000 }).toBeGreaterThan(0);
  // the page's language may arrive after the names were first laid out: they are written again in it
  await expect.poll(async () => (await names(page)).some((n) => /[゠-ヿ]/.test(n.text)), { timeout: 30_000, message: "the names are in katakana" }).toBe(true);
  const shown = await names(page);
  for (let i = 0; i < shown.length; i += 1) {
    for (let j = i + 1; j < shown.length; j += 1) {
      const a = shown[i]!;
      const b = shown[j]!;
      expect(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `${a.text} and ${b.text} do not overlap`).toBe(true);
    }
  }
  // katakana, in a page in Japanese (a star with no katakana is named in English)
  expect(shown.some((n) => /[゠-ヿ]/.test(n.text))).toBe(true);
  const fewer = shown.length;
  // the Earth fills the view: it covers the sky, so the stars behind it are not named
  await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 8, panX: 0, panY: 0 }, true));
  await expect.poll(async () => (await names(page)).length, { timeout: 30_000 }).toBeLessThanOrEqual(fewer);
});

test("the constellations are faint lines, the figure under the pointer is lit, and a name shows", async ({ page }) => {
  await open(page, "&constellation-lines=0.16");
  await expect.poll(async () => (await skyOf(page)).figures, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await aLine(page)) !== null, { timeout: 30_000, message: "a line is drawn" }).toBe(true);
  const at = (await aLine(page))!;
  expect((await skyOf(page)).picked).toBeNull();
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await expect.poll(async () => (await skyOf(page)).picked, { message: "the figure the pointer is on is picked" }).not.toBeNull();
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => !el.shadowRoot!.querySelector<HTMLElement>("#sk-names .sk-figure")!.hidden), { message: "and its name is shown" }).toBe(true);
  // the pointer leaves: the pick goes
  await page.mouse.move(box.x - 5, box.y - 5);
  await expect.poll(async () => (await skyOf(page)).picked).toBeNull();
});

test("nothing is drawn at rest, with names and lines on and the clock held", async ({ page }) => {
  await open(page, "&star-names=12&constellation-lines=0.16");
  await expect.poll(async () => (await skyOf(page)).names, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 10; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  const drawn = (await skyOf(page)).renders;
  const draws = await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await skyOf(page)).renders, "the layer is not drawn again").toBe(drawn);
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws), "and neither is the picture").toBe(draws);
});

test("the demo's Star names and Constellations buttons set the attributes and the address", async ({ page }) => {
  await open(page);
  await page.locator("#star-names").click();
  await expect.poll(async () => (await skyOf(page)).loaded, { timeout: 30_000 }).toBe(true);
  expect(await page.locator(SPACE).evaluate((el) => el.getAttribute("star-names"))).toBe("12");
  await expect.poll(() => new URL(page.url()).searchParams.get("star-names")).toBe("12");
  await page.locator("#constellation-lines").click();
  await expect.poll(async () => (await skyOf(page)).figures, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.locator("#star-names").click();
  await page.locator("#constellation-lines").click();
  await expect.poll(() => new URL(page.url()).searchParams.get("constellation-lines")).toBeNull();
  await expect.poll(async () => (await skyOf(page)).on).toBe(false);
});
