---
title: "地球に書かれた名前"
section: how-to
order: 17
description: "地球の名前を地球儀の上に直接書き、地球といっしょに回します。文字の下から表面が透けて見えます。ファミリー共通の属性名で指定でき、ページで指定したときだけ表示されます。"
---

`<chikyu-earth-realistic>` と `<chikyu-space>` は、地球の名前を地球儀の上に直接書けます。映画の大きなタイトル文字が、その題材の上に重なるのに似ています。文字は表面に沿って置かれ、地球といっしょに回り、文字の下からは表面が透けて見えます。ファミリー共通のラベル (`@johnmorrisdotca/kazoku-ui/body-label`。wakusei-planets が天体に描くものと同じです) を使うので、見た目はファミリー全体で同じです。既定は **Michroma、塗り、強さ半分、名前は1つ、地球といっしょに回り、赤道の上** です。

```html
<chikyu-earth-realistic body-label center="139.69,35.68" camera="ground" style="width: 420px"></chikyu-earth-realistic>
<chikyu-earth-realistic body-label="etched" body-label-strength="0.8" body-label-repeat="both" lang="ja" style="width: 420px"></chikyu-earth-realistic>
```

## 属性

| 属性 | 値 |
|---|---|
| `body-label` | `painted`、`etched`、`outline`、`burned` のどれかで、見た目を決めます。ほかの値や空の値なら `painted`。属性がなければ名前は出ません。 |
| `body-label-strength` | 0から1 (既定は 0.5) |
| `body-label-repeat` | `once`、`both` (反対側に2つ置くので、どちらかがいつも見えます)、`around` のどれか |
| `body-label-latitude` | 度で指定します。0は赤道、55は極に近い帯です |
| `body-label-facing` | 属性があれば、地球が下で回っても、名前はいつも読む人のほうを向きます |
| `body-label-font` | ページで読み込み済みの CSS フォントファミリー。省略すると Michroma (一度だけ取得) |
| `body-label-fallback-font` | フォントに含まれない文字 (日本語など) に使うファミリー |

プロパティは `bodyLabel` で、同じ項目を持つオブジェクト (`{ look, strength, repeat, latitude, facing, font, fallbackFont }`) か `null` です。設定すると、属性に書き込まれます。文字は地球自身の名前で、英語では `EARTH`、日本語のページでは `地球` です (言語は要素の `lang`、なければページの言語で決まります)。

- **指定しなければ出ません。** `body-label` が初めて設定されるまで、ラベルに関するものは何も取得せず、何も作りません。設定されたときにファミリーのラベルを読み込み、Michroma (64 kB、`SIL OFL 1.1` の下で配布) は、ページ自身のフォントが指定されていないときだけ読み込みます。
- **小さいときは隠れます。** 地球の画面上の半径が24ピクセルより小さいときや、天体に乗って見ていて地球が隠れているときは、名前を出しません。
- **止まっているときは何もしません。** 名前は絵の一部です。描き直すのは、オンにしたとき、変えたとき、隠れたとき、現れたとき、読む人のほうへ向け直したときだけです。
- **three.js を渡すとき。** `setThreeLoader` で渡す three.js には、`CanvasTexture`、`SphereGeometry`、`MeshLambertMaterial`、`SRGBColorSpace`、`NormalBlending`、`AdditiveBlending` が必要です。足りないと `chikyu-body-label-unavailable` イベントが送られ、名前は描かれません。`stats.bodyLabel` に `on`、`text`、`made`、`showing` があります。

## 設定の読み取りだけを使う

属性を読み取る部分は純粋な計算なので、単独でも使えます。

```js
import { BODY_LABEL_ATTRIBUTES, bodyLabelText, readBodyLabel } from "@johnmorrisdotca/chikyu-earth/realistic";

// The family's plain attributes: absent, no name; present, the family's own default (painted, half strength, once, on the equator).
const none = readBodyLabel(() => null);
const plain = readBodyLabel((name) => (name === "body-label" ? "" : null));
console.log(none, JSON.stringify(plain));

// A page's own choices, and the name in its language.
const mine = { "body-label": "etched", "body-label-strength": "0.8", "body-label-repeat": "both", "body-label-latitude": "55" };
console.log(JSON.stringify(readBodyLabel((name) => mine[name] ?? null)));
console.log(bodyLabelText("en"), bodyLabelText("ja"), BODY_LABEL_ATTRIBUTES.length);
```
