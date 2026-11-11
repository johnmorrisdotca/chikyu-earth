// The full-screen page: <chikyu-earth-realistic immersive> filling the window on a dark page, the way a home page would use it. The address says what it shows:
//   ?time=2026-11-02T14:00Z   a date to hold (UTC); with none the clock runs from now, at an hour a second, and times are shown in the device's own time zone
//   &speed=600                the clock's speed (0 holds); &play=off holds a view that would run
//   &camera=space|sun|ground  how the camera is held (space by default: the Earth turns beneath it)
//   &center=lon,lat           where the camera looks
//   &sats=all|stations,gps    the satellite groups shown (`all` is every group of the catalogue, at once)
//   &air-thickness=1          the air at its true thickness (it is drawn 3 times as thick, so that it can be seen, when the address says nothing)
import "@johnmorrisdotca/kazoku-ui/view-controls/define";
import type { ViewChangeDetail } from "@johnmorrisdotca/kazoku-ui/view-controls/element";
import type { CameraMode, ChikyuEarthRealistic } from "../src/realistic/element.ts";
import { airNoteText } from "../src/realistic/air-note.ts";
import { setBodyLabelFontUrl } from "../src/realistic/body-label.ts";
setBodyLabelFontUrl("fonts/Michroma-Regular.ttf");
import { fetchGroup, GROUP_STYLE, setsOfGroup } from "./groups.ts";

const query = new URLSearchParams(location.search);
const WORDS = {
  en: { title: "Chikyu Earth, full screen", back: "The demo", play: "Play", pause: "Pause", clock: "Clock", camera: "Camera", sats: "Satellites", air: "Air", air_true: "True air thickness", cam_space: "In the stars", cam_sun: "Sun side", cam_ground: "Ground", sats_all: "All satellites", sats_off: "Hide satellites", label: "The Earth from space, with its sunlit and dark sides", help: "Drag to turn. Wheel or pinch to zoom.", loading: "Loading satellites", shown: "{n} satellites shown" },
  ja: { title: "地球 (全画面)", back: "デモ", play: "再生", pause: "一時停止", clock: "時計", camera: "カメラ", sats: "人工衛星", air: "大気", air_true: "大気を実際の厚さで", cam_space: "星に固定", cam_sun: "太陽側", cam_ground: "地上", sats_all: "すべての人工衛星", sats_off: "人工衛星を隠す", label: "宇宙から見た地球。昼の側と夜の側", help: "ドラッグで回転します。ホイールかピンチで拡大・縮小します。", loading: "人工衛星を読み込み中", shown: "{n} 機の人工衛星を表示中" },
};
type Key = keyof (typeof WORDS)["en"];
const lang = (query.get("lang") ?? navigator.language).toLowerCase().startsWith("ja") ? "ja" : "en";
const say = (key: Key, values: Record<string, string | number> = {}): string => WORDS[lang][key].replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
document.documentElement.lang = lang;
for (const node of document.querySelectorAll<HTMLElement>("[data-say]")) node.textContent = say(node.dataset["say"] as Key);
for (const node of document.querySelectorAll<HTMLElement>("[data-say-label]")) node.setAttribute("aria-label", say(node.dataset["sayLabel"] as Key));
document.title = say("title");

const { setThreeLoader } = await import("../src/realistic/element.ts");
setThreeLoader(() => import("./three-subset.ts"));
const earth = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
earth.id = "sp";
earth.setAttribute("immersive", "");
earth.setAttribute("camera", "space");
earth.setAttribute("texture-base", "textures/");
earth.setAttribute("tiles", "tiles/");
earth.setAttribute("center", query.get("center") ?? "0,20");
earth.setAttribute("aria-label", say("label"));
// the page says the air is drawn thicker itself (in the line under the title, where the controls at the bottom do not cover it)
earth.setAttribute("air-label", "off");
if (query.get("air-thickness")) earth.setAttribute("air-thickness", query.get("air-thickness")!);
const bar = document.querySelector<HTMLElement & { controller: import("@johnmorrisdotca/kazoku-ui/view-controls").ViewController }>("kazoku-view-controls")!;
const when = document.querySelector<HTMLTimeElement>("#when")!;
const status = document.querySelector<HTMLElement>("#status")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const satsButton = document.querySelector<HTMLButtonElement>("#sats")!;
document.querySelector("main")!.prepend(earth);
bar.setAttribute("for", "sp");
status.textContent = say("help");

// the clock: from now at an hour a second unless the address holds it; a reader who asks for reduced motion gets a still view with Play ready
const DEFAULT_SPEED = 3600;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const askedSpeed = query.get("speed") !== null ? Number(query.get("speed")) : NaN;
const speed = Number.isFinite(askedSpeed) && askedSpeed !== 0 ? askedSpeed : DEFAULT_SPEED;
const named = Number.isFinite(Date.parse(query.get("time") ?? ""));
/** A link that says nothing about the clock opens moving, from now; `play=off`, `speed=0` and a date hold it, and so does a reader who asked for reduced motion (Play is ready). */
const opensMoving = (): boolean => {
  if (query.get("play") === "on") return true;
  if (query.get("play") === "off") return false;
  if (Number.isFinite(askedSpeed)) return askedSpeed !== 0;
  return !named && !reduced;
};
let playing = opensMoving();
if (named) earth.setAttribute("time", query.get("time")!);
earth.setAttribute("speed", playing ? String(speed) : "0");
const camera = query.get("camera");
if (camera === "space" || camera === "sun" || camera === "ground") earth.setAttribute("camera", camera);

const showPlay = (): void => {
  playButton.setAttribute("aria-pressed", String(playing));
  playButton.textContent = say(playing ? "pause" : "play");
};
playButton.addEventListener("click", () => {
  playing = !playing;
  earth.speed = playing ? speed : 0;
  showPlay();
});
showPlay();

// times are shown in the device's own time zone
const format = new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "en-CA", { dateStyle: "medium", timeStyle: "short" });
const show = (ms: number): void => {
  when.textContent = format.format(ms);
  when.dateTime = new Date(ms).toISOString();
};
show(earth.time === "now" ? Date.now() : earth.time);
earth.addEventListener("chikyu-timechange", (event) => show((event as CustomEvent<{ time: number }>).detail.time));
bar.addEventListener("kazoku-viewchange", (event) => {
  const detail = (event as CustomEvent<ViewChangeDetail>).detail;
  earth.setView(detail, detail.final);
});

const airButton = document.querySelector<HTMLButtonElement>("#air")!;
const airLine = document.querySelector<HTMLElement>("#air-line")!;
const markAir = (): void => {
  airButton.setAttribute("aria-pressed", String(earth.airThickness <= 1));
  airLine.hidden = earth.airThickness <= 1;
  airLine.textContent = airNoteText(lang, earth.airThickness);
};
airButton.addEventListener("click", () => {
  if (earth.airThickness <= 1) earth.removeAttribute("air-thickness");
  else earth.setAttribute("air-thickness", "1");
  markAir();
});
markAir();

const cameraButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-camera]")];
const markCamera = (): void => {
  for (const button of cameraButtons) button.setAttribute("aria-checked", String(button.dataset["camera"] === earth.camera));
};
for (const button of cameraButtons) {
  button.addEventListener("click", () => {
    earth.setAttribute("camera", button.dataset["camera"] as CameraMode);
    markCamera();
  });
}
markCamera();

// every group of the catalogue at once: one draw call a group, placed together about once a second and interpolated between
const GROUPS = Object.keys(GROUP_STYLE).filter((name) => name !== "yours");
let satellitesOn = false;
const loaded = new Set<string>();
async function showGroups(names: readonly string[], on: boolean): Promise<void> {
  satellitesOn = on;
  satsButton.setAttribute("aria-pressed", String(on));
  satsButton.textContent = say(on ? "sats_off" : "sats_all");
  if (!on) {
    for (const name of names) earth.showSatellites(name, false);
    status.textContent = say("help");
    return;
  }
  status.textContent = say("loading");
  const { createSatellites } = await import("../src/satellites/index.ts");
  await Promise.all(
    names.map(async (name) => {
      if (!loaded.has(name)) {
        const file = await fetchGroup(name).catch(() => null);
        if (!file) return;
        // the elements are a snapshot: with no date in the address and the snapshot old, show the day it was taken so the satellites are where they were
        earth.setSatellites(name, createSatellites(setsOfGroup(file)), { ...GROUP_STYLE[name]!, orbits: false });
        loaded.add(name);
      } else earth.showSatellites(name, true);
    }),
  );
  if (satellitesOn) status.textContent = say("shown", { n: earth.satelliteGroups.filter((group) => group.visible).reduce((sum, group) => sum + group.count, 0).toLocaleString(lang) });
}
satsButton.addEventListener("click", () => void showGroups(GROUPS, !satellitesOn));
const asked = query.get("sats");
if (asked) void showGroups(asked === "all" ? GROUPS : asked.split(",").filter((name) => name in GROUP_STYLE), true);
