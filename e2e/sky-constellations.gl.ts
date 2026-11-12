// Which constellation a reader is on or has picked, and the optional names of the constellations, over the space view's sky: `chikyu-constellation-hover` and `chikyu-constellation-pick` with their `detail`, the lit figure's name at the middle of
// the part of it in view and clear of the Earth, the property `constellation`, the keyboard, and the layer `constellation-names` (off unless asked for; in the page's language; no name over the Earth, a star name or another). Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";
import { onEarth, type Camera } from "./sky-geometry.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
interface Sky {
  figures: number;
  picked: string | null;
  pick: string | null;
  hover: string | null;
  constellations: number;
  renders: number;
}
interface Seen {
  type: string;
  detail: { abbreviation: string; name: string; english: string; japanese: string; culture: string } | null;
}
const sky = (page: Page): Promise<Sky> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { sky: Sky }).sky);
const events = (page: Page): Promise<Seen[]> => page.evaluate(() => (Reflect.get(window, "__sky") as Seen[]).slice());
const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
async function atRest(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await draws(page);
        await page.evaluate(async () => {
          for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        return (await draws(page)) - before;
      },
      { timeout: 60_000, message: "the view is at rest" },
    )
    .toBe(0);
}

/** Opens the space view with the lines on, the Earth made small and the view turned until at least `least` figures are in it. */
async function open(page: Page, query: string, least = 4): Promise<void> {
  await routeElements(page);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator(SPACE).evaluate((el) => {
    el.setAttribute("earth-size", "0.3");
    Reflect.set(window, "__sky", []);
    for (const type of ["chikyu-constellation-pick", "chikyu-constellation-hover"]) el.addEventListener(type, (event) => (Reflect.get(window, "__sky") as unknown[]).push({ type, detail: (event as CustomEvent).detail }));
  });
  for (const lon of [-100, -40, 20, 80, 140, 200]) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("center", `${at},20`), lon);
    try {
      await expect.poll(async () => (await sky(page)).figures, { timeout: 8000 }).toBeGreaterThanOrEqual(least);
      break;
    } catch {
      // the next direction
    }
  }
  await atRest(page);
  await page.locator(SPACE).scrollIntoViewIfNeeded();
}
/** A point on the canvas that is drawn on (a line of a figure), in CSS pixels from the element's top left. */
const aLine = (page: Page): Promise<{ x: number; y: number } | null> =>
  page.locator(SPACE).evaluate((el) => {
    const canvas = el.shadowRoot!.getElementById("sk-canvas") as HTMLCanvasElement;
    const rect = el.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y += 3) for (let x = 0; x < canvas.width; x += 3) if (data[(y * canvas.width + x) * 4 + 3]! > 6) return { x: x / sx, y: y / sy };
    return null;
  });
/** The lit figure's name and where it is (from the element's top left), and the camera and size to say whether it is on the Earth. */
const lit = (page: Page): Promise<{ text: string; hidden: boolean; l: number; t: number; r: number; b: number; width: number; height: number; camera: Camera }> =>
  page.locator(SPACE).evaluate((el) => {
    const own = el.getBoundingClientRect();
    const span = el.shadowRoot!.querySelector<HTMLElement>("#sk-names .sk-figure")!;
    const box = span.getBoundingClientRect();
    return { text: span.textContent ?? "", hidden: span.hidden, l: box.left - own.left, t: box.top - own.top, r: box.right - own.left, b: box.bottom - own.top, width: own.width, height: own.height, camera: (Reflect.get(el, "stats") as { camera: Camera }).camera };
  });

test("hovering a figure lights it and shows its name, with an event; leaving lets both go", async ({ page }) => {
  await open(page, "&constellation-lines=0.3");
  const at = (await aLine(page))!;
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await expect.poll(async () => (await sky(page)).hover, { message: "a figure is hovered" }).not.toBeNull();
  const hovered = (await sky(page)).hover!;
  expect(await page.locator(SPACE).evaluate((el) => el.shadowRoot!.getElementById("sk-live")?.textContent ?? ""), "a hover is not announced").toBe("");
  const seen = (await events(page)).filter((e) => e.type === "chikyu-constellation-hover");
  expect(seen.at(-1)!.detail, "the event says which").toMatchObject({ abbreviation: hovered, culture: "iau" });
  expect(seen.at(-1)!.detail!.name.length, "with its name").toBeGreaterThan(2);
  await expect.poll(async () => !(await lit(page)).hidden, { message: "its name is shown" }).toBe(true);
  const name = await lit(page);
  expect(name.text.length).toBeGreaterThan(2);
  expect(name.l >= 0 && name.t >= 0 && name.r <= name.width && name.b <= name.height, "the name is inside the picture").toBe(true);
  for (const [x, y] of [[name.l, name.t], [name.r, name.t], [name.l, name.b], [name.r, name.b], [(name.l + name.r) / 2, (name.t + name.b) / 2]] as const) expect(onEarth(name.camera, name.width, name.height, x, y), "and not on the Earth").toBe(false);
  // no hover from a mouse that is not over a figure: it leaves the element
  await page.mouse.move(box.x - 10, box.y - 10);
  await expect.poll(async () => (await sky(page)).hover).toBeNull();
  expect((await events(page)).filter((e) => e.type === "chikyu-constellation-hover").at(-1)!.detail, "the event says it let go").toBeNull();
  await expect.poll(async () => (await lit(page)).hidden, { message: "and the name goes" }).toBe(true);
});

test("a click picks a figure and the name stays; a click on the Earth, Escape or the property lets it go; the property picks without an event", async ({ page }) => {
  await open(page, "&constellation-lines=0.3");
  const at = (await aLine(page))!;
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await expect.poll(async () => (await sky(page)).pick, { message: "a figure is picked" }).not.toBeNull();
  const picked = (await sky(page)).pick!;
  const pick = (await events(page)).filter((e) => e.type === "chikyu-constellation-pick");
  expect(pick).toHaveLength(1);
  expect(pick[0]!.detail).toMatchObject({ abbreviation: picked, culture: "iau" });
  expect(pick[0]!.detail!.japanese.endsWith("座"), "with its Japanese name").toBe(true);
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "constellation")), "the property says it").toBe(picked);
  // a pick is read out, politely, with the figure's name; a hover was not
  const announced = await page.locator(SPACE).evaluate((el) => {
    const live = el.shadowRoot!.getElementById("sk-live")!;
    return { text: live.textContent ?? "", role: live.getAttribute("role"), polite: live.getAttribute("aria-live") };
  });
  expect(announced.role).toBe("status");
  expect(announced.polite).toBe("polite");
  expect(announced.text, "the pick is announced with the name").toContain(pick[0]!.detail!.name);
  // the pointer leaves: the lines stay lit and the name stays
  await page.mouse.move(box.x - 10, box.y - 10);
  await expect.poll(async () => (await sky(page)).hover).toBeNull();
  expect((await lit(page)).hidden, "the picked figure's name stays").toBe(false);
  expect((await sky(page)).picked).toBe(picked);
  // a click on the Earth (nothing of the sky is there) lets it go
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await sky(page)).pick, { message: "the pick is let go" }).toBeNull();
  expect((await events(page)).filter((e) => e.type === "chikyu-constellation-pick").at(-1)!.detail).toBeNull();
  // the page picks one itself: no event
  const before = (await events(page)).length;
  await page.locator(SPACE).evaluate((el, abbreviation) => Reflect.set(el, "constellation", abbreviation), picked);
  await expect.poll(async () => (await sky(page)).pick).toBe(picked);
  expect((await events(page)).length, "no event for the page's own pick").toBe(before);
  // Escape, with the element in focus, lets go and says so
  await page.locator(SPACE).evaluate((el) => {
    el.setAttribute("tabindex", "0");
    (el as HTMLElement).focus();
  });
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await sky(page)).pick).toBeNull();
  expect((await events(page)).at(-1)).toMatchObject({ type: "chikyu-constellation-pick", detail: null });
  // the key C picks the first figure from the left, and again the next
  await page.keyboard.press("c");
  await expect.poll(async () => (await sky(page)).pick).not.toBeNull();
  const first = (await sky(page)).pick;
  await page.keyboard.press("c");
  await expect.poll(async () => (await sky(page)).pick).not.toBe(first);
});

test("the constellations' names: off unless asked for, in the page's language, clear of the Earth, the star names and each other, and nothing is drawn at rest", async ({ page }) => {
  await open(page, "&constellation-lines=0.2&star-names=12&lang=ja", 5);
  expect((await sky(page)).constellations, "off by default").toBe(0);
  await page.locator(SPACE).evaluate((el) => el.setAttribute("constellation-names", ""));
  await expect.poll(async () => (await sky(page)).constellations, { timeout: 15_000, message: "the names are written" }).toBeGreaterThan(0);
  await atRest(page);
  const seen = await page.locator(SPACE).evaluate((el) => {
    const own = el.getBoundingClientRect();
    const read = (selector: string): { text: string; l: number; t: number; r: number; b: number }[] =>
      [...el.shadowRoot!.querySelectorAll<HTMLElement>(selector)]
        .filter((b) => !b.hidden)
        .map((b) => {
          const box = b.getBoundingClientRect();
          return { text: b.textContent ?? "", l: box.left - own.left, t: box.top - own.top, r: box.right - own.left, b: box.bottom - own.top };
        });
    return { width: own.width, height: own.height, camera: (Reflect.get(el, "stats") as { camera: Camera }).camera, figures: read("#sk-names .sk-constellation"), stars: read("#sk-names .sk-name, #sk-names .sk-designation") };
  });
  expect(seen.figures.length).toBeGreaterThan(0);
  expect(seen.figures.every((f) => f.text.endsWith("座")), "in Japanese on a Japanese page").toBe(true);
  for (const f of seen.figures) {
    expect(f.l >= 0 && f.t >= 0 && f.r <= seen.width && f.b <= seen.height, `${f.text} is inside the picture`).toBe(true);
    for (const [x, y] of [[f.l, f.t], [f.r, f.t], [f.l, f.b], [f.r, f.b], [(f.l + f.r) / 2, (f.t + f.b) / 2]] as const) expect(onEarth(seen.camera, seen.width, seen.height, x, y), `${f.text} is not on the Earth`).toBe(false);
  }
  const all = [...seen.figures, ...seen.stars];
  for (let i = 0; i < seen.figures.length; i += 1) {
    for (let j = 0; j < all.length; j += 1) {
      const a = seen.figures[i]!;
      const b = all[j]!;
      if (a === b) continue;
      expect(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `${a.text} does not overlap ${b.text}`).toBe(true);
    }
  }
  const renders = (await sky(page)).renders;
  const drawn = await draws(page);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(await draws(page), "the picture is still").toBe(drawn);
  expect((await sky(page)).renders, "and the layer is not drawn again").toBe(renders);
  await page.locator(SPACE).evaluate((el) => el.removeAttribute("constellation-names"));
  await expect.poll(async () => (await sky(page)).constellations, { timeout: 15_000 }).toBe(0);
});
