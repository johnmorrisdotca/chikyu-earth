// The passes page: pick a place (the map, a search, "My location" on a press, or its latitude and longitude), a satellite, how many days and what to show, and read the next passes
// of the ISS, Tiangong and Hubble over it. <chikyu-passes> lists them and draws the sky dome of the one pressed; this page adds the ground track on a globe. Every choice is in the address.
// The orbit data are the demo's own files (the scheduled build's snapshot of CelesTrak and Space-Track), read once when the page loads: nothing here asks CelesTrak, and nothing polls.
import "../src/element.ts";
import "@johnmorrisdotca/kazoku-ui/embed-panel/define";
import "@johnmorrisdotca/kazoku-ui/view-controls/define";
import "@johnmorrisdotca/kazoku-ui/wide-layout/define";
import { createAddressState } from "@johnmorrisdotca/kazoku-ui/address-state";
import { countries, countryName } from "@johnmorrisdotca/kuni";
import { facts } from "@johnmorrisdotca/kuni/facts";
import { geoEquirectangular, geoPath } from "d3-geo";
import type { ViewChangeDetail } from "@johnmorrisdotca/kazoku-ui/view-controls/element";
import type { EmbedPanelElement } from "@johnmorrisdotca/kazoku-ui/embed-panel/element";
import type { EmbedKind } from "@johnmorrisdotca/kazoku-ui/embed-panel";
import { COUNTRIES } from "../src/countries.ts";
import type { ChikyuEarth } from "../src/element.ts";
import { project, type OverlayPose } from "../src/markers/index.ts";
import { groundTrack, type SatellitePass } from "../src/passes/index.ts";
import type { ChikyuPasses } from "../src/passes/element.ts";
import type { ElementSet } from "../src/satellites/index.ts";
import { fetchGroup, setsOfGroup, type GroupFile } from "./groups.ts";
import { MORE_PLACES, SATELLITES, TRY_PLACES, type TryPlace } from "./passes-places.ts";
import { passesCode, passesQuery, type PassesChoice } from "./passes-code.ts";
import { WORDS } from "./words.js";
import "../src/passes/element.ts";

type Lang = "en" | "ja";
const chooser = (): { word(key: string): string | undefined } | undefined => Reflect.get(globalThis, "chikyuLanguage") as { word(key: string): string | undefined } | undefined;
const say = (key: string, values: Record<string, string | number> = {}): string => (chooser()?.word(key) ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
const lang = (): Lang => (document.documentElement.lang === "ja" ? "ja" : "en");
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

const SATS = ["iss", "css", "hst", "all"] as const;
type Sat = (typeof SATS)[number];
const DAYS = ["3", "5", "7", "10"] as const;
const SHOWS = ["visible", "all"] as const;
const SKIES = ["civil", "nautical"] as const;
const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const number = (value: string | null, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return value !== null && value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

const address = createAddressState({ defaults: {} });
const state = {
  lat: number(address.get("lat"), TRY_PLACES[0]!.lat, -90, 90),
  lon: number(address.get("lon"), TRY_PLACES[0]!.lon, -180, 180),
  name: address.get("name") ?? (address.get("lat") === null ? TRY_PLACES[0]!.id : ""),
  zone: address.get("tz") ?? (address.get("lat") === null ? TRY_PLACES[0]!.zone : ""),
  sat: pick(address.get("sat"), SATS, "iss"),
  days: pick(address.get("days"), DAYS, "5"),
  show: pick(address.get("show"), SHOWS, "visible"),
  sky: pick(address.get("sky"), SKIES, "civil"),
  at: address.get("at") ?? "",
};

const element = $<ChikyuPasses>("#passes");
let sets: ElementSet[] = [];
let retrieved = "";
let loadFailed = false;

// ----- the place ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const known = (): TryPlace | undefined => [...TRY_PLACES, ...MORE_PLACES].find((one) => one.id === state.name);
const placeName = (): string => {
  const one = known();
  if (one) return lang() === "ja" ? one.ja : one.name;
  if (state.name === "here") return say("ps_here");
  if (state.name.startsWith("c:")) return state.name.slice(2);
  return say("ps_picked");
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

const setPlace = (lat: number, lon: number, name: string, zone = ""): void => {
  state.lat = round2(lat);
  state.lon = round2(lon);
  state.name = name;
  state.zone = zone;
  render();
};

// the map: the countries in one flat projection, pressed to choose a place
const MAP_W = 720;
const MAP_H = 360;
const mapProjection = geoEquirectangular().fitSize([MAP_W, MAP_H], { type: "Sphere" });
const mapPath = geoPath(mapProjection);
const mapLand = mapPath({ type: "FeatureCollection", features: COUNTRIES.features } as never) ?? "";
const map = $("#map");
map.innerHTML =
  `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="" xmlns="http://www.w3.org/2000/svg" class="passes-map-svg">` +
  `<rect width="${MAP_W}" height="${MAP_H}" class="map-ocean"/><path d="${mapLand}" class="map-land" fill-rule="evenodd"/>` +
  `<g id="map-marker"><circle r="9" class="map-pin-ring"/><circle r="4" class="map-pin"/></g></svg>`;
const mapSvg = map.querySelector("svg")!;
mapSvg.addEventListener("click", (event) => {
  const box = mapSvg.getBoundingClientRect();
  const at = mapProjection.invert!([((event.clientX - box.left) / box.width) * MAP_W, ((event.clientY - box.top) / box.height) * MAP_H]);
  if (at) setPlace(at[1], at[0], "map");
});

// "My location": asked for on a press, never on load; the place keeps the device's own time zone
const locate = $<HTMLButtonElement>("#locate");
const note = $("#place-note");
locate.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    note.textContent = say("ps_denied");
    return;
  }
  note.textContent = say("ps_locating");
  navigator.geolocation.getCurrentPosition(
    (here) => setPlace(here.coords.latitude, here.coords.longitude, "here", Intl.DateTimeFormat().resolvedOptions().timeZone),
    () => {
      note.textContent = say("ps_denied");
    },
    { maximumAge: 600_000, timeout: 20_000 },
  );
});

// the quick places, the search, and the two numbers
const tries = $("#tries");
for (const one of TRY_PLACES) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset["id"] = one.id;
  button.addEventListener("click", () => setPlace(one.lat, one.lon, one.id, one.zone));
  tries.append(button);
}
interface Found {
  label: string;
  lat: number;
  lon: number;
  name: string;
  zone: string;
}
const fold = (text: string): string => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const searchFor = (text: string): Found[] => {
  const wanted = fold(text.trim());
  if (!wanted) return [];
  const found: Found[] = [];
  for (const one of [...TRY_PLACES, ...MORE_PLACES]) if (fold(one.name).includes(wanted) || one.ja.includes(text.trim())) found.push({ label: lang() === "ja" ? one.ja : one.name, lat: one.lat, lon: one.lon, name: one.id, zone: one.zone });
  for (const country of countries()) {
    const point = facts(country.alpha2)?.capitalPoint;
    if (!point || !country.capital) continue;
    const english = countryName(country.alpha2, "en") ?? country.alpha2;
    const names = [english, countryName(country.alpha2, "ja") ?? "", country.capital.en, country.capital.ja ?? ""];
    if (names.some((n) => n && (fold(n).includes(wanted) || n.includes(text.trim())))) {
      const capital = lang() === "ja" ? (country.capital.ja ?? country.capital.en) : country.capital.en;
      const label = `${capital}, ${lang() === "ja" ? (countryName(country.alpha2, "ja") ?? english) : english}`;
      if (!found.some((one) => Math.abs(one.lat - point.lat) < 0.5 && Math.abs(one.lon - point.lon) < 0.5)) found.push({ label, lat: point.lat, lon: point.lon, name: `c:${capital}`, zone: "" });
    }
  }
  return found.slice(0, 8);
};
const search = $<HTMLInputElement>("#search");
const results = $("#results");
search.addEventListener("input", () => {
  const found = searchFor(search.value);
  results.replaceChildren(
    ...found.map((one) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = one.label;
      button.addEventListener("click", () => {
        setPlace(one.lat, one.lon, one.name, one.zone);
        search.value = "";
        results.hidden = true;
      });
      return button;
    }),
  );
  results.hidden = found.length === 0;
});
const latInput = $<HTMLInputElement>("#lat");
const lonInput = $<HTMLInputElement>("#lon");
const typed = (): void => {
  const lat = number(latInput.value, Number.NaN, -90, 90);
  const lon = number(lonInput.value, Number.NaN, -180, 180);
  if (Number.isFinite(lat) && Number.isFinite(lon)) setPlace(lat, lon, "typed");
};
latInput.addEventListener("change", typed);
lonInput.addEventListener("change", typed);

// ----- the rows of buttons -------------------------------------------------------------------------------------------------------------------------------------------------------------
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
buttons("#sats", SATS.map((s) => ({ value: s, text: () => say(`ps_sat_${s}`) })), () => state.sat, (v) => {
  state.sat = v as Sat;
  render();
});
buttons("#days", DAYS.map((d) => ({ value: d, text: () => d })), () => state.days, (v) => {
  state.days = v as (typeof DAYS)[number];
  render();
});
buttons("#shows", SHOWS.map((s) => ({ value: s, text: () => say(`ps_show_${s}`) })), () => state.show, (v) => {
  state.show = v as (typeof SHOWS)[number];
  render();
});
buttons("#skies", SKIES.map((s) => ({ value: s, text: () => say(`ps_sky_${s}`) })), () => state.sky, (v) => {
  state.sky = v as (typeof SKIES)[number];
  render();
});

// ----- the ground track on a globe: <chikyu-earth> with its own hands and kazoku-ui's view controls, the track drawn in its overlay -------------------------------------------------------
const earth = $<ChikyuEarth>("#ground-earth");
const LEAD = 8 * 60_000;
let shown: { pass: SatellitePass; track: ReturnType<typeof groundTrack> } | undefined;
const SVG = "http://www.w3.org/2000/svg";

/** The track, the three marks and the watcher, drawn into the globe's overlay for the pose it has now. */
function paintGround(pose: OverlayPose | null): void {
  const root = earth.overlay.overlayRoot;
  let svg = root.querySelector<SVGSVGElement>("svg.ground-track");
  if (!pose || !shown) {
    svg?.remove();
    return;
  }
  if (!svg) {
    svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "ground-track");
    svg.style.cssText = "position:absolute;inset:0;overflow:visible";
    root.append(svg);
  }
  root.style.transform = pose.transform;
  svg.setAttribute("viewBox", `0 0 ${pose.width} ${pose.height}`);
  svg.setAttribute("width", String(pose.width));
  svg.setAttribute("height", String(pose.height));
  const { pass, track } = shown;
  const at = (p: { lon: number; lat: number }): { x: number; y: number; z: number } => project(p.lon, p.lat, pose);
  // runs of points facing the viewer, each its own line
  const run = (points: typeof track): string => {
    let d = "";
    let open = false;
    for (const p of points) {
      const xy = at(p);
      if (xy.z <= 0.02) {
        open = false;
        continue;
      }
      d += `${open ? "L" : "M"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
      open = true;
    }
    return d;
  };
  const before = track.filter((p) => p.ms <= pass.start.ms);
  const during = track.filter((p) => p.ms >= pass.start.ms && p.ms <= pass.end.ms);
  const after = track.filter((p) => p.ms >= pass.end.ms);
  const nearest = (ms: number) => track.reduce((best, p) => (Math.abs(p.ms - ms) < Math.abs(best.ms - ms) ? p : best), track[0]!);
  const mark = (ms: number, fill: string, square = false): string => {
    const xy = at(nearest(ms));
    if (xy.z <= 0.02) return "";
    return square
      ? `<rect x="${(xy.x - 4.5).toFixed(1)}" y="${(xy.y - 4.5).toFixed(1)}" width="9" height="9" fill="${fill}" stroke="#10192b" stroke-width="1.5"/>`
      : `<circle cx="${xy.x.toFixed(1)}" cy="${xy.y.toFixed(1)}" r="5" fill="${fill}" stroke="#10192b" stroke-width="1.5"/>`;
  };
  const you = at({ lon: state.lon, lat: state.lat });
  const stroke = (d: string, extra: string): string => (d ? `<path d="${d}" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" ${extra}/>` : "");
  svg.innerHTML =
    `<g data-ground="track">${stroke(run(before), 'stroke="#8fa1b8" stroke-width="2" stroke-dasharray="4 5"')}${stroke(run(after), 'stroke="#8fa1b8" stroke-width="2" stroke-dasharray="4 5"')}${stroke(run(during), 'stroke="#ffb454" stroke-width="3.5"')}</g>` +
    `${mark(pass.start.ms, "#6cd0ff")}${mark(pass.highest.ms, "#ffffff")}${mark(pass.end.ms, "#ff8a65", true)}` +
    (you.z > 0.02 ? `<circle cx="${you.x.toFixed(1)}" cy="${you.y.toFixed(1)}" r="6" fill="#ff4d6d" stroke="#ffffff" stroke-width="2" data-ground="you"/>` : "");
}
earth.overlay.subscribe(paintGround);
// the family's bar takes the hands over: the page applies its events to the globe
const controls = $("#ground-controls") as HTMLElement & { set(next: Record<string, number>): void };
controls.addEventListener("kazoku-viewchange", (event) => {
  const detail = (event as CustomEvent<ViewChangeDetail>).detail;
  earth.setView(detail, detail.final, detail.reason !== "auto");
});

function drawGround(pass: SatellitePass | undefined, set: ElementSet | undefined): void {
  if (!pass || !set) {
    shown = undefined;
    paintGround(null);
    return;
  }
  const track = groundTrack(set, pass.start.ms - LEAD, pass.end.ms + LEAD, 10);
  shown = { pass, track };
  // centred on the watcher, and zoomed so that the whole track fits: the angle from the watcher to the farthest point of it
  const far = Math.max(
    ...track.map((p) => {
      const a = (p.lat * Math.PI) / 180;
      const b = (state.lat * Math.PI) / 180;
      return Math.acos(Math.min(1, Math.max(-1, Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(((p.lon - state.lon) * Math.PI) / 180))));
    }),
  );
  const zoom = Math.min(8, Math.max(1, 0.82 / Math.max(0.05, Math.sin(Math.min(far, Math.PI / 2)))));
  earth.setAttribute("center", `${state.lon},${state.lat}`);
  controls.set({ yaw: 0, tilt: 0, roll: 0, zoom, panX: 0, panY: 0 });
  earth.setAttribute("aria-label", say("ps_groundLabel", { name: placeName() }));
  paintGround(earth.overlay.pose);
}

element.addEventListener("chikyu-pass-select", (event) => {
  const detail = (event as CustomEvent<{ pass: SatellitePass | undefined; set: ElementSet | undefined }>).detail;
  drawGround(detail.pass, detail.set);
  if (detail.pass) address.set("p", new Date(detail.pass.highest.ms).toISOString().replace(/\.\d+Z$/, "Z"));
  else address.remove("p");
});
element.addEventListener("chikyu-passes", (event) => {
  const { passes, ageDays } = (event as CustomEvent<{ passes: SatellitePass[]; ageDays: number }>).detail;
  $("#data-note").dataset["passes"] = String(passes.length);
  $("#data-note").dataset["age"] = ageDays.toFixed(1);
});

// ----- the orbit data: the demo's own files, read once ---------------------------------------------------------------------------------------------------------------------------------
async function loadSets(): Promise<void> {
  try {
    const [stations, famous] = await Promise.all([fetchGroup("stations"), fetchGroup("famous")]);
    const files: Record<string, GroupFile> = { stations, famous };
    sets = SATELLITES.flatMap((one) => setsOfGroup(files[one.group]!).filter((set: ElementSet) => set.NORAD_CAT_ID === one.norad));
    retrieved = [stations, famous].map((file) => file.retrieved).sort()[0]!;
  } catch {
    loadFailed = true;
  }
  render();
}

// ----- the page ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const embed = $<EmbedPanelElement>("#embed-panel");
const embedChoice = (): PassesChoice => ({ lat: state.lat, lon: state.lon, zone: known()?.zone ?? state.zone, sat: state.sat === "all" ? "all" : state.sat, days: Number(state.days) });

function render(): void {
  for (const refresh of rows) refresh();
  tries.querySelectorAll("button").forEach((button) => {
    const one = TRY_PLACES.find((p) => p.id === button.dataset["id"])!;
    button.textContent = lang() === "ja" ? one.ja : one.name;
    button.setAttribute("aria-pressed", String(state.name === one.id));
  });
  latInput.value = String(state.lat);
  lonInput.value = String(state.lon);
  const marker = mapSvg.querySelector<SVGGElement>("#map-marker")!;
  const at = mapProjection([state.lon, state.lat])!;
  marker.setAttribute("transform", `translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})`);
  mapSvg.setAttribute("aria-label", say("ps_map"));
  note.textContent = say("ps_place", { name: placeName(), lat: state.lat.toFixed(2), lon: state.lon.toFixed(2) });
  address.setMany({
    lat: state.lat === TRY_PLACES[0]!.lat && state.lon === TRY_PLACES[0]!.lon ? null : state.lat,
    lon: state.lat === TRY_PLACES[0]!.lat && state.lon === TRY_PLACES[0]!.lon ? null : state.lon,
    name: state.name === TRY_PLACES[0]!.id ? null : state.name,
    tz: known() ? null : state.zone || null,
    sat: state.sat === "iss" ? null : state.sat,
    days: state.days === "5" ? null : state.days,
    show: state.show === "visible" ? null : state.show,
    sky: state.sky === "civil" ? null : state.sky,
  });

  // the list
  const zone = known()?.zone ?? state.zone;
  element.setAttribute("latitude", String(state.lat));
  element.setAttribute("longitude", String(state.lon));
  element.setAttribute("days", state.days);
  element.setAttribute("show", state.show);
  element.setAttribute("sky", state.sky);
  element.setAttribute("lang", lang());
  if (zone) {
    element.setAttribute("time-zone", zone);
    element.removeAttribute("utc-offset");
  } else {
    element.removeAttribute("time-zone");
    element.setAttribute("utc-offset", String(Math.round(state.lon / 15)));
  }
  const fixed = state.at && Number.isFinite(Date.parse(state.at)) ? state.at : "";
  if (fixed) element.setAttribute("from", fixed);
  const wanted = address.get("p");
  if (wanted && !element.getAttribute("selected")) element.setAttribute("selected", wanted);
  const chosen = state.sat === "all" ? sets : sets.filter((set) => set.NORAD_CAT_ID === SATELLITES.find((one) => one.id === state.sat)!.norad);
  element.elements = chosen;

  const dataNote = $("#data-note");
  if (loadFailed) dataNote.textContent = say("ps_dataFail");
  else if (retrieved) {
    const day = new Intl.DateTimeFormat(lang(), { day: "numeric", month: "short", timeZone: "UTC" }).format(Date.parse(retrieved));
    const old = Math.max(0, ((fixed ? Date.parse(fixed) : Date.now()) - Date.parse(retrieved)) / 86_400_000);
    dataNote.textContent = old > 2 ? say("ps_dataOld", { date: day, days: Math.round(old) }) : say("ps_data", { date: day });
  }
  mountEmbed();
}

// ----- the code panel -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let embedMounted = false;
function mountEmbed(): void {
  if (!embedMounted) {
    embedMounted = true;
    embed.sizes = [360, 480, 640];
    embed.size = 480;
    embed.setAttribute("docs-href", "docs/");
    embed.generate = ({ kind, preview, size }) => passesCode(kind as EmbedKind, embedChoice(), preview, size);
    embed.preview = ({ kind, size }) => {
      if (kind === "iframe") return undefined;
      const frame = document.createElement("iframe");
      frame.className = "embed-frame";
      frame.title = say("ps_heading");
      frame.width = String(size);
      frame.height = String(Math.round(size * 1.4));
      frame.style.border = "0";
      frame.src = `passes-embed.html?${passesQuery(embedChoice(), lang())}`;
      return frame;
    };
    embed.credits = () => "";
  }
  embed.setAttribute("lang", lang());
  embed.openHref = `passes-embed.html?${passesQuery(embedChoice(), lang())}`;
  embed.update();
}

document.addEventListener("kazoku-languagechange", () => queueMicrotask(render));
render();
void loadSets();
