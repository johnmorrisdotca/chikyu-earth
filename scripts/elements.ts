// Makes the demo's satellite files (demo/elements/) from CelesTrak's lists.
//   node scripts/elements.ts from-dir <dir> <time retrieved, UTC>   a directory with one file per list, named <list>.json (gps-ops.json) and catnr-<number>.json; fetches nothing
//   node scripts/elements.ts previous <address or directory>        carry the files already on the site (or in a directory) into demo/elements, when they are newer than the ones there; asks CelesTrak for nothing
//   node scripts/elements.ts fetch                                  download each list once and make the files; the scheduled build's job (see "fetch" below)
//   node scripts/elements.ts check <dir>                            the files hold what the site needs: exits with 1 if not
// The groups come from src/satellites/catalogue.ts. Each group becomes <id>.json (rows of numbers and names, no field names repeated), plus manifest.json (what exists and how old)
// and index.json (every name in every file, for the demo's Find box).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { SATELLITE_GROUPS, type SatelliteGroupInfo } from "../src/satellites/catalogue.ts";

export const FIELDS = ["NORAD_CAT_ID", "OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"] as const;
/** Groups too big to ship whole: the demo keeps every Nth satellite (by catalogue number). */
export const THIN: Readonly<Record<string, number>> = { starlink: 5 };
export const SOURCE = "CelesTrak (https://celestrak.org): GP element sets from the U.S. Space Force's 18th Space Defense Squadron and, for Starlink, SpaceX's own supplemental elements";
/** CelesTrak's usage policy (read 2026-11-03): GP data change once every 2 hours and a list is downloaded once per update; directory-style asks no more than once an hour. A list is not asked for again within this time. */
export const MIN_AGE_MS = 110 * 60_000;
/** The pause between two downloads. */
export const SPACING_MS = 6000;
export const USER_AGENT = "chikyu-earth-demo (+https://github.com/johnmorrisdotca/chikyu-earth; john@johnmorris.ca)";

export interface Raw {
  NORAD_CAT_ID: number;
  OBJECT_NAME: string;
  [field: string]: unknown;
}
export interface GroupFile {
  id: string;
  retrieved: string;
  /** How many satellites the list held; `rows` may be fewer when the group is thinned. */
  all: number;
  fields: readonly string[];
  rows: (string | number)[][];
}
export interface Manifest {
  source: string;
  /** The oldest retrieval time of any group. */
  retrieved: string;
  groups: Record<string, { file: string; retrieved: string; count: number; all: number }>;
  index: string;
}

export function buildGroup(group: SatelliteGroupInfo, raw: readonly Raw[], retrieved: string): GroupFile {
  const every = THIN[group.id] ?? 1;
  const seen = new Set<number>();
  const sorted = raw.filter((set) => !seen.has(set.NORAD_CAT_ID) && seen.add(set.NORAD_CAT_ID)).sort((x, y) => x.NORAD_CAT_ID - y.NORAD_CAT_ID);
  const rows = sorted.filter((_, index) => index % every === 0).map((set) => FIELDS.map((field) => set[field] as string | number));
  return { id: group.id, retrieved, all: sorted.length, fields: FIELDS, rows };
}

/** Every group's file, the manifest and the index. `read` gives a group's raw sets (undefined when it was not downloaded: the group is left out). */
export function buildAll(read: (group: SatelliteGroupInfo) => { raw: readonly Raw[]; retrieved: string } | { file: GroupFile } | undefined): { files: Record<string, unknown>; manifest: Manifest } {
  const files: Record<string, unknown> = {};
  const groups: Manifest["groups"] = {};
  const names: [number, string, string][] = [];
  const named = new Set<number>();
  let oldest = "";
  for (const group of SATELLITE_GROUPS) {
    const got = read(group);
    if (!got) continue;
    if ("raw" in got && got.raw.length === 0) continue;
    const file = "file" in got ? got.file : buildGroup(group, got.raw, got.retrieved);
    const retrieved = file.retrieved;
    files[`${group.id}.json`] = file;
    groups[group.id] = { file: `${group.id}.json`, retrieved, count: file.rows.length, all: file.all };
    if (!oldest || retrieved < oldest) oldest = retrieved;
    for (const row of file.rows) {
      const id = row[0] as number;
      if (named.has(id)) continue;
      named.add(id);
      names.push([id, row[1] as string, group.id]);
    }
  }
  files["index.json"] = { fields: ["NORAD_CAT_ID", "OBJECT_NAME", "group"], rows: names };
  return { files, manifest: { source: SOURCE, retrieved: oldest, groups, index: "index.json" } };
}

export function writeAll(out: string, built: ReturnType<typeof buildAll>): void {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [name, content] of Object.entries(built.files)) writeFileSync(`${out}/${name}`, `${JSON.stringify(content)}\n`);
  writeFileSync(`${out}/manifest.json`, `${JSON.stringify(built.manifest)}\n`);
}

const readJson = <T>(path: string): T | undefined => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
};

/** The lists to ask CelesTrak for, one request each: a list by name, or one satellite by number. */
export function plan(): { key: string; url: string }[] {
  const base = "https://celestrak.org/NORAD/elements/gp.php";
  const asks = new Map<string, string>();
  for (const group of SATELLITE_GROUPS) {
    if (group.celestrak) asks.set(group.celestrak, `${base}?GROUP=${encodeURIComponent(group.celestrak)}&FORMAT=json`);
    for (const number of group.catnr ?? []) asks.set(`catnr-${number}`, `${base}?CATNR=${number}&FORMAT=json`);
  }
  return [...asks].map(([key, url]) => ({ key, url }));
}

export interface Answer {
  status: number;
  json(): Promise<unknown>;
}

/**
 * Download what is due, politely: each list once, a pause between lists, and stop at the first answer that is not 200 (CelesTrak's rule for software), keeping what was already downloaded and leaving every other
 * group as it was. A group that was retrieved less than `MIN_AGE_MS` ago is not asked for again. Nothing is fetched here but through `ask`, so a test hands it a made-up one.
 *
 * @param previous - The files made last time (the ones to keep and to date the next ask by).
 * @param ask - Fetches an address: `fetch` with the user agent, or a made-up one.
 * @param pause - Waits the given milliseconds.
 * @param now - The time, in milliseconds since the Unix epoch.
 * @returns The files and manifest, and what happened.
 */
export async function refresh(previous: { files: Record<string, GroupFile>; manifest: Manifest } | undefined, ask: (url: string) => Promise<Answer>, pause: (ms: number) => Promise<void>, now: number): Promise<{ built: ReturnType<typeof buildAll>; log: string[] }> {
  const log: string[] = [];
  const got = new Map<string, Raw[]>();
  const due = (group: SatelliteGroupInfo): boolean => {
    const was = previous?.manifest.groups[group.id]?.retrieved;
    return !was || now - Date.parse(was) >= MIN_AGE_MS;
  };
  const wanted = SATELLITE_GROUPS.filter(due);
  const keys = new Set(wanted.flatMap((group) => (group.celestrak ? [group.celestrak] : (group.catnr ?? []).map((number) => `catnr-${number}`))));
  let first = true;
  for (const item of plan()) {
    if (!keys.has(item.key)) continue;
    if (!first) await pause(SPACING_MS);
    first = false;
    let answer: Answer;
    try {
      answer = await ask(item.url);
    } catch (error) {
      log.push(`stopped at ${item.key}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
    if (answer.status !== 200) {
      log.push(`stopped at ${item.key}: answer ${answer.status}`);
      break;
    }
    try {
      const body = await answer.json();
      if (!Array.isArray(body)) throw new Error("not a list");
      got.set(item.key, body as Raw[]);
      log.push(`${item.key}: ${(body as unknown[]).length}`);
    } catch (error) {
      log.push(`stopped at ${item.key}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  const retrieved = new Date(now).toISOString().slice(0, 16) + "Z";
  const built = buildAll((group) => {
    const keys = group.celestrak ? [group.celestrak] : (group.catnr ?? []).map((number) => `catnr-${number}`);
    if (keys.every((key) => got.has(key))) return { raw: keys.flatMap((key) => got.get(key)!), retrieved };
    const kept = previous?.files[group.id];
    return kept ? { file: kept } : undefined;
  });
  return { built, log };
}

/** What a directory of made files holds, or undefined when it holds none. */
export function readDir(dir: string): { files: Record<string, GroupFile>; manifest: Manifest } | undefined {
  const manifest = readJson<Manifest>(`${dir}/manifest.json`);
  if (!manifest) return undefined;
  const files: Record<string, GroupFile> = {};
  for (const [id, one] of Object.entries(manifest.groups)) {
    const file = readJson<GroupFile>(`${dir}/${one.file}`);
    if (file) files[id] = file;
  }
  return { files, manifest };
}

/** The reasons a directory of files cannot go on the site (none when it can). */
export function problems(dir: string, now = Date.now()): string[] {
  const out: string[] = [];
  const made = readDir(dir);
  if (!made) return [`${dir}/manifest.json is missing or is not JSON`];
  const ids = SATELLITE_GROUPS.map((group) => group.id);
  for (const id of ids) {
    const file = made.files[id];
    if (!file) out.push(`group ${id} has no file`);
    else {
      if (file.rows.length === 0) out.push(`group ${id} is empty`);
      if (file.fields.join() !== FIELDS.join()) out.push(`group ${id} has other fields`);
      if (file.rows.some((row) => row.length !== FIELDS.length)) out.push(`group ${id} has a short row`);
      const age = now - Date.parse(file.retrieved);
      if (!Number.isFinite(age)) out.push(`group ${id} has no retrieval time`);
      else if (age > 30 * 86_400_000) out.push(`group ${id} was retrieved more than 30 days ago`);
    }
  }
  const index = readJson<{ rows: unknown[] }>(`${dir}/${made.manifest.index}`);
  if (!index || index.rows.length < ids.length * 2) out.push("the index of names is missing or short");
  return out;
}

if (import.meta.main) {
  const [command, one, two] = process.argv.slice(2);
  const out = new URL("../demo/elements/", import.meta.url).pathname.replace(/\/$/, "");
  if (command === "from-dir") {
    if (!one || !two) throw new Error("usage: elements.ts from-dir <dir> <time retrieved, UTC, like 2026-11-03T16:00Z>");
    const load = (name: string): Raw[] => JSON.parse(readFileSync(`${one}/${name}`, "utf8")) as Raw[];
    const built = buildAll((group) => {
      try {
        const raw = group.celestrak ? load(`${group.celestrak}.json`) : (group.catnr ?? []).flatMap((number) => load(`catnr-${number}.json`));
        return { raw, retrieved: two };
      } catch {
        return undefined;
      }
    });
    writeAll(out, built);
    for (const [id, made] of Object.entries(built.manifest.groups)) console.log(`${id}: ${made.count} of ${made.all}`);
  } else if (command === "previous") {
    if (!one) throw new Error("usage: elements.ts previous <address or directory>");
    const mine = readDir(out);
    const here = existsSync(`${one}/manifest.json`);
    const theirs = here ? readDir(one) : await (async () => {
      const get = async (name: string): Promise<unknown> => {
        const answer = await fetch(`${one.replace(/\/$/, "")}/${name}`);
        if (!answer.ok) throw new Error(`${name}: ${answer.status}`);
        return answer.json();
      };
      try {
        const manifest = (await get("manifest.json")) as Manifest;
        const files: Record<string, GroupFile> = {};
        for (const [id, made] of Object.entries(manifest.groups)) files[id] = (await get(made.file)) as GroupFile;
        return { files, manifest, index: await get(manifest.index) };
      } catch (error) {
        console.log(`nothing carried from ${one}: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      }
    })();
    if (!theirs) process.exit(0);
    if (mine && mine.manifest.retrieved >= theirs.manifest.retrieved) console.log(`the files here (${mine.manifest.retrieved}) are as new as the ones at ${one} (${theirs.manifest.retrieved}): kept`);
    else {
      const built = buildAll((group) => (theirs.files[group.id] ? { file: theirs.files[group.id]! } : undefined));
      writeAll(out, built);
      console.log(`carried ${Object.keys(built.manifest.groups).length} groups from ${one}, retrieved ${built.manifest.retrieved}`);
    }
  } else if (command === "fetch") {
    const previous = readDir(out);
    const ask = (url: string): Promise<Answer> => fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
    const { built, log } = await refresh(previous, ask, (ms) => new Promise((done) => setTimeout(done, ms)), Date.now());
    for (const line of log) console.log(line);
    if (log.some((line) => line.startsWith("stopped"))) console.log("CelesTrak did not answer 200: stopped asking, the other groups keep their last files");
    writeAll(out, built);
  } else if (command === "check") {
    const found = problems(one ?? out);
    for (const line of found) console.log(line);
    if (found.length) process.exit(1);
    console.log("elements ok");
  } else throw new Error("usage: elements.ts from-dir | previous | fetch | check");
}
