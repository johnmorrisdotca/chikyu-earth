// freezeClock (e2e/gl.ts) reads the page's time and then asks for the pause a margin ahead of it; on a loaded machine the clock has run past a short margin by then and Playwright answers "Cannot fast-forward to the past"
// (MODULES-1064, 1178). The helper must read again and ask with a wider margin, give any other answer straight back, and say so when no margin was enough. A page that is only the two calls it makes.
import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "@playwright/test";
import { freezeClock } from "../e2e/gl.ts";

const PAST = "Error: clock.pauseAt: Cannot fast-forward to the past";
/** A page whose clock has run `lag` ms past each reading by the time the pause is asked for. */
function pageWith(lag: number, other?: string): { page: Page; asked: number[]; reads: number } {
  const state = { asked: [] as number[], reads: 0 };
  let now = 1_000_000;
  const page = {
    evaluate: async (): Promise<number> => {
      state.reads += 1;
      return now;
    },
    clock: {
      pauseAt: async (date: Date): Promise<void> => {
        const ahead = date.getTime() - now;
        state.asked.push(ahead);
        now += lag;
        if (other) throw new Error(other);
        if (ahead < lag) throw new Error(PAST);
      },
    },
  } as unknown as Page;
  return { page, asked: state.asked, get reads() { return state.reads; } };
}

test("a pause that is in time is asked for once", async () => {
  const fake = pageWith(10);
  await freezeClock(fake.page);
  assert.equal(fake.asked.length, 1);
  assert.equal(fake.reads, 1);
});

test("a clock that ran past the first margin is read again and asked with a wider one, until it is in time", async () => {
  const fake = pageWith(5_000);
  await freezeClock(fake.page);
  assert.equal(fake.asked.length, 2, "the 3 s margin was too short, the 12 s one was not");
  assert.ok(fake.asked[1]! > fake.asked[0]!);
  assert.equal(fake.reads, 2, "the time is read again for each ask");
});

test("any other answer is given back at once, and a clock that outruns every margin says so", async () => {
  const other = pageWith(0, "clock.pauseAt: something else");
  await assert.rejects(() => freezeClock(other.page), /something else/);
  assert.equal(other.asked.length, 1);
  const never = pageWith(1_000_000);
  await assert.rejects(() => freezeClock(never.page), /kept running past/);
  assert.equal(never.asked.length, 3);
});
