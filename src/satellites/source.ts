// Your own source of elements: read OMM JSON, OMM CSV or TLE text, and ask for them politely from an address the page's author chose, in the visitor's browser.
// Nothing here knows an address: the package has no default source, so who may be asked, and on what terms, stays with the page that asks. No dependency; imports on a server.
import type { ElementSet } from "./types.ts";

/**
 * The text formats `parseElements` reads: CCSDS OMM as JSON (what CelesTrak's `FORMAT=json` and Space-Track's JSON serve), the same as CSV (CelesTrak's default), and two- or three-line TLE text.
 *
 * @example
 * ```ts
 * import type { ElementFormat } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const format: ElementFormat = "tle";
 * console.log(format);
 * ```
 */
export type ElementFormat = "omm-json" | "omm-csv" | "tle";

/**
 * What `parseElements` found: the element sets that can be used, and the ones it left out with the reason.
 *
 * @example
 * ```ts
 * import type { ParsedElements } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const count = (parsed: ParsedElements): number => parsed.sets.length;
 * console.log(typeof count);
 * ```
 */
export interface ParsedElements {
  format: ElementFormat;
  sets: ElementSet[];
  skipped: { name: string; reason: string }[];
}

const NUMBERS = ["MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "NORAD_CAT_ID", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"] as const;
const OPTIONAL_NUMBERS = ["EPHEMERIS_TYPE", "ELEMENT_SET_NO", "REV_AT_EPOCH"] as const;

/** A record with the fields of an OMM, from text or numbers, or the reason it is not one. */
function toElementSet(record: Record<string, unknown>): ElementSet | string {
  const out: Record<string, unknown> = {};
  const name = typeof record["OBJECT_NAME"] === "string" ? record["OBJECT_NAME"].trim() : "";
  out["OBJECT_NAME"] = name || `NORAD ${String(record["NORAD_CAT_ID"] ?? "?")}`;
  if (typeof record["OBJECT_ID"] === "string" && record["OBJECT_ID"]) out["OBJECT_ID"] = record["OBJECT_ID"];
  if (typeof record["CLASSIFICATION_TYPE"] === "string" && record["CLASSIFICATION_TYPE"]) out["CLASSIFICATION_TYPE"] = record["CLASSIFICATION_TYPE"];
  const epoch = record["EPOCH"];
  if (typeof epoch !== "string" || !Number.isFinite(Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(epoch) ? epoch : `${epoch}Z`))) return "the epoch is missing or is not a date";
  out["EPOCH"] = epoch;
  for (const key of NUMBERS) {
    const value = typeof record[key] === "string" && (record[key] as string).trim() !== "" ? Number(record[key]) : record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return `${key} is missing or is not a number`;
    out[key] = value;
  }
  for (const key of OPTIONAL_NUMBERS) {
    const value = typeof record[key] === "string" && (record[key] as string).trim() !== "" ? Number(record[key]) : record[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  if ((out["MEAN_MOTION"] as number) <= 0) return "MEAN_MOTION must be above zero";
  if ((out["ECCENTRICITY"] as number) < 0 || (out["ECCENTRICITY"] as number) >= 1) return "ECCENTRICITY must be from 0 up to (not including) 1";
  return out as unknown as ElementSet;
}

function fromRecords(records: unknown[], format: ElementFormat): ParsedElements {
  const sets: ElementSet[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const record of records) {
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      skipped.push({ name: "?", reason: "not an object" });
      continue;
    }
    const made = toElementSet(record as Record<string, unknown>);
    if (typeof made === "string") skipped.push({ name: String((record as Record<string, unknown>)["OBJECT_NAME"] ?? "?"), reason: made });
    else sets.push(made);
  }
  return { format, sets, skipped };
}

/** The cells of one CSV line (a cell may be in double quotes, with `""` for a quote). */
function cellsOf(line: string): string[] {
  const cells: string[] = [];
  let at = 0;
  while (at <= line.length) {
    if (line[at] === '"') {
      let text = "";
      at += 1;
      while (at < line.length) {
        if (line[at] === '"' && line[at + 1] === '"') {
          text += '"';
          at += 2;
        } else if (line[at] === '"') {
          at += 1;
          break;
        } else text += line[at++];
      }
      cells.push(text);
      at += 1;
    } else {
      const next = line.indexOf(",", at);
      const end = next < 0 ? line.length : next;
      cells.push(line.slice(at, end));
      at = end + 1;
    }
  }
  return cells;
}

/** The checksum of a TLE line: the digits added, each minus sign counting one, modulo 10. */
const tleChecksum = (line: string): number => {
  let sum = 0;
  for (const ch of line.slice(0, 68)) sum += ch >= "0" && ch <= "9" ? Number(ch) : ch === "-" ? 1 : 0;
  return sum % 10;
};

/** `00000-0` style: a sign, five digits with the point before them, and an exponent. */
const implied = (text: string): number => {
  const t = text.trim();
  const m = /^([+-]?)(\d+)([+-]\d)$/.exec(t.replace(/^ +/, ""));
  if (!m) return Number.NaN;
  return (m[1] === "-" ? -1 : 1) * Number(`0.${m[2]}`) * 10 ** Number(m[3]);
};

function fromTle(text: string): ParsedElements {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+$/, "")).filter((line) => line.trim() !== "");
  const sets: ElementSet[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const one = lines[i]!;
    if (!one.startsWith("1 ")) continue;
    const two = lines[i + 1];
    const named = i > 0 && !lines[i - 1]!.startsWith("1 ") && !lines[i - 1]!.startsWith("2 ") ? lines[i - 1]!.replace(/^0 /, "").trim() : "";
    const id = Number(one.slice(2, 7));
    const label = named || `NORAD ${id}`;
    if (!two || !two.startsWith("2 ")) {
      skipped.push({ name: label, reason: "the second line is missing" });
      continue;
    }
    i += 1;
    if (one.length < 69 || two.length < 69) {
      skipped.push({ name: label, reason: "a line is shorter than 69 characters" });
      continue;
    }
    if (tleChecksum(one) !== Number(one[68]) || tleChecksum(two) !== Number(two[68])) {
      skipped.push({ name: label, reason: "a line's checksum is wrong" });
      continue;
    }
    if (Number(two.slice(2, 7)) !== id) {
      skipped.push({ name: label, reason: "the two lines are for different satellites" });
      continue;
    }
    const yy = Number(one.slice(18, 20));
    const year = yy < 57 ? 2000 + yy : 1900 + yy;
    const day = Number(one.slice(20, 32));
    const epoch = new Date(Date.UTC(year, 0, 1) + (day - 1) * 86_400_000).toISOString().replace("Z", "");
    const designator = one.slice(9, 17).trim();
    const dy = Number(designator.slice(0, 2));
    const record: Record<string, unknown> = {
      OBJECT_NAME: label,
      OBJECT_ID: designator.length >= 5 && Number.isFinite(dy) ? `${dy < 57 ? 2000 + dy : 1900 + dy}-${designator.slice(2)}` : undefined,
      EPOCH: epoch,
      MEAN_MOTION: Number(two.slice(52, 63)),
      ECCENTRICITY: Number(`0.${two.slice(26, 33).trim()}`),
      INCLINATION: Number(two.slice(8, 16)),
      RA_OF_ASC_NODE: Number(two.slice(17, 25)),
      ARG_OF_PERICENTER: Number(two.slice(34, 42)),
      MEAN_ANOMALY: Number(two.slice(43, 51)),
      NORAD_CAT_ID: id,
      BSTAR: implied(one.slice(53, 61)),
      MEAN_MOTION_DOT: Number(one.slice(33, 43)),
      MEAN_MOTION_DDOT: implied(one.slice(44, 52)),
      CLASSIFICATION_TYPE: one[7],
      EPHEMERIS_TYPE: Number(one[62]),
      ELEMENT_SET_NO: Number(one.slice(64, 68)),
      REV_AT_EPOCH: Number(two.slice(63, 68)),
    };
    const made = toElementSet(record);
    if (typeof made === "string") skipped.push({ name: label, reason: made });
    else sets.push(made);
  }
  return { format: "tle", sets, skipped };
}

/**
 * Read element sets from text: OMM as JSON (an array or a single object), OMM as CSV (a header row, then one satellite a row) or TLE (two lines, or three with the name first). The format is found from the text.
 * An element set that is missing a number, has a wrong TLE checksum or is not a possible orbit is left out, with the reason, in `skipped`. It throws if the text is none of the three.
 *
 * @param text - What the source answered.
 * @returns The element sets that can be used and the ones that cannot.
 * @example
 * ```js
 * import { parseElements } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const csv = [
 *   "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,NORAD_CAT_ID,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT",
 *   "MADE-UP 1,2026-001A,2026-11-03T12:00:00,15.2,0.0002,53,10,90,20,900001,0.0001,0.00001,0",
 * ].join("\n");
 * const { sets, format } = parseElements(csv);
 * console.log(format, sets.length, sets[0].OBJECT_NAME);
 * ```
 */
export function parseElements(text: string): ParsedElements {
  const body = text.replace(/^\uFEFF/, "").trim();
  if (body.startsWith("[") || body.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error("the text looks like JSON but is not");
    }
    return fromRecords(Array.isArray(json) ? json : [json], "omm-json");
  }
  const first = body.split(/\r?\n/, 1)[0] ?? "";
  if (/OBJECT_NAME|NORAD_CAT_ID/.test(first) && first.includes(",")) {
    const lines = body.split(/\r?\n/).filter((line) => line.trim() !== "");
    const header = cellsOf(lines[0]!).map((cell) => cell.trim());
    return fromRecords(
      lines.slice(1).map((line) => Object.fromEntries(cellsOf(line).map((cell, index) => [header[index] ?? `#${index}`, cell]))),
      "omm-csv",
    );
  }
  if (/^\s*(0 .*\n)?1 \d{5}/m.test(body) || /^1 \d{5}/m.test(body)) return fromTle(body);
  throw new Error("the text is not OMM JSON, OMM CSV or TLE");
}

/**
 * Why a source could not be used: the address was refused before any request, the source answered something other than 200 (and will not be asked again for a while), the answer was too big, or it could not be read.
 *
 * @param message - What went wrong, in a sentence.
 * @param details - The HTTP status the source answered and when it may be asked again, when they are known.
 * @example
 * ```ts
 * import { ElementSourceError } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const error = new ElementSourceError("refused", { status: 403 });
 * console.log(error.status);
 * ```
 */
export class ElementSourceError extends Error {
  /** The HTTP status the source answered, when it answered. */
  readonly status: number | undefined;
  /** When, in milliseconds since the Unix epoch, the source may be asked again (it is not asked before). */
  readonly retryAt: number | undefined;
  constructor(message: string, details: { status?: number; retryAt?: number } = {}) {
    super(message);
    this.name = "ElementSourceError";
    this.status = details.status;
    this.retryAt = details.retryAt;
  }
}

/**
 * What `fetchElements` can be told. Every one has a safe default.
 *
 * @example
 * ```ts
 * import type { FetchElementsOptions } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const options: FetchElementsOptions = { minIntervalMs: 3 * 3_600_000 };
 * console.log(options.minIntervalMs);
 * ```
 */
export interface FetchElementsOptions {
  /** The shortest time between two requests to the same address; within it the answer already read is returned (2 hours by default: CelesTrak's elements change every 2 hours and it asks for one download an update). */
  minIntervalMs?: number;
  /** How long a source that answered anything but 200 (or did not answer) is left alone (1 hour by default). */
  blockedMs?: number;
  /** The most bytes of answer read (20 million by default). */
  maxBytes?: number;
  /** The most element sets kept (50,000 by default). */
  maxSets?: number;
  /** Where answers and refusals are kept between page loads: `localStorage` by default where there is one; `null` keeps them for this page only. */
  store?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** The fetch function (the browser's by default). */
  fetch?: typeof fetch;
  /** The time, in milliseconds since the Unix epoch (`Date.now` by default). */
  now?: () => number;
  signal?: AbortSignal;
}

/**
 * Element sets read from a source: where from, when, and whether this answer was kept from earlier rather than asked for now.
 *
 * @example
 * ```ts
 * import type { ElementSource } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * const describe = (source: ElementSource): string => `${source.sets.length} from ${source.url}, ${source.fromCache ? "kept" : "new"}`;
 * console.log(typeof describe);
 * ```
 */
export interface ElementSource extends ParsedElements {
  url: string;
  /** When the source was asked, in milliseconds since the Unix epoch. */
  retrievedAt: number;
  fromCache: boolean;
}

interface Kept {
  at: number;
  text: string;
}
const memory = new Map<string, Kept>();
const blocked = new Map<string, number>();
const KEY = "chikyu-earth.elements.";
const MAX_STORED = 2_000_000;

const defaultStore = (): FetchElementsOptions["store"] => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * Forget what `fetchElements` kept in this page and which sources it is leaving alone: for a test. It does not clear `localStorage`, and a page that asks again at once is asking against the source's rules.
 *
 * @returns Nothing.
 * @example
 * ```ts
 * import { forgetElements } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * forgetElements();
 * console.log("forgotten");
 * ```
 */
export function forgetElements(): void {
  memory.clear();
  blocked.clear();
}

/**
 * Ask a source of your own choosing for element sets, in the visitor's browser, and read them. The package has no address of its own: you pass one, and you are the one to read that source's terms
 * (docs/satellite-sources.md has what CelesTrak, Space-Track and others say). It is polite by design:
 * - only `https` (or `http` on `localhost`), with no cookies and no referrer sent;
 * - the same address is not asked again within `minIntervalMs` (2 hours): the answer already read is returned, from this page or from `localStorage`;
 * - any answer that is not 200, or no answer, stops the asking: the address is left alone for `blockedMs` (1 hour) and a `ElementSourceError` with the status says so (the answer already read, if there is one, is returned instead);
 * - an answer over `maxBytes` or `maxSets` is refused.
 * The source must send the headers a browser needs to let a page read it (CORS); one that does not cannot be read from a page, and no workaround is made here.
 *
 * @param url - The address of OMM JSON, OMM CSV or TLE text.
 * @param options - See `FetchElementsOptions`.
 * @returns The element sets, ready for `createSatellites`, with where and when they came from.
 * @example
 * ```ts no-run
 * import { createSatellites, fetchElements } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * // An address you chose, whose terms you have read. This one answers made-up elements.
 * const source = await fetchElements("https://example.org/my-elements.json");
 * const group = createSatellites(source.sets);
 * console.log(group.count, source.skipped.length, source.fromCache);
 * ```
 */
export async function fetchElements(url: string, options: FetchElementsOptions = {}): Promise<ElementSource> {
  const now = options.now ?? Date.now;
  const minInterval = options.minIntervalMs ?? 2 * 3_600_000;
  const blockedMs = options.blockedMs ?? 3_600_000;
  const maxBytes = options.maxBytes ?? 20_000_000;
  const maxSets = options.maxSets ?? 50_000;
  const store = options.store === undefined ? defaultStore() : options.store;
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    throw new ElementSourceError("that is not an address");
  }
  const local = address.hostname === "localhost" || address.hostname === "127.0.0.1" || address.hostname === "[::1]";
  if (address.protocol !== "https:" && !(address.protocol === "http:" && local)) throw new ElementSourceError("only https addresses are used (http only on localhost)");
  const key = address.href;

  const kept = (): Kept | undefined => {
    const found = memory.get(key);
    if (found) return found;
    try {
      const text = store?.getItem(`${KEY}${key}`);
      const at = Number(store?.getItem(`${KEY}${key}.at`));
      if (text && Number.isFinite(at)) return { at, text };
    } catch {
      // storage is not available: this page only
    }
    return undefined;
  };
  const useKept = (found: Kept): ElementSource => {
    const parsed = parseElements(found.text);
    return { ...parsed, url: key, retrievedAt: found.at, fromCache: true };
  };

  const have = kept();
  if (have && now() - have.at < minInterval) return useKept(have);
  let until = blocked.get(key) ?? 0;
  try {
    until = Math.max(until, Number(store?.getItem(`${KEY}${key}.until`)) || 0);
  } catch {
    // storage is not available
  }
  if (until > now()) {
    if (have) return useKept(have);
    throw new ElementSourceError("that source did not answer 200 a short while ago and is being left alone", { retryAt: until });
  }

  const stop = (message: string, status?: number): ElementSourceError => {
    const retryAt = now() + blockedMs;
    blocked.set(key, retryAt);
    try {
      store?.setItem(`${KEY}${key}.until`, String(retryAt));
    } catch {
      // storage is full or not available
    }
    return new ElementSourceError(message, { status, retryAt });
  };
  const ask = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await ask(key, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: options.signal ?? null, headers: { accept: "application/json, text/csv, text/plain" } });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (have) return useKept(have);
    throw stop(`the source could not be reached: ${error instanceof Error ? error.message : "no answer"}`);
  }
  if (response.status !== 200) {
    const blockedError = stop(`the source answered ${response.status}, so it is left alone for a while`, response.status);
    if (have) return useKept(have);
    throw blockedError;
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ElementSourceError(`the answer is ${declared} bytes, over the ${maxBytes} allowed`, { status: 200 });
  const text = await response.text();
  if (text.length > maxBytes) throw new ElementSourceError(`the answer is over the ${maxBytes} bytes allowed`, { status: 200 });
  let parsed: ParsedElements;
  try {
    parsed = parseElements(text);
  } catch (error) {
    throw new ElementSourceError(error instanceof Error ? error.message : "the answer could not be read", { status: 200 });
  }
  if (parsed.sets.length > maxSets) throw new ElementSourceError(`the answer has ${parsed.sets.length} element sets, over the ${maxSets} allowed`, { status: 200 });
  const at = now();
  memory.set(key, { at, text });
  blocked.delete(key);
  try {
    if (text.length <= MAX_STORED) {
      store?.setItem(`${KEY}${key}`, text);
      store?.setItem(`${KEY}${key}.at`, String(at));
    }
    store?.removeItem(`${KEY}${key}.until`);
  } catch {
    // storage is full or not available: this page only
  }
  return { ...parsed, url: key, retrievedAt: at, fromCache: false };
}
