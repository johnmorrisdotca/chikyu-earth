// How each shower of the table stands against the IAU Meteor Data Center's lists (http://www.ta3.sk/IAUC22DB/MDC2022/, the list of all showers and the list of established showers, last update 2026-11-10 20:00 UTC, read
// 2026-11-11): its IAU name, whether the MDC lists it as established or only on its working list, its parent body as the MDC's origin column names it, and which MDC solution its radiant and speed were checked against.
// The MDC has one row for each solution of a shower, from every paper that gave one; it lists no maximum date and no zenithal hourly rate, so those two stay the International Meteor Organization's (see meteor-showers.ts).
// The rule used: a solution counts when it has a radiant, a speed and a mean solar longitude, is of 100 meteors or more, and its longitude is within 3 degrees of the shower's maximum. The table's radiant (moved by the
// solution's own daily motion to the longitude of the maximum) and speed stand when they are within 2 degrees and 2 km/s of such a solution (`checked` is the biggest that agrees); when none agrees the figures were
// replaced by the biggest solution's, rounded to a whole degree and km/s (`from` says "mdc" for each). Showers with no such solution (`checked: null`) keep the IMO's figures. No imports: this file is data only.

/**
 * The comet or asteroid a shower's meteors come from, as the IAU Meteor Data Center names it.
 *
 * @example
 * ```ts
 * import { METEOR_LINKS } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const parent = METEOR_LINKS.find((link) => link.code === "PER")?.parent;
 * console.log(parent?.designation, parent?.kind);
 * ```
 */
export interface ParentBody {
  /** The designation as the MDC writes it: `109P/Swift-Tuttle`, `C/1861 G1 (Thatcher)`, `(3200) Phaethon`, `2003 EH1`. */
  designation: string;
  kind: "comet" | "asteroid";
}

/**
 * One shower's link to the IAU Meteor Data Center's lists, with where each figure of its row comes from.
 *
 * @example
 * ```ts
 * import { METEOR_LINKS, type ShowerLink } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const geminids: ShowerLink | undefined = METEOR_LINKS.find((link) => link.code === "GEM");
 * console.log(geminids?.iauName, geminids?.status, geminids?.parent?.designation, geminids?.checked?.meteors);
 * ```
 */
export interface ShowerLink {
  /** The IAU's three-letter code, the same as the shower's `code`. */
  code: string;
  /** The IAU's number (IAUNo), the same as the shower's `iau`. */
  iau: number;
  /** The MDC's name for the shower, as it writes it (Greek letters spelled out). */
  iauName: string;
  /** `established` when the MDC's list of established showers has it; `working` when it is only on the working list. */
  status: "established" | "working";
  /** The parent body the MDC's origin column names for it, or `null` when the MDC names none (or names two that disagree). */
  parent: ParentBody | null;
  /** The MDC solution (its AdNo) the radiant and speed agree with, the biggest that does, and how many meteors it rests on; `null` when no solution of 100 meteors or more lies within 3 degrees of the maximum, or when none agrees. */
  checked: { adNo: number; meteors: number } | null;
  /** Where the row's radiant and speed come from: `imo` is the International Meteor Organization's table, kept because it agrees; `mdc` is the MDC's solution, because the table's did not. */
  from: { radiant: "imo" | "mdc"; speed: "imo" | "mdc" };
}

/**
 * Where the IAU Meteor Data Center's lists are, when they were read, and how it asks to be cited.
 *
 * @example
 * ```ts
 * import { IAU_MDC } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(IAU_MDC.name, IAU_MDC.read, IAU_MDC.cite.length);
 * ```
 */
export const IAU_MDC = {
  name: "IAU Meteor Data Center",
  url: "http://www.ta3.sk/IAUC22DB/MDC2022/",
  files: ["http://www.ta3.sk/IAUC22DB/MDC2022/Etc/streamfulldata2026.txt", "http://www.ta3.sk/IAUC22DB/MDC2022/Etc/streamestablisheddata2026.txt"],
  read: "2026-11-11",
  updated: "2026-11-10T20:00Z",
  /** What the MDC's data files ask to be cited. The MDC states no licence or reuse terms. */
  cite: [
    "Jenniskens, P., Jopek, T.J., Janches, D., Hajdukova, M., Kokhirova, G.I., Rudawska, R. (2020). Planetary and Space Science 182, 104821.",
    "Jopek, T.J., Kanuchova, Z. (2017). Planetary and Space Science 143, 3-6.",
  ],
} as const;

/**
 * Every shower of the table with its link to the IAU Meteor Data Center, in the table's order.
 *
 * @example
 * ```ts
 * import { METEOR_LINKS } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * console.log(METEOR_LINKS.length, METEOR_LINKS.filter((link) => link.status === "established").length);
 * ```
 */
export const METEOR_LINKS: readonly ShowerLink[] = [
  { code: "QUA", iau: 10, iauName: "Quadrantids", status: "established", parent: { designation: "2003 EH1", kind: "asteroid" }, checked: { adNo: 8, meteors: 13594 }, from: { radiant: "imo", speed: "imo" } },
  { code: "GUM", iau: 404, iauName: "gamma-Ursae Minorids", status: "established", parent: null, checked: { adNo: 0, meteors: 694 }, from: { radiant: "imo", speed: "imo" } },
  { code: "ACE", iau: 102, iauName: "alpha-Centaurids", status: "working", parent: null, checked: null, from: { radiant: "imo", speed: "imo" } },
  { code: "LYR", iau: 6, iauName: "April Lyrids", status: "established", parent: { designation: "C/1861 G1 (Thatcher)", kind: "comet" }, checked: { adNo: 10, meteors: 9980 }, from: { radiant: "imo", speed: "mdc" } },
  { code: "PPU", iau: 137, iauName: "pi-Puppids", status: "established", parent: { designation: "26P/Grigg-Skjellerup", kind: "comet" }, checked: null, from: { radiant: "imo", speed: "imo" } },
  { code: "ETA", iau: 31, iauName: "eta-Aquariids", status: "established", parent: { designation: "1P/Halley", kind: "comet" }, checked: { adNo: 11, meteors: 46032 }, from: { radiant: "imo", speed: "imo" } },
  { code: "ELY", iau: 145, iauName: "eta-Lyrids", status: "established", parent: { designation: "C/1983 H1 (IRAS-Araki-Alcock)", kind: "comet" }, checked: { adNo: 7, meteors: 990 }, from: { radiant: "imo", speed: "imo" } },
  { code: "ARI", iau: 171, iauName: "Daytime Arietids", status: "established", parent: { designation: "P/1999 J6 (SOHO)", kind: "comet" }, checked: { adNo: 2, meteors: 2142 }, from: { radiant: "imo", speed: "imo" } },
  { code: "JBO", iau: 170, iauName: "June Bootids", status: "established", parent: { designation: "7P/Pons-Winnecke", kind: "comet" }, checked: null, from: { radiant: "imo", speed: "imo" } },
  { code: "JPE", iau: 175, iauName: "July Pegasids", status: "established", parent: { designation: "C/1979 Y1 (Bradfield)", kind: "comet" }, checked: { adNo: 6, meteors: 104 }, from: { radiant: "imo", speed: "imo" } },
  { code: "GDR", iau: 184, iauName: "July gamma-Draconids", status: "established", parent: { designation: "C/1919 Q2 (Metcalf)", kind: "comet" }, checked: { adNo: 8, meteors: 1147 }, from: { radiant: "imo", speed: "imo" } },
  { code: "SDA", iau: 5, iauName: "Southern delta-Aquariids", status: "established", parent: null, checked: { adNo: 11, meteors: 74507 }, from: { radiant: "imo", speed: "imo" } },
  { code: "CAP", iau: 1, iauName: "alpha-Capricornids", status: "established", parent: { designation: "169P/NEAT", kind: "comet" }, checked: { adNo: 13, meteors: 13532 }, from: { radiant: "imo", speed: "imo" } },
  { code: "ERI", iau: 191, iauName: "eta-Eridanids", status: "established", parent: { designation: "C/1852 K1 (Chacornac)", kind: "comet" }, checked: { adNo: 5, meteors: 4272 }, from: { radiant: "mdc", speed: "imo" } },
  { code: "PER", iau: 7, iauName: "Perseids", status: "established", parent: { designation: "109P/Swift-Tuttle", kind: "comet" }, checked: { adNo: 9, meteors: 141256 }, from: { radiant: "imo", speed: "imo" } },
  { code: "KCG", iau: 12, iauName: "kappa-Cygnids", status: "established", parent: { designation: "2021 HK12", kind: "asteroid" }, checked: null, from: { radiant: "imo", speed: "imo" } },
  { code: "AUR", iau: 206, iauName: "Aurigids", status: "established", parent: { designation: "C/1911 N1 (Kiess)", kind: "comet" }, checked: { adNo: 3, meteors: 1700 }, from: { radiant: "imo", speed: "imo" } },
  { code: "SPE", iau: 208, iauName: "September epsilon-Perseids", status: "established", parent: null, checked: { adNo: 6, meteors: 218 }, from: { radiant: "imo", speed: "imo" } },
  { code: "SLY", iau: 81, iauName: "September Lyncids", status: "working", parent: null, checked: { adNo: 0, meteors: 467 }, from: { radiant: "imo", speed: "imo" } },
  { code: "DSX", iau: 221, iauName: "Daytime Sextantids", status: "established", parent: { designation: "(155140) 2005 UD", kind: "asteroid" }, checked: { adNo: 3, meteors: 1292 }, from: { radiant: "imo", speed: "imo" } },
  { code: "OCT", iau: 281, iauName: "October Camelopardalids", status: "established", parent: null, checked: { adNo: 7, meteors: 333 }, from: { radiant: "imo", speed: "imo" } },
  { code: "DRA", iau: 9, iauName: "October Draconids", status: "established", parent: { designation: "21P/Giacobini-Zinner", kind: "comet" }, checked: { adNo: 7, meteors: 1058 }, from: { radiant: "imo", speed: "imo" } },
  { code: "EGE", iau: 23, iauName: "epsilon-Geminids", status: "established", parent: null, checked: { adNo: 5, meteors: 2321 }, from: { radiant: "imo", speed: "imo" } },
  { code: "ORI", iau: 8, iauName: "Orionids", status: "established", parent: { designation: "1P/Halley", kind: "comet" }, checked: { adNo: 9, meteors: 72660 }, from: { radiant: "imo", speed: "imo" } },
  { code: "LMI", iau: 22, iauName: "Leonis Minorids", status: "established", parent: { designation: "C/1739 K1 (Zanotti)", kind: "comet" }, checked: { adNo: 6, meteors: 2054 }, from: { radiant: "imo", speed: "imo" } },
  { code: "STA", iau: 2, iauName: "Southern Taurids", status: "established", parent: { designation: "2P/Encke", kind: "comet" }, checked: { adNo: 10, meteors: 1212 }, from: { radiant: "imo", speed: "imo" } },
  { code: "NTA", iau: 17, iauName: "Northern Taurids", status: "established", parent: { designation: "2P/Encke", kind: "comet" }, checked: { adNo: 12, meteors: 29599 }, from: { radiant: "imo", speed: "imo" } },
  { code: "LEO", iau: 13, iauName: "Leonids", status: "established", parent: { designation: "55P/Tempel-Tuttle", kind: "comet" }, checked: { adNo: 14, meteors: 13815 }, from: { radiant: "imo", speed: "imo" } },
  { code: "AMO", iau: 246, iauName: "alpha-Monocerotids", status: "established", parent: null, checked: { adNo: 4, meteors: 370 }, from: { radiant: "imo", speed: "mdc" } },
  { code: "NOO", iau: 250, iauName: "November Orionids", status: "established", parent: null, checked: { adNo: 9, meteors: 8909 }, from: { radiant: "imo", speed: "imo" } },
  { code: "PHO", iau: 254, iauName: "Phoenicids", status: "established", parent: { designation: "D/1819 W1 (Blanpain)", kind: "comet" }, checked: null, from: { radiant: "imo", speed: "imo" } },
  { code: "PUP", iau: 301, iauName: "gamma-Puppids", status: "working", parent: null, checked: null, from: { radiant: "imo", speed: "imo" } },
  { code: "MON", iau: 19, iauName: "December Monocerotids", status: "established", parent: { designation: "C/1917 F1 (Mellish)", kind: "comet" }, checked: { adNo: 8, meteors: 5710 }, from: { radiant: "imo", speed: "imo" } },
  { code: "HYD", iau: 16, iauName: "sigma-Hydrids", status: "established", parent: { designation: "C/2023 P1 (Nishimura)", kind: "comet" }, checked: { adNo: 6, meteors: 15659 }, from: { radiant: "imo", speed: "imo" } },
  { code: "GEM", iau: 4, iauName: "Geminids", status: "established", parent: { designation: "(3200) Phaethon", kind: "asteroid" }, checked: { adNo: 8, meteors: 104490 }, from: { radiant: "imo", speed: "imo" } },
  { code: "COM", iau: 20, iauName: "Comae Berenicids", status: "established", parent: null, checked: { adNo: 7, meteors: 13811 }, from: { radiant: "imo", speed: "imo" } },
  { code: "URS", iau: 15, iauName: "Ursids", status: "established", parent: { designation: "8P/Tuttle", kind: "comet" }, checked: { adNo: 9, meteors: 5606 }, from: { radiant: "imo", speed: "imo" } },
];
