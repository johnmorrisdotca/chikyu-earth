// The sky is behind the Earth: no constellation line, star ring or star name is drawn over the Earth's disc or its air, in the space view and in a ride (a camera 1,150 km up sees the Earth 110 degrees across, and the limb is an arc across the picture), on the lit side and on the
// night side. The cover is geometric (the ray through a pixel against the Earth's angular radius), never the brightness of the pixel. And the sky's labels never rise above a page's own content: the element is a stacking context. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { AIR_THICKNESS_DEFAULT, airTop } from "../src/realistic/air.ts";
import { routeElements } from "./recorded.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
const CONTROLS = "kazoku-view-controls";
interface Camera {
  position: number[];
  quaternion: number[];
  fov: number;
}
/** What the page says, read in one go so a draw between two readings cannot change it. */
interface Seen {
  width: number;
  height: number;
  camera: Camera;
  /** Pixels of the sky's canvas that are drawn on (a line, a ring, a leader), in CSS pixels from the picture's top left. */
  inked: { x: number; y: number }[];
  /** Each label shown: its box, from the picture's top left. */
  boxes: { text: string; l: number; t: number; r: number; b: number }[];
  figures: number;
}

/** Whether a point of the picture shows the Earth with its air, from the camera alone: the ray through it is within the angular radius of the air's top (the sine of which is its radius over the camera's distance from the centre, in Earth radii), less `margin` of it (a line is a pixel wide and drawn with antialiasing, so a pixel of it or two beside the edge is not on the Earth). */
function onEarth(camera: Camera, width: number, height: number, x: number, y: number, margin = 0.985): boolean {
  const reach = Math.tan((camera.fov * Math.PI) / 360);
  const local = [((x / width) * 2 - 1) * reach * (width / height), (1 - (y / height) * 2) * reach, -1];
  const [qx, qy, qz, qw] = camera.quaternion as [number, number, number, number];
  const tx = 2 * (qy * local[2]! - qz * local[1]!);
  const ty = 2 * (qz * local[0]! - qx * local[2]!);
  const tz = 2 * (qx * local[1]! - qy * local[0]!);
  const ray = [local[0]! + qw * tx + (qy * tz - qz * ty), local[1]! + qw * ty + (qz * tx - qx * tz), local[2]! + qw * tz + (qx * ty - qy * tx)];
  const away = Math.hypot(...(camera.position as [number, number, number]));
  const down = camera.position.map((n) => -n / away);
  const cosine = (ray[0]! * down[0]! + ray[1]! * down[1]! + ray[2]! * down[2]!) / Math.hypot(ray[0]!, ray[1]!, ray[2]!);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) < Math.asin(Math.min(1, airTop(AIR_THICKNESS_DEFAULT) / away)) * margin;
}

const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
/** Waits until the page has gone thirty frames with no draw: the picture and the layer are at rest. */
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

async function read(page: Page): Promise<Seen> {
  return page.locator(SPACE).evaluate((el) => {
    const own = el.getBoundingClientRect();
    const stats = Reflect.get(el, "stats") as { camera: Camera; sky: { figures: number } };
    const canvas = el.shadowRoot!.getElementById("sk-canvas") as HTMLCanvasElement;
    const sx = canvas.width / own.width;
    const sy = canvas.height / own.height;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const inked: { x: number; y: number }[] = [];
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) if (data[(y * canvas.width + x) * 4 + 3]! > 3) inked.push({ x: (x + 0.5) / sx, y: (y + 0.5) / sy });
    const boxes = [...el.shadowRoot!.querySelectorAll<HTMLElement>("#sk-names .sk-name, #sk-names .sk-designation, #sk-names .sk-figure")]
      .filter((b) => !b.hidden)
      .map((b) => {
        const box = b.getBoundingClientRect();
        return { text: b.textContent ?? "", l: box.left - own.left, t: box.top - own.top, r: box.right - own.left, b: box.bottom - own.top };
      });
    return { width: own.width, height: own.height, camera: stats.camera, inked, boxes, figures: stats.sky.figures };
  });
}

/** Asserts nothing of the sky is on the Earth: not a pixel of a line or ring, and no point of a label's box. Answers how many pixels were drawn and how many labels shown. */
function assertBehind(seen: Seen, where: string): { inked: number; labels: number } {
  const over = seen.inked.filter((p) => onEarth(seen.camera, seen.width, seen.height, p.x, p.y));
  expect(over.slice(0, 5), `${where}: ${over.length} drawn pixels of the sky are on the Earth`).toEqual([]);
  for (const box of seen.boxes) {
    for (let x = box.l; x <= box.r + 3; x += 3) {
      for (let y = box.t; y <= box.b + 3; y += 3) {
        expect(onEarth(seen.camera, seen.width, seen.height, Math.min(x, box.r), Math.min(y, box.b)), `${where}: "${box.text}" has no part on the Earth (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(false);
      }
    }
  }
  return { inked: seen.inked.length, labels: seen.boxes.length };
}

const controls = (page: Page, view: { yaw: number; tilt: number; zoom: number }): Promise<void> =>
  page.locator(CONTROLS).evaluate((el, v) => (el as unknown as { controller: { set(view: unknown, final: boolean, why: string): void } }).controller.set({ yaw: ((v.yaw + 180) % 360) - 180, tilt: v.tilt, zoom: v.zoom }, true, "test"), view);

/** A ride about 1,150 km up: the stations' file served with every station on an orbit of that height (13.3 turns a day). */
async function routeHighStation(page: Page, motion = 13.31, inclination?: number): Promise<void> {
  await routeElements(page);
  await page.route(/\/elements\/stations\.json$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { fields: string[]; rows: (string | number)[][] };
    const at = body.fields.indexOf("MEAN_MOTION");
    const eccentricity = body.fields.indexOf("ECCENTRICITY");
    const tilt = body.fields.indexOf("INCLINATION");
    for (const row of body.rows) {
      row[at] = motion;
      row[eccentricity] = 0.0001;
      if (inclination !== undefined) row[tilt] = inclination;
    }
    await route.fulfill({ response, json: body });
  });
}

async function openRide(page: Page, query: string, orbit: { motion?: number; inclination?: number } = {}): Promise<void> {
  await routeHighStation(page, orbit.motion, orbit.inclination);
  await page.goto(`/chikyu-earth/?look=space&speed=0&center=-100,40&sats=stations&ride=iss&rlook=horizon&constellation-lines=0.3&star-names=40&${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { gliding: boolean } }).ride)).gliding, { timeout: 30_000 }).toBe(false);
  await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
}

/** The colours of points of a picture of the page: a screenshot, read back, at each point (in CSS pixels of the viewport). */
async function coloursAt(page: Page, at: { x: number; y: number }[]): Promise<string[]> {
  const shot = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const scale = image.width / window.innerWidth;
      return points.map((p) => {
        const d = context.getImageData(Math.round(p.x * scale), Math.round(p.y * scale), 1, 1).data;
        return `${d[0]},${d[1]},${d[2]}`;
      });
    },
    { data: shot, points: at },
  );
}

/** The mean brightness of the Earth's interior in the picture without the sky's layers, to know a view is on the night side. */
async function earthBrightness(page: Page, seen: Seen): Promise<number> {
  await page.locator(SPACE).evaluate((el) => {
    el.shadowRoot!.getElementById("sk-names")!.style.visibility = "hidden";
    el.shadowRoot!.getElementById("sk-canvas")!.style.visibility = "hidden";
  });
  const own = (await page.locator(SPACE).boundingBox())!;
  const points: { x: number; y: number }[] = [];
  for (let x = 40; x < seen.width; x += 80) for (let y = 40; y < seen.height; y += 80) if (onEarth(seen.camera, seen.width, seen.height, x, y, 0.9)) points.push({ x: own.x + x, y: own.y + y });
  const colours = await coloursAt(page, points);
  await page.locator(SPACE).evaluate((el) => {
    el.shadowRoot!.getElementById("sk-names")!.style.visibility = "";
    el.shadowRoot!.getElementById("sk-canvas")!.style.visibility = "";
  });
  if (colours.length === 0) return 255;
  return colours.reduce((sum, c) => sum + c.split(",").reduce((a, n) => a + Number(n), 0) / 3, 0) / colours.length;
}

test("space view: no line, ring or name is drawn over the Earth", async ({ page }, testInfo) => {
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40&constellation-lines=0.3&star-names=40");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator(SPACE).evaluate((el) => el.setAttribute("earth-size", "0.45"));
  let inked = 0;
  let labels = 0;
  for (const lon of [-100, -40, 20, 80, 140, 200]) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("center", `${at},20`), lon);
    await atRest(page);
    const seen = await read(page);
    await page.locator(SPACE).screenshot({ path: testInfo.outputPath(`space-${lon}.png`) });
    await testInfo.attach(`space-${lon}.json`, { body: JSON.stringify({ camera: seen.camera, boxes: seen.boxes }) });
    const done = assertBehind(seen, `space view at ${lon}`);
    inked += done.inked;
    labels += done.labels;
  }
  expect(inked, "lines were drawn in the sky").toBeGreaterThan(50);
  expect(labels, "and names shown").toBeGreaterThan(0);
});

for (const [name, query] of [
  ["a ride 1,150 km up, horizon look, lit", "time=2026-11-02T18:00Z&light=lit"],
  ["a ride 1,150 km up on the night side", "time=2026-11-02T03:00Z&light=sun"],
] as const) {
  test(`${name}: the Earth's limb covers the sky across the picture at every turn and tilt`, async ({ page }) => {
    await openRide(page, query);
    let inked = 0;
    let labels = 0;
    let figures = 0;
    for (const view of [
      { yaw: 0, tilt: 0, zoom: 1 },
      { yaw: 100, tilt: 0, zoom: 1 },
      { yaw: 200, tilt: -20, zoom: 1 },
      { yaw: 300, tilt: 20, zoom: 1 },
      { yaw: 40, tilt: -60, zoom: 1 },
    ]) {
      await controls(page, view);
      await atRest(page);
      const seen = await read(page);
      const done = assertBehind(seen, `${name} at ${JSON.stringify(view)}`);
      inked += done.inked;
      labels += done.labels;
      figures += seen.figures;
    }
    expect(figures, "constellation figures were in view").toBeGreaterThan(0);
    expect(inked, "lines were drawn in the sky above the limb").toBeGreaterThan(50);
    expect(labels, "and names shown").toBeGreaterThan(0);
    if (name.includes("night")) {
      // the sub-satellite point is on the dark side at some hours of the day: step the clock round until the Earth below is dark, then check the cover there
      let dark = 255;
      for (const hour of [0, 3, 6, 9, 12, 15, 18, 21]) {
        await page.locator(SPACE).evaluate((el, h) => el.setAttribute("time", `2026-11-02T${String(h).padStart(2, "0")}:00Z`), hour);
        await controls(page, { yaw: 0, tilt: 0, zoom: 1 });
        await atRest(page);
        const seen = await read(page);
        dark = await earthBrightness(page, seen);
        if (dark < 60) {
          assertBehind(seen, `${name} at ${hour}:00Z`);
          for (const view of [{ yaw: 150, tilt: 0, zoom: 1 }, { yaw: 250, tilt: -20, zoom: 1 }]) {
            await controls(page, view);
            await atRest(page);
            assertBehind(await read(page), `${name} at ${hour}:00Z, ${JSON.stringify(view)}`);
          }
          break;
        }
      }
      expect(dark, "the Earth below was dark at some hour").toBeLessThan(60);
    }
  });
}

test("a ride looking straight down: the Earth fills the picture, and no line or name is on it", async ({ page }) => {
  await openRide(page, "time=2026-11-02T18:00Z&light=lit&rlook=down");
  await atRest(page);
  assertBehind(await read(page), "straight down");
});

test("a ride on a geostationary satellite: its orbit seen edge-on is not drawn through the Earth", async ({ page }, testInfo) => {
  // PAKSAT-MM1 in the demo's own geostationary file (35,793 km up, inclination 0): its orbit seen from it is a straight line, whose far half runs behind the Earth
  await page.goto("/chikyu-earth/?look=space&time=2026-11-03T12:00Z&speed=0&center=-100,40&sats=geostationary&sat=59915&ride=chosen&rlook=horizon&light=lit&scale=true&orbits=off&constellation-lines=0.3&star-names=10");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean; gliding: boolean } }).ride)).riding, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { gliding: boolean } }).ride)).gliding, { timeout: 30_000 }).toBe(false);
  await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
  // the page marks the satellite it rides (as the site's satellite card does), so its own path is drawn: white, and edge-on a straight line through the Earth's place in the picture
  const chosen = await page.locator(SPACE).evaluate((el) => {
    const api = el as unknown as { satelliteGroups: { name: string; count: number }[]; satelliteInfo(ref: { group: string; index: number }): { noradId: number } | undefined; selectSatellite(ref: { group: string; index: number } | null): void; selectedSatellite: unknown };
    const count = api.satelliteGroups.find((g) => g.name === "geostationary")?.count ?? 0;
    for (let index = 0; index < count; index += 1) {
      if (api.satelliteInfo({ group: "geostationary", index })?.noradId === 59915) {
        api.selectSatellite({ group: "geostationary", index });
        break;
      }
    }
    return api.selectedSatellite;
  });
  expect(chosen, "the ridden satellite is marked").not.toBeNull();
  for (const [name, view] of [["horizon", { yaw: 0, tilt: 0, zoom: 1 }]] as const) {
    await controls(page, view);
    await atRest(page);
    await page.locator(SPACE).evaluate((el) => {
      el.shadowRoot!.getElementById("sk-names")?.style.setProperty("visibility", "hidden");
      el.shadowRoot!.getElementById("sk-canvas")?.style.setProperty("visibility", "hidden");
    });
    await page.locator(SPACE).screenshot({ path: testInfo.outputPath(`geostationary-${name}.png`) });
    const seen = await read(page);
    const own = (await page.locator(SPACE).boundingBox())!;
    // every third row across the Earth: the share of its pixels that are white (a path drawn across the globe is a row of them; clouds are never a whole row)
    const rows: { y: number; points: { x: number; y: number }[] }[] = [];
    for (let y = 0; y < seen.height; y += 3) {
      const points: { x: number; y: number }[] = [];
      for (let x = 0; x < seen.width; x += 3) if (onEarth(seen.camera, seen.width, seen.height, x, y, 0.95)) points.push({ x: own.x + x, y: own.y + y });
      if (points.length > 30) rows.push({ y, points });
    }
    expect(rows.length, `the Earth is in the picture (${name})`).toBeGreaterThan(10);
    const colours = await coloursAt(page, rows.flatMap((row) => row.points));
    let at = 0;
    const white: number[] = [];
    for (const row of rows) {
      const mine = colours.slice(at, at + row.points.length);
      at += row.points.length;
      white.push(mine.filter((c) => c.split(",").every((n) => Number(n) > 215)).length / mine.length);
    }
    expect(Math.max(...white), `no row across the Earth is a white line (${name})`).toBeLessThan(0.6);
  }
});

test("the sky's labels never rise above a page's own content: the element is a stacking context, and a block of the page laid over a name hides it", async ({ page }) => {
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40&star-names=40");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator(SPACE).evaluate((el) => el.setAttribute("earth-size", "0.3"));
  let box: { l: number; t: number; r: number; b: number } | undefined;
  for (const lon of [-100, -40, 20, 80, 140, 200]) {
    await page.locator(SPACE).evaluate((el, at) => el.setAttribute("center", `${at},20`), lon);
    await atRest(page);
    box = (await read(page)).boxes.find((b) => b.text !== "");
    if (box) break;
  }
  expect(box, "a name is shown").toBeDefined();
  await page.locator(SPACE).scrollIntoViewIfNeeded();
  await atRest(page);
  const own = (await page.locator(SPACE).boundingBox())!;
  // the page lays a block of its own over the element (positioned, one level above), over the name
  await page.evaluate(
    ({ x, y, w, h }) => {
      const block = document.createElement("div");
      block.id = "page-text";
      block.textContent = "PAGE TEXT";
      block.style.cssText = `position:fixed;z-index:100;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:rgb(255,0,255)`;
      document.body.append(block);
    },
    { x: own.x + box!.l - 6, y: own.y + box!.t - 6, w: box!.r - box!.l + 12, h: box!.b - box!.t + 12 },
  );
  const centre = { x: own.x + (box!.l + box!.r) / 2, y: own.y + (box!.t + box!.b) / 2 };
  const [colour] = await coloursAt(page, [centre]);
  expect(colour, "the page's block is what is seen where the name is").toBe("255,0,255");
});

for (const [look, tag] of [["line", "chikyu-earth"], ["realistic", "chikyu-earth-realistic"], ["space", "chikyu-space"]] as const) {
  test(`${tag} is its own stacking context`, async ({ page }) => {
    await page.goto(`/chikyu-earth/?look=${look}&speed=0`);
    await page.locator(tag).first().waitFor({ timeout: 60_000 });
    expect(await page.locator(tag).first().evaluate((el) => getComputedStyle(el).isolation)).toBe("isolate");
  });
}
