// The name beside the chosen satellite (`.sp-sat`) goes with the satellite: drawn while it is on the near side of the Earth, gone while the Earth hides it, in a real browser (Chromium, drawn in
// software), with the stations recorded on 2026-11-02. The view and the clock are held; the time is stepped through one orbit of the ISS, so it is in front at some steps and behind at others.
import { expect, test, type Page } from "@playwright/test";
import { untilArrived } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.use({ reducedMotion: "reduce" });
test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
interface Space {
  satelliteGroups: { name: string; count: number }[];
  satelliteInfo(ref: { group: string; index: number }): { noradId: number } | undefined;
  placeSatellite(ref: { group: string; index: number }): { occluded: boolean; edge: string | null } | null;
  selectSatellite(ref: { group: string; index: number } | null): void;
}

async function open(page: Page): Promise<void> {
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (el as unknown as Space).satelliteGroups.length), { timeout: 20_000 }).toBe(1);
}

/** What the page can read after a draw: whether the ISS is hidden by the Earth, whether it is inside the picture, and whether its chosen name is on the screen. */
const read = (page: Page, iss: number): Promise<{ occluded: boolean; inBox: boolean; named: boolean } | null> =>
  page.locator(SPACE).evaluate((el, index) => {
    const at = (el as unknown as Space).placeSatellite({ group: "stations", index });
    if (!at) return null;
    const label = el.shadowRoot!.querySelector<HTMLElement>(".sp-sat:not([data-hover])");
    return { occluded: at.occluded, inBox: at.edge === null, named: label !== null && !label.hidden && (label.textContent ?? "") !== "" };
  }, iss);

test("the chosen satellite's name is drawn where it is in front of the Earth and not where the Earth hides it", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  const iss = await page.locator(SPACE).evaluate((el) => {
    const space = el as unknown as Space;
    const count = space.satelliteGroups.find((group) => group.name === "stations")!.count;
    for (let index = 0; index < count; index += 1) if (space.satelliteInfo({ group: "stations", index })?.noradId === 25544) return index;
    return -1;
  });
  expect(iss, "the ISS is in the stations").toBeGreaterThanOrEqual(0);
  await page.locator(SPACE).evaluate((el, index) => (el as unknown as Space).selectSatellite({ group: "stations", index }), iss);
  const seen: string[] = [];
  let front = 0;
  let hidden = 0;
  for (let minutes = 0; minutes < 96; minutes += 6) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("time", at), new Date(Date.parse("2026-11-02T18:00:00Z") + minutes * 60_000).toISOString());
    await untilArrived(page);
    await expect.poll(async () => read(page, iss), { timeout: 20_000 }).not.toBeNull();
    const now = (await read(page, iss))!;
    seen.push(`+${minutes}:${now.occluded ? "hidden" : "front"}${now.inBox ? "" : "/off"}${now.named ? "/named" : ""}`);
    if (now.occluded) {
      hidden += 1;
      await expect.poll(async () => (await read(page, iss))?.named, { timeout: 10_000, message: `+${minutes} min: the Earth hides the chosen satellite, so its name is not on the Earth (${seen.join(" ")})` }).toBe(false);
    } else if (now.inBox) {
      front += 1;
      await expect.poll(async () => (await read(page, iss))?.named, { timeout: 10_000, message: `+${minutes} min: the chosen satellite is in front, so it is named (${seen.join(" ")})` }).toBe(true);
    }
  }
  expect(front, `steps with the ISS in front (${seen.join(" ")})`).toBeGreaterThan(0);
  expect(hidden, `steps with the ISS behind the Earth (${seen.join(" ")})`).toBeGreaterThan(0);
});
