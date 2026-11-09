// The sheets page: pick a sheet, the paper and the type, see the sheet as it will print, press Print / save PDF. The sheet is the same DOM that is printed (kazoku-ui's print part); its pictures are this package's (`/sheets`).
// The countries' capitals come from kuni and the flag to check a drawing against from hata, in this demo only: the package depends on neither.
import { createAddressState } from "@johnmorrisdotca/kazoku-ui/address-state";
import { buildSheet, printCss, printSheet, wordsFor, type Layout, type PageName } from "@johnmorrisdotca/kazoku-ui/print";
import { country, countryName } from "@johnmorrisdotca/kuni";
import { facts } from "@johnmorrisdotca/kuni/facts";
import { COUNTRIES } from "../src/countries.ts";
import { GLOBE_VIEWS, SAY, TITLES, countrySheetSvg, dayNightSvg, globeSheetSvg, seasonsSvg, worldMapSvg, type GlobeView } from "../src/sheets/index.ts";
import { WORDS } from "./words.js";

type Lang = "en" | "ja";
const KINDS = ["globe", "map", "country", "daynight", "seasons"] as const;
type Kind = (typeof KINDS)[number];
const PAPERS: readonly PageName[] = ["a4", "letter", "a3", "tabloid"];
declare const __CHIKYU_VERSION__: string;
const ADDRESS = "https://johnmorrisdotca.github.io/chikyu-earth/kids.html";

const chooser = (): { word(key: string): string | undefined } | undefined => Reflect.get(globalThis, "chikyuLanguage") as { word(key: string): string | undefined } | undefined;
const say = (key: string, values: Record<string, string | number> = {}): string => (chooser()?.word(key) ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
const lang = (): Lang => (document.documentElement.lang === "ja" ? "ja" : "en");
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

const address = createAddressState({ defaults: {} });
const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const CODES = new Set(COUNTRIES.features.flatMap((f) => (f.properties.alpha2 === null ? [] : [f.properties.alpha2])));
const quarter = (ms: number): number => Math.round(ms / 900_000) * 900_000;
const asked = Date.parse(address.get("when") ?? "");

interface State {
  kind: Kind;
  view: GlobeView;
  country: string;
  when: number;
  paper: PageName;
  type: "kid" | "normal";
}
const state: State = {
  kind: pick(address.get("kind"), KINDS, "globe"),
  view: pick(address.get("view"), GLOBE_VIEWS, "americas"),
  country: CODES.has((address.get("c") ?? "").toUpperCase()) ? address.get("c")!.toUpperCase() : "JP",
  when: Number.isFinite(asked) ? asked : quarter(Date.now()),
  paper: pick(address.get("paper"), PAPERS, "a4"),
  type: pick(address.get("type"), ["kid", "normal"], "kid"),
};

// ----- the rows of buttons ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
buttons("#kinds", KINDS.map((k) => ({ value: k, text: () => say(`kd_${k}`) })), () => state.kind, (v) => choose({ kind: v as Kind }));
buttons("#views", GLOBE_VIEWS.map((v) => ({ value: v, text: () => say(`kd_v_${v.replace("-", "_")}`) })), () => state.view, (v) => choose({ view: v as GlobeView }));
buttons("#papers", PAPERS.map((p) => ({ value: p, text: () => say(`kd_${p}`) })), () => state.paper, (v) => choose({ paper: v as PageName }));
buttons("#types", (["kid", "normal"] as const).map((k) => ({ value: k, text: () => say(`kd_${k}`) })), () => state.type, (v) => choose({ type: v as State["type"] }));

/** Noon UTC on the day of the equinoxes and solstices, for the year of the date now chosen (about: the real moment is within a day). */
const SEASON_DAYS: readonly [string, number, number][] = [["kd_equinoxMar", 2, 20], ["kd_solsticeJun", 5, 21], ["kd_equinoxSep", 8, 22], ["kd_solsticeDec", 11, 21]];
const whenAt = (key: string): number => {
  const year = new Date(state.when).getUTCFullYear();
  const found = SEASON_DAYS.find(([k]) => k === key);
  return found === undefined ? quarter(Date.now()) : Date.UTC(year, found[1], found[2], 12);
};
buttons("#whens", [{ value: "now", text: () => say("kd_now") }, ...SEASON_DAYS.map(([k]) => ({ value: k, text: () => say(k) }))], () => (SEASON_DAYS.some(([k]) => whenAt(k) === state.when) ? SEASON_DAYS.find(([k]) => whenAt(k) === state.when)![0] : ""), (v) => choose({ when: v === "now" ? quarter(Date.now()) : whenAt(v) }));

// ----- the country -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const countrySelect = $<HTMLSelectElement>("#country");
function fillCountries(): void {
  const list = COUNTRIES.features.flatMap((f) => (f.properties.alpha2 === null ? [] : [{ code: f.properties.alpha2, name: lang() === "ja" ? (countryName(f.properties.alpha2 as never, "ja") ?? f.properties.ja ?? f.properties.name) : f.properties.name }]));
  list.sort((a, b) => a.name.localeCompare(b.name, lang()));
  countrySelect.replaceChildren(...list.map((c) => new Option(c.name, c.code)));
  countrySelect.value = state.country;
}

/** The flags this page carries, to check a drawing against: each is its own chunk, fetched when the button is pressed. */
const FLAGS: Record<string, () => Promise<{ default: string }>> = {
  JP: () => import("@johnmorrisdotca/hata/flags/jp"),
  US: () => import("@johnmorrisdotca/hata/flags/us"),
  CA: () => import("@johnmorrisdotca/hata/flags/ca"),
  GB: () => import("@johnmorrisdotca/hata/flags/gb"),
  FR: () => import("@johnmorrisdotca/hata/flags/fr"),
  DE: () => import("@johnmorrisdotca/hata/flags/de"),
  IT: () => import("@johnmorrisdotca/hata/flags/it"),
  ES: () => import("@johnmorrisdotca/hata/flags/es"),
  AU: () => import("@johnmorrisdotca/hata/flags/au"),
  NZ: () => import("@johnmorrisdotca/hata/flags/nz"),
  BR: () => import("@johnmorrisdotca/hata/flags/br"),
  MX: () => import("@johnmorrisdotca/hata/flags/mx"),
  AR: () => import("@johnmorrisdotca/hata/flags/ar"),
  CN: () => import("@johnmorrisdotca/hata/flags/cn"),
  KR: () => import("@johnmorrisdotca/hata/flags/kr"),
  IN: () => import("@johnmorrisdotca/hata/flags/in"),
  RU: () => import("@johnmorrisdotca/hata/flags/ru"),
  ZA: () => import("@johnmorrisdotca/hata/flags/za"),
  EG: () => import("@johnmorrisdotca/hata/flags/eg"),
  KE: () => import("@johnmorrisdotca/hata/flags/ke"),
  ID: () => import("@johnmorrisdotca/hata/flags/id"),
  TH: () => import("@johnmorrisdotca/hata/flags/th"),
  IE: () => import("@johnmorrisdotca/hata/flags/ie"),
  CL: () => import("@johnmorrisdotca/hata/flags/cl"),
};
let flagShown = false;

/** The country's capital with its name in the language of the page and its place, or none when kuni has none. */
function capitalOf(code: string): { name: string; ja?: string; lon: number; lat: number } | undefined {
  const name = country(code as never)?.capital;
  const point = facts(code as never)?.capitalPoint;
  return name === undefined || point === null || point === undefined ? undefined : { name: name.en, ja: name.ja, lon: point.lon, lat: point.lat };
}

const nameOfCountry = (code: string): string => (lang() === "ja" ? (countryName(code as never, "ja") ?? code) : (countryName(code as never, "en") ?? code));

// ----- the sheet ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let sheet: HTMLElement | undefined;

const layoutOf = (): Partial<Layout> => ({ page: state.paper, orientation: "portrait", type: state.type, language: lang() });

/** What the page makes of the choices: the title and the picture for a room. */
function plan(): { title: string; make: (widthMm: number, heightMm: number) => string } {
  const l = lang();
  const common = { lang: l, type: state.type };
  switch (state.kind) {
    case "globe":
      return { title: TITLES.globe(state.view, l), make: (w, h) => globeSheetSvg(state.view, { widthMm: w, heightMm: h, ...common }) };
    case "map":
      return { title: TITLES.map(l), make: (w, h) => worldMapSvg({ widthMm: w, heightMm: h, ...common }) };
    case "country":
      return { title: TITLES.country(nameOfCountry(state.country), l), make: (w, h) => countrySheetSvg(state.country, { widthMm: w, heightMm: h, ...common, capital: capitalOf(state.country) }) ?? "" };
    case "daynight":
      return { title: TITLES.daynight(l), make: (w, h) => dayNightSvg(state.when, { widthMm: w, heightMm: h, ...common }) };
    default:
      return { title: TITLES.seasons(l), make: (w, h) => seasonsSvg({ widthMm: w, heightMm: h, ...common }) };
  }
}

/** The sheet with its picture drawn for the room the page's body really has: the sheet is laid out out of sight, with the print rules, and measured. */
function build(): HTMLElement {
  const made = plan();
  const layout = layoutOf();
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;inset:0";
  const l = lang();
  const query = new URLSearchParams({ kind: state.kind });
  if (state.kind === "globe") query.set("view", state.view);
  if (state.kind === "country") query.set("c", state.country);
  if (state.kind === "daynight") query.set("when", new Date(state.when).toISOString().slice(0, 16) + "Z");
  const built = buildSheet({ ...layout, brand: "Space Program X", packageName: SAY[l].pack, title: made.title, credits: SAY[l].credits, version: __CHIKYU_VERSION__, date: new Date(), address: `${ADDRESS}?${query.toString()}`, pages: [holder] });
  const style = document.createElement("style");
  style.textContent = printCss(layout);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden";
  host.append(built);
  document.head.append(style);
  document.body.append(host);
  const mm = 25.4 / 96;
  const body = built.querySelector(".kazoku-body")?.getBoundingClientRect();
  host.remove();
  style.remove();
  holder.innerHTML = made.make(Math.floor((body?.width ?? 184.6 / mm) * mm * 10) / 10, Math.floor((body?.height ?? 150 / mm) * mm * 10) / 10);
  return built;
}

function fit(): void {
  const inner = $("#paper-inner");
  inner.style.transform = "none";
  inner.style.width = "";
  inner.style.marginLeft = "0";
  const first = inner.querySelector<HTMLElement>(".kazoku-page");
  if (first === null) {
    $("#paper").style.height = "0";
    return;
  }
  const natural = first.getBoundingClientRect().width;
  const scale = Math.min(1, $("#paper").clientWidth / natural);
  inner.style.width = `${natural}px`;
  inner.style.transform = `scale(${scale})`;
  inner.style.marginLeft = `${Math.max(0, ($("#paper").clientWidth - natural * scale) / 2)}px`;
  $("#paper").style.height = `${inner.scrollHeight * scale}px`;
}

let token = 0;
function render(): void {
  const mine = (token += 1);
  for (const refresh of rows) refresh();
  $("#row-view").hidden = state.kind !== "globe";
  $("#row-country").hidden = state.kind !== "country";
  $("#row-when").hidden = state.kind !== "daynight";
  $("#print").textContent = wordsFor(lang()).button;
  $<HTMLAnchorElement>("#pdfs").setAttribute("href", lang() === "ja" ? "pdf/ja.html" : "pdf/");
  const iso = new Date(state.when).toISOString();
  $<HTMLInputElement>("#date").value = iso.slice(0, 10);
  $<HTMLInputElement>("#time").value = iso.slice(11, 16);
  countrySelect.value = state.country;
  void showFlag(mine);
  let style = document.getElementById("kids-style");
  if (style === null) {
    style = document.createElement("style");
    style.id = "kids-style";
    document.head.append(style);
  }
  style.textContent = printCss(layoutOf());
  sheet = build();
  $("#paper-inner").replaceChildren(sheet);
  $("#info").textContent = say("kd_info", { paper: say(`kd_${state.paper}`) });
  fit();
}

/** The flag to check a drawing against, beside the buttons and never on the sheet. */
async function showFlag(mine: number): Promise<void> {
  const toggle = $<HTMLButtonElement>("#flag-toggle");
  const image = $<HTMLImageElement>("#flag");
  toggle.textContent = say(flagShown ? "kd_flagHide" : "kd_flagShow");
  toggle.setAttribute("aria-pressed", String(flagShown));
  const load = FLAGS[state.country];
  toggle.disabled = load === undefined;
  $("#flag-note").textContent = state.kind !== "country" ? "" : load === undefined ? say("kd_noFlag") : say("kd_flagNote");
  if (!flagShown || load === undefined || state.kind !== "country") {
    image.hidden = true;
    return;
  }
  const svg = (await load()).default;
  if (mine !== token) return;
  image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  image.alt = say("kd_flagAlt", { place: nameOfCountry(state.country) });
  image.hidden = false;
}

function choose(change: Partial<State>): void {
  Object.assign(state, change);
  const keys: Record<string, string> = { kind: state.kind, view: state.view, c: state.country, when: new Date(state.when).toISOString().slice(0, 16) + "Z", paper: state.paper, type: state.type };
  for (const [key, value] of Object.entries(keys)) address.set(key, value);
  render();
}

countrySelect.addEventListener("change", () => choose({ country: countrySelect.value }));
const setWhen = (): void => {
  const ms = Date.parse(`${$<HTMLInputElement>("#date").value}T${$<HTMLInputElement>("#time").value || "12:00"}:00Z`);
  if (Number.isFinite(ms)) choose({ when: ms });
};
$("#date").addEventListener("change", setWhen);
$("#time").addEventListener("change", setWhen);
$("#flag-toggle").addEventListener("click", () => {
  flagShown = !flagShown;
  void showFlag(token);
});
$("#print").addEventListener("click", () => {
  if (sheet !== undefined) printSheet(sheet);
});
document.addEventListener("kazoku-languagechange", () =>
  queueMicrotask(() => {
    fillCountries();
    render();
  }),
);
window.addEventListener("resize", fit);
fillCountries();
render();
