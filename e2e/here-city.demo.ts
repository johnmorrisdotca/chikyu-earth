// The nearest city's name on a "you are here" marker: off until asked, then the city in the page's language, and nothing drawn at rest.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { COUNT_SCRIPT, counts, untilStill } from "./gl.ts";

test.describe.configure({ mode: "serial" });

const TOKYO = { lon: 139.6917, lat: 35.6895 };
const PLACES = [
  { id: "here", lon: TOKYO.lon, lat: TOKYO.lat, label: "You are here", kind: "here" },
  { id: "osaka", lon: 135.5023, lat: 34.6937, label: "Kept", kind: "favourite" },
];

interface HereStats {
  on: boolean;
  maxKm: number;
  loaded: boolean;
  pending: boolean;
  draws: number;
  renders: number;
}

async function open(page: Page, tag: string, look: string): Promise<Locator> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=${look}&time=2026-06-21T12:00Z&speed=0&center=${TOKYO.lon},${TOKYO.lat}`);
  const el = page.locator(tag);
  await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 90_000 });
  await page.locator("kazoku-view-controls").evaluate((node) => (node as HTMLElement & { pause(): void }).pause());
  return el;
}

const hereOf = (el: Locator): Promise<HereStats> =>
  el.evaluate((node) => {
    const stats = Reflect.get(node, "stats") as { draws: number; hereCity: Omit<HereStats, "draws" | "renders">; places: { renders: number } };
    return { ...stats.hereCity, draws: stats.draws, renders: stats.places.renders };
  });

const shownNames = (el: Locator): Promise<string[]> =>
  el.evaluate((node) =>
    [...node.shadowRoot!.querySelectorAll<HTMLElement>(".pl-name:not(.pl-measure)")]
      .filter((name) => !name.hidden && (name.dataset["kind"] === "here" || name.dataset["kind"] === "favourite"))
      .map((name) => name.textContent ?? ""),
  );

for (const [tag, look] of [
  ["chikyu-earth-realistic", "realistic"],
  ["chikyu-space", "space"],
] as const) {
  test(`${tag} names here with the nearest city only when here-city is on, and draws nothing at rest`, async ({ page }) => {
    test.setTimeout(120_000);
    const el = await open(page, tag, look);
    await el.evaluate((node, places) => Reflect.set(node, "places", places), PLACES);
    await expect.poll(async () => (await hereOf(el)).renders).toBeGreaterThan(0);
    expect((await hereOf(el)).on, "off by default").toBe(false);
    expect((await hereOf(el)).loaded, "kuni stays unloaded while off").toBe(false);
    expect((await hereOf(el)).pending).toBe(false);
    await expect.poll(() => shownNames(el)).toContain("You are here");

    await el.evaluate((node) => Reflect.set(node, "hereCity", true));
    expect(await el.evaluate((node) => Reflect.get(node, "hereCity"))).toBe(100);
    await expect.poll(async () => (await hereOf(el)).loaded, { timeout: 30_000 }).toBe(true);
    await expect.poll(() => shownNames(el)).toContain("Tokyo");
    expect(await shownNames(el), "a favourite keeps the name the page gave").toContain("Kept");
    expect(await el.evaluate((node) => (Reflect.get(node, "places") as { label?: string }[])[0]?.label), "places keeps the page's label").toBe("You are here");

    await el.evaluate((node) => node.setAttribute("lang", "ja"));
    await expect.poll(() => shownNames(el)).toContain("東京");

    await untilStill(page);
    const rest = await counts(page);
    const renders = (await hereOf(el)).renders;
    await untilStill(page);
    expect((await counts(page)).draws, "no draw at rest").toBe(rest.draws);
    expect((await counts(page)).rafRequests, "no frame asked for at rest").toBe(rest.rafRequests);
    expect((await hereOf(el)).renders, "the places are not laid out again at rest").toBe(renders);

    await el.evaluate((node) => {
      node.setAttribute("lang", "en");
      node.setAttribute("center", "170,0");
      Reflect.set(node, "hereCity", 1);
      Reflect.set(node, "places", [{ id: "here", lon: 170, lat: 0, label: "You are here", kind: "here" }]);
    });
    expect((await hereOf(el)).maxKm).toBe(1);
    await expect.poll(() => shownNames(el)).toEqual(["You are here"]);
  });
}

test("a town under 100,000 is named", async ({ page }) => {
  test.setTimeout(120_000);
  const el = await open(page, "chikyu-earth-realistic", "realistic");
  await el.evaluate((node) => {
    node.setAttribute("center", "132.5606,33.2233");
    Reflect.set(node, "places", [{ id: "here", lon: 132.5606, lat: 33.2233, label: "You are here", kind: "here" }]);
    Reflect.set(node, "hereCity", true);
  });
  await expect.poll(() => shownNames(el), { timeout: 40_000 }).toContain("Uwajima");
  expect(await shownNames(el)).not.toContain("Matsuyama");
});
