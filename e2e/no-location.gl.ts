// The reader's location is asked for only after they ask for it: none of the line globe, the realistic Earth and the Earth from space asks the browser when it opens, with or without `center`.
import { expect, test } from "@playwright/test";

test("no element asks for the reader's location when it opens; the demo asks only on a press", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "askedForPlace", 0);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (position: { coords: { longitude: number; latitude: number } }) => void) => {
          Reflect.set(globalThis, "askedForPlace", (Reflect.get(globalThis, "askedForPlace") as number) + 1);
          ok({ coords: { longitude: 139.69, latitude: 35.69 } });
        },
        watchPosition: () => 0,
        clearWatch: () => undefined,
      },
    });
  });
  const asked = (): Promise<number> => page.evaluate(() => Reflect.get(globalThis, "askedForPlace") as number);

  await page.goto("/chikyu-earth/?look=realistic");
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
  // a line globe and a realistic Earth of the page's own, with no `center`: the case that used to ask
  await page.evaluate(() => {
    for (const name of ["chikyu-earth", "chikyu-earth-realistic"]) {
      const element = document.createElement(name);
      element.className = "bare";
      element.style.width = "200px";
      document.body.append(element);
    }
  });
  await expect(page.locator("chikyu-earth.bare svg")).toBeVisible();
  await expect.poll(() => page.locator("chikyu-earth-realistic.bare").evaluate((el) => el.dataset["state"] ?? "")).not.toBe("");
  expect(await page.locator("chikyu-earth-realistic.bare").evaluate((el) => (Reflect.get(el, "centre") as { lon: number; lat: number }).lon)).toBe(0);
  expect(await asked(), "nothing asked on load").toBe(0);

  await page.getByRole("button", { name: "Centre on me" }).click();
  await expect.poll(asked).toBe(1);

  // the Earth from space, on the page that loads it: its own, with no `center`, asks nothing either
  await page.goto("/chikyu-earth/?look=space");
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  await page.evaluate(() => {
    const element = document.createElement("chikyu-space");
    element.className = "bare";
    element.style.width = "200px";
    document.body.append(element);
  });
  await expect.poll(() => page.locator("chikyu-space.bare").evaluate((el) => el.dataset["state"] ?? "")).not.toBe("");
  expect(await page.locator("chikyu-space.bare").evaluate((el) => (Reflect.get(el, "centre") as { lon: number; lat: number }).lon)).toBe(0);
  expect(await asked(), "the space view asked nothing on load").toBe(0);
});
