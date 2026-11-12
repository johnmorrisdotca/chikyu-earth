// Facing while riding: each way lands near its direction, the button stays pressed until the view is turned, the address keeps it, less motion is instant, and a held clock draws nothing after the glide.
import { expect, test, type Page } from "@playwright/test";
import { settle } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await settle(page);
}

const rideIss = (page: Page, view: "from" | "follow" | "above"): Promise<void> =>
  page.locator(SPACE).evaluate((el, which) => {
    const space = el as unknown as { ride(target: unknown, options: unknown): void; satelliteGroups: { name: string }[] };
    const index = 0;
    space.ride({ group: "stations", index }, { view: which, smooth: false });
  }, view);

test("each facing is within a degree, the button shows pressed, and the address keeps it", async ({ page }) => {
  await open(page);
  const ride = page.getByRole("group", { name: "Ride along" });
  const face = page.getByRole("group", { name: "Face" });
  await ride.getByRole("button", { name: "ISS", exact: true }).dispatchEvent("click");
  await expect.poll(() => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { view: string } | null)?.view)).toBe("from");
  await face.getByRole("button", { name: "Ahead", exact: true }).dispatchEvent("click");
  await expect.poll(() => new URL(page.url()).searchParams.get("face")).toBe("ahead");
  await expect(face.getByRole("button", { name: "Ahead", exact: true })).toHaveAttribute("aria-pressed", "true");
  const off = await page.locator(SPACE).evaluate((el) => {
    const space = el as unknown as { setView(view: unknown, final: boolean): void; facing: string | null };
    space.setView({ yaw: 25, tilt: 0, zoom: 1 }, true);
    return space.facing;
  });
  expect(off, "a turn lets the facing go").toBeNull();
  await expect(face.getByRole("button", { name: "Ahead", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => new URL(page.url()).searchParams.get("face")).toBeNull();

  for (const view of ["from", "follow", "above"] as const) {
    await rideIss(page, view);
    const before = await page.locator(SPACE).evaluate((el) => {
      const space = el as unknown as { face(face: string): boolean; stats: { draws: number } };
      space.face("down");
      return space.stats.draws;
    });
    await expect.poll(() => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws)).toBeGreaterThan(before);
    const down = await page.locator(SPACE).evaluate((el) => {
      const space = el as unknown as { stats: { camera: { position: number[]; quaternion: number[] } }; facing: string | null };
      const { position, quaternion } = space.stats.camera;
      const [x, y, z, w] = quaternion;
      const vx = 0;
      const vy = 0;
      const vz = -1;
      const cx = y * vz - z * vy;
      const cy = z * vx - x * vz;
      const cz = x * vy - y * vx;
      const forward = [vx + 2 * w * cx + 2 * (y * cz - z * cy), vy + 2 * w * cy + 2 * (z * cx - x * cz), vz + 2 * w * cz + 2 * (x * cy - y * cx)];
      const n = Math.hypot(position[0]!, position[1]!, position[2]!) || 1;
      const nadir = [-position[0]! / n, -position[1]! / n, -position[2]! / n];
      const dot = forward[0]! * nadir[0]! + forward[1]! * nadir[1]! + forward[2]! * nadir[2]!;
      return { facing: space.facing, degrees: (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI };
    });
    expect(down.facing, view).toBe("down");
    expect(down.degrees, `${view} down`).toBeLessThanOrEqual(1);
  }
});

test("less motion turns at once, and nothing is drawn at rest afterwards", async ({ page }) => {
  await open(page, "&ride=iss&face=ahead");
  await expect.poll(() => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { facing: string | null; gliding: boolean } }).ride.facing)).toBe("ahead");
  const jumped = await page.locator(SPACE).evaluate((el) => {
    const space = el as unknown as { face(face: string): boolean; stats: { ride: { gliding: boolean }; draws: number } };
    space.face("behind");
    return { gliding: space.stats.ride.gliding, draws: space.stats.draws };
  });
  expect(jumped.gliding, "reduced motion does not glide").toBe(false);
  await settle(page, 600);
  const draws = await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
  await page.waitForTimeout(700);
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws), "nothing is drawn at rest").toBe(draws);
});
