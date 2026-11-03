// Makes the demo's satellite files (demo/elements/) from CelesTrak's lists. This script never fetches by itself in `from-dir`; `fetch` (below) is the polite downloader the scheduled build uses.
//   node scripts/elements.ts from-dir <dir> <time retrieved, UTC>   a directory with one file per list, named <list>.json (gps-ops.json) and catnr-<number>.json
// The groups come from src/satellites/catalogue.ts. Each group becomes <id>.json (rows of numbers and names, no field names repeated), plus manifest.json (what exists and how old)
// and index.json (every name in every file, for the demo's Find box).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { SATELLITE_GROUPS, type SatelliteGroupInfo } from "../src/satellites/catalogue.ts";

export const FIELDS = ["NORAD_CAT_ID", "OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"] as const;
/** Groups too big to ship whole: the demo keeps every Nth satellite (by catalogue number). */
export const THIN: Readonly<Record<string, number>> = { starlink: 5 };
export const SOURCE = "CelesTrak (https://celestrak.org): GP element sets from the U.S. Space Force's 18th Space Defense Squadron and, for Starlink, SpaceX's own supplemental elements";

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
export function buildAll(read: (group: SatelliteGroupInfo) => { raw: readonly Raw[]; retrieved: string } | undefined): { files: Record<string, unknown>; manifest: Manifest } {
  const files: Record<string, unknown> = {};
  const groups: Manifest["groups"] = {};
  const names: [number, string, string][] = [];
  const named = new Set<number>();
  let oldest = "";
  for (const group of SATELLITE_GROUPS) {
    const got = read(group);
    if (!got || got.raw.length === 0) continue;
    const file = buildGroup(group, got.raw, got.retrieved);
    files[`${group.id}.json`] = file;
    groups[group.id] = { file: `${group.id}.json`, retrieved: got.retrieved, count: file.rows.length, all: file.all };
    if (!oldest || got.retrieved < oldest) oldest = got.retrieved;
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

if (import.meta.main) {
  const [command, dir, retrieved] = process.argv.slice(2);
  if (command !== "from-dir" || !dir || !retrieved) throw new Error("usage: elements.ts from-dir <dir> <time retrieved, UTC, like 2026-11-03T16:00Z>");
  const load = (name: string): Raw[] => JSON.parse(readFileSync(`${dir}/${name}`, "utf8")) as Raw[];
  const built = buildAll((group) => {
    try {
      const raw = group.celestrak ? load(`${group.celestrak}.json`) : (group.catnr ?? []).flatMap((number) => load(`catnr-${number}.json`));
      return { raw, retrieved };
    } catch {
      return undefined;
    }
  });
  writeAll(new URL("../demo/elements/", import.meta.url).pathname, built);
  for (const [id, one] of Object.entries(built.manifest.groups)) console.log(`${id}: ${one.count} of ${one.all}`);
}
