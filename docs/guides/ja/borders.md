---
title: "地球の上の境界線"
section: how-to
order: 20
description: "リアルな地球と宇宙の見た目の上に、chizu の輪郭から国と国の境界線を描きます。地球が大きく表示されたときは、ページが用意した州や県の境界線も描きます。地球といっしょに回る細い線で、昼の側でも夜の側でも見えます。指定したときだけ読み込みます。"
---

`<chikyu-earth-realistic>` と `<chikyu-space>` は、陸の上の境界線を、地球といっしょに回る細い線で描けます。線は雲の上、大気の下にあり、昼の側でも夜の側でも見えます。描くのは2つの形が接するところだけです。海岸は絵に写っているので描きません。

```html
<chikyu-earth-realistic borders="countries" style="width: 420px"></chikyu-earth-realistic>
```

| 属性 | 意味 |
|---|---|
| `borders="countries"` | 国と国の境界線。地球の大きさに関係なく描きます。 |
| `borders="regions"` | 国の中の地域 (州、省、県など) の境界線。地球が画面で十分大きいときに描きます。 |
| `borders` | 両方。属性がなければ、どちらも描きません。 |

プロパティ `borders` でも、`{ countries, regions }` の形で同じように読み書きできます。

- **国の輪郭は chizu のものです。** [chizu](https://github.com/johnmorrisdotca/chizu) の `world-geo` (`@johnmorrisdotca/chizu/world-geo`) から読み込みます。Natural Earth の 1:110m の国の輪郭 (パブリックドメイン) で、線の地球儀と同じ輪郭です。国か地域の境界線を初めてオンにしたときに動的 import で読み込むので、使わないページは何も読み込みません。線の地球儀も表示しているページでは、すでに読み込まれています。
- **地域の輪郭は、いまはページが用意します。** chizu の地域の地図は平らな地図用で、それぞれ別の座標で描かれているため、まだ球の上には置けません。国の地域を経度と緯度で持っているページは、`borderData.regions` で渡します。国のコードを受け取って、その地域の GeoJSON `FeatureCollection` を返す関数です。地域のデータがない国には `null` を返します。渡さなければ、地域は描きません。`borderData` は `borders` をオンにする前に設定してください。

```js no-run
const earth = document.querySelector("chikyu-earth-realistic");
earth.borderData = {
  regions: async (code) => (code === "JP" ? (await fetch("/regions/jp.json")).json() : null),
};
earth.borders = { countries: true, regions: true };
```

- **見分けられる大きさになってから地域を描きます。** 地球の半径が画面で 900 CSS ピクセル以上 (`BORDER_REGIONS_RADIUS`、1ピクセルが約 7 km) になると地域を描きます。読み込むのは画面に見えている国だけで (宇宙の見た目では、カメラから見て地平線より手前にある国)、1つの国につき1回です。縮小すると地域の線は消えます。国の境界線はどの大きさでも残ります。
- **地域のデータがない国。** ページがその国の地域を渡さないときは、となりの国との境界線だけを描きます。
- **主張が分かれている境界線。** Natural Earth は、どこかの国の主張ではなく、実際に管理されている線 (事実上の境界) を描いていて、そのことを明記しています。ここで描く線も同じです。特定の主張を支持するものではありません。
- **インストールされていないとき。** 輪郭を読み込めないとき (chizu がない、またはページの `borderData.countries` が失敗した) は、理由を添えて `chikyu-borders-unavailable` イベントを送ります。線は描かず、地球はそのまま動きます。`LineSegments` のない three.js を渡したときも、同じように知らせます。

## サイズと負担

2026-11-11 に esbuild (最小化、gzip レベル 9) と Chromium で計測しました。

| | サイズ |
|---|---|
| 各要素に入る境界線のコード | 最小化 5.5 kB、gzip 1.9 kB |
| chizu の `world-geo` (国か地域の境界線を初めてオンにしたときに読み込みます) | 最小化 166 kB、gzip 44.3 kB |
| GPU 上の国の境界線 | 3,012 本の線分。72 kB の頂点バッファ1つ |

国の境界線と地域の境界線は、それぞれまとめて1回で描きます。国がいくつあっても、描画命令 (ドローコール) は国の境界線で1回、地域の境界線で1回です。線は輪郭が届いたときに1回だけ作ります。止まっているときは何も描かず、輪郭が届いたときに1回だけ描き直します。`stats.borders` には `countries` と `regions` (線分の数)、`shown`、`loaded` (地域のデータが届いた国)、`builds`、`failed` があります。

純粋な計算の部分は、ブラウザーがなくても使えます。`@johnmorrisdotca/chikyu-earth/realistic` の `sharedEdges`、`shapeBoxes`、`codesNear`、`readBorders` で、どんな形の集まりからでも境界線を求め、今の視点から見える範囲にどれがあるかを調べられます。
