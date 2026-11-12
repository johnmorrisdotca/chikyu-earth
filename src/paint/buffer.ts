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
   */
  step(ms: number, sample: (ms: number) => (LonLat & { heightKm: number }) | null): boolean;
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

const angular = (a: LonLat, b: LonLat): number => {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};

const stampCap = (data: Uint8Array, point: LonLat, theta: number, minute: number): number => {
  if (!(theta > 0)) return stampDot(data, point, minute, 1);
  const deg = theta * 180 / Math.PI;
  const cosLat = Math.max(0.15, Math.cos(point.lat * Math.PI / 180));
  const dLon = Math.min(180, deg / cosLat);
  const pole = Math.abs(point.lat) + deg >= 90;
  const west = pole ? -180 : point.lon - dLon;
  const east = pole ? 180 : point.lon + dLon;
  const south = Math.max(-90, point.lat - deg);
  const north = Math.min(90, point.lat + deg);
  const a = paintPixel(west, north);
  const b = paintPixel(east, south);
  let added = 0;
  const x0 = pole ? 0 : Math.max(0, Math.min(a.x, b.x));
  const x1 = pole ? PAINT_W - 1 : Math.min(PAINT_W - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const y1 = Math.min(PAINT_H - 1, Math.max(a.y, b.y));
  for (let y = y0; y <= y1; y += 1) {
    const lat = 90 - (y + 0.5) / PAINT_H * 180;
    for (let x = x0; x <= x1; x += 1) {
      let lon = (x + 0.5) / PAINT_W * 360 - 180;
      if (!pole && west < -180) lon = lon > 0 ? lon - 360 : lon;
      if (angular(point, { lon, lat }) <= theta && write(data, x, y, minute)) added += 1;
    }
  }
  return added;
};

const stampGround = (data: Uint8Array, swath: PaintSwath, ground: LonLat & { heightKm: number }, previous: LonLat | null, minute: number): { added: number; at: LonLat } => {
  if (swath === "coverage") return { added: stampCap(data, ground, coverageAngleRad(ground.heightKm), minute), at: ground };
  if (!previous) return { added: stampDot(data, ground, minute, 1), at: ground };
  let added = 0;
  let cursor = previous;
  for (const point of trackSteps(previous, ground, 0.4)) {
    for (const [from, to] of splitDateLine(cursor, point)) added += stampLine(data, from, to, minute);
    cursor = point;
  }
  return { added, at: cursor };
};

export function createPaintState(): PaintState {
  const data = new Uint8Array(PAINT_W * PAINT_H * 4);
  let spec: { id: string; length: PaintLength; swath: PaintSwath } | null = null;
  let pixels = 0;
  let lastMs = Number.NaN;
  let previous: LonLat | null = null;
  let uploadClear = false;
  const self = {
    data,
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
      data.fill(0);
      pixels = 0;
      lastMs = Number.NaN;
      previous = null;
      spec = { id, length, swath };
    },
    clear() {
      data.fill(0);
      pixels = 0;
      lastMs = Number.NaN;
      previous = null;
      spec = null;
      uploadClear = true;
    },
    step(ms: number, sample: (ms: number) => (LonLat & { heightKm: number }) | null) {
      if (!spec) {
        const upload = uploadClear;
        uploadClear = false;
        return upload;
      }
      if (!Number.isFinite(ms)) return false;
      if (Number.isFinite(lastMs) && ms === lastMs) return false;
      const length = LENGTH_MS[spec.length];
      let dirty = false;
      const put = (at: number): void => {
        const ground = sample(at);
        if (!ground) return;
        const stamped = stampGround(data, spec!.swath, ground, previous, paintMinute(at));
        pixels += stamped.added;
        previous = stamped.at;
        dirty = true;
      };
      if (!Number.isFinite(lastMs) || Math.abs(ms - lastMs) > length) {
        data.fill(0);
        pixels = 0;
        previous = null;
        const steps = Math.min(240, Math.max(1, Math.ceil(length / 60_000)));
        for (let i = steps; i >= 0; i -= 1) put(ms - (length * i) / steps);
      } else {
        const span = ms - lastMs;
        const steps = Math.min(96, Math.max(1, Math.ceil(Math.abs(span) / 20_000)));
        for (let i = 1; i <= steps; i += 1) put(lastMs + (span * i) / steps);
      }
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
