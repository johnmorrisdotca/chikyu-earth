// A polite Space-Track.org client for the scheduled build: log in once, ask the GP class, log out. Nothing here prints or stores the login.
// Space-Track's API rules (documentation page, read 2026-11-08): fewer than 30 requests a minute and 300 an hour; the GP class once an hour at most, so the build asks once a day.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

export const FIELDS = ["NORAD_CAT_ID", "OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"] as const;

export interface Raw {
  NORAD_CAT_ID: number;
  OBJECT_NAME: string;
  [field: string]: unknown;
}

export const SPACETRACK = "https://www.space-track.org";
/** The citation Space-Track's user agreement asks for when basic SSA data are passed on. */
export const CITATION = "Data from Space-Track.org (USSPACECOM)";
/** The most NORAD numbers in one request: a comma list of this many stays well inside the address length every server takes. */
export const IDS_PER_ASK = 400;

export interface Login {
  user: string;
  password: string;
}
export interface Reply {
  status: number;
  text(): Promise<string>;
  /** The `Set-Cookie` lines of the answer. */
  cookies(): string[];
}
/** Sends one request to Space-Track. `body` is form text for a POST; `cookie` is the session. */
export type Send = (url: string, init?: { method?: "GET" | "POST"; body?: string; cookie?: string }) => Promise<Reply>;

export class SpaceTrackError extends Error {}

/** The login from the environment, else from `~/.config/spacetrack/spacetrack.env`; undefined when there is none. Never printed. */
export function loginFrom(env: Record<string, string | undefined> = process.env, file = `${homedir()}/.config/spacetrack/spacetrack.env`): Login | undefined {
  if (env["SPACETRACK_USER"] && env["SPACETRACK_PASSWORD"]) return { user: env["SPACETRACK_USER"], password: env["SPACETRACK_PASSWORD"] };
  if (env["SPACETRACK_USER"] || env["SPACETRACK_PASSWORD"] || !existsSync(file)) return undefined;
  const pairs = new Map(readFileSync(file, "utf8").split("\n").filter((line) => line.includes("=") && !line.startsWith("#")).map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]));
  const user = pairs.get("SPACETRACK_USER");
  const password = pairs.get("SPACETRACK_PASSWORD");
  return user && password ? { user, password } : undefined;
}

/** `fetch` with the family's user agent, answering the shape `Send` wants. */
export const realSend: Send = async (url, init = {}) => {
  const headers: Record<string, string> = { "user-agent": "chikyu-earth-demo (+https://github.com/johnmorrisdotca/chikyu-earth)" };
  if (init.body !== undefined) headers["content-type"] = "application/x-www-form-urlencoded";
  if (init.cookie) headers["cookie"] = init.cookie;
  const answer = await fetch(url, { method: init.method ?? "GET", body: init.body, headers, redirect: "manual" });
  return { status: answer.status, text: () => answer.text(), cookies: () => answer.headers.getSetCookie() };
};

/** The path that asks the GP class for these catalogue numbers, only the fields the demo's files keep. */
export function gpPath(ids: readonly number[]): string {
  return `/basicspacedata/query/class/gp/NORAD_CAT_ID/${ids.join(",")}/orderby/NORAD_CAT_ID%20asc/predicates/${FIELDS.join(",")}/format/json`;
}

/** Space-Track's GP answer as `Raw` sets: it sends every number as text. */
export function toRaw(rows: readonly Record<string, unknown>[]): Raw[] {
  return rows.map((row) => {
    const set: Raw = { NORAD_CAT_ID: Number(row["NORAD_CAT_ID"]), OBJECT_NAME: String(row["OBJECT_NAME"]) };
    for (const field of FIELDS) if (field !== "NORAD_CAT_ID" && field !== "OBJECT_NAME" && field !== "OBJECT_ID" && field !== "EPOCH") set[field] = Number(row[field]);
    set["OBJECT_ID"] = String(row["OBJECT_ID"]);
    set["EPOCH"] = String(row["EPOCH"]);
    return set;
  });
}

/**
 * Log in, run `use`, and log out whatever happens. `use` gets a function that asks one path and returns the JSON list, pausing between asks and throwing a `SpaceTrackError` on any answer that is not 200 (the build stops there).
 *
 * @param login - The account.
 * @param send - Sends a request: `realSend`, or a made-up one in a test.
 * @param pause - Waits the given milliseconds.
 * @param spacingMs - The pause between two asks.
 * @param use - What to do while logged in.
 */
export async function withSession<T>(login: Login, send: Send, pause: (ms: number) => Promise<void>, spacingMs: number, use: (ask: (path: string) => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const entered = await send(`${SPACETRACK}/ajaxauth/login`, { method: "POST", body: new URLSearchParams({ identity: login.user, password: login.password }).toString() });
  const note = await entered.text();
  const cookie = entered.cookies().map((line) => line.split(";")[0]).join("; ");
  if (entered.status !== 200 || !cookie || /fail/i.test(note)) throw new SpaceTrackError(`login refused (answer ${entered.status})`);
  let asked = 0;
  try {
    return await use(async (path) => {
      if (asked++) await pause(spacingMs);
      const answer = await send(`${SPACETRACK}${path}`, { cookie });
      if (answer.status !== 200) throw new SpaceTrackError(`answer ${answer.status}`);
      const body: unknown = JSON.parse(await answer.text());
      if (!Array.isArray(body)) throw new SpaceTrackError("not a list");
      return body as Record<string, unknown>[];
    });
  } finally {
    await send(`${SPACETRACK}/ajaxauth/logout`, { cookie }).catch(() => undefined);
  }
}
