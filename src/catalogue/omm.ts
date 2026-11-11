// Catalogue records from what a source serves: OMM as JSON or CSV with the fields of Space-Track's GP class (OBJECT_TYPE, COUNTRY_CODE, LAUNCH_DATE, RCS_SIZE) beside the orbital elements. Pure.
import { cellsOf, toElementSet } from "../satellites/source.ts";
import { readKind } from "./kinds.ts";
import type { CatalogueRecord, RadarSize } from "./pack.ts";

/** The radar size a source writes (`SMALL`, `MEDIUM`, `LARGE`, or one letter), or undefined. */
function readSize(value: unknown): RadarSize | undefined {
  const letter = typeof value === "string" ? value.trim().toUpperCase().slice(0, 1) : "";
  return letter === "S" || letter === "M" || letter === "L" ? letter : undefined;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A launch date as `yyyy-mm-dd`, or the year when only that is given, or "" when the source says nothing usable. */
function readLaunch(value: unknown): string {
  const match = /^(\d{4})(?:-(\d\d)-(\d\d))?/.exec(text(value));
  if (!match) return "";
  return match[2] ? `${match[1]}-${match[2]}-${match[3]}` : match[1]!;
}

/**
 * What `readCatalogueRecords` found: the records that can be used, and how many were left out (a number missing or not a number, or an orbit that is not an ellipse).
 *
 * @example
 * ```ts
 * import type { CatalogueRead } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const say = (read: CatalogueRead): string => `${read.records.length} kept, ${read.skipped} left out`;
 * console.log(typeof say);
 * ```
 */
export interface CatalogueRead {
  records: CatalogueRecord[];
  skipped: number;
}

/**
 * Read catalogue records from OMM text, as JSON (a list of objects) or CSV (a header row, then a row for each object). Each row's elements are read as `parseElements` reads them, and `OBJECT_TYPE` (`PAYLOAD`, `ROCKET BODY`, `DEBRIS`,
 * `UNKNOWN`, `TBA`), `COUNTRY_CODE`, `LAUNCH_DATE` and `RCS_SIZE` give the kind, owner, launch and radar size where the row has them. Six-digit and longer catalogue numbers are read as they are: OMM carries them where a TLE cannot.
 * It throws if the text is neither JSON nor CSV with a header.
 *
 * @param input - What the source answered.
 * @returns The records, and the count left out.
 *
 * @example
 * ```ts
 * import { readCatalogueRecords } from "@johnmorrisdotca/chikyu-earth/catalogue";
 *
 * const csv = [
 *   "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,NORAD_CAT_ID,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT,OBJECT_TYPE,COUNTRY_CODE,LAUNCH_DATE,RCS_SIZE",
 *   "MADE-UP DEB,2026-002B,2026-11-08T04:12:35,14.9,0.01,82,10,90,20,1000001,0.0001,0.00001,0,DEBRIS,US,2026-02-01,SMALL",
 * ].join("\n");
 * const { records } = readCatalogueRecords(csv);
 * console.log(records[0]?.set.NORAD_CAT_ID, records[0]?.kind, records[0]?.owner, records[0]?.size);
 * ```
 */
export function readCatalogueRecords(input: string): CatalogueRead {
  const body = input.replace(/^\uFEFF/, "").trim();
  let rows: unknown[];
  if (body.startsWith("[") || body.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error("the text looks like JSON but is not");
    }
    rows = Array.isArray(json) ? json : [json];
  } else {
    const lines = body.split(/\r?\n/).filter((line) => line.trim() !== "");
    const header = cellsOf(lines[0] ?? "").map((cell) => cell.trim());
    if (!header.includes("NORAD_CAT_ID") || !header.includes("MEAN_MOTION")) throw new Error("the text is not OMM JSON or OMM CSV");
    rows = lines.slice(1).map((line) => Object.fromEntries(cellsOf(line).map((cell, index) => [header[index] ?? `#${index}`, cell])));
  }
  return catalogueRecordsFromRows(rows);
}

/**
 * The records in rows already read from JSON: the same as `readCatalogueRecords` without the text step. Not part of the entry point; the refresh script uses it on Space-Track's answer.
 *
 * @param rows - OMM objects with their text or number fields.
 * @returns The records and the count left out.
 */
export function catalogueRecordsFromRows(rows: readonly unknown[]): CatalogueRead {
  const records: CatalogueRecord[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      skipped += 1;
      continue;
    }
    const fields = row as Record<string, unknown>;
    const set = toElementSet(fields);
    if (typeof set === "string") {
      skipped += 1;
      continue;
    }
    const record: CatalogueRecord = { set, kind: readKind(text(fields["OBJECT_TYPE"])) };
    const owner = text(fields["COUNTRY_CODE"]);
    const launch = readLaunch(fields["LAUNCH_DATE"]);
    const size = readSize(fields["RCS_SIZE"]);
    if (owner) record.owner = owner;
    if (launch) record.launch = launch;
    if (size) record.size = size;
    records.push(record);
  }
  return { records, skipped };
}
