// The meteor showers a watcher can see: the International Meteor Organization's Working List of Visual Meteor Showers
// (Table 5 of its 2026 Meteor Shower Calendar, edited by Jürgen Rendtel; "correct according to the best information available in
// June 2025, with maximum dates accurate only for 2026"), typed by hand on 2026-11-10. The Antihelion Source, which has no fixed
// radiant, is left out. Parent bodies are only those the Calendar's own text names (Lyrids, June Bootids, Perseids, Draconids,
// Taurids, Leonids) or that NASA's pages on the shower name (Quadrantids, eta Aquariids, Orionids, Geminids); the rest have none here.
// The Japanese names are the ones used in Japan for each shower. See NOTICE.md.
// No imports: this file is data only, so another package can read it without taking anything else.

/**
 * One meteor shower of the working list.
 *
 * @example
 * ```ts
 * import { METEOR_SHOWERS, type MeteorShower } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const perseids: MeteorShower | undefined = METEOR_SHOWERS.find((shower) => shower.code === "PER");
 * console.log(perseids?.name, perseids?.zhr, perseids?.parent);
 * ```
 */
export interface MeteorShower {
  /** The IAU's three-letter code: `PER` for the Perseids. */
  code: string;
  /** The IAU's number for the shower. */
  iau: number;
  name: string;
  /** The name used in Japan. */
  nameJa: string;
  /** The first day of activity, as month (1 to 12) and day. A shower may run over the new year. */
  start: readonly [month: number, day: number];
  /** The last day of activity. */
  end: readonly [month: number, day: number];
  /** The day of the maximum in 2026; in other years it can fall a day either side. `peakSolarLongitude` is the lasting figure. */
  peak: readonly [month: number, day: number];
  /** The Sun's longitude at the maximum, in degrees, for the equinox of 2000.0: where the Earth is on its orbit, whatever the calendar says. */
  peakSolarLongitude: number;
  /** The radiant at the maximum: right ascension and declination, in degrees. */
  radiant: { ra: number; dec: number };
  /** The speed the meteors meet the atmosphere at, in kilometres a second: 11 is very slow, 72 very fast. */
  speedKmS: number;
  /** The population index r: 2.0 to 2.5 has more bright meteors than average, above 3.0 more faint ones. */
  populationIndex: number;
  /** The zenithal hourly rate at the maximum: what an ideal watcher would count in an hour under a perfect sky with the radiant overhead. `null` where the list says the rate varies from year to year. */
  zhr: number | null;
  /** The comet or asteroid whose dust it is, where a source used here names one. */
  parent?: string;
}

/**
 * The working list, in the order of the year.
 *
 * @example
 * ```ts
 * import { METEOR_SHOWERS } from "@johnmorrisdotca/chikyu-earth/meteors";
 *
 * const strongest = [...METEOR_SHOWERS].sort((a, b) => (b.zhr ?? 0) - (a.zhr ?? 0))[0];
 * console.log(METEOR_SHOWERS.length, strongest?.name); // 37 "Geminids"
 * ```
 */
export const METEOR_SHOWERS: readonly MeteorShower[] = [
  { code: "QUA", iau: 10, name: "Quadrantids", nameJa: "しぶんぎ座流星群", start: [12, 28], end: [1, 12], peak: [1, 3], peakSolarLongitude: 283.15, radiant: { ra: 230, dec: 49 }, speedKmS: 41, populationIndex: 2.1, zhr: 80, parent: "asteroid 2003 EH1" },
  { code: "GUM", iau: 404, name: "γ-Ursae Minorids", nameJa: "こぐま座γ流星群", start: [1, 10], end: [1, 22], peak: [1, 18], peakSolarLongitude: 298, radiant: { ra: 228, dec: 67 }, speedKmS: 31, populationIndex: 3.0, zhr: 3 },
  { code: "ACE", iau: 102, name: "α-Centaurids", nameJa: "ケンタウルス座α流星群", start: [1, 31], end: [2, 20], peak: [2, 8], peakSolarLongitude: 319.4, radiant: { ra: 211, dec: -58 }, speedKmS: 58, populationIndex: 2.0, zhr: 6 },
  { code: "LYR", iau: 6, name: "April Lyrids", nameJa: "4月こと座流星群", start: [4, 14], end: [4, 30], peak: [4, 22], peakSolarLongitude: 32.32, radiant: { ra: 271, dec: 34 }, speedKmS: 49, populationIndex: 2.1, zhr: 18, parent: "comet C/1861 G1 (Thatcher)" },
  { code: "PPU", iau: 137, name: "π-Puppids", nameJa: "とも座π流星群", start: [4, 15], end: [4, 28], peak: [4, 24], peakSolarLongitude: 33.5, radiant: { ra: 110, dec: -45 }, speedKmS: 18, populationIndex: 2.0, zhr: null },
  { code: "ETA", iau: 31, name: "η-Aquariids", nameJa: "みずがめ座η流星群", start: [4, 19], end: [5, 28], peak: [5, 6], peakSolarLongitude: 45.5, radiant: { ra: 338, dec: -1 }, speedKmS: 66, populationIndex: 2.4, zhr: 50, parent: "comet 1P/Halley" },
  { code: "ELY", iau: 145, name: "η-Lyrids", nameJa: "こと座η流星群", start: [5, 3], end: [5, 14], peak: [5, 11], peakSolarLongitude: 50.0, radiant: { ra: 291, dec: 43 }, speedKmS: 43, populationIndex: 3.0, zhr: 3 },
  { code: "ARI", iau: 171, name: "Daytime Arietids", nameJa: "おひつじ座昼間流星群", start: [5, 14], end: [6, 24], peak: [6, 7], peakSolarLongitude: 76.7, radiant: { ra: 43, dec: 24 }, speedKmS: 38, populationIndex: 2.8, zhr: 30 },
  { code: "JBO", iau: 170, name: "June Bootids", nameJa: "6月うしかい座流星群", start: [6, 22], end: [7, 2], peak: [6, 22], peakSolarLongitude: 90.3, radiant: { ra: 221, dec: 48 }, speedKmS: 18, populationIndex: 2.2, zhr: null, parent: "comet 7P/Pons-Winnecke" },
  { code: "JPE", iau: 175, name: "July Pegasids", nameJa: "7月ペガスス座流星群", start: [7, 1], end: [7, 20], peak: [7, 10], peakSolarLongitude: 108.0, radiant: { ra: 347, dec: 11 }, speedKmS: 63, populationIndex: 3.0, zhr: 3 },
  { code: "GDR", iau: 184, name: "July γ-Draconids", nameJa: "7月りゅう座γ流星群", start: [7, 25], end: [7, 31], peak: [7, 28], peakSolarLongitude: 125.13, radiant: { ra: 280, dec: 51 }, speedKmS: 27, populationIndex: 3.0, zhr: 5 },
  { code: "SDA", iau: 5, name: "Southern δ-Aquariids", nameJa: "みずがめ座δ南流星群", start: [7, 12], end: [8, 23], peak: [7, 31], peakSolarLongitude: 128, radiant: { ra: 340, dec: -16 }, speedKmS: 41, populationIndex: 2.5, zhr: 25 },
  { code: "CAP", iau: 1, name: "α-Capricornids", nameJa: "やぎ座α流星群", start: [7, 3], end: [8, 15], peak: [7, 31], peakSolarLongitude: 128, radiant: { ra: 307, dec: -10 }, speedKmS: 23, populationIndex: 2.5, zhr: 5 },
  { code: "ERI", iau: 191, name: "η-Eridanids", nameJa: "エリダヌス座η流星群", start: [7, 31], end: [8, 19], peak: [8, 7], peakSolarLongitude: 135, radiant: { ra: 41, dec: -11 }, speedKmS: 64, populationIndex: 3.0, zhr: 3 },
  { code: "PER", iau: 7, name: "Perseids", nameJa: "ペルセウス座流星群", start: [7, 17], end: [8, 24], peak: [8, 13], peakSolarLongitude: 140.0, radiant: { ra: 48, dec: 58 }, speedKmS: 59, populationIndex: 2.2, zhr: 100, parent: "comet 109P/Swift-Tuttle" },
  { code: "KCG", iau: 12, name: "κ-Cygnids", nameJa: "はくちょう座κ流星群", start: [8, 3], end: [8, 28], peak: [8, 17], peakSolarLongitude: 144, radiant: { ra: 286, dec: 59 }, speedKmS: 23, populationIndex: 3.0, zhr: 3 },
  { code: "AUR", iau: 206, name: "Aurigids", nameJa: "ぎょしゃ座流星群", start: [8, 28], end: [9, 5], peak: [9, 1], peakSolarLongitude: 158.6, radiant: { ra: 91, dec: 39 }, speedKmS: 66, populationIndex: 2.5, zhr: 6 },
  { code: "SPE", iau: 208, name: "September ε-Perseids", nameJa: "9月ペルセウス座ε流星群", start: [9, 5], end: [9, 21], peak: [9, 9], peakSolarLongitude: 166.7, radiant: { ra: 48, dec: 40 }, speedKmS: 64, populationIndex: 2.5, zhr: 8 },
  { code: "SLY", iau: 81, name: "September Lyncids", nameJa: "9月やまねこ座流星群", start: [9, 10], end: [10, 8], peak: [9, 13], peakSolarLongitude: 170, radiant: { ra: 113, dec: 56 }, speedKmS: 60, populationIndex: 3.0, zhr: 3 },
  { code: "DSX", iau: 221, name: "Daytime Sextantids", nameJa: "ろくぶんぎ座昼間流星群", start: [9, 20], end: [10, 6], peak: [10, 1], peakSolarLongitude: 188, radiant: { ra: 156, dec: -2 }, speedKmS: 32, populationIndex: 2.5, zhr: 5 },
  { code: "OCT", iau: 281, name: "October Camelopardalids", nameJa: "10月きりん座流星群", start: [10, 5], end: [10, 6], peak: [10, 6], peakSolarLongitude: 192.58, radiant: { ra: 164, dec: 79 }, speedKmS: 47, populationIndex: 2.5, zhr: 5 },
  { code: "DRA", iau: 9, name: "Draconids", nameJa: "10月りゅう座流星群", start: [10, 6], end: [10, 10], peak: [10, 9], peakSolarLongitude: 195.4, radiant: { ra: 262, dec: 54 }, speedKmS: 20, populationIndex: 2.6, zhr: 5, parent: "comet 21P/Giacobini-Zinner" },
  { code: "EGE", iau: 23, name: "ε-Geminids", nameJa: "ふたご座ε流星群", start: [10, 14], end: [10, 27], peak: [10, 18], peakSolarLongitude: 205, radiant: { ra: 102, dec: 27 }, speedKmS: 70, populationIndex: 3.0, zhr: 3 },
  { code: "ORI", iau: 8, name: "Orionids", nameJa: "オリオン座流星群", start: [10, 2], end: [11, 7], peak: [10, 21], peakSolarLongitude: 208, radiant: { ra: 95, dec: 16 }, speedKmS: 66, populationIndex: 2.5, zhr: 20, parent: "comet 1P/Halley" },
  { code: "LMI", iau: 22, name: "Leonis Minorids", nameJa: "こじし座流星群", start: [10, 19], end: [10, 27], peak: [10, 24], peakSolarLongitude: 211, radiant: { ra: 162, dec: 37 }, speedKmS: 62, populationIndex: 3.0, zhr: 2 },
  { code: "STA", iau: 2, name: "Southern Taurids", nameJa: "おうし座南流星群", start: [9, 20], end: [11, 20], peak: [11, 5], peakSolarLongitude: 223, radiant: { ra: 52, dec: 15 }, speedKmS: 27, populationIndex: 2.3, zhr: 7, parent: "comet 2P/Encke" },
  { code: "NTA", iau: 17, name: "Northern Taurids", nameJa: "おうし座北流星群", start: [10, 20], end: [12, 10], peak: [11, 12], peakSolarLongitude: 230, radiant: { ra: 58, dec: 22 }, speedKmS: 29, populationIndex: 2.3, zhr: 5, parent: "comet 2P/Encke" },
  { code: "LEO", iau: 13, name: "Leonids", nameJa: "しし座流星群", start: [11, 6], end: [11, 30], peak: [11, 17], peakSolarLongitude: 235.27, radiant: { ra: 152, dec: 22 }, speedKmS: 71, populationIndex: 2.5, zhr: 15, parent: "comet 55P/Tempel-Tuttle" },
  { code: "AMO", iau: 246, name: "α-Monocerotids", nameJa: "いっかくじゅう座α流星群", start: [11, 15], end: [11, 25], peak: [11, 22], peakSolarLongitude: 239.32, radiant: { ra: 117, dec: 1 }, speedKmS: 65, populationIndex: 2.4, zhr: null },
  { code: "NOO", iau: 250, name: "November Orionids", nameJa: "11月オリオン座流星群", start: [11, 13], end: [12, 6], peak: [11, 28], peakSolarLongitude: 246, radiant: { ra: 91, dec: 16 }, speedKmS: 44, populationIndex: 3.0, zhr: 3 },
  { code: "PHO", iau: 254, name: "Phoenicids", nameJa: "ほうおう座流星群", start: [12, 1], end: [12, 5], peak: [12, 2], peakSolarLongitude: 249.5, radiant: { ra: 8, dec: -27 }, speedKmS: 15, populationIndex: 2.8, zhr: null },
  { code: "PUP", iau: 301, name: "Puppid-Velids", nameJa: "とも座・ほ座流星群", start: [12, 1], end: [12, 15], peak: [12, 7], peakSolarLongitude: 255, radiant: { ra: 123, dec: -45 }, speedKmS: 44, populationIndex: 2.9, zhr: 10 },
  { code: "MON", iau: 19, name: "Monocerotids", nameJa: "12月いっかくじゅう座流星群", start: [12, 1], end: [12, 19], peak: [12, 9], peakSolarLongitude: 257, radiant: { ra: 100, dec: 8 }, speedKmS: 41, populationIndex: 3.0, zhr: 3 },
  { code: "HYD", iau: 16, name: "σ-Hydrids", nameJa: "うみへび座σ流星群", start: [12, 3], end: [12, 20], peak: [12, 9], peakSolarLongitude: 257, radiant: { ra: 125, dec: 2 }, speedKmS: 58, populationIndex: 3.0, zhr: 7 },
  { code: "GEM", iau: 4, name: "Geminids", nameJa: "ふたご座流星群", start: [12, 4], end: [12, 20], peak: [12, 14], peakSolarLongitude: 262.2, radiant: { ra: 112, dec: 33 }, speedKmS: 35, populationIndex: 2.6, zhr: 150, parent: "asteroid (3200) Phaethon" },
  { code: "COM", iau: 20, name: "Comae Berenicids", nameJa: "かみのけ座流星群", start: [12, 4], end: [1, 30], peak: [12, 23], peakSolarLongitude: 271, radiant: { ra: 164, dec: 29 }, speedKmS: 65, populationIndex: 3.0, zhr: 3 },
  { code: "URS", iau: 15, name: "Ursids", nameJa: "こぐま座流星群", start: [12, 17], end: [12, 26], peak: [12, 22], peakSolarLongitude: 270.7, radiant: { ra: 217, dec: 76 }, speedKmS: 33, populationIndex: 2.8, zhr: 10 },
];
