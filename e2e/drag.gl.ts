// The ground follows the pointer, in every look and when riding: drag right and the ground moves right, drag up and it moves up, the arrow keys agree, Auto-turn turns the real way
// (the ground moves left to right, as the Earth turns west to east), and a ride can be dragged too. Real pointer events, real key presses, and the pictures compared: the ground's move
// is found by sliding the middle of the first picture over the second (e2e/ground.ts).
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, settle } from "./gl.ts";
import { changedShare, dragBy, groundShift } from "./ground.ts";
import { routeElements } from "./recorded.ts";

const FIXED = "time=2026-11-03T07:30Z&speed=0&center=25,-31";
const GLOBE = "#globe";
const CONTROLS = "kazoku-view-controls";

interface RideStats {
  satellites: { placed: number };
  ride: { riding: boolean; gliding: boolean };
}

async function open(page: Page, query: string, wait: "flat" | "realistic" | "space" | "ride"): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?${query}`);
  if (wait === "flat") await expect(page.locator("chikyu-earth svg, chikyu-earth canvas").first()).toBeVisible();
  else if (wait === "realistic") await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
  else {
    await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    if (wait === "ride") {
      const stats = (): Promise<RideStats> => page.locator("chikyu-space").evaluate((el) => Reflect.get(el, "stats") as RideStats);
      await expect.poll(async () => (await stats()).ride.riding, { timeout: 30_000 }).toBe(true);
      await expect.poll(async () => (await stats()).ride.gliding, { timeout: 10_000 }).toBe(false);
    }
  }
  // the controls' own Auto-turn is on for a reader with no motion preference: stop it, the tests turn it on when they mean to
  await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
  await page.locator(GLOBE).scrollIntoViewIfNeeded();
  await settle(page, 1000);
}

const picture = (page: Page): Promise<Buffer> => page.locator(GLOBE).screenshot();

/** Do `act`, then say how far the ground moved on the screen. */
async function moved(page: Page, act: () => Promise<void>): Promise<{ x: number; y: number }> {
  const before = await picture(page);
  await act();
  await settle(page, 900);
  const after = await picture(page);
  const shift = await groundShift(page, before, after, 70);
  return { x: shift.x, y: shift.y };
}

const MIN = 8;

/** The five ways of moving a view, each checked against the way the ground goes. */
async function followsTheHand(page: Page): Promise<void> {
  const globe = page.locator(GLOBE);
  const right = await moved(page, () => dragBy(page, globe, 30, 0));
  expect(right.x, `a drag right moves the ground right (moved ${right.x},${right.y})`).toBeGreaterThan(MIN);
  expect(Math.abs(right.y), "and not up or down").toBeLessThan(MIN);
  await dragBy(page, globe, -30, 0);
  const up = await moved(page, () => dragBy(page, globe, 0, -30));
  expect(up.y, `a drag up moves the ground up (moved ${up.x},${up.y})`).toBeLessThan(-MIN);
  expect(Math.abs(up.x), "and not sideways").toBeLessThan(MIN);
  await dragBy(page, globe, 0, 30);
  await settle(page, 500);

  await globe.focus();
  const arrowRight = await moved(page, () => page.keyboard.press("ArrowRight"));
  expect(arrowRight.x, `the right arrow moves the ground right (moved ${arrowRight.x},${arrowRight.y})`).toBeGreaterThan(MIN);
  await page.keyboard.press("ArrowLeft");
  const arrowUp = await moved(page, () => page.keyboard.press("ArrowUp"));
  expect(arrowUp.y, `the up arrow moves the ground up (moved ${arrowUp.x},${arrowUp.y})`).toBeLessThan(-MIN);
  await page.keyboard.press("ArrowDown");
  await settle(page, 500);

  // Auto-turn at a quick pace so a second or two shows: the angle grows, and the ground goes left to right, as the Earth turns west to east
  const turn = await moved(page, async () => {
    await page.locator(CONTROLS).evaluate((el) => {
      const controller = Reflect.get(el, "controller") as { speed: number; play(): void };
      controller.speed = 6;
      controller.play();
    });
    await page.waitForTimeout(1500);
    await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
  });
  expect(turn.x, `Auto-turn moves the ground right (moved ${turn.x},${turn.y})`).toBeGreaterThan(MIN);
}

test.beforeEach(({ page }) => routeElements(page));

test("the line globe: the ground follows a drag, the arrows and Auto-turn", async ({ page }) => {
  await open(page, `look=line&${FIXED}`, "flat");
  await followsTheHand(page);
});

test("the thick globe: the ground follows a drag, the arrows and Auto-turn", async ({ page }) => {
  await open(page, `look=thick&${FIXED}`, "flat");
  await followsTheHand(page);
});

test("the realistic Earth: the ground follows a drag, the arrows and Auto-turn", async ({ page }) => {
  await open(page, `look=realistic&${FIXED}`, "realistic");
  await followsTheHand(page);
});

test("the Earth in space: the ground follows a drag, the arrows and Auto-turn", async ({ page }) => {
  await open(page, `look=space&${FIXED}`, "space");
  await followsTheHand(page);
});

test("riding the ISS, looking down: the ground follows a drag, the arrows and Auto-turn", async ({ page }) => {
  await open(page, `look=space&${FIXED}&sats=stations&ride=iss`, "ride");
  await followsTheHand(page);
});

test("riding the ISS, tipped to the horizon: the ground follows a drag, the arrows and Auto-turn", async ({ page }) => {
  await open(page, `look=space&${FIXED}&sats=stations&ride=iss&rlook=horizon`, "ride");
  await followsTheHand(page);
});

test("riding the Moon: the ground follows a drag, the arrows and Auto-turn", async ({ page }) => {
  await open(page, `look=space&${FIXED}&ride=Moon`, "ride");
  await followsTheHand(page);
});

test("behind the ISS: the Earth follows a drag", async ({ page }) => {
  await open(page, `look=space&${FIXED}&sats=stations&ride=iss&rview=follow`, "ride");
  const globe = page.locator(GLOBE);
  const right = await moved(page, () => dragBy(page, globe, 30, 0));
  expect(right.x, `a drag right moves the Earth right (moved ${right.x},${right.y})`).toBeGreaterThan(4);
  await dragBy(page, globe, -30, 0);
  const up = await moved(page, () => dragBy(page, globe, 0, -30));
  expect(up.y, `a drag up moves the Earth up (moved ${up.x},${up.y})`).toBeLessThan(-2);
});

test("behind the Moon: the Moon follows a drag", async ({ page }) => {
  await open(page, `look=space&${FIXED}&ride=Moon&rview=follow`, "ride");
  const globe = page.locator(GLOBE);
  const right = await moved(page, () => dragBy(page, globe, 30, 0));
  expect(right.x, `a drag right moves the ground right (moved ${right.x},${right.y})`).toBeGreaterThan(MIN);
  await dragBy(page, globe, -30, 0);
  const up = await moved(page, () => dragBy(page, globe, 0, -30));
  expect(up.y, `a drag up moves the ground up (moved ${up.x},${up.y})`).toBeLessThan(-MIN);
});

test("the address keeps a ride's turn: it opens as it was left, a drag writes it back, and the picture comes back from it", async ({ page }) => {
  const stateOf = (): Promise<{ yaw: number; tilt: number }> => page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "state") as { yaw: number; tilt: number });
  await open(page, `look=space&${FIXED}&sats=stations&ride=iss&yaw=-21&tilt=-20`, "ride");
  const opened = await stateOf();
  expect(opened.yaw, "the address's yaw is kept when the ride starts").toBe(-21);
  expect(opened.tilt, "and its tilt").toBe(-20);
  const plain = await (async () => {
    const other = await page.context().newPage();
    await other.addInitScript(COUNT_SCRIPT);
    await other.goto(`/chikyu-earth/?look=space&${FIXED}&sats=stations&ride=iss`);
    await other.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    await other.waitForTimeout(6000);
    const shot = await other.locator(GLOBE).screenshot();
    await other.close();
    return shot;
  })();
  const turned = await picture(page);
  expect(await changedShare(page, plain, turned), "the turn from the address shows in the picture").toBeGreaterThan(0.05);

  await dragBy(page, page.locator(GLOBE), 40, -20);
  await settle(page, 1500);
  const dragged = await stateOf();
  expect(dragged.yaw).toBeGreaterThan(-21 + 10);
  const url = new URL(page.url());
  expect(Number(url.searchParams.get("yaw")), "the address follows the drag").toBeCloseTo(dragged.yaw, 0);
  expect(Number(url.searchParams.get("tilt"))).toBeCloseTo(dragged.tilt, 0);
  const before = await picture(page);

  const again = await page.context().newPage();
  await again.addInitScript(COUNT_SCRIPT);
  await again.goto(url.href);
  await again.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  await again.waitForTimeout(6000);
  const after = await again.locator(GLOBE).screenshot();
  expect(await changedShare(again, before, after), "the address brings the same picture back").toBeLessThan(0.03);
  await again.close();
});

test("an address with a ride and no look opens riding, and the ride can be dragged", async ({ page }) => {
  // the address as it was reported, with the moment fixed so the picture holds still
  await open(page, `sats=stations%2Cstarlink&ride=iss&tilt=-20&yaw=-21&speed=fast&hide=Stadiums%2CCities&graticule=1&time=2026-11-03T07:30Z`, "ride");
  await page.locator("chikyu-space").evaluate((el) => Reflect.set(el, "speed", 0));
  await settle(page, 1000);
  const right = await moved(page, () => dragBy(page, page.locator(GLOBE), 30, 0));
  expect(right.x, `a drag right moves the ground right (moved ${right.x},${right.y})`).toBeGreaterThan(MIN);
});
