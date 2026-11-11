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

/** The yaw the last `look` left the controls at, unwrapped. */
let heldYaw = 0;

async function open(page: Page): Promise<void> {
  heldYaw = 0;
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations&ride=iss&rlook=horizon&light=lit`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).ride.riding, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 30_000 }).toBe(false);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
}

/** The yaw that turns the camera by `degrees` at the riding view's own zoom: a drag across the view is 180 and turns it 90 at a field of view of 60. */
const yawFor = (degrees: number, fov: number): number => degrees / (1.5 * (fov / 180));

/** Wait until the page has gone thirty frames of its own with no draw: the view has settled, whatever it took to get there. */
async function atRest(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = (await statsOf(page)).draws;
        await page.evaluate(async () => {
          for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        return (await statsOf(page)).draws - before;
      },
      { timeout: 60_000, message: "the view is at rest" },
    )
    .toBe(0);
}

/**
 * Look round: the controls' yaw and tilt, a step at a time as a drag gives them (the controls hold their yaw within -180 to 180, so no step is more than 150), then wait for the view to settle. The turn is added up from the changes, so this
 * goes round the way a drag does.
 */
async function look(page: Page, yaw: number, tilt = 0): Promise<Stats> {
  const steps = Math.max(1, Math.ceil(Math.abs(yaw - heldYaw) / 150));
  for (let i = 1; i <= steps; i += 1) {
    const next = heldYaw + ((yaw - heldYaw) * i) / steps;
    const wrapped = ((((next + 180) % 360) + 360) % 360) - 180;
    await page.locator(SPACE).evaluate((el, v) => (el as unknown as { setView(view: unknown, final: boolean): void }).setView({ yaw: v.wrapped, tilt: v.tilt, zoom: 1, panX: 0, panY: 0 }, true), { wrapped, tilt });
  }
  heldYaw = yaw;
  await atRest(page);
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

test("the controls' turn buttons do what a drag does: a turn is as big as the same drag and the horizon stays level", async ({ page }) => {
  await open(page);
  const first = await statsOf(page);
  const zenith = unit(first.camera.position);
  const heading = (forward: number[]): number[] => unit(forward.map((n, i) => n - dot(forward, zenith) * zenith[i]!));
  const start = heading(axes(first.camera.quaternion).forward);
  const yawBefore = await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { yaw: number }).yaw);
  // the controls' own turn (the same call the turn buttons and the arrow keys make): two thirds of a drag across the view
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { controller?: { set(v: unknown, final: boolean, why: string): void } }).controller?.set({ yaw: 120 }, true, "buttons"));
  await atRest(page);
  const yawAfter = await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { yaw: number }).yaw);
  const s = await statsOf(page);
  const a = axes(s.camera.quaternion);
  expect(Math.abs(dot(a.right, zenith)), "the horizon is level").toBeLessThan(0.01);
  const turned = (Math.acos(Math.max(-1, Math.min(1, dot(heading(a.forward), start)))) * 180) / Math.PI;
  console.log(`the controls turned the view from yaw ${yawBefore} to ${yawAfter}: the camera went ${turned.toFixed(1)} degrees round the vertical`);
  expect(turned, "yaw 120 is 60 degrees at a field of view of 60").toBeCloseTo(Math.abs(yawAfter - yawBefore) * 1.5 * (first.camera.fov / 180), 0);
});

/** The camera's heading round the vertical, in degrees from where it began (signed, 0 to 180 either way), and its tip: the angle of its forward above the horizontal. */
function bearing(stats: Stats, start: number[]): { heading: number; elevation: number } {
  const zenith = unit(stats.camera.position);
  const forward = axes(stats.camera.quaternion).forward;
  const flat = unit(forward.map((n, i) => n - dot(forward, zenith) * zenith[i]!));
  const side = [zenith[1]! * start[2]! - zenith[2]! * start[1]!, zenith[2]! * start[0]! - zenith[0]! * start[2]!, zenith[0]! * start[1]! - zenith[1]! * start[0]!];
  return { heading: (Math.atan2(dot(flat, side), dot(flat, start)) * 180) / Math.PI, elevation: (Math.asin(dot(forward, zenith)) * 180) / Math.PI };
}

/** A drag of the real pointer across the picture (or down it): the controls get the pointer events, as a reader's would. */
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 12 });
  await page.mouse.up();
  await atRest(page);
}

test("a real drag goes all the way round: five drags across the picture turn the camera past 360 degrees, a step each time, with the horizon level", async ({ page }) => {
  await open(page);
  const first = await statsOf(page);
  const zenith = unit(first.camera.position);
  const start = (() => {
    const forward = axes(first.camera.quaternion).forward;
    return unit(forward.map((n, i) => n - dot(forward, zenith) * zenith[i]!));
  })();
  let unwrapped = 0;
  let last = 0;
  const steps: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    // a drag across 90% of the picture is about 162 of the controls' yaw: the camera turns about 81 degrees, and the controls' own yaw passes 180 and wraps by the third drag
    await drag(page, [0.05, 0.5], [0.95, 0.5]);
    const s = await statsOf(page);
    const now = bearing(s, start).heading;
    const change = ((now - last + 540) % 360) - 180;
    unwrapped += change;
    last = now;
    steps.push(change);
    expect(Math.abs(dot(axes(s.camera.quaternion).right, zenith)), `no roll after drag ${i + 1}`).toBeLessThan(0.01);
  }
  console.log(`five drags turned the camera ${steps.map((n) => n.toFixed(0)).join(", ")} degrees: ${unwrapped.toFixed(0)} in all`);
  for (const change of steps) {
    expect(Math.abs(change), "each drag is a step of about the same size, none a snap of 180").toBeGreaterThan(55);
    expect(Math.abs(change)).toBeLessThan(110);
    expect(Math.sign(change), "all the same way").toBe(Math.sign(steps[0]!));
  }
  expect(Math.abs(unwrapped), "more than a whole turn").toBeGreaterThan(340);
});

test("up and down drags stop moving at the ends of the pitch: a drag back moves the view at once, not after the excess is dragged back", async ({ page }) => {
  await open(page);
  // four long drags down: far past where the camera looks straight down
  for (let i = 0; i < 4; i += 1) await drag(page, [0.5, 0.05], [0.5, 0.95]);
  const bottom = bearing(await statsOf(page), [1, 0, 0]).elevation;
  expect(bottom, "straight down").toBeLessThan(-85);
  const tiltAtBottom = await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { tilt: number }).tilt);
  expect(Math.abs(tiltAtBottom), "the controls' tilt is held to what does something").toBeLessThan(45);
  // a short drag back up: the camera lifts at once
  await drag(page, [0.5, 0.5], [0.5, 0.4]);
  const lifted = bearing(await statsOf(page), [1, 0, 0]).elevation;
  expect(lifted - bottom, "lifted by the first short drag back").toBeGreaterThan(3);
  // and the same at the top: four long drags up, then a short one down
  for (let i = 0; i < 4; i += 1) await drag(page, [0.5, 0.95], [0.5, 0.05]);
  const top = bearing(await statsOf(page), [1, 0, 0]).elevation;
  expect(top, "a little above the horizon, no more").toBeLessThan(21);
  expect(top).toBeGreaterThan(10);
  await drag(page, [0.5, 0.5], [0.5, 0.6]);
  expect(top - bearing(await statsOf(page), [1, 0, 0]).elevation, "and the first short drag back down moves it").toBeGreaterThan(3);
});

test("a change of zoom does not swing the heading", async ({ page }) => {
  await open(page);
  const first = await statsOf(page);
  const zenith = unit(first.camera.position);
  const start = (() => {
    const forward = axes(first.camera.quaternion).forward;
    return unit(forward.map((n, i) => n - dot(forward, zenith) * zenith[i]!));
  })();
  await drag(page, [0.05, 0.5], [0.95, 0.5]);
  const turned = bearing(await statsOf(page), start).heading;
  expect(Math.abs(turned)).toBeGreaterThan(50);
  for (const zoom of [3, 6, 1]) {
    await page.locator(SPACE).evaluate((el, z) => {
      const controls = document.querySelector("kazoku-view-controls") as unknown as { state: { yaw: number; tilt: number } };
      (el as unknown as { setView(view: unknown, final: boolean): void }).setView({ yaw: controls.state.yaw, tilt: controls.state.tilt, zoom: z, panX: 0, panY: 0 }, true);
    }, zoom);
    await atRest(page);
    const now = bearing(await statsOf(page), start).heading;
    expect(Math.abs(((now - turned + 540) % 360) - 180), `the same heading at zoom ${zoom}`).toBeLessThan(1);
  }
});
