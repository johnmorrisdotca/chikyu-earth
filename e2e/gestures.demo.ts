// The family's gesture check (kazoku-ui's checkGestures) on the line globe: the demo's bar owns the hands. Every gesture is done with a real
// mouse, key or two fingers and must change the view as the family's rule says; the 3D looks are in gestures.gl.ts.
import { checkGestures } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test } from "@playwright/test";

test.beforeEach(({ viewport }) => {
  test.skip((viewport?.width ?? 1280) <= 640, "the gestures are the mouse's and the keyboard's; the phone is checked by the readout and pinch tests");
});

test("the demo's line globe answers every gesture", async ({ page }) => {
  await page.goto("/chikyu-earth/?look=line");
  await expect(page.locator("chikyu-earth svg").first()).toBeVisible();
  const report = await checkGestures(page, "#earth", { picture: "#globe" });
  expect(report.filter((r) => r.result === "lacks")).toEqual([]);
});
