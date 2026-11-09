// <chikyu-passes>: the next passes of the ISS (and the other bright satellites) over a place, as a list and a sky dome for the one pressed. Importing registers it once.
// Nothing runs on a timer: it works the passes out when something it shows changes, and reads the clock once, when it first comes into a page (or never, when `from` is given).
import { adoptStyles } from "../adopt.ts";
import { fetchElements } from "../satellites/source.ts";
import type { ElementSet } from "../satellites/types.ts";
import { DEFAULT_DIM_AFTER_DAYS } from "../satellites/limits.ts";
import { findPasses, passPath, type PassPoint, type SatellitePass, type SkyName } from "./passes.ts";
import { skySvg, type SkyLabels } from "./sky.ts";

type Lang = "en" | "ja";

const WORDS: Record<Lang, Record<string, string>> = {
  en: {
    list: "Passes",
    waiting: "Waiting for orbit data.",
    unreadable: "The orbit data could not be read: {why}",
    none: "No visible pass in the next {days} days. Try All passes, or more days.",
    noneAll: "No pass in the next {days} days.",
    visible: "Visible",
    daylight: "Daytime",
    shadow: "In shadow",
    faint: "Too faint",
    reasonDaylight: "The sky is too bright to see it.",
    reasonShadow: "It is in the Earth's shadow, so the Sun is not lighting it.",
    reasonFaint: "It is lit and the sky is dark, but it is too faint to see.",
    start: "Starts",
    highest: "Highest",
    end: "Ends",
    seen: "Can be seen",
    seenFromTo: "{from} to {to}",
    brightness: "Brightness",
    sky: "Sky",
    light: "Satellite",
    lit: "In sunlight",
    partLit: "In sunlight for part of the pass",
    notLit: "In the Earth's shadow",
    elements: "Orbit data",
    elementsLine: "{name}: from {date}, {age} days before this pass",
    stale: "older than two weeks: the times are less sure",
    reboost: "Passes are only as good as the orbit data are new: a reboost of the station moves it.",
    zone: "Times are in {zone}; UTC is shown beside them.",
    zoneUtc: "Times are in UTC.",
    zoneAbout: "Times are about local time (UTC{offset}, from the longitude).",
    up: "{altitude}° up",
    day: "daylight",
    civil: "civil twilight",
    nautical: "nautical twilight",
    astronomical: "astronomical twilight",
    night: "night",
    sunBelow: "the Sun is {degrees}° below the horizon",
    sunAbove: "the Sun is {degrees}° above the horizon",
    mag1: "as bright as Venus, the brightest planet",
    mag2: "brighter than any star",
    mag3: "as bright as the brightest stars",
    mag4: "like a bright star",
    mag5: "faint: a dark sky helps",
    magUnknown: "not known for this satellite",
    magShown: "{value} ({words})",
    N: "N", NNE: "NNE", NE: "NE", ENE: "ENE", E: "E", ESE: "ESE", SE: "SE", SSE: "SSE", S: "S", SSW: "SSW", SW: "SW", WSW: "WSW", W: "W", WNW: "WNW", NW: "NW", NNW: "NNW",
    skyN: "N", skyE: "E", skyS: "S", skyW: "W", skyStart: "start", skyHighest: "highest", skyEnd: "end", skyZenith: "overhead",
    skyDescription: "{name} crosses the sky from the {from} to the {to}, highest {altitude} degrees up in the {where}.",
    wait: "Working out the passes.",
    count: "{count} passes",
    elementsOld: "Orbit data are {days} days old.",
  },
  ja: {
    list: "通過",
    waiting: "軌道データを待っています。",
    unreadable: "軌道データを読み取れませんでした: {why}",
    none: "これから{days}日間に見える通過はありません。「すべての通過」か、日数を増やしてみてください。",
    noneAll: "これから{days}日間に通過はありません。",
    visible: "見える",
    daylight: "昼間",
    shadow: "影の中",
    faint: "暗すぎる",
    reasonDaylight: "空が明るすぎて見えません。",
    reasonShadow: "地球の影に入っていて、太陽の光が当たっていないので見えません。",
    reasonFaint: "光は当たっていて空も暗いのですが、衛星が暗すぎて見えません。",
    start: "出る",
    highest: "いちばん高い",
    end: "入る",
    seen: "見える時間",
    seenFromTo: "{from} から {to} まで",
    brightness: "明るさ",
    sky: "空の暗さ",
    light: "衛星",
    lit: "太陽の光が当たっている",
    partLit: "通過の一部で光が当たっている",
    notLit: "地球の影の中",
    elements: "軌道データ",
    elementsLine: "{name}: {date} のデータ (この通過の {age} 日前)",
    stale: "2週間より古く、時刻の確かさが下がります",
    reboost: "通過の時刻は、軌道データが新しいほど正確です。ステーションが高度を上げると、位置が変わります。",
    zone: "時刻は {zone} です。UTC もそばに表示します。",
    zoneUtc: "時刻は UTC です。",
    zoneAbout: "時刻はおよそ現地時間です (経度から求めた UTC{offset})。",
    up: "高さ {altitude}°",
    day: "昼",
    civil: "市民薄明",
    nautical: "航海薄明",
    astronomical: "天文薄明",
    night: "夜",
    sunBelow: "太陽は地平線の {degrees}° 下です",
    sunAbove: "太陽は地平線の {degrees}° 上です",
    mag1: "いちばん明るい惑星の金星くらいか、それより明るい",
    mag2: "どの恒星よりも明るい",
    mag3: "いちばん明るい恒星くらい",
    mag4: "明るい星のよう",
    mag5: "暗め: 空が暗いほうが見つけやすい",
    magUnknown: "この衛星ではわかっていません",
    magShown: "{value} 等 ({words})",
    N: "北", NNE: "北北東", NE: "北東", ENE: "東北東", E: "東", ESE: "東南東", SE: "南東", SSE: "南南東", S: "南", SSW: "南南西", SW: "南西", WSW: "西南西", W: "西", WNW: "西北西", NW: "北西", NNW: "北北西",
    skyN: "北", skyE: "東", skyS: "南", skyW: "西", skyStart: "出", skyHighest: "最高", skyEnd: "入", skyZenith: "真上",
    skyDescription: "{name} は{from}から{to}へ空を横切ります。いちばん高くなるのは{where}の空で、高さは{altitude}度です。",
    wait: "通過を計算しています。",
    count: "{count} 回の通過",
    elementsOld: "軌道データは {days} 日前のものです。",
  },
};

/** The short names of the satellites this element knows, in each language; any other satellite is shown under the name in its elements. */
const SHORT: Record<number, Record<Lang, string>> = {
  25544: { en: "ISS", ja: "ISS" },
  48274: { en: "Tiangong", ja: "天宮" },
  20580: { en: "Hubble", ja: "ハッブル" },
};

const CSS = `
:host{display:block;color:inherit;font:inherit;container-type:inline-size}
*{box-sizing:border-box}
.note,.zone{margin:0 0 8px;font-size:.85em;opacity:.8}
.layout{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@container (min-width:760px){.layout{grid-template-columns:minmax(0,2fr) minmax(0,3fr)}}
.list{display:grid;gap:6px;align-content:start;max-height:30rem;overflow:auto;padding:2px;margin:0;list-style:none}
.row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;text-align:left;width:100%;min-height:48px;padding:8px 12px;border:1px solid color-mix(in srgb,currentColor 30%,transparent);border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.row[aria-pressed="true"]{background:color-mix(in srgb,currentColor 14%,transparent);border-color:currentColor}
.row:focus-visible{outline:3px solid #6cd0ff;outline-offset:2px}
.when{font-weight:600}
.badge{justify-self:end;font-size:.8em;padding:1px 8px;border-radius:999px;border:1px solid currentColor}
.badge[data-reason="visible"]{background:#ffb454;color:#10192b;border-color:#ffb454}
.track{grid-column:1/-1;font-size:.9em;opacity:.9;font-variant-numeric:tabular-nums}
.mag{font-variant-numeric:tabular-nums;opacity:.85}
.detail{display:grid;gap:12px;align-content:start;justify-items:center}
.pictures{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;width:100%}
.dome,.ground{width:min(100%,var(--chikyu-picture,270px))}
.dome svg{display:block;width:100%;height:auto}
.facts{margin:0;width:100%;display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:.92em}
.facts dt{opacity:.75}
.facts dd{margin:0;font-variant-numeric:tabular-nums}
.empty{margin:12px 0;opacity:.85}
.credit{margin:8px 0 0;font-size:.8em;opacity:.7}
`;

interface Formats {
  clock(ms: number): string;
  utc(ms: number): string;
  date(ms: number): string;
  zone: string;
}
const escape = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fill = (text: string, values: Record<string, string | number> = {}): string => text.replace(/\{(\w+)\}/g, (all, key: string) => String(values[key] ?? all));
/** A magnitude to a tenth, with no minus sign on a zero. */
const tenths = (value: number): string => value.toFixed(1).replace(/^-0\.0$/, "0.0");
const number = (value: string | null, fallback: number): number => (value === null || value.trim() === "" || !Number.isFinite(Number(value)) ? fallback : Number(value));

/**
 * The `<chikyu-passes>` custom element: the passes of satellites over a place as a list, with the sky dome and the facts of the one pressed. Importing this entry point registers the tag once; it needs `satellite.js` (an optional peer).
 * Give it the place with `latitude`, `longitude` and `height` (metres), the orbit data with the `elements` property (OMM `ElementSet`s) or `elements-src` (an address, read once when the element comes into the page, through `fetchElements`' politeness rules),
 * and choose what it lists with `days` (1 to 14, 5 by default), `show` (`visible`, the default, or `all`), `sky` (`civil`, `nautical`, `astronomical` or `night`: the lightest sky a pass may be seen in), `satellite` (a NORAD number, to list one of several sets),
 * `from` (the first moment, an ISO date; the time of the page's first use by default), `min-altitude`, and `lang` (`en` or `ja`; the page's language by default). The times are in the browser's time zone unless `time-zone` names one (`Asia/Tokyo`) or
 * `utc-offset` gives hours from UTC (`9`, `-3.5`); UTC is always shown beside them. `selected` (the ISO time of a pass's highest point) is the pass pressed. It sends `chikyu-pass-select` with the pass when one is pressed, and `chikyu-passes` each time the list is made.
 *
 * @example
 * ```ts no-run
 * import type { ChikyuPasses } from "@johnmorrisdotca/chikyu-earth/passes/element";
 *
 * const passes = document.createElement("chikyu-passes") as ChikyuPasses;
 * passes.setAttribute("latitude", "35.68");
 * passes.setAttribute("longitude", "139.69");
 * passes.setAttribute("elements-src", "https://example.org/elements/bright.json");
 * document.body.append(passes);
 * passes.addEventListener("chikyu-pass-select", (event) => console.log((event as CustomEvent).detail.pass.highest.compass));
 * ```
 */
export class ChikyuPasses extends HTMLElement {
  static observedAttributes = ["latitude", "longitude", "height", "days", "show", "sky", "satellite", "from", "min-altitude", "lang", "time-zone", "utc-offset", "selected", "elements-src", "credit"];

  #sets: ElementSet[] = [];
  #passes: SatellitePass[] = [];
  #chosen: SatellitePass | undefined;
  #problem = "";
  #waiting = true;
  #scheduled = false;
  #started: number | undefined;
  #loaded: string | undefined;
  #fetch = 0;
  #announced: number | undefined;

  /** The orbit data the passes are worked out from. Setting it works the passes out again. */
  get elements(): readonly ElementSet[] {
    return this.#sets;
  }
  set elements(sets: readonly ElementSet[]) {
    this.#sets = [...sets];
    this.#waiting = false;
    this.#problem = "";
    this.#schedule();
  }

  /** The passes listed now, earliest first. */
  get passes(): readonly SatellitePass[] {
    return this.#passes;
  }

  /** The pass pressed, or undefined. */
  get selectedPass(): SatellitePass | undefined {
    return this.#chosen;
  }

  /** The first moment the list covers, milliseconds since the Unix epoch. */
  get from(): number {
    const given = this.getAttribute("from");
    const asked = given ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(given) || !/T/.test(given) ? given : `${given}Z`) : Number.NaN;
    if (Number.isFinite(asked)) return asked;
    // the clock is read once, when the element first needs it
    this.#started ??= Date.now();
    return this.#started;
  }

  /** The language of the words: the `lang` attribute, else the page's. */
  get language(): Lang {
    const asked = (this.getAttribute("lang") ?? this.ownerDocument.documentElement.lang ?? "en").toLowerCase();
    return asked.startsWith("ja") ? "ja" : "en";
  }

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    adoptStyles(root, CSS, this.getAttribute("nonce") ?? "");
    this.#load();
    this.#schedule();
  }

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    if (name === "elements-src") this.#load();
    this.#schedule();
  }

  /** Press the pass at `index` in `passes` (or none). */
  select(index: number | undefined): void {
    const pass = index === undefined ? undefined : this.#passes[index];
    this.#chosen = pass;
    if (pass) this.setAttribute("selected", new Date(pass.highest.ms).toISOString().replace(/\.\d+Z$/, "Z"));
    else this.removeAttribute("selected");
  }

  #load(): void {
    const address = this.getAttribute("elements-src");
    if (!address || address === this.#loaded) return;
    this.#loaded = address;
    const turn = (this.#fetch += 1);
    this.#waiting = true;
    // one polite request when the element comes into the page: fetchElements keeps the answer and leaves a source that failed alone, and nothing here asks again
    void fetchElements(address).then(
      (got) => {
        if (turn !== this.#fetch) return;
        this.#sets = got.sets;
        this.#waiting = false;
        this.#problem = "";
        this.#schedule();
      },
      (error: unknown) => {
        if (turn !== this.#fetch) return;
        this.#waiting = false;
        this.#problem = error instanceof Error ? error.message : "no answer";
        this.#schedule();
      },
    );
  }

  #schedule(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (this.isConnected) this.#draw();
    });
  }

  #formats(): Formats {
    const lang = this.language;
    const zoneName = this.getAttribute("time-zone");
    const offset = this.getAttribute("utc-offset");
    const hour = { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" } as const;
    const utc = new Intl.DateTimeFormat(lang, { ...hour, timeZone: "UTC" });
    const sign = (hours: number): string => `${hours < 0 ? "-" : "+"}${Math.abs(hours)}`;
    if (offset !== null && offset.trim() !== "" && Number.isFinite(Number(offset))) {
      const hours = Number(offset);
      const shifted = (ms: number): number => ms + hours * 3_600_000;
      const clock = new Intl.DateTimeFormat(lang, { ...hour, timeZone: "UTC" });
      const date = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
      return { clock: (ms) => clock.format(shifted(ms)), utc: (ms) => utc.format(ms), date: (ms) => date.format(shifted(ms)), zone: fill(WORDS[lang]!["zoneAbout"]!, { offset: sign(hours) }) };
    }
    let zone: string | undefined = zoneName ?? undefined;
    let clock: Intl.DateTimeFormat;
    try {
      clock = new Intl.DateTimeFormat(lang, { ...hour, ...(zone ? { timeZone: zone } : {}) });
    } catch {
      zone = undefined;
      clock = new Intl.DateTimeFormat(lang, hour);
    }
    const date = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", ...(zone ? { timeZone: zone } : {}) });
    const label = zone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      clock: (ms) => clock.format(ms),
      utc: (ms) => utc.format(ms),
      date: (ms) => date.format(ms),
      zone: label === "UTC" ? WORDS[lang]!["zoneUtc"]! : fill(WORDS[lang]!["zone"]!, { zone: label, utc: "UTC" }),
    };
  }

  #draw(): void {
    const root = this.shadowRoot;
    if (!root) return;
    const lang = this.language;
    const say = (key: string, values?: Record<string, string | number>): string => fill(WORDS[lang]![key] ?? WORDS["en"]![key] ?? key, values);
    const days = Math.min(14, Math.max(1, Math.round(number(this.getAttribute("days"), 5))));
    const latitude = number(this.getAttribute("latitude"), Number.NaN);
    const longitude = number(this.getAttribute("longitude"), Number.NaN);
    const holder = root.querySelector<HTMLElement>(".root") ?? Object.assign(root.ownerDocument.createElement("div"), { className: "root" });
    if (!holder.isConnected) {
      holder.addEventListener("click", (event) => {
        const row = (event.target as Element | null)?.closest<HTMLElement>("[data-i]");
        if (row) this.select(Number(row.dataset["i"]));
      });
      root.append(holder);
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      holder.innerHTML = `<p class="empty" role="status">${escape(say("waiting"))}</p>`;
      return;
    }
    if (this.#problem) {
      holder.innerHTML = `<p class="empty" role="status">${escape(say("unreadable", { why: this.#problem }))}</p>`;
      return;
    }
    const chosenSet = this.getAttribute("satellite");
    const sets = chosenSet ? this.#sets.filter((one) => String(one.NORAD_CAT_ID) === chosenSet) : this.#sets;
    if (this.#waiting && sets.length === 0) {
      holder.innerHTML = `<p class="empty" role="status">${escape(say("waiting"))}</p>`;
      return;
    }
    const from = this.from;
    const all = this.getAttribute("show") === "all";
    const skyAsked = this.getAttribute("sky");
    const sky = skyAsked === "nautical" || skyAsked === "astronomical" || skyAsked === "night" ? skyAsked : "civil";
    const place = { latitude, longitude, heightM: number(this.getAttribute("height"), 0) };
    this.#passes = findPasses(sets, place, { from, to: from + days * 86_400_000 }, { all, sky, minAltitude: number(this.getAttribute("min-altitude"), 10) });
    const wanted = this.getAttribute("selected");
    const target = wanted ? Date.parse(wanted) : Number.NaN;
    // the pass asked for, else the first: the dome is never empty when there is a pass
    this.#chosen = (Number.isFinite(target) ? this.#passes.find((one) => Math.abs(one.highest.ms - target) < 90_000) : undefined) ?? this.#passes[0];

    const f = this.#formats();
    const name = (pass: SatellitePass): string => SHORT[pass.noradId]?.[lang] ?? pass.name;
    const badge = (pass: SatellitePass): string => `<span class="badge" data-reason="${pass.reason}">${escape(say(pass.reason))}</span>`;
    const many = new Set(this.#passes.map((one) => one.noradId)).size > 1;
    const rows = this.#passes
      .map((pass, i) => {
        const shown = pass.visible ?? pass;
        const mag = pass.magnitude !== undefined && Number.isFinite(pass.magnitude) ? ` <span class="mag">${tenths(pass.magnitude)}</span>` : "";
        return (
          `<li><button type="button" class="row" data-i="${i}" aria-pressed="${pass === this.#chosen}">` +
          `<span class="when">${escape(f.date(pass.highest.ms))}${many ? ` · ${escape(name(pass))}` : ""}</span>${badge(pass)}` +
          `<span class="track">${escape(f.clock(shown.start.ms).slice(0, 5))} ${escape(say(shown.start.compass))} → ${escape(f.clock(shown.highest.ms).slice(0, 5))} ${escape(say(shown.highest.compass))} ${Math.round(shown.highest.altitude)}° → ${escape(f.clock(shown.end.ms).slice(0, 5))} ${escape(say(shown.end.compass))}${mag}</span>` +
          `</button></li>`
        );
      })
      .join("");

    // the age of the orbit data for the first pass of each satellite
    const ages = new Map<number, SatellitePass>();
    for (const pass of this.#passes) if (!ages.has(pass.noradId)) ages.set(pass.noradId, pass);
    const oldest = Math.max(0, ...[...ages.values()].map((one) => one.elementAgeDays));
    const note = `<p class="note">${escape(f.zone)} ${escape(say("reboost"))}${oldest > DEFAULT_DIM_AFTER_DAYS ? ` ${escape(say("stale"))}${lang === "ja" ? "。" : "."}` : ""}</p>`;
    const credit = this.getAttribute("credit");
    const list = this.#passes.length === 0 ? `<p class="empty" role="status">${escape(say(all ? "noneAll" : "none", { days }))}</p>` : `<ul class="list" aria-label="${escape(say("list"))}">${rows}</ul>`;
    holder.innerHTML = `${note}<div class="layout"><div>${list}</div><div class="detail">${this.#chosen ? this.#detail(this.#chosen, f, say, lang) : ""}</div></div>${credit ? `<p class="credit">${escape(credit)}</p>` : ""}`;
    this.dispatchEvent(new CustomEvent("chikyu-passes", { detail: { passes: this.#passes, ageDays: oldest }, bubbles: true, composed: true }));
    // tell the page which pass is shown when that changed (the page draws its own pictures of it)
    const shown = this.#chosen?.highest.ms;
    if (shown !== this.#announced) {
      this.#announced = shown;
      this.dispatchEvent(new CustomEvent("chikyu-pass-select", { detail: { pass: this.#chosen, set: this.#chosen ? this.#sets.find((one) => one.NORAD_CAT_ID === this.#chosen!.noradId) : undefined }, bubbles: true, composed: true }));
    }
  }

  #detail(pass: SatellitePass, f: Formats, say: (key: string, values?: Record<string, string | number>) => string, lang: Lang): string {
    const set = this.#sets.find((one) => one.NORAD_CAT_ID === pass.noradId);
    const place = { latitude: number(this.getAttribute("latitude"), 0), longitude: number(this.getAttribute("longitude"), 0), heightM: number(this.getAttribute("height"), 0) };
    const short = SHORT[pass.noradId]?.[lang] ?? pass.name;
    const labels: SkyLabels = { north: say("skyN"), east: say("skyE"), south: say("skyS"), west: say("skyW"), start: say("skyStart"), highest: say("skyHighest"), end: say("skyEnd"), zenith: say("skyZenith") };
    const clock = (ms: number): string => f.clock(ms);
    const description = say("skyDescription", { name: short, from: say(pass.start.compass), to: say(pass.end.compass), altitude: Math.round(pass.highest.altitude), where: say(pass.highest.compass) });
    const dome = set ? skySvg(pass, passPath(set, place, pass), { size: 300, labels, times: { start: clock(pass.start.ms).slice(0, 5), highest: clock(pass.highest.ms).slice(0, 5), end: clock(pass.end.ms).slice(0, 5) }, description }) : "";
    const point = (p: PassPoint): string => `${escape(clock(p.ms))} (UTC ${escape(f.utc(p.ms))}) · ${escape(say(p.compass))} ${Math.round(p.azimuth)}° · ${escape(say("up", { altitude: Math.round(p.altitude) }))}`;
    const sun = pass.sunAltitude < 0 ? say("sunBelow", { degrees: Math.abs(pass.sunAltitude).toFixed(1) }) : say("sunAbove", { degrees: pass.sunAltitude.toFixed(1) });
    const sky: SkyName = pass.sky;
    let magnitudeText = say("magUnknown");
    if (pass.magnitude !== undefined && Number.isFinite(pass.magnitude)) {
      const m = pass.magnitude;
      magnitudeText = say("magShown", { value: tenths(m), words: say(m < -4 ? "mag1" : m < -1.5 ? "mag2" : m < 0.5 ? "mag3" : m < 2.5 ? "mag4" : "mag5") });
    }
    const lit = pass.sunlit ? (pass.visible ? say("lit") : say("partLit")) : say("notLit");
    const rows: [string, string][] = [
      [say("start"), point(pass.start)],
      [say("highest"), point(pass.highest)],
      [say("end"), point(pass.end)],
      [say("seen"), pass.visible ? escape(say("seenFromTo", { from: `${clock(pass.visible.start.ms)} ${say(pass.visible.start.compass)}`, to: `${clock(pass.visible.end.ms)} ${say(pass.visible.end.compass)}` })) : escape(say(pass.reason === "daylight" ? "reasonDaylight" : pass.reason === "shadow" ? "reasonShadow" : "reasonFaint"))],
      [say("brightness"), escape(magnitudeText)],
      [say("sky"), escape(`${say(sky)}${lang === "ja" ? "、" : ", "}${sun}`)],
      [say("light"), escape(lit)],
      [say("elements"), escape(say("elementsLine", { name: short, date: new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" }).format(pass.elementEpochMs), age: Math.abs(pass.elementAgeDays).toFixed(1) }) + (pass.stale ? `${lang === "ja" ? "、" : ", "}${say("stale")}` : ""))],
    ];
    return `<div class="pictures"><div class="dome">${dome}</div><div class="ground"><slot name="ground"></slot></div></div><dl class="facts">${rows.map(([key, value]) => `<dt>${escape(key)}</dt><dd>${value}</dd>`).join("")}</dl>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "chikyu-passes": ChikyuPasses;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-passes")) {
  customElements.define("chikyu-passes", ChikyuPasses);
}

