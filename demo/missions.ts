// The demo's Space Shuttle missions: pick an orbiter and a flight, and the craft (and the Hubble telescope on its visits) is replayed over the days of the flight from the element sets Space-Track kept at the time
// (missions/<id>.json, made once by scripts/missions.ts). The clock is the replay bar's: nothing draws unless it is playing or the reader moves the time.
import "@johnmorrisdotca/kazoku-ui/replay-bar/define";
import type { ReplayBarElement, ReplayDetail } from "@johnmorrisdotca/kazoku-ui/replay-bar/element";
import type { Mission, MissionFile, Orbiter } from "../src/satellites/index.ts";
import type { ElementSet, SatelliteRef } from "../src/satellites/index.ts";
import type { ChikyuSpace } from "../src/space/element.ts";

export interface MissionHost {
  space(): ChikyuSpace | null;
  say(key: string, values?: Record<string, string | number>): string;
  address: { get(key: string): string | null | undefined; set(key: string, value: string | null): void };
  /** Hold the page's own clock still (the replay moves the time itself). */
  holdClock(): void;
  /** The moment the replay has reached, for the page's date box (a few times a second, and when the reader moves it). */
  dated?(ms: number): void;
  notice(text: string | null): void;
  select(ref: SatelliteRef | null): void;
}

const ORBITERS: Orbiter[] = ["Discovery", "Atlantis", "Columbia", "Endeavour", "Challenger"];
const FRAME_MS = 33;
const HUBBLE = 20580;
const CRAFT = [
  { group: "mission-orbiter", color: "#ffd54f", size: 7, orbits: true },
  { group: "mission-hubble", color: "#7fd4ff", size: 6, orbits: true },
];

export function mountMissions(host: MissionHost): { enter(): void; leave(): void; relabel(): void } | null {
  const box = document.querySelector<HTMLElement>("#mission-controls");
  const orbitBox = document.querySelector<HTMLElement>("#mission-orbiters");
  const listBox = document.querySelector<HTMLElement>("#mission-list");
  const info = document.querySelector<HTMLElement>("#mission-info");
  const note = document.querySelector<HTMLElement>("#mission-note");
  const bar = document.querySelector<ReplayBarElement>("#mission-replay");
  const readout = document.querySelector<HTMLElement>("#mission-clock");
  if (!box || !orbitBox || !listBox || !info || !note || !bar || !readout) return null;

  const { say } = host;
  let api: typeof import("../src/satellites/index.ts") | null = null;
  let filter = "hubble";
  let flight: Mission | null = null;
  let sets: Record<number, ElementSet[]> = {};
  let shown: (number | null)[] = [];
  let clock = 0;
  let speed = 3600;
  let frame = 0;
  let lastFrame = 0;
  let clockShown = 0;
  let loading = 0;
  const orbiterButtons = new Map<string, HTMLButtonElement>();
  const flightButtons = new Map<string, HTMLButtonElement>();

  const locale = (): string => say("locale");
  const day = (ms: number): string => new Date(ms).toLocaleDateString(locale(), { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const stamp = (ms: number): string => `${day(ms)} ${new Date(ms).toISOString().slice(11, 16)} UTC`;
  const start = (): number => Date.parse(flight!.launch);
  const end = (): number => (flight!.landing ? Date.parse(flight!.landing) : start() + 3_600_000);

  const flightsFor = (): Mission[] => {
    const all = api!.missions();
    return filter === "hubble" ? all.filter((one) => one.hubble) : all.filter((one) => one.orbiter === filter);
  };

  function paintChips(): void {
    for (const [id, button] of orbiterButtons) button.setAttribute("aria-pressed", String(id === filter));
    listBox!.replaceChildren();
    flightButtons.clear();
    for (const one of flightsFor()) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset["mission"] = one.id;
      button.setAttribute("aria-pressed", String(flight?.id === one.id));
      button.textContent = `${one.name} · ${one.launch.slice(0, 4)}`;
      button.addEventListener("click", () => void choose(one.id));
      listBox!.append(button);
      flightButtons.set(one.id, button);
    }
  }

  function relabel(): void {
    if (!api) return;
    for (const [id, button] of orbiterButtons) button.textContent = id === "hubble" ? say("missionHubble") : say(`orbiter_${id}`);
    bar!.words = { group: say("missionReplay"), play: say("missionPlay"), pause: say("missionPause"), start: say("missionStart"), repeat: say("missionRepeat") };
    describe();
  }

  function describe(): void {
    if (!flight) {
      info!.hidden = true;
      note!.hidden = true;
      readout!.hidden = true;
      return;
    }
    readout!.hidden = false;
    const visit = flight.hubble ? ` ${say(`hubble_${flight.hubble}`)}.` : "";
    const lost = flight.landing === null ? ` ${say("missionLost")}` : "";
    const ja = locale().startsWith("ja");
    info!.hidden = false;
    info!.textContent = `${say("missionFact", { name: flight.name, orbiter: say(`orbiter_${flight.orbiter}`), launch: day(Date.parse(flight.launch)), landing: flight.landing ? day(Date.parse(flight.landing)) : "-", crew: flight.crew, payload: ja ? flight.payloadJa : flight.payload })}${visit}${lost}`;
    const orbiterSets = flight.noradId ? (sets[flight.noradId] ?? []) : [];
    note!.hidden = false;
    const hubble = flight.hubble ? (sets[HUBBLE]?.length ?? 0) : 0;
    note!.textContent = !orbiterSets.length && !hubble ? say("missionNoSets") : hubble ? say("missionNoteHubble", { n: orbiterSets.length, hubble }) : say("missionNote", { n: orbiterSets.length });
  }

  /** The craft at this moment: each one's nearest element set, switched when it changes, and taken away when none is near. */
  function place(ms: number): void {
    const space = host.space();
    if (!space || !api || !flight) return;
    const craft = [flight.noradId, flight.hubble ? HUBBLE : null];
    craft.forEach((number, index) => {
      const list = number ? sets[number] : undefined;
      let best = -1;
      if (list?.length && (number === HUBBLE || (ms >= start() && ms <= end()))) {
        let gap = Infinity;
        list.forEach((set, at) => {
          const away = Math.abs(Date.parse(`${set.EPOCH}Z`) - ms);
          if (away < gap) {
            gap = away;
            best = at;
          }
        });
        if (gap > 2 * 86_400_000) best = -1;
      }
      if (best === shown[index]) return;
      shown[index] = best < 0 ? null : best;
      const spec = CRAFT[index]!;
      if (best < 0) space.setSatellites(spec.group, null);
      else {
        space.setSatellites(spec.group, api!.createSatellites([list![best]!], { maxAgeDays: 2 }), { color: spec.color, size: spec.size, orbits: spec.orbits });
        if (index === 0) host.select({ group: spec.group, index: 0 });
      }
    });
  }

  function setClock(ms: number, force = false): void {
    clock = Math.min(end(), Math.max(start(), ms));
    const space = host.space();
    if (space) space.time = clock;
    place(clock);
    const now = performance.now();
    if (force || now - clockShown > 250) {
      clockShown = now;
      host.dated?.(clock);
      const minutes = Math.round((clock - start()) / 60_000);
      readout!.textContent = say("missionClock", { elapsed: `${Math.floor(minutes / 1440)}:${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`, at: stamp(clock) });
    }
    if (force) host.address.set("time", new Date(clock).toISOString().slice(0, 16) + "Z");
  }

  async function choose(id: string): Promise<void> {
    if (!api) return;
    const picked = api.missionOf(id);
    if (!picked) return;
    const mine = ++loading;
    flight = picked;
    for (const [key, button] of flightButtons) button.setAttribute("aria-pressed", String(key === picked.id));
    host.address.set("mission", picked.id);
    sets = {};
    shown = [];
    stop();
    try {
      const answer = await fetch(`missions/${picked.id}.json`);
      if (answer.ok) sets = api.missionElements((await answer.json()) as MissionFile);
      else if (picked.noradId) host.notice(say("missionLoadFail"));
    } catch {
      host.notice(say("missionLoadFail"));
    }
    if (mine !== loading) return;
    host.holdClock();
    for (const spec of CRAFT) host.space()?.setSatellites(spec.group, null);
    describe();
    const asked = Date.parse(host.address.get("time") ?? "");
    setClock(Number.isFinite(asked) && asked >= start() && asked <= end() ? asked : start() + 1, true);
    bar!.playing = false;
  }

  function stop(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (bar!.playing) bar!.playing = false;
  }

  function tick(now: number): void {
    frame = 0;
    if (!bar!.playing || !flight || document.hidden || !host.space()) return;
    if (now - lastFrame >= FRAME_MS) {
      const step = Math.min(250, now - lastFrame) * speed;
      lastFrame = now;
      let next = clock + step;
      if (next >= end()) {
        if (bar!.repeat) next = start();
        else {
          setClock(end(), true);
          bar!.playing = false;
          return;
        }
      }
      setClock(next);
    }
    frame = requestAnimationFrame(tick);
  }

  bar.addEventListener("kazoku-replay", (event) => {
    const detail = (event as CustomEvent<ReplayDetail>).detail;
    if (!flight) return;
    if (detail.action === "start") {
      setClock(start() + 1, true);
      return;
    }
    if (detail.playing && detail.action !== "repeat") {
      if (clock >= end()) setClock(start() + 1);
      host.holdClock();
      lastFrame = performance.now();
      if (!frame) frame = requestAnimationFrame(tick);
    } else if (!detail.playing) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setClock(clock, true);
    }
  });
  bar.addEventListener("kazoku-speedchange", (event) => {
    const value = (event as CustomEvent<{ value: number }>).detail.value;
    if (Number.isFinite(value) && value > 0) speed = value;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!document.hidden && bar.playing && !frame) {
      lastFrame = performance.now();
      frame = requestAnimationFrame(tick);
    }
  });

  async function enter(): Promise<void> {
    box!.hidden = false;
    if (!api) {
      api = await import("../src/satellites/index.ts");
      for (const id of ["hubble", ...ORBITERS]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset["orbiter"] = id;
        button.addEventListener("click", () => {
          filter = id;
          paintChips();
          for (const [key, one] of orbiterButtons) one.setAttribute("aria-pressed", String(key === id));
        });
        orbitBox!.append(button);
        orbiterButtons.set(id, button);
      }
      const asked = api.missionOf(host.address.get("mission") ?? "");
      if (asked) filter = asked.hubble ? "hubble" : asked.orbiter;
      paintChips();
      relabel();
      if (asked) void choose(asked.id);
    }
  }

  return {
    enter: () => void enter(),
    leave: () => {
      stop();
      box.hidden = true;
      info.hidden = true;
      note.hidden = true;
      readout.hidden = true;
      for (const spec of CRAFT) host.space()?.setSatellites(spec.group, null);
      flight = null;
      shown = [];
      for (const button of flightButtons.values()) button.setAttribute("aria-pressed", "false");
    },
    relabel,
  };
}
