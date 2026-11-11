// Makes the files of the whole Earth-orbit catalogue the site hosts (demo/catalogue/): four packed groups (working satellites, inactive payloads, rocket bodies, debris) and manifest.json.
//   node scripts/catalogue.ts fetch                          the scheduled build's job: one Space-Track login, ONE gp ask (every object on orbit), a pause, ONE satcat ask (only after 17:00 UTC), then ONE CelesTrak ask for the
//                                                            list of working satellites; stops at the first answer that is not 200 and keeps the last files, saying their age. Needs SPACETRACK_USER and SPACETRACK_PASSWORD
//   node scripts/catalogue.ts previous <address or directory> carry the files already on the site into demo/catalogue when they are newer than the ones there; asks nobody but the site itself
//   node scripts/catalogue.ts from-files <gp.json> <satcat.json or -> <active.csv or -> <time retrieved, UTC>   make the files from files already downloaded; fetches nothing (a test, or a first run by hand)
//   node scripts/catalogue.ts check <dir> [--optional]       the files hold what the site needs: exits with 1 if not (`--optional` passes when there are no files at all)
// Space-Track's terms (documentation page, read 2026-11-11): TLEs, OMMs, SATCAT and decay data are "basic SSA data", which USSPACECOM has approved for redistribution "conditioned on appropriate citation"; the files carry
// "Data from Space-Track.org (USSPACECOM)" in their manifest. The GP class is asked once an hour at most and SATCAT once a day after 17:00 UTC; fewer than 30 requests a minute and 300 an hour. This script asks twice.
// Space-Track has no field that says whether a payload still works, so the split into working and inactive payloads takes CelesTrak's `active` list as a list of catalogue numbers only (nothing else of it is kept).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { MAX_PACKED, gzipBytes, packCatalogue, unpackAny, type CatalogueRecord } from "../src/catalogue/pack.ts";
import { catalogueRecordsFromRows } from "../src/catalogue/omm.ts";
import { readKind, type ObjectKind } from "../src/catalogue/kinds.ts";
import { CITATION, FIELDS, loginFrom, realSend, withSession, type Login, type Send } from "./spacetrack.ts";

export const SOURCE = "Space-Track.org (USSPACECOM)";
export const USER_AGENT = "chikyu-earth-catalogue (+https://github.com/johnmorrisdotca/chikyu-earth)";
/** The groups the site hosts, in the order a page lists them. */
export const GROUPS = [
  { id: "working", en: "Working satellites", ja: "運用中の人工衛星" },
  { id: "inactive", en: "Inactive payloads", ja: "運用を終えた人工衛星" },
  { id: "rocket-bodies", en: "Rocket bodies", ja: "ロケット本体" },
  { id: "debris", en: "Debris and unidentified objects", ja: "デブリと種類不明の物体" },
] as const;
export type GroupId = (typeof GROUPS)[number]["id"];
/** Where CelesTrak's list of active satellites is (one ask, as numbers only). */
export const ACTIVE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=csv";
export const WORKING_SOURCE = "CelesTrak (https://celestrak.org) list of active satellites, used for the catalogue numbers only";
/** The pause between the two Space-Track asks, and before CelesTrak's. */
export const SPACING_MS = 15_000;
/** SATCAT is asked once a day after this hour, UTC (Space-Track's rule). */
export const SATCAT_AFTER_UTC_HOUR = 17;
/** A file set older than this is not fit to publish. */
export const MAX_AGE_MS = 30 * 86_400_000;
export const GP_FIELDS = [...FIELDS, "OBJECT_TYPE", "COUNTRY_CODE", "LAUNCH_DATE", "RCS_SIZE"] as const;

/** Every object on orbit with elements: Space-Track's documented filter ("only propagable ephemerides for on-orbit objects"), the newest set of each, only the fields the packed files keep. */
export const GP_PATH = `/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/orderby/NORAD_CAT_ID%20asc/predicates/${GP_FIELDS.join(",")}/format/json`;
/** The catalogue of objects still on orbit: kind, owner, launch date and radar size. */
export const SATCAT_PATH = "/basicspacedata/query/class/satcat/CURRENT/Y/DECAY/null-val/orderby/NORAD_CAT_ID%20asc/format/json";

export interface Extra {
  type?: string;
  owner?: string;
  launch?: string;
  size?: string;
}
/** What Space-Track's SATCAT says of each object, by catalogue number. The field names are tolerant of the two spellings the API has used. */
export function satcatInfo(rows: readonly Record<string, unknown>[]): Map<number, Extra> {
  const out = new Map<number, Extra>();
  const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  for (const row of rows) {
    const id = Number(row["NORAD_CAT_ID"] ?? row["OBJECT_NUMBER"]);
    if (!Number.isInteger(id) || id < 0) continue;
    const extra: Extra = {};
    const type = text(row["OBJECT_TYPE"]);
    const owner = text(row["COUNTRY"] ?? row["COUNTRY_CODE"]);
    const launch = text(row["LAUNCH"] ?? row["LAUNCH_DATE"]);
    const size = text(row["RCS_SIZE"]);
    if (type) extra.type = type;
    if (owner) extra.owner = owner;
    if (launch) extra.launch = launch;
    if (size) extra.size = size;
    out.set(id, extra);
  }
  return out;
}

/** The catalogue numbers in CelesTrak's CSV (a header row with a NORAD_CAT_ID column). */
export function workingIds(csv: string): Set<number> {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const column = (lines[0] ?? "").split(",").map((cell) => cell.trim()).indexOf("NORAD_CAT_ID");
  if (column < 0) throw new Error("the list has no NORAD_CAT_ID column");
  const ids = new Set<number>();
  for (const line of lines.slice(1)) {
    const id = Number(line.split(",")[column]);
    if (Number.isInteger(id) && id >= 0) ids.add(id);
  }
  return ids;
}

/** Which group a record belongs in. Payloads split on `working`; rocket bodies and debris have their own; unidentified objects join the debris (their kind stays `UNK` inside the file). */
export function groupOf(kind: ObjectKind, id: number, working: ReadonlySet<number>): GroupId {
  if (kind === "PAY") return working.has(id) ? "working" : "inactive";
  if (kind === "RB") return "rocket-bodies";
  return "debris";
}

const epochOf = (record: CatalogueRecord): number => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(record.set.EPOCH) ? record.set.EPOCH : `${record.set.EPOCH}Z`);

export interface Previous {
  retrieved: string;
  /** Every record the last files held, by catalogue number. */
  records: Map<number, CatalogueRecord>;
  working: Set<number>;
}

export interface Built {
  groups: Record<GroupId, CatalogueRecord[]>;
  retrieved: string;
  satcat: string | null;
  working: { source: string; retrieved: string };
  skipped: number;
  /** Objects with no kind from the catalogue. */
  log: string[];
}

/**
 * Split Space-Track's answers into the four groups. One record for each catalogue number (the newest epoch wins). The kind, owner, launch and radar size the GP rows carry are filled from SATCAT where a row has none, and from
 * the last files where SATCAT was not asked. A payload is working when `working` holds its number.
 *
 * @param inputs - The GP rows, SATCAT's rows (undefined when not asked), the working numbers and the previous files.
 * @param retrieved - The time, `yyyy-mm-ddThh:mmZ`.
 * @returns The groups, and what happened.
 */
export function buildGroups(inputs: { gp: readonly unknown[]; satcat?: readonly Record<string, unknown>[]; working: ReadonlySet<number>; workingFrom?: string; previous?: Previous }, retrieved: string): Built {
  const log: string[] = [];
  const read = catalogueRecordsFromRows(inputs.gp);
  const best = new Map<number, CatalogueRecord>();
  for (const record of read.records) {
    const held = best.get(record.set.NORAD_CAT_ID);
    if (!held || epochOf(record) > epochOf(held)) best.set(record.set.NORAD_CAT_ID, record);
  }
  const info = inputs.satcat ? satcatInfo(inputs.satcat) : undefined;
  let filled = 0;
  for (const [id, record] of best) {
    const extra = info?.get(id);
    const before = inputs.previous?.records.get(id);
    if (record.kind === "UNK" && extra?.type) record.kind = readKind(extra.type);
    if (!record.owner) {
      const owner = extra?.owner ?? before?.owner;
      if (owner) record.owner = owner;
    }
    if (!record.launch) {
      const launch = extra?.launch?.slice(0, 10) ?? before?.launch;
      if (launch) record.launch = launch;
    }
    if (!record.size) {
      const size = (extra?.size ?? "").trim().toUpperCase().slice(0, 1);
      const kept = size === "S" || size === "M" || size === "L" ? size : before?.size;
      if (kept) record.size = kept as "S" | "M" | "L";
    }
    if (extra || before) filled += 1;
  }
  const groups: Record<GroupId, CatalogueRecord[]> = { working: [], inactive: [], "rocket-bodies": [], debris: [] };
  for (const [id, record] of best) groups[groupOf(record.kind, id, inputs.working)].push(record);
  log.push(`${best.size} objects with public elements (${read.skipped} rows left out for a missing number); ${filled} with owner and launch details from ${info ? "SATCAT" : "the last files"}`);
  return {
    groups,
    retrieved,
    satcat: info ? retrieved : null,
    working: { source: WORKING_SOURCE, retrieved: inputs.workingFrom ?? retrieved },
    skipped: read.skipped,
    log,
  };
}

export interface Manifest {
  format: "cpk1";
  source: string;
  citation: string;
  /** When the elements were asked of Space-Track. */
  retrieved: string;
  /** When SATCAT was last read for the owner and launch details, or null. */
  satcat: string | null;
  working: { source: string; retrieved: string };
  /** The objects in all groups: catalogued objects with public elements, not everything in orbit. */
  total: number;
  note: string;
  groups: Record<GroupId, { file: string; count: number; bytes: number }>;
}

export const NOTE = "Catalogued objects on orbit with public elements; not everything in orbit. The elements are as old as `retrieved`.";

/** The packed, gzipped files and the manifest for a build. */
export async function packBuilt(built: Built): Promise<{ files: Record<string, Uint8Array>; manifest: Manifest }> {
  const files: Record<string, Uint8Array> = {};
  const groups = {} as Manifest["groups"];
  let total = 0;
  for (const group of GROUPS) {
    const records = built.groups[group.id].sort((a, b) => a.set.NORAD_CAT_ID - b.set.NORAD_CAT_ID);
    if (records.length > MAX_PACKED) throw new Error(`group ${group.id} has ${records.length} records, over ${MAX_PACKED}`);
    const bytes = await gzipBytes(packCatalogue(records, { group: group.id, source: SOURCE, citation: CITATION, retrieved: built.retrieved, count: String(records.length) }));
    const file = `${group.id}.pack.gz`;
    files[file] = bytes;
    groups[group.id] = { file, count: records.length, bytes: bytes.length };
    total += records.length;
  }
  const manifest: Manifest = { format: "cpk1", source: SOURCE, citation: CITATION, retrieved: built.retrieved, satcat: built.satcat, working: built.working, total, note: NOTE, groups };
  return { files, manifest };
}

export function writeAll(dir: string, made: { files: Record<string, Uint8Array>; manifest: Manifest }): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, bytes] of Object.entries(made.files)) writeFileSync(`${dir}/${name}`, bytes);
  writeFileSync(`${dir}/manifest.json`, `${JSON.stringify(made.manifest)}\n`);
}

/** The last files in a directory, or undefined when there are none or they cannot be read. */
export async function readDir(dir: string): Promise<{ manifest: Manifest; previous: Previous } | undefined> {
  try {
    const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8")) as Manifest;
    const records = new Map<number, CatalogueRecord>();
    const working = new Set<number>();
    for (const group of GROUPS) {
      const one = manifest.groups[group.id];
      const file = await unpackAny(new Uint8Array(readFileSync(`${dir}/${one.file}`)));
      for (const record of file.records()) {
        records.set(record.set.NORAD_CAT_ID, record);
        if (group.id === "working") working.add(record.set.NORAD_CAT_ID);
      }
    }
    return { manifest, previous: { retrieved: manifest.retrieved, records, working } };
  } catch {
    return undefined;
  }
}

const hoursOld = (retrieved: string, now: number): number => Math.round((now - Date.parse(retrieved)) / 3_600_000);

export interface Answer {
  status: number;
  text(): Promise<string>;
}

/**
 * Ask for what is due, politely, and make the files. One Space-Track login, one GP ask, a pause, one SATCAT ask (only at or after 17:00 UTC), and one ask of CelesTrak for the working list; any answer that is not 200 stops the asking.
 * If the GP ask fails, nothing is made: `built` is undefined and the log says how old the last files are, so the caller keeps them. If SATCAT is not asked or fails, owner and launch details come from the last files; if CelesTrak's list
 * fails, the working payloads are the ones the last files held as working (and with no last files nothing is made). Nothing is fetched here but through `send` and `ask`, so a test hands it made-up ones.
 *
 * @param last - The last files (what `readDir` found), or undefined.
 * @param login - The Space-Track account, or undefined when there is none.
 * @param send - Sends a Space-Track request.
 * @param ask - Fetches an address on CelesTrak.
 * @param pause - Waits the given milliseconds.
 * @param now - The time, in milliseconds since the Unix epoch.
 * @returns What was built (or not) and the log.
 */
export async function refresh(last: { manifest: Manifest; previous: Previous } | undefined, login: Login | undefined, send: Send, ask: (url: string) => Promise<Answer>, pause: (ms: number) => Promise<void>, now: number): Promise<{ built?: Built; log: string[] }> {
  const log: string[] = [];
  const keep = (why: string): { log: string[] } => {
    log.push(last ? `${why}: the last files are kept, retrieved ${last.manifest.retrieved} (${hoursOld(last.manifest.retrieved, now)} hours old)` : `${why}: there are no last files either`);
    return { log };
  };
  if (!login) return keep("no Space-Track login set (SPACETRACK_USER, SPACETRACK_PASSWORD)");
  const retrieved = `${new Date(now).toISOString().slice(0, 16)}Z`;
  const got: { gp?: Record<string, unknown>[]; satcat?: Record<string, unknown>[] } = {};
  let stopped = false;
  try {
    await withSession(login, send, pause, SPACING_MS, async (spaceTrack) => {
      got.gp = await spaceTrack(GP_PATH);
      log.push(`gp: ${got.gp.length} objects`);
      if (new Date(now).getUTCHours() < SATCAT_AFTER_UTC_HOUR) {
        log.push(`satcat: not asked (it is asked once a day after ${SATCAT_AFTER_UTC_HOUR}:00 UTC); owner and launch details come from the last files`);
        return;
      }
      got.satcat = await spaceTrack(SATCAT_PATH);
      log.push(`satcat: ${got.satcat.length} objects`);
    });
  } catch (error) {
    stopped = true;
    log.push(`Space-Track stopped: ${error instanceof Error ? error.message : String(error)}`);
  }
  const { gp, satcat } = got;
  if (!gp || gp.length === 0) return keep("Space-Track gave no elements");
  let working: Set<number> | undefined;
  let workingFrom: string | undefined;
  if (stopped) log.push("CelesTrak not asked: an answer was not 200, so the asking stops");
  else {
    await pause(SPACING_MS);
    try {
      const answer = await ask(ACTIVE_URL);
      if (answer.status !== 200) log.push(`CelesTrak's active list: answer ${answer.status}`);
      else {
        working = workingIds(await answer.text());
        workingFrom = retrieved;
        log.push(`CelesTrak's active list: ${working.size} numbers`);
      }
    } catch (error) {
      log.push(`CelesTrak's active list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!working && last) {
    working = last.previous.working;
    workingFrom = last.manifest.working.retrieved;
    log.push(`the working payloads are the ${working.size} the last files held as working (${hoursOld(workingFrom, now)} hours old)`);
  }
  if (!working) return keep("there is no list of working satellites to split the payloads by");
  const built = buildGroups({ gp, ...(satcat ? { satcat } : {}), working, ...(workingFrom ? { workingFrom } : {}), ...(last ? { previous: last.previous } : {}) }, retrieved);
  if (!satcat && last?.manifest.satcat) built.satcat = last.manifest.satcat;
  log.push(...built.log);
  return { built, log };
}

/** The reasons a directory of files cannot go on the site (none when it can). */
export async function problems(dir: string, now = Date.now()): Promise<string[]> {
  const out: string[] = [];
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8")) as Manifest;
  } catch {
    return [`${dir}/manifest.json is missing or is not JSON`];
  }
  if (manifest.citation !== CITATION) out.push("the manifest has no citation");
  if (manifest.format !== "cpk1") out.push("the manifest names another format");
  const age = now - Date.parse(manifest.retrieved);
  if (!Number.isFinite(age)) out.push("the manifest has no retrieval time");
  else if (age > MAX_AGE_MS) out.push("the files were retrieved more than 30 days ago");
  let total = 0;
  for (const group of GROUPS) {
    const one = manifest.groups?.[group.id];
    if (!one) {
      out.push(`group ${group.id} is not in the manifest`);
      continue;
    }
    try {
      const file = await unpackAny(new Uint8Array(readFileSync(`${dir}/${one.file}`)));
      if (file.count !== one.count) out.push(`group ${group.id} holds ${file.count} and the manifest says ${one.count}`);
      if (file.count === 0 && group.id !== "debris") out.push(`group ${group.id} is empty`);
      total += file.count;
    } catch (error) {
      out.push(`group ${group.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (total !== manifest.total) out.push(`the groups hold ${total} and the manifest says ${manifest.total}`);
  return out;
}

if (import.meta.main) {
  const [command, one, two, three, four] = process.argv.slice(2);
  const out = new URL("../demo/catalogue/", import.meta.url).pathname.replace(/\/$/, "");
  const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
  if (command === "fetch") {
    const last = await readDir(out);
    const askCelesTrak = (url: string): Promise<Answer> => fetch(url, { headers: { "user-agent": USER_AGENT } });
    const done = await refresh(last, loginFrom(), realSend, askCelesTrak, wait, Date.now());
    for (const line of done.log) console.log(line);
    if (done.built) {
      writeAll(out, await packBuilt(done.built));
      console.log(`wrote ${out}: ${Object.entries(done.built.groups).map(([id, records]) => `${id} ${records.length}`).join(", ")}`);
    } else if (!last) process.exit(1);
  } else if (command === "previous") {
    if (!one) throw new Error("usage: catalogue.ts previous <address or directory>");
    const mine = await readDir(out);
    const here = existsSync(`${one}/manifest.json`);
    let theirs: { files: Record<string, Uint8Array>; manifest: Manifest } | undefined;
    try {
      if (here) {
        const manifest = JSON.parse(readFileSync(`${one}/manifest.json`, "utf8")) as Manifest;
        theirs = { manifest, files: Object.fromEntries(Object.values(manifest.groups).map((group) => [group.file, new Uint8Array(readFileSync(`${one}/${group.file}`))])) };
      } else {
        const base = one.replace(/\/$/, "");
        const get = async (name: string): Promise<Response> => {
          const answer = await fetch(`${base}/${name}`, { headers: { "user-agent": USER_AGENT } });
          if (!answer.ok) throw new Error(`${name}: ${answer.status}`);
          return answer;
        };
        const manifest = (await (await get("manifest.json")).json()) as Manifest;
        const files: Record<string, Uint8Array> = {};
        for (const group of Object.values(manifest.groups)) files[group.file] = new Uint8Array(await (await get(group.file)).arrayBuffer());
        theirs = { manifest, files };
      }
    } catch (error) {
      console.log(`nothing carried from ${one}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (theirs) {
      if (mine && mine.manifest.retrieved >= theirs.manifest.retrieved) console.log(`the files here (${mine.manifest.retrieved}) are as new as the ones at ${one} (${theirs.manifest.retrieved}): kept`);
      else {
        writeAll(out, theirs);
        console.log(`carried ${theirs.manifest.total} objects from ${one}, retrieved ${theirs.manifest.retrieved}`);
      }
    }
  } else if (command === "from-files") {
    if (!one || !two || !three || !four) throw new Error("usage: catalogue.ts from-files <gp.json> <satcat.json or -> <active.csv or -> <time retrieved, UTC, like 2026-11-11T17:41Z>");
    const gp = JSON.parse(readFileSync(one, "utf8")) as unknown[];
    const satcat = two === "-" ? undefined : (JSON.parse(readFileSync(two, "utf8")) as Record<string, unknown>[]);
    const last = await readDir(out);
    const working = three === "-" ? last?.previous.working : workingIds(readFileSync(three, "utf8"));
    if (!working) throw new Error("no list of working satellites: give an active list or have last files");
    const built = buildGroups({ gp, ...(satcat ? { satcat } : {}), working, ...(last ? { previous: last.previous } : {}) }, four);
    writeAll(out, await packBuilt(built));
    for (const line of built.log) console.log(line);
    for (const [id, records] of Object.entries(built.groups)) console.log(`${id}: ${records.length}`);
  } else if (command === "check") {
    const dir = one && one !== "--optional" ? one : out;
    if (process.argv.includes("--optional") && !existsSync(`${dir}/manifest.json`)) {
      console.log("catalogue: no files yet (nothing to check)");
    } else {
      const found = await problems(dir);
      for (const line of found) console.log(line);
      if (found.length) process.exit(1);
      console.log("catalogue ok");
    }
  } else throw new Error("usage: catalogue.ts fetch | previous | from-files | check");
}
