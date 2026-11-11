// Places on the Earth ("you are here" and favourites) in a real browser (Chromium, drawn in software): standing out of the ground where they are, gone on the far side, names that never overlap one another
// or the bodies' names, a pulse that is the page's own animation (none for less motion, paused out of sight) and nothing drawn at rest; and the demo asks for the reader's place only when they press for it.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { COUNT_SCRIPT, counts, EARTH, NOON, openEarth, untilStill } from "./gl.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const TOKYO = { lon: 139.69, lat: 35.69 };
const PLACES = [
  { id: "here", lon: TOKYO.lon, lat: TOKYO.lat, label: "You are here", kind: "here" },
  { id: "osaka", lon: 135.5, lat: 34.69, label: "Osaka", kind: "favourite" },
  { id: "seoul", lon: 126.98, lat: 37.57, label: "Seoul", kind: "favourite" },
  { id: "sapporo", lon: 141.35, lat: 43.06, label: "Sapporo", kind: "favourite" },
  { id: "far", lon: -40, lat: -30, label: "Far side", kind: "favourite" },
];
interface PlaceStats {
  places: number;
  shown: number;
  labels: number;
  renders: number;
}
const placesOf = (target: Locator): Promise<PlaceStats> => target.evaluate((el) => (Reflect.get(el, "stats") as { places: PlaceStats }).places);
const setPlaces = (target: Locator, places: unknown[]): Promise<void> => target.evaluate((el, list) => void Reflect.set(el, "places", list), places);

interface Box {
  text: string;
  l: number;
  t: number;
  r: number;
  b: number;
}
/** The boxes of the names shown, as the page draws them: the places' names, and the bodies' names of the space view. */
const nameBoxes = (target: Locator, selector: string): Promise<Box[]> =>
  target.evaluate(
    (el, css) =>
      [...el.shadowRoot!.querySelectorAll<HTMLElement>(css)]
        .filter((n) => !n.hidden && n.getClientRects().length > 0)
        .map((n) => {
          const box = n.getBoundingClientRect();
          return { text: n.textContent ?? "", l: box.left, t: box.top, r: box.right, b: box.bottom };
        }),
    selector,
  );
const overlapping = (boxes: Box[]): string[] => {
  const out: string[] = [];
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) if (a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5) out.push(`${a.text} / ${b.text}`);
  return out;
};
/** Where the `here` marker's foot is, in the page. */
const hereFoot = (target: Locator): Promise<{ x: number; y: number } | null> =>
  target.evaluate((el) => {
    const mark = el.shadowRoot!.querySelector<HTMLElement>(".pl-mark[data-kind=here]:not([hidden])");
    if (!mark) return null;
    const box = mark.getBoundingClientRect();
    return { x: box.left, y: box.top };
  });

async function openSpace(page: Page, query: string): Promise<Locator> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&speed=0&${query}`);
  const space = page.locator(SPACE);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  // with motion allowed the demo opens with the view turning: hold it, so what is measured is the places
  await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
  return space;
}

test.describe("on the realistic Earth", () => {
  test.use({ reducedMotion: "reduce" });

  test("places stand where they are, the far side is left out, names never overlap, and nothing is drawn at rest", async ({ page }) => {
    await openEarth(page, `time=${NOON}&center=${TOKYO.lon},${TOKYO.lat}&hide=Cities,Stadiums`);
    const earth = page.locator(EARTH);
    await setPlaces(earth, PLACES);
    await expect.poll(async () => (await placesOf(earth)).shown).toBe(4);
    expect((await placesOf(earth)).places).toBe(5);
    expect(await earth.evaluate((el) => Reflect.get(el, "places").length)).toBe(5);
    expect(await earth.getAttribute("places")).toContain('"kind":"here"');

    // Tokyo is in the middle of a view centred on it
    const box = (await earth.boundingBox())!;
    const foot = (await hereFoot(earth))!;
    expect(Math.abs(foot.x - (box.x + box.width / 2))).toBeLessThan(3);
    expect(Math.abs(foot.y - (box.y + box.height / 2))).toBeLessThan(3);

    const names = await nameBoxes(earth, ".pl-name");
    expect(names.map((n) => n.text)).toContain("You are here");
    expect(overlapping(names)).toEqual([]);
    for (const name of names) expect(name.l >= box.x - 1 && name.r <= box.x + box.width + 1 && name.t >= box.y - 1 && name.b <= box.y + box.height + 1, `${name.text} inside the picture`).toBe(true);

    // no pulse for a reader who asked for less motion
    expect(await earth.evaluate((el) => el.shadowRoot!.querySelector(".pl-mark[data-kind=here] .pl-pulse")!.getAnimations().length)).toBe(0);

    await untilStill(page);
    const rest = await counts(page);
    const renders = (await placesOf(earth)).renders;
    await page.waitForTimeout(2000);
    expect((await counts(page)).draws, "no draw at rest").toBe(rest.draws);
    expect((await counts(page)).rafRequests, "no frame asked for at rest").toBe(rest.rafRequests);
    expect((await placesOf(earth)).renders, "the places are laid out only when the picture is drawn").toBe(renders);

    // the look is a setting; an empty list takes them all away
    await earth.evaluate((el) => el.setAttribute("places-look", "pin"));
    expect(await earth.evaluate((el) => el.shadowRoot!.querySelector<HTMLElement>("#places")!.dataset["look"])).toBe("pin");
    await setPlaces(earth, []);
    await expect.poll(async () => (await placesOf(earth)).shown).toBe(0);
    expect(await earth.getAttribute("places")).toBeNull();
  });
});

test.describe("in the space view", () => {
  test.use({ reducedMotion: "no-preference" });

  test("places turn with the Earth, keep clear of the bodies' names, pulse only while in sight, and add no draw at rest", async ({ page }) => {
    const space = await openSpace(page, `time=2026-11-02T03:00Z&center=${TOKYO.lon},${TOKYO.lat}`);
    await setPlaces(space, PLACES);
    await expect.poll(async () => (await placesOf(space)).shown).toBeGreaterThanOrEqual(3);
    const before = (await hereFoot(space))!;

    const names = [...(await nameBoxes(space, ".pl-name")), ...(await nameBoxes(space, ".sp-label"))];
    expect(names.map((n) => n.text)).toContain("You are here");
    expect(overlapping(names)).toEqual([]);

    // the pulse is the page's own animation: it runs while the element is in sight and stops out of sight
    const pulse = () => space.evaluate((el) => el.shadowRoot!.querySelector(".pl-mark[data-kind=here] .pl-pulse")!.getAnimations().map((a) => a.playState).join(","));
    await expect.poll(pulse).toBe("running");
    await untilStill(page);
    const rest = await counts(page);
    await page.waitForTimeout(2000);
    expect((await counts(page)).draws, "the pulse draws nothing").toBe(rest.draws);
    expect((await counts(page)).rafRequests).toBe(rest.rafRequests);

    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.id = "spacer";
      spacer.style.height = "6000px";
      document.body.prepend(spacer);
      window.scrollTo(0, 0);
    });
    await expect.poll(pulse).toBe("paused");
    await page.evaluate(() => document.querySelector("#spacer")!.remove());
    await expect.poll(pulse).toBe("running");

    // the clock runs (an hour a second) and the camera stays in the stars: Tokyo turns away with the Earth
    await space.evaluate((el) => el.setAttribute("speed", "3600"));
    await expect.poll(async () => ((await hereFoot(space))?.x ?? Infinity) - before.x).toBeGreaterThan(20);
    await space.evaluate((el) => el.setAttribute("speed", "0"));
  });
});

test("the demo asks for the reader's place only when they press for it, rounds it, and keeps it out of the address", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 43.65348, longitude: -79.38321 });
  await page.addInitScript(() => {
    const geo = navigator.geolocation;
    const real = geo.getCurrentPosition.bind(geo);
    Reflect.set(globalThis, "askedForPlace", 0);
    geo.getCurrentPosition = (...args: Parameters<Geolocation["getCurrentPosition"]>) => {
      Reflect.set(globalThis, "askedForPlace", (Reflect.get(globalThis, "askedForPlace") as number) + 1);
      real(...args);
    };
  });
  await page.goto(`/chikyu-earth/?look=realistic&time=${NOON}&center=10,20`);
  const earth = page.locator(EARTH);
  await page.locator(`${EARTH}[data-state=live]`).waitFor({ timeout: 60_000 });
  const asked = (): Promise<number> => page.evaluate(() => Reflect.get(globalThis, "askedForPlace") as number);
  const before = await asked();
  const button = page.getByRole("button", { name: "Show where I am" });
  await expect(page.locator("#here-note")).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect(await asked()).toBe(before + 1);
  const places = (await earth.evaluate((el) => Reflect.get(el, "places"))) as { lon: number; lat: number; kind: string; label: string }[];
  expect(places).toHaveLength(1);
  expect(places[0]!.kind).toBe("here");
  expect(places[0]!.label).toBe("You are here");
  expect(places[0]!.lon).not.toBe(-79.38321);
  expect(Math.abs(places[0]!.lon + 79.38321)).toBeLessThan(0.15);
  expect(Math.abs(places[0]!.lat - 43.65348)).toBeLessThan(0.1);
  await expect.poll(async () => (await placesOf(earth)).shown).toBe(1);
  expect(page.url()).not.toContain("43.6");
  expect(page.url()).not.toContain("79.3");

  await page.getByRole("button", { name: "Pin", exact: true }).click();
  expect(await earth.getAttribute("places-look")).toBe("pin");
  expect(page.url()).toContain("place-look=pin");

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await placesOf(earth)).shown).toBe(0);
});

test("the demo's favourites come from the address, are drawn quieter than here, and a press keeps the choice in the address", async ({ page }) => {
  await page.goto(`/chikyu-earth/?look=space&speed=0&time=2026-11-02T03:00Z&center=139.69,35.69&fav=Tokyo,Cairo,Nowhere`);
  const space = page.locator(SPACE);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  const listed = (): Promise<{ id: string; kind: string; label: string }[]> => space.evaluate((el) => Reflect.get(el, "places"));
  await expect.poll(async () => (await listed()).map((p) => p.id)).toEqual(["city:Tokyo", "city:Cairo"]);
  expect((await listed()).every((p) => p.kind === "favourite")).toBe(true);
  await expect(page.getByRole("button", { name: "Tokyo", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await placesOf(space)).shown).toBeGreaterThanOrEqual(1);
  expect(await space.evaluate((el) => el.shadowRoot!.querySelector(".pl-mark[data-kind=here]"))).toBeNull();

  await page.getByRole("group", { name: "Favourites" }).getByRole("button", { name: "London", exact: true }).click();
  await expect.poll(() => decodeURIComponent(page.url())).toContain("fav=Tokyo,London,Cairo");
  await page.getByRole("group", { name: "Favourites" }).getByRole("button", { name: "Tokyo", exact: true }).click();
  await expect.poll(async () => (await listed()).map((p) => p.id)).toEqual(["city:London", "city:Cairo"]);
});
