// A press on a place tells the page (MODULES-1082): `chikyu-place-click` with `{ place, group: false, x, y, pointer }`, for a press or a tap that is not a drag, on a place drawn as a marker of its own. Never for a place the Earth hides or one
// gathered into a group; a dot and a path are heard before a place, and a place before the Earth, so one press is one event. Every clock is the test's own: `speed=0` at a given moment, the view's controls paused, the log of events
// kept in the page. With PLACE_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { missionPosition, type ElementSet } from "../src/satellites/index.ts";
import { COUNT_SCRIPT, EARTH, NOON, openEarth, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const THROTTLE = Number(process.env.PLACE_THROTTLE ?? 0);
const MOMENT = "2026-11-02T18:00Z";
const TOKYO = { lon: 139.69, lat: 35.69 };
const TYPES = ["chikyu-place-click", "chikyu-body-click", "chikyu-satellite-click", "chikyu-path-click"];

interface Entry {
  type: string;
  detail: { place?: { id: string; lon: number; lat: number; label?: string; kind?: string }; group?: boolean; x?: number; y?: number; pointer?: string } | null;
}
interface Api {
  setPaths(list: unknown[]): void;
  placeSatellite(ref: { group: string; index: number }): { x: number; y: number; visible: boolean } | null;
  pathAt(x: number, y: number, radius?: number): { id: number | string } | null;
  places: unknown[];
}

async function open(page: Page, query: string): Promise<Locator> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${MOMENT}&speed=0&hide=Cities,Stadiums&${query}`);
  const space = page.locator(SPACE);
  await space.waitFor({ state: "attached" });
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await space.evaluate((el, types) => {
    const log: Entry[] = [];
    Reflect.set(window, "__log", log);
    for (const type of types) el.addEventListener(type, (event) => log.push({ type, detail: (event as CustomEvent).detail }));
  }, TYPES);
  await untilStill(page);
  return space;
}
const logOf = (page: Page): Promise<Entry[]> => page.evaluate(() => (Reflect.get(window, "__log") as Entry[]).slice());
const clearLog = (page: Page): Promise<void> => page.evaluate(() => void ((Reflect.get(window, "__log") as unknown[]).length = 0));
const typesOf = async (page: Page): Promise<string[]> => (await logOf(page)).map((entry) => entry.type);

/** Set the page's places and wait until the picture has drawn the markers that can be (`count` of them, none when 0). */
async function setPlaces(page: Page, space: Locator, list: unknown[], count: number): Promise<void> {
  await space.evaluate((el, places) => void Reflect.set(el, "places", places), list);
  await expect.poll(() => space.evaluate((el, n) => el.shadowRoot!.querySelectorAll(".pl-mark:not([hidden])").length === n, count), { timeout: 20_000, message: `${count} markers drawn` }).toBe(true);
  await untilStill(page);
}
/** The feet of the markers drawn, in the page. */
const feet = (space: Locator): Promise<{ x: number; y: number }[]> =>
  space.evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLElement>(".pl-mark:not([hidden])")].map((mark) => {
      const box = mark.getBoundingClientRect();
      return { x: box.left, y: box.top };
    }),
  );
const middle = async (space: Locator): Promise<{ x: number; y: number }> => {
  const box = (await space.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.describe("with a mouse", () => {
  test("a press on a place sends one chikyu-place-click and not the Earth's, along the stick as at the foot; a press beside it sends the Earth's", async ({ page }) => {
    const space = await open(page, `center=${TOKYO.lon},${TOKYO.lat}&places-look=beam`);
    await setPlaces(page, space, [{ id: "here", lon: TOKYO.lon, lat: TOKYO.lat, label: "You are here", kind: "here" }], 1);
    const [foot] = await feet(space);
    await page.mouse.click(foot!.x, foot!.y);
    await expect.poll(async () => (await typesOf(page)).length).toBe(1);
    const [entry] = await logOf(page);
    expect(entry!.type).toBe("chikyu-place-click");
    expect(entry!.detail).toMatchObject({ place: { id: "here", lon: TOKYO.lon, lat: TOKYO.lat, label: "You are here", kind: "here" }, group: false, pointer: "mouse" });
    const box = (await space.boundingBox())!;
    expect(Math.abs(entry!.detail!.x! - (foot!.x - box.x))).toBeLessThan(1.5);
    expect(Math.abs(entry!.detail!.y! - (foot!.y - box.y))).toBeLessThan(1.5);

    await clearLog(page);
    await page.mouse.click(foot!.x, foot!.y - 30);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-place-click");

    // 60 px from it the press is the Earth's, as before
    await clearLog(page);
    await page.mouse.click(foot!.x + 60, foot!.y + 20);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-body-click");
  });

  test("a drag that starts on a place sends nothing", async ({ page }) => {
    const space = await open(page, `center=${TOKYO.lon},${TOKYO.lat}`);
    await setPlaces(page, space, [{ id: "here", lon: TOKYO.lon, lat: TOKYO.lat, kind: "here" }], 1);
    const [foot] = await feet(space);
    await page.mouse.move(foot!.x, foot!.y);
    await page.mouse.down();
    await page.mouse.move(foot!.x + 24, foot!.y + 10, { steps: 4 });
    await page.mouse.up();
    // a quiet moment: the press has been heard if it was going to be
    await page.waitForTimeout(300); // asserts that nothing happens
    expect(await typesOf(page)).toEqual([]);
  });

  test("a place the Earth hides is not pressed: the press where its foot would be is the Earth's", async ({ page }) => {
    const space = await open(page, "center=-100,40");
    // the far side of the middle of the view: its foot would be in the middle of the picture
    await setPlaces(page, space, [{ id: "far", lon: 80, lat: -40, label: "Far side" }], 0);
    const at = await middle(space);
    await page.mouse.click(at.x, at.y);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-body-click");
  });

  test("places gathered into a group are not pressed, and are once place-groups is off", async ({ page }) => {
    const crowd = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, lon: TOKYO.lon + i * 0.01, lat: TOKYO.lat + i * 0.01 }));
    const space = await open(page, `center=${TOKYO.lon},${TOKYO.lat}`);
    await space.evaluate((el, places) => void Reflect.set(el, "places", places), crowd);
    await untilStill(page);
    expect(await space.evaluate((el) => el.shadowRoot!.querySelectorAll(".pl-mark:not([hidden])").length), "a group ring, no marker").toBe(0);
    const at = await middle(space);
    await page.mouse.click(at.x, at.y);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-body-click");

    await clearLog(page);
    await space.evaluate((el) => el.setAttribute("place-groups", "off"));
    await expect.poll(() => space.evaluate((el) => el.shadowRoot!.querySelectorAll(".pl-mark:not([hidden])").length)).toBeGreaterThan(0);
    await untilStill(page);
    const [foot] = await feet(space);
    await page.mouse.click(foot!.x, foot!.y);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-place-click");
  });
});

test.describe("with a finger", () => {
  test.use({ hasTouch: true });

  test("a tap within 22 px of a place sends it with pointer touch, where a mouse needs 14", async ({ page }) => {
    const space = await open(page, `center=${TOKYO.lon},${TOKYO.lat}`);
    await setPlaces(page, space, [{ id: "here", lon: TOKYO.lon, lat: TOKYO.lat, kind: "here" }], 1);
    const [foot] = await feet(space);
    await page.touchscreen.tap(foot!.x + 19, foot!.y);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-place-click");
    expect((await logOf(page))[0]!.detail).toMatchObject({ place: { id: "here" }, group: false, pointer: "touch" });
  });

  test("a mouse 19 px from a place, which only a finger reaches, is not on it: the press is the Earth's", async ({ page }) => {
    const space = await open(page, `center=${TOKYO.lon},${TOKYO.lat}`);
    await setPlaces(page, space, [{ id: "here", lon: TOKYO.lon, lat: TOKYO.lat, kind: "here" }], 1);
    const [foot] = await feet(space);
    await page.mouse.click(foot!.x + 19, foot!.y);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-body-click");
  });
});

// the ISS's place at the moment, from the recorded elements the page is given
const snapshot = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as { fields: string[]; groups: Record<string, (string | number)[][]> };
const iss = snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet).find((set) => set.NORAD_CAT_ID === 25544)!;
const where = (minutes: number): { latitude: number; longitude: number } => missionPosition([iss], Date.parse(MOMENT) + minutes * 60_000)!;

test.describe("the order of one press", () => {
  test("a satellite's dot over a place is the dot's: chikyu-satellite-click, not the place's", async ({ page }) => {
    const under = where(0);
    const space = await open(page, `center=${under.longitude},${under.latitude}&sats=stations`);
    await expect.poll(() => space.evaluate((el) => (Reflect.get(el, "satelliteGroups") as { placed: number }[]).some((group) => group.placed > 0)), { timeout: 30_000 }).toBe(true);
    await setPlaces(page, space, [{ id: "under", lon: under.longitude, lat: under.latitude }], 1);
    const [foot] = await feet(space);
    const dot = await space.evaluate((el) => (el as unknown as Api).placeSatellite({ group: "stations", index: 0 }) !== null);
    expect(dot).toBe(true);
    await page.mouse.click(foot!.x, foot!.y);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-satellite-click");
  });

  test("a path over a place is the path's: chikyu-path-click, not the place's", async ({ page }) => {
    const here = where(0);
    const space = await open(page, `center=${here.longitude},${here.latitude}&sats=stations`);
    await expect.poll(() => space.evaluate((el) => (Reflect.get(el, "satelliteGroups") as { placed: number }[]).some((group) => group.placed > 0)), { timeout: 30_000 }).toBe(true);
    await space.evaluate((el) => (el as unknown as Api).setPaths([{ id: 25544 }]));
    await untilStill(page);
    // a place on the ground track a few minutes on, where the drawn orbit passes within 3 px of its foot and no dot is near
    let found: { x: number; y: number } | null = null;
    for (const minutes of [2, 2.5, 3, 3.5, 4, 1.5, -2, -2.5, -3]) {
      const track = where(minutes);
      await setPlaces(page, space, [{ id: "track", lon: track.longitude, lat: track.latitude }], 1);
      const [foot] = await feet(space);
      const box = (await space.boundingBox())!;
      const onPath = await space.evaluate((el, at) => {
        const api = el as unknown as Api;
        if (!api.pathAt(at.x, at.y, 3)) return false;
        for (let index = 0; index < 40; index += 1) {
          const dot = api.placeSatellite({ group: "stations", index });
          if (dot?.visible && Math.hypot(dot.x - at.x, dot.y - at.y) < 24) return false;
        }
        return true;
      }, { x: foot!.x - box.x, y: foot!.y - box.y });
      if (onPath) {
        found = foot!;
        break;
      }
    }
    expect(found, "a place with the ISS's orbit through its foot").not.toBeNull();
    await page.mouse.click(found!.x, found!.y);
    await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-path-click");
  });
});

test("on the realistic Earth a press on a place sends chikyu-place-click too, with no satellites loaded", async ({ page }) => {
  await openEarth(page, `time=${NOON}&center=${TOKYO.lon},${TOKYO.lat}&hide=Cities,Stadiums`);
  const earth = page.locator(EARTH);
  await earth.evaluate((el) => {
    const log: Entry[] = [];
    Reflect.set(window, "__log", log);
    el.addEventListener("chikyu-place-click", (event) => log.push({ type: "chikyu-place-click", detail: (event as CustomEvent).detail }));
    Reflect.set(el, "places", [{ id: "here", lon: 139.69, lat: 35.69, kind: "here" }]);
  });
  await expect.poll(() => earth.evaluate((el) => el.shadowRoot!.querySelectorAll(".pl-mark:not([hidden])").length)).toBe(1);
  await untilStill(page);
  const [foot] = await feet(earth);
  await page.mouse.click(foot!.x, foot!.y);
  await expect.poll(async () => (await typesOf(page)).join()).toBe("chikyu-place-click");
  expect((await logOf(page))[0]!.detail).toMatchObject({ place: { id: "here" }, group: false, pointer: "mouse" });
});
