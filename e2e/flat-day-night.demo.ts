// Day and night on the flat map are plain at a glance: the night side is clearly darker than the same ground in the day, the day side a little lighter, and a line of sunrise and sunset is drawn where the Sun is on the horizon (90 degrees
// from the point under it), in the drawn map and over the photo. The pixels are read from the map's canvas at places worked out from the point under the Sun, which the Sun's own mark names. The moment is held (AT).
import { expect, test, type Page } from "@playwright/test";

const AT = "2026-11-04T00:00Z";
const flat = (page: Page) => page.locator("chikyu-flat");
type Flat = HTMLElement & { stats: { mapDraws: number }; lookState: string };

async function open(page: Page): Promise<{ lon: number; lat: number }> {
  await page.goto("/chikyu-earth/flat.html?place=none");
  await page.locator("body[data-ready=true]").waitFor({ timeout: 30_000 });
  await flat(page).evaluate((el, at) => {
    el.setAttribute("speed", "0");
    el.setAttribute("time", at);
    // a middle that shows the Sun's side, the night's middle and the line, even on a phone
    el.setAttribute("center", "100");
    el.setAttribute("texture-base", "textures/");
  }, AT);
  await flat(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
  const label = flat(page).locator('button.mark[data-mark="sun"]');
  await expect(label).toHaveAttribute("aria-label", /Sun is overhead/);
  const text = (await label.getAttribute("aria-label"))!;
  const m = /(\d+)°([NS]) (\d+)°([EW])?/.exec(text)!;
  return { lat: Number(m[1]) * (m[2] === "S" ? -1 : 1), lon: Number(m[3]) * (m[4] === "W" ? -1 : 1) };
}

type Pixel = { luma: number; amber: boolean };

/** What the map's canvas shows round places given by longitude and latitude: the mean brightness of a small square, and whether a pixel of the line's amber is in it. */
async function look(page: Page, spots: { lon: number; lat: number }[]): Promise<Pixel[]> {
  return flat(page).evaluate((el, list) => {
    const stage = el.shadowRoot!.querySelector(".stage") as HTMLElement;
    const canvas = el.shadowRoot!.querySelector(".map") as HTMLCanvasElement;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const k = Math.max(w / 360, h / 180);
    const scale = canvas.width / w;
    const wrap = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    return list.map((spot) => {
      const x = Math.round((w / 2 + wrap(spot.lon - 100) * k) * scale);
      const y = Math.round((h / 2 - spot.lat * k) * scale);
      const half = Math.round(3 * scale);
      const data = context.getImageData(Math.max(0, x - half), Math.max(0, y - half), half * 2 + 1, half * 2 + 1).data;
      let sum = 0;
      let amber = false;
      for (let i = 0; i < data.length; i += 4) {
        sum += data[i]! + data[i + 1]! + data[i + 2]!;
        if (data[i]! > 190 && data[i]! - data[i + 2]! > 50 && data[i + 1]! > 120) amber = true;
      }
      return { luma: sum / (data.length / 4) / 3, amber };
    });
  }, spots);
}

const wait = async (page: Page, ms = 700): Promise<void> => {
  await page.waitForTimeout(ms);
};

for (const photo of [false, true]) {
  test(`${photo ? "over the photo" : "on the drawn map"} the night side is clearly darker, the day side not, and the sunrise and sunset line is drawn`, async ({ page }) => {
    const sun = await open(page);
    const day = { lon: sun.lon, lat: sun.lat + 30 };
    const night = { lon: sun.lon + 180, lat: -sun.lat };
    const line = { lon: sun.lon, lat: sun.lat + 90 };
    if (photo) {
      await flat(page).evaluate((el) => el.setAttribute("look", "photo"));
      await expect.poll(() => flat(page).evaluate((el) => (el as Flat).lookState), { timeout: 60_000 }).toBe("photo");
    }
    await flat(page).evaluate((el) => {
      el.setAttribute("shade", "off");
      el.setAttribute("borders", "off");
    });
    await wait(page, 900);
    const plain = await look(page, [day, night, line]);
    await flat(page).evaluate((el) => el.setAttribute("shade", "on"));
    await wait(page, 900);
    const shown = await look(page, [day, night, line]);
    // the night's middle is much darker than the same ground without the night
    expect(shown[1]!.luma, `night ${JSON.stringify(shown[1])} against plain ${JSON.stringify(plain[1])}`).toBeLessThan(plain[1]!.luma * (photo ? 0.5 : 0.75));
    // the day is not darkened (the drawn map's day is a little lighter)
    expect(shown[0]!.luma, "day").toBeGreaterThanOrEqual(plain[0]!.luma * (photo ? 0.97 : 1.02));
    // the line is there with the night and not without it
    expect(plain[2]!.amber, "no line when the night is off").toBe(false);
    expect(shown[2]!.amber, `the line of sunrise and sunset at ${line.lon}, ${line.lat}`).toBe(true);
  });
}
