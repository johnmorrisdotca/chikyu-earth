// A packed file of catalogue records: the format a refresh script writes and a page reads (`@johnmorrisdotca/chikyu-earth/catalogue`). A column of each number in the element sets, then the names: about 95 bytes an object, so
// 32,000 objects are 3 MB and about 1.2 MB gzipped, and 200,000 (the most the data door holds) are about 19 MB. Catalogue numbers are 32-bit, so six-digit and nine-digit numbers are held. Pure: no DOM, no three.js and no Node;
// the gzip step uses the web's streams, which Node 18 and every current browser have.
import { MAX_RECORDS } from "../data-door.ts";
import type { ElementSet } from "../satellites/types.ts";
import type { ObjectKind } from "./kinds.ts";

/**
 * The radar size class Space-Track gives an object: small (under 0.1 square metres), medium or large (over 1).
 *
 * @example
 * ```ts
 * import type { RadarSize } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const size: RadarSize = "L";
 * console.log(size);
 * ```
 */
export type RadarSize = "S" | "M" | "L";

/**
 * One object of the catalogue: its element set (the OMM numbers every source serves), what kind of object it is, and what the catalogue says of its owner and launch. Anything the catalogue leaves blank is left out, never guessed.
 *
 * @example
 * ```ts
 * import type { CatalogueRecord } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const record: CatalogueRecord = {
 *   set: { OBJECT_NAME: "MADE-UP 1", OBJECT_ID: "2026-001A", EPOCH: "2026-11-08T04:12:35.430048", MEAN_MOTION: 15.2, ECCENTRICITY: 0.0002, INCLINATION: 53, RA_OF_ASC_NODE: 10, ARG_OF_PERICENTER: 90, MEAN_ANOMALY: 20, NORAD_CAT_ID: 900001, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.00001, MEAN_MOTION_DDOT: 0 },
 *   kind: "PAY",
 *   owner: "US",
 *   launch: "2026-01-05",
 * };
 * console.log(record.set.NORAD_CAT_ID, record.kind);
 * ```
 */
export interface CatalogueRecord {
  set: ElementSet;
  kind: ObjectKind;
  /** The owner's country or organisation code, as the catalogue writes it ("US", "PRC", "CIS"), up to 8 characters. */
  owner?: string;
  /** The launch date, `yyyy-mm-dd`, or just the year. */
  launch?: string;
  size?: RadarSize;
}

/**
 * The most records one packed file holds: the data door's own limit, 200,000.
 *
 * @example
 * ```ts
 * import { MAX_PACKED } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(MAX_PACKED);
 * ```
 */
export const MAX_PACKED = MAX_RECORDS;

/**
 * The most bytes a packed file may unpack to (64 MB): a file that claims more is refused before it is read.
 *
 * @example
 * ```ts
 * import { MAX_PACKED_BYTES } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * console.log(MAX_PACKED_BYTES / 1_048_576);
 * ```
 */
export const MAX_PACKED_BYTES = 64 * 1_048_576;

/**
 * A packed file that cannot be read: it is not a packed file, it is cut short, it holds more than `MAX_PACKED` records, or it unpacks to more than `MAX_PACKED_BYTES`.
 *
 * @param message - What is wrong with the file, in a sentence.
 * @example
 * ```ts
 * import { PackError, unpackCatalogue } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * try {
 *   unpackCatalogue(new Uint8Array(4));
 * } catch (error) {
 *   console.log(error instanceof PackError);
 * }
 * ```
 */
export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}

const MAGIC = [0x43, 0x50, 0x4b, 0x31]; // "CPK1"
const HEADER_BYTES = 16;
const KINDS: readonly ObjectKind[] = ["PAY", "RB", "DEB", "UNK"];
const SIZES: readonly (RadarSize | undefined)[] = [undefined, "S", "M", "L"];
const NO_TEXT = "";

const pad8 = (n: number): number => (n + 7) & ~7;
const clean = (text: string | undefined): string => (text ?? NO_TEXT).replace(/[\t\r\n]+/g, " ").trim();

/** The microseconds since 1970 of an element set's epoch (a time in UTC, with or without a `Z` and with any number of decimals), or NaN. */
function epochMicros(epoch: string): number {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(?:Z|[+-]00:?00)?$/.exec(epoch.trim());
  if (!match) {
    const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(epoch) ? epoch : `${epoch}Z`);
    return ms * 1000;
  }
  return Date.parse(`${match[1]}Z`) * 1000 + Math.round(Number(`0.${(match[2] ?? "0").slice(0, 6).padEnd(6, "0")}`) * 1e6);
}

/** An epoch from microseconds since 1970: `2026-11-08T04:12:35.430048`, the way Space-Track writes it. */
function epochText(micros: number): string {
  const whole = Math.floor(micros / 1_000_000);
  const fraction = Math.round(micros - whole * 1_000_000);
  return `${new Date(whole * 1000).toISOString().slice(0, 19)}.${String(fraction).padStart(6, "0")}`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Pack catalogue records into one file: a small header (the format, how many records, and `meta`, a few words of text such as where the data is from and when it was retrieved), a column for each number and, last, the names.
 * The epoch is kept to the microsecond and the mean motion in full; the angles, the eccentricity and the drag terms are kept as 32-bit floats (an angle to about 0.00003 degrees, well inside what the elements are good to).
 * A record whose numbers are not finite, or whose catalogue number is not a whole number from 0 up to 4,294,967,295, is refused with a `PackError`.
 *
 * @param records - The records, in the order the file keeps them (at most `MAX_PACKED`).
 * @param meta - Words to keep with the file (read back as `meta`).
 * @returns The bytes. Gzip them with `gzipBytes` for a file a site hosts.
 *
 * @example
 * ```ts
 * import { packCatalogue, unpackCatalogue, type CatalogueRecord } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const record: CatalogueRecord = {
 *   set: { OBJECT_NAME: "MADE-UP 1", OBJECT_ID: "2026-001A", EPOCH: "2026-11-08T04:12:35.430048", MEAN_MOTION: 15.2, ECCENTRICITY: 0.0002, INCLINATION: 53, RA_OF_ASC_NODE: 10, ARG_OF_PERICENTER: 90, MEAN_ANOMALY: 20, NORAD_CAT_ID: 1_000_001, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.00001, MEAN_MOTION_DDOT: 0 },
 *   kind: "DEB",
 * };
 * const bytes = packCatalogue([record], { group: "debris" });
 * const back = unpackCatalogue(bytes);
 * console.log(bytes.length, back.count, back.setAt(0).NORAD_CAT_ID, back.meta["group"]);
 * ```
 */
export function packCatalogue(records: readonly CatalogueRecord[], meta: Readonly<Record<string, string>> = {}): Uint8Array {
  const count = records.length;
  if (count > MAX_PACKED) throw new PackError(`${count} records is over the ${MAX_PACKED} one file holds`);
  const metaBytes = encoder.encode(JSON.stringify(meta));
  const lines: string[] = [];
  const epoch = new Float64Array(count);
  const motion = new Float64Array(count);
  const norad = new Uint32Array(count);
  const floats = Array.from({ length: 8 }, () => new Float32Array(count));
  const kind = new Uint8Array(count);
  const size = new Uint8Array(count);
  records.forEach((record, i) => {
    const set = record.set;
    const micros = epochMicros(set.EPOCH);
    const numbers = [set.ECCENTRICITY, set.INCLINATION, set.RA_OF_ASC_NODE, set.ARG_OF_PERICENTER, set.MEAN_ANOMALY, set.BSTAR, set.MEAN_MOTION_DOT, set.MEAN_MOTION_DDOT];
    if (!Number.isFinite(micros) || !Number.isFinite(set.MEAN_MOTION) || numbers.some((n) => !Number.isFinite(n))) throw new PackError(`record ${i} (${set.NORAD_CAT_ID}) has a number that is not finite`);
    if (!Number.isInteger(set.NORAD_CAT_ID) || set.NORAD_CAT_ID < 0 || set.NORAD_CAT_ID > 0xffff_ffff) throw new PackError(`record ${i} has the catalogue number ${set.NORAD_CAT_ID}`);
    epoch[i] = micros;
    motion[i] = set.MEAN_MOTION;
    norad[i] = set.NORAD_CAT_ID;
    numbers.forEach((n, column) => (floats[column]![i] = n));
    kind[i] = Math.max(0, KINDS.indexOf(record.kind));
    size[i] = Math.max(0, SIZES.indexOf(record.size));
    lines.push([clean(set.OBJECT_NAME), clean(set.OBJECT_ID), clean(record.owner).slice(0, 8), clean(record.launch).slice(0, 10)].join("\t"));
  });
  const text = encoder.encode(lines.join("\n"));
  const columns: ArrayBufferView[] = [epoch, motion, norad, ...floats, kind, size];
  let bytes = HEADER_BYTES + pad8(metaBytes.length);
  for (const column of columns) bytes += pad8(column.byteLength);
  bytes += text.length;
  const out = new Uint8Array(bytes);
  out.set(MAGIC, 0);
  const head = new DataView(out.buffer);
  head.setUint32(4, count, true);
  head.setUint32(8, metaBytes.length, true);
  head.setUint32(12, text.length, true);
  out.set(metaBytes, HEADER_BYTES);
  let at = HEADER_BYTES + pad8(metaBytes.length);
  for (const column of columns) {
    out.set(new Uint8Array(column.buffer, column.byteOffset, column.byteLength), at);
    at += pad8(column.byteLength);
  }
  out.set(text, at);
  return out;
}

/**
 * A packed file, read: the columns as typed arrays (nothing is copied into objects until you ask) and the names.
 *
 * @example
 * ```ts
 * import { packCatalogue, unpackCatalogue, type PackedCatalogue } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const empty: PackedCatalogue = unpackCatalogue(packCatalogue([], { group: "none" }));
 * console.log(empty.count, empty.sets().length);
 * ```
 */
export interface PackedCatalogue {
  /** The words kept with the file. */
  meta: Readonly<Record<string, string>>;
  count: number;
  /** The catalogue numbers, 32-bit. */
  norad: Uint32Array;
  /** Mean motion, revolutions a day. */
  meanMotion: Float64Array;
  eccentricity: Float32Array;
  /** Degrees. */
  inclination: Float32Array;
  /** Degrees. */
  raan: Float32Array;
  /** Degrees. */
  argPerigee: Float32Array;
  /** Degrees. */
  meanAnomaly: Float32Array;
  /** Index into `OBJECT_KINDS`: 0 payload, 1 rocket body, 2 debris, 3 unknown. */
  kind: Uint8Array;
  /** The epoch of record `i`, milliseconds since 1970 (the file keeps microseconds). */
  epochMs(i: number): number;
  /** The kind of record `i`. */
  kindAt(i: number): ObjectKind;
  /** The name of record `i`. */
  nameAt(i: number): string;
  /** Record `i` as an element set the satellites code reads. */
  setAt(i: number): ElementSet;
  /** Record `i` with what the catalogue says of it. */
  recordAt(i: number): CatalogueRecord;
  /** Every record as an element set. */
  sets(): ElementSet[];
  /** Every record. */
  records(): CatalogueRecord[];
}

/**
 * Read a packed file (not gzipped: see `unpackAny`). The header is checked against the length, so a cut or wrong file is a `PackError` and never a wrong number; a file of more than `MAX_PACKED` records is refused.
 *
 * @param bytes - What `packCatalogue` made.
 * @returns The records, by column.
 *
 * @example
 * ```ts
 * import { packCatalogue, unpackCatalogue } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const set = { OBJECT_NAME: "MADE-UP 2", EPOCH: "2026-11-08T00:00:00", MEAN_MOTION: 14.1, ECCENTRICITY: 0.001, INCLINATION: 98, RA_OF_ASC_NODE: 1, ARG_OF_PERICENTER: 2, MEAN_ANOMALY: 3, NORAD_CAT_ID: 123_456, BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0 };
 * const file = unpackCatalogue(packCatalogue([{ set, kind: "RB", size: "M" }]));
 * console.log(file.nameAt(0), file.kindAt(0), file.norad[0], file.recordAt(0).size);
 * ```
 */
export function unpackCatalogue(bytes: Uint8Array): PackedCatalogue {
  if (bytes.length < HEADER_BYTES || MAGIC.some((byte, i) => bytes[i] !== byte)) throw new PackError("not a packed catalogue file");
  const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = head.getUint32(4, true);
  const metaLength = head.getUint32(8, true);
  const textLength = head.getUint32(12, true);
  if (count > MAX_PACKED) throw new PackError(`${count} records is over the ${MAX_PACKED} one file holds`);
  const sizes = [8, 8, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1].map((width) => pad8(width * count));
  const expected = HEADER_BYTES + pad8(metaLength) + sizes.reduce((a, b) => a + b, 0) + textLength;
  if (expected !== bytes.length) throw new PackError(`the file is ${bytes.length} bytes and its header says ${expected}`);
  // typed arrays need aligned starts: copy once when the bytes were cut from the middle of a bigger buffer
  const aligned = bytes.byteOffset % 8 === 0 ? bytes : bytes.slice();
  const buffer = aligned.buffer;
  const base = aligned.byteOffset;
  let metaValue: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(decoder.decode(aligned.subarray(HEADER_BYTES, HEADER_BYTES + metaLength)));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metaValue = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  } catch {
    throw new PackError("the file's own notes are not readable");
  }
  let at = base + HEADER_BYTES + pad8(metaLength);
  const take = <T extends Float64Array | Float32Array | Uint32Array | Uint8Array>(make: new (buffer: ArrayBufferLike, offset: number, length: number) => T, width: number): T => {
    const column = new make(buffer, at, count);
    at += pad8(width * count);
    return column;
  };
  const epoch = take(Float64Array, 8);
  const meanMotion = take(Float64Array, 8);
  const norad = take(Uint32Array, 4);
  const eccentricity = take(Float32Array, 4);
  const inclination = take(Float32Array, 4);
  const raan = take(Float32Array, 4);
  const argPerigee = take(Float32Array, 4);
  const meanAnomaly = take(Float32Array, 4);
  const bstar = take(Float32Array, 4);
  const ndot = take(Float32Array, 4);
  const nddot = take(Float32Array, 4);
  const kind = take(Uint8Array, 1);
  const size = take(Uint8Array, 1);
  let lines: string[] | undefined;
  const text = (): string[] => (lines ??= (textLength === 0 && count === 0 ? [] : decoder.decode(new Uint8Array(buffer, at, textLength)).split("\n")));
  const part = (i: number, index: number): string => text()[i]?.split("\t")[index] ?? "";
  const setAt = (i: number): ElementSet => {
    const id = part(i, 1);
    const set: ElementSet = {
      OBJECT_NAME: part(i, 0),
      EPOCH: epochText(epoch[i]!),
      MEAN_MOTION: meanMotion[i]!,
      ECCENTRICITY: eccentricity[i]!,
      INCLINATION: inclination[i]!,
      RA_OF_ASC_NODE: raan[i]!,
      ARG_OF_PERICENTER: argPerigee[i]!,
      MEAN_ANOMALY: meanAnomaly[i]!,
      NORAD_CAT_ID: norad[i]!,
      BSTAR: bstar[i]!,
      MEAN_MOTION_DOT: ndot[i]!,
      MEAN_MOTION_DDOT: nddot[i]!,
    };
    if (id) set.OBJECT_ID = id;
    const owner = part(i, 2);
    if (owner) set.COUNTRY_CODE = owner;
    return set;
  };
  const kindAt = (i: number): ObjectKind => KINDS[kind[i]!] ?? "UNK";
  const recordAt = (i: number): CatalogueRecord => {
    const record: CatalogueRecord = { set: setAt(i), kind: kindAt(i) };
    const owner = part(i, 2);
    const launch = part(i, 3);
    const radar = SIZES[size[i]!];
    if (owner) record.owner = owner;
    if (launch) record.launch = launch;
    if (radar) record.size = radar;
    return record;
  };
  return {
    meta: metaValue,
    count,
    norad,
    meanMotion,
    eccentricity,
    inclination,
    raan,
    argPerigee,
    meanAnomaly,
    kind,
    epochMs: (i) => epoch[i]! / 1000,
    kindAt,
    nameAt: (i) => part(i, 0),
    setAt,
    recordAt,
    sets: () => Array.from({ length: count }, (_, i) => setAt(i)),
    records: () => Array.from({ length: count }, (_, i) => recordAt(i)),
  };
}

const isGzip = (bytes: Uint8Array): boolean => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

async function pump(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const done = writer.write(bytes as BufferSource).then(() => writer.close());
  const parts: Uint8Array[] = [];
  let total = 0;
  const reader = stream.readable.getReader();
  try {
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      total += value.length;
      if (total > limit) throw new PackError(`the file unpacks to more than ${limit} bytes`);
      parts.push(value);
    }
    await done;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await done.catch(() => undefined);
    throw error instanceof PackError ? error : new PackError("the file is not valid gzip");
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * Gzip bytes, with the web's own `CompressionStream`: the form a site hosts a packed file in.
 *
 * @param bytes - What `packCatalogue` made.
 * @returns The gzipped bytes.
 *
 * @example
 * ```ts
 * import { gzipBytes } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const small = await gzipBytes(new Uint8Array(10_000));
 * console.log(small.length < 100, small[0], small[1]);
 * ```
 */
export function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return pump(bytes, new CompressionStream("gzip"), Number.MAX_SAFE_INTEGER);
}

/**
 * Read a packed file whether or not it is gzipped (gzip is found from its first two bytes). The unpacked size is capped at `MAX_PACKED_BYTES`, so a small file that unpacks to a huge one is refused.
 *
 * @param bytes - A packed file, or a gzipped one.
 * @returns The records, by column.
 *
 * @example
 * ```ts
 * import { gzipBytes, packCatalogue, unpackAny } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const file = await unpackAny(await gzipBytes(packCatalogue([], { group: "empty" })));
 * console.log(file.count, file.meta["group"]);
 * ```
 */
export async function unpackAny(bytes: Uint8Array): Promise<PackedCatalogue> {
  if (bytes.length > MAX_PACKED_BYTES && !isGzip(bytes)) throw new PackError(`the file is over ${MAX_PACKED_BYTES} bytes`);
  return unpackCatalogue(isGzip(bytes) ? await pump(bytes, new DecompressionStream("gzip"), MAX_PACKED_BYTES) : bytes);
}
