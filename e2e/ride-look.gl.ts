// Riding a satellite with the horizon look, in a real browser (Chromium, drawn in software): a drag looks round on the spot. A sideways drag is a whole turn about the local vertical (the line from the Earth's centre through the satellite) with the horizon
// kept level, up and down only tips the view, and nothing rolls. Checked on the camera's own turn and on the picture: the Earth's edge is level, and the controls' turn does what a drag does.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });
test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
interface Stats {
  ride: { riding: boolean; gliding: boolean };
  camera: { position: [number, number, number]; quaternion: [number, number, number, number]; fov: number };
  draws: number;
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

async function open(page: Page): Promise<void> {
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations&ride=iss&rlook=horizon&light=lit`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).ride.riding, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 30_000 }).toBe(false);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
}

/** The yaw that turns the camera by `degrees` at the riding view's own zoom: a drag across the view is 180 and turns it 90 at a field of view of 60. */
const yawFor = (degrees: number, fov: number): number => degrees / (1.5 * (fov / 180));

/** Look round: the controls' own yaw (the view the shared controls give the element), then wait for the draw. */
async function look(page: Page, yaw: number, tilt = 0): Promise<Stats> {
  const before = (await statsOf(page)).draws;
  await page.locator(SPACE).evaluate((el, v) => (el as unknown as { setView(view: unknown, final: boolean): void }).setView({ yaw: v.yaw, tilt: v.tilt, zoom: 1, panX: 0, panY: 0 }, true), { yaw, tilt });
  // a view that is where it was draws nothing: wait for the draw a change brings, and go on without one
  try {
    await expect.poll(async () => (await statsOf(page)).draws, { timeout: 8000 }).toBeGreaterThan(before);
  } catch {
    // no change, no draw
  }
  await page.waitForTimeout(300);
  return statsOf(page);
}

/** Where the camera looks and where its picture's top and right are, from its turn: three.js's camera looks along -z with +y up and +x right. */
function axes(q: [number, number, number, number]): { forward: number[]; up: number[]; right: number[] } {
  const [x, y, z, w] = q;
  const turn = (v: number[]): number[] => {
    const [vx, vy, vz] = v as [number, number, number];
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
  };
  return { forward: turn([0, 0, -1]), up: turn([0, 1, 0]), right: turn([1, 0, 0]) };
}
const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const unit = (a: number[]): number[] => a.map((n) => n / Math.hypot(a[0]!, a[1]!, a[2]!));

/**
 * The row where the Earth's edge is at a column of the element's picture, in percent of the height: where the brightness steps up most going down the column (dark sky to the lit Earth), looking at the part above the bottom fifth. Also the
 * brightness down the column every tenth of the height, for the log.
 */
async function limbAt(page: Page, columns: number[]): Promise<{ edge: number; profile: number[] }[]> {
  const shot = (await page.locator(SPACE).screenshot()).toString("base64");
  return page.evaluate(
    async ({ data, at }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return at.map((share) => {
        const x = Math.round(share * (canvas.width - 1));
        const column = context.getImageData(x, 0, 1, canvas.height).data;
        const light = (y: number): number => column[y * 4]! + column[y * 4 + 1]! + column[y * 4 + 2]!;
        const reach = Math.round(canvas.height * 0.8);
        let best = 0;
        let edge = 0;
        for (let y = 4; y < reach; y += 1) {
          const step = (light(y + 3) + light(y + 2) + light(y + 1)) / 3 - (light(y - 1) + light(y - 2) + light(y - 3)) / 3;
          if (step > best) {
            best = step;
            edge = y;
          }
        }
        const profile = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((tenth) => Math.round(light(Math.min(canvas.height - 1, Math.round((canvas.height * tenth) / 10)))));
        return { edge: (edge / canvas.height) * 100, profile };
      });
    },
    { data: shot, at: columns },
  );
}

test("a sideways drag turns the camera all the way round the local vertical with the horizon level: 0, 90, 180, 270 and 360 degrees", async ({ page }) => {
  await open(page);
  const first = await statsOf(page);
  const position = first.camera.position;
  const zenith = unit(position);
  const a0 = axes(first.camera.quaternion);
  const fov = first.camera.fov;
  const heading = (forward: number[]): number[] => unit(forward.map((n, i) => n - dot(forward, zenith) * zenith[i]!));
  const start = heading(a0.forward);
  const tip = dot(a0.forward, zenith);
  expect(tip, "tipped down, towards the horizon").toBeLessThan(-0.3);
  for (const degrees of [0, 90, 180, 270, 360]) {
    const s = await look(page, yawFor(degrees, fov));
    const a = axes(s.camera.quaternion);
    expect(Math.abs(dot(a.right, zenith)), `no roll at ${degrees}: the picture's right is level`).toBeLessThan(0.01);
    expect(dot(a.up, zenith), `the sky is up at ${degrees}`).toBeGreaterThan(0.3);
    expect(dot(a.forward, zenith), `the same tip at ${degrees}`).toBeCloseTo(tip, 2);
    const along = dot(heading(a.forward), start);
    const expected = Math.cos((degrees * Math.PI) / 180);
    expect(along, `heading ${degrees} degrees from where it began`).toBeCloseTo(expected, 1);
  }
  // at 180 it looks back along the ground track: the way the ISS goes is behind the camera
  const s180 = await look(page, yawFor(180, fov));
  expect(dot(heading(axes(s180.camera.quaternion).forward), start), "the ground track runs away from the camera").toBeLessThan(-0.95);
});

test("the Earth's edge is level in the picture at 90, 180 and 270 degrees: its left and right ends are at the same height", async ({ page }) => {
  await open(page);
  const fov = (await statsOf(page)).camera.fov;
  for (const degrees of [0, 90, 180, 270]) {
    await look(page, yawFor(degrees, fov));
    const [left, right] = await limbAt(page, [0.2, 0.8]);
    console.log(`at ${degrees} degrees the edge is at ${left!.edge.toFixed(1)}% and ${right!.edge.toFixed(1)}% of the height; brightness down the left column ${left!.profile.join(" ")}`);
    expect(left!.edge, `the edge is in the picture at ${degrees}`).toBeGreaterThan(5);
    expect(left!.edge).toBeLessThan(80);
    expect(Math.abs(left!.edge - right!.edge), `level at ${degrees} degrees: the same height at both ends, in percent of the picture`).toBeLessThan(2);
  }
});

test("up and down is only pitch: the heading and the level horizon stay, from straight down to a little above the horizon", async ({ page }) => {
  await open(page);
  const fov = (await statsOf(page)).camera.fov;
  const turned = yawFor(120, fov);
  const base = await look(page, turned, 0);
  const zenith = unit(base.camera.position);
  const flat = (forward: number[]): number[] => unit(forward.map((n, i) => n - dot(forward, zenith) * zenith[i]!));
  const heading0 = flat(axes(base.camera.quaternion).forward);
  for (const tilt of [-80, -30, 30, 60]) {
    const s = await look(page, turned, tilt);
    const a = axes(s.camera.quaternion);
    expect(Math.abs(dot(a.right, zenith)), `no roll at tilt ${tilt}`).toBeLessThan(0.01);
    if (Math.abs(dot(a.forward, zenith)) < 0.99) expect(dot(flat(a.forward), heading0), `the same heading at tilt ${tilt}`).toBeGreaterThan(0.99);
  }
  const high = axes((await look(page, turned, -1000)).camera.quaternion);
  expect((Math.asin(dot(high.forward, zenith)) * 180) / Math.PI, "a little above the horizon at most").toBeLessThan(21);
  const down = axes((await look(page, turned, 1000)).camera.quaternion);
  expect(dot(down.forward, zenith), "as far as straight down").toBeLessThan(-0.99);
});

test("the controls' turn buttons do what a drag does: a quarter turn is 90 degrees about the vertical, with the horizon level", async ({ page }) => {
  await open(page);
  const first = await statsOf(page);
  const zenith = unit(first.camera.position);
  const heading = (forward: number[]): number[] => unit(forward.map((n, i) => n - dot(forward, zenith) * zenith[i]!));
  const start = heading(axes(first.camera.quaternion).forward);
  const yawBefore = await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { yaw: number }).yaw);
  // the controls' own turn (the same call the turn buttons and the arrow keys make): half a drag across the view
  const draws = first.draws;
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { controller?: { set(v: unknown, final: boolean, why: string): void } }).controller?.set({ yaw: 180 }, true, "buttons"));
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000 }).toBeGreaterThan(draws);
  await page.waitForTimeout(300);
  const yawAfter = await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { yaw: number }).yaw);
  const s = await statsOf(page);
  const a = axes(s.camera.quaternion);
  expect(Math.abs(dot(a.right, zenith)), "the horizon is level").toBeLessThan(0.01);
  const turned = (Math.acos(Math.max(-1, Math.min(1, dot(heading(a.forward), start)))) * 180) / Math.PI;
  console.log(`the controls turned the view from yaw ${yawBefore} to ${yawAfter}: the camera went ${turned.toFixed(1)} degrees round the vertical`);
  expect(turned, "yaw 180 is 90 degrees at a field of view of 60").toBeCloseTo(Math.abs(yawAfter - yawBefore) * 1.5 * (first.camera.fov / 180), 0);
});
