// A press, a tap or Enter on a named star or a constellation figure sends chikyu-sky-pick, and nothing is drawn at rest. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
interface Pick {
  kind: string;
  hr?: number;
  name?: string;
  designation?: string;
  x?: number;
  y?: number;
  pointerType?: string;
  abbreviation?: string;
}
const picks = (page: Page): Promise<Pick[]> => page.evaluate(() => (Reflect.get(window, "__picks") as Pick[]).slice());
const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
const renders = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { sky: { renders: number } }).sky.renders);

async function open(page: Page): Promise<void> {
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40&star-names=40&constellation-lines=0.3");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator(SPACE).evaluate((el) => {
    el.setAttribute("earth-size", "0.3");
    Reflect.set(window, "__picks", []);
    el.addEventListener("chikyu-sky-pick", (event) => (Reflect.get(window, "__picks") as unknown[]).push((event as CustomEvent).detail));
  });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { sky: { loaded: boolean } }).sky.loaded), { timeout: 30_000 }).toBe(true);
  for (const lon of [-100, -40, 20, 80, 140, 200]) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("center", `${at},10`), lon);
    try {
      await expect.poll(async () => page.locator(SPACE).evaluate((el) => {
        const root = el.shadowRoot!;
        const names = [...root.querySelectorAll<HTMLElement>(".sk-name")].filter((b) => !b.hidden).length;
        const hits = [...root.querySelectorAll<HTMLElement>(".sk-hit")].filter((b) => !b.hidden).length;
        return names >= 3 && hits >= 2;
      }), { timeout: 8_000 }).toBe(true);
      return;
    } catch {
      // the next direction
    }
  }
  throw new Error("no direction of the sky showed named stars and figures");
}

const nameBox = (page: Page, index: number): Promise<{ text: string; label: string; x: number; y: number; role: string | null }> =>
  page.locator(SPACE).evaluate((el, at) => {
    const names = [...el.shadowRoot!.querySelectorAll<HTMLElement>("button.sk-name")].filter((b) => !b.hidden);
    const name = names[at]!;
    const own = el.getBoundingClientRect();
    const box = name.getBoundingClientRect();
    return { text: name.textContent ?? "", label: name.getAttribute("aria-label") ?? "", x: box.left + box.width / 2 - own.left, y: box.top + box.height / 2 - own.top, role: name.getAttribute("role") };
  }, index);

test("a press, a tap and Enter pick a named star or a figure, and rest draws nothing", async ({ page }) => {
  await open(page);
  await page.locator(SPACE).scrollIntoViewIfNeeded();
  const host = (await page.locator(SPACE).boundingBox())!;
  const first = await nameBox(page, 0);
  expect(first.label, "the star's button is named").toBe(first.text);
  expect(first.role, "a button needs no extra role").toBeNull();
  await page.mouse.click(host.x + first.x, host.y + first.y);
  await expect.poll(async () => (await picks(page)).length).toBeGreaterThan(0);
  const pressed = (await picks(page)).at(-1)!;
  expect(pressed.kind).toBe("star");
  expect(pressed.name).toBe(first.text);
  expect(pressed.pointerType).toBe("mouse");
  expect(typeof pressed.hr).toBe("number");
  expect(pressed.hr!).toBeGreaterThan(0);
  expect(typeof pressed.designation).toBe("string");
  expect(pressed.x!).toBeGreaterThanOrEqual(0);
  expect(pressed.y!).toBeGreaterThanOrEqual(0);
  expect(pressed.x!).toBeLessThanOrEqual(host.width);
  expect(pressed.y!).toBeLessThanOrEqual(host.height);
  const announced = await page.locator(SPACE).evaluate((el) => el.shadowRoot!.getElementById("sk-live")?.textContent ?? "");
  expect(announced).toContain(first.text);

  const second = await nameBox(page, 1);
  await page.locator(SPACE).evaluate((el, point) => {
    const own = el.getBoundingClientRect();
    const common = { bubbles: true, composed: true, clientX: own.left + point.x, clientY: own.top + point.y, pointerId: 7, pointerType: "touch", button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...common, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...common, buttons: 0 }));
  }, { x: second.x, y: second.y });
  await expect.poll(async () => (await picks(page)).at(-1)?.pointerType).toBe("touch");
  expect((await picks(page)).at(-1)).toMatchObject({ kind: "star", name: second.text });

  await page.locator(SPACE).evaluate((el) => (el.shadowRoot!.querySelector("button.sk-name:not([hidden])") as HTMLElement).focus());
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await picks(page)).at(-1)?.pointerType).toBe("keyboard");
  expect((await picks(page)).at(-1)?.kind).toBe("star");

  const line = await page.locator(SPACE).evaluate((el) => {
    const canvas = el.shadowRoot!.getElementById("sk-canvas") as HTMLCanvasElement;
    const rect = el.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const stars = (Reflect.get(el, "stats") as { sky: { stars: { x: number; y: number }[] } }).sky.stars;
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        if (data[(y * canvas.width + x) * 4 + 3]! <= 6) continue;
        const cx = x / sx;
        const cy = y / sy;
        if (stars.some((star) => (star.x - cx) ** 2 + (star.y - cy) ** 2 < 28 * 28)) continue;
        return { x: cx, y: cy };
      }
    }
    return null;
  });
  expect(line, "a figure line clear of the named stars").not.toBeNull();
  const beforeFigure = (await picks(page)).length;
  await page.mouse.click(host.x + line!.x, host.y + line!.y);
  await expect.poll(async () => (await picks(page)).length).toBeGreaterThan(beforeFigure);
  const figure = (await picks(page)).at(-1)!;
  expect(figure.kind).toBe("constellation");
  expect(figure.abbreviation!.length).toBeGreaterThan(0);
  expect(figure.pointerType, "a click is the mouse").toBe("mouse");
  // the same point with a finger
  await page.locator(SPACE).evaluate((el, point) => {
    const own = el.getBoundingClientRect();
    const common = { bubbles: true, composed: true, clientX: own.left + point.x, clientY: own.top + point.y, pointerId: 9, pointerType: "touch", button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...common, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...common, buttons: 0 }));
  }, line!);
  await expect.poll(async () => (await picks(page)).length).toBeGreaterThan(beforeFigure + 1);
  expect((await picks(page)).at(-1), "a tap is touch").toMatchObject({ kind: "constellation", pointerType: "touch" });

  await page.locator(SPACE).evaluate((el) => (el.shadowRoot!.querySelector("button.sk-hit:not([hidden])") as HTMLElement).focus());
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await picks(page)).length).toBeGreaterThan(beforeFigure + 1);
  const keyed = (await picks(page)).at(-1)!;
  expect(keyed.kind).toBe("constellation");
  expect(keyed.abbreviation!.length).toBeGreaterThan(0);
  expect(keyed.pointerType, "Enter is the keyboard").toBe("keyboard");
  const hitLabel = await page.locator(SPACE).evaluate((el) => {
    const hit = el.shadowRoot!.querySelector<HTMLElement>("button.sk-hit:not([hidden])")!;
    return { label: hit.getAttribute("aria-label") ?? "", live: el.shadowRoot!.getElementById("sk-live")?.textContent ?? "" };
  });
  expect(hitLabel.label.length).toBeGreaterThan(0);
  expect(hitLabel.live.length).toBeGreaterThan(0);

  // the keys C and Shift+C pick the next and the previous figure, and the page hears them the same way: chikyu-sky-pick with the figure's abbreviation
  await page.locator(SPACE).evaluate((el) => {
    el.setAttribute("tabindex", "0");
    (el as HTMLElement).focus();
  });
  const beforeKeys = (await picks(page)).length;
  await page.keyboard.press("c");
  await expect.poll(async () => (await picks(page)).length, { message: "C sends chikyu-sky-pick" }).toBe(beforeKeys + 1);
  const forward = (await picks(page)).at(-1)!;
  expect(forward.kind).toBe("constellation");
  expect(Object.keys(forward).sort()).toEqual(["abbreviation", "kind", "pointerType"]);
  expect(forward.pointerType, "a key is the keyboard").toBe("keyboard");
  await page.keyboard.press("c");
  await expect.poll(async () => (await picks(page)).length).toBe(beforeKeys + 2);
  expect((await picks(page)).at(-1)!.abbreviation, "C again is the next figure").not.toBe(forward.abbreviation);
  await page.keyboard.press("Shift+C");
  await expect.poll(async () => (await picks(page)).length).toBe(beforeKeys + 3);
  expect((await picks(page)).at(-1)!.abbreviation, "Shift+C goes back").toBe(forward.abbreviation);

  const drawn = await draws(page);
  const laid = await renders(page);
  await page.waitForTimeout(1000);
  expect(await draws(page), "at rest the picture is not drawn").toBe(drawn);
  expect(await renders(page), "at rest the sky is not laid out again").toBe(laid);
});
