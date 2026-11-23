// The flat map's photo look (`look="photo"`): NASA's day picture on the map, aligned with its projection, centre and zoom, the night picture's lights across the terminator, loaded only when asked for, nothing drawn at rest.
// The moment is held (AT) so the Sun is where the tests expect it.
import { expect, test, type Page } from "@playwright/test";

const AT = "2026-11-04T00:00Z";
const flat = (page: Page) => page.locator("chikyu-flat");
type Flat = HTMLElement & { stats: { draws: number; mapDraws: number; canvases: { width: number; height: number }[] }; lookState: string; look: string; zoom: number; center: number };

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/chikyu-earth/flat.html${query}`);
  await page.locator("body[data-ready=true]").waitFor({ timeout: 30_000 });
  await flat(page).evaluate((el, at) => {
    el.setAttribute("speed", "0");
    el.setAttribute("time", at);
  }, AT);
  await flat(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).stats.mapDraws)).toBeGreaterThan(0);
}

const photo = async (page: Page, attributes: Record<string, string> = {}): Promise<void> => {
  await flat(page).evaluate((el, set) => {
    for (const [name, value] of Object.entries(set)) el.setAttribute(name, value);
    el.setAttribute("look", "photo");
  }, attributes);
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).lookState)).toBe("photo");
  // the map is drawn again with the picture
  const draws = await flat(page).evaluate((el) => (el as Flat).stats.mapDraws);
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).stats.mapDraws)).toBeGreaterThanOrEqual(draws);
  await page.waitForTimeout(300);
};

/** The colours of the map canvas at places given by longitude and latitude, read from the pixels drawn: the same projection arithmetic as `projectFlat`. */
async function colours(page: Page, spots: { lon: number; lat: number; r?: number }[]): Promise<({ r: number; g: number; b: number; max: number } | null)[]> {
  return flat(page).evaluate((el, list) => {
    const stage = el.shadowRoot!.querySelector(".stage") as HTMLElement;
    const canvas = el.shadowRoot!.querySelector(".map") as HTMLCanvasElement;
    const f = el as Flat;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const k = Math.max(w / 360, h / 180) * f.zoom;
    const scale = canvas.width / w;
    const wrap = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;
    const lat0 = 0;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    return list.map((spot) => {
      const x = (w / 2 + wrap(spot.lon - f.center) * k) * scale;
      const y = (h / 2 - (spot.lat - lat0) * k) * scale;
      // a place the box does not show (a phone shows two thirds of the world) has no pixel to read
      if (x < 8 || y < 8 || x > canvas.width - 8 || y > canvas.height - 8) return null;
      const half = Math.round((spot.r ?? 1) * scale);
      const data = context.getImageData(Math.max(0, Math.round(x) - half), Math.max(0, Math.round(y) - half), half * 2 + 1, half * 2 + 1).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let max = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
        max = Math.max(max, data[i]! + data[i + 1]! + data[i + 2]!);
      }
      return { r: r / n, g: g / n, b: b / n, max: max / 3 };
    });
  }, spots);
}

test("the credit is one small line at the map's edge: the whole line on a wide map, \"Earth: NASA\" on a narrow one with the whole line a tap away", async ({ page }, info) => {
  await open(page);
  await photo(page, { "texture-base": "textures/" });
  const credit = flat(page).locator(".credit");
  const read = () => credit.evaluate((el) => ({ text: (el as HTMLElement).innerText, box: el.getBoundingClientRect().toJSON(), stage: el.parentElement!.getBoundingClientRect().toJSON() }));
  const closed = await read();
  // at the bottom edge, and never over the middle of the map
  expect(closed.box.bottom).toBeGreaterThan(closed.stage.bottom - 12);
  expect(closed.box.height).toBeLessThan(34);
  if (info.project.name.endsWith("phone")) {
    expect(closed.text).toBe("Earth: NASA");
    expect(closed.box.width * closed.box.height, "a small part of the map").toBeLessThan(closed.stage.width * closed.stage.height * 0.06);
    await credit.click();
    await expect(credit).toHaveAttribute("aria-expanded", "true");
    expect(await credit.evaluate((el) => (el as HTMLElement).innerText)).toContain("NASA Earth Observatory");
    await credit.click();
    expect((await read()).text).toBe("Earth: NASA");
  } else {
    expect(closed.text).toContain("NASA Earth Observatory");
    expect(closed.box.height, "one line").toBeLessThan(24);
  }
  // the whole credit is in the key as well
  await flat(page).evaluate((el) => { (el as Flat & { keyOpen: boolean }).keyOpen = true; });
  await expect(flat(page).locator(".legend li").filter({ hasText: "NASA Earth Observatory" })).toHaveCount(1);
});

test("the drawn map is the default: no picture is asked for until the photo look is chosen, and none is held once it is left", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (/textures\/(day|night)-/.test(request.url())) asked.push(request.url());
  });
  await open(page);
  await page.waitForTimeout(500);
  expect(asked, "no picture for the drawn map").toEqual([]);
  expect(await flat(page).evaluate((el) => (el as Flat).look)).toBe("map");
  expect(await flat(page).evaluate((el) => (el as Flat).lookState)).toBe("map");
  await expect(flat(page).locator(".credit")).toBeHidden();
  await photo(page);
  expect(asked.some((url) => /day-\d+\.webp/.test(url)), "the day picture").toBe(true);
  expect(asked.some((url) => /night-\d+\.webp/.test(url)), "the night picture").toBe(true);
  expect(await flat(page).evaluate((el) => (el as Flat).look)).toBe("photo");
  await expect(flat(page).locator(".credit")).toContainText("NASA Earth Observatory");
  await flat(page).evaluate((el) => el.setAttribute("look", "map"));
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).lookState)).toBe("map");
  await expect(flat(page).locator(".credit")).toBeHidden();
});

test("the photo is aligned with the map: the Nile delta, Florida and the Gulf, at the right centre", async ({ page }) => {
  await open(page, "?place=none");
  // no night, so the pixels are the day picture's own
  let checked = 0;
  for (const center of ["0", "30", "-60"]) {
    await photo(page, { shade: "off", borders: "off", center });
    // the Mediterranean off Egypt is sea (blue), the Sahara south of the delta is sand (red above blue), the Gulf of Mexico is sea, central Florida is green land
    const [sea, sand, gulf, florida] = await colours(page, [{ lon: 29, lat: 34.5 }, { lon: 29, lat: 26 }, { lon: -90, lat: 25 }, { lon: -81.3, lat: 27.9, r: 0 }]);
    if (sea && sand) {
      expect(sea.b - sea.r, `sea at centre ${center}`).toBeGreaterThan(15);
      expect(sand.r - sand.b, `sand at centre ${center}`).toBeGreaterThan(25);
      checked += 2;
    }
    if (gulf && florida) {
      expect(gulf.b - gulf.r, "the Gulf of Mexico").toBeGreaterThan(15);
      expect(florida.g - florida.b, "Florida").toBeGreaterThan(0);
      checked += 2;
    }
  }
  expect(checked, "places read").toBeGreaterThanOrEqual(6);
  // zoomed in on the delta (a view's latitude is the map's middle, so two times): the coast is where the map says it is
  await flat(page).evaluate((el) => {
    el.setAttribute("center", "31");
    (el as Flat).zoom = 2;
  });
  await page.waitForTimeout(600);
  const [sea, land] = await colours(page, [{ lon: 31, lat: 33 }, { lon: 31, lat: 28.5 }]);
  expect(sea!.b - sea!.r).toBeGreaterThan(15);
  expect(land!.r - land!.b).toBeGreaterThan(20);
});

test("where the map shows night the photo is dark and the city lights show, blended across the terminator", async ({ page }) => {
  await open(page, "?place=none");
  await photo(page, { shade: "off", borders: "off", center: "0" });
  const spots = [{ lon: 31.2, lat: 30.05, r: 4 }, { lon: 26, lat: 27, r: 4 }, { lon: 2.3, lat: 48.9, r: 4 }, { lon: -30, lat: 20, r: 4 }];
  const day = (await colours(page, spots)) as NonNullable<Awaited<ReturnType<typeof colours>>[number]>[];
  await flat(page).evaluate((el) => el.setAttribute("shade", "on"));
  await page.waitForTimeout(600);
  const night = (await colours(page, spots)) as NonNullable<Awaited<ReturnType<typeof colours>>[number]>[];
  // 00:00 UTC: it is the middle of the night over Greenwich
  for (const i of [1]) expect(night[i]!.b + night[i]!.g + night[i]!.r, `spot ${i} is darker at night (day ${JSON.stringify(day[i])}, night ${JSON.stringify(night[i])})`).toBeLessThan((day[i]!.b + day[i]!.g + day[i]!.r) * 0.5);
  // Cairo and Paris glow against the desert and the open Atlantic
  expect(night[0]!.max, "Cairo's lights").toBeGreaterThan(night[1]!.max + 8);
  expect(night[2]!.max, "Paris's lights").toBeGreaterThan(night[3]!.max + 8);
});

test("the photo stays within the canvas caps, draws nothing at rest and can be left for the drawn map", async ({ page }) => {
  await open(page);
  await photo(page);
  const sizes = await flat(page).evaluate((el) => (el as Flat).stats.canvases);
  for (const canvas of sizes) {
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(4096);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(6_000_000);
  }
  // a lasting, held view: no frame of the map is drawn
  const before = await flat(page).evaluate((el) => (el as Flat).stats.mapDraws);
  await page.waitForTimeout(1200);
  expect(await flat(page).evaluate((el) => (el as Flat).stats.mapDraws)).toBe(before);
  expect(await flat(page).evaluate((el) => el.shadowRoot!.querySelectorAll("canvas").length)).toBe(2);
});

test("the words and the event: the look is told to the page, the credit is in Japanese when the page is", async ({ page }) => {
  await open(page);
  await flat(page).evaluate((el) => {
    (window as unknown as { looks: string[] }).looks = [];
    el.addEventListener("chikyu-flat-look", (event) => (window as unknown as { looks: string[] }).looks.push(JSON.stringify((event as CustomEvent).detail)));
    el.setAttribute("lang", "ja");
  });
  await photo(page);
  await expect(flat(page).locator(".credit")).toContainText("ブルーマーブル");
  const looks = await page.evaluate(() => (window as unknown as { looks: string[] }).looks);
  expect(looks[0]).toContain('"look":"photo"');
  expect(looks[looks.length - 1]).toContain('"state":"photo"');
});

test("a picture that cannot be fetched leaves the drawn map and says so", async ({ page }) => {
  await page.route(/textures\/day-/, (route) => route.abort());
  await open(page);
  await flat(page).evaluate((el) => el.setAttribute("look", "photo"));
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).lookState)).toBe("failed");
  await expect(flat(page).locator(".credit")).toBeHidden();
  expect(await flat(page).evaluate((el) => (el as Flat).stats.mapDraws)).toBeGreaterThan(0);
});

test("the demo's Map and Photo buttons switch the look, and its address can ask for the photo", async ({ page }) => {
  await open(page, "?look=photo");
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).lookState)).toBe("photo");
  const look = page.getByTestId("look");
  await expect(look.getByRole("button", { name: "Photo" })).toHaveAttribute("aria-pressed", "true");
  await look.getByRole("button", { name: "Map" }).click();
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).look)).toBe("map");
  await expect(look.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
});

test("the Map / Photo pair is a control a page asks for: none by default, and it switches the look in both languages", async ({ page }) => {
  await open(page);
  const bar = flat(page).locator(".bar");
  await expect(bar.getByRole("button", { name: "Photo", exact: true })).toHaveCount(0);
  await flat(page).evaluate((el) => {
    el.setAttribute("texture-base", "textures/");
    el.setAttribute("controls", "centre look");
  });
  const pair = bar.getByRole("group", { name: "Look of the map" });
  await expect(pair.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
  await pair.getByRole("button", { name: "Photo" }).click();
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).lookState)).toBe("photo");
  await expect(pair.getByRole("button", { name: "Photo" })).toHaveAttribute("aria-pressed", "true");
  await expect(pair.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "false");
  await flat(page).evaluate((el) => el.setAttribute("lang", "ja"));
  await expect(bar.getByRole("group", { name: "地図の見た目" }).getByRole("button", { name: "写真" })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("group", { name: "地図の見た目" }).getByRole("button", { name: "地図" }).click();
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).look)).toBe("map");
});
