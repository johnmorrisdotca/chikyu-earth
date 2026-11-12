import { expect, test } from "@playwright/test";

const EMBED = "/chikyu-earth/embed.html";

test("the embed page draws the globe the address asks for, and nothing else", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname));
  await page.goto(`${EMBED}?look=thick&center=10,30&graticule=1`);
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  const element = page.locator("chikyu-earth");
  await expect(element).toHaveAttribute("look", "thick");
  await expect(element).toHaveAttribute("center", "10,30");
  await expect(element).toHaveAttribute("graticule", "");
  expect(await page.locator("chikyu-earth path").count()).toBeGreaterThan(50);
  expect(asked.filter((path) => /textures|three/.test(path))).toEqual([]);
  expect(asked.every((path) => path.startsWith("/chikyu-earth/"))).toBe(true);
});

test("by default it draws no controls, asks for no location and stays still until moved", async ({ page }) => {
  let asked = false;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: () => ((globalThis as { __asked?: boolean }).__asked = true) }, configurable: true });
  });
  await page.goto(EMBED);
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  asked = await page.evaluate(() => Boolean((globalThis as { __asked?: boolean }).__asked));
  expect(asked).toBe(false);
  expect(await page.locator("button, input, select").count()).toBe(0);
  const before = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
  await page.waitForTimeout(1500);
  expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).toBe(before);
});

test("center=me: the embedding page asks the browser once and the globe opens there", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (position: { coords: { longitude: number; latitude: number } }) => void) => {
          Reflect.set(globalThis, "__asked", ((Reflect.get(globalThis, "__asked") as number | undefined) ?? 0) + 1);
          ok({ coords: { longitude: 139.69, latitude: 35.69 } });
        },
      },
    });
  });
  await page.goto(`${EMBED}?center=me`);
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  await expect(page.locator("chikyu-earth")).toHaveAttribute("center", "139.69,35.69");
  expect(await page.evaluate(() => Reflect.get(globalThis, "__asked"))).toBe(1);
});

// The 3D looks hide the line globe, so the place `me` resolves to must reach the element that is shown (the line globe stays under it, for the day WebGL is not there).
for (const [look, tag] of [["realistic", "chikyu-earth-realistic"], ["space", "chikyu-space"]] as const) {
  test(`center=me on look=${look}: one ask, and the shown element opens there`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (ok: (position: { coords: { longitude: number; latitude: number } }) => void) => {
            Reflect.set(globalThis, "__asked", ((Reflect.get(globalThis, "__asked") as number | undefined) ?? 0) + 1);
            ok({ coords: { longitude: 139.69, latitude: 35.69 } });
          },
        },
      });
    });
    await page.goto(`${EMBED}?look=${look}&center=me`);
    await page.locator("body[data-ready=true]").waitFor();
    // where WebGL is drawn the 3D element stays and is shown; where it is not it gives way to the line globe: the one that is shown has the place
    await expect.poll(() => page.locator(`${tag}[data-state=live], ${tag}[data-state=unavailable], chikyu-earth:not([hidden])`).count()).toBeGreaterThan(0);
    const shown = await page.evaluate((name) => {
      const element = document.querySelector(name) ?? document.querySelector("chikyu-earth");
      return { name: element?.localName, center: element?.getAttribute("center"), hidden: (element as HTMLElement | null)?.hidden };
    }, tag);
    expect(shown.hidden, "the element that is shown").toBe(false);
    expect(shown.center, `${shown.name} is centred on the answer`).toBe("139.69,35.69");
    expect(await page.evaluate(() => Reflect.get(globalThis, "__asked")), "asked once").toBe(1);
  });
}

test.describe("turning", () => {
  test.use({ reducedMotion: "no-preference" });

  test("turn=auto turns it by itself, and without it only by hand", async ({ page }) => {
    await page.goto(`${EMBED}?turn=auto&center=0,0`);
    const holder = page.locator("chikyu-earth");
    await expect(holder.locator("svg")).toBeVisible();
    const before = await holder.evaluate((el) => el.shadowRoot?.innerHTML ?? "");
    await expect.poll(() => holder.evaluate((el) => el.shadowRoot?.innerHTML ?? ""), { timeout: 20_000 }).not.toBe(before);

    await page.goto(`${EMBED}?center=0,0`);
    await expect(page.locator("chikyu-earth svg")).toBeVisible();
    const still = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
    await page.waitForTimeout(1500);
    expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).toBe(still);
    const box = (await page.locator("#frame").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).not.toBe(still);
  });

  test("it stops turning while the tab is hidden", async ({ page }) => {
    await page.goto(`${EMBED}?turn=auto&center=0,0`);
    await expect(page.locator("chikyu-earth svg")).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(300);
    const held = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
    await page.waitForTimeout(2200);
    expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).toBe(held);
  });
});

test("the demo page shows the embed in a frame that loads", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  const frame = page.frameLocator("iframe.embed-frame");
  await page.locator("iframe.embed-frame").scrollIntoViewIfNeeded();
  await expect(frame.locator("chikyu-earth svg")).toBeVisible();
});
