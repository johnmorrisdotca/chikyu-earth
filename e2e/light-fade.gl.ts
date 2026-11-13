// A short cross-fade when `light` changes to or from `lit` (300 ms): the picture moves between the two looks over a few frames and then rests, and a reader who asked for less motion gets the cut. The page's clock is the test's own:
// owned, then stopped, and moved by exactly the span asked for, so how long the frames take on this machine cannot change what is counted. With FADE_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, freezeClock, ownClock, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const THROTTLE = Number(process.env.FADE_THROTTLE ?? 0);
const LOOKS = [
  { name: "the realistic Earth", element: "chikyu-earth-realistic", look: "realistic" },
  { name: "the Earth from space", element: "chikyu-space", look: "space" },
] as const;

interface Stats {
  draws: number;
  lightFade: { mix: number; fading: boolean };
}

const statsOf = (page: Page, element: string): Promise<Stats> => page.locator(element).evaluate((el) => Reflect.get(el, "stats") as Stats);

async function open(page: Page, element: string, look: string): Promise<void> {
  await ownClock(page);
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=${look}&time=2026-06-21T12:00Z&speed=0&center=10,20`);
  await page.locator(`${element}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page, element)).draws).toBeGreaterThan(0);
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await untilStill(page);
  await freezeClock(page);
}

/** Set `light` and read the draw count in the same turn, so a draw that lands between a read and the change cannot be mistaken for the fade's. */
const setLight = (page: Page, element: string, value: string): Promise<number> =>
  page.locator(element).evaluate((el, light) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    Reflect.set(el, "light", light);
    return draws;
  }, value);

for (const { name, element, look } of LOOKS) {
  test.describe(name, () => {
    test.use({ reducedMotion: "no-preference" });

    test("lit fades in over 300 ms in frames of its own, and sun fades back, and each ends at rest", async ({ page }) => {
      await open(page, element, look);
      const start = await statsOf(page, element);
      expect(start.lightFade).toEqual({ mix: 0, fading: false });

      const before = await setLight(page, element, "lit");
      const seen: number[] = [];
      for (const ms of [60, 90, 90, 60, 60]) {
        await page.clock.runFor(ms);
        seen.push((await statsOf(page, element)).lightFade.mix);
      }
      // 60, 150, 240, 300, 360 ms after the change
      expect(seen[0]!, "60 ms in: on its way").toBeGreaterThan(0);
      expect(seen[0]!).toBeLessThan(0.5);
      expect(seen[1]!, "half way at 150 ms").toBeGreaterThan(0.3);
      expect(seen[1]!).toBeLessThan(0.7);
      for (let i = 1; i < seen.length; i += 1) expect(seen[i]!, `step ${i}: it only goes on`).toBeGreaterThanOrEqual(seen[i - 1]!);
      expect(seen[3]!, "arrived by 300 ms").toBe(1);
      expect(seen[4]).toBe(1);
      const arrived = await statsOf(page, element);
      expect(arrived.lightFade.fading).toBe(false);
      expect(arrived.draws - before, "the fade is frames of its own, not one jump").toBeGreaterThanOrEqual(3);
      expect(arrived.draws - before, "and not more than a frame each 16 ms of it").toBeLessThanOrEqual(25);

      // rest: a second of the page's time, no frame
      await page.clock.runFor(1000);
      expect((await statsOf(page, element)).draws, "at rest nothing is drawn").toBe(arrived.draws);

      // and back to the true light
      const back = await setLight(page, element, "sun");
      await page.clock.runFor(150);
      const half = (await statsOf(page, element)).lightFade.mix;
      expect(half, "half way down at 150 ms").toBeGreaterThan(0.3);
      expect(half).toBeLessThan(0.7);
      await page.clock.runFor(300);
      const down = await statsOf(page, element);
      expect(down.lightFade).toEqual({ mix: 0, fading: false });
      expect(down.draws - back).toBeGreaterThanOrEqual(3);
      await page.clock.runFor(1000);
      expect((await statsOf(page, element)).draws, "at rest again").toBe(down.draws);
    });

    test("a change turned round half way goes back from where it was, not from the end", async ({ page }) => {
      await open(page, element, look);
      await setLight(page, element, "lit");
      await page.clock.runFor(150);
      const middle = (await statsOf(page, element)).lightFade.mix;
      expect(middle).toBeGreaterThan(0.3);
      await setLight(page, element, "sun");
      await page.clock.runFor(30);
      const turned = (await statsOf(page, element)).lightFade.mix;
      expect(turned, "it is going down from the middle").toBeLessThan(middle);
      expect(turned, "and did not jump to the end").toBeGreaterThan(0.1);
      await page.clock.runFor(400);
      expect((await statsOf(page, element)).lightFade).toEqual({ mix: 0, fading: false });
    });
  });

  test.describe(`${name}, for a reader who asked for less motion`, () => {
    test.use({ reducedMotion: "reduce" });

    test("lit is a cut: at once, in one draw, with nothing fading", async ({ page }) => {
      await open(page, element, look);
      const before = await setLight(page, element, "lit");
      await page.clock.runFor(100);
      const after = await statsOf(page, element);
      expect(after.lightFade).toEqual({ mix: 1, fading: false });
      expect(after.draws - before, "one draw for the change").toBeLessThanOrEqual(2);
      await page.clock.runFor(1000);
      expect((await statsOf(page, element)).draws, "at rest").toBe(after.draws);
    });
  });
}
