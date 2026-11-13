import assert from "node:assert/strict";
import test from "node:test";
import { findInCatalogue, foldKana } from "../src/satellites/index.ts";

test("hiragana folds to katakana, small kana to full-size, and the long-vowel mark and everything else are left alone", () => {
  assert.equal(foldKana("はっぶる"), "ハツブル");
  assert.equal(foldKana("ハッブル"), "ハツブル");
  assert.equal(foldKana("はっぶる"), foldKana("ハッブル"));
  assert.equal(foldKana("ちゃんどら"), foldKana("チャンドラ"), "a small ゃ folds with its katakana");
  assert.equal(foldKana("ちゃ"), "チヤ");
  assert.equal(foldKana("ラー"), "ラー", "the long-vowel mark stays");
  assert.equal(foldKana("あー"), "アー");
  assert.equal(foldKana("ゔ"), "ヴ");
  assert.equal(foldKana("ISS 衛星 123"), "ISS 衛星 123", "Latin letters, kanji and digits are as they were");
  assert.equal(foldKana("ﾊｯﾌﾞﾙ"), "ハツブル", "half-width katakana is widened first");
  assert.equal(foldKana(""), "");
});

test("a name typed in hiragana finds its katakana form, and the other way, and a small kana typed full-size still finds it", () => {
  const names = (text: string): string[] => findInCatalogue(text).map((entry) => entry.name);
  const hubble = names("ハッブル");
  assert.ok(hubble.length > 0, "the katakana name finds Hubble");
  assert.deepEqual(names("はっぶる"), hubble, "hiragana finds the same");
  assert.deepEqual(names("ハツブル"), hubble, "a small ッ typed full-size finds the same");
  assert.deepEqual(names("ﾊｯﾌﾞﾙ"), hubble, "so does half-width katakana");
});

test("a group's Japanese label is found in either kana, and English queries are as before", () => {
  const withGroup = findInCatalogue("すてーしょん").length;
  assert.ok(withGroup > 0, "「宇宙ステーション」 is found by すてーしょん");
  assert.equal(withGroup, findInCatalogue("ステーション").length, "the same entries in hiragana and katakana");
  assert.ok(findInCatalogue("sentinel 2").length > 0);
  assert.equal(findInCatalogue("").length, 0);
});
