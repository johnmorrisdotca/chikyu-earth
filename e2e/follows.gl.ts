// The drag rule, checked with the family's shared helper (e2e/ground.mjs, kazoku-ui's templates/e2e-ground.mjs, copied unchanged): in every look the ground follows the hand, the arrow keys agree
// and Auto-turn goes west to east; on the flat and the realistic globe (exact grab) the touched point stays under the pointer.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT } from "./gl.ts";
import { checkExactGrab, checkFollowsTheHand } from "./ground.mjs";

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
  await page.goto(`/chikyu-earth/?look=${look}&time=2026-11-03T07:30Z&speed=0&center=25,-31`);
  await page.locator(ready).first().waitFor({ timeout: 90_000 });
  await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
  await page.locator("#globe").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
}

for (const { look, ready, grab } of LOOKS) {
  test(`${look}: the ground follows the hand${grab ? " and the touched point stays under the pointer" : ""}`, async ({ page }) => {
    await open(page, look, ready);
    await checkFollowsTheHand(page, { view: "#globe", controls: CONTROLS, autoTurn: "right" });
    if (grab) {
      const radius = await page.locator("#globe").evaluate((el) => el.ownerDocument.querySelector("kazoku-view-controls")!.getAttribute("grab-radius"));
      expect(radius, "the controls carry the globe's radius").not.toBeNull();
      await checkExactGrab(page, { view: "#globe", radius: grab });
    } else {
      expect(await page.locator(CONTROLS).getAttribute("grab-radius"), "the space view keeps the fixed angle").toBeNull();
    }
  });
}
