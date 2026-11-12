---
title: "地球の上の経線・緯線と国名"
section: how-to
order: 21
description: "リアルな地球と宇宙の見た目の上に、経線と緯線を描きます。赤道、北回帰線と南回帰線、北極圏と南極圏の線、本初子午線は目立つ色です。見えている国の名前を、ページの言語で、ほかの名前と重ならないように出します。"
---

`<chikyu-earth-realistic>` と `<chikyu-space>` は、地球の上に経線と緯線を描き、見えている国の名前を出せます。どちらも、指定するまでは表示されません。どちらも地球といっしょに回ります。

```html
<chikyu-earth-realistic grid country-names borders="countries" style="width: 420px"></chikyu-earth-realistic>
```

| 属性 | 意味 |
|---|---|
| `grid` | 経線と緯線。属性がない (または `grid="off"`) ときは描きません。 |
| `country-names` | 見えている国の名前。最大 40 個です。 |
| `country-names="12"` | 同じく、最大 12 個 (1 から 120)。属性がない (または `country-names="off"`) ときは出しません。 |

プロパティ `grid` でも、`true` か `false` で同じように読み書きできます。名前の見た目は `countryNamesStyle` で決めます。

## 経線と緯線

- **15 度ごと、または 30 度ごと。** 地球が画面で小さいあいだ (半径が 220 CSS ピクセル未満、`GRID_FINE_RADIUS`) は 30 度ごとに線を引きます。それより大きくなると 15 度ごとです。緯線は南緯 75 度から北緯 75 度まで、経線は北極と南極までです。
- **目立つ線。** 赤道がいちばん明るい線です。北回帰線と南回帰線 (北緯と南緯 23.4393 度。地球の傾き、`EARTH_TILT`)、北極圏と南極圏の線 (66.5607 度) も明るく描きます。本初子午線 (0 度、グリニッジを通る線) は暖かい色です。
- **地面の上、雲の下。** 線は地面のすぐ上、雲の下にあるので、明るい雲があると隠れます。昼の側では明るく、夜の側では暗く描きます。地球の向こう側の線は見えません。

## 国名

- **見えている場所に出します。** 名前は、その国の見えている部分のまん中に出します (陸の上だけで、海の上には出しません)。画面の端や地平線で切れている国も、見えているところに名前が出ます。島などいくつかの部分に分かれている国は、見えている中でいちばん大きい部分に出します。
- **見えている大きさで決まる文字の大きさ。** 画面で大きく見える国ほど名前も大きく (`smallest` と `largest` を決めなければ 10 から 16 ピクセル)、大きい国から先に出します。名前が入らないほど小さく見える国には出しません。地球が小さいときは名前が少なく、大きくなるほど増えます。
- **ページの言語で出します。** 日本語のページ (要素の `lang`、なければページの言語) では日本語の名前、英語のページでは英語の名前を大文字で出します。ファミリー共通の言語の切り替えを使うと、名前もすぐに切り替わります。
- **ほかの名前と重なりません。** 名前は、ほかの国の名前、都市の名前 (`city-names`)、場所の名前 (`places`)、ページがリアルな地球に置いた目印 (`attachMarkers` のラベルと点)、宇宙の見た目では太陽、月、惑星の名前と重なりません。名前は地球の円の中に収めるので、地球の外に出す星の名前 (`star-names`) とも重なりません。入る場所がない名前は出しません。
- **向こう側の国には出しません。** 地球の向こう側にある国や、端に近くてほとんど横から見える国には、名前を出しません。

```js no-run
const earth = document.querySelector("chikyu-earth-realistic");
earth.countryNamesStyle = { font: "Georgia, serif", colour: "#fff3d6", smallest: 11, largest: 18 };
earth.setAttribute("country-names", "30");
```

CSS カスタムプロパティ `--chikyu-country-font`、`--chikyu-country-weight`、`--chikyu-country-colour`、`--chikyu-country-halo`、`--chikyu-country-halo-width` でも、スタイルシートから同じ見た目を決められます。名前は実際に描くフォントで幅を測るので、文字の幅が広いフォントや行の高いフォントに置き換わっても重なりません。

## 名前の出どころ

輪郭と名前は [chizu](https://github.com/johnmorrisdotca/chizu) の `world-geo` (`@johnmorrisdotca/chizu/world-geo`) です。Natural Earth の 1:110m の国の輪郭 (パブリックドメイン) に、chizu の英語と日本語の名前 (kuni、Unicode CLDR、Wikidata から) がついています。線の地球儀と `borders` と同じ輪郭で、`country-names` を初めて指定したときに動的 import で読み込みます。使わないページは何も読み込みません。名前をどこに出すかは、このパッケージが輪郭から計算します。輪郭が届いたときに1回だけ、それぞれの国の陸の上に約 48 個の点を並べます。輪郭を読み込めないときは、理由を添えて `chikyu-country-names-unavailable` イベントを送ります。名前は出さず、地球はそのまま動きます。`LineSegments` のない three.js を渡したときは経線と緯線を描けないので、`chikyu-grid-unavailable` イベントを送ります。

## サイズと負担

2026-11-12 に esbuild (最小化、gzip レベル 9) と Chromium で計測しました。

| | サイズ |
|---|---|
| 各要素に入る経線・緯線と国名のコード | 最小化 11.7 kB、gzip 3.7 から 3.9 kB |
| chizu の `world-geo` (`country-names` を初めて指定したときに読み込みます) | 最小化 166 kB、gzip 44.3 kB (`borders` と線の地球儀と共通) |
| GPU 上の経線と緯線 | 3,240 本の線分 (地球が小さいときは 1,800 本)。95 kB のバッファ1つ (位置と色) |
| 名前の位置を決める点 | 4,647 個。73 kB |

経線と緯線は、間隔に関係なくまとめて1回で描きます (ドローコール1回)。15 度ごとの線は同じバッファの後ろの部分にあり、描く範囲を変えるだけです。線は `grid` を初めて指定したときに1回だけ作ります。名前は絵の上に重ねたいくつかのラベルで、絵を描き直したときだけ並べ直します (約 1 ミリ秒)。止まっているときは何も描きません。`stats.grid` には `shown`、`fine` (15 度ごと)、`segments`、`builds`、`failed` があり、`stats.countryNames` には `on`、`max`、`countries`、`names`、`renders`、`failed` があります。

純粋な計算の部分は、ブラウザーがなくても使えます。`@johnmorrisdotca/chikyu-earth/realistic` の `gridLines`、`readGrid`、`countrySpots`、`layoutCountryNames`、`countryNameText`、`readCountryNames` で、どんな視点でも経線と緯線を作り、名前を並べられます。
