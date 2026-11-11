// The time the page shows is the reader's local time, in any zone: the date box of the demo is checked against the page's own `Date`, worked out in the page and never parsed in the runner, in two zones, one with a daylight-saving
// change in the autumn of 2026 (Vancouver, where Node and Chromium can disagree on the offset by an hour) and one with none (Tokyo). Instants either side of each change are included. CI runs in UTC, so without this a mismatch only shows on a Mac.
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({ browserName }, info) => {
  test.skip(browserName !== "chromium" || info.project.name !== "chromium-desk", "the zones are set on the desk Chromium; the page's time code is the same in every browser");
});
test.use({ reducedMotion: "reduce" });

/** Instants in UTC: the middle of a day, and either side of the changes of North America's clocks in 2026 (8 March at 10:00 UTC for Vancouver, 1 November at 09:00 UTC). */
const INSTANTS = ["2026-11-10T12:00:00Z", "2026-06-21T12:00:00Z", "2026-03-08T09:30:00Z", "2026-03-08T10:30:00Z", "2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z"];

/** The date box, and what the page's own `Date` says that moment is in its zone, to the minute, as the box writes it. */
async function readBox(page: Page, instant: string): Promise<{ box: string; expected: string; offset: number }> {
  await page.goto(`/chikyu-earth/?look=realistic&time=${instant.replace(/:00Z$/, "Z")}&speed=0`);
  await expect.poll(() => page.locator("#when").inputValue(), { timeout: 30_000 }).not.toBe("");
  return page.evaluate((iso) => {
    const d = new Date(iso);
    const pad = (n: number): string => String(n).padStart(2, "0");
    const box = (document.querySelector("#when") as HTMLInputElement).value;
    return { box, expected: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`, offset: d.getTimezoneOffset() };
  }, instant);
}

for (const zone of ["America/Vancouver", "Asia/Tokyo"]) {
  test.describe(zone, () => {
    test.use({ timezoneId: zone });

    test("the date box shows the page's own local time for an instant, either side of each change of the clocks", async ({ page }) => {
      for (const instant of INSTANTS) {
        const read = await readBox(page, instant);
        expect(read.box, `${instant} in ${zone}`).toBe(read.expected);
      }
    });

    test("the zone is really set, and the hour on the box is the instant's hour in that offset, whichever offset this browser's zone data gives", async ({ page }) => {
      const read = await readBox(page, "2026-11-10T12:00:00Z");
      // Tokyo has no change of the clocks: 9 hours ahead. Vancouver is 7 or 8 behind: which of the two this browser says for the middle of November 2026 is its own zone data's so both are allowed and the box must agree with whichever it is
      if (zone === "Asia/Tokyo") expect(read.offset).toBe(-540);
      else expect([420, 480]).toContain(read.offset);
      const minutes = 12 * 60 - read.offset;
      const hour = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
      expect(read.box.slice(11)).toBe(`${hour}:00`);
    });
  });
}
