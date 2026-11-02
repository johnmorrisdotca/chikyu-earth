// A rate gate for the draw: asks that come faster than `minMs` apart become one, and the last ask is never lost. Pure, with its own clock.

export interface Timers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  now(): number;
}

export const browserTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => performance.now(),
};

/**
 * A rate gate for the draw: what `createGate` returns.
 *
 * @example
 * ```ts
 * import { createGate, type Gate } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const gate: Gate = createGate(33, () => console.log("draw"));
 * gate.request();
 * gate.cancel();
 * ```
 */
export interface Gate {
  /** Ask for `fire` to run: now if the last run was `minMs` ago or more, else once, when that time has passed. */
  request(): void;
  /** Forget a run that is waiting. */
  cancel(): void;
  /** Change the least time between runs (a lower frame rate on a battery). */
  setMinMs(minMs: number): void;
}

/**
 * A rate gate for the draw: asks that come faster than `minMs` apart become one, and the last ask is never lost, so a burst of changes costs one draw.
 *
 * @param minMs - The least time between two runs, in milliseconds.
 * @param fire - What to run.
 * @param timers - A clock and timers; the browser's by default (a test passes its own).
 * @returns The gate: `request()` to ask, `cancel()` to forget a waiting run, `setMinMs()` to change the pace.
 *
 * @example
 * ```ts
 * import { createGate } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const gate = createGate(30, () => console.log("drawn"));
 * gate.request();
 * gate.request();
 * gate.request();
 * gate.cancel();
 * ```
 */
export function createGate(minMs: number, fire: () => void, timers: Timers = browserTimers): Gate {
  let least = minMs;
  let last = -Infinity;
  let waiting: unknown;
  const run = (): void => {
    waiting = undefined;
    last = timers.now();
    fire();
  };
  return {
    request() {
      if (waiting !== undefined) return;
      const wait = last + least - timers.now();
      if (wait <= 0) run();
      else waiting = timers.set(run, wait);
    },
    cancel() {
      if (waiting !== undefined) timers.clear(waiting);
      waiting = undefined;
    },
    setMinMs(value) {
      least = value;
    },
  };
}

/**
 * The frame rate cap for this device: `maxFps` (30 by default), lower on a small device.
 *
 * @param maxFps - The most frames a second to allow.
 * @param device - `deviceMemory` in gigabytes and `hardwareConcurrency` in cores, from `navigator`; either may be left out.
 * @returns The frames a second to allow, at least 1; 20 at most on a small device.
 *
 * @example
 * ```ts
 * import { frameCap } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(frameCap(), frameCap(30, { deviceMemory: 1 }));
 * ```
 */
export function frameCap(maxFps = 30, device: { deviceMemory?: number; hardwareConcurrency?: number } = {}): number {
  const small = (device.deviceMemory !== undefined && device.deviceMemory <= 2) || (device.hardwareConcurrency !== undefined && device.hardwareConcurrency <= 2);
  return Math.max(1, small ? Math.min(maxFps, 20) : maxFps);
}
