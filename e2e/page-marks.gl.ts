// A list of marks the page hands in (the site's fireballs: an id, a place, a size and a few names) on the realistic Earth and in the space view, in a real browser drawn in software: none until the page asks and nothing then,
// the marks where their places project, each ring the size asked for, the names kept for the marks that have one, a press that tells the page the id, a mark behind the Earth neither drawn nor pressed, a page box
// the names keep out of, and nothing drawn again at rest.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { project, type Pose } from "../src/markers/project.ts";
import { COUNT_SCRIPT, counts, EARTH, NOON, openEarth, untilStill } from "./gl.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const CENTRE = { lon: 10, lat: 20 };
interface Mark {
  id: string;
  lat: number;
  lon: number;
  size: number;
  label?: string;
  color?: string;
}
/** `n` marks spread over the Earth as a page's own figures would put them: a size of 2 to 10 pixels from a made-up energy, and two with a name, last in the list. */
const fireballs = (n: number): Mark[] => {
  let seed = 1807;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const list: Mark[] = Array.from({ length: n - 2 }, (_, i) => ({
    id: `fb-${i}`,
    lon: random() * 360 - 180,
    lat: (Math.asin(random() * 2 - 1) * 180) / Math.PI,
    size: 2 + (i % 5) * 2,
    ...(i % 7 === 0 ? { color: "#ff6b8a" } : {}),
  }));
  list.push({ id: "named-a", lon: CENTRE.lon, lat: CENTRE.lat, size: 12, label: "Named A" }, { id: "named-b", lon: CENTRE.lon + 25, lat: CENTRE.lat + 12, size: 11, label: "Named B" });
  return list;
};
interface Stats {
  places: number;
  hidden: number;
  shown: number;
  marks: number;
  labels: number;
  renders: number;
  sprites: number;
  groups: number;
}
const statsOf = (target: Locator): Promise<Stats> => target.evaluate((el) => (Reflect.get(el, "stats") as { places: Stats }).places);
const setMarks = (target: Locator, list: unknown[]): Promise<void> => target.evaluate((el, value) => void Reflect.set(el, "places", value), list);
const poseOf = (target: Locator): Promise<Pose & { width: number; height: number }> => target.evaluate((el) => Reflect.get(el, "overlay").pose as Pose & { width: number; height: number });
const visibleMarks = (target: Locator): Promise<number> => target.evaluate((el) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(".pl-mark")].filter((m) => !m.hidden).length);
/** The ring radii of the markers standing in the page, sorted. */
const radii = (target: Locator): Promise<number[]> =>
  target.evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLElement>(".pl-mark")]
      .filter((m) => !m.hidden)
      .map((m) => parseFloat(m.style.getPropertyValue("--r")))
      .sort((a, b) => a - b),
  );
const names = (target: Locator): Promise<string[]> =>
  target.evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLElement>(".pl-name:not(.pl-measure)")]
      .filter((n) => !n.hidden)
      .map((n) => n.textContent ?? "")
      .sort(),
  );
/** Where the foot of the marker with this ring radius is, in the page. */
const footOf = (target: Locator, radius: number): Promise<{ x: number; y: number } | null> =>
  target.evaluate((el, r) => {
    const mark = [...el.shadowRoot!.querySelectorAll<HTMLElement>(".pl-mark")].find((m) => !m.hidden && parseFloat(m.style.getPropertyValue("--r")) === r);
    if (!mark) return null;
    const box = mark.getBoundingClientRect();
    return { x: box.left, y: box.top };
  }, radius);
const record = (target: Locator): Promise<void> =>
  target.evaluate((el) => {
    const told: unknown[] = [];
    Reflect.set(window, "told", told);
    el.addEventListener("chikyu-place-click", (event) => told.push((event as CustomEvent).detail));
  });
const told = (page: Page): Promise<{ id: string }[]> => page.evaluate(() => Reflect.get(window, "told") as { id: string }[]);

/** The place on the far side that lands on the screen exactly where `mark` does: its mirror in the plane of the Earth's disc. */
const mirrored = (mark: { lon: number; lat: number }, pose: Pose): { lon: number; lat: number } => {
  const unit = (lon: number, lat: number): number[] => [Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180), Math.sin((lat * Math.PI) / 180), Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180)];
  const v = unit(mark.lon, mark.lat);
  const c = unit(pose.lon, pose.lat);
  const d = 2 * (v[0]! * c[0]! + v[1]! * c[1]! + v[2]! * c[2]!);
  const w = v.map((x, i) => x - d * c[i]!);
  return { lon: (Math.atan2(w[0]!, w[2]!) * 180) / Math.PI, lat: (Math.asin(w[1]!) * 180) / Math.PI };
};

/** What a quiet page costs: no draw and no frame asked for, and no mark laid out again. */
async function atRest(page: Page, target: Locator): Promise<void> {
  await untilStill(page);
  const rest = await counts(page);
  const renders = (await statsOf(target)).renders;
  await page.waitForTimeout(2000);
  expect((await counts(page)).draws, "no draw at rest").toBe(rest.draws);
  expect((await counts(page)).rafRequests, "no frame asked for at rest").toBe(rest.rafRequests);
  expect((await statsOf(target)).renders, "no mark laid out again at rest").toBe(renders);
}

test.describe("a page's marks on the realistic Earth", () => {
  test.use({ reducedMotion: "reduce" });

  test("none until the page asks; then drawn where they project, each the size asked for, named ones first, a press tells the id, the far side is neither drawn nor pressed", async ({ page }) => {
    test.setTimeout(120_000);
    await openEarth(page, `time=${NOON}&center=${CENTRE.lon},${CENTRE.lat}&hide=Cities,Stadiums`);
    const earth = page.locator(EARTH);
    await record(earth);

    // no list: nothing drawn, nothing laid out
    expect(await earth.getAttribute("places")).toBeNull();
    expect(await statsOf(earth)).toMatchObject({ places: 0, shown: 0, marks: 0, sprites: 0, renders: 0 });
    expect(await visibleMarks(earth)).toBe(0);
    expect(await names(earth)).toEqual([]);

    // 888 marks, none gathered
    await earth.evaluate((el) => void Reflect.set(el, "placeGroups", false));
    const list = fireballs(888);
    await setMarks(earth, list);
    await expect.poll(async () => (await statsOf(earth)).places).toBe(888);
    await untilStill(page);
    const pose = await poseOf(earth);
    const inSight = list.filter((m) => {
      const p = project(m.lon, m.lat, pose);
      return p.z > 0.02 && p.x > -60 && p.y > -60 && p.x < pose.width + 60 && p.y < pose.height + 60;
    });
    expect(inSight.length, "about half the Earth is in sight").toBeGreaterThan(300);
    const stats = await statsOf(earth);
    expect(stats.shown, "every mark in sight is drawn and none behind the Earth").toBe(inSight.length);
    expect(stats.marks).toBe(32);
    expect(stats.sprites + stats.marks, "the rest are rings in the one draw call").toBe(inSight.length);
    expect(stats.groups).toBe(0);

    // the two named marks are among the 32 that stand up with a name although they come last, and each ring is the size asked for
    expect(await names(earth)).toEqual(["Named A", "Named B"]);
    const wanted = [...inSight.filter((m) => m.label), ...inSight.filter((m) => !m.label).slice(0, 30)].map((m) => m.size).sort((a, b) => a - b);
    expect(await radii(earth)).toEqual(wanted);

    // a press on a named mark, and on a ring that is not a marker of its own: the page is told the id, once each; a press on nothing tells nothing
    const box = (await earth.boundingBox())!;
    const standing = new Set(inSight.filter((m) => m.label).map((m) => m.id).concat(inSight.filter((m) => !m.label).slice(0, 30).map((m) => m.id)));
    const placed = inSight.map((m) => ({ m, p: project(m.lon, m.lat, pose) }));
    const alone = placed
      // far enough from the first press that the two are not a double click (which zooms)
      .filter(({ m, p }) => !standing.has(m.id) && p.z > 0.4 && Math.hypot(p.x - pose.cx, p.y - pose.cy) > 90 && placed.every((o) => o.m === m || Math.hypot(o.p.x - p.x, o.p.y - p.y) > 10))
      .sort((a, b) => b.p.z - a.p.z)[0]!;
    await page.mouse.click(box.x + 3, box.y + 3);
    const a = (await footOf(earth, 12))!;
    await page.mouse.click(a.x, a.y);
    await expect.poll(async () => (await told(page)).length).toBe(1);
    await page.mouse.click(box.x + alone.p.x, box.y + alone.p.y);
    await expect.poll(async () => (await told(page)).length).toBe(2);
    expect((await told(page)).map((d) => d.id)).toEqual(["named-a", alone.m.id]);

    // nothing is drawn again at rest
    await atRest(page, earth);

    // a mark behind the Earth: the one in front and the one at the opposite point of the Earth project to the same place on the screen
    const front = { id: "front", lon: 40, lat: 10, size: 8 };
    const behind = { id: "behind", ...mirrored(front, pose), size: 8 };
    await setMarks(earth, [front, behind]);
    await expect.poll(async () => (await statsOf(earth)).places).toBe(2);
    await untilStill(page);
    expect((await statsOf(earth)).shown, "only the one in front is drawn").toBe(1);
    const spot = project(front.lon, front.lat, pose);
    expect(project(behind.lon, behind.lat, pose).z, "the other is on the far side").toBeLessThan(0);
    expect(Math.hypot(project(behind.lon, behind.lat, pose).x - spot.x, project(behind.lon, behind.lat, pose).y - spot.y)).toBeLessThan(1);
    await page.mouse.click(box.x + spot.x, box.y + spot.y);
    await expect.poll(async () => (await told(page)).length).toBe(3);
    expect((await told(page)).at(-1)!.id, "the press finds the one in front").toBe("front");
    await setMarks(earth, [behind]);
    await expect.poll(async () => (await statsOf(earth)).places).toBe(1);
    await untilStill(page);
    expect((await statsOf(earth)).shown, "nothing drawn for the one behind").toBe(0);
    await page.mouse.click(box.x + spot.x, box.y + spot.y);
    await page.waitForTimeout(300);
    expect((await told(page)).length, "nothing pressed behind the Earth").toBe(3);

    // the list taken away: nothing drawn again
    await setMarks(earth, []);
    await expect.poll(async () => (await statsOf(earth)).places).toBe(0);
    await untilStill(page);
    expect(await statsOf(earth)).toMatchObject({ shown: 0, marks: 0, sprites: 0 });
    expect(await visibleMarks(earth)).toBe(0);
    expect(await earth.getAttribute("places")).toBeNull();
  });

  test("the names keep out of the page's boxes (keepOut) and come back when the boxes go; the marks stay", async ({ page }) => {
    await openEarth(page, `time=${NOON}&center=${CENTRE.lon},${CENTRE.lat}&hide=Cities,Stadiums`);
    const earth = page.locator(EARTH);
    await earth.evaluate((el) => void Reflect.set(el, "placeGroups", false));
    await setMarks(earth, fireballs(888));
    await expect.poll(async () => (await names(earth)).length).toBe(2);
    const own = (await earth.boundingBox())!;
    await earth.evaluate((el, area) => void Reflect.set(el, "keepOut", [area]), { x: 0, y: 0, w: own.width, h: own.height });
    await expect.poll(async () => (await names(earth)).length, { message: "no name under a box over the whole element" }).toBe(0);
    expect(await visibleMarks(earth), "the marks stay").toBe(32);
    await earth.evaluate((el) => void Reflect.set(el, "keepOut", []));
    await expect.poll(async () => (await names(earth)).length).toBe(2);
  });
});

test.describe("a page's marks in the space view", () => {
  test.use({ reducedMotion: "reduce" });

  test("none until the page asks; then drawn, the size asked for, the names kept for the marks that have one, a press tells the id, and nothing is drawn again at rest", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(COUNT_SCRIPT);
    await page.goto(`/chikyu-earth/?look=space&speed=0&time=2026-11-02T03:00Z&center=${CENTRE.lon},${CENTRE.lat}`);
    const space = page.locator(SPACE);
    await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    await record(space);
    expect(await statsOf(space)).toMatchObject({ places: 0, shown: 0, marks: 0, sprites: 0 });
    expect(await visibleMarks(space)).toBe(0);

    await space.evaluate((el) => void Reflect.set(el, "placeGroups", false));
    await setMarks(space, fireballs(888));
    await expect.poll(async () => (await statsOf(space)).places).toBe(888);
    await expect.poll(async () => (await statsOf(space)).sprites).toBeGreaterThan(100);
    await untilStill(page);
    const stats = await statsOf(space);
    expect(stats.marks).toBe(32);
    expect(stats.shown).toBe(stats.marks + stats.sprites);
    expect(await names(space), "the two named marks are named though they come last").toEqual(["Named A", "Named B"]);
    expect(await radii(space)).toContain(12);
    expect(await radii(space)).toContain(11);

    const a = (await footOf(space, 12))!;
    await page.mouse.click(a.x, a.y);
    await expect.poll(async () => (await told(page)).length).toBe(1);
    expect((await told(page))[0]!.id).toBe("named-a");

    await atRest(page, space);

    await space.evaluate((el, area) => void Reflect.set(el, "keepOut", [area]), { x: 0, y: 0, w: 4000, h: 4000 });
    await expect.poll(async () => (await names(space)).length, { message: "no name under a box over the whole element" }).toBe(0);
    expect(await visibleMarks(space)).toBe(32);
    await space.evaluate((el) => void Reflect.set(el, "keepOut", []));
    await expect.poll(async () => (await names(space)).length).toBe(2);

    await setMarks(space, []);
    await expect.poll(async () => (await statsOf(space)).shown).toBe(0);
    expect(await visibleMarks(space)).toBe(0);
  });
});
