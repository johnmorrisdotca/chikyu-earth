// The family's gesture check (kazoku-ui's checkGestures) on the realistic Earth and the space view, in the demo, whose bar owns the hands (the embed frame's own hands: see gestures.demo.ts).
// Software GL in Chromium, like the rest of the 3D tests.
import { checkGestures } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test } from "@playwright/test";

const NOV2 = "2026-11-02T14:00Z";
const VIEWS = [
  { look: "realistic", tag: "chikyu-earth-realistic" },
  { look: "space", tag: "chikyu-space" },
] as const;

// The space view's camera always looks at the chosen body and has no pan (its setView takes yaw, tilt and zoom), so it says so for each of the moves; the rest it answers.
const NO_PAN = "the space view has no pan: the camera looks at the chosen body, and Look at, Go to and Ride along move it";
const LACKS: Record<string, Record<string, string>> = {
  realistic: {},
  space: { "wheel-pan": NO_PAN, "ctrl-drag-pan": NO_PAN, "space-drag-pan": NO_PAN, "middle-drag-pan": NO_PAN, "right-drag-pan": NO_PAN, "touch-pan": NO_PAN, picture: "the picture check follows the moves, and this view has none" },
};

for (const { look, tag } of VIEWS) {
  test(`the demo's ${look} view answers every gesture it has`, async ({ page }) => {
    // as on the full-screen page: thirteen gestures with screenshots drawn in software GL took up to 39 s of the 60 s in CI, and a run cut off there reads as failed gestures
    test.setTimeout(240_000);
    await page.goto(`/chikyu-earth/?look=${look}&time=${NOV2}&speed=0&center=-100,40`);
    await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
    const report = await checkGestures(page, tag, { lacks: LACKS[look] });
    expect(report.filter((r) => r.result === "lacks").map((r) => r.gesture)).toEqual(Object.keys(LACKS[look]));
  });
}
