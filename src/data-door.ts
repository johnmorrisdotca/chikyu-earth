// data-door.ts: the family's data door, as one file of types and four small functions. The same file in every package that takes outside data (src/data-door.ts), copied unchanged from
// kazoku-ui's templates/; a repository never edits it, and scripts/check-standard.mjs fails when a copy differs. A copy, not an import, so that a package with no runtime dependencies keeps none.
// No DOM, no three.js, no clock, no network of its own: a source does its own fetching, and this file only checks, counts, budgets and words what a source says.
//
// The idea: a package draws, and the caller supplies the data. Outside data comes in through a source, either records (a list that fits in memory) or tiles (data cut by place and by detail,
// fetched only for what the view shows). Every source carries its licence and credit in code, so a view can always say whose data is on screen. With no source a package draws what it drew before.
//
//   validateSource(source, taken)       throws a TypeError for an empty credit, no licence name or link, a bad id, a clashing id, a missing function
//   creditLine(credits, language)       "Yale Bright Star Catalogue (Public domain); UCAC4 (CC0 1.0)."  with "non-commercial" or "share-alike" whenever the source says so
//   loadRecords(source, signal)         reads a record list once, freezes it, refuses more than MAX_RECORDS, skips and counts records with a non-finite number
//   createTileStore(options)            loads tiles by key under a byte budget: at most 6 in flight, least recently used out first, never a tile the view needs, failures counted
//
// The shapes are in DESIGN-831 (MODULES-831). The licence terms of a caller's source may be non-commercial or share-alike; a package's own (bundled) sources never are.

/**
 * A licence: its name and a link are always shown beside the credit. *
 * @example
 * ```ts no-check
 * import type { Licence } from "./data-door.ts";
 *
 * const licence: Licence = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", spdx: "CC-BY-4.0" };
 * ```
 */
export interface Licence {
  name: string;
  url: string;
  /** An SPDX identifier, when there is one. */
  spdx?: string;
  nonCommercial?: boolean;
  shareAlike?: boolean;
}

/**
 * What a source says about itself. *
 * @example
 * ```ts no-check
 * import type { SourceInfo } from "./data-door.ts";
 *
 * const info: SourceInfo = {
 *   id: "my-catalogue",
 *   name: { en: "My catalogue", ja: "私のカタログ" },
 *   credit: { en: "My catalogue, A. Person (2026)", ja: "私のカタログ（A. Person、2026年）" },
 *   licence: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
 *   url: "https://example.org/my-catalogue",
 *   retrieved: "2026-11-10",
 * };
 * ```
 */
export interface SourceInfo {
  /** Unique in a view: lower-case letters, digits and hyphens ("ucac4", "my-catalogue"). */
  id: string;
  name: { en: string; ja: string };
  /** The line shown on screen. Never empty, in both languages. */
  credit: { en: string; ja: string };
  /** The licence: its name and link are always shown with the credit. */
  licence: Licence;
  /** The source's own page. */
  url: string;
  /** The day it was retrieved, yyyy-mm-dd, as NOTICE.md writes it. */
  retrieved: string;
}

/**
 * The most records a record source may hold. Bigger data must be tiles. *
 * @example
 * ```ts no-check
 * import { MAX_RECORDS } from "./data-door.ts";
 *
 * console.log(MAX_RECORDS); // 200000
 * ```
 */
export const MAX_RECORDS = 200_000;

/**
 * The default budget for decoded tiles in a view, all sources together: 48 MB (a picture counts with its mipmaps, 4/3 of its bytes). *
 * @example
 * ```ts no-check
 * import { TILE_BUDGET_BYTES } from "./data-door.ts";
 *
 * console.log(TILE_BUDGET_BYTES / 1024 / 1024); // 48
 * ```
 */
export const TILE_BUDGET_BYTES = 48 * 1024 * 1024;

/**
 * The most loads in flight at once for one source. *
 * @example
 * ```ts no-check
 * import { MAX_IN_FLIGHT } from "./data-door.ts";
 *
 * console.log(MAX_IN_FLIGHT); // 6
 * ```
 */
export const MAX_IN_FLIGHT = 6;

/**
 * A list that fits in memory (at most `MAX_RECORDS` records; bigger data must be tiles). It is read once, when the source is added. *
 * @example
 * ```ts no-check
 * import type { RecordSource } from "./data-door.ts";
 *
 * declare const info: import("./data-door.ts").SourceInfo;
 * const source: RecordSource<{ id: string }> = { kind: "records", info, records: () => [{ id: "a" }] };
 * ```
 */
export interface RecordSource<R> {
  kind: "records";
  info: SourceInfo;
  records(signal: AbortSignal): R[] | Promise<R[]>;
}

/**
 * Data cut by place and by detail. `Place` and `Detail` are the package's own types. *
 * @example
 * ```ts no-check
 * import type { TileSource } from "./data-door.ts";
 *
 * declare const info: import("./data-door.ts").SourceInfo;
 * const source: TileSource<string, number, Uint8Array> = {
 *   kind: "tiles",
 *   info,
 *   need: (place, detail) => [`${place}/${detail}`],
 *   load: async () => new Uint8Array(16),
 *   bytes: (tile) => tile.byteLength,
 * };
 * ```
 */
export interface TileSource<Place, Detail, Tile> {
  kind: "tiles";
  info: SourceInfo;
  /** The keys of the tiles a place needs at a detail. Pure: no fetching. */
  need(place: Place, detail: Detail): readonly string[];
  /** Loads one tile. The source may use the network or not; it must stop when the signal aborts. */
  load(key: string, signal: AbortSignal): Promise<Tile>;
  /** The tile's size in memory, in bytes, for the budget. */
  bytes(tile: Tile): number;
}

/**
 * Either kind of source. *
 * @example
 * ```ts no-check
 * import type { DataSource } from "./data-door.ts";
 *
 * const kinds = (sources: DataSource[]): string[] => sources.map((source) => source.kind);
 * ```
 */
export type DataSource = RecordSource<unknown> | TileSource<unknown, unknown, unknown>;

/**
 * A piece of a map, in degrees: longitude and latitude (right ascension and declination for the sky). One shape in every package. *
 * @example
 * ```ts no-check
 * import type { MapPlace } from "./data-door.ts";
 *
 * const wholeSky: MapPlace = { lonMin: 0, lonMax: 360, latMin: -90, latMax: 90 };
 * ```
 */
export interface MapPlace {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

/**
 * What a picture needs of its bitmap: an `ImageBitmap` fits. *
 * @example
 * ```ts no-check
 * import type { BitmapLike } from "./data-door.ts";
 *
 * const size = (bitmap: BitmapLike): number => bitmap.width * bitmap.height;
 * ```
 */
export interface BitmapLike {
  readonly width: number;
  readonly height: number;
  close?(): void;
}

/**
 * A map tile: its size in pixels and its picture. A map source's detail is the pixels across the whole circumference (not a level number, because the packages number their pyramids differently),
 * and each source maps a width to its own nearest level.
 *
 * @example
 * ```ts no-check
 * import type { ImageTile } from "./data-door.ts";
 *
 * const tile: ImageTile = { width: 512, height: 256, image: await createImageBitmap(blob) };
 * ```
 */
export interface ImageTile {
  width: number;
  height: number;
  image: BitmapLike;
}

/**
 * One source's part in the last drawn frame. *
 * @example
 * ```ts no-check
 * import type { Credit } from "./data-door.ts";
 *
 * declare const info: import("./data-door.ts").SourceInfo;
 * const credit: Credit = { source: info, own: false, used: 12 };
 * ```
 */
export interface Credit {
  source: SourceInfo;
  /** True for the package's own (bundled) data. */
  own: boolean;
  /** The marks or tiles drawn from it. */
  used: number;
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEB = /^https?:\/\/[^\s/]+/i;

const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function isDay(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const parts = DAY.exec(value);
  if (parts === null) return false;
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  return date.toISOString().slice(0, 10) === value;
}

/**
 * Refuses a source that cannot be shown honestly: it throws a `TypeError` at once, when a source is added, not at the first draw. An empty credit (either language), a licence with no name or no
 * link, a bad or already used id, a missing name, page or day, or a missing function is refused.
 * @param source What the caller handed in.
 * @param taken The ids already in the view, so that a clash is refused.
 * @example
 * ```ts no-check
 * import { validateSource } from "./data-door.ts";
 *
 * validateSource(mySource, view.sources.map((one) => one.info.id)); // throws TypeError: source "mine": the credit is empty (en)
 * ```
 */
export function validateSource(source: unknown, taken: Iterable<string> = []): asserts source is DataSource {
  if (!object(source)) throw new TypeError("a source must be an object");
  const info = source["info"];
  if (!object(info)) throw new TypeError("a source needs an info object");
  const id = info["id"];
  if (typeof id !== "string" || !ID.test(id)) throw new TypeError(`a source's id must be lower-case letters, digits and hyphens, up to 64 characters: ${JSON.stringify(id)}`);
  const refuse = (why: string): never => {
    throw new TypeError(`source "${id}": ${why}`);
  };
  for (const used of taken) if (used === id) refuse("the id is already used in this view");
  for (const field of ["name", "credit"] as const) {
    const pair = info[field];
    for (const language of ["en", "ja"] as const) if (!object(pair) || !text(pair[language])) refuse(`the ${field} is empty (${language})`);
  }
  const licence = info["licence"];
  if (!object(licence)) refuse("there is no licence");
  const terms = licence as Record<string, unknown>;
  if (!text(terms["name"])) refuse("the licence has no name");
  if (!text(terms["url"]) || !WEB.test(terms["url"])) refuse("the licence has no link (an http or https address)");
  for (const flag of ["nonCommercial", "shareAlike"] as const) if (terms[flag] !== undefined && typeof terms[flag] !== "boolean") refuse(`the licence's ${flag} must be true or false`);
  if (!text(info["url"]) || !WEB.test(info["url"])) refuse("the source has no page (an http or https address)");
  if (!isDay(info["retrieved"])) refuse("retrieved must be a real day, yyyy-mm-dd");
  const kind = source["kind"];
  if (kind === "records") {
    if (typeof source["records"] !== "function") refuse("a records source needs records()");
  } else if (kind === "tiles") {
    for (const method of ["need", "load", "bytes"] as const) if (typeof source[method] !== "function") refuse(`a tiles source needs ${method}()`);
  } else refuse(`kind must be "records" or "tiles", not ${JSON.stringify(kind)}`);
}

/** The words for a licence's terms. */
const TERMS = {
  en: { nonCommercial: "non-commercial", shareAlike: "share-alike" },
  ja: { nonCommercial: "非営利のみ", shareAlike: "同一条件で共有" },
} as const;

/** Licence names that are plain phrases, not identifiers, and so are translated. An identifier such as "CC BY-NC 3.0 IGO" is a name and stays. */
const JA_NAMES: Readonly<Record<string, string>> = { "public domain": "パブリックドメイン" };

/**
 * The credit line for what a view drew: each source's credit with its licence name, and "non-commercial" or "share-alike" whenever the source says so, so a page cannot hide the terms of the data it
 * uses. The package's own sources come first, then the rest, each group in the order given; a source listed twice is written once. English: joined with semicolons, ending in a full stop. Japanese: the
 * licence in full-width parentheses, joined with ／, no full stop. An empty list is an empty string.
 * @param credits What the view drew, from its `credits()`.
 * @param language `"en"` or `"ja"`.
 * @returns The line, or an empty string for no credits.
 * @example
 * ```ts no-check
 * import { creditLine } from "./data-door.ts";
 *
 * creditLine(view.credits(), "en"); // "Yale Bright Star Catalogue (Public domain); UCAC4 (CC0 1.0)."
 * creditLine(view.credits(), "ja"); // "イェール輝星カタログ（パブリックドメイン）／UCAC4（CC0 1.0）"
 * ```
 */
export function creditLine(credits: readonly Credit[], language: "en" | "ja"): string {
  const seen = new Set<string>();
  const once = credits.filter((credit) => !seen.has(credit.source.id) && (seen.add(credit.source.id), true));
  const ordered = [...once.filter((credit) => credit.own), ...once.filter((credit) => !credit.own)];
  const words = TERMS[language];
  const parts = ordered.map((credit) => {
    const { source } = credit;
    const line = (source.credit[language] || source.credit.en).trim();
    const name = language === "ja" ? (JA_NAMES[source.licence.name.trim().toLowerCase()] ?? source.licence.name) : source.licence.name;
    const terms = [source.licence.nonCommercial === true ? words.nonCommercial : "", source.licence.shareAlike === true ? words.shareAlike : ""].filter((term) => term !== "");
    if (language === "ja") return `${line}（${[name, ...terms].join("、")}）`;
    return terms.length === 0 ? `${line} (${name})` : `${line} (${name}; ${terms.join(", ")})`;
  });
  if (parts.length === 0) return "";
  return language === "ja" ? parts.join("／") : `${parts.join("; ")}.`;
}

/**
 * What `loadRecords` found. `skipped` counts the records dropped for a non-finite number; a failed read has no records and says why.
 *
 * @example
 * ```ts no-check
 * import type { RecordsRead } from "./data-door.ts";
 *
 * const say = (read: RecordsRead<unknown>): string => `${read.status}: ${read.records.length} kept, ${read.skipped} skipped`;
 * ```
 */
export interface RecordsRead<R> {
  status: "ok" | "failed" | "aborted";
  /** Frozen. Empty unless the read succeeded. */
  records: readonly R[];
  skipped: number;
  /** Why a read failed. */
  reason?: string;
}

/**
 * Reads a record source once, when it is added: the list is frozen, a record with a non-finite number (a `NaN` or an infinity in any number `finite` names) is skipped and counted, and a list over
 * `MAX_RECORDS` is refused whole (bigger data must be tiles). It never throws: a source that throws or rejects is a failed read, and a read the signal aborted is `aborted`.
 * @param source The record source.
 * @param signal Aborts the read (the source is removed or switched off).
 * @param finite The numbers of one record that must be finite, if any: `(star) => [star.ra, star.dec, star.mag]`.
 * @returns What was found: the status, the frozen records, how many were skipped and, for a failed read, why.
 * @example
 * ```ts no-check
 * import { loadRecords } from "./data-door.ts";
 *
 * const read = await loadRecords(source, controller.signal, (star) => [star.ra, star.dec]); // read.records is frozen; read.skipped counts the NaNs
 * ```
 */
export async function loadRecords<R>(source: RecordSource<R>, signal: AbortSignal, finite?: (record: R) => readonly number[]): Promise<RecordsRead<R>> {
  const none = (status: RecordsRead<R>["status"], reason?: string): RecordsRead<R> => ({ status, records: Object.freeze([]), skipped: 0, ...(reason === undefined ? {} : { reason }) });
  if (signal.aborted) return none("aborted");
  let list: unknown;
  try {
    list = await source.records(signal);
  } catch (error) {
    return signal.aborted ? none("aborted") : none("failed", error instanceof Error ? error.message : String(error));
  }
  if (signal.aborted) return none("aborted");
  if (!Array.isArray(list)) return none("failed", "records() did not return a list");
  if (list.length > MAX_RECORDS) return none("failed", `${list.length} records is over the limit of ${MAX_RECORDS}: bigger data must be tiles`);
  const kept: R[] = [];
  let skipped = 0;
  for (const record of list as R[]) {
    let ok = record !== null && record !== undefined;
    if (ok && finite !== undefined) {
      try {
        ok = finite(record).every((value) => typeof value === "number" && Number.isFinite(value));
      } catch {
        ok = false;
      }
    }
    if (ok) kept.push(record);
    else skipped += 1;
  }
  return { status: "ok", records: Object.freeze(kept), skipped };
}

/**
 * The part of a tile source the store uses.
 *
 * @example
 * ```ts no-check
 * import type { TileLoader } from "./data-door.ts";
 *
 * const loader: TileLoader<Uint8Array> = { info, load: async () => new Uint8Array(8), bytes: (tile) => tile.byteLength };
 * ```
 */
export type TileLoader<Tile> = Pick<TileSource<unknown, unknown, Tile>, "info" | "load" | "bytes">;

/**
 * Options for `createTileStore`.
 *
 * @example
 * ```ts no-check
 * import type { TileStoreOptions } from "./data-door.ts";
 *
 * const options: TileStoreOptions = { budgetBytes: 24 * 1024 * 1024, maxTiles: 256, onChange: () => draw() };
 * ```
 */
export interface TileStoreOptions {
  /** The bytes of decoded tiles held, all sources together. Default `TILE_BUDGET_BYTES`. */
  budgetBytes?: number;
  /** The most loads in flight for one source. Default `MAX_IN_FLIGHT`. */
  maxInFlight?: number;
  /** The most tiles held, all sources together, as well as the byte budget. Default: no limit. */
  maxTiles?: number;
  /** Called when a tile has arrived, failed or been refused, so the view can redraw. */
  onChange?: () => void;
}

/**
 * What a tile store has done.
 *
 * @example
 * ```ts no-check
 * import type { TileStats } from "./data-door.ts";
 *
 * const full = (stats: TileStats): boolean => stats.refused > 0;
 * ```
 */
export interface TileStats {
  /** Tiles held, and their bytes: `heldBytes` is never over the budget. */
  held: number;
  heldBytes: number;
  /** Loads running now, and loads waiting for a free place. */
  inFlight: number;
  queued: number;
  /** Loads started since the store was made: the number a test reads to prove nothing is sent at rest. */
  requested: number;
  /** Tiles that failed to load, came back empty, or reported a size that is not a number. They are never held or drawn. */
  failed: number;
  /** Tiles that arrived and did not fit, because every tile held was needed by the view. They are not held; the view draws what it holds. */
  refused: number;
  /** Tiles let go to make room. */
  evicted: number;
}

/**
 * A tile store: tiles by source and key, under one byte budget.
 *
 * @example
 * ```ts no-check
 * import type { TileStore } from "./data-door.ts";
 *
 * const held = (store: TileStore<Uint8Array>): number => store.stats().held;
 * ```
 */
export interface TileStore<Tile> {
  /**
   * Tells the store which tiles `source` needs now, and returns the ones it holds. When the keys are the same as the last call it does nothing, so a view that asks again at rest sends nothing;
   * when they changed, the missing ones load (a tile that failed is tried again only now), the loads of tiles no longer needed are aborted, and the held ones are marked used.
   * `again: true` is for a caller that means "try what is missing once more" with the same keys: it starts the missing tiles that are not already loading or waiting, and nothing else changes.
   */
  want(source: TileLoader<Tile>, keys: readonly string[], again?: boolean): ReadonlyMap<string, Tile>;
  /** One held tile, or `undefined`. */
  get(sourceId: string, key: string): Tile | undefined;
  /** Forgets a source: aborts its loads, frees its tiles. The source is switched off. */
  drop(sourceId: string): void;
  stats(): TileStats;
  /** Resolves when no load is running or waiting. */
  idle(): Promise<void>;
}

interface Held<Tile> {
  tile: Tile;
  bytes: number;
}

interface Account<Tile> {
  source: TileLoader<Tile>;
  signature: string;
  wanted: Set<string>;
  queue: string[];
  loading: Map<string, AbortController>;
}

const joinKey = (id: string, key: string): string => `${id}\u0000${key}`;

/**
 * A tile store for a view: loads the tiles of every source by key and keeps them under one budget of bytes (default 48 MB, all sources together).
 * - At most `maxInFlight` loads (6) run at once for a source, and a load starts only because the keys changed: at rest the store sends nothing, and a tile that failed waits for the next change.
 * - The least recently used tile goes first when room is needed, and never a tile the view needs now. If a new tile does not fit even so, it is refused and counted: the held bytes never pass the budget (nor the count, if `maxTiles` is set).
 * - A tile that throws, comes back empty or reports a size that is not a finite number is counted in `failed` and never held, so it is never drawn.
 * - `drop(sourceId)` aborts the source's loads and frees its tiles.
 * @param options Budget, loads in flight, and a callback for a redraw.
 * @returns The store.
 * @example
 * ```ts no-check
 * import { createTileStore } from "./data-door.ts";
 *
 * const store = createTileStore<Tile>({ onChange: draw });
 * const held = store.want(source, source.need(place, detail)); // draws what is held now; the rest arrives through onChange
 * store.drop(source.info.id); // the layer is switched off
 * ```
 */
export function createTileStore<Tile>(options: TileStoreOptions = {}): TileStore<Tile> {
  const budget = options.budgetBytes ?? TILE_BUDGET_BYTES;
  const maxInFlight = Math.max(1, Math.floor(options.maxInFlight ?? MAX_IN_FLIGHT));
  const maxTiles = Math.max(1, options.maxTiles ?? Infinity);
  const held = new Map<string, Held<Tile>>(); // oldest first: a tile used again is moved to the end
  const accounts = new Map<string, Account<Tile>>();
  const counts = { heldBytes: 0, requested: 0, failed: 0, refused: 0, evicted: 0 };
  let waiting: (() => void)[] = [];

  const busy = (): boolean => [...accounts.values()].some((account) => account.loading.size > 0 || account.queue.length > 0);
  const settle = (): void => {
    if (busy()) return;
    const done = waiting;
    waiting = [];
    for (const resolve of done) resolve();
  };
  const needed = (full: string): boolean => {
    const at = full.indexOf("\u0000");
    return accounts.get(full.slice(0, at))?.wanted.has(full.slice(at + 1)) === true;
  };
  const release = (full: string): void => {
    const one = held.get(full);
    if (one === undefined) return;
    held.delete(full);
    counts.heldBytes -= one.bytes;
  };

  /** Keeps `tile` if it fits (in bytes and in count), letting go of the least recently used tiles nobody needs. */
  function keep(full: string, tile: Tile, bytes: number): boolean {
    const victims: string[] = [];
    let freed = 0;
    let count = held.size;
    const fits = (): boolean => counts.heldBytes - freed + bytes <= budget && count + 1 <= maxTiles;
    if (!fits()) {
      for (const [old, one] of held) {
        if (needed(old)) continue;
        victims.push(old);
        freed += one.bytes;
        count -= 1;
        if (fits()) break;
      }
    }
    if (!fits()) return false;
    for (const old of victims) {
      release(old);
      counts.evicted += 1;
    }
    held.set(full, { tile, bytes });
    counts.heldBytes += bytes;
    return true;
  }

  function start(id: string, account: Account<Tile>, key: string): void {
    const controller = new AbortController();
    account.loading.set(key, controller);
    counts.requested += 1;
    const finish = (): void => {
      if (account.loading.get(key) === controller) account.loading.delete(key);
      if (accounts.get(id) === account) pump(id, account);
      settle();
    };
    const arrived = (tile: Tile): void => {
      if (controller.signal.aborted || accounts.get(id) !== account) return;
      let bytes = Number.NaN;
      try {
        bytes = tile === null || tile === undefined ? Number.NaN : account.source.bytes(tile);
      } catch {
        bytes = Number.NaN;
      }
      if (!Number.isFinite(bytes) || bytes < 0) counts.failed += 1;
      else if (!keep(joinKey(id, key), tile, bytes)) counts.refused += 1;
      options.onChange?.();
    };
    const failed = (): void => {
      if (controller.signal.aborted || accounts.get(id) !== account) return;
      counts.failed += 1;
      options.onChange?.();
    };
    let promise: Promise<Tile>;
    try {
      promise = Promise.resolve(account.source.load(key, controller.signal));
    } catch (error) {
      promise = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    promise.then(arrived, failed).then(finish, finish);
  }

  function pump(id: string, account: Account<Tile>): void {
    while (account.loading.size < maxInFlight && account.queue.length > 0) {
      const key = account.queue.shift() as string;
      if (account.wanted.has(key) && !held.has(joinKey(id, key)) && !account.loading.has(key)) start(id, account, key);
    }
  }

  return {
    want(source, keys, again = false) {
      const id = source.info.id;
      const list = [...new Set(keys)];
      let account = accounts.get(id);
      if (account === undefined) {
        account = { source, signature: "\u0001", wanted: new Set(), queue: [], loading: new Map() };
        accounts.set(id, account);
      }
      account.source = source;
      const signature = [...list].sort().join("\n");
      if (signature !== account.signature || again) {
        account.signature = signature;
        account.wanted = new Set(list);
        for (const [key, controller] of account.loading) {
          if (account.wanted.has(key)) continue;
          controller.abort();
          account.loading.delete(key);
        }
        account.queue = list.filter((key) => !held.has(joinKey(id, key)) && !account!.loading.has(key));
        pump(id, account);
        settle();
      }
      const found = new Map<string, Tile>();
      for (const key of list) {
        const full = joinKey(id, key);
        const one = held.get(full);
        if (one === undefined) continue;
        held.delete(full);
        held.set(full, one); // used now: last to go
        found.set(key, one.tile);
      }
      return found;
    },
    get: (sourceId, key) => held.get(joinKey(sourceId, key))?.tile,
    drop(sourceId) {
      const account = accounts.get(sourceId);
      if (account === undefined) return;
      accounts.delete(sourceId);
      for (const controller of account.loading.values()) controller.abort();
      account.loading.clear();
      account.queue = [];
      for (const full of [...held.keys()]) if (full.startsWith(`${sourceId}\u0000`)) release(full);
      settle();
    },
    stats() {
      let inFlight = 0;
      let queued = 0;
      for (const account of accounts.values()) {
        inFlight += account.loading.size;
        queued += account.queue.length;
      }
      return { held: held.size, heldBytes: counts.heldBytes, inFlight, queued, requested: counts.requested, failed: counts.failed, refused: counts.refused, evicted: counts.evicted };
    },
    idle: () => (busy() ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve()),
  };
}
