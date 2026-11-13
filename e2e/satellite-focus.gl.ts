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
