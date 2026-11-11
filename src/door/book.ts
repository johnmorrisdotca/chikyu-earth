// The sources a view holds: which are in it, which are switched off, the records of the record sources once read, and the credits of what was drawn. An element owns one. Everything here is plain TypeScript with no DOM and no
// three.js; the elements call it, and a test can too. The tiles themselves are loaded by the realistic Earth's tile set, which asks the book for the source of each layer.
import { validateSource, type Credit, type DataSource, type SourceInfo } from "../data-door.ts";
import { readElementSets, type ElementRecordSource, type ElementSetsRead } from "./elements.ts";
import type { EarthMapSource, MapLayer } from "./map.ts";
import { OWN_BY_ID, isOwnSource } from "./own.ts";
import type { ElementSet } from "../satellites/types.ts";

/**
 * Options of a view's source book.
 *
 * @example
 * ```ts
 * import type { SourceBookOptions } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const options: SourceBookOptions = { kinds: ["tiles"] };
 * console.log(options.kinds);
 * ```
 */
export interface SourceBookOptions {
  /** The kinds of source this view can draw: `tiles` (a map of the Earth) and `records` (satellites' orbital elements). Both where left out. */
  kinds?: readonly ("tiles" | "records")[];
}

/**
 * What a view's sources have done: for each record source how many records it holds and how many were left out.
 *
 * @example
 * ```ts
 * import type { SourceStats } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const kept = (stats: SourceStats): number => Object.keys(stats.records).length;
 * console.log(typeof kept);
 * ```
 */
export interface SourceStats {
  records: Record<string, { status: string; kept: number; skipped: number }>;
}

/**
 * A view's sources, as `<chikyu-earth-realistic>` and `<chikyu-passes>` keep them: `addSource`, `removeSource`, `enableSource` and `ownOnly` are the element's methods of the same names.
 *
 * @example
 * ```ts
 * import { createSourceBook } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const book = createSourceBook();
 * console.log(book.sources.length, book.active().length);
 * ```
 */
export interface SourceBook {
  /** The sources now in the view, in the order added (the package's own folder of tiles is not among them unless a page added it). */
  readonly sources: readonly DataSource[];
  /** Adds a source. It throws a `TypeError` at once for a source `validateSource` refuses, an id already in the view, a kind this view cannot draw, or a map source with no layer. Returns the function that removes it. */
  addSource(source: unknown): () => void;
  /** Removes a source by id: aborts its reads, frees its records. Returns whether there was one. */
  removeSource(id: string): boolean;
  /** Switches a source off (`false`) or on: off aborts its read and frees its records, and the source stays in the view. */
  enableSource(id: string, on: boolean): void;
  /** True while a source is in the view and switched on. */
  isEnabled(id: string): boolean;
  /** `true` ignores every source that is not the package's own, at once (the attribute `data="own"`). */
  ownOnly(on: boolean): void;
  readonly onlyOwn: boolean;
  /** The sources in use: in the view, switched on, and not ignored by `ownOnly`. */
  active(): readonly DataSource[];
  /** The map sources in use for a layer, the last one added first (it is the one the layer is drawn from). */
  mapSources(layer: MapLayer): readonly EarthMapSource[];
  /** The element sets of every record source in use, read so far, with the id of the source each came from, in the order added. */
  elementLists(): readonly { id: string; sets: readonly ElementSet[] }[];
  /** True for a source the package made itself. */
  isOwn(source: DataSource): boolean;
  /** The source of this id, if it is in the view. */
  get(id: string): DataSource | undefined;
  /** The signal of a source: it aborts when the source is removed, switched off or ignored, so what a view started for it stops. */
  signal(id: string): AbortSignal;
  /** Calls `listener` when something changed that a view may want to draw again for: a source added, removed or switched, records read. Returns the function that stops it. */
  onChange(listener: () => void): () => void;
  stats(): SourceStats;
  /** A number that changes whenever the sources in use change (a source read, switched, added or removed), so a view looks again only then. */
  readonly version: number;
  /** Resolves when every record source has been read. */
  ready(): Promise<void>;
  /** Frees everything: aborts every read and signal, frees every record. The book is not used again. */
  dispose(): void;
}

const LAYERS: readonly string[] = ["day", "night", "clouds", "water", "*"];

/**
 * Makes the sources of one view.
 *
 * @param options - The kinds the view draws.
 * @returns The book.
 *
 * @example
 * ```ts
 * import { createSourceBook } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const book = createSourceBook({ kinds: ["tiles"] });
 * console.log(book.active().length);
 * ```
 */
export function createSourceBook(options: SourceBookOptions = {}): SourceBook {
  const kinds = new Set(options.kinds ?? ["tiles", "records"]);
  const list: DataSource[] = [];
  const off = new Set<string>();
  const controllers = new Map<string, AbortController>();
  const reads = new Map<string, ElementSetsRead>();
  const listeners = new Set<() => void>();
  const reading = new Set<Promise<void>>();
  let onlyOwn = false;
  let gone = false;
  let version = 0;
  const notify = (): void => {
    version += 1;
    for (const listener of [...listeners]) listener();
  };

  const isOwn = (source: DataSource): boolean => isOwnSource(source);
  const inUse = (source: DataSource): boolean => !off.has(source.info.id) && !(onlyOwn && !isOwn(source));
  const active = (): DataSource[] => list.filter(inUse);

  const controllerOf = (id: string): AbortController => {
    let controller = controllers.get(id);
    if (controller === undefined) {
      controller = new AbortController();
      controllers.set(id, controller);
    }
    return controller;
  };

  /** Aborts a source's reads and loads and frees its records. */
  const release = (id: string): void => {
    controllers.get(id)?.abort();
    controllers.delete(id);
    reads.delete(id);
  };

  /** Starts reading a record source: once, when it is added or switched on. */
  const start = (source: DataSource): void => {
    if (source.kind !== "records" || reads.has(source.info.id) || controllers.has(source.info.id)) return;
    const controller = controllerOf(source.info.id);
    const done: Promise<void> = readElementSets(source as ElementRecordSource, controller.signal).then((read) => {
      reading.delete(done);
      if (controllers.get(source.info.id) !== controller || read.status === "aborted") return;
      reads.set(source.info.id, read);
      notify();
    });
    reading.add(done);
  };

  const check = (source: unknown): DataSource => {
    validateSource(source, list.map((one) => one.info.id));
    const id = source.info.id;
    if (OWN_BY_ID.has(id) && !isOwnSource(source)) throw new TypeError(`source "${id}": that id is one of the package's own (${[...OWN_BY_ID.keys()].join(", ")}); a source of yours takes an id of its own`);
    if (!kinds.has(source.kind)) throw new TypeError(`source "${id}": this view takes ${[...kinds].join(" and ")} sources, not ${source.kind} sources`);
    if (source.kind === "tiles") {
      const map = source as Partial<EarthMapSource>;
      if (typeof map.layer !== "string" || !LAYERS.includes(map.layer)) throw new TypeError(`source "${id}": a map source names its layer ("day", "night", "clouds" or "water", or "*" for a folder of them), not ${JSON.stringify(map.layer)}`);
    }
    return source;
  };

  const remove = (id: string): boolean => {
    const at = list.findIndex((source) => source.info.id === id);
    if (at < 0) return false;
    list.splice(at, 1);
    off.delete(id);
    release(id);
    notify();
    return true;
  };

  return {
    get sources() {
      return [...list];
    },
    addSource(source) {
      const one = check(source);
      list.push(one);
      if (inUse(one)) start(one);
      notify();
      return () => void remove(one.info.id);
    },
    removeSource: remove,
    enableSource(id, on) {
      const source = list.find((one) => one.info.id === id);
      if (source === undefined || off.has(id) === !on) return;
      if (on) {
        off.delete(id);
        if (inUse(source)) start(source);
      } else {
        off.add(id);
        release(id);
      }
      notify();
    },
    isEnabled: (id) => list.some((source) => source.info.id === id) && !off.has(id),
    ownOnly(on) {
      if (on === onlyOwn) return;
      onlyOwn = on;
      for (const source of list) {
        if (isOwn(source) || off.has(source.info.id)) continue;
        if (on) release(source.info.id);
        else start(source);
      }
      notify();
    },
    get onlyOwn() {
      return onlyOwn;
    },
    active,
    mapSources: (layer) =>
      active()
        .filter((source): source is EarthMapSource => source.kind === "tiles" && ((source as EarthMapSource).layer === layer || (source as EarthMapSource).layer === "*"))
        .reverse(),
    elementLists: () => active().flatMap((source) => (source.kind === "records" && reads.get(source.info.id)?.status === "ok" ? [{ id: source.info.id, sets: reads.get(source.info.id)!.records as readonly ElementSet[] }] : [])),
    isOwn,
    get: (id) => list.find((source) => source.info.id === id),
    signal: (id) => controllerOf(id).signal,
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    stats() {
      const records: SourceStats["records"] = {};
      for (const [id, read] of reads) records[id] = { status: read.status, kept: read.records.length, skipped: read.skipped };
      return { records };
    },
    get version() {
      return version;
    },
    async ready() {
      await Promise.all([...reading]);
    },
    dispose() {
      if (gone) return;
      gone = true;
      for (const source of [...list]) release(source.info.id);
      for (const id of [...controllers.keys()]) release(id);
      list.length = 0;
      listeners.clear();
    },
  };
}

/**
 * The credits of a view for the last drawn frame: the package's own first, then the sources a caller added, each with the marks or tiles it gave; a source that gave none is left out.
 *
 * @param own - The package's own credits (`ownCredit`), with how many marks each gave.
 * @param book - The view's sources.
 * @param used - How many marks or tiles each source of the book gave, by id.
 * @returns The credits, own first, in a stable order.
 *
 * @example
 * ```ts
 * import { createSourceBook, creditsOf, ownCredit } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const book = createSourceBook();
 * console.log(creditsOf([ownCredit("chikyu-pictures", 1)], book, new Map()).length);
 * ```
 */
export function creditsOf(own: readonly Credit[], book: SourceBook, used: ReadonlyMap<string, number>): Credit[] {
  const mine = own.filter((credit) => credit.used > 0);
  const theirs: Credit[] = [];
  const named = new Set(mine.map((credit) => credit.source.id));
  for (const source of book.active()) {
    const count = used.get(source.info.id) ?? 0;
    if (count <= 0) continue;
    const credit: Credit = { source: source.info as SourceInfo, own: book.isOwn(source), used: count };
    if (credit.own) {
      const held = mine.findIndex((one) => one.source.id === credit.source.id);
      if (held >= 0) mine[held] = { ...mine[held]!, used: mine[held]!.used + count };
      else mine.push(credit);
    } else if (!named.has(credit.source.id)) theirs.push(credit);
  }
  return [...mine, ...theirs];
}
