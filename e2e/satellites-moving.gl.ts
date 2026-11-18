// Satellites in the space view, moving: the same performance budget as everything else, at 6,000 of them at 60 times real time and faster, and the streaks. The rest is in satellites.gl.ts.
import { expect, test } from "@playwright/test";
import { drainGpu, freezeClock, ownClock, settle, steppingOnly } from "./gl.ts";
import { routeElements } from "./recorded.ts";
import { SPACE, T, addMany, measure, open, setSpeed, statsOf } from "./satellites-common.ts";

test.beforeEach(({ page }) => routeElements(page));

test.describe.configure({ mode: "serial" });

test.describe("moving", () => {
  test.use({ reducedMotion: "no-preference" });
  test("6,000 satellites at 60 times real time: at most 30 frames a second, one SGP4 batch a second, one extra draw call", async ({ page }) => {
    // about 15 s of its own in CI and, in `measure`, the wait for the software GPU to draw the frames the page's own clock asked for (22 to 37 s after the ride test in CI)
    test.setTimeout(90_000);
    await ownClock(page);
    await open(page, "", "stations,starlink");
    const before = await measure(page, 100);
    await setSpeed(page, 60);
    await settle(page, 600);
    // the spans are short because every frame of them is drawn in software, and the GPU is waited for after each (`timed`): at 3 s and 6 s they took 90 s with three tests drawing at once on a throttled machine; rates are counted per second, so the span does not change them
    const base = await measure(page, 1500);
    await addMany(page);
    await settle(page, 1500);
    const many = await measure(page, 3000);
    console.log(
      `6,000 satellites at 60x: ${many.gameSeconds.toFixed(1)}x, ${many.frames.toFixed(1)} frames a second, ${many.glPerFrame.toFixed(1)} GL draw calls a frame (${base.glPerFrame.toFixed(1)} without them), ${many.propagations.toFixed(0)} SGP4 calls a second, ` +
        `${many.stats.satellites.averageUpdateMs.toFixed(2)} ms of JavaScript a frame on average (the longest ${many.stats.satellites.maxUpdateMs.toFixed(1)}), the longest SGP4 batch ${many.stats.satellites.maxBatchMs.toFixed(1)} ms`,
    );
    expect(before.stats.state).toBe("live");
    expect(many.gameSeconds).toBeGreaterThan(45);
    expect(many.frames * many.seconds, `a rate needs at least 30 draws to count: the span drew ${many.frames * many.seconds}`).toBeGreaterThanOrEqual(30);
    expect(many.frames).toBeLessThanOrEqual(31);
    expect(many.frames).toBeGreaterThan(5);
    // one draw call for the group (and the odd frame that draws a chosen satellite or an orbit): not 6,000
    expect(many.glPerFrame - base.glPerFrame, "a draw call or two more a frame for 6,000 satellites").toBeLessThanOrEqual(2.5);
    // SGP4: the step is 60 game seconds = one wall second at 60x, so the 2,252 + 6,000 satellites cost about once each a second
    const all = 2252 + 6000;
    expect(many.propagations, "SGP4 calls a second").toBeLessThanOrEqual(all * 1.5);
    expect(many.propagations).toBeGreaterThan(all * 0.5);
    expect(many.stats.canvas.pixels).toBeLessThanOrEqual(6_000_000);
    expect(many.stats.contexts).toBe(1);
  });

  test("faster than 60 times real time the satellites are streaks, one SGP4 batch a second, and the frame rate stays capped", async ({ page }) => {
    await open(page, "", "stations,starlink");
    await setSpeed(page, 3600);
    await settle(page, 1000);
    const m = await measure(page, 4000);
    console.log(`3600x with satellites: ${m.frames.toFixed(1)} frames a second, ${m.propagations.toFixed(0)} SGP4 calls a second, streaks ${m.stats.satellites.segments}, tooFast ${m.stats.satellites.tooFast}`);
    expect(m.stats.satellites.tooFast).toBe(true);
    expect(m.stats.satellites.placed).toBeGreaterThan(2000);
    expect(m.stats.satellites.segments, "one streak for each satellite drawn").toBe(m.stats.satellites.placed);
    expect(m.stats.satellites.epochMs).toBeGreaterThan(0);
    expect(m.propagations, "about one SGP4 sample a second, not one a frame").toBeGreaterThan(2000 * 0.4);
    expect(m.propagations).toBeLessThan(2000 * 3);
    expect(m.frames).toBeLessThanOrEqual(31);
    await setSpeed(page, 0);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "time", Date.parse("2026-11-02T18:00:00Z")));
    await settle(page, 1500);
    const held = (await statsOf(page)).satellites;
    expect(held.tooFast).toBe(false);
    expect(held.segments, "a held clock draws dots, not streaks").toBe(0);
    expect(held.placed).toBeGreaterThan(2000);
  });

  test("at an hour a second the longest streak on the screen is the cap, as at 10 minutes a second, and off lets it run long", async ({ page }) => {
    await open(page, "&earth-size=0.9", "stations,starlink");
    const longest = async (speed: number): Promise<number> => {
      await setSpeed(page, speed);
      await settle(page, 1200);
      const { satellites } = await statsOf(page);
      expect(satellites.tooFast).toBe(true);
      expect(satellites.segments, "a streak for every satellite drawn").toBe(satellites.placed);
      return satellites.longestStreakPx;
    };
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "satelliteStreakMax"))).toBe(8);
    const cap = (await statsOf(page)).satellites.earthPx * 0.025;
    const ten = await longest(600);
    const hour = await longest(3600);
    const day = await longest(86_400);
    console.log(`longest streak: ${ten.toFixed(1)} px at 10 minutes a second, ${hour.toFixed(1)} px at an hour, ${day.toFixed(1)} px at a day, cap ${cap.toFixed(1)} px`);
    expect(ten, "10 minutes a second: a few pixels, under the cap").toBeGreaterThan(2);
    expect(ten).toBeLessThanOrEqual(cap + 0.1);
    expect(hour, "an hour a second: the cap, not a chord across the globe").toBeLessThanOrEqual(cap + 0.1);
    expect(hour).toBeGreaterThan(cap * 0.9);
    expect(day).toBeLessThanOrEqual(cap + 0.1);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "satelliteStreakMax", 3));
    expect(await page.locator(SPACE).evaluate((el) => el.getAttribute("satellite-streak-max"))).toBe("3");
    const three = await longest(3600);
    expect(three, "a ceiling of 3 pixels binds below the share of the radius").toBeLessThanOrEqual(3.05);
    expect(three).toBeGreaterThan(2.7);
    await page.locator(SPACE).evaluate((el) => el.setAttribute("satellite-streak-max", "off"));
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "satelliteStreakMax"))).toBe(0);
    const whole = await longest(3600);
    console.log(`satellite-streak-max off, an hour a second: ${whole.toFixed(1)} px`);
    expect(whole, "no cap: the whole stretch of a frame, about a seventh of the Earth's radius for a low satellite at an hour a second").toBeGreaterThan((await statsOf(page)).satellites.earthPx * 0.1);
  });

  // Looked at as a reader who asked for reduced motion is: the Earth's size changes at once, with no glide, so the two pictures of each pair show the same frame of the view
  test.describe("on a small Earth", () => {
    test.use({ reducedMotion: "reduce" });
    test("the streaks shrink with the Earth, and thousands of marks do not darken a small one", async ({ page }) => {
      test.setTimeout(240_000);
      await ownClock(page);
      await open(page, "&earth-size=0.9", "starlink");
      await addMany(page, 16_000);
      await expect.poll(async () => (await statsOf(page)).satellites.groups).toBe(2);
      const show = (on: boolean): Promise<void> =>
        page.locator(SPACE).evaluate((el, v) => {
          for (const name of ["many", "starlink"]) (el as unknown as { showSatellites(g: string, on: boolean): void }).showSatellites(name, v);
        }, on);
      /**
       * A picture of the element at one moment of the clock, so two pictures show the Earth turned the same. The page's clock is stopped, the time set, and the page's frames run for a fixed 50 ms of its own time:
       * every picture is then drawn at the same moment however long the software GPU takes. Before, the time was set and two animation frames waited for, and a throttled, busy machine drew the frame seconds later,
       * after the clock (600 times real time, a step a second) had moved the Earth on by one or two steps (600 s each), and the two pictures of a pair showed the Earth at different turns (MODULES-1586).
       */
      const shot = async (): Promise<string> => {
        await freezeClock(page);
        const asked = (await statsOf(page)).draws;
        await page.locator(SPACE).evaluate((el, at) => Reflect.set(el, "time", Date.parse(at)), T);
        await page.clock.runFor(50);
        await expect.poll(async () => (await statsOf(page)).draws, { message: "a draw of the set time" }).toBeGreaterThan(asked);
        await drainGpu(page);
        const picture = (await page.locator(SPACE).screenshot()).toString("base64");
        await page.clock.resume();
        return picture;
      };
      /** How much brighter (negative) or darker the lit side of the Earth is with the satellites on than off, as a share of its luminance: the pixels where the picture without them is lit, inside the disc. */
      const darkening = async (radius: number): Promise<number> => {
        await show(true);
        await settle(page, 300);
        const on = await shot();
        await show(false);
        await settle(page, 300);
        const off = await shot();
        await show(true);
        return page.evaluate(
          async ([a, b, r]) => {
            const load = (data: string): Promise<ImageData> =>
              new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement("canvas");
                  canvas.width = img.width;
                  canvas.height = img.height;
                  const c = canvas.getContext("2d")!;
                  c.drawImage(img, 0, 0);
                  resolve(c.getImageData(0, 0, img.width, img.height));
                };
                img.src = `data:image/png;base64,${data}`;
              });
            const [withSats, without] = await Promise.all([load(a as string), load(b as string)]);
            const cx = withSats.width / 2;
            const cy = withSats.height / 2;
            let sumOn = 0;
            let sumOff = 0;
            let n = 0;
            for (let y = 0; y < withSats.height; y += 1) {
              for (let x = 0; x < withSats.width; x += 1) {
                if (Math.hypot(x - cx, y - cy) > (r as number) * 0.92) continue;
                const k = (y * withSats.width + x) * 4;
                const off = 0.2126 * without.data[k]! + 0.7152 * without.data[k + 1]! + 0.0722 * without.data[k + 2]!;
                if (off < 70) continue;
                sumOff += off;
                sumOn += 0.2126 * withSats.data[k]! + 0.7152 * withSats.data[k + 1]! + 0.0722 * withSats.data[k + 2]!;
                n += 1;
              }
            }
            return n < 200 ? Number.NaN : (sumOff - sumOn) / sumOff;
          },
          [on, off, radius] as [string, string, number],
        );
      };
      const results: { size: number; cap: number; longest: number; radius: number; weight: number; fade: number; dark600: number; dark1: number }[] = [];
      for (const size of [0.9, 0.45, 0.18]) {
        await page.locator(SPACE).evaluate((el, v) => Reflect.set(el, "earthSize", v), size);
        await setSpeed(page, 3600);
        await settle(page, 1500);
        const hour = (await statsOf(page)).satellites;
        await setSpeed(page, 600);
        await settle(page, 1500);
        const ten = (await statsOf(page)).satellites;
        expect(ten.tooFast).toBe(true);
        const cap = Math.min(8, 0.025 * ten.earthPx);
        expect(ten.streakCapPx).toBeCloseTo(cap, 3);
        expect(ten.longestStreakPx, `10 minutes a second at size ${size}`).toBeLessThanOrEqual(cap + 0.05);
        expect(hour.longestStreakPx, `an hour a second at size ${size}: within the scaled cap`).toBeLessThanOrEqual(cap + 0.05);
        expect(hour.longestStreakPx, `an hour a second at size ${size}: and as long as it`).toBeGreaterThan(cap * 0.85);
        const dark600 = await darkening(ten.earthPx);
        await setSpeed(page, 1);
        await settle(page, 1200);
        const dark1 = await darkening(ten.earthPx);
        results.push({ size, cap, longest: hour.longestStreakPx, radius: ten.earthPx, weight: ten.weight, fade: ten.fade, dark600, dark1 });
      }
      console.log(results.map((r) => `size ${r.size}: Earth radius ${r.radius.toFixed(0)} px, weight ${r.weight.toFixed(2)}, cap ${r.cap.toFixed(2)} px, longest at an hour ${r.longest.toFixed(2)} px, darkening ${(r.dark600 * 100).toFixed(1)}% at 10 min/s, ${(r.dark1 * 100).toFixed(1)}% at real time`).join("\n"));
      const [full, half, fifth] = results as [(typeof results)[number], (typeof results)[number], (typeof results)[number]];
      expect(half.cap / full.cap, "half the Earth, half the streak").toBeCloseTo(0.5, 1);
      expect(fifth.cap / full.cap, "a fifth of the Earth, a fifth of the streak").toBeCloseTo(0.2, 1);
      expect(fifth.weight, "a small Earth has less weight").toBeLessThan(0.1);
      for (const r of results) for (const d of [r.dark600, r.dark1]) expect(Number.isNaN(d), "enough lit pixels to measure").toBe(false);
      // The lit side of the Earth with 16,000 satellites on against off, as a share of its luminance (negative: brighter, the streaks being light on a dark ground). Before this change it was 9%, 19% and 36% at 10 minutes a second
      // at the three sizes and about 0% at real time. A whole Earth is drawn as it was; at a fifth of the size the marks change it by no more than 4% at 10 minutes a second and 1.5% at real time, and no size is more washed than the whole Earth.
      expect(Math.abs(fifth.dark600), "a fifth of the Earth at 10 minutes a second").toBeLessThanOrEqual(0.04);
      expect(Math.abs(fifth.dark1), "a fifth of the Earth at real time").toBeLessThanOrEqual(0.015);
      expect(Math.abs(half.dark600), "half the Earth at 10 minutes a second: no more than the whole Earth plus 2%").toBeLessThanOrEqual(Math.abs(full.dark600) + 0.02);
      expect(Math.abs(half.dark1), "half the Earth at real time").toBeLessThanOrEqual(0.025);
      expect(Math.abs(fifth.dark600)).toBeLessThanOrEqual(Math.abs(full.dark600));
    });
  });

  test("orbit tint changes the colours, and the dot size follows the zoom", async ({ page }) => {
    await open(page, "", "stations");
    await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
    const start = (await statsOf(page)).satellites.dotScale;
    expect(start).toBeGreaterThan(0);
    await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, f: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 4, panX: 0, panY: 0 }, true));
    await expect.poll(async () => (await statsOf(page)).satellites.dotScale).toBeGreaterThan(start + 0.2);
    await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, f: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 0.4, panX: 0, panY: 0 }, true));
    await expect.poll(async () => (await statsOf(page)).satellites.dotScale).toBeLessThan(start);
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "satelliteTint"))).toBe("off");
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "satelliteTint", "orbit"));
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "satelliteTint"))).toBe("orbit");
    expect(await page.locator(SPACE).evaluate((el) => el.getAttribute("satellite-tint"))).toBe("orbit");
  });


  test("out of sight or hidden, 6,000 satellites at 60x draw nothing", async ({ page }) => {
    await open(page, "", "stations,starlink");
    await addMany(page);
    await setSpeed(page, 60);
    await settle(page, 1000);
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "6000px";
      document.body.prepend(spacer);
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
    const away = await measure(page, 2500);
    expect(away.glDraws, "no GL draws out of sight").toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(600);
    const hidden = await measure(page, 2500);
    expect(hidden.glDraws, "no GL draws in a hidden tab").toBe(0);
  });

  test("at 60x the draws are capped at 30 a second; a reader who asked for reduced motion gets one step a second", async ({ page, browser }) => {
    await ownClock(page);
    await open(page, "", "stations,starlink");
    await setSpeed(page, 60);
    await settle(page, 800);
    // spans of 2.5 and 3 s, not 4: every frame is drawn in software and the GPU is waited for after each span, and at 4 s the test took the whole minute when three ran at once on a throttled machine
    const moving = await measure(page, 2500);
    console.log(`60x, no motion preference: ${moving.frames.toFixed(1)} frames a second`);
    expect(moving.frames * moving.seconds, `a rate needs at least 30 draws to count: the span drew ${moving.frames * moving.seconds}`).toBeGreaterThanOrEqual(30);
    expect(moving.frames).toBeGreaterThan(5);
    expect(moving.frames).toBeLessThanOrEqual(31);
    await page.close();

    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
    const reduced = await context.newPage();
    await ownClock(reduced);
    await open(reduced, "&speed=60", "stations,starlink");
    await steppingOnly(reduced, () => setSpeed(reduced, 0), () => setSpeed(reduced, 60), async () => (await statsOf(reduced)).draws);
    // a reader with less motion gets one step a second, so this count is of steps: three of them
    const stepping = await measure(reduced, 3000);
    console.log(`60x, reduced motion: ${stepping.frames.toFixed(2)} frames a second`);
    expect(stepping.frames).toBeLessThanOrEqual(1.6);
    expect(stepping.frames).toBeGreaterThan(0.5);
    await context.close();
  });
});
