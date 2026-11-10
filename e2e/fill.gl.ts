// The 3D looks fill their frame edge to edge, in any shape of it (MODULES-848): no square inside the green felt, no letterbox, nothing cut. The element's box is the frame's box, and so is the canvas inside it,
// for the realistic Earth and the space view, in the demo's panel at desk and phone sizes, in Wide, and in the embed frame.
import { expect, test, type Page } from "@playwright/test";
import { settle } from "./gl.ts";

const LOOKS = [
  { look: "realistic", tag: "chikyu-earth-realistic" },
  { look: "space", tag: "chikyu-space" },
] as const;
const TIME = "2026-11-02T14:00Z";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const boxOf = (page: Page, selector: string): Promise<Box> => page.locator(selector).evaluate((el) => el.getBoundingClientRect().toJSON() as Box);
/** The canvas the shared renderer drew into, wherever the element keeps it. */
const canvasBox = (page: Page, tag: string): Promise<Box | null> =>
  page.locator(tag).evaluate((el) => {
    const canvas = el.shadowRoot?.querySelector("canvas") ?? el.querySelector("canvas") ?? document.querySelector("canvas");
    return canvas ? (canvas.getBoundingClientRect().toJSON() as Box) : null;
  });
const same = (a: Box, b: Box, what: string): void => {
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(a[key] - b[key]), `${what}: ${key} ${a[key]} against ${b[key]}`).toBeLessThanOrEqual(1);
};

for (const { look, tag } of LOOKS) {
  for (const layout of [
    { name: "desk 1440", width: 1440, height: 900, query: "" },
    { name: "phone 390", width: 390, height: 844, query: "" },
    { name: "Wide at 1440", width: 1440, height: 900, query: "&wide=on" },
  ]) {
    test(`${look} in the demo's panel at ${layout.name}: the element and its canvas are the felt's whole box`, async ({ page }) => {
      await page.setViewportSize({ width: layout.width, height: layout.height });
      await page.goto(`/chikyu-earth/?look=${look}&time=${TIME}&speed=0${layout.query}`);
      await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
      await settle(page, 1200);
      const felt = await boxOf(page, ".earth-stage");
      const element = await boxOf(page, tag);
      same(element, felt, "the element is the felt's box");
      expect(element.width, "wider than the old 420 square where there is room").toBeGreaterThan(layout.width < 600 ? 300 : 430);
      const canvas = await canvasBox(page, tag);
      if (canvas) same(canvas, element, "the canvas is the element's box");
    });
  }

  for (const frame of [
    { name: "a wide frame", width: 640, height: 360 },
    { name: "a tall frame", width: 360, height: 640 },
  ]) {
    test(`${look} in the embed frame, ${frame.name}: the element is the whole frame`, async ({ page }) => {
      await page.setViewportSize({ width: frame.width, height: frame.height });
      await page.goto(`/chikyu-earth/embed.html?look=${look}&time=${TIME}&speed=0`);
      await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
      await settle(page, 1200);
      same(await boxOf(page, tag), { x: 0, y: 0, width: frame.width, height: frame.height }, "the element is the viewport");
    });
  }
}
