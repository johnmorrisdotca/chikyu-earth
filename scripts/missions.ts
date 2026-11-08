// Makes the mission files: the Space Shuttle flights' facts from NASA's mission pages, and each flight's historical element sets from Space-Track. Both are run by hand, once; the results are committed.
//   node scripts/missions.ts facts                   read NASA's page for each flight (public domain; a pause between pages) and write test/recorded/nasa-sts-<date>.json, the source list the package's facts are held to
//   node scripts/missions.ts clean                   drop, from demo/missions/, the orbiter's element sets that are dated before its liftoff or long after its landing, and those that disagree with both neighbours (a typed-over number)
//   node scripts/missions.ts elements                SATCAT and gp_history from Space-Track (the login from SPACETRACK_USER/SPACETRACK_PASSWORD or ~/.config/spacetrack/spacetrack.env), thinned, into demo/missions/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FIELDS, USER_AGENT } from "./elements.ts";
import { missionElements, missionOf, missionPosition, type MissionFile } from "../src/satellites/missions.ts";
import { loginFrom, realSend, toRaw, withSession, type Raw } from "./spacetrack.ts";

/** Every flight in launch order, as NASA's page names it (`https://www.nasa.gov/mission/sts-<this>/`). */
export const FLIGHTS = "1 2 3 4 5 6 7 8 9 41b 41c 41d 41g 51a 51c 51d 51b 51g 51f 51i 51j 61a 61b 61c 51l 26 27 29 30 28 34 33 32 36 31 41 38 35 37 39 40 43 48 44 42 45 49 50 46 47 52 53 54 56 55 57 51 58 61 60 62 59 65 64 68 66 63 67 71 70 69 73 74 72 75 76 77 78 79 80 81 82 83 84 94 85 86 87 89 90 91 95 88 96 93 103 99 101 106 92 97 98 102 100 104 105 108 109 110 111 112 113 107 114 121 115 116 117 118 120 122 123 124 126 119 125 127 128 129 130 131 132 133 134 135".split(" ");

export interface NasaFlight {
  id: string;
  url: string;
  orbiter: string;
  /** NASA's own words, as the page has them. */
  launched: string;
  landed: string;
  mission: string;
  crew: number;
}

const ROLE_LINE = /^(?:, |[A-Z][^,]{0,60}, |(?:, [A-Z][A-Za-z.]*\.?)+, )?(?:commander|pilot|payload commander|mission specialist|payload specialist|flight engineer|teacher in space|space flight participant)s?(?:\/[A-Za-z ]+)?(?: \d)?(?: \(.*\))?$/i;
const ORBITERS = ["Columbia", "Challenger", "Discovery", "Atlantis", "Endeavour"];
/** A date NASA gives without its time, joined to the time its page gives elsewhere. */
const withTime = (date: string, time: string): string => (date && time && !/[ap]\.m\./.test(date) ? `${date} at ${time}` : date);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ZONES: Record<string, number> = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, UTC: 0, GMT: 0 };

/** The text lines of an HTML page. */
export function linesOf(html: string): string[] {
  const plain = html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "\u2019")
    .replace(/&#8211;|&ndash;/g, "\u2013")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
  return plain.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** NASA's "April 12, 1981 at 7:00:03 a.m. EST" (or "Sept. 29, 1988, 11:37:00 a.m. EDT", or a date alone) as an ISO time in UTC; a date alone stays a date. */
export function utcOf(given: string): string {
  const swapped = /^(\d{1,2}:\d{2}(?::\d{2})? ?[ap]\.m\. [A-Z]{3}) [\u2013-] (.+)$/.exec(given);
  const text = swapped ? `${swapped[2]} at ${swapped[1]}` : given;
  const match = /^([A-Za-z]+)\.? (\d{1,2}),? (\d{4})(?:[,.]? (?:at )?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)? ?([ap])\.m\. ([A-Z]{3}))?/.exec(text);
  if (!match) throw new Error(`not a date: ${text}`);
  const month = MONTHS.indexOf(match[1]!.slice(0, 3).toLowerCase());
  if (month < 0) throw new Error(`not a month: ${text}`);
  const day = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  if (!match[4]) return day;
  const zone = ZONES[match[8]!];
  if (zone === undefined) throw new Error(`not a zone: ${text}`);
  const hour = (Number(match[4]) % 12) + (match[7] === "p" ? 12 : 0);
  return new Date(Date.parse(`${day}T${String(hour).padStart(2, "0")}:${match[5]}:${match[6] ?? "00"}Z`) - zone * 3_600_000).toISOString().slice(0, 19) + "Z";
}

/** One flight's facts from NASA's page: the orbiter, the launch and landing, the "Mission" line and the crew. The page comes in a few layouts; a key may carry its value or be followed by it. */
export function parseFlight(id: string, html: string): NasaFlight {
  const all = linesOf(html);
  const begin = all.findIndex((line) => /^(Occurred|Mission Facts$|.* Mission Facts$)/.test(line) || line === `STS-${id.toUpperCase()}`);
  const end = all.findIndex((line, index) => index > begin && (line === "Resources" || line === "Shuttle News" || line.startsWith("Latest STS") || line === "History Resources"));
  const lines = all.slice(Math.max(begin, 0), end < 0 ? undefined : end);
  const values = (key: string): string[] =>
    lines.flatMap((line, at) => {
      if (line !== key && line !== `${key}:` && !line.startsWith(`${key}: `)) return [];
      const same = line.startsWith(`${key}: `) ? line.slice(key.length + 2) : "";
      return [same || (lines[at + 1] ?? "").replace(/^:\s*/, "")];
    });
  const value = (key: string): string => values(key).find((one) => /[ap]\.m\./.test(one)) ?? values(key)[0] ?? "";
  return {
    id,
    url: `https://www.nasa.gov/mission/sts-${id}/`,
    orbiter: value("Space Shuttle") || value("Orbiter") || (ORBITERS.find((name) => lines.some((line) => line.includes(name))) ?? ""),
    launched: withTime(value("Launched") || value("Launch Date") || value("Launch"), value("Launch Time")),
    landed: withTime(value("Landing") || value("Landing Date"), value("Landing Time")),
    mission: value("Mission") || value("Primary Payload"),
    crew: lines.filter((line) => line.length < 80 && ROLE_LINE.test(line)).length,
  };
}

/** The Hubble Space Telescope's catalogue number, and the flights that carried, deployed or serviced it. */
export const HUBBLE = 20580;
export const HUBBLE_FLIGHTS = ["31", "61", "82", "103", "109", "125"];
/** What a mission file keeps of each element set (the name and numbers of the object are kept once). */
export const MISSION_FIELDS = ["EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"] as const;
/** The shortest gap between two kept element sets of one object. */
export const KEEP_EVERY_MS = 3 * 3_600_000;

/** The sets in time order, keeping the first, the last and one at least `KEEP_EVERY_MS` after the last kept. */
export function thin(sets: readonly Raw[]): Raw[] {
  const sorted = [...sets].sort((x, y) => Date.parse(`${x["EPOCH"]}Z`) - Date.parse(`${y["EPOCH"]}Z`));
  const kept: Raw[] = [];
  for (const [index, set] of sorted.entries()) {
    const at = Date.parse(`${set["EPOCH"]}Z`);
    if (index === 0 || index === sorted.length - 1 || at - Date.parse(`${kept.at(-1)!["EPOCH"]}Z`) >= KEEP_EVERY_MS) kept.push(set);
  }
  return kept;
}

const kmApart = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
  const r = Math.PI / 180;
  return 6371 * Math.acos(Math.min(1, Math.sin(a.latitude * r) * Math.sin(b.latitude * r) + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.cos((a.longitude - b.longitude) * r)));
};

/**
 * The indexes of the element sets that disagree with the sets on both sides: carried to its own moment, each neighbour puts the craft more than 1000 km from where the set does, while the two neighbours are within a quarter of that
 * of each other. The old catalogue has a few typed-over numbers (STS-107 has a right ascension 110 degrees out); one of those would send the craft round the world and back in a replay.
 */
export function outliers(sets: Parameters<typeof missionPosition>[0]): number[] {
  const out: number[] = [];
  for (let i = 1; i + 1 < sets.length; i += 1) {
    const at = Date.parse(`${sets[i]!.EPOCH}Z`);
    const own = missionPosition([sets[i]!], at);
    const before = missionPosition([sets[i - 1]!], at);
    const after = missionPosition([sets[i + 1]!], at);
    if (!own || !before || !after) continue;
    const apart = Math.min(kmApart(own, before), kmApart(own, after));
    if (apart > 1000 && kmApart(before, after) < apart / 4) out.push(i);
  }
  return out;
}

const rowOf = (set: Raw): (string | number)[] => MISSION_FIELDS.map((field) => set[field] as string | number);

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

if (import.meta.main) {
  const [command] = process.argv.slice(2);
  if (command === "facts") {
    const read = new Date().toISOString().slice(0, 10);
    const flights: NasaFlight[] = [];
    for (const id of FLIGHTS) {
      const answer = await fetch(`https://www.nasa.gov/mission/sts-${id}/`, { headers: { "user-agent": USER_AGENT } });
      if (answer.status !== 200) throw new Error(`sts-${id}: answer ${answer.status}`);
      flights.push(parseFlight(id, await answer.text()));
      await wait(2000);
    }
    const out = new URL(`../test/recorded/nasa-sts-${read}.json`, import.meta.url).pathname;
    writeFileSync(out, `${JSON.stringify({ read, source: "https://www.nasa.gov/mission/sts-<id>/ (NASA, public domain)", flights }, null, 0).replace(/\},\{/g, "},\n{")}\n`);
    console.log(`${flights.length} flights read, ${out}`);
  } else if (command === "clean") {
    const dir = new URL("../demo/missions/", import.meta.url).pathname;
    let dropped = 0;
    for (const id of FLIGHTS) {
      const path = `${dir}sts-${id}.json`;
      if (!existsSync(path)) continue;
      const file = JSON.parse(readFileSync(path, "utf8")) as MissionFile;
      let changed = false;
      for (const [number, sets] of Object.entries(missionElements(file))) {
        const flight = missionOf(id);
        const bad = new Set(outliers(sets));
        if (flight && Number(number) === flight.noradId) {
          sets.forEach((set, index) => {
            const at = Date.parse(`${set.EPOCH}Z`);
            if (at < Date.parse(flight.launch) - 3_600_000 || at > Date.parse(flight.landing!) + 2 * 86_400_000) bad.add(index);
          });
        }
        if (bad.size === 0) continue;
        const craft = file.objects[number]!;
        for (const index of bad) console.log(`sts-${id} ${number}: dropped the set of ${craft.rows[index]![0]}`);
        craft.rows = craft.rows.filter((_, index) => !bad.has(index));
        dropped += bad.size;
        changed = true;
      }
      if (changed) writeFileSync(path, `${JSON.stringify(file)}\n`);
    }
    console.log(`${dropped} element sets dropped`);
  } else if (command === "elements") {
    const login = loginFrom();
    if (!login) throw new Error("no Space-Track login: set SPACETRACK_USER and SPACETRACK_PASSWORD");
    const dir = new URL("../demo/missions/", import.meta.url).pathname;
    mkdirSync(dir, { recursive: true });
    const retrieved = new Date().toISOString().slice(0, 16) + "Z";
    const made = await withSession(login, realSend, wait, 4000, async (ask) => {
      const catalogue = await ask("/basicspacedata/query/class/satcat/OBJECT_NAME/~~STS%20,~~STS-/OBJECT_TYPE/PAYLOAD/predicates/NORAD_CAT_ID,OBJECT_NAME,OBJECT_ID,LAUNCH,DECAY/orderby/LAUNCH%20asc/format/json");
      const ofFlight = new Map<string, Record<string, unknown>>();
      for (const row of catalogue) {
        const match = /^STS[ -](\d+[A-Z]?)(?: \(.*\))?$/.exec(String(row["OBJECT_NAME"]));
        if (match) ofFlight.set(match[1]!.toLowerCase(), row);
      }
      const ids = FLIGHTS.filter((id) => ofFlight.has(id)).map((id) => Number(ofFlight.get(id)!["NORAD_CAT_ID"]));
      const history = new Map<number, Raw[]>();
      for (let at = 0; at < ids.length; at += 40) {
        const part = ids.slice(at, at + 40);
        const rows = await ask(`/basicspacedata/query/class/gp_history/NORAD_CAT_ID/${part.join(",")}/orderby/NORAD_CAT_ID%20asc,EPOCH%20asc/predicates/${FIELDS.join(",")}/format/json`);
        for (const set of toRaw(rows)) history.set(set.NORAD_CAT_ID, [...(history.get(set.NORAD_CAT_ID) ?? []), set]);
      }
      const hubble: Record<string, Raw[]> = {};
      for (const id of HUBBLE_FLIGHTS) {
        const row = ofFlight.get(id);
        if (!row) continue;
        const from = new Date(Date.parse(String(row["LAUNCH"])) - 86_400_000).toISOString().slice(0, 10);
        const to = new Date(Date.parse(String(row["DECAY"])) + 2 * 86_400_000).toISOString().slice(0, 10);
        hubble[id] = toRaw(await ask(`/basicspacedata/query/class/gp_history/NORAD_CAT_ID/${HUBBLE}/EPOCH/${from}--${to}/orderby/EPOCH%20asc/predicates/${FIELDS.join(",")}/format/json`));
      }
      return { ofFlight, history, hubble };
    });
    let total = 0;
    for (const id of FLIGHTS) {
      const row = made.ofFlight.get(id);
      if (!row) {
        console.log(`sts-${id}: no catalogue entry`);
        continue;
      }
      const number = Number(row["NORAD_CAT_ID"]);
      const objects: Record<string, unknown> = {};
      const own = thin(made.history.get(number) ?? []);
      objects[String(number)] = { name: String(row["OBJECT_NAME"]), designator: String(row["OBJECT_ID"]), rows: own.map(rowOf) };
      const extra = made.hubble[id];
      if (extra) objects[String(HUBBLE)] = { name: extra[0]?.OBJECT_NAME ?? "HST", designator: String(extra[0]?.["OBJECT_ID"] ?? "1990-037B"), rows: thin(extra).map(rowOf) };
      const file = { id: `sts-${id}`, retrieved, source: "Space-Track.org (USSPACECOM)", catalogue: { launch: row["LAUNCH"], decay: row["DECAY"] }, fields: MISSION_FIELDS, objects };
      writeFileSync(`${dir}sts-${id}.json`, `${JSON.stringify(file)}\n`);
      total += own.length + (extra ? thin(extra).length : 0);
      console.log(`sts-${id}: ${number} ${own.length} of ${made.history.get(number)?.length ?? 0}${extra ? `, Hubble ${thin(extra).length} of ${extra.length}` : ""}`);
    }
    console.log(`${total} element sets kept`);
  } else throw new Error("usage: missions.ts facts | elements | clean");
}
