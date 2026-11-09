// The drag rule, checked with the family's shared helper (e2e/ground.mjs, kazoku-ui's templates/e2e-ground.mjs, copied unchanged): in every look the ground follows the hand, the arrow keys agree
// and Auto-turn goes west to east; on the flat and the realistic globe (exact grab) the touched point stays under the pointer.
// Each rule is its own test: every check takes a few pictures of the view, and one test holding all of them used most of its minute on a quiet machine.
// The view is centred on the equator: the pointer turns the globe by its radius, so a point at latitude 31 moves only cos(31) of the drag (25 of 29 pixels), which sat within a pixel of the 20% tolerance.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT } from "./gl.ts";
import { checkExactGrab, checkFollowsTheHand, movedBy } from "./ground.mjs";

test.describe.configure({ mode: "serial" });

const CONTROLS = "kazoku-view-controls";
const LOOKS = [
  { look: "line", ready: "chikyu-earth svg", grab: 209 },
  { look: "thick", ready: "chikyu-earth svg", grab: 209 },
  { look: "realistic", ready: "chikyu-earth-realistic[data-state=live]", grab: 193 },
  { look: "space", ready: "chikyu-space[data-state=live]", grab: 0 },
] as const;

async function open(page: Page, look: string, ready: string): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=${look}&time=2026-11-03T07:30Z&speed=0&center=25,0`);
  await page.locator(ready).first().waitFor({ timeout: 90_000 });
  await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
  await page.locator("#globe").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
}

/** Auto-turn goes west to east: turned by a fixed angle (read from the controller, never from a stopwatch), the ground has moved right, however slowly this machine draws. */
async function autoTurnGoesRight(page: Page): Promise<void> {
  const turn = await movedBy(page, page.locator("#globe"), async () => {
    await page.locator(CONTROLS).evaluate(
      (el) =>
        new Promise<void>((resolve) => {
          const controls = el as unknown as { controller: { speed: number; state: { yaw: number }; play(): void }; pause(): void };
          const start = controls.controller.state.yaw;
          controls.controller.speed = 6;
          controls.controller.play();
          const wait = (): void => {
            if (Math.abs(controls.controller.state.yaw - start) < 9) return void requestAnimationFrame(wait);
            controls.pause();
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          };
          wait();
        }),
    );
  });
  expect(turn.x, `Auto-turn moves the ground right (moved ${turn.x},${turn.y})`).toBeGreaterThan(8);
}

for (const { look, ready, grab } of LOOKS) {
  test(`${look}: a drag and the arrow keys move the ground with the hand`, async ({ page }) => {
    await open(page, look, ready);
    await checkFollowsTheHand(page, { view: "#globe", controls: CONTROLS, autoTurn: false });
  });

  test(`${look}: Auto-turn moves the ground west to east`, async ({ page }) => {
    await open(page, look, ready);
    await autoTurnGoesRight(page);
  });

  test(`${look}: ${grab ? "the touched point stays under the pointer" : "the fixed angle is kept"}`, async ({ page }) => {
    await open(page, look, ready);
    if (grab) {
      const radius = await page.locator("#globe").evaluate((el) => el.ownerDocument.querySelector("kazoku-view-controls")!.getAttribute("grab-radius"));
      expect(radius, "the controls carry the globe's radius").not.toBeNull();
      await checkExactGrab(page, { view: "#globe", radius: grab });
    } else {
      expect(await page.locator(CONTROLS).getAttribute("grab-radius"), "the space view keeps the fixed angle").toBeNull();
    }
  });
}
