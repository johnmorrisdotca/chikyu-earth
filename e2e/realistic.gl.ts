// The realistic Earth in a real browser: what it draws, and the performance budget it keeps. The performance John asked for is the point:
// nothing drawn at rest, at most 30 draws a second while moving, one WebGL context, a canvas inside 6 MP and 4096 a side, textures that
// grow with the zoom and are freed after it, nothing drawn out of sight, everything freed on removal, a lost context recovered.
import { canvasSize, gpuObjects, withinPixelBudget } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test, type Page } from "@playwright/test";
import { alive, counts, EARTH, NOON, openEarth, pixelAt, settle, statsOf } from "./gl.ts";

test.describe.configure({ mode: "serial" });

const view = (zoom: number, yaw = 0, tilt = 0) => ({ yaw, tilt, zoom, panX: 0, panY: 0 });
const setView = (page: Page, zoom: number, yaw = 0, tilt = 0, final = true): Promise<void> =>
  page.locator(EARTH).evaluate((el, v) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView(v, v.final), { ...view(zoom, yaw, tilt), final });

test("it draws the Earth: land and sea in their places, in one context", async ({ page }) => {
  await openEarth(page, `time=2026-06-21T10:40Z&center=20,0`);
  const c = await counts(page);
  expect(c.contexts).toBe(1);
  const [r, g, b, a] = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(a).toBe(255);
  expect(g, "the Congo basin at midday is green, not blue").toBeGreaterThan(b);
  expect(r + g).toBeGreaterThan(40);
});

test("the Pacific at noon is blue, and the same place at midnight is dark", async ({ page }) => {
  await openEarth(page, `time=2026-06-21T22:00Z&center=-150,0`);
  const [r, g, b] = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(b).toBeGreaterThan(r + 20);
  expect(b).toBeGreaterThan(g);
  await page.locator(EARTH).evaluate((el) => {
    (el as unknown as { time: number }).time = Date.parse("2026-06-21T10:00Z");
  });
  await expect.poll(async () => (await pixelAt(page, page.locator(EARTH), 0.5, 0.5)).slice(0, 3).reduce((s, v) => s + v, 0)).toBeLessThan(40);
});

test("the day and night line follows the date: the Sun is where the almanac says", async ({ page }) => {
  // At the June solstice at 12:00 UTC the Sun is over 23.4 N, 0 E: the point there is bright, the antipode is dark.
  await openEarth(page, `time=${NOON}&center=0,23`);
  const lit = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(lit[0] + lit[1] + lit[2]).toBeGreaterThan(150);
  await page.locator(EARTH).evaluate((el) => {
    (el as unknown as { centre: unknown }).centre = { lon: 180, lat: -23 };
  });
  await expect.poll(async () => (await pixelAt(page, page.locator(EARTH), 0.5, 0.5)).slice(0, 3).reduce((s, v) => s + v, 0)).toBeLessThan(60);
});

test("at rest nothing is drawn and no animation frame is asked for", async ({ page }) => {
  await openEarth(page);
  const before = await counts(page);
  const drawsBefore = (await statsOf(page)).draws;
  await page.waitForTimeout(4000);
  const after = await counts(page);
  expect(after.draws, "GL draw calls").toBe(before.draws);
  expect(after.rafRequests, "requestAnimationFrame calls").toBe(before.rafRequests);
  expect((await statsOf(page)).draws).toBe(drawsBefore);
});

test("while the view moves it is drawn at most 30 times a second", async ({ page }) => {
  await openEarth(page);
  const box = (await page.locator(EARTH).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const t0 = Date.now();
  const drawsBefore = (await statsOf(page)).draws;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 150; i += 1) {
    await page.mouse.move(x + ((i * 7) % 160) - 80, y + ((i * 3) % 60) - 30);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  const seconds = (Date.now() - t0) / 1000;
  const draws = (await statsOf(page)).draws - drawsBefore;
  console.log(`drag: ${draws} draws in ${seconds.toFixed(2)} s = ${(draws / seconds).toFixed(1)} per second`);
  expect(draws).toBeGreaterThan(3);
  expect(draws / seconds).toBeLessThanOrEqual(32);
  await settle(page, 1500);
  const rest = await counts(page);
  await page.waitForTimeout(1500);
  expect((await counts(page)).draws, "and it rests when the hand is up").toBe(rest.draws);
});

test("asked for a thousand changes at once it still draws at most 30 a second", async ({ page }) => {
  await openEarth(page);
  const result = await page.locator(EARTH).evaluate(async (el) => {
    const e = el as unknown as { setView(v: unknown, f: boolean): void; stats: { draws: number } };
    const t0 = performance.now();
    const before = e.stats.draws;
    let i = 0;
    await new Promise<void>((done) => {
      const step = (): void => {
        for (let k = 0; k < 10; k += 1) {
          e.setView({ yaw: i * 0.9, tilt: 0, zoom: 1 + (i % 50) / 100, panX: 0, panY: 0 }, false);
          i += 1;
        }
        if (performance.now() - t0 < 2000) setTimeout(step, 0);
        else done();
      };
      step();
    });
    return { seconds: (performance.now() - t0) / 1000, draws: e.stats.draws - before, asks: i };
  });
  console.log(`burst: ${result.asks} setView calls, ${result.draws} draws in ${result.seconds.toFixed(2)} s`);
  expect(result.asks).toBeGreaterThan(500);
  expect(result.draws / result.seconds).toBeLessThanOrEqual(32);
});

test("an Auto-turn at the Earth's own rate costs almost nothing", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "no-preference", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await openEarth(page);
  await page.getByRole("button", { name: "Auto-turn" }).click();
  await page.waitForTimeout(500);
  const before = await counts(page);
  await page.waitForTimeout(6000);
  const after = await counts(page);
  console.log(`auto-turn: ${after.draws - before.draws} GL draw calls, ${after.rafRequests - before.rafRequests} frame requests in 6 s`);
  expect(after.draws - before.draws, "draw calls: at most one scene drawn").toBeLessThanOrEqual(8);
  await context.close();
});

test("the textures grow with the zoom, stay under their cap, and are freed after the zoom", async ({ page }) => {
  await openEarth(page);
  const start = await statsOf(page);
  expect(start.tiers).toEqual({ day: 1024, night: 1024, clouds: 1024, water: 1024 });
  // three keeps four empty textures of its own; ours are the other four, one a layer.
  const base = alive(await counts(page), "Texture");
  expect(base).toBeLessThanOrEqual(8);

  await setView(page, 3);
  await expect.poll(async () => (await statsOf(page)).tiers.day).toBe(2048);
  await setView(page, 6);
  await expect.poll(async () => (await statsOf(page)).tiers.day).toBe(4096);
  const high = await statsOf(page);
  expect(high.tiers.night).toBeLessThanOrEqual(2048);
  expect(high.tiers.clouds).toBeLessThanOrEqual(2048);
  await settle(page, 1500);
  const peak = alive(await counts(page), "Texture");
  expect(peak, "still one picture a layer, nothing held twice").toBeLessThanOrEqual(base + 4);

  await setView(page, 1);
  await expect.poll(async () => (await statsOf(page)).tiers, { timeout: 12_000 }).toEqual(start.tiers);
  await settle(page, 2000);
  expect(alive(await counts(page), "Texture"), "the larger pictures are freed again").toBe(base);
});

test("max-texture holds every picture to its cap", async ({ page }) => {
  await openEarth(page);
  await page.locator(EARTH).evaluate((el) => el.remove());
  await page.evaluate(() => {
    const el = document.createElement("chikyu-earth-realistic");
    el.setAttribute("time", "2026-06-21T12:00Z");
    el.setAttribute("center", "10,20");
    el.setAttribute("texture-base", "textures/");
    el.setAttribute("max-texture", "2048");
    document.querySelector("#globe")!.append(el);
  });
  await page.locator(`${EARTH}[data-state=live]`).waitFor();
  await setView(page, 8);
  await settle(page, 2500);
  const widest = Math.max(...Object.values((await statsOf(page)).tiers));
  expect(widest).toBe(2048);
});

test("the canvas stays inside 6 million pixels and 4096 a side on a 5K screen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await openEarth(page);
  await page.locator("#globe").evaluate((el, selector) => {
    el.style.cssText += ";width:2560px;max-width:none;height:1440px";
    el.querySelector(selector)!.setAttribute("style", "aspect-ratio:auto;height:1440px");
  }, EARTH);
  await expect.poll(async () => (await statsOf(page)).canvas.width).toBeGreaterThan(1500);
  await settle(page, 1000);
  // The canvas is in the element's shadow root, which the kit's `canvasSize` (the page's own canvases) does not look into.
  const size = await page.locator(EARTH).evaluate((el) => {
    const canvases = [...el.shadowRoot!.querySelectorAll("#stage canvas")] as HTMLCanvasElement[];
    return { pixels: Math.max(...canvases.map((c) => c.width * c.height)), side: Math.max(...canvases.flatMap((c) => [c.width, c.height])), count: canvases.length };
  });
  console.log(`5K at ratio 2: canvas ${(await statsOf(page)).canvas.width} x ${(await statsOf(page)).canvas.height} = ${(size.pixels / 1e6).toFixed(2)} MP, side ${size.side}`);
  expect(withinPixelBudget(size)).toBe(true);
  expect(size.count).toBe(1);
  expect((await canvasSize(page)).count, "and the page has no other canvas").toBe(0);
  await context.close();
});

test("out of sight or in a hidden tab nothing is drawn or asked for", async ({ page }) => {
  await openEarth(page);
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "4000px";
    document.body.prepend(spacer);
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(EARTH).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => page.locator(EARTH).evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(1000);
  await page.waitForTimeout(500);
  const before = await counts(page);
  const draws = (await statsOf(page)).draws;
  for (let i = 0; i < 10; i += 1) {
    await setView(page, 1 + i / 10, i * 10, 0, false);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(500);
  const after = await counts(page);
  expect(after.draws, "no GL draws while out of sight").toBe(before.draws);
  expect(after.rafRequests, "no frames asked for while out of sight").toBe(before.rafRequests);
  expect((await statsOf(page)).draws).toBe(draws);

  await page.locator(EARTH).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(draws);
  await settle(page);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(300);
  const hidden = await counts(page);
  for (let i = 0; i < 6; i += 1) {
    await setView(page, 2 + i / 10, i * 12, 0, false);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const still = await counts(page);
  expect(still.draws, "no GL draws in a hidden tab").toBe(hidden.draws);
  expect(still.rafRequests).toBe(hidden.rafRequests);
});

test("taking the element away frees every GPU object, and it can come back", async ({ page }) => {
  await openEarth(page);
  await setView(page, 6);
  await expect.poll(async () => (await statsOf(page)).tiers.day).toBe(4096);
  await page.locator(EARTH).evaluate((el) => el.remove());
  await page.waitForTimeout(3000);
  const gone = await counts(page);
  console.log(`after removal: textures ${alive(gone, "Texture")}, buffers ${alive(gone, "Buffer")}, programs ${alive(gone, "Program")}, all ${gpuObjects(gone)}`);
  // What stays is three's own four empty textures and a few of its fixtures, which go with the context (which is let go).
  expect(alive(gone, "Texture"), "ours are all freed").toBeLessThanOrEqual(4);
  expect(alive(gone, "Buffer")).toBe(0);
  expect(alive(gone, "Program")).toBe(0);
  expect(gpuObjects(gone)).toBeLessThanOrEqual(8);

  await page.evaluate(() => {
    const el = document.createElement("chikyu-earth-realistic");
    el.setAttribute("time", "2026-06-21T12:00Z");
    el.setAttribute("center", "10,20");
    el.setAttribute("texture-base", "textures/");
    document.querySelector("#globe")!.append(el);
  });
  await page.locator(`${EARTH}[data-state=live]`).waitFor();
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  const [, , , a] = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(a).toBe(255);
});

test("a lost WebGL context is recovered without a crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openEarth(page);
  const draws = (await statsOf(page)).draws;
  await page.locator(EARTH).evaluate((el) => {
    const canvas = el.shadowRoot!.querySelector("canvas")!;
    const ext = (canvas.getContext("webgl2") as WebGL2RenderingContext).getExtension("WEBGL_lose_context")!;
    Reflect.set(window, "__lose", ext);
    ext.loseContext();
  });
  await expect(page.locator(EARTH)).toHaveAttribute("data-state", "lost");
  await page.waitForTimeout(300);
  expect((await statsOf(page)).draws, "nothing is drawn while it is lost").toBe(draws);
  await page.evaluate(() => (Reflect.get(window, "__lose") as { restoreContext(): void }).restoreContext());
  await expect(page.locator(EARTH)).toHaveAttribute("data-state", "live");
  await setView(page, 1.4, 25);
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(draws);
  await settle(page);
  const [r, g, b, a] = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(a).toBe(255);
  expect(r + g + b, "the picture is back, not black").toBeGreaterThan(60);
  expect(errors).toEqual([]);
});

test("without WebGL the demo says so and shows the line globe", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      if (kind.startsWith("webgl") || kind === "experimental-webgl") return null;
      return (original as (...a: unknown[]) => unknown).call(this, kind, ...rest) as never;
    } as typeof original;
  });
  await page.goto("/chikyu-earth/?look=realistic");
  await expect(page.locator("#status")).toContainText("needs WebGL");
  await expect(page.locator("chikyu-earth")).toBeVisible();
  await expect(page.locator(EARTH)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Realistic" })).toBeDisabled();
});

test("the controls are the demo's own, never the browser's", async ({ page }) => {
  await openEarth(page);
  const bad = await page.locator(".controls button, .controls input").evaluateAll((nodes) =>
    nodes
      .filter((n) => (n as HTMLElement).offsetParent !== null)
      .map((n) => {
        const box = n.getBoundingClientRect();
        const style = getComputedStyle(n);
        const grouped = n.closest(".group") !== null;
        return { text: (n.textContent || (n as HTMLInputElement).type).trim(), height: box.height, radius: grouped ? 999 : parseFloat(style.borderTopLeftRadius), font: style.fontFamily };
      })
      .filter((c) => c.height < 47.5 || c.radius < 12 || !c.font.startsWith("system-ui")),
  );
  expect(bad).toEqual([]);
});
