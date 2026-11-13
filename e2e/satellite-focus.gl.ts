// One satellite group on its own: the focused group's drawn count, the other's dim or hidden state, the camera, and nothing drawn once that has settled.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";
import { untilArrived } from "./gl.ts";

test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";

interface GroupRow {
  name: string;
  count: number;
  visible: boolean;
  placed: number;
  emphasis: string;
}
interface FocusAnswer {
  ok: boolean;
  group?: string | null;
  count?: number;
  reason?: string;
}

const read = (page: Page): Promise<{ draws: number; distance: number; groups: GroupRow[]; focus: string | null }> =>
  page.locator(SPACE).evaluate((el) => {
    const stats = Reflect.get(el, "stats") as { draws: number; distance: number };
    return { draws: stats.draws, distance: stats.distance, groups: Reflect.get(el, "satelliteGroups") as GroupRow[], focus: Reflect.get(el, "focusedSatelliteGroup") as string | null };
  });

test("focusing one group dims or hides the other, frames the shell, and restores both", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations,gps`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await read(page)).groups.map((group) => group.name).sort().join(","), { timeout: 20_000 }).toBe("gps,stations");
  await expect.poll(async () => (await read(page)).groups.every((group) => group.placed === group.count)).toBe(true);
  const opened = await read(page);

  const first = await page.locator(SPACE).evaluate((el) => {
    let detail: { group: string | null; count: number } | null = null;
    el.addEventListener("chikyu-satellite-focus", (event) => {
      detail = (event as CustomEvent<{ group: string | null; count: number }>).detail;
    }, { once: true });
    const answer = (el as unknown as { focusSatelliteGroup(name: string, options?: { others?: string; frame?: boolean }): FocusAnswer }).focusSatelliteGroup("gps", { others: "dim", frame: true });
    return { answer, detail };
  });
  expect(first.answer, "gps is set, so the focus is accepted").toEqual({ ok: true, group: "gps", count: first.answer.count });
  expect(first.detail, "the event carries the group and its count").toEqual({ group: "gps", count: first.answer.count });
  await expect.poll(async () => (await read(page)).distance).toBeGreaterThan(opened.distance * 2);
  const dimmed = await read(page);
  const gps = dimmed.groups.find((group) => group.name === "gps")!;
  const stations = dimmed.groups.find((group) => group.name === "stations")!;
  expect(dimmed.focus).toBe("gps");
  expect(gps.emphasis).toBe("focus");
  expect(gps.placed).toBe(gps.count);
  expect(stations.emphasis).toBe("dim");
  expect(stations.placed).toBe(stations.count);
  expect(stations.visible, "dimming keeps the page's shown state").toBe(true);

  await page.locator(SPACE).evaluate((el) => (el as unknown as { focusSatelliteGroup(name: string, options?: { others?: string; frame?: boolean }): FocusAnswer }).focusSatelliteGroup("gps", { others: "hide", frame: false }));
  await expect.poll(async () => (await read(page)).groups.find((group) => group.name === "stations")?.placed).toBe(0);
  const hidden = await read(page);
  expect(hidden.groups.find((group) => group.name === "stations")?.emphasis).toBe("hidden");
  expect(hidden.groups.find((group) => group.name === "gps")?.placed).toBe(hidden.groups.find((group) => group.name === "gps")?.count);
  expect(Math.abs(hidden.distance - dimmed.distance) / dimmed.distance, "frame: false leaves the camera").toBeLessThan(0.02);

  const cleared = await page.locator(SPACE).evaluate((el) => {
    let detail: { group: string | null; count: number } | null = null;
    el.addEventListener("chikyu-satellite-focus", (event) => {
      detail = (event as CustomEvent<{ group: string | null; count: number }>).detail;
    }, { once: true });
    const answer = (el as unknown as { focusSatelliteGroup(name: null): FocusAnswer }).focusSatelliteGroup(null);
    return { answer, detail, focus: Reflect.get(el, "focusedSatelliteGroup") };
  });
  expect(cleared.answer).toEqual({ ok: true, group: null, count: 0 });
  expect(cleared.detail).toEqual({ group: null, count: 0 });
  expect(cleared.focus).toBeNull();
  await expect.poll(async () => (await read(page)).groups.every((group) => group.emphasis === "plain" && group.placed === group.count)).toBe(true);
  await expect.poll(async () => Math.abs((await read(page)).distance - opened.distance) / opened.distance).toBeLessThan(0.05);

  const refused = await page.locator(SPACE).evaluate((el) => (el as unknown as { focusSatelliteGroup(name: string): FocusAnswer }).focusSatelliteGroup("no-such-group"));
  expect(refused).toEqual({ ok: false, reason: "not-set" });
  expect((await read(page)).focus).toBeNull();

  await untilArrived(page);
  const rest = await read(page);
  await untilArrived(page);
  expect((await read(page)).draws, "nothing is drawn once the framed view has settled").toBe(rest.draws);
});

test("clearing the focus puts back the exact camera, a ride that was left stays left, and a second call is no change", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations,gps`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await read(page)).groups.every((group) => group.placed === group.count && group.count > 0), { timeout: 20_000 }).toBe(true);
  const camera = (): Promise<{ distance: number; q: number[] }> =>
    page.locator(SPACE).evaluate((el) => {
      const stats = Reflect.get(el, "stats") as { distance: number; camera: { quaternion: number[] } };
      return { distance: stats.distance, q: [...stats.camera.quaternion] };
    });
  await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 37, tilt: 12, zoom: 1.3 }, true));
  await untilArrived(page);
  const before = await camera();

  const twice = await page.locator(SPACE).evaluate((el) => {
    const told: unknown[] = [];
    el.addEventListener("chikyu-satellite-focus", (event) => told.push((event as CustomEvent).detail));
    const api = el as unknown as { focusSatelliteGroup(name: string | null, options?: { others?: string }): unknown };
    api.focusSatelliteGroup("gps", { others: "hide" });
    api.focusSatelliteGroup("gps", { others: "hide" });
    api.focusSatelliteGroup("stations", { others: "hide" });
    return told;
  });
  expect(twice, "one event for each change of choice, none for the call that changed nothing").toEqual([
    { group: "gps", count: expect.any(Number) },
    { group: "stations", count: expect.any(Number) },
  ]);
  await untilArrived(page);

  const left = await page.locator(SPACE).evaluate((el) => {
    const api = el as unknown as { ride(target: unknown): void; riding: unknown; focusSatelliteGroup(name: string | null): unknown };
    api.ride({ group: "stations", index: 0 });
    const riding = api.riding !== null;
    api.focusSatelliteGroup("gps");
    return { riding, after: api.riding };
  });
  expect(left.riding, "the ride was on").toBe(true);
  expect(left.after, "a focus leaves the ride, because the camera must look at the Earth to see the shell").toBeNull();

  const quiet = await page.locator(SPACE).evaluate((el) => {
    const api = el as unknown as { focusSatelliteGroup(name: string | null): unknown; focusedSatelliteGroup: string | null; riding: unknown };
    const told: unknown[] = [];
    el.addEventListener("chikyu-satellite-focus", (event) => told.push((event as CustomEvent).detail));
    api.focusSatelliteGroup(null);
    const first = told.length;
    const again = api.focusSatelliteGroup(null);
    return { first, again, total: told.length, focus: api.focusedSatelliteGroup, riding: api.riding };
  });
  expect(quiet.again).toEqual({ ok: true, group: null, count: 0 });
  expect(quiet.total, "clearing twice tells once").toBe(1);
  expect(quiet.focus).toBeNull();
  expect(quiet.riding, "the ride that was left stays left").toBeNull();
  await untilArrived(page);
  const after = await camera();
  expect(Math.abs(after.distance - before.distance) / before.distance, "the zoom is the one before the first focus").toBeLessThan(0.001);
  for (let i = 0; i < 4; i += 1) expect(after.q[i]!, `quaternion ${i}`).toBeCloseTo(before.q[i]!, 4);
});

test("a group the page hid is drawn, and kept moving, while it is the one in focus", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/chikyu-earth/?look=space&center=-100,40&sats=gps&speed=1`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await read(page)).groups.length, { timeout: 20_000 }).toBe(1);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { showSatellites(name: string, on: boolean): void }).showSatellites("gps", false));
  await expect.poll(async () => (await read(page)).groups[0]?.placed).toBe(0);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { focusSatelliteGroup(name: string): unknown }).focusSatelliteGroup("gps"));
  await expect.poll(async () => (await read(page)).groups[0]?.placed, { timeout: 20_000 }).toBeGreaterThan(0);
  const first = await read(page);
  expect(first.groups[0]?.visible, "the page's own shown state is still hidden").toBe(false);
  await page.waitForTimeout(4000);
  expect((await read(page)).draws - first.draws, "satellites on show go on being drawn as time runs, not once a minute").toBeGreaterThanOrEqual(2);
});
