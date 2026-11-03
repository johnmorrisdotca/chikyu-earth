// The satellites' elements the browser tests use: the stations and Starlink as recorded on 2026-11-02 (test/recorded), served in place of the demo's own files, which are refreshed every few hours and so
// would move every position the tests expect. Not a test file.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

interface Recorded {
  retrieved: string;
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const recorded = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Recorded;
const ALL: Record<string, number> = { stations: 20, starlink: 11156 };

/** From now on this page gets the recorded stations and Starlink files, whatever is on the demo site. */
export async function routeElements(page: Page): Promise<void> {
  await page.route(/\/elements\/(stations|starlink)\.json$/, (route) => {
    const id = /\/elements\/(\w+)\.json$/.exec(route.request().url())![1]!;
    return route.fulfill({ json: { id, retrieved: recorded.retrieved, all: ALL[id], fields: recorded.fields, rows: recorded.groups[id] } });
  });
}
