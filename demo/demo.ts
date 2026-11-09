import "@johnmorrisdotca/kazoku-ui/view-controls/define";
import "@johnmorrisdotca/kazoku-ui/speed-buttons/define";
import "@johnmorrisdotca/kazoku-ui/wide-layout/define";
import type { SpeedButtonsElement } from "@johnmorrisdotca/kazoku-ui/speed-buttons/element";
import { createAddressState } from "@johnmorrisdotca/kazoku-ui/address-state";
import type { ViewChangeDetail } from "@johnmorrisdotca/kazoku-ui/view-controls/element";
import "../src/element.ts";
import type { EmbedPanelElement } from "@johnmorrisdotca/kazoku-ui/embed-panel/element";
import { mountEmbedSection } from "./embed-section.ts";
import { attachMarkers, type MarkerEventDetail, type Markers } from "../src/markers/index.ts";
import { crowd, PLACES } from "./places.ts";
import type { ChikyuEarth } from "../src/element.ts";
import type { ChikyuEarthRealistic } from "../src/realistic/element.ts";
import { WORDS } from "./words.js";
import type { BodyInfo, BodyName, ChikyuSpace, SpacePreset } from "../src/space/element.ts";
import type { SatelliteInfo, SatelliteRef, Satellites } from "../src/satellites/index.ts";
import { fetchGroup, GROUP_STYLE, setsOfGroup, type GroupFile } from "./groups.ts";
import { catalogueEntry, findInCatalogue, SATELLITE_GROUPS, type SatelliteGroupInfo } from "../src/satellites/catalogue.ts";
import type { RideTarget } from "../src/space/element.ts";
import type { BodyPainter } from "../src/space/index.ts";
import { discRadius } from "../src/realistic/earth.ts";
import { DEFAULT_DIM_AFTER_DAYS } from "../src/satellites/limits.ts";
import { mountMissions } from "./missions.ts";

type Look = "line" | "thick" | "realistic" | "space";

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
  const lightControls = document.querySelector<HTMLElement>("#light-controls");
  const timeControls = document.querySelector<HTMLElement>("#time-controls");
  const speedControls = document.querySelector<HTMLElement>("#speed-controls");
  const spaceControls = document.querySelector<HTMLElement>("#space-controls");
  const scaleNote = document.querySelector<HTMLElement>("#scale-note");
  const satControls = document.querySelector<HTMLElement>("#sat-controls");
  const satInfo = document.querySelector<HTMLElement>("#sat-info");
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

  function leave3d(): void {
    if (!real && !space) return;
    real?.remove();
    space?.remove();
    missionRow?.leave();
    real = null;
    space = null;
    barFor(flat!);
    Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "look");
    mountMarkers(flat!);
    flat!.hidden = false;
    for (const box of [realControls, lightControls, timeControls, speedControls, spaceControls, scaleNote, bodyInfo, satControls, satInfo, satNote, rideControls, rideInfo]) if (box) box.hidden = true;
    if (placesBox) placesBox.hidden = false;
    if (pickedNote) pickedNote.hidden = false;
  }

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
    space?.selectSatellite(ref);
    chosen = ref;
    const info = ref && space ? space.satelliteInfo(ref) : undefined;
    if (satInfo) {
      satInfo.hidden = !info;
      satInfo.textContent = info ? describeSatellite(info) : "";
    }
    address.set("sat", info ? String(info.noradId) : null);
  };
  const ago = (ms: number): string => {
    const hours = Math.max(1, Math.round((Date.now() - ms) / 3_600_000));
    const format = new Intl.RelativeTimeFormat(say("locale"), { numeric: "auto" });
    return hours < 48 ? format.format(-hours, "hour") : format.format(-Math.round(hours / 24), "day");
  };
  const noteSatellites = (): void => {
    if (!satNote) return;
    const shown = [...shownGroups].filter((id) => made.has(id) && filesOf.has(id));
    satNote.hidden = shown.length === 0;
    if (!shown.length || !space) return;
    const oldest = Math.min(...shown.map((id) => Date.parse(filesOf.get(id)!.retrieved)));
    const dim = shown.reduce((sum, id) => sum + made.get(id)!.sets.filter((set) => Math.abs(space!.time - Date.parse(`${set.EPOCH}Z`)) > DEFAULT_DIM_AFTER_DAYS * 86_400_000).length, 0);
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
    if (!space) return;
    const button = satButtons.find((b) => b.dataset["satGroup"] === name);
    button?.setAttribute("aria-pressed", String(on));
    if (on) shownGroups.add(name);
    else shownGroups.delete(name);
    address.set("sats", shownGroups.size ? [...shownGroups].join(",") : null);
    if (!on) {
      space.showSatellites(name, false);
      noteSatellites();
      noteGroup();
      return;
    }
    lastGroup = name;
    try {
      const group = await groupOf(name);
      const retrieved = Date.parse(filesOf.get(name)!.retrieved);
      if (Math.abs(space.time - retrieved) > DEFAULT_DIM_AFTER_DAYS * 86_400_000 && address.get("time") === null) {
        space.time = retrieved;
        if (when) when.value = localValue(retrieved);
        now?.setAttribute("aria-pressed", "false");
        notice(say("satOld", { days: Math.round(Math.abs(Date.now() - retrieved) / 86_400_000), date: filesOf.get(name)!.retrieved.slice(0, 10) }));
      }
      if (!space.satelliteGroups.some((one) => one.name === name)) space.setSatellites(name, group, GROUP_STYLE[name]!);
      else space.showSatellites(name, true);
      noteSatellites();
      noteGroup();
      if (fit && !space.riding) {
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
    if (!space) return false;
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
    if (!space || !sourceBox) return;
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
      if (space.satelliteGroups.some((one) => one.name === "yours")) space.setSatellites("yours", null);
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
  let rideView: "from" | "follow" = address.get("rview") === "follow" ? "follow" : "from";
  let rideLook: "down" | "horizon" = address.get("rlook") === "horizon" ? "horizon" : "down";
  const rideButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-ride]")];
  const viewButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-ride-view]")];
  const lookButtonsRide = [...document.querySelectorAll<HTMLButtonElement>("[data-ride-look]")];
  const markRide = (): void => {
    for (const b of rideButtons) b.classList.toggle("on", b.dataset["ride"] === (rideKey?.startsWith("group:") ? "group" : (rideKey ?? "none")));
    for (const b of viewButtons) b.classList.toggle("on", b.dataset["rideView"] === rideView);
    for (const b of lookButtonsRide) b.classList.toggle("on", b.dataset["rideLook"] === rideLook);
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
    for (const key of ["ride", "rview", "rlook"]) address.set(key, null);
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
    rideKey = key;
    markRide();
    if (key === "chosen") {
      space.selectSatellite(null);
      if (satInfo) satInfo.hidden = true;
    } else if (typeof target !== "string") showSatellite(null);
    space.ride(target, { view: rideView, look: rideLook });
    setRideZoom(keepTurn);
    speakRide();
    address.set("ride", key);
    address.set("rview", rideView === "follow" ? "follow" : null);
    address.set("rlook", rideLook === "horizon" ? "horizon" : null);
  }
  for (const button of rideButtons) button.addEventListener("click", () => void startRide(button.dataset["ride"] === "group" ? `group:${lastGroup ?? ""}` : (button.dataset["ride"] ?? "none")));
  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      rideView = button.dataset["rideView"] === "follow" ? "follow" : "from";
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
    const [{ setThreeLoader, setBodyPainter }] = await Promise.all([import("../src/space/element.ts")]);
    setThreeLoader(() => import("./three-subset.ts"));
    // the Sun, the planets, Pluto and their moons are wakusei-planets' (an optional peer): the real ones, or plain spheres where it is not there
    if (!planetsTried) {
      planetsTried = true;
      try {
        const { createPainter } = await import("@johnmorrisdotca/wakusei-planets/painter");
        setBodyPainter(createPainter({ textureBase: "planets/" }) as unknown as BodyPainter);
        planetsHere = true;
      } catch {
        planetsHere = false;
      }
    }
    if (!space) {
      leave3d();
      const element = document.createElement("chikyu-space") as ChikyuSpace;
      const centre = flat!.centre;
      element.setAttribute("center", `${centre.lon},${centre.lat}`);
      element.setAttribute("texture-base", "textures/");
      element.setAttribute("bodies", bodiesLook);
      if (lightMode !== "sun") element.setAttribute("light", lightMode);
      const scale = address.get("scale");
      const speed = address.get("speed");
      const startTime = address.get("time");
      if (scale === "true") element.setAttribute("scale", "true");
      if (speed !== null && Number.isFinite(Number(speed))) element.setAttribute("speed", speed);
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
      element.addEventListener("chikyu-time", (e) => {
        const ms = (e as CustomEvent<{ time: number }>).detail.time;
        if (when && document.activeElement !== when) when.value = localValue(ms);
      });
      markers?.detach();
      markers = null;
      listening?.abort();
      flat!.hidden = true;
      stage!.append(element);
      barFor(element);
      space = element;
      speakSpace();
      Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "look");
      element.setView(state());
    }
    if (realControls) realControls.hidden = true;
    if (lightControls) lightControls.hidden = false;
    for (const box of [timeControls, speedControls, spaceControls, satControls, rideControls]) if (box) box.hidden = false;
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
      const when = address.get("time");
      if (clouds === "off") element.setAttribute("clouds", "off");
      if (lights === "off") element.setAttribute("lights", "off");
      if (lightMode !== "sun") element.setAttribute("light", lightMode);
      if (when && Number.isFinite(Date.parse(when))) element.setAttribute("time", when);
      element.addEventListener("chikyu-unavailable", () => {
        notice(say("noWebgl"));
        if (realisticButton) realisticButton.disabled = true;
        void setLook("line");
      });
      flat!.hidden = true;
      stage!.append(element);
      barFor(element);
      real = element;
      element.setView(state(), true);
      mountMarkers(element);
    }
    if (realControls) realControls.hidden = false;
    if (lightControls) lightControls.hidden = false;
    if (timeControls) timeControls.hidden = false;
    for (const box of [speedControls, spaceControls, scaleNote]) if (box) box.hidden = true;
    return true;
  }

  /** Exact grab where the globe's radius is known (the flat globe fills its square; the Earth from space has its glow outside the disc); the space view keeps the fixed angle. */
  let shownLook: Look = "line";
  function markGrab(look: Look): void {
    shownLook = look;
    if (look === "space") controls!.removeAttribute("grab-radius");
    else if (look === "realistic") controls!.setAttribute("grab-radius", String(discRadius(stage!.clientWidth, stage!.clientWidth, 1)));
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
    markGrab(next);
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

  // The time speed is the family's speed buttons, in multiples of real time; the demo keeps the choice in its own address.
  const timeSpeed = document.querySelector<SpeedButtonsElement>("#time-speed");
  const markSpeed = (value: number): void => {
    if (timeSpeed && timeSpeed.value !== value) timeSpeed.value = value;
    address.set("speed", value === 1 ? null : String(value));
  };
  missionRow = mountMissions({
    space: () => space,
    say,
    address,
    holdClock: () => {
      if (space) space.speed = 0;
      now?.setAttribute("aria-pressed", "false");
      markSpeed(0);
    },
    notice,
    select: showSatellite,
  });
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(() => missionRow?.relabel()));
  const nameTimeSpeed = (): void => timeSpeed?.setAttribute("label", say("timeSpeed"));
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(nameTimeSpeed));
  nameTimeSpeed();
  timeSpeed?.addEventListener("kazoku-speedchange", (event) => {
    const { value, reason } = (event as CustomEvent<{ value: number; reason: string }>).detail;
    if (reason !== "user") return;
    if (space) {
      space.speed = value;
      if (value !== 1) now?.setAttribute("aria-pressed", "false");
    }
    markSpeed(value);
  });
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

  const localValue = (ms: number): string => {
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
  };
  when?.addEventListener("change", () => {
    const ms = new Date(when.value).getTime();
    if (!Number.isFinite(ms)) return;
    now?.setAttribute("aria-pressed", "false");
    if (real) real.time = ms;
    if (space) space.time = ms;
    address.set("time", new Date(ms).toISOString().slice(0, 16) + "Z");
  });
  now?.addEventListener("click", () => {
    now.setAttribute("aria-pressed", "true");
    if (when) when.value = localValue(Date.now());
    if (real) real.time = "now";
    if (space) {
      space.time = "now";
      space.speed = 1;
      markSpeed(1);
    }
    address.set("time", null);
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
  const opening = opened["time"] && Number.isFinite(Date.parse(opened["time"])) ? Date.parse(opened["time"]) : null;
  if (when) when.value = localValue(opening ?? Date.now());
  if (opening !== null) now?.setAttribute("aria-pressed", "false");
  const first = opened["look"] ?? (opened["ride"] ? "space" : undefined);
  if (opened["scale"] === "true") {
    for (const b of scaleButtons) b.classList.toggle("on", b.dataset["scale"] === "true");
  }
  if (opened["speed"] !== undefined && Number.isFinite(Number(opened["speed"]))) markSpeed(Number(opened["speed"]));
  if (opened["orbits"] === "off") orbits?.setAttribute("aria-pressed", "false");
  if (opened["labels"] === "off") names?.setAttribute("aria-pressed", "false");
  markGrab("line");
  if (first === "thick" || first === "realistic" || first === "space") void setLook(first);
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
