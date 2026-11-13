// Kana folding for a search: hiragana and katakana are the same sounds, so a name typed in one is found in the other. Pure text, no dependency; imports on a server.

/** The small kana and the full-size kana they fold to. */
const SMALL: Readonly<Record<string, string>> = { ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ", ッ: "ツ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ヮ: "ワ", ヵ: "カ", ヶ: "ケ" };

/**
 * Fold text for a Japanese search: width and compatibility forms (NFKC: half-width katakana becomes full-width), hiragana to katakana, and a small kana (`ッ`, `ャ`, `ァ`) to its full-size one. The long-vowel mark `ー` is left as it is, and so is everything that is not kana
 * (letter case is the caller's, as it is for any search). Put it on both sides of a comparison: `foldKana("はっぶる") === foldKana("ハッブル")`, and `ハッブル` is also `ハツブル` after it, so a reader who types a small kana as a full-size one still finds it.
 *
 * @param text - What was typed, or a name to compare it with.
 * @returns The folded text.
 *
 * @example
 * ```ts
 * import { foldKana } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(foldKana("はっぶる") === foldKana("ハッブル"));
 * console.log(foldKana("ほし ー"));
 * ```
 */
export function foldKana(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[ぁ-ゖゝゞ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[ァィゥェォッャュョヮヵヶ]/g, (ch) => SMALL[ch] ?? ch);
}
