// The showers' parent bodies by IAU code and designation, and where each row's figures come from. Pure: no DOM, no dependency.
import { METEOR_LINKS, type ParentBody, type ShowerLink } from "../data/meteor-iau.ts";
import { METEOR_SHOWERS, type MeteorShower } from "../data/meteor-showers.ts";

/**
 * The parent body of a shower, found by the shower's IAU code, as the IAU Meteor Data Center's origin column names it.
 *
 * @param code - The IAU's three-letter code (`PER`).
 * @returns The comet or asteroid, or `null` when the shower has none named (or the code is not in the table).
 *
 * @example
 * ```ts
 * import { parentBodyOf } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(parentBodyOf("PER")?.designation, parentBodyOf("GEM")?.kind, parentBodyOf("COM"));
 * ```
 */
export function parentBodyOf(code: string): ParentBody | null {
  return METEOR_LINKS.find((link) => link.code === code)?.parent ?? null;
}

/**
 * The showers that come from one parent body, found by its designation (the whole designation, or just its number or name: `2P` and `Encke` both find `2P/Encke`).
 *
 * @param designation - A designation: `1P/Halley`, `1P`, `Halley`, `(3200) Phaethon`.
 * @returns The showers, in the table's order (empty when none comes from it).
 *
 * @example
 * ```ts
 * import { showersOfParent } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(showersOfParent("1P/Halley").map((shower) => shower.code), showersOfParent("2P").map((shower) => shower.name));
 * ```
 */
export function showersOfParent(designation: string): MeteorShower[] {
  const wanted = designation.trim().toLowerCase();
  if (wanted === "") return [];
  const matches = (full: string): boolean => {
    const whole = full.toLowerCase();
    return whole === wanted || whole.split("/")[0] === wanted || whole.split("/")[1]?.split(" ")[0] === wanted || whole.replace(/^\(\d+\) /, "") === wanted || whole.endsWith(` ${wanted}`);
  };
  const codes = new Set(METEOR_LINKS.filter((link) => link.parent && matches(link.parent.designation)).map((link) => link.code));
  return METEOR_SHOWERS.filter((shower) => codes.has(shower.code));
}

/**
 * Where a row's figures come from, in a sentence: the International Meteor Organization's table for the dates, the radiant, the speed and the rate, the IAU Meteor Data Center for the name, the parent body and the check, and
 * which of the radiant and speed were replaced by the IAU's.
 *
 * @param link - A shower's link (`METEOR_LINKS`).
 * @returns The sentence, in English.
 *
 * @example
 * ```ts
 * import { METEOR_LINKS, showerSource } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(showerSource(METEOR_LINKS.find((link) => link.code === "LYR")!));
 * ```
 */
export function showerSource(link: ShowerLink): string {
  const parts = ["dates and rate: IMO 2026 Meteor Shower Calendar, Table 5 (the IAU MDC lists no maximum date and no rate)"];
  const replaced = (["radiant", "speed"] as const).filter((field) => link.from[field] === "mdc");
  if (link.checked) parts.push(`${replaced.length ? `${replaced.join(" and ")} from` : "radiant and speed agree with"} IAU MDC solution ${link.checked.adNo} of ${link.iauName} (IAU ${link.iau}, ${link.checked.meteors} meteors)${replaced.length ? "; the IMO table's was further off" : ""}`);
  else parts.push(`radiant and speed: IMO table, kept (${link.status === "working" ? "on the IAU MDC's working list only" : "no IAU MDC solution of 100 meteors or more near the maximum"})`);
  parts.push(link.parent ? `parent body: ${link.parent.kind} ${link.parent.designation}, IAU MDC origin column` : "parent body: none named by the IAU MDC");
  return parts.join("; ");
}
