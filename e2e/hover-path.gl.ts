// A satellite under the pointer gets a faint orbit: dimmer than a chosen satellite's, gone when the pointer leaves, and absent for a touch.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";

interface SatStats {
  draws: number;
  satellites: { hoverPath: boolean; hoverOpacity: number; selectedOpacity: number };
}

const statsOf = (page: Page): Promise<SatStats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as SatStats);

async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { name: string }[]).some((group) => group.name === "stations")), { timeout: 20_000 }).toBe(true);
  await untilStill(page);
}

test("hovering a satellite draws an orbit fainter than a chosen one, a still pointer draws nothing more, and leaving or a touch takes it away", async ({ page }) => {
  await open(page);
  const target = await page.locator(SPACE).evaluate((el) => {
    const space = el as unknown as {
      satelliteGroups: { name: string; count: number }[];
      placeSatellite(ref: { group: string; index: number }): { x: number; y: number; visible: boolean } | null;
      satelliteInfo(ref: { group: string; index: number }): { name: string } | undefined;
      selectSatellite(ref: { group: string; index: number } | null): void;
    };
    const count = space.satelliteGroups.find((group) => group.name === "stations")!.count;
    let seen: { index: number; x: number; y: number; name: string } | null = null;
    for (let index = 0; index < count; index += 1) {
      const at = space.placeSatellite({ group: "stations", index });
      const name = space.satelliteInfo({ group: "stations", index })?.name;
      if (at?.visible && name) seen = { index, x: at.x, y: at.y, name };
    }
    if (!seen) return null;
    const other = seen.index === 0 ? 1 : 0;
    space.selectSatellite({ group: "stations", index: other });
    return { ...seen, other };
  });
  expect(target, "a station is on the screen").not.toBeNull();
  await expect.poll(async () => (await statsOf(page)).satellites.selectedOpacity, { timeout: 20_000 }).toBeGreaterThan(0.5);

  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.move(box.x + target!.x, box.y + target!.y);
  await expect.poll(async () => (await statsOf(page)).satellites.hoverOpacity, { timeout: 20_000 }).toBeGreaterThan(0);
  const both = (await statsOf(page)).satellites;
  expect(both.hoverPath, "the faint orbit is drawn").toBe(true);
  expect(both.hoverOpacity, "fainter than the chosen orbit").toBeLessThan(both.selectedOpacity);
  expect(Math.abs(both.hoverOpacity * 3 - both.selectedOpacity), "about a third of the brightness").toBeLessThan(0.05);
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => el.shadowRoot!.querySelector(".sp-sat[data-hover]:not([hidden])")?.textContent ?? "")).toBe(target!.name);

  await untilStill(page);
  const held = (await statsOf(page)).draws;
  await page.evaluate(async () => {
    for (let frame = 0; frame < 20; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await statsOf(page)).draws, "a still pointer draws nothing more").toBe(held);
  expect((await statsOf(page)).satellites.hoverPath, "the orbit stays while the pointer rests").toBe(true);

  await page.mouse.move(Math.max(0, box.x - 40), Math.max(0, box.y - 40));
  await expect.poll(async () => (await statsOf(page)).satellites.hoverOpacity, { timeout: 20_000 }).toBe(0);
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => el.shadowRoot!.querySelector(".sp-sat[data-hover]:not([hidden])") !== null)).toBe(false);

  await page.locator(SPACE).evaluate((el, at) => {
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointermove", { clientX: rect.left + at.x, clientY: rect.top + at.y, pointerType: "touch", bubbles: true }));
  }, target!);
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await statsOf(page)).satellites.hoverPath, "a touch does not rest, so no orbit").toBe(false);

  await page.locator(SPACE).evaluate((el) => el.setAttribute("hover-path", "off"));
  await page.mouse.move(box.x + target!.x, box.y + target!.y);
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await statsOf(page)).satellites.hoverPath, "hover-path=off draws none").toBe(false);
});
