// The page's paths (MODULES-1289): a list of orbits drawn at once in named looks, the chosen satellite's own orbit that a page may leave out or restyle, and the test of which path the pointer is on.
// Every clock is the test's own: `speed=0` at a given moment, the view's controls paused, and what is read is read in the same turn as the change that is asked for. The Far pictures are written to the test's output folder.
// With PATHS_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, drainGpu, pixelAt, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
const THROTTLE = Number(process.env.PATHS_THROTTLE ?? 0);

interface Ref {
  group: string;
  index: number;
}
interface PathStats {
  requested: number;
  drawn: number;
  dropped: number;
  unresolved: number;
  selectedDrawn: boolean;
  draws: number;
  hover: number | string | null;
  hits: number;
}
interface Stats {
  draws: number;
  paths: PathStats;
  satellites: { placed: number; selectedRing: boolean };
}
interface Hit {
  id: number | string;
  ref: Ref;
  style: string;
  x: number;
  y: number;
  distancePx: number;
  pointer: string;
}
interface Api {
  setPaths(list: unknown[]): void;
  setPathStyles(table: unknown, replace?: boolean): void;
  pathStyles: Record<string, { color: string; width: number; opacity: number; dash: number[] | null }>;
  paths: { id: number | string }[];
  selectedPath: boolean;
  pathHit: number;
  pathAt(x: number, y: number, radius?: number): Hit | null;
  selectSatellite(ref: Ref | null): void;
  placeSatellite(ref: Ref): { x: number; y: number; visible: boolean } | null;
  ride(target: unknown, options: unknown): void;
}

const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
const consoleErrors: string[] = [];

async function open(page: Page, query = ""): Promise<void> {
  consoleErrors.length = 0;
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleErrors.push(message.text());
  });
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 30_000 }).toBeGreaterThan(5);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.locator(SPACE).evaluate((el) => {
    const log: { type: string; detail: unknown }[] = [];
    Reflect.set(window, "__log", log);
    for (const type of ["chikyu-path-hover", "chikyu-path-click", "chikyu-satellite-click", "chikyu-sky-pick"]) el.addEventListener(type, (event) => log.push({ type, detail: (event as CustomEvent).detail }));
  });
  await untilStill(page);
}

/** Do `act` in the page and wait for the draw it asks for: the draw count is read in the same turn as the change, so a draw that lands between a read and the change cannot be mistaken for it. */
async function change(page: Page, act: (api: Api) => void): Promise<Stats> {
  const before = await page.locator(SPACE).evaluate((el, source) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    (new Function(`return (${source})`)() as (api: unknown) => void)(el);
    return draws;
  }, act.toString());
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: "a draw after the change" }).toBeGreaterThan(before);
  await untilStill(page);
  return statsOf(page);
}

/** Run a function in the page with the element as its first argument and `arg` as its second. */
const inPage = <T, A>(page: Page, fn: (api: Api, arg: A) => T, arg: A): Promise<T> =>
  page.locator(SPACE).evaluate((el, [source, value]) => (new Function(`return (${source as string})`)() as (e: unknown, a: unknown) => unknown)(el, value) as never, [fn.toString(), arg] as const) as Promise<T>;

const logOf = (page: Page): Promise<{ type: string; detail: unknown }[]> => page.evaluate(() => (Reflect.get(window, "__log") as { type: string; detail: unknown }[]).slice());
const clearLog = (page: Page): Promise<void> => page.evaluate(() => void ((Reflect.get(window, "__log") as unknown[]).length = 0));

/** Where the stations' dots are, in CSS pixels in the element. */
const dots = (page: Page): Promise<{ index: number; x: number; y: number }[]> =>
  inPage(
    page,
    (api, n: number) => {
      const out: { index: number; x: number; y: number }[] = [];
      for (let index = 0; index < n; index += 1) {
        const at = api.placeSatellite({ group: "stations", index });
        if (at?.visible) out.push({ index, x: at.x, y: at.y });
      }
      return out;
    },
    20,
  );

/** A point on a drawn path, at least `clear` pixels from every dot: found by looking over the picture, which is held. */
async function pointOnPath(page: Page, clear: number, near?: { x: number; y: number; within: number }): Promise<Hit> {
  const found = await inPage(
    page,
    (api, arg: { clear: number; near?: { x: number; y: number; within: number }; dots: { x: number; y: number }[] }) => {
      const box = (api as unknown as HTMLElement).getBoundingClientRect();
      for (let y = 10; y < box.height - 10; y += 5) {
        for (let x = 10; x < box.width - 10; x += 5) {
          if (arg.near && Math.hypot(x - arg.near.x, y - arg.near.y) > arg.near.within) continue;
          const hit = api.pathAt(x, y, 3);
          if (!hit) continue;
          if (arg.dots.some((dot) => Math.hypot(dot.x - hit.x, dot.y - hit.y) < arg.clear)) continue;
          return hit;
        }
      }
      return null;
    },
    { clear, near, dots: await dots(page) },
  );
  expect(found, "a path is on the picture, away from the dots").not.toBeNull();
  return found!;
}

/** A point on a path and another 12.5 px from it (on the same path, nearest to it): out of a mouse's reach, inside a touch's. Found on the picture as it is now. */
async function twelveAway(page: Page): Promise<{ hit: Hit; offset: { x: number; y: number } }> {
  const hit = await pointOnPath(page, 30);
  const offset = await inPage(
    page,
    (api, from: { x: number; y: number; id: number | string }) => {
      for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const x = from.x + 12.5 * Math.cos((angle * Math.PI) / 180);
        const y = from.y + 12.5 * Math.sin((angle * Math.PI) / 180);
        const near = api.pathAt(x, y, 40);
        if (near && near.id === from.id && near.distancePx > 11 && near.distancePx < 14) return { x, y };
      }
      return null;
    },
    { x: hit.x, y: hit.y, id: hit.id },
  );
  expect(offset, "a point 12 px from that path").not.toBeNull();
  return { hit, offset: offset! };
}

const press = async (page: Page, x: number, y: number): Promise<void> => {
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.click(box.x + x, box.y + y);
};

test("no line is drawn at rest unless asked: paths and the chosen orbit are one draw call, and the chosen orbit can be left out", async ({ page }) => {
  await open(page);
  const rest = await statsOf(page);
  expect(rest.paths, "nothing asked for, nothing drawn").toMatchObject({ requested: 0, drawn: 0, draws: 0, selectedDrawn: false });

  const chosen = await change(page, (api) => api.selectSatellite({ group: "stations", index: 0 }));
  expect(chosen.paths.selectedDrawn, "the chosen satellite's orbit is drawn as it always was").toBe(true);
  expect(chosen.paths.drawn).toBe(1);
  expect(chosen.paths.draws).toBe(1);

  const off = await change(page, (api) => void (api.selectedPath = false));
  expect(off.paths.selectedDrawn, "selected-path off: no line").toBe(false);
  expect(off.paths.drawn).toBe(0);
  expect(off.paths.draws).toBe(0);
  expect(off.satellites.selectedRing, "the satellite is still ringed").toBe(true);
  expect(await page.locator(SPACE).getAttribute("selected-path")).toBe("off");

  const several = await change(page, (api) => api.setPaths([{ id: 25544, style: "favourite" }, { id: "stations:3", style: "hovered" }, { id: "stations:4" }]));
  expect(several.paths).toMatchObject({ requested: 3, drawn: 3, dropped: 0, draws: 1 });

  await untilStill(page);
  const held = (await statsOf(page)).draws;
  await page.evaluate(async () => {
    for (let frame = 0; frame < 20; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await statsOf(page)).draws, "paths shown, nothing is drawn at rest").toBe(held);
  expect(consoleErrors, "the lines' shader compiled and drew without a warning").toEqual([]);
  await drainGpu(page);
});

test("more than 16 paths keep the last 16, and the one draw stays one", async ({ page }) => {
  await open(page);
  const list = Array.from({ length: 20 }, (_, index) => ({ id: `stations:${index}`, style: index % 2 ? "favourite" : "path" }));
  const stats = await change(page, (api) => api.setPaths(Array.from({ length: 20 }, (_, index) => ({ id: `stations:${index}`, style: index % 2 ? "favourite" : "path" }))));
  expect(stats.paths).toMatchObject({ requested: 20, drawn: 16, dropped: 4, draws: 1 });
  const kept = await inPage(page, (api) => api.paths.map((one) => one.id), null);
  expect(kept, "the most recent are kept, in order").toEqual(list.slice(4).map((one) => one.id));
  const none = await change(page, (api) => api.setPaths([]));
  expect(none.paths).toMatchObject({ requested: 0, drawn: 0, draws: 0 });
});

test("the style table: built-in looks differ by width or dash, a page's entry overrides one, null puts it back, and the override reaches the screen", async ({ page }) => {
  await open(page);
  const table = await inPage(page, (api) => api.pathStyles, null);
  expect(Object.keys(table).sort()).toEqual(["favourite", "hovered", "path", "selected"]);
  expect(table["favourite"]).toMatchObject({ width: 1.75, dash: [3, 4] });
  const shapes = Object.values(table).map((look) => `${look.width}|${look.dash?.join(",") ?? "solid"}`);
  expect(new Set(shapes).size, "no two looks share both width and dash").toBe(shapes.length);

  await change(page, (api) => api.setPaths([{ id: "stations:1", style: "mine" }]));
  const hit = await pointOnPath(page, 0);
  const lookAt = async (): Promise<number[]> => {
    const [r, g, b] = await pixelAt(page, page.locator(SPACE), hit.x / (await page.locator(SPACE).evaluate((el) => el.clientWidth)), hit.y / (await page.locator(SPACE).evaluate((el) => el.clientHeight)));
    return [r, g, b];
  };
  await change(page, (api) => api.setPathStyles({ mine: { color: "#ff0000", width: 6, opacity: 1, dash: null } }));
  await test.info().attach("style", { body: await page.locator(SPACE).screenshot(), contentType: "image/png" });
  const [r, g, b] = await lookAt();
  expect(r, "a red path of 6 px is red where it was found").toBeGreaterThan(180);
  expect(g).toBeLessThan(90);
  expect(b).toBeLessThan(90);
  const overridden = await inPage(page, (api) => api.pathStyles["mine"]!, null);
  expect(overridden).toMatchObject({ color: "#ff0000", width: 6 });

  await change(page, (api) => api.setPathStyles({ favourite: { color: "#00ff00", width: 5 } }));
  const changed = await inPage(page, (api) => api.pathStyles["favourite"]!, null);
  expect(changed).toMatchObject({ color: "#00ff00", width: 5, dash: [3, 4] });
  await change(page, (api) => api.setPathStyles({ favourite: null, mine: null }));
  const back = await inPage(page, (api) => api.pathStyles, null);
  expect(back["favourite"]).toMatchObject({ color: "#ffd166", width: 1.75 });
  expect(back["mine"], "a name of the page's own is gone").toBeUndefined();
});

test("a dashed look draws less of the line than a solid one of the same width", async ({ page }) => {
  await open(page);
  await change(page, (api) => api.setPaths([{ id: "stations:1", style: { color: "#ff0000", width: 3, opacity: 1, dash: null } }]));
  const hit = await pointOnPath(page, 0);
  const box = await page.locator(SPACE).evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
  const reddish = async (): Promise<number> => {
    const png = (await page.locator(SPACE).screenshot()).toString("base64");
    return page.evaluate(async ([data, cx, cy]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data as string}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(Math.max(0, Math.round((cx as number) - 25)), Math.max(0, Math.round((cy as number) - 25)), 50, 50).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 150 && pixels[i + 1]! < 100 && pixels[i + 2]! < 100) count += 1;
      return count;
    }, [png, hit.x, hit.y] as const);
  };
  expect(box.w).toBeGreaterThan(50);
  const solid = await reddish();
  expect(solid, "the solid line is on the picture").toBeGreaterThan(40);
  await change(page, (api) => api.setPaths([{ id: "stations:1", style: { color: "#ff0000", width: 3, opacity: 1, dash: [4, 12] } }]));
  const dashed = await reddish();
  expect(dashed, "a quarter of the line is dash").toBeLessThan(solid * 0.6);
  expect(dashed, "and some of it is").toBeGreaterThan(0);
});

test("a mouse is told which path it is on, within 8 px, and when it leaves; nothing is drawn for it", async ({ page }) => {
  await open(page);
  await change(page, (api) => api.setPaths([{ id: "stations:1", style: "favourite" }, { id: 25544, style: "path" }]));
  const hit = await pointOnPath(page, 25);
  expect(hit.distancePx).toBeLessThan(3);
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.move(box.x + hit.x + 5, box.y + hit.y);
  await expect.poll(async () => (await logOf(page)).filter((entry) => entry.type === "chikyu-path-hover").length, { timeout: 20_000 }).toBeGreaterThan(0);
  const first = (await logOf(page)).find((entry) => entry.type === "chikyu-path-hover")!.detail as Hit;
  expect(first.id).toBe(hit.id);
  expect(first.ref, "the same shape as chikyu-satellite-click's ref").toEqual(hit.ref);
  expect(first.style).toBe(hit.style);
  expect(first.pointer).toBe("mouse");
  expect(first.distancePx).toBeLessThanOrEqual(8);
  expect((await statsOf(page)).paths.hover).toBe(hit.id);
  // a move of the pointer asks for a draw, as it always did (the faint orbit's resting test); what the paths add is nothing: a pointer that rests on a path draws nothing more
  await untilStill(page);
  const resting = (await statsOf(page)).draws;
  await page.evaluate(async () => {
    for (let frame = 0; frame < 20; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await statsOf(page)).draws, "a pointer resting on a path draws nothing").toBe(resting);

  await clearLog(page);
  await page.mouse.move(box.x + hit.x + 5, box.y + hit.y + 40);
  await expect.poll(async () => (await logOf(page)).some((entry) => entry.type === "chikyu-path-hover" && entry.detail === null), { timeout: 20_000 }).toBe(true);
  expect((await statsOf(page)).paths.hover).toBeNull();

  await inPage(page, (api) => void (api.pathHit = 0), null);
  expect(await inPage(page, (api) => api.pathAt(0, 0), null)).toBeNull();
  expect(await inPage(page, (api, p: { x: number; y: number }) => api.pathAt(p.x, p.y), { x: hit.x, y: hit.y }), "path-hit 0 turns the test off").toBeNull();
  await page.locator(SPACE).evaluate((el) => el.removeAttribute("path-hit"));
});

test("a press is one thing: a dot first, then a path, and a touch is given twice the reach of a mouse", async ({ page }) => {
  await open(page);
  const dot = (await dots(page))[0]!;
  await inPage(page, (api, index: number) => api.setPaths([{ id: `stations:${index}`, style: "favourite" }, { id: 25544, style: "path" }]), dot.index);
  await expect.poll(async () => (await statsOf(page)).paths.drawn, { timeout: 20_000 }).toBeGreaterThan(0);
  await untilStill(page);
  await clearLog(page);
  await press(page, dot.x, dot.y);
  await expect.poll(async () => (await logOf(page)).filter((entry) => entry.type === "chikyu-satellite-click").length).toBe(1);
  const afterDot = await logOf(page);
  expect(afterDot.filter((entry) => entry.type === "chikyu-path-click"), "the dot took the press").toHaveLength(0);
  const clickRef = (afterDot.find((entry) => entry.type === "chikyu-satellite-click")!.detail as { group: string; index: number });
  expect(clickRef.group).toBe("stations");

  // the demo answers a click on a satellite by choosing it and turning the view to it: let that finish before a path is looked for
  await untilStill(page);

  // a press on a path, away from any dot: only the path is told, with the same ref shape as a satellite click
  const hit = await pointOnPath(page, 30);
  await clearLog(page);
  await press(page, hit.x, hit.y);
  await expect.poll(async () => (await logOf(page)).filter((entry) => entry.type === "chikyu-path-click").length).toBe(1);
  const afterPath = await logOf(page);
  // the mouse moved onto the path to press it, so a hover is told too; a press is one thing
  expect(afterPath.filter((entry) => entry.type !== "chikyu-path-click" && entry.type !== "chikyu-path-hover"), "the press was the path's alone").toHaveLength(0);
  const told = afterPath.find((entry) => entry.type === "chikyu-path-click")!.detail as Hit;
  expect(Object.keys(told.ref).sort()).toEqual(Object.keys(clickRef).filter((key) => key === "group" || key === "index").sort());
  expect(told.pointer).toBe("mouse");
  expect((await statsOf(page)).paths.hits).toBe(1);

  // 12 px from the line: out of a mouse's 8, inside a touch's 16. The demo turns the view to what is pressed, so the view is let settle and the point found again before each press.
  await untilStill(page);
  const first12 = await twelveAway(page);
  await clearLog(page);
  await press(page, first12.offset.x, first12.offset.y);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await logOf(page)).filter((entry) => entry.type !== "chikyu-path-hover"), "a mouse 12 px away is on nothing").toHaveLength(0);

  await untilStill(page);
  const second12 = await twelveAway(page);
  await clearLog(page);
  await page.locator(SPACE).evaluate((el, at) => {
    const rect = el.getBoundingClientRect();
    const init = { clientX: rect.left + at.x, clientY: rect.top + at.y, pointerType: "touch", pointerId: 7, button: 0, bubbles: true, composed: true };
    el.dispatchEvent(new PointerEvent("pointerdown", init));
    el.dispatchEvent(new PointerEvent("pointerup", init));
  }, second12.offset);
  await expect.poll(async () => (await logOf(page)).filter((entry) => entry.type === "chikyu-path-click").length).toBe(1);
  const touched = (await logOf(page)).find((entry) => entry.type === "chikyu-path-click")!.detail as Hit;
  expect(touched.pointer).toBe("touch");
  expect(touched.id).toBe(second12.hit.id);
  expect(await inPage(page, (api) => api.pathHit, null), "path-hit is still the mouse's 8").toBe(8);
});

test("a touch that moves is a drag, not a press on a path", async ({ page }) => {
  await open(page);
  await change(page, (api) => api.setPaths([{ id: "stations:1", style: "favourite" }]));
  const hit = await pointOnPath(page, 30);
  await clearLog(page);
  await page.locator(SPACE).evaluate((el, at) => {
    const rect = el.getBoundingClientRect();
    const down = { clientX: rect.left + at.x, clientY: rect.top + at.y, pointerType: "touch", pointerId: 8, button: 0, bubbles: true, composed: true };
    el.dispatchEvent(new PointerEvent("pointerdown", down));
    el.dispatchEvent(new PointerEvent("pointerup", { ...down, clientX: down.clientX + 20 }));
  }, hit);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await logOf(page)).filter((entry) => entry.type !== "chikyu-path-hover")).toHaveLength(0);
});

test("a ride draws the ridden satellite's own orbit in the selected look, and the hit test is off in a ride unless path-hit is set", async ({ page }) => {
  await open(page);
  const riding = await change(page, (api) => api.ride({ group: "stations", index: 0 }, { view: "above", smooth: false }));
  expect(riding.paths.drawn, "the ridden satellite's orbit is one path").toBe(1);
  expect(riding.paths.draws).toBe(1);
  const grid = (api: Api): number => {
    const box = (api as unknown as HTMLElement).getBoundingClientRect();
    let found = 0;
    for (let y = 5; y < box.height; y += 10) for (let x = 5; x < box.width; x += 10) if (api.pathAt(x, y)) found += 1;
    return found;
  };
  expect(await inPage(page, grid, null), "no hit test in a ride until the page asks").toBe(0);
  await page.locator(SPACE).evaluate((el) => el.setAttribute("path-hit", "40"));
  expect(await inPage(page, grid, null), "path-hit set: the ridden orbit can be found").toBeGreaterThan(0);
  await page.locator(SPACE).evaluate((el) => el.removeAttribute("path-hit"));
  const off = await change(page, (api) => void (api.selectedPath = false));
  expect(off.paths.drawn, "selected-path off leaves the ridden orbit out too").toBe(0);
  await change(page, (api) => api.ride(null, {}));
});
