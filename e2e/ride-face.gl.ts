// Riding the ISS, the Face buttons turn the camera ahead, behind, left, right, down or up again, in a real browser (Chromium, drawn in software): each lands within a degree of its way, its button is pressed until the view is
// turned, the address keeps the facing, a reader who asked for reduced motion gets no glide, and after the glide nothing is drawn while the clock holds.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
const PAGE = `/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations&ride=iss&rlook=horizon&light=lit`;
type Face = "ahead" | "behind" | "left" | "right" | "down" | "up";
interface Stats {
  ride: { riding: boolean; gliding: boolean; facing: Face | null };
  camera: { position: [number, number, number]; quaternion: [number, number, number, number]; fov: number };
  draws: number;
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
const faces = (page: Page) => page.getByTestId("ride-faces");

async function open(page: Page, url = PAGE): Promise<void> {
  await page.goto(url);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).ride.riding, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 30_000 }).toBe(false);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await atRest(page);
}

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
const cross = (a: number[], b: number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (a: number[]): number[] => a.map((n) => n / Math.hypot(a[0]!, a[1]!, a[2]!));
const degreesBetween = (a: number[], b: number[]): number => (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;
const flat = (v: number[], zenith: number[]): number[] => unit(v.map((n, i) => n - dot(v, zenith) * zenith[i]!));

/** The ways to face, from the picture the ride opens on (the horizon look, ahead): the way it goes, flat, and the local vertical. */
async function ways(page: Page): Promise<{ zenith: number[]; heading: Record<"ahead" | "behind" | "left" | "right", number[]>; tip: number }> {
  const first = await statsOf(page);
  const zenith = unit(first.camera.position);
  const forward = axes(first.camera.quaternion).forward;
  const ahead = flat(forward, zenith);
  const left = cross(zenith, ahead);
  return { zenith, heading: { ahead, behind: ahead.map((n) => -n), left, right: left.map((n) => -n) }, tip: dot(forward, zenith) };
}

/** The camera faces its way: within a degree of the heading with the opening's tip (ahead, behind, left, right) and level, or straight down or up. */
function expectFacing(stats: Stats, face: Face, w: Awaited<ReturnType<typeof ways>>): void {
  const a = axes(stats.camera.quaternion);
  if (face === "down") expect(degreesBetween(a.forward, w.zenith.map((n) => -n)), "straight down").toBeLessThan(1);
  else if (face === "up") expect(degreesBetween(a.forward, w.zenith), "straight up").toBeLessThan(1);
  else {
    expect(degreesBetween(flat(a.forward, w.zenith), w.heading[face]), `${face}: the heading within a degree`).toBeLessThan(1);
    expect(dot(a.forward, w.zenith), `${face}: the horizon where the ride opened with it`).toBeCloseTo(w.tip, 2);
    expect(Math.abs(dot(a.right, w.zenith)), `${face}: level`).toBeLessThan(0.01);
  }
}

const pressed = (page: Page) => faces(page).locator("button[aria-pressed=true]");

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("each button turns the camera its way at once, is pressed, and the address keeps it; a drag lets the button go", async ({ page }) => {
    await open(page);
    await expect(faces(page)).toBeVisible();
    await expect(pressed(page)).toHaveCount(0);
    const w = await ways(page);
    for (const face of ["left", "behind", "right", "up", "down", "ahead"] as const) {
      // the press and the camera's state in one go: under reduced motion there is no glide to wait for
      const gliding = await page.evaluate((f) => {
        document.querySelector<HTMLButtonElement>(`[data-ride-face=${f}]`)!.click();
        return (Reflect.get(document.querySelector("chikyu-space")!, "stats") as Stats).ride.gliding;
      }, face);
      expect(gliding, `${face}: no glide for a reader who asked for reduced motion`).toBe(false);
      await atRest(page);
      const s = await statsOf(page);
      expectFacing(s, face, w);
      expect(s.ride.facing).toBe(face);
      await expect(pressed(page)).toHaveAttribute("data-ride-face", face);
      await expect.poll(() => new URL(page.url()).searchParams.get("face")).toBe(face);
      await expect.poll(() => new URL(page.url()).searchParams.get("rlook")).toBe("horizon");
    }
    // a turn of the view lets the button go: the facing is where it looks round from, and stays in the address
    await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { controller: { set(view: unknown, final: boolean, why: string): void } }).controller.set({ yaw: 40 }, true, "test"));
    await expect(pressed(page)).toHaveCount(0);
    expect((await statsOf(page)).ride.facing).toBeNull();
    expect(new URL(page.url()).searchParams.get("face")).toBe("ahead");
  });

  test("the address opens the ride facing the way it names, from the straight-down look too", async ({ page }) => {
    await open(page);
    const w = await ways(page);
    await open(page, `${PAGE.replace("&rlook=horizon", "")}&face=left`);
    const s = await statsOf(page);
    expectFacing(s, "left", w);
    expect(s.ride.facing).toBe("left");
    await expect(pressed(page)).toHaveAttribute("data-ride-face", "left");
    await expect(page.locator("[data-ride-look=horizon]")).toHaveClass(/\bon\b/);
  });

  test("the keys W, S, A, D, F and R face the ways on the focused picture", async ({ page }) => {
    await open(page);
    const w = await ways(page);
    await page.locator(SPACE).focus();
    for (const [key, face] of [["a", "left"], ["s", "behind"], ["d", "right"], ["r", "up"], ["f", "down"], ["w", "ahead"]] as const) {
      await page.keyboard.press(key);
      await atRest(page);
      expectFacing(await statsOf(page), face, w);
      await expect(pressed(page)).toHaveAttribute("data-ride-face", face);
    }
  });
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a press glides there in about half a second, lands within a degree, and then draws nothing while the clock holds", async ({ page }) => {
    await open(page);
    // with motion the view opens turning (Auto-turn) until the test pauses it: the ways are measured from the view at the controls' 0
    await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { controller: { set(view: unknown, final: boolean, why: string): void } }).controller.set({ yaw: 0, tilt: 0 }, true, "test"));
    await atRest(page);
    const w = await ways(page);
    const gliding = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>("[data-ride-face=right]")!.click();
      return (Reflect.get(document.querySelector("chikyu-space")!, "stats") as Stats).ride.gliding;
    });
    expect(gliding, "it glides").toBe(true);
    await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 30_000 }).toBe(false);
    await atRest(page);
    expectFacing(await statsOf(page), "right", w);
    // at rest: no draw over thirty more frames
    const before = (await statsOf(page)).draws;
    await page.evaluate(async () => {
      for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect((await statsOf(page)).draws - before, "nothing drawn at rest after the glide").toBe(0);
  });
});
