// The names of the brightest stars and the constellations as faint lines, over the space view's sky (hoshi-stars' sky labels), in a real browser (Chromium, drawn in software): off unless an attribute asks for it, names that never overlap and are
// in the page's language, none behind the Earth, a figure lit by the pointer, and nothing drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

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
/**
 * The picture opens with the Earth filling most of it, so the sky shows only in its corners and holds few named stars (a view of 35 degrees has about two on average): make the Earth small and turn the view round until the picture has at least
 * `least` names (or figures), so what is asserted is the layer and not where the camera happened to look.
 */
async function wideSky(page: Page, least = 4, what: "names" | "figures" = "names"): Promise<void> {
  await page.locator(SPACE).evaluate((el) => el.setAttribute("earth-size", "0.3"));
  for (const lon of [-100, -40, 20, 80, 140, 200]) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("center", `${at},20`), lon);
    try {
      if (what === "names") await expect.poll(async () => (await names(page)).length, { timeout: 8000 }).toBeGreaterThanOrEqual(least);
      else await expect.poll(async () => (await skyOf(page)).figures, { timeout: 8000 }).toBeGreaterThanOrEqual(least);
      return;
    } catch {
      // the next direction
    }
  }
  throw new Error(`no direction of the sky showed ${least} ${what}`);
}
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
  const heightBefore = await page.locator(SPACE).evaluate((el) => el.getBoundingClientRect().height);
  expect(await skyOf(page)).toMatchObject({ on: false, loaded: false, names: 0, figures: 0 });
  expect(await page.locator(SPACE).evaluate((el) => el.shadowRoot!.getElementById("sk-canvas"))).toBeNull();
  await page.locator(SPACE).evaluate((el) => el.setAttribute("star-names", "12"));
  await expect.poll(async () => (await skyOf(page)).loaded, { timeout: 30_000, message: "hoshi-stars is loaded when asked for" }).toBe(true);
  await wideSky(page);
  // the layer is styled: the names are laid over the picture (absolutely placed) and add nothing to its height
  const layout = await page.locator(SPACE).evaluate((el) => {
    const name = el.shadowRoot!.querySelector<HTMLElement>("#sk-names .sk-name:not([hidden])")!;
    const canvas = el.shadowRoot!.getElementById("sk-canvas")!;
    const own = el.getBoundingClientRect();
    return { name: getComputedStyle(name).position, canvas: getComputedStyle(canvas).position, height: own.height, halo: getComputedStyle(name).textShadow };
  });
  expect(layout.name, "a name is placed over the picture").toBe("absolute");
  expect(layout.canvas, "and so is the lines' canvas").toBe("absolute");
  expect(Math.abs(layout.height - heightBefore), "the picture is as high as it was: the layer adds no height").toBeLessThan(2);
  expect(layout.halo, "a name has its outline").not.toBe("none");
  await wideSky(page);
  // the layer's count and the names on the page, read in one go so the view cannot move between the two
  const both = await page.locator(SPACE).evaluate((el) => ({
    counted: (Reflect.get(el, "stats") as { sky: { names: number } }).sky.names,
    shown: [...el.shadowRoot!.querySelectorAll<HTMLElement>("#sk-names .sk-name")].filter((b) => !b.hidden).length,
  }));
  expect(both.counted, "the layer's count is what is on the page").toBe(both.shown);
  expect(both.shown).toBeLessThanOrEqual(12);
  await page.locator(SPACE).evaluate((el) => el.removeAttribute("star-names"));
  await expect.poll(async () => (await skyOf(page)).names, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => (await names(page)).length, { timeout: 30_000 }).toBe(0);
});

test("the names are of stars in view, in the page's language, never overlap, and fewer where the Earth covers the sky", async ({ page }) => {
  await open(page, "&lang=ja&star-names=12");
  await wideSky(page);
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
  await expect.poll(async () => (await names(page)).length, { timeout: 30_000, message: "fewer stars are named when the Earth covers the sky" }).toBeLessThan(fewer);
});

test("the constellations are faint lines, the figure under the pointer is lit, and a name shows", async ({ page }) => {
  await open(page, "&constellation-lines=0.16");
  await wideSky(page, 3, "figures");
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
  await wideSky(page);
  const frames = (count: number): Promise<void> =>
    page.evaluate(async (n) => {
      for (let frame = 0; frame < n; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    }, count);
  const draws = (): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
  // a new view (the smaller Earth, the turn to a richer sky) asks for sharper pictures, and each one is a draw, and the layer follows each: wait until the page has gone thirty frames with no draw at all
  await expect
    .poll(
      async () => {
        const before = await draws();
        await frames(30);
        return (await draws()) - before;
      },
      { timeout: 60_000, message: "the picture is at rest" },
    )
    .toBe(0);
  const drawn = (await skyOf(page)).renders;
  const picture = await draws();
  await frames(30);
  expect(await draws(), "the picture is still").toBe(picture);
  expect((await skyOf(page)).renders, "and the layer is not drawn again").toBe(drawn);
});

test("the demo's Star names and Constellations buttons set the attributes and the address", async ({ page }) => {
  await open(page);
  await page.locator("#star-names").click();
  await expect.poll(async () => (await skyOf(page)).loaded, { timeout: 30_000 }).toBe(true);
  expect(await page.locator(SPACE).evaluate((el) => el.getAttribute("star-names"))).toBe("12");
  await expect.poll(() => new URL(page.url()).searchParams.get("star-names")).toBe("12");
  await page.locator("#constellation-lines").click();
  await expect.poll(() => page.locator(SPACE).evaluate((el) => el.getAttribute("constellation-lines"))).toBe("0.16");
  await expect.poll(() => new URL(page.url()).searchParams.get("constellation-lines")).toBe("0.16");
  await page.locator("#star-names").click();
  await page.locator("#constellation-lines").click();
  await expect.poll(() => new URL(page.url()).searchParams.get("constellation-lines")).toBeNull();
  await expect.poll(async () => (await skyOf(page)).on).toBe(false);
});

test("riding along the ISS, with the Earth 70 degrees across, no star is named on the Earth: the cover is the ray's, not a circle on the screen", async ({ page }) => {
  await routeElements(page);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations&ride=iss&rlook=horizon&light=lit&star-names=40`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean; gliding: boolean } }).ride)).gliding, { timeout: 30_000 }).toBe(false);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  // turn round the sky, a step at a time as a drag gives it, until some of it is in the picture above the Earth's edge
  let checked = 0;
  for (const yaw of [0, 100, 200, 300, 400, 500]) {
    await page.locator("kazoku-view-controls").evaluate((el, v) => (el as unknown as { controller: { set(view: unknown, final: boolean, why: string): void } }).controller.set({ yaw: ((v + 180) % 360) - 180, tilt: 0, zoom: 1 }, true, "test"), yaw);
    await expect
      .poll(
        async () => {
          const before = await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
          await page.evaluate(async () => {
            for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
          });
          return (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws)) - before;
        },
        { timeout: 60_000, message: "the view is at rest" },
      )
      .toBe(0);
    // the names' places in the picture, from its own top left (read in one go, so a scroll of the page between the readings cannot change them)
    const shown = await page.locator(SPACE).evaluate((el) => {
      const own = el.getBoundingClientRect();
      return [...el.shadowRoot!.querySelectorAll<HTMLElement>("#sk-names .sk-name")]
        .filter((b) => !b.hidden)
        .map((b) => {
          const box = b.getBoundingClientRect();
          return { text: b.textContent ?? "", x: (box.left + box.right) / 2 - own.left, y: (box.top + box.bottom) / 2 - own.top };
        });
    });
    if (shown.length === 0) continue;
    // the Earth's edge down each column a name is in, found with the names and rings hidden: the brightest step down the column
    await page.locator(SPACE).evaluate((el) => {
      el.shadowRoot!.getElementById("sk-names")!.style.visibility = "hidden";
      el.shadowRoot!.getElementById("sk-canvas")!.style.visibility = "hidden";
    });
    const shot = (await page.locator(SPACE).screenshot()).toString("base64");
    await page.locator(SPACE).evaluate((el) => {
      el.shadowRoot!.getElementById("sk-names")!.style.visibility = "";
      el.shadowRoot!.getElementById("sk-canvas")!.style.visibility = "";
    });
    const width = await page.locator(SPACE).evaluate((el) => el.getBoundingClientRect().width);
    const limbs = await page.evaluate(
      async ({ data, columns }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const scale = image.width / (columns.width as number);
        return (columns.at as number[]).map((x) => {
          const column = context.getImageData(Math.max(0, Math.min(image.width - 1, Math.round(x * scale))), 0, 1, image.height).data;
          const light = (y: number): number => column[y * 4]! + column[y * 4 + 1]! + column[y * 4 + 2]!;
          let best = 0;
          let edge = image.height;
          for (let y = 4; y < image.height - 4; y += 1) {
            const step = (light(y + 3) + light(y + 2) + light(y + 1)) / 3 - (light(y - 1) + light(y - 2) + light(y - 3)) / 3;
            if (step > best) {
              best = step;
              edge = y;
            }
          }
          return edge / scale;
        });
      },
      { data: shot, columns: { at: shown.map((n) => n.x), width } },
    );
    shown.forEach((n, i) => {
      console.log(`at yaw ${yaw}: ${n.text} is at ${n.y.toFixed(0)} px, the Earth's edge there is at ${limbs[i]!.toFixed(0)} px`);
      expect(n.y, `${n.text} is in the sky, above the Earth's edge`).toBeLessThan(limbs[i]! + 6);
    });
    checked += shown.length;
  }
  expect(checked, "some stars were named in the sky above the Earth").toBeGreaterThan(0);
});
