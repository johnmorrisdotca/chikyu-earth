// The painted trail: one fixed equirectangular buffer. A frame stamps only the ground the satellite has just crossed.
// The picture fades a stamp by the time stored in it, so nothing is rebuilt at rest and the buffer never grows.
import type { Satellites } from "../satellites/types.ts";
import { coverageAngleRad, groundUnder, PAINT_H, PAINT_W, paintPixel, splitDateLine, trackSteps, type LonLat } from "./math.ts";

export type PaintLength = "1d" | "1w" | "1m";
export type PaintSwath = "track" | "coverage";

export interface PaintSpec {
  /** A NORAD catalogue number, or `group:index` of a group set on the element. */
  id: string;
  /** How long the trail is kept, in simulated time. `1d` when left out. */
  length?: PaintLength;
  /** `track` paints the point under the satellite (the default). `coverage` paints where it is at least 10° above the horizon. */
  swath?: PaintSwath;
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const LENGTH_MS: Record<PaintLength, number> = { "1d": DAY, "1w": 7 * DAY, "1m": 30 * DAY };

export const paintLengthOf = (length: PaintLength | undefined): PaintLength => (length === "1w" || length === "1m" ? length : "1d");
export const paintSwathOf = (swath: PaintSwath | undefined): PaintSwath => (swath === "coverage" ? "coverage" : "track");

/** Minutes since the epoch, in 16 bits: the trail is at most a month, and 16 bits hold 45 days. */
export const paintMinute = (ms: number): number => Math.round(ms / MINUTE) & 0xffff;

export interface PaintState {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** Stamps whose alpha is set. Clear puts it back to 0. */
  readonly pixels: number;
  readonly on: boolean;
  readonly length: PaintLength;
  readonly swath: PaintSwath;
  /** The id now painted, or "" when painting is off. */
  readonly id: string;
  /** Minutes of simulated time the shader keeps. */
  readonly spanMinutes: number;
  set(spec: PaintSpec | null): void;
  clear(): void;
  /**
   * Stamp the ground crossed since the last call. `sample` is the satellite at a moment, or null when it cannot be placed.
   * Returns true when `data` changed and the picture should upload it. At rest, or with painting off, it returns false.
   * `periodMs` is one trip of the satellite round the Earth: samples are taken often enough that the line between two follows the orbit, however fast the clock. A clock run backwards lays down the older end of the length that it uncovers.
   */
  step(ms: number, sample: (ms: number) => (LonLat & { heightKm: number }) | null, periodMs?: number): boolean;
}

const write = (data: Uint8Array, x: number, y: number, minute: number): boolean => {
  if (x < 0 || y < 0 || x >= PAINT_W || y >= PAINT_H) return false;
  const i = (y * PAINT_W + x) * 4;
  const fresh = data[i + 3] === 0;
  data[i] = (minute >> 8) & 255;
  data[i + 1] = minute & 255;
  data[i + 2] = 255;
  data[i + 3] = 255;
  return fresh;
};

const stampDot = (data: Uint8Array, point: LonLat, minute: number, radius: number): number => {
  const at = paintPixel(point.lon, point.lat);
  let added = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      if (write(data, at.x + dx, at.y + dy, minute)) added += 1;
    }
  }
  return added;
};

const stampLine = (data: Uint8Array, a: LonLat, b: LonLat, minute: number): number => {
  const from = paintPixel(a.lon, a.lat);
  const to = paintPixel(b.lon, b.lat);
  if (Math.abs(to.x - from.x) > PAINT_W / 2) return 0;
  let added = 0;
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (write(data, x, y, minute)) added += 1;
    if (write(data, x + 1, y, minute)) added += 1;
    if (x === to.x && y === to.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return added;
};

const RAD = Math.PI / 180;

/** Every pixel within `theta` radians of `point`, row by row: each row's half-width in longitude is worked out, and a cap over the date line wraps to the other edge. */
const stampCap = (data: Uint8Array, point: LonLat, theta: number, minute: number): number => {
  if (!(theta > 0)) return stampDot(data, point, minute, 1);
  const deg = theta / RAD;
  const sin1 = Math.sin(point.lat * RAD);
  const cos1 = Math.cos(point.lat * RAD);
  const cosTheta = Math.cos(theta);
  const y0 = paintPixel(0, Math.min(90, point.lat + deg)).y;
  const y1 = paintPixel(0, Math.max(-90, point.lat - deg)).y;
  let added = 0;
  for (let y = y0; y <= y1; y += 1) {
    const lat = (90 - ((y + 0.5) / PAINT_H) * 180) * RAD;
    const denominator = cos1 * Math.cos(lat);
    const need = cosTheta - sin1 * Math.sin(lat);
    let half: number;
    if (denominator < 1e-9) {
      if (need > 0) continue;
      half = 180;
    } else {
      const ratio = need / denominator;
      if (ratio > 1) continue;
      half = ratio <= -1 ? 180 : Math.acos(ratio) / RAD;
    }
    const first = Math.floor(((point.lon - half + 180) / 360) * PAINT_W);
    const last = Math.floor(((point.lon + half + 180) / 360) * PAINT_W);
    if (last - first >= PAINT_W - 1) {
      for (let x = 0; x < PAINT_W; x += 1) if (write(data, x, y, minute)) added += 1;
    } else {
      for (let x = first; x <= last; x += 1) if (write(data, ((x % PAINT_W) + PAINT_W) % PAINT_W, y, minute)) added += 1;
    }
  }
  return added;
};

const stampGround = (data: Uint8Array, swath: PaintSwath, ground: LonLat & { heightKm: number }, previous: LonLat | null, minute: number): { added: number; at: LonLat } => {
  const theta = swath === "coverage" ? coverageAngleRad(ground.heightKm) : 0;
  if (swath === "coverage" && previous === null) return { added: stampCap(data, ground, theta, minute), at: ground };
  if (swath === "track" && previous === null) return { added: stampDot(data, ground, minute, 1), at: ground };
  // a line is made of steps 0.4 of a degree long; a swath of caps that overlap, a step of about seven tenths of the cap's radius
  const points = trackSteps(previous!, ground, swath === "coverage" ? Math.max(1, (theta / RAD) * 0.7) : 0.4);
  let added = 0;
  let cursor: LonLat = previous!;
  for (const point of points) {
    if (swath === "coverage") added += stampCap(data, point, theta, minute);
    else for (const [from, to] of splitDateLine(cursor, point)) added += stampLine(data, from, to, minute);
    cursor = point;
  }
  return { added, at: cursor };
};

/** A stamp's age in minutes, from the 16 bits it holds. */
const ageOf = (then: number, now: number): number => {
  let age = now - then;
  if (age < -32768) age += 65536;
  if (age > 32767) age -= 65536;
  return age;
};

/** The longest gap between two samples that a line may leap: a twentieth of a trip, and between 30 seconds and four minutes. The samples are never more than a third of a trip apart, however many that takes. */
const MAX_GAP = 240_000;
const MIN_GAP = 30_000;
const FRAME_SAMPLES = 600;
const REBUILD_SAMPLES = { track: 4000, coverage: 1500 };
const gapOf = (periodMs: number | undefined): number => (periodMs !== undefined && periodMs > 0 ? Math.max(MIN_GAP, Math.min(MAX_GAP, periodMs / 20)) : 20_000);

export function createPaintState(): PaintState {
  // the two megabytes are taken when the first satellite is painted and given back by `clear`, not made with the view
  let buffer: Uint8Array | null = null;
  const grab = (): Uint8Array => (buffer ??= new Uint8Array(PAINT_W * PAINT_H * 4));
  let spec: { id: string; length: PaintLength; swath: PaintSwath } | null = null;
  let pixels = 0;
  let lastMs = Number.NaN;
  /** The last point stamped and the way the clock was going then, so a line carries on from it. */
  let previous: LonLat | null = null;
  let heading = 0;
  /** The buffer was emptied since the last step: the picture must be sent even if nothing new was stamped. */
  let stale = false;
  const reset = (): void => {
    buffer?.fill(0);
    pixels = 0;
    lastMs = Number.NaN;
    previous = null;
    heading = 0;
    stale = true;
  };
  /** Take out what has fallen out of the length (or is later than the clock now says). */
  const dropOld = (data: Uint8Array, now: number, span: number): boolean => {
    let dropped = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const then = ((data[i] ?? 0) << 8) | (data[i + 1] ?? 0);
      const age = ageOf(then, now);
      // a minute of slack at each end, for the rounding of the stamp's minute
      if (age > span + 1 || age < -1) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
        pixels -= 1;
        dropped = true;
      }
    }
    return dropped;
  };
  const self = {
    get data() {
      return grab();
    },
    width: PAINT_W,
    height: PAINT_H,
    get pixels() {
      return pixels;
    },
    get on() {
      return spec !== null;
    },
    get length(): PaintLength {
      return spec?.length ?? "1d";
    },
    get swath(): PaintSwath {
      return spec?.swath ?? "track";
    },
    get id() {
      return spec?.id ?? "";
    },
    get spanMinutes() {
      return LENGTH_MS[spec?.length ?? "1d"] / MINUTE;
    },
    set(next: PaintSpec | null) {
      if (!next) {
        self.clear();
        return;
      }
      const id = String(next.id);
      const length = paintLengthOf(next.length);
      const swath = paintSwathOf(next.swath);
      if (spec && spec.id === id && spec.length === length && spec.swath === swath) return;
      reset();
      spec = { id, length, swath };
    },
    clear() {
      reset();
      spec = null;
      buffer = null;
    },
    step(ms: number, sample: (ms: number) => (LonLat & { heightKm: number }) | null, periodMs?: number) {
      if (!spec) {
        const upload = stale;
        stale = false;
        return upload;
      }
      if (!Number.isFinite(ms)) return false;
      if (Number.isFinite(lastMs) && ms === lastMs) {
        const upload = stale;
        stale = false;
        return upload;
      }
      const data = grab();
      const length = LENGTH_MS[spec.length];
      const gap = gapOf(periodMs);
      let dirty = stale;
      stale = false;
      /** Stamp the satellite's place at each of `times`, one line from the one before. */
      const lay = (times: number[], way: number): void => {
        if (way !== heading) previous = null;
        heading = way;
        for (const at of times) {
          const ground = sample(at);
          if (!ground) {
            previous = null;
            continue;
          }
          const stamped = stampGround(data, spec!.swath, ground, previous, paintMinute(at));
          pixels += stamped.added;
          previous = stamped.at;
          dirty = true;
        }
      };
      const between = (from: number, to: number, cap: number): number[] => {
        const span = Math.abs(to - from);
        const count = Math.max(Math.min(cap, Math.max(1, Math.ceil(span / gap))), periodMs === undefined ? 1 : Math.ceil(span / (periodMs / 3)));
        return Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count);
      };
      if (!Number.isFinite(lastMs) || Math.abs(ms - lastMs) > length) {
        // the first moment, or a jump: the whole length is laid down again, oldest first
        data.fill(0);
        pixels = 0;
        previous = null;
        heading = 1;
        lay(between(ms - length, ms, REBUILD_SAMPLES[spec.swath]), 1);
      } else if (ms > lastMs) {
        lay(between(lastMs, ms, FRAME_SAMPLES), 1);
      } else {
        // backwards: the newer end falls away below, and the older end, which the clock has just uncovered, is laid down
        lay(between(lastMs - length, ms - length, FRAME_SAMPLES), -1);
      }
      if (dropOld(data, paintMinute(ms), length / MINUTE)) dirty = true;
      lastMs = ms;
      return dirty;
    },
  };
  return self;
}

/** The satellite `id` names, in the groups now set: a NORAD number, or `group:index`. */
export function findPainted(groups: Iterable<[string, { satellites: Satellites }]>, id: string): { satellites: Satellites; index: number } | null {
  const cut = id.indexOf(":");
  if (cut > 0) {
    for (const [name, group] of groups) {
      const index = Number(id.slice(cut + 1));
      if (name === id.slice(0, cut) && index >= 0 && index < group.satellites.count) return { satellites: group.satellites, index };
    }
  }
  const norad = Number(id);
  if (!Number.isFinite(norad)) return null;
  for (const [, group] of groups) {
    const index = group.satellites.sets.findIndex((set) => set.NORAD_CAT_ID === norad);
    if (index >= 0) return { satellites: group.satellites, index };
  }
  return null;
}

const scratch = new Float64Array(6);

/** The ground under the painted satellite at `ms`, or null when it cannot be placed. */
export function paintedGround(groups: Iterable<[string, { satellites: Satellites }]>, id: string, ms: number): (LonLat & { heightKm: number }) | null {
  const found = findPainted(groups, id);
  if (!found || !found.satellites.exact(found.index, ms, scratch)) return null;
  return groundUnder(scratch[0]!, scratch[1]!, scratch[2]!, ms);
}

/** One trip of the painted satellite round the Earth, in milliseconds, from its mean motion; undefined when it is not found. */
export function paintedPeriod(groups: Iterable<[string, { satellites: Satellites }]>, id: string): number | undefined {
  const found = findPainted(groups, id);
  const motion = found?.satellites.sets[found.index]?.MEAN_MOTION;
  return motion !== undefined && motion > 0 ? DAY / motion : undefined;
}
