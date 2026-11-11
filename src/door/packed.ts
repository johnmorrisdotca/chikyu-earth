// A record source for a packed catalogue file (`../catalogue/pack.ts`): up to 200,000 objects read once from an address of the page author's choosing. Pure: no DOM, no three.js, no satellite.js.
import { ElementSourceError } from "../satellites/source.ts";
import { MAX_PACKED_BYTES, PackError, unpackAny, type PackedCatalogue } from "../catalogue/pack.ts";
import type { ElementRecordSource } from "./elements.ts";
import type { SourceInfo } from "../data-door.ts";

/**
 * What `packedElementsFrom` can be told. Every one has a safe default.
 *
 * @example
 * ```ts
 * import type { PackedElementsOptions } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const options: PackedElementsOptions = { maxBytes: 30_000_000 };
 * console.log(options.maxBytes);
 * ```
 */
export interface PackedElementsOptions {
  /** The most bytes of answer read (64 MB by default, the most a packed file may unpack to). */
  maxBytes?: number;
  /** The fetch function (the browser's by default). */
  fetch?: typeof fetch;
}

/**
 * A source of element sets read from a packed catalogue file (`packCatalogue`, gzipped or not) at an address you choose: up to 200,000 objects, six-digit catalogue numbers included. The file is asked for once, when the source is added,
 * and nowhere else: no cookies and no referrer are sent, only `https` (or `http` on `localhost`) is used, a redirect or any answer but 200 is a failed read, and an answer over `maxBytes` is refused. Nothing is kept between page loads and
 * nothing is asked on a timer. The package has no address of its own; a site that hosts these files says whose data they are in `info`.
 *
 * @param url - The address of a packed file.
 * @param info - Who the data is: its id, credit, licence and page.
 * @param options - See `PackedElementsOptions`.
 * @returns The source, for `addSource` or `sources`.
 *
 * @example
 * ```ts no-run
 * import { packedElementsFrom } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const debris = packedElementsFrom("https://example.org/catalogue/debris.pack.gz", {
 *   id: "catalogue-debris",
 *   name: { en: "Debris in Earth orbit", ja: "地球周回軌道のデブリ" },
 *   credit: { en: "Data from Space-Track.org (USSPACECOM)", ja: "データ：Space-Track.org（USSPACECOM）" },
 *   licence: { name: "Space-Track basic SSA data, with citation", url: "https://www.space-track.org/documentation" },
 *   url: "https://www.space-track.org",
 *   retrieved: "2026-11-11",
 * });
 * console.log(debris.info.id);
 * ```
 */
export function packedElementsFrom(url: string, info: SourceInfo, options: PackedElementsOptions = {}): ElementRecordSource {
  return {
    kind: "records",
    info,
    async records(signal) {
      return (await readPackedFrom(url, { ...options, signal })).sets();
    },
  };
}

/**
 * Ask an address for a packed catalogue file once and read it. This is what `packedElementsFrom` does; use it when a page wants the whole record (kind, owner, launch) and not just the element sets.
 *
 * @param url - The address of a packed file.
 * @param options - See `PackedElementsOptions`, and a signal that stops the read.
 * @returns The file, by column.
 *
 * @example
 * ```ts no-run
 * import { readPackedFrom } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * const file = await readPackedFrom("https://example.org/catalogue/rocket-bodies.pack.gz");
 * console.log(file.count, file.meta["retrieved"], file.kindAt(0));
 * ```
 */
export async function readPackedFrom(url: string, options: PackedElementsOptions & { signal?: AbortSignal } = {}): Promise<PackedCatalogue> {
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    throw new ElementSourceError("that is not an address");
  }
  const local = address.hostname === "localhost" || address.hostname === "127.0.0.1" || address.hostname === "[::1]";
  if (address.protocol !== "https:" && !(address.protocol === "http:" && local)) throw new ElementSourceError("only https addresses are used (http only on localhost)");
  const maxBytes = options.maxBytes ?? MAX_PACKED_BYTES;
  const ask = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await ask(address.href, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: options.signal ?? null });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ElementSourceError(`the source could not be reached: ${error instanceof Error ? error.message : "no answer"}`);
  }
  if (response.status !== 200) throw new ElementSourceError(`the source answered ${response.status}`, { status: response.status });
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new ElementSourceError("the answer is bigger than the limit");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new ElementSourceError("the answer is bigger than the limit");
  try {
    return await unpackAny(bytes);
  } catch (error) {
    if (error instanceof PackError) throw new ElementSourceError(`the file could not be read: ${error.message}`);
    throw error;
  }
}

