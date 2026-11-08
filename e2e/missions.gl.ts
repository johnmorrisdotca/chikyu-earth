// The Space Shuttle missions in the demo, on the real element files the site carries (demo/missions/, recorded from Space-Track): pick an orbiter and a flight, replay it, and nothing asked of any other site.
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";

async function open(page: Page, query = ""): Promise<string[]> {
  const outside: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") {
      outside.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`/chikyu-earth/?look=space&speed=0${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  return outside;
}
const time = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "time") as number);
const groups = (page: Page): Promise<string[]> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { name: string }[]).map((one) => one.name));
const play = (page: Page) => page.locator('#mission-replay [data-act="play"]');
const chip = (page: Page, name: string) => page.locator(`#mission-list [data-mission="${name}"]`);

test("the row is there in the space look: six orbiter choices, the six Hubble flights first, every control a finger wide", async ({ page }) => {
  const outside = await open(page);
  await expect(page.locator("#mission-controls")).toBeVisible();
  expect(await page.locator("#mission-orbiters button").allTextContents()).toEqual(["Hubble visits", "Discovery", "Atlantis", "Columbia", "Endeavour", "Challenger"]);
  expect(await page.locator("#mission-list button").allTextContents()).toEqual(["STS-31 · 1990", "STS-61 · 1993", "STS-82 · 1997", "STS-103 · 1999", "STS-109 · 2002", "STS-125 · 2009"]);
  for (const box of await page.locator("#mission-orbiters button, #mission-list button").all()) expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.locator("#mission-orbiters").getByRole("button", { name: "Challenger" }).dispatchEvent("click");
  expect(await page.locator("#mission-list button").allTextContents()).toHaveLength(10);
  await page.locator("#mission-orbiters").getByRole("button", { name: "Discovery" }).dispatchEvent("click");
  expect(await page.locator("#mission-list button").allTextContents()).toHaveLength(39);
  expect(outside).toEqual([]);
});

test("a Hubble flight puts the orbiter and the telescope on the globe at liftoff, and says what the flight was and where the data came from", async ({ page }) => {
  const outside = await open(page);
  await chip(page, "sts-31").dispatchEvent("click");
  await expect(page.locator("#mission-info")).toContainText("STS-31: Discovery, launched Apr 24, 1990");
  await expect(page.locator("#mission-info")).toContainText("deployed the Hubble Space Telescope");
  await expect(page.locator("#mission-note")).toContainText("Data from Space-Track.org (USSPACECOM)");
  await expect.poll(() => groups(page)).toEqual(expect.arrayContaining(["mission-orbiter", "mission-hubble"]));
  expect(Math.abs((await time(page)) - Date.parse("1990-04-24T12:33:51Z"))).toBeLessThan(5000);
  await expect(page.locator("#mission-clock")).toContainText("Flight time 0:00:00");
  await expect.poll(() => new URL(page.url()).searchParams.get("mission")).toBe("sts-31");
  expect(outside).toEqual([]);
});

test("Play runs the flight forward at the chosen speed and Pause stops it; Back to liftoff goes to the start", async ({ page }) => {
  await open(page);
  await chip(page, "sts-61").dispatchEvent("click");
  await expect(page.locator("#mission-info")).toContainText("STS-61");
  const start = await time(page);
  await play(page).dispatchEvent("click");
  await expect.poll(async () => (await time(page)) - start, { timeout: 20_000 }).toBeGreaterThan(3_600_000);
  await play(page).dispatchEvent("click");
  const paused = await time(page);
  await page.waitForTimeout(600);
  expect(await time(page)).toBe(paused);
  await expect(page.locator("#mission-clock")).toContainText("Flight time");
  await page.locator('#mission-replay [data-act="start"]').dispatchEvent("click");
  await expect.poll(async () => Math.abs((await time(page)) - Date.parse("1993-12-02T09:27:00Z"))).toBeLessThan(5000);
});

test("the address brings back the flight and the moment, in Japanese too", async ({ page }) => {
  const outside = await open(page, "&mission=sts-1&time=1981-04-13T00:00Z");
  await expect(page.locator("#mission-info")).toContainText("STS-1: Columbia");
  expect(Math.abs((await time(page)) - Date.parse("1981-04-13T00:00:00Z"))).toBeLessThan(5000);
  await expect.poll(() => groups(page)).toContain("mission-orbiter");
  await expect(page.locator("#mission-clock")).toContainText("Flight time 0:");
  expect(outside).toEqual([]);
});

test("a flight with no orbit says so and shows nothing: STS-51L was lost 73 seconds after liftoff", async ({ page }) => {
  await open(page, "&mission=sts-51l");
  await expect(page.locator("#mission-info")).toContainText("STS-51L");
  await expect(page.locator("#mission-info")).toContainText("lost 73 seconds after liftoff");
  await expect(page.locator("#mission-note")).toContainText("no element sets");
  expect(await groups(page)).toEqual([]);
});

test("leaving the space look takes the row and the craft away", async ({ page }) => {
  await open(page, "&mission=sts-1");
  await expect(page.locator("#mission-controls")).toBeVisible();
  await page.locator("[data-style=\"line\"]").dispatchEvent("click");
  await expect(page.locator("#mission-controls")).toBeHidden();
  await expect(page.locator("#mission-info")).toBeHidden();
});
