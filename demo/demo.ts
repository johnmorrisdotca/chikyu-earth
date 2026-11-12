import "@johnmorrisdotca/kazoku-ui/view-controls/define";
import "@johnmorrisdotca/kazoku-ui/speed-buttons/define";
import "@johnmorrisdotca/kazoku-ui/replay-bar/define";
import "@johnmorrisdotca/kazoku-ui/wide-layout/define";
import type { ReplayBarElement, ReplayDetail } from "@johnmorrisdotca/kazoku-ui/replay-bar/element";
import { createAddressState } from "@johnmorrisdotca/kazoku-ui/address-state";
import type { ViewChangeDetail } from "@johnmorrisdotca/kazoku-ui/view-controls/element";
import "../src/element.ts";
import type { EmbedPanelElement } from "@johnmorrisdotca/kazoku-ui/embed-panel/element";
import { mountEmbedSection } from "./embed-section.ts";
import { attachMarkers, nearby, type MarkerEventDetail, type Markers, type Place, type PlaceLook } from "../src/markers/index.ts";
import { readPlaceLook } from "../src/markers/place-layer.ts";
import { crowd, PLACES } from "./places.ts";
import type { ChikyuEarth } from "../src/element.ts";
import type { ChikyuEarthRealistic } from "../src/realistic/element.ts";
import { WORDS } from "./words.js";
import type { BodyInfo, BodyName, ChikyuSpace, SpacePreset } from "../src/space/element.ts";
import type { BodyPainter } from "../src/space/index.ts";
import type { SatelliteInfo, SatelliteRef, Satellites } from "../src/satellites/index.ts";
import { fetchGroup, GROUP_STYLE, setsOfGroup, type GroupFile } from "./groups.ts";
import { catalogueEntry, findInCatalogue, SATELLITE_GROUPS, type SatelliteGroupInfo } from "../src/satellites/catalogue.ts";
import type { RideTarget } from "../src/space/element.ts";
import { planetPainter } from "./planet-painter.ts";
import { discRadius } from "../src/realistic/earth.ts";
import { readMeteorStrength } from "../src/meteors/strength.ts";
import { creditLine } from "../src/door/index.ts";
import { setBodyLabelFontUrl } from "../src/realistic/body-label.ts";
import { DEFAULT_DIM_AFTER_DAYS } from "../src/satellites/limits.ts";
import { mountMissions } from "./missions.ts";

type Look = "line" | "thick" | "realistic" | "space";

// the family's font for the name written on the Earth is served beside the page (scripts/site.ts)
setBodyLabelFontUrl("fonts/Michroma-Regular.ttf");

/** A word of the page in the language it is in now (the family's chooser, set by the page), English if the chooser is not there. */
const say = (key: string, values: Record<string, string | number> = {}): string => {
  const chooser = Reflect.get(globalThis, "chikyuLanguage") as { word(key: string): string | undefined } | undefined;
  return (chooser?.word(key) ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
};

const flat = document.querySelector<ChikyuEarth>("chikyu-earth");
const controls = document.querySelector("kazoku-view-controls");
const stage = document.querySelector<HTMLElement>("#globe");

if (flat && controls && stage) {
  const address = createAddressState({ defaults: { look: "line" } });
  const status = document.querySelector<HTMLElement>("#status");
  const realControls = document.querySelector<HTMLElement>("#real-controls");
  const cameraControls = document.querySelector<HTMLElement>("#camera-controls");
  const earthStage = document.querySelector<HTMLElement>(".earth-stage");
  const lightControls = document.querySelector<HTMLElement>("#light-controls");
  const timeControls = document.querySelector<HTMLElement>("#time-controls");
  const replay = document.querySelector<ReplayBarElement>("#replay")!;
  const spaceControls = document.querySelector<HTMLElement>("#space-controls");
  const scaleNote = document.querySelector<HTMLElement>("#scale-note");
  const satControls = document.querySelector<HTMLElement>("#sat-controls");
  const satInfo = document.querySelector<HTMLElement>("#sat-info");
  const paintRow = document.querySelector<HTMLElement>("#paint-controls");
  const satNote = document.querySelector<HTMLElement>("#sat-note");
  const rideControls = document.querySelector<HTMLElement>("#ride-controls");
  const rideInfo = document.querySelector<HTMLElement>("#ride-info");
  const placesBox = document.querySelector<HTMLElement>("#places");
  const pickedNote = document.querySelector<HTMLElement>("#picked");
  let space: ChikyuSpace | null = null;
  const lookButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-style]")];
  const realisticButton = lookButtons.find((b) => b.dataset["style"] === "realistic");
  const spaceButton = lookButtons.find((b) => b.dataset["style"] === "space");
  let real: ChikyuEarthRealistic | null = null;
  let markers: Markers | null = null;
  let listening: AbortController | null = null;
  const picked = document.querySelector<HTMLElement>("#picked");
  const hiddenGroups = new Set((address.get("hide") ?? "").split(",").filter(Boolean));
  const crowded = Number(address.get("places")) || 0;

  /** Put the places on whichever look is showing. */
  const mountMarkers = (element: ChikyuEarth | ChikyuEarthRealistic): void => {
    markers?.detach();
    listening?.abort();
    listening = new AbortController();
    const { signal } = listening;
    markers = attachMarkers(element);
    markers.addAll(crowded > 0 ? [...PLACES, ...crowd(Math.min(crowded, 20000))] : PLACES);
    for (const group of hiddenGroups) markers.hideGroup(group);
    Reflect.set(globalThis, "chikyuMarkers", markers);
    const tell = (text: string): void => {
      if (picked) picked.textContent = text;
    };
    const named = (d: MarkerEventDetail): string => d.marker?.label ?? say("together", { n: d.cluster?.length ?? 0 });
    element.addEventListener("chikyu-marker-hover", (e) => {
      const d = (e as CustomEvent<MarkerEventDetail>).detail;
      if (d.marker || d.cluster) tell(say("over", { name: named(d) }));
    }, { signal });
    element.addEventListener("chikyu-marker-click", (e) => tell(say("chose", { name: named((e as CustomEvent<MarkerEventDetail>).detail) })), { signal });
    element.addEventListener("chikyu-marker-focus", (e) => tell(say("focus", { name: named((e as CustomEvent<MarkerEventDetail>).detail) })), { signal });
  };

  const notice = (text: string | null): void => {
    if (!status) return;
    status.hidden = text === null;
    status.textContent = text ?? "";
  };

  /** The bar's hands are the only ones on the element it is for: the element applies what the bar says. */
  const barFor = (element: HTMLElement): void => {
    element.id ||= "earth-view";
    element.tabIndex = 0;
    controls.setAttribute("for", element.id);
  };
  controls.addEventListener("kazoku-viewchange", (event) => {
    const detail = (event as CustomEvent<ViewChangeDetail>).detail;
    if (real) {
      real.setView(detail, detail.final);
      return;
    }
    if (space) {
      space.setView(detail, detail.final);
      return;
    }
    flat.setView(detail, detail.final, detail.reason !== "auto");
  });

  const state = (): ViewChangeDetail => Reflect.get(controls, "state") as ViewChangeDetail;

  /**
   * Auto-turn's speed, for the look that is showing (MODULES-898). The `speed` attribute is the real rate (0.004 degrees a second, the line globe's own) and 1× on the buttons is real time, but a turn at that rate cannot be seen,
   * so the line and thick globes open on the 1440× button, a day a minute (a turn in a minute). The 3D looks have no real-time button: their 1× is six degrees a second, a turn in a minute too.
   */
  const REAL_TURN = "0.004178";
  const VISIBLE_TURN = "6";
  /** The pace a link asks for belongs to the look it opens on: that look keeps it, and a look chosen later starts at its own pace. */
  let linkPace: number | null = address.get("pace") === null ? null : Number(address.get("pace"));
  const turnFor = (visible: boolean): void => {
    const set = (name: string, value: string): void => {
      if (controls!.getAttribute(name) !== value) controls!.setAttribute(name, value);
    };
    const paces = visible ? [0.5, 1, 2] : [0.5, 1, 2, 1440];
    const asked = linkPace !== null && paces.includes(linkPace) ? String(linkPace) : null;
    linkPace = null;
    if (visible) {
      set("speed", VISIBLE_TURN);
      set("paces", paces.join(" "));
      set("pace", asked ?? "1");
    } else {
      set("speed", REAL_TURN);
      set("paces", paces.join(" "));
      set("pace", asked ?? "1440");
    }
  };

  function leave3d(): void {
    if (!real && !space) return;
    turnFor(false);
    settleClock();
    real?.remove();
    space?.remove();
    missionRow?.leave();
    real = null;
    space = null;
    barFor(flat!);
    Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "look");
    mountMarkers(flat!);
    flat!.hidden = false;
    for (const box of [realControls, cameraControls, lightControls, timeControls, spaceControls, scaleNote, bodyInfo, satControls, satInfo, satNote, rideControls, rideInfo]) if (box) box.hidden = true;
    if (placesBox) placesBox.hidden = false;
    if (pickedNote) pickedNote.hidden = false;
  }

  /**
   * The speed a view opens at: the first step of the Time row where motion can be seen (1 is real time, which looks frozen; 3600 is an hour a second, the Earth's turn and the night line move at once).
   * MODULES-815: John's rule is that every view opens moving, from now, at the first speed where movement shows.
   */
  const DEFAULT_SPEED = 3600;
  /**
   * Does a link that says nothing about the clock open moving for a reader who prefers reduced motion? John has not decided (MODULES-815), so today it opens still, as it did.
   * kazoku-ui's replay bar keeps Play ready under reduced motion (0.34.0): nothing starts by itself, and the reader's own press starts it; changing this to `true` would also let a link that says nothing open moving for such a reader.
   */
  const OPEN_MOVING_WITH_REDUCED_MOTION = false;
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const askedPlay = address.get("play");
  const askedSpeedText = address.get("speed");
  const askedSpeed = askedSpeedText !== null && askedSpeedText !== "" ? Number(askedSpeedText) : NaN;
  /** A link names a date when it has a `time` or a `mission` (a flight replay sets its own dates): the date it names is shown as it says, held unless the link also asks for Play or a speed. */
  const namesDate = Number.isFinite(Date.parse(address.get("time") ?? "")) || address.get("mission") !== null;
  /** Does the page open with the clock running? `play=on` and `play=off` say so; a link from before the bar that names a speed runs at it (`speed=0` holds); a link that says nothing about the clock, no date either, opens moving. */
  const opensMoving = (): boolean => {
    if (askedPlay === "on") return true;
    if (askedPlay === "off") return false;
    if (Number.isFinite(askedSpeed)) return askedSpeed !== 0;
    return !namesDate && (!reducedMotion || OPEN_MOVING_WITH_REDUCED_MOTION);
  };
  const clock = {
    /** Playing: the view's clock runs from the date shown at `speed` times real time. */
    play: opensMoving(),
    /** Times real time while playing; no speed, or `speed=0`, gets the first speed where motion shows. */
    speed: Number.isFinite(askedSpeed) && askedSpeed !== 0 ? askedSpeed : DEFAULT_SPEED,
  };
  let missionRow: ReturnType<typeof mountMissions> = null;
  const bodyInfo = document.querySelector<HTMLElement>("#body-info");
  let infoOf: { name: BodyName; facts: BodyInfo } | null = null;
  const describe = (name: BodyName, facts: BodyInfo): string => {
    const values = { name: say(`body_${name}`), radius: Math.round(facts.radiusKm).toLocaleString(say("locale")), distance: Math.round(facts.distanceKm).toLocaleString(say("locale")) };
    return say(name === "Earth" ? "bodyFactEarth" : "bodyFact", values);
  };
  /** Words that live in the element, not in the page: the names beside the bodies. */
  const speakSpace = (): void => {
    if (!space) return;
    space.bodyNames = Object.fromEntries(bodyButtons.map((b) => [b.dataset["body"], say(`body_${b.dataset["body"]}`)]));
    space.bodyHint = say("chooseBody");
    space.setAttribute("aria-label", say("spaceAria"));
    if (infoOf && bodyInfo && !bodyInfo.hidden) bodyInfo.textContent = describe(infoOf.name, infoOf.facts);
    speakRide();
  };
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(speakSpace));
  const bodyButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-body]")];
  /** Look at one body: it fills the view, and a line says how big it is and how far. */
  function lookAtBody(name: BodyName, info?: BodyInfo, keepView = false): void {
    if (!space) return;
    const same = keepView && !space.riding && space.body === name;
    if (space.riding) stopRide(true);
    space.body = name;
    if (!same) Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "body");
    for (const b of bodyButtons) b.classList.toggle("on", b.dataset["body"] === name);
    const facts = info ?? space.bodyInfo(name);
    if (bodyInfo) {
      bodyInfo.hidden = false;
      infoOf = { name, facts };
      bodyInfo.textContent = describe(name, facts);
    }
  }
  for (const button of bodyButtons) button.addEventListener("click", () => lookAtBody((button.dataset["body"] ?? "Earth") as BodyName));

  // --- satellites: the demo site's element files (elements/, one for each group), made into groups the first time one is asked for --------------------------------------------
  interface Manifest {
    retrieved: string;
    groups: Record<string, { file: string; retrieved: string; count: number; all: number }>;
    index: string;
  }
  const isJa = (): boolean => say("locale").startsWith("ja");
  const loadJson = <T,>(name: string): Promise<T> => fetch(`elements/${name}`).then((response) => (response.ok ? (response.json() as Promise<T>) : Promise.reject(new Error(String(response.status)))));
  const fetched = new Map<string, Promise<unknown>>();
  const once = <T,>(name: string, load: () => Promise<T> = () => loadJson<T>(name)): Promise<T> => {
    let found = fetched.get(name) as Promise<T> | undefined;
    if (!found) {
      found = load().catch((error: unknown) => {
        fetched.delete(name);
        throw error;
      });
      fetched.set(name, found);
    }
    return found;
  };
  const loadManifest = (): Promise<Manifest> => once<Manifest>("manifest.json");
  const made = new Map<string, Satellites>();
  const filesOf = new Map<string, GroupFile>();
  const shownGroups = new Set((address.get("sats") ?? "").split(",").filter((name) => name in GROUP_STYLE));
  const satBox = document.querySelector<HTMLElement>("#sat-groups");
  const satAbout = document.querySelector<HTMLElement>("#sat-about");
  const satSearch = document.querySelector<HTMLInputElement>("#sat-search");
  const satResults = document.querySelector<HTMLElement>("#sat-results");
  const groupLabel = (info: SatelliteGroupInfo): string => (isJa() ? info.labelJa : info.label);
  const satButtons = SATELLITE_GROUPS.map((info) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset["satGroup"] = info.id;
    button.setAttribute("aria-pressed", "false");
    button.textContent = info.label;
    button.style.setProperty("--dot", GROUP_STYLE[info.id]?.color ?? "currentColor");
    satBox?.append(button);
    return button;
  });
  const relabelSatellites = (): void => {
    for (const button of satButtons) button.textContent = button.dataset["satGroup"] === "yours" ? say("satYours") : groupLabel(SATELLITE_GROUPS.find((info) => info.id === button.dataset["satGroup"])!);
  };
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(relabelSatellites));
  relabelSatellites();
  /** The view the satellites are on: the space view, or the realistic Earth (which shows them too). */
  const satHost = (): ChikyuSpace | ChikyuEarthRealistic | null => space ?? real;
  const msOf = (view: ChikyuSpace | ChikyuEarthRealistic): number => (view.time === "now" ? Date.now() : view.time);
  let lastGroup: string | null = null;
  let chosen: SatelliteRef | null = null;

  async function groupOf(name: string): Promise<Satellites> {
    const found = made.get(name);
    if (found) return found;
    const [{ createSatellites }, data] = await Promise.all([import("../src/satellites/index.ts"), once<GroupFile>(`${name}.json`, () => fetchGroup(name))]);
    filesOf.set(name, data);
    const sets = setsOfGroup(data);
    const group = createSatellites(sets);
    made.set(name, group);
    Reflect.set(globalThis, "chikyuSatellites", { createSatellites, groups: made });
    return group;
  }
  const ageText = (days: number): string => (Math.abs(days) < 2 ? say("satAgeHours", { n: Math.round(Math.abs(days) * 24) }) : say("satAgeDays", { n: Math.round(Math.abs(days)) }));
  const aboutText = (noradId: number): string => {
    const entry = catalogueEntry(noradId);
    return entry ? (isJa() ? entry.aboutJa : entry.about) : "";
  };
  const describeSatellite = (info: SatelliteInfo): string => {
    const stale = Math.abs(info.ageDays) > DEFAULT_DIM_AFTER_DAYS ? say("satStale", { days: DEFAULT_DIM_AFTER_DAYS }) : "";
    return [say("satFact", { name: info.name, altitude: Math.round(info.altitudeKm), speed: info.speedKmS.toFixed(2), period: Math.round(info.periodMinutes), age: ageText(info.ageDays) }), stale, aboutText(info.noradId)].filter(Boolean).join(" ");
  };
  const showSatellite = (ref: SatelliteRef | null): void => {
    satHost()?.selectSatellite(ref);
    chosen = ref;
    const host = satHost();
    const info = ref && host ? host.satelliteInfo(ref) : undefined;
    if (satInfo) {
      satInfo.hidden = !info;
      satInfo.textContent = info ? describeSatellite(info) : "";
    }
    if (paintRow) paintRow.hidden = !info;
    address.set("sat", info ? String(info.noradId) : null);
  };
  let paintLength: "1d" | "1w" | "1m" = "1d";
  const applyPaint = (): void => {
    const host = satHost();
    const info = chosen && host ? host.satelliteInfo(chosen) : undefined;
    if (!host || !info) return;
    host.paint = { id: String(info.noradId), length: paintLength };
  };
  document.querySelector("#paint")?.addEventListener("click", applyPaint);
  document.querySelector("#paint-clear")?.addEventListener("click", () => satHost()?.clearPaint());
  for (const button of document.querySelectorAll<HTMLButtonElement>("#paint-length button")) {
    button.addEventListener("click", () => {
      paintLength = (button.dataset["length"] as "1d" | "1w" | "1m") || "1d";
      for (const other of document.querySelectorAll<HTMLButtonElement>("#paint-length button")) other.setAttribute("aria-pressed", String(other === button));
      if (satHost()?.paint) applyPaint();
    });
  }
  const ago = (ms: number): string => {
    const hours = Math.max(1, Math.round((Date.now() - ms) / 3_600_000));
    const format = new Intl.RelativeTimeFormat(say("locale"), { numeric: "auto" });
    return hours < 48 ? format.format(-hours, "hour") : format.format(-Math.round(hours / 24), "day");
  };
  const noteSatellites = (): void => {
    if (!satNote) return;
    const shown = [...shownGroups].filter((id) => made.has(id) && filesOf.has(id));
    satNote.hidden = shown.length === 0;
    const host = satHost();
    if (!shown.length || !host) return;
    const oldest = Math.min(...shown.map((id) => Date.parse(filesOf.get(id)!.retrieved)));
    const dim = shown.reduce((sum, id) => sum + made.get(id)!.sets.filter((set) => Math.abs(msOf(host) - Date.parse(`${set.EPOCH}Z`)) > DEFAULT_DIM_AFTER_DAYS * 86_400_000).length, 0);
    const locale = say("locale");
    satNote.textContent = [say("satNote", { ago: ago(oldest), shown: shown.reduce((sum, id) => sum + made.get(id)!.count, 0).toLocaleString(locale), all: shown.reduce((sum, id) => sum + filesOf.get(id)!.all, 0).toLocaleString(locale), limit: 60 }), dim ? say("satDim", { n: dim, days: DEFAULT_DIM_AFTER_DAYS }) : "", shown.some((id) => filesOf.get(id)!.source === "spacetrack") ? say("satSpaceTrack") : ""].filter(Boolean).join(" ");
  };
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(noteSatellites));
  const noteGroup = (): void => {
    if (!satAbout) return;
    const info = SATELLITE_GROUPS.find((one) => one.id === lastGroup);
    satAbout.hidden = !info || !shownGroups.has(info.id);
    if (info && !satAbout.hidden) satAbout.textContent = `${groupLabel(info)}: ${isJa() ? info.aboutJa : info.about}`;
  };
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(noteGroup));
  /** How far out a group goes, in Earth radii (capped at 8, so a few far-out telescopes do not shrink the Earth): from the mean motion and eccentricity of each satellite. */
  const reachOf = (sets: readonly { MEAN_MOTION: number; ECCENTRICITY: number }[]): number => {
    let far = 0;
    for (const set of sets) far = Math.max(far, 6.62 * Math.pow(1 / set.MEAN_MOTION, 2 / 3) * (1 + set.ECCENTRICITY));
    return Math.min(8, far);
  };
  /** Show or hide one group on the space view; the first time, make it. The elements are a snapshot: if it is too old for the date shown, show the day it was downloaded instead. */
  async function toggleGroup(name: string, on: boolean, fit = false): Promise<void> {
    const host = satHost();
    if (!host) return;
    const button = satButtons.find((b) => b.dataset["satGroup"] === name);
    button?.setAttribute("aria-pressed", String(on));
    if (on) shownGroups.add(name);
    else shownGroups.delete(name);
    address.set("sats", shownGroups.size ? [...shownGroups].join(",") : null);
    if (!on) {
      host.showSatellites(name, false);
      noteSatellites();
      noteGroup();
      return;
    }
    lastGroup = name;
    try {
      const group = await groupOf(name);
      const retrieved = Date.parse(filesOf.get(name)!.retrieved);
      if (Math.abs(msOf(host) - retrieved) > DEFAULT_DIM_AFTER_DAYS * 86_400_000 && address.get("time") === null) {
        host.time = retrieved;
        if (when) when.value = localValue(retrieved);
        now?.setAttribute("aria-pressed", "false");
        notice(say("satOld", { days: Math.round(Math.abs(Date.now() - retrieved) / 86_400_000), date: filesOf.get(name)!.retrieved.slice(0, 10) }));
      }
      if (!host.satelliteGroups.some((one) => one.name === name)) host.setSatellites(name, group, GROUP_STYLE[name]!);
      else host.showSatellites(name, true);
      noteSatellites();
      noteGroup();
      if (fit && !(host as ChikyuSpace).riding) {
        const reach = reachOf(group.sets);
        if (reach > 1.6) Reflect.get(controls!, "controller").set({ zoom: Math.min(1, 1.8 / reach) }, true, "satellites");
      }
    } catch {
      notice(say("satLoadFail"));
      button?.setAttribute("aria-pressed", "false");
      shownGroups.delete(name);
    }
  }
  for (const button of satButtons) button.addEventListener("click", () => void toggleGroup(button.dataset["satGroup"]!, button.getAttribute("aria-pressed") !== "true", true));

  /** Every name in every file, for Find: [number, name, group]. */
  const loadIndex = (): Promise<{ rows: [number, string, string][] }> => loadManifest().then((manifest) => once<{ rows: [number, string, string][] }>(manifest.index));
  const squash = (text: string): string => text.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  /** Switch the satellite's group on and mark it as the chosen one. */
  async function chooseSatellite(noradId: number, group?: string): Promise<boolean> {
    if (!satHost()) return false;
    let name = made.get("yours")?.sets.some((set) => set.NORAD_CAT_ID === noradId) ? "yours" : group;
    if (name !== "yours") {
      try {
        name = (await loadIndex()).rows.find((row) => row[0] === noradId)?.[2] ?? group;
      } catch {
        notice(say("satLoadFail"));
      }
    }
    if (!name || !(name in GROUP_STYLE)) return false;
    await toggleGroup(name, true, true);
    const index = (await groupOf(name).catch(() => null))?.sets.findIndex((set) => set.NORAD_CAT_ID === noradId) ?? -1;
    if (index < 0) return false;
    showSatellite({ group: name, index });
    return true;
  }
  async function runSearch(): Promise<void> {
    if (!satSearch || !satResults) return;
    const text = satSearch.value;
    const wanted = squash(text);
    satResults.replaceChildren();
    satResults.hidden = !wanted;
    if (!wanted) return;
    const found = new Map<number, { name: string; group: string }>();
    for (const set of made.get("yours")?.sets ?? []) if (found.size < 10 && (String(set.NORAD_CAT_ID) === wanted || squash(set.OBJECT_NAME).includes(wanted))) found.set(set.NORAD_CAT_ID, { name: set.OBJECT_NAME, group: "yours" });
    for (const entry of findInCatalogue(text, 6)) if (!found.has(entry.noradId)) found.set(entry.noradId, { name: entry.name, group: entry.group });
    try {
      for (const [id, name, group] of (await loadIndex()).rows) {
        if (found.size >= 10) break;
        if (!found.has(id) && (String(id) === wanted || squash(name).includes(wanted))) found.set(id, { name, group });
      }
    } catch {
      notice(say("satLoadFail"));
    }
    if (satSearch.value !== text) return;
    if (!found.size) {
      satResults.textContent = say("satNoMatch");
      return;
    }
    for (const [id, one] of found) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset["satPick"] = String(id);
      button.textContent = `${one.name} (${one.group === "yours" ? say("satYours") : groupLabel(SATELLITE_GROUPS.find((info) => info.id === one.group)!)})`;
      button.addEventListener("click", () => {
        void chooseSatellite(id, one.group);
        satResults.hidden = true;
      });
      satResults.append(button);
    }
  }
  satSearch?.addEventListener("input", () => void runSearch());
  satSearch?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") satResults?.querySelector<HTMLButtonElement>("button")?.click();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-sat-find]")) button.addEventListener("click", () => void chooseSatellite(Number(button.dataset["satFind"]), "stations"));

  // --- your own source: the visitor gives an address of OMM JSON, OMM CSV or TLE text and the browser reads it (no address is asked for on its own, none comes from the page's address) -------------------
  const sourceBox = document.querySelector<HTMLInputElement>("#sat-source");
  const sourceGo = document.querySelector<HTMLButtonElement>("#sat-source-go");
  const sourceNote = document.querySelector<HTMLElement>("#sat-source-note");
  if (sourceBox && address.get("src")) sourceBox.value = address.get("src") ?? "";
  const noteSource = (text: string | null): void => {
    if (!sourceNote) return;
    sourceNote.hidden = text === null;
    sourceNote.textContent = text ?? "";
  };
  async function loadSource(): Promise<void> {
    const view = satHost();
    if (!view || !sourceBox) return;
    const url = sourceBox.value.trim();
    if (!url) {
      noteSource(null);
      return;
    }
    sourceGo?.setAttribute("aria-busy", "true");
    try {
      const { createSatellites, fetchElements } = await import("../src/satellites/index.ts");
      const source = await fetchElements(url);
      if (source.sets.length === 0) {
        noteSource(say("satSourceNone", { n: source.skipped.length }));
        return;
      }
      const group = createSatellites(source.sets);
      made.set("yours", group);
      filesOf.set("yours", { id: "yours", retrieved: new Date(source.retrievedAt).toISOString(), all: source.sets.length + source.skipped.length, fields: [], rows: [] });
      if (view.satelliteGroups.some((one) => one.name === "yours")) view.setSatellites("yours", null);
      address.set("src", url);
      if (!satButtons.some((b) => b.dataset["satGroup"] === "yours")) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset["satGroup"] = "yours";
        button.style.setProperty("--dot", GROUP_STYLE["yours"]!.color);
        button.addEventListener("click", () => void toggleGroup("yours", button.getAttribute("aria-pressed") !== "true", true));
        satBox?.append(button);
        satButtons.push(button);
      }
      satButtons.find((b) => b.dataset["satGroup"] === "yours")!.textContent = say("satYours");
      shownGroups.delete("yours");
      await toggleGroup("yours", true, true);
      const host = new URL(source.url).host;
      noteSource(say("satSourceDone", { n: source.sets.length.toLocaleString(say("locale")), host, kept: source.fromCache ? say("satSourceKept", { ago: ago(source.retrievedAt) }) : say("satSourceNew"), skipped: source.skipped.length ? say("satSourceSkipped", { n: source.skipped.length, why: source.skipped[0]!.reason }) : "" }));
    } catch (error) {
      noteSource(say("satSourceFail", { why: error instanceof Error ? error.message : String(error) }));
    } finally {
      sourceGo?.removeAttribute("aria-busy");
    }
  }
  sourceGo?.addEventListener("click", () => void loadSource());
  sourceBox?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void loadSource();
  });

  // --- riding along: the camera at the ISS, a Starlink satellite, the Moon or Mars, looking at the Earth -------------------------------------------------------------------------
  let rideKey = address.get("ride");
  let rideView: "from" | "follow" | "above" = address.get("rview") === "follow" ? "follow" : address.get("rview") === "above" ? "above" : "from";
  let rideLook: "down" | "horizon" = address.get("rlook") === "horizon" ? "horizon" : "down";
  const FACES = ["ahead", "behind", "left", "right", "down", "up"] as const;
  let rideFace: (typeof FACES)[number] | null = FACES.includes(address.get("face") as (typeof FACES)[number]) ? (address.get("face") as (typeof FACES)[number]) : null;
  const rideButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-ride]")];
  const viewButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-ride-view]")];
  const lookButtonsRide = [...document.querySelectorAll<HTMLButtonElement>("[data-ride-look]")];
  const faceButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-ride-face]")];
  const markRide = (): void => {
    for (const b of rideButtons) b.classList.toggle("on", b.dataset["ride"] === (rideKey?.startsWith("group:") ? "group" : (rideKey ?? "none")));
    for (const b of viewButtons) b.classList.toggle("on", b.dataset["rideView"] === rideView);
    for (const b of lookButtonsRide) b.classList.toggle("on", b.dataset["rideLook"] === rideLook);
    const facing = space?.facing ?? null;
    for (const b of faceButtons) {
      const on = b.dataset["rideFace"] === facing;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
  };
  const setRideZoom = (keepTurn = false): void => {
    Reflect.get(controls!, "controller").set(keepTurn ? { zoom: 1 } : { zoom: 1, yaw: 0, tilt: 0 }, true, "ride");
  };
  const speakRide = (): void => {
    const riding = space?.riding;
    if (!rideInfo) return;
    if (!riding || !space) {
      rideInfo.hidden = true;
      return;
    }
    rideInfo.hidden = false;
    if (typeof riding.target === "string") {
      const facts = space.bodyInfo(riding.target);
      rideInfo.textContent = say(riding.view === "follow" ? "rideFollowBody" : "rideBody", { name: say(`body_${riding.target}`), distance: Math.round(facts.distanceKm).toLocaleString(say("locale")) });
    } else {
      const info = space.satelliteInfo(riding.target);
      rideInfo.textContent = info ? say("rideSat", { name: info.name, altitude: Math.round(info.altitudeKm), period: Math.round(info.periodMinutes) }) : say("rideLost");
    }
  };
  function stopRide(keepZoom = false): void {
    rideKey = null;
    space?.ride(null);
    if (!keepZoom && space) setRideZoom();
    markRide();
    speakRide();
    rideFace = null;
    for (const key of ["ride", "rview", "rlook", "face"]) address.set(key, null);
  }
  async function startRide(key: string, keepTurn = false): Promise<void> {
    if (!space) return;
    if (key === "none") {
      stopRide();
      return;
    }
    let target: RideTarget;
    if (key === "Moon" || key === "Mars") target = key;
    else if (key === "chosen") {
      if (!chosen) {
        notice(say("rideChoose"));
        return;
      }
      target = { ...chosen };
    } else if (key.startsWith("group:")) {
      const group = key.slice(6);
      if (!(group in GROUP_STYLE)) {
        notice(say("rideChoose"));
        return;
      }
      lastGroup = group;
      await toggleGroup(group, true);
      const satellites = await groupOf(group);
      const index = satellites.sets.findIndex((_, i) => space && satellites.info(i, space.time) !== undefined);
      if (index < 0 || !space) {
        notice(say("satNone"));
        return;
      }
      target = { group, index };
    } else {
      const group = key === "starlink" ? "starlink" : "stations";
      await toggleGroup(group, true);
      const sets = (await groupOf(group)).sets;
      const index = key === "starlink" ? 0 : sets.findIndex((set) => set.NORAD_CAT_ID === (key === "iss" ? 25544 : 48274));
      if (index < 0 || !space) return;
      target = { group, index };
    }
    // above is for a satellite: a body is followed, and the button and the address say so
    if (typeof target === "string" && rideView === "above") rideView = "follow";
    rideKey = key;
    markRide();
    if (key === "chosen") {
      space.selectSatellite(null);
      if (satInfo) satInfo.hidden = true;
    } else if (typeof target !== "string") showSatellite(null);
    space.ride(target, { view: rideView, look: rideLook, ...(rideFace ? { face: rideFace } : {}) });
    setRideZoom(keepTurn);
    speakRide();
    markRide();
    address.set("ride", key);
    address.set("rview", rideView === "from" ? null : rideView);
    address.set("rlook", rideLook === "horizon" ? "horizon" : null);
    address.set("face", rideFace);
  }
  // riding along is for watching it go by: a ride starts the clock (Play), and the date box moves with it
  for (const button of rideButtons) {
    button.addEventListener("click", () => {
      void startRide(button.dataset["ride"] === "group" ? `group:${lastGroup ?? ""}` : (button.dataset["ride"] ?? "none"));
      if (button.dataset["ride"] !== "none") setPlaying(true);
    });
  }
  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      rideView = button.dataset["rideView"] === "follow" ? "follow" : button.dataset["rideView"] === "above" ? "above" : "from";
      if (rideKey) void startRide(rideKey);
      else markRide();
    });
  }
  for (const button of lookButtonsRide) {
    button.addEventListener("click", () => {
      rideLook = button.dataset["rideLook"] === "horizon" ? "horizon" : "down";
      if (rideKey) void startRide(rideKey);
      else markRide();
    });
  }
  for (const button of faceButtons) {
    button.addEventListener("click", () => {
      const face = button.dataset["rideFace"];
      if (!space || !FACES.includes(face as (typeof FACES)[number])) return;
      rideFace = face as (typeof FACES)[number];
      if (!rideKey) void startRide("iss");
      // following a planet or the Moon there is no way to face: the button stays up and the address keeps nothing
      else if (space.facing !== rideFace && !space.face(rideFace)) rideFace = null;
      address.set("face", rideFace);
      markRide();
    });
  }
  let lightMode = ["lit", "boost"].includes(address.get("light") ?? "") ? (address.get("light") as string) : "sun";
  const lightButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-light]")];
  const markLight = (): void => {
    for (const b of lightButtons) b.classList.toggle("on", b.dataset["light"] === lightMode);
    address.set("light", lightMode === "sun" ? null : lightMode);
  };
  for (const button of lightButtons) {
    button.addEventListener("click", () => {
      lightMode = button.dataset["light"] ?? "sun";
      for (const element of [real, space]) element?.setAttribute("light", lightMode);
      markLight();
    });
  }
  markLight();
  // how the camera is held on the realistic Earth: over the ground (the Earth keeps still), in the stars (it turns beneath) or on the Sun's side
  let cameraMode = ["ground", "sun"].includes(address.get("camera") ?? "") ? (address.get("camera") as string) : "space";
  const cameraButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-camera]")];
  const markCamera = (): void => {
    for (const b of cameraButtons) {
      b.classList.toggle("on", b.dataset["camera"] === cameraMode);
      b.setAttribute("aria-pressed", String(b.dataset["camera"] === cameraMode));
    }
    address.set("camera", cameraMode === "space" ? null : cameraMode);
  };
  for (const button of cameraButtons) {
    button.addEventListener("click", () => {
      cameraMode = button.dataset["camera"] ?? "space";
      for (const element of [real, space]) element?.setAttribute("camera", cameraMode);
      markCamera();
    });
  }
  markCamera();
  let planetsTried = false;
  let planetsHere = false;
  let bodiesLook = ["realistic", "painted", "plain"].includes(address.get("bodies") ?? "") ? (address.get("bodies") as string) : "realistic";
  const bodiesButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-bodies]")];
  const markBodies = (): void => {
    for (const b of bodiesButtons) {
      b.classList.toggle("on", b.dataset["bodies"] === bodiesLook);
      b.hidden = !planetsHere && b.dataset["bodies"] !== "plain";
    }
    const label = document.querySelector<HTMLElement>("#bodies-label");
    if (label) label.hidden = !planetsHere;
    for (const b of bodiesButtons) if (!planetsHere) b.parentElement!.hidden = true;
    address.set("bodies", bodiesLook === "realistic" ? null : bodiesLook);
  };
  for (const button of bodiesButtons) {
    button.addEventListener("click", () => {
      bodiesLook = button.dataset["bodies"] ?? "realistic";
      space?.setAttribute("bodies", bodiesLook);
      markBodies();
    });
  }

  async function enterSpace(): Promise<boolean> {
    const [{ setThreeLoader, setBodyPainter, setSatellitePainter }, { stationModels }] = await Promise.all([import("../src/space/element.ts"), import("./station-models.ts")]);
    setThreeLoader(() => import("./three-subset.ts"));
    // the followed ISS, Tiangong and Hubble are drawn as these made-up models: a page supplies its own
    if (address.get("models") !== "off") setSatellitePainter(stationModels);
    // the Sun, the planets, Pluto and their moons are wakusei-planets' (an optional peer): the real ones, or plain spheres where it is not there
    if (!planetsTried) {
      planetsTried = true;
      // a browser test may hand the page a painter of its own (`window.__bodyPainter`), or a function that wraps the real one (`window.__wrapBodyPainter`), to watch how the view reads the painter's credit
      const own = Reflect.get(window, "__bodyPainter") as BodyPainter | undefined;
      const wrap = Reflect.get(window, "__wrapBodyPainter") as ((real: BodyPainter) => BodyPainter) | undefined;
      const real = own ?? (await planetPainter());
      const planets = real && !own && wrap ? wrap(real) : real;
      if (planets) setBodyPainter(planets);
      planetsHere = planets !== null;
    }
    if (!space) {
      leave3d();
      const element = document.createElement("chikyu-space") as ChikyuSpace;
      const centre = flat!.centre;
      element.setAttribute("center", `${centre.lon},${centre.lat}`);
      element.setAttribute("texture-base", "textures/");
      element.setAttribute("tiles", "tiles/");
      element.setAttribute("bodies", bodiesLook);
      element.setAttribute("camera", cameraMode);
      turnFor(true);
      if (lightMode !== "sun") element.setAttribute("light", lightMode);
      const scale = address.get("scale");
      const startTime = address.get("time");
      if (scale === "true") element.setAttribute("scale", "true");
      // the clock runs only while Play is on; a held space view draws nothing
      element.setAttribute("speed", clock.play ? String(clock.speed) : "0");
      if (address.get("meteors") === "on") element.setAttribute("meteors", "");
      if (address.get("star-names")) element.setAttribute("star-names", address.get("star-names")!);
      if (address.get("constellation-lines")) element.setAttribute("constellation-lines", address.get("constellation-lines")!);
      for (const name of ["constellation-names", "constellation-culture"] as const) if (address.get(name) !== null) element.setAttribute(name, address.get(name)!);
      if (address.get("body-label") !== null) element.setAttribute("body-label", address.get("body-label")!);
      if (address.get("meteors-strength")) element.setAttribute("meteors-strength", address.get("meteors-strength")!);
      if (address.get("air-thickness")) element.setAttribute("air-thickness", address.get("air-thickness")!);
      if (address.get("city-names") !== null) element.setAttribute("city-names", address.get("city-names")!);
      if (address.get("borders") === "on") element.setAttribute("borders", "");
      if (address.get("grid") === "on") element.setAttribute("grid", "");
      if (address.get("country-names") === "on") element.setAttribute("country-names", "");
      if (address.get("orbits") === "off") element.setAttribute("orbits", "off");
      if (address.get("labels") === "off") element.setAttribute("labels", "off");
      if (startTime && Number.isFinite(Date.parse(startTime))) element.setAttribute("time", startTime);
      element.addEventListener("chikyu-unavailable", () => {
        notice(say("noWebglSpace"));
        if (spaceButton) spaceButton.disabled = true;
        void setLook("line");
      });
      // A press on the body already looked at keeps the view: a double-click there is the gesture that fits it (kazoku-ui's controller), and the first click must not put the zoom back under it.
      element.addEventListener("chikyu-body-click", (e) => lookAtBody((e as CustomEvent<BodyInfo>).detail.name, (e as CustomEvent<BodyInfo>).detail, true));
      element.addEventListener("chikyu-satellite-click", (e) => showSatellite((e as CustomEvent<SatelliteRef>).detail));
      element.addEventListener("chikyu-satellites-unavailable", () => notice(say("satLoadFail")));
      element.addEventListener("chikyu-ride-lost", () => {
        notice(say("rideLost"));
        stopRide();
      });
      // the clock: the element tells the date while time runs (a few times a second) and once when it holds
      element.addEventListener("chikyu-timechange", (e) => {
        const { time, running } = (e as CustomEvent<{ time: number; running: boolean }>).detail;
        if (when && document.activeElement !== when) when.value = localValue(time);
        if (running) return;
        // the clock holds: the date it stopped on is the date shown, and the address keeps it
        address.set("time", isoSecond(time));
        now?.setAttribute("aria-pressed", "false");
      });
      markers?.detach();
      markers = null;
      listening?.abort();
      flat!.hidden = true;
      stage!.append(element);
      barFor(element);
      space = element;
      element.addEventListener("chikyu-ride-face", () => {
        rideFace = space?.facing ?? null;
        address.set("face", space?.facing ?? null);
        markRide();
      });
      markClock();
      speakSpace();
      Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "look");
      element.setView(state());
    }
    if (realControls) realControls.hidden = true;
    if (lightControls) lightControls.hidden = false;
    if (cameraControls) cameraControls.hidden = false;
    for (const box of [timeControls, spaceControls, satControls, rideControls]) if (box) box.hidden = false;
    markClock();
    missionRow?.enter();
    markBodies();
    markRide();
    if (scaleNote) scaleNote.hidden = space!.scale !== "compressed";
    for (const b of satButtons) b.setAttribute("aria-pressed", String(shownGroups.has(b.dataset["satGroup"] ?? "")));
    for (const name of shownGroups) void toggleGroup(name, true);
    const wanted = Number(address.get("sat"));
    const restored = wanted ? chooseSatellite(wanted) : Promise.resolve(true);
    if (rideKey) void restored.then(() => startRide(rideKey!, true));
    if (placesBox) placesBox.hidden = true;
    if (pickedNote) pickedNote.hidden = true;
    return true;
  }

  async function enterRealistic(): Promise<boolean> {
    const [{ setThreeLoader }] = await Promise.all([import("../src/realistic/element.ts")]);
    setThreeLoader(() => import("./three-subset.ts"));
    if (!real) {
      leave3d();
      const element = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
      const centre = flat!.centre;
      element.setAttribute("center", `${centre.lon},${centre.lat}`);
      element.setAttribute("texture-base", "textures/");
      element.setAttribute("tiles", "tiles/");
      const clouds = address.get("clouds");
      const lights = address.get("lights");
      const startTime = address.get("time");
      if (clouds === "off") element.setAttribute("clouds", "off");
      if (lights === "off") element.setAttribute("lights", "off");
      if (address.get("meteors") === "on") element.setAttribute("meteors", "");
      if (address.get("star-names")) element.setAttribute("star-names", address.get("star-names")!);
      if (address.get("constellation-lines")) element.setAttribute("constellation-lines", address.get("constellation-lines")!);
      for (const name of ["constellation-names", "constellation-culture"] as const) if (address.get(name) !== null) element.setAttribute(name, address.get(name)!);
      if (address.get("body-label") !== null) element.setAttribute("body-label", address.get("body-label")!);
      if (address.get("meteors-strength")) element.setAttribute("meteors-strength", address.get("meteors-strength")!);
      if (address.get("air-thickness")) element.setAttribute("air-thickness", address.get("air-thickness")!);
      if (address.get("city-names") !== null) element.setAttribute("city-names", address.get("city-names")!);
      if (address.get("borders") === "on") element.setAttribute("borders", "");
      if (address.get("grid") === "on") element.setAttribute("grid", "");
      if (address.get("country-names") === "on") element.setAttribute("country-names", "");
      if (lightMode !== "sun") element.setAttribute("light", lightMode);
      element.setAttribute("camera", cameraMode);
      turnFor(true);
      if (startTime && Number.isFinite(Date.parse(startTime))) element.setAttribute("time", startTime);
      element.addEventListener("chikyu-satellite-click", (e) => showSatellite((e as CustomEvent<SatelliteRef>).detail));
      // the clock runs while Play is on (a link that says nothing opens playing, from now); held at "now" the Sun is put right once a minute, and the date box follows
      if (clock.play) element.setAttribute("speed", String(clock.speed));
      else if (askedSpeed === 0 && askedPlay !== "off") element.setAttribute("speed", "0"); // a link that says `speed=0` holds the Earth where it opens, not on the real clock
      // the date box follows the clock while it runs, and once when it holds the date it stopped on is the date shown, in the address
      element.addEventListener("chikyu-timechange", (e) => {
        const { time, running } = (e as CustomEvent<{ time: number; running: boolean }>).detail;
        if (when && document.activeElement !== when) when.value = localValue(time);
        if (running) return;
        address.set("time", isoSecond(time));
        now?.setAttribute("aria-pressed", "false");
      });
      element.addEventListener("chikyu-unavailable", () => {
        notice(say("noWebgl"));
        if (realisticButton) realisticButton.disabled = true;
        void setLook("line");
      });
      flat!.hidden = true;
      stage!.append(element);
      barFor(element);
      real = element;
      // whose data is on the screen: the credit line of the realistic Earth, in the page's language (the data door); `?data=own` ignores every outside source
      if (address.get("data") === "own") element.setAttribute("data", "own");
      const doorLine = document.querySelector<HTMLElement>("#door-credit");
      if (doorLine) {
        const show = (): void => {
          doorLine.textContent = creditLine(element.credits(), say("locale").startsWith("ja") ? "ja" : "en");
        };
        element.addEventListener("chikyu-creditschange", show);
        document.addEventListener("kazoku-languagechange", () => queueMicrotask(show));
        show();
      }
      element.setView(state(), true);
      mountMarkers(element);
    }
    if (realControls) realControls.hidden = false;
    if (lightControls) lightControls.hidden = false;
    if (cameraControls) cameraControls.hidden = false;
    if (timeControls) timeControls.hidden = false;
    if (satControls) satControls.hidden = false;
    markClock();
    for (const box of [spaceControls, scaleNote, rideControls]) if (box) box.hidden = true;
    // the satellites are on the realistic Earth too: the groups shown stay shown
    for (const b of satButtons) b.setAttribute("aria-pressed", String(shownGroups.has(b.dataset["satGroup"] ?? "")));
    for (const name of shownGroups) void toggleGroup(name, true);
    const wanted = Number(address.get("sat"));
    if (wanted) void chooseSatellite(wanted);
    return true;
  }

  /** Exact grab where the globe's radius is known (the flat globe fills its square; the Earth from space has its glow outside the disc); the space view keeps the fixed angle. */
  let shownLook: Look = "line";
  function markGrab(look: Look): void {
    shownLook = look;
    if (look === "space") controls!.removeAttribute("grab-radius");
    else if (look === "realistic") controls!.setAttribute("grab-radius", String(discRadius(stage!.clientWidth, stage!.clientHeight, 1)));
    else controls!.setAttribute("grab-radius", "fit");
  }

  async function setLook(next: Look): Promise<void> {
    if (next === "realistic") {
      notice(null);
      await enterRealistic();
    } else if (next === "space") {
      notice(null);
      await enterSpace();
    } else {
      leave3d();
      flat!.setAttribute("style", next);
      flat!.setView(state(), true);
    }
    linkPace = null;
    markGrab(next);
    for (const box of [yourPlaces, hereNote]) if (box) box.hidden = next !== "realistic" && next !== "space";
    showPlaces();
    if (earthStage) earthStage.dataset["look"] = next;
    address.set("look", next);
    for (const b of lookButtons) {
      b.classList.toggle("on", b.dataset["style"] === next);
      b.setAttribute("aria-pressed", String(b.dataset["style"] === next));
    }
  }

  for (const button of lookButtons) {
    button.addEventListener("click", () => void setLook((button.dataset["style"] ?? "line") as Look));
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("#places [data-group]")) {
    const group = button.dataset["group"] ?? "";
    button.setAttribute("aria-pressed", String(!hiddenGroups.has(group)));
    button.addEventListener("click", () => {
      const shown = markers?.toggleGroup(group) ?? true;
      button.setAttribute("aria-pressed", String(shown));
      if (shown) hiddenGroups.delete(group);
      else hiddenGroups.add(group);
      address.set("hide", hiddenGroups.size ? [...hiddenGroups].join(",") : null);
    });
  }
  mountMarkers(flat);

  const grat = document.querySelector<HTMLButtonElement>("#grat");
  grat?.addEventListener("click", () => {
    grat.setAttribute("aria-pressed", String(flat.toggleAttribute("graticule")));
    address.set("graticule", flat.hasAttribute("graticule") ? "1" : null);
  });

  document.querySelector<HTMLButtonElement>("#locate")?.addEventListener("click", () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      const centre = `${position.coords.longitude},${position.coords.latitude}`;
      flat.setAttribute("center", centre);
      real?.setAttribute("center", centre);
      space?.setAttribute("center", centre);
    });
  });

  // Your places, on the realistic and space looks: where the reader is, asked of the browser only when they press the button, rounded to about 10 km and kept in this page alone (never in the address),
  // and the markers' look
  const yourPlaces = document.querySelector<HTMLElement>("#your-places");
  const hereNote = document.querySelector<HTMLElement>("#here-note");
  const hereButton = document.querySelector<HTMLButtonElement>("#here");
  const lookChoices = [...document.querySelectorAll<HTMLButtonElement>("[data-place-look]")];
  let here: Place | null = null;
  let placeLook: PlaceLook = readPlaceLook(address.get("place-look"));
  // the favourites are example cities; the ones chosen are kept in the address (`fav`), as a site would keep them in the reader's account
  const favButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-fav]")];
  const favouriteNames = favButtons.map((b) => b.dataset["fav"] ?? "");
  const favourites = new Set((address.get("fav") ?? "").split(",").filter((name) => favouriteNames.includes(name)));
  function showPlaces(): void {
    const list: Place[] = here ? [{ ...here, label: say("hereLabel") }] : [];
    for (const b of favButtons) {
      const name = b.dataset["fav"] ?? "";
      const city = PLACES.find((m) => m.id === `city:${name}`);
      b.setAttribute("aria-pressed", String(favourites.has(name)));
      if (city && favourites.has(name)) list.push({ id: city.id, lon: city.lon, lat: city.lat, label: say(b.dataset["say"] ?? ""), kind: "favourite" });
    }
    for (const element of [real, space]) {
      if (!element) continue;
      element.places = list;
      element.placesLook = placeLook;
    }
    for (const b of lookChoices) {
      b.classList.toggle("on", b.dataset["placeLook"] === placeLook);
      b.setAttribute("aria-pressed", String(b.dataset["placeLook"] === placeLook));
    }
  }
  hereButton?.addEventListener("click", () => {
    if (here) {
      here = null;
      hereButton.setAttribute("aria-pressed", "false");
      showPlaces();
      return;
    }
    if (!navigator.geolocation) {
      notice(say("hereFail"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const at = nearby({ lon: position.coords.longitude, lat: position.coords.latitude });
        here = { id: "here", lon: at.lon, lat: at.lat, kind: "here" };
        hereButton.setAttribute("aria-pressed", "true");
        notice(null);
        for (const element of [real, space]) element?.setAttribute("center", `${at.lon},${at.lat}`);
        showPlaces();
      },
      () => notice(say("hereFail")),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  });
  for (const button of favButtons) {
    button.addEventListener("click", () => {
      const name = button.dataset["fav"] ?? "";
      if (!favourites.delete(name)) favourites.add(name);
      address.set("fav", favourites.size ? favouriteNames.filter((n) => favourites.has(n)).join(",") : null);
      showPlaces();
    });
  }
  for (const button of lookChoices) {
    button.addEventListener("click", () => {
      placeLook = readPlaceLook(button.dataset["placeLook"] ?? null);
      address.set("place-look", placeLook === "beam" ? null : placeLook);
      showPlaces();
    });
  }
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(showPlaces));

  const clouds = document.querySelector<HTMLButtonElement>("#clouds");
  const lights = document.querySelector<HTMLButtonElement>("#lights");
  const when = document.querySelector<HTMLInputElement>("#when");
  const now = document.querySelector<HTMLButtonElement>("#now");

  const toggle = (button: HTMLButtonElement | null, key: "clouds" | "lights"): void => {
    button?.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      if (real) real[key] = on;
      address.set(key, on ? null : "off");
    });
  };
  toggle(clouds, "clouds");
  toggle(lights, "lights");
  // Meteors are off unless asked for (`meteors=on` in the address); the realistic Earth and the space view draw them and say under the picture that each streak is an illustration.
  const meteors = document.querySelector<HTMLButtonElement>("#meteors");
  meteors?.addEventListener("click", () => {
    const on = meteors.getAttribute("aria-pressed") !== "true";
    meteors.setAttribute("aria-pressed", String(on));
    if (real) real.meteors = on;
    if (space) space.meteors = on;
    address.set("meteors", on ? "on" : null);
  });

  // How strongly they are drawn (`meteors-strength` in the address, 0 to 1; the elements' own default, 1, is the whole look and writes nothing).
  const strengthButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-meteor-strength]")];
  const markStrength = (value: number): void => {
    for (const b of strengthButtons) b.classList.toggle("on", Number(b.dataset["meteorStrength"]) === value);
  };
  for (const b of strengthButtons) {
    b.addEventListener("click", () => {
      const value = Number(b.dataset["meteorStrength"]);
      markStrength(value);
      for (const element of [real, space]) {
        if (!element) continue;
        if (value === 1) element.removeAttribute("meteors-strength");
        else element.setAttribute("meteors-strength", String(value));
      }
      address.set("meteors-strength", value === 1 ? null : String(value));
    });
  }

  // The Earth's name written on the globe (`body-label` in the address: painted, etched, outline or burned; none by default): the family's label, drawn by the realistic Earth and the space view.
  const labelButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-body-label]")];
  const markLabel = (look: string): void => {
    for (const b of labelButtons) b.classList.toggle("on", (b.dataset["bodyLabel"] ?? "") === look);
  };
  for (const b of labelButtons) {
    b.addEventListener("click", () => {
      const look = b.dataset["bodyLabel"] ?? "";
      markLabel(look);
      for (const element of [real, space]) {
        if (!element) continue;
        if (look === "") element.removeAttribute("body-label");
        else element.setAttribute("body-label", look);
      }
      address.set("body-label", look === "" ? null : look);
    });
  }

  // The names of the brightest stars (`star-names=12` in the address) and the constellations as faint lines (`constellation-lines=0.16`): hoshi-stars' sky labels, laid over the sky by the realistic Earth and the space view; off by default.
  for (const [id, attribute, on] of [["#star-names", "star-names", "12"], ["#constellation-lines", "constellation-lines", "0.16"]] as const) {
    const button = document.querySelector<HTMLButtonElement>(id);
    button?.addEventListener("click", () => {
      const next = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(next));
      for (const element of [real, space]) {
        if (!element) continue;
        if (next) element.setAttribute(attribute, on);
        else element.removeAttribute(attribute);
      }
      address.set(attribute, next ? on : null);
    });
    if (address.get(attribute)) button?.setAttribute("aria-pressed", "true");
  }

  // The air is drawn 3 times its real thickness so it can be seen (the elements' default, and they say so); this button draws it as it is (`air-thickness=1` in the address).
  const airTrue = document.querySelector<HTMLButtonElement>("#air-true");
  airTrue?.addEventListener("click", () => {
    const on = airTrue.getAttribute("aria-pressed") !== "true";
    airTrue.setAttribute("aria-pressed", String(on));
    for (const element of [real, space]) {
      if (on) element?.setAttribute("air-thickness", "1");
      else element?.removeAttribute("air-thickness");
    }
    address.set("air-thickness", on ? "1" : null);
  });

  // The names of cities (`city-names=24` in the address): kuni's cities named on the realistic Earth and the space view, more as the Earth grows on the screen, in the page's language; off by default.
  const cityNames = document.querySelector<HTMLButtonElement>("#city-names");
  cityNames?.addEventListener("click", () => {
    const on = cityNames.getAttribute("aria-pressed") !== "true";
    cityNames.setAttribute("aria-pressed", String(on));
    for (const element of [real, space]) {
      if (on) element?.setAttribute("city-names", "24");
      else element?.removeAttribute("city-names");
    }
    address.set("city-names", on ? "24" : null);
  });
  // The borders (`borders=on` in the address): chizu's country borders on the realistic Earth and the space view, and the regions' where the page has them; off by default.
  const borders = document.querySelector<HTMLButtonElement>("#borders");
  borders?.addEventListener("click", () => {
    const on = borders.getAttribute("aria-pressed") !== "true";
    borders.setAttribute("aria-pressed", String(on));
    for (const element of [real, space]) {
      if (on) element?.setAttribute("borders", "");
      else element?.removeAttribute("borders");
    }
    address.set("borders", on ? "on" : null);
  });
  // The grid and the country names (`grid=on`, `country-names=on` in the address): on the realistic Earth and the space view; off by default.
  for (const [id, name] of [
    ["grid", "grid"],
    ["country-names", "country-names"],
  ] as const) {
    const button = document.querySelector<HTMLButtonElement>(`#${id}`);
    button?.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      for (const element of [real, space]) {
        if (on) element?.setAttribute(name, "");
        else element?.removeAttribute(name);
      }
      address.set(name, on ? "on" : null);
    });
  }
  // The clock. The date box follows it: <chikyu-space> sends `chikyu-timechange` while time runs and once when it holds, and the box shows it (never while the reader is typing in it).
  // Play runs the clock from the date shown; Pause holds it there and writes the date reached to the address (`time`); Back goes to the date the reader chose. `play=on` and `speed` stay in the address.
  // A link that says nothing about the clock opens moving, from now, at DEFAULT_SPEED (MODULES-815). A link with `speed=0`, `play=off` or a date (`time`) holds; one that names a speed other than 0 runs at it.
  const missionBar = document.querySelector<ReplayBarElement>("#mission-replay");
  /** The date the reader chose (the address, the box or Now): Back returns to it. */
  let origin = Number.isFinite(Date.parse(address.get("time") ?? "")) ? Date.parse(address.get("time")!) : Date.now();
  /** The view whose clock the bar runs: the space view or the realistic Earth. */
  const clocked = (): ChikyuSpace | ChikyuEarthRealistic | null => space ?? real;
  /** The moment the view shows, in milliseconds (the realistic Earth reads "now" while it follows the real clock). */
  const momentOf = (view: ChikyuSpace | ChikyuEarthRealistic): number => (typeof view.time === "number" ? view.time : Date.now());
  /** Does the date the reader chose follow the real clock (no date in the address, or Now)? The realistic Earth is live then, and Back returns it to that. */
  let originLive = !Number.isFinite(Date.parse(address.get("time") ?? ""));
  /** The reader held the clock with no date to write into the address (Back to "now", or Now while held): the address says `play=off`, so a link made then opens held, not moving. */
  let heldNoDate = askedPlay === "off";
  /** The clock's speed: nothing runs while Play is off, and a held view draws nothing. The realistic Earth that was never played is live at "now" and is left alone until Play. */
  const runClock = (): void => {
    if (space) space.speed = clock.play ? clock.speed : 0;
    else if (real && (clock.play || real.hasAttribute("speed"))) real.speed = clock.play ? clock.speed : 0;
  };
  /** Show the clock's state: the bar (Play comes out off for a reader who prefers reduced motion), its words, and the address, while the space view is on. */
  function markClock(): void {
    if (replay.playing !== clock.play) replay.playing = clock.play;
    clock.play = replay.playing;
    if (replay.getAttribute("speed") !== String(clock.speed)) replay.setAttribute("speed", String(clock.speed));
    replay.setAttribute("lang", say("locale").startsWith("ja") ? "ja" : "en");
    replay.words = { group: say("time"), start: say("back") };
    replay.hidden = !clocked();
    if (!clocked()) return;
    address.set("play", clock.play ? "on" : heldNoDate ? "off" : null);
    address.set("speed", clock.speed === DEFAULT_SPEED ? null : String(clock.speed));
  }
  /** Leaving a 3D view while it runs: the date it had reached is the date the next view shows, and the next view goes on running from it (a reader who had paused it finds it held). */
  function settleClock(): void {
    const view = clocked();
    if (!view) return;
    if (clock.play) address.set("time", isoSecond(momentOf(view)));
    address.set("play", null);
  }
  /** Play or Pause. Play starts from the date shown: a date that follows "now" becomes that moment, so the clock does not jump to a later now. */
  function setPlaying(on: boolean): void {
    const view = clocked();
    if (!view) return;
    if (on && missionBar?.playing) missionBar.playing = false;
    if (on && address.get("time") === null) {
      const at = momentOf(view);
      view.time = at;
      address.set("time", isoSecond(at));
    }
    clock.play = on;
    heldNoDate = false;
    markClock();
    runClock();
  }
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(markClock));
  replay.addEventListener("kazoku-replay", (event) => {
    const { action, playing, reason } = (event as CustomEvent<ReplayDetail>).detail;
    const view = clocked();
    if (reason !== "user" || action === "repeat" || !view) return;
    if (action === "start") {
      // Back: the date the reader chose, held (the realistic Earth that was following the real clock goes back to following it)
      clock.play = false;
      heldNoDate = originLive && real !== null;
      markClock();
      if (real && originLive) {
        real.removeAttribute("speed");
        real.time = "now";
        address.set("time", null);
        now?.setAttribute("aria-pressed", "true");
        if (when) when.value = localValue(Date.now());
        return;
      }
      runClock();
      view.time = origin;
      address.set("time", isoSecond(origin));
      now?.setAttribute("aria-pressed", "false");
      if (when) when.value = localValue(origin);
      return;
    }
    setPlaying(playing);
  });
  replay.addEventListener("kazoku-speedchange", (event) => {
    const { value, reason } = (event as CustomEvent<{ value: number; reason: string }>).detail;
    if (reason !== "user") return;
    clock.speed = value;
    markClock();
    runClock();
  });
  // leaving while the clock runs: the date it had reached goes into the address, so a returning reader is where they were
  addEventListener("pagehide", () => {
    const view = clocked();
    if (!view || !clock.play) return;
    address.set("time", isoSecond(momentOf(view)));
    address.flush();
  });
  missionRow = mountMissions({
    space: () => space,
    say,
    address,
    holdClock: () => {
      if (space) space.speed = 0;
      clock.play = false;
      markClock();
      now?.setAttribute("aria-pressed", "false");
    },
    dated: (ms) => {
      if (when && document.activeElement !== when) when.value = localValue(ms);
    },
    notice,
    select: showSatellite,
  });
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(() => missionRow?.relabel()));
  const scaleButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-scale]")];
  for (const button of scaleButtons) {
    button.addEventListener("click", () => {
      const value = button.dataset["scale"] === "true" ? "true" : "compressed";
      if (space) space.scale = value;
      for (const b of scaleButtons) b.classList.toggle("on", b === button);
      if (scaleNote) scaleNote.hidden = value !== "compressed";
      address.set("scale", value === "true" ? "true" : null);
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-jump]")) {
    button.addEventListener("click", () => {
      if (!space) return;
      const jump = (button.dataset["jump"] ?? "earth") as SpacePreset;
      const focus = (jump.endsWith("-moons") ? jump.slice(0, -6) : "Earth") as BodyName;
      space.body = focus;
      for (const b of bodyButtons) b.classList.toggle("on", b.dataset["body"] === focus);
      Reflect.get(controls, "controller").set({ zoom: space.zoomFor(jump) }, true, "jump");
    });
  }
  const orbits = document.querySelector<HTMLButtonElement>("#orbits");
  const names = document.querySelector<HTMLButtonElement>("#labels");
  for (const [button, key] of [[orbits, "orbits"], [names, "labels"]] as const) {
    button?.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      if (space) space[key] = on;
      address.set(key, on ? null : "off");
    });
  }

  const isoSecond = (ms: number): string => new Date(ms).toISOString().slice(0, 19) + "Z";
  const localValue = (ms: number): string => {
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
  };
  when?.addEventListener("change", () => {
    const ms = new Date(when.value).getTime();
    if (!Number.isFinite(ms)) return;
    now?.setAttribute("aria-pressed", "false");
    origin = ms;
    originLive = false;
    if (real) real.time = ms;
    if (space) space.time = ms;
    address.set("time", isoSecond(ms));
  });
  now?.addEventListener("click", () => {
    now.setAttribute("aria-pressed", "true");
    origin = Date.now();
    originLive = true;
    if (when) when.value = localValue(origin);
    if (real) {
      // not playing: back to following the real clock, as it always did; playing: it goes on from now at the speed chosen
      if (!clock.play) real.removeAttribute("speed");
      real.time = "now";
    }
    if (space) space.time = "now";
    address.set("time", null);
    // held at now with no date to keep: the address says so, or a link made now would open moving
    heldNoDate = !clock.play && clocked() !== null;
    markClock();
  });

  // The choices in the address: ?look=realistic&graticule=1&clouds=off&lights=off&time=2026-06-21T12:00Z
  const opened = address.all();
  const start = opened["center"]?.split(",").map(Number);
  if (start && start.length === 2 && start.every(Number.isFinite)) flat.setAttribute("center", `${start[0]},${start[1]}`);
  if (opened["graticule"] === "1") {
    flat.setAttribute("graticule", "");
    grat?.setAttribute("aria-pressed", "true");
  }
  if (opened["clouds"] === "off") clouds?.setAttribute("aria-pressed", "false");
  if (opened["lights"] === "off") lights?.setAttribute("aria-pressed", "false");
  if (opened["meteors"] === "on") meteors?.setAttribute("aria-pressed", "true");
  if (opened["body-label"] !== undefined) markLabel(opened["body-label"]);
  if (opened["meteors-strength"] !== undefined) markStrength(readMeteorStrength(opened["meteors-strength"]));
  if (opened["air-thickness"] === "1") airTrue?.setAttribute("aria-pressed", "true");
  if (opened["city-names"] !== undefined) cityNames?.setAttribute("aria-pressed", "true");
  if (opened["borders"] === "on") borders?.setAttribute("aria-pressed", "true");
  if (opened["grid"] === "on") document.querySelector("#grid")?.setAttribute("aria-pressed", "true");
  if (opened["country-names"] === "on") document.querySelector("#country-names")?.setAttribute("aria-pressed", "true");
  const opening = opened["time"] && Number.isFinite(Date.parse(opened["time"])) ? Date.parse(opened["time"]) : null;
  if (when) when.value = localValue(opening ?? Date.now());
  if (opening !== null) now?.setAttribute("aria-pressed", "false");
  const first = opened["look"] ?? (opened["ride"] ? "space" : undefined);
  if (opened["scale"] === "true") {
    for (const b of scaleButtons) b.classList.toggle("on", b.dataset["scale"] === "true");
  }
  markClock();
  if (opened["orbits"] === "off") orbits?.setAttribute("aria-pressed", "false");
  if (opened["labels"] === "off") names?.setAttribute("aria-pressed", "false");
  markGrab("line");
  if (first === "thick" || first === "realistic" || first === "space") void setLook(first);
  else linkPace = null;
  new ResizeObserver(() => markGrab(shownLook)).observe(stage);
}

const embedPanel = document.querySelector<EmbedPanelElement>("#embed-panel");
if (embedPanel) {
  const section = mountEmbedSection(embedPanel, { flatPreview: true, say: (key) => say(key), lang: () => (say("locale").startsWith("ja") ? "ja" : "en") });
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(section.update));
}

// The Wide toggle speaks the page's language: the family's chooser sets it, and the toggle's own `lang` follows (it reads the page's only when it starts).
const wideToggle = document.querySelector("kazoku-wide-toggle");
if (wideToggle) {
  const follow = (): void => wideToggle.setAttribute("lang", say("locale").startsWith("ja") ? "ja" : "en");
  follow();
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(follow));
}
