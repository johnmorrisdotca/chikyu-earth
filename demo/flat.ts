// The flat map page: every dot is a satellite at the place SGP4 puts it for the time shown, drawn on a canvas by <chikyu-flat>. Choose the groups (the element's own chips), colour by group or by orbital plane,
// set a "saved place" to see the My place button and its marker, and drive the clock. The orbit data are this demo's own files, read once when the page loads: nothing here asks CelesTrak.
import "../src/flat/define.ts";
import { groupFacts } from "../src/flat/index.ts";
import type { ChikyuFlat } from "../src/flat/define.ts";
import { fetchGroup, setsOfGroup, type GroupFile } from "./groups.ts";
import { TRY_PLACES } from "./passes-places.ts";
import { WORDS } from "./words.js";

type Lang = "en" | "ja";
const chooser = (): { word(key: string): string | undefined } | undefined => Reflect.get(globalThis, "chikyuLanguage") as { word(key: string): string | undefined } | undefined;
const say = (key: string, values: Record<string, string | number> = {}): string => (chooser()?.word(key) ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
const lang = (): Lang => (document.documentElement.lang === "ja" ? "ja" : "en");
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

const GROUPS = ["gps", "galileo", "glonass", "beidou", "iridium", "oneweb", "stations", "earth-observation", "weather", "starlink"] as const;
const SPEEDS = [1, 10, 60, 600, 3600, 86400] as const;
const flat = $<ChikyuFlat>("#flat");
const query = new URLSearchParams(location.search);
let by: "group" | "plane" = query.get("by") === "group" ? "group" : "plane";
let place = query.get("place") ?? "tokyo";
const files: GroupFile[] = [];
let failed = false;

// ----- the rows of buttons ------------------------------------------------------------------------------------------------------------------------------------------------------------
const rows: (() => void)[] = [];
function buttons(container: string, items: readonly { value: string; text: () => string }[], current: () => string, choose: (value: string) => void): void {
  const box = $(container);
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset["value"] = item.value;
    button.addEventListener("click", () => choose(item.value));
    box.append(button);
  }
  rows.push(() => {
    items.forEach((item, i) => {
      const button = box.children[i] as HTMLButtonElement;
      button.textContent = item.text();
      button.setAttribute("aria-pressed", String(item.value === current()));
    });
  });
}
buttons("#by", [{ value: "group", text: () => say("fl_by_group") }, { value: "plane", text: () => say("fl_by_plane") }], () => by, (v) => {
  by = v as typeof by;
  flat.setAttribute("colour-by", by);
  render();
});
buttons("#places", [{ value: "none", text: () => say("fl_place_none") }, ...TRY_PLACES.slice(0, 4).map((one) => ({ value: one.id, text: () => (lang() === "ja" ? one.ja : one.name) }))], () => place, (v) => {
  place = v;
  applyPlace();
  render();
});
function applyPlace(): void {
  const one = TRY_PLACES.find((p) => p.id === place);
  if (!one) {
    flat.removeAttribute("home-lon");
    flat.removeAttribute("home-lat");
    return;
  }
  flat.setAttribute("home-lon", String(one.lon));
  flat.setAttribute("home-lat", String(one.lat));
}

// ----- the clock: Real time, Slower, Pause, Faster -----------------------------------------------------------------------------------------------------------------------------
let speedAt = 0;
const clock = (name: string): (() => void) => {
  const act: Record<string, () => void> = {
    live: () => {
      speedAt = 0;
      flat.paused = false;
      flat.speed = 1;
      flat.time = "now";
    },
    slower: () => {
      speedAt = Math.max(0, speedAt - 1);
      flat.speed = SPEEDS[speedAt]!;
    },
    pause: () => {
      flat.paused = !flat.paused;
    },
    faster: () => {
      speedAt = Math.min(SPEEDS.length - 1, speedAt + 1);
      flat.speed = SPEEDS[speedAt]!;
    },
  };
  return () => {
    act[name]!();
    render();
  };
};
const clockBox = $("#clock");
for (const name of ["live", "slower", "pause", "faster"]) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset["act"] = name;
  button.addEventListener("click", clock(name));
  clockBox.append(button);
}
const dateInput = $<HTMLInputElement>("#date");
dateInput.addEventListener("change", () => {
  const ms = Date.parse(`${dateInput.value}:00Z`);
  if (Number.isFinite(ms)) flat.time = ms;
  render();
});
const shownTime = $("#shown-time");
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
flat.addEventListener("chikyu-timechange", (event) => {
  shownTime.textContent = say("fl_now", { time: iso((event as CustomEvent<{ time: number }>).detail.time) });
});

// ----- the facts of the groups on show --------------------------------------------------------------------------------------------------------------------------------------------
const number = (n: number): string => Math.round(n).toLocaleString(lang());
const period = (minutes: number): string => (minutes >= 90 ? say("fl_hm", { h: Math.floor(minutes / 60), m: Math.round(minutes % 60) }) : say("fl_min", { m: Math.round(minutes) }));
function facts(): void {
  const box = $("#facts");
  const shown = flat.visibleGroups;
  const table = document.createElement("table");
  table.className = "flat-table";
  const head = ["fl_f_group", "fl_f_count", "fl_f_alt", "fl_f_incl", "fl_f_period", "fl_f_speed", "fl_f_planes"];
  table.createTHead().insertRow().replaceChildren(...head.map((key) => Object.assign(document.createElement("th"), { scope: "col", textContent: say(key) })));
  const body = table.createTBody();
  for (const group of flat.groups) {
    if (!shown.includes(group.id)) continue;
    const f = flat.facts(group.id) ?? groupFacts([]);
    const row = body.insertRow();
    const cells = [
      lang() === "ja" ? group.labelJa : group.label,
      number(f.count),
      f.maxAltitudeKm - f.minAltitudeKm > 400 ? `${number(f.minAltitudeKm)} – ${number(f.maxAltitudeKm)} km` : `${number(f.meanAltitudeKm)} km`,
      `${f.meanInclinationDeg.toFixed(0)}°`,
      period(f.periodMinutes),
      say("fl_kms", { v: f.speedKmS.toFixed(1) }),
      f.clustered ? String(f.planeCount) : say("fl_noPlanes"),
    ];
    row.replaceChildren(...cells.map((text, i) => Object.assign(document.createElement(i === 0 ? "th" : "td"), { textContent: text, scope: i === 0 ? "row" : "" })));
  }
  box.replaceChildren(table);
}
flat.addEventListener("chikyu-flat-filter", () => facts());

// ----- the page ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function render(): void {
  for (const row of rows) row();
  for (const button of clockBox.children as HTMLCollectionOf<HTMLButtonElement>) {
    const act = button.dataset["act"]!;
    button.textContent = say(act === "pause" ? (flat.paused ? "fl_play" : "fl_pause") : `fl_${act}`);
    if (act === "live") button.setAttribute("aria-pressed", String(!flat.paused && flat.speed === 1));
    if (act === "pause") button.setAttribute("aria-pressed", String(flat.paused));
    if (act === "slower") button.disabled = speedAt === 0;
    if (act === "faster") button.disabled = speedAt === SPEEDS.length - 1;
  }
  const newest = Math.max(0, ...files.map((f) => Date.parse(f.retrieved)).filter(Number.isFinite));
  $("#status").textContent = failed ? say("fl_failed") : newest > 0 ? say("fl_source", { date: new Date(newest).toISOString().slice(0, 10) }) : say("fl_loading");
  if (flat.groups.length > 0) facts();
  $("#code").textContent =
    `import "@johnmorrisdotca/chikyu-earth/flat/define";\n\nconst flat = document.querySelector("chikyu-flat");\nflat.setGroup("gps", gpsElements); // OMM element sets from your own file\nflat.setAttribute("colour-by", "plane");\nflat.setAttribute("home-lon", "139.69"); // the reader's saved place, never asked for\nflat.setAttribute("home-lat", "35.69");\nflat.addEventListener("chikyu-flat-pick", (event) => console.log(event.detail.name));`;
}
document.addEventListener("kazoku-languagechange", () =>
  queueMicrotask(() => {
    flat.setAttribute("lang", lang());
    render();
  }),
);
applyPlace();
flat.setAttribute("lang", lang());
flat.setAttribute("colour-by", by);
render();
void Promise.all(
  GROUPS.map((id) =>
    fetchGroup(id).then(
      (file) => file,
      () => {
        failed = true;
        return null;
      },
    ),
  ),
).then((got) => {
  // the groups are given in the order of the list, so the chips are too
  got.forEach((file, i) => {
    if (!file) return;
    files.push(file);
    flat.setGroup(GROUPS[i]!, setsOfGroup(file));
  });
  document.body.dataset["ready"] = "true";
  render();
});
