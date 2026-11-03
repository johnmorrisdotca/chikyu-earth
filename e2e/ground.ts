// Which way the ground moved between two pictures of a view, found by sliding the middle of the first over the second. Not a test file.
import type { Locator, Page } from "@playwright/test";

export interface Shift {
  /** Pixels the ground moved to the right (negative: to the left). */
  x: number;
  /** Pixels the ground moved down (negative: up). */
  y: number;
  /** How different the pictures still are at that shift, from 0 (the same) up; large when the pictures have nothing in common. */
  error: number;
}

/** Slide the middle half of `before` over `after`, up to `reach` pixels each way, and say where the two agree best. */
export async function groundShift(page: Page, before: Buffer, after: Buffer, reach = 60): Promise<Shift> {
  return page.evaluate(
    async ([a, b, limit]) => {
      const load = async (data: string): Promise<ImageData> => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const p = await load(a as string);
      const q = await load(b as string);
      const w = p.width;
      const h = p.height;
      const grey = (d: ImageData, x: number, y: number): number => {
        const i = (y * w + x) * 4;
        return d.data[i]! * 0.3 + d.data[i + 1]! * 0.59 + d.data[i + 2]! * 0.11;
      };
      const x0 = Math.round(w * 0.3);
      const x1 = Math.round(w * 0.7);
      const y0 = Math.round(h * 0.3);
      const y1 = Math.round(h * 0.7);
      let best = { x: 0, y: 0, error: Infinity };
      for (let dy = -(limit as number); dy <= (limit as number); dy += 1) {
        for (let dx = -(limit as number); dx <= (limit as number); dx += 1) {
          let sum = 0;
          let n = 0;
          for (let y = y0; y < y1; y += 3) {
            const ys = y + dy;
            if (ys < 0 || ys >= h) continue;
            for (let x = x0; x < x1; x += 3) {
              const xs = x + dx;
              if (xs < 0 || xs >= w) continue;
              sum += Math.abs(grey(p, x, y) - grey(q, xs, ys));
              n += 1;
            }
          }
          const error = n === 0 ? Infinity : sum / n;
          if (error < best.error) best = { x: dx, y: dy, error };
        }
      }
      return best;
    },
    [before.toString("base64"), after.toString("base64"), reach] as const,
  );
}

/** A real pointer drag from the middle of `target` by `dx` and `dy` pixels, in steps, with the pointer left up at the end. */
export async function dragBy(page: Page, target: Locator, dx: number, dy: number): Promise<void> {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
  await page.mouse.up();
}

/** The share of the picture's pixels that differ clearly between two screenshots, from 0 to 1. */
export async function changedShare(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ([a, b]) => {
      const load = async (data: string): Promise<Uint8ClampedArray> => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const p = await load(a as string);
      const q = await load(b as string);
      let differ = 0;
      for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i]! - q[i]!) + Math.abs(p[i + 1]! - q[i + 1]!) + Math.abs(p[i + 2]! - q[i + 2]!) > 40) differ += 1;
      return differ / (p.length / 4);
    },
    [before.toString("base64"), after.toString("base64")] as const,
  );
}
