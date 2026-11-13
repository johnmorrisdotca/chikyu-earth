// Which is heard first where a satellite's dot and a path lie under the pointer (MODULES-1332): `path-priority="dots"` (the default) is the dot's, so with thousands of dots crowding a line a path can go unheard at the Low level;
// `paths` is the path's, except for a dot of a satellite whose path is listed or that is chosen. One press has one meaning either way. The clock is the test's own: `speed=0`, the view's controls paused, and what is read is read in the
// same turn as the change. With PRIORITY_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const THROTTLE = Number(process.env.PRIORITY_THROTTLE ?? 0);

interface Ref {
  group: string;
  index: number;
}
interface Api {
  setPaths(list: unknown[]): void;
  selectSatellite(ref: Ref | null): void;
  placeSatellite(ref: Ref): { x: number; y: number; visible: boolean } | null;
  pathAt(x: number, y: number, radius?: number): { id: number | string; ref: Ref; x: number; y: number } | null;
  pathPriority: string;
}
interface Entry {
  type: string;
  detail: { ref?: Ref; group?: string; index?: number } | null;
}
interface Stats {
  draws: number;
  paths: { drawn: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
const inPage = <T, A>(page: Page, fn: (api: Api, arg: A) => T, arg: A): Promise<T> =>
  page.locator(SPACE).evaluate((el, [source, value]) => (new Function(`return (${source as string})`)() as (e: unknown, a: unknown) => unknown)(el, value) as never, [fn.toString(), arg] as const) as Promise<T>;
const logOf = (page: Page): Promise<Entry[]> => page.evaluate(() => (Reflect.get(window, "__log") as Entry[]).slice());
const clearLog = (page: Page): Promise<void> => page.evaluate(() => void ((Reflect.get(window, "__log") as unknown[]).length = 0));

async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations,starlink");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { name: string; placed: number }[]).filter((group) => group.placed > 0).length), { timeout: 30_000 }).toBe(2);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.locator(SPACE).evaluate((el) => {
    const log: Entry[] = [];
    Reflect.set(window, "__log", log);
    for (const type of ["chikyu-path-hover", "chikyu-path-click", "chikyu-satellite-click"]) el.addEventListener(type, (event) => log.push({ type, detail: (event as CustomEvent).detail }));
  });
  await untilStill(page);
}

/** Do `act` in the page and wait for the draw it asks for: the draw count is read in the same turn as the change. */
async function change(page: Page, act: (api: Api) => void): Promise<void> {
  const before = await page.locator(SPACE).evaluate((el, source) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    (new Function(`return (${source})`)() as (api: unknown) => void)(el);
    return draws;
  }, act.toString());
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: "a draw after the change" }).toBeGreaterThan(before);
  await untilStill(page);
}

/** Where a station's dot is, in CSS pixels in the element, or null when it is not in the picture. */
const dotOf = (page: Page, group: string, index: number): Promise<{ x: number; y: number } | null> =>
  inPage(page, (api, ref: Ref) => {
    const at = api.placeSatellite(ref);
    return at?.visible ? { x: at.x, y: at.y } : null;
  }, { group, index });

/**
 * A point on the listed path with Starlink dots crowding it: one of them within 8 px and none of a station within 16 px. Found by looking over the picture, which is held.
 */
async function crowdedPoint(page: Page): Promise<{ x: number; y: number; id: number | string }> {
  const found = await inPage(
    page,
    (api, listed: number) => {
      const box = (api as unknown as HTMLElement).getBoundingClientRect();
      const near = (x: number, y: number, group: string, count: number, within: number): boolean => {
        for (let index = 0; index < count; index += 1) {
          const at = api.placeSatellite({ group, index });
          if (at?.visible && Math.hypot(at.x - x, at.y - y) <= within) return true;
        }
        return false;
      };
      for (let y = 10; y < box.height - 10; y += 4) {
        for (let x = 10; x < box.width - 10; x += 4) {
          const hit = api.pathAt(x, y, 2);
          if (!hit) continue;
          if (near(hit.x, hit.y, "stations", listed, 16)) continue;
          if (near(hit.x, hit.y, "starlink", 2232, 8)) return { x: hit.x, y: hit.y, id: hit.id };
        }
      }
      return null;
    },
    20,
  );
  expect(found, "a point on the path with Starlink dots round it and no station's").not.toBeNull();
  return found!;
}

const press = async (page: Page, x: number, y: number): Promise<void> => {
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.click(box.x + x, box.y + y);
};
/** The pressing and pointing events the page was told of, hovers left out. */
const clicks = async (page: Page): Promise<string[]> => (await logOf(page)).filter((entry) => entry.type !== "chikyu-path-hover").map((entry) => entry.type);

test("at the Low level a crowd of dots hides a path under the default and does not under paths: press and hover, and one press has one meaning", async ({ page }) => {
  await open(page);
  // a favourite whose own dot is away from the crowd under test
  await change(page, (api) => api.setPaths([{ id: "stations:2", style: "favourite" }]));
  const point = await crowdedPoint(page);
  const box = (await page.locator(SPACE).boundingBox())!;

  // dots (the default): a hover under a dot is not the path's, and a press is the dot's, and the path is not heard
  expect(await inPage(page, (api) => api.pathPriority, null)).toBe("dots");
  await clearLog(page);
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 4; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await logOf(page)).filter((entry) => entry.type === "chikyu-path-hover" && entry.detail !== null), "a hover under a dot is not the path's").toHaveLength(0);
  await clearLog(page);
  await press(page, point.x, point.y);
  await expect.poll(async () => (await clicks(page)).length).toBe(1);
  expect(await clicks(page), "a dot wins: only the satellite click").toEqual(["chikyu-satellite-click"]);
  expect(((await logOf(page)).find((entry) => entry.type === "chikyu-satellite-click")!.detail as { group: string }).group).toBe("starlink");
  await untilStill(page);
  // the demo answers a click on a satellite by choosing it and turning the view to it: let go of the choice and find a crowded point again on the picture as it is now
  await change(page, (api) => api.selectSatellite(null));
  const crowd = await crowdedPoint(page);

  // paths: the same press and the same hover are the path's, and only the path's
  await page.locator(SPACE).evaluate((el) => el.setAttribute("path-priority", "paths"));
  expect(await inPage(page, (api) => api.pathPriority, null)).toBe("paths");
  await untilStill(page);
  await clearLog(page);
  await press(page, crowd.x, crowd.y);
  await expect.poll(async () => (await clicks(page)).length).toBe(1);
  expect(await clicks(page), "the path wins: only the path click").toEqual(["chikyu-path-click"]);
  const told = (await logOf(page)).find((entry) => entry.type === "chikyu-path-click")!.detail as { id: number | string; ref: Ref };
  expect(told.id).toBe(crowd.id);
  expect(told.ref).toEqual({ group: "stations", index: 2 });
  await untilStill(page);

  await clearLog(page);
  await page.mouse.move(box.x + crowd.x + 1, box.y + crowd.y);
  await expect.poll(async () => (await logOf(page)).some((entry) => entry.type === "chikyu-path-hover" && entry.detail !== null), { timeout: 20_000 }).toBe(true);
  expect(await clicks(page), "a hover is not a press").toEqual([]);
});

test("under paths a listed satellite's own dot, and the chosen one's, still win; away from every path a dot is a dot", async ({ page }) => {
  await open(page);
  await page.locator(SPACE).evaluate((el) => el.setAttribute("path-priority", "paths"));
  await change(page, (api) => api.setPaths([{ id: "stations:2", style: "favourite" }]));
  const listed = await dotOf(page, "stations", 2);
  expect(listed, "the listed station is in the picture").not.toBeNull();
  await clearLog(page);
  await press(page, listed!.x, listed!.y);
  await expect.poll(async () => (await clicks(page)).length).toBe(1);
  expect(await clicks(page), "the listed satellite's dot is its own").toEqual(["chikyu-satellite-click"]);
  await untilStill(page);

  // the chosen satellite: its own orbit is drawn through its dot, and the dot still wins
  await change(page, (api) => api.selectSatellite({ group: "stations", index: 5 }));
  const chosen = await dotOf(page, "stations", 5);
  expect(chosen, "the chosen station is in the picture").not.toBeNull();
  await clearLog(page);
  await press(page, chosen!.x, chosen!.y);
  await expect.poll(async () => (await clicks(page)).length).toBe(1);
  expect(await clicks(page)).toEqual(["chikyu-satellite-click"]);
  await untilStill(page);

  // away from every path a dot is a dot, whatever the setting
  await change(page, (api) => {
    api.setPaths([]);
    api.selectSatellite(null);
  });
  const lone = await dotOf(page, "stations", 7);
  expect(lone).not.toBeNull();
  await clearLog(page);
  await press(page, lone!.x, lone!.y);
  await expect.poll(async () => (await clicks(page)).length).toBe(1);
  expect(await clicks(page)).toEqual(["chikyu-satellite-click"]);
});
