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

export interface Gate {
  /** Ask for `fire` to run: now if the last run was `minMs` ago or more, else once, when that time has passed. */
  request(): void;
  /** Forget a run that is waiting. */
  cancel(): void;
  /** Change the least time between runs (a lower frame rate on a battery). */
  setMinMs(minMs: number): void;
}

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

/** The frame rate cap for this device: `maxFps` (30 by default), lower on a small device. */
export function frameCap(maxFps = 30, device: { deviceMemory?: number; hardwareConcurrency?: number } = {}): number {
  const small = (device.deviceMemory !== undefined && device.deviceMemory <= 2) || (device.hardwareConcurrency !== undefined && device.hardwareConcurrency <= 2);
  return Math.max(1, small ? Math.min(maxFps, 20) : maxFps);
}
