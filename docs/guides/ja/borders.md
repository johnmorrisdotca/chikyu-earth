---
title: "地球の上の境界線"
section: how-to
order: 20
description: "リアルな地球と宇宙の見た目の上に、chizu の輪郭から国と国の境界線を描きます (地球が大きいときはより細かい輪郭で)。地球がさらに大きく表示されたときは、chizu の州や県などの地域の境界線と、その名前も描きます。地球といっしょに回る細い線で、昼の側でも夜の側でも見えます。指定したときだけ読み込みます。"
---

`<chikyu-earth-realistic>` と `<chikyu-space>` は、陸の上の境界線を、地球といっしょに回る細い線で描けます。線は雲の上、大気の下にあり、昼の側でも夜の側でも見えます。描くのは2つの輪郭が接するところだけです。海岸は絵に写っているので描きません。

```html
<chikyu-earth-realistic borders="countries" style="width: 420px"></chikyu-earth-realistic>
```

| 属性 | 意味 |
|---|---|
| `borders="countries"` | 国と国の境界線。地球の大きさに関係なく描きます。 |
| `borders="regions"` | 国の中の地域 (州、省、県など) の境界線。地球が画面で十分大きいときに描きます。 |
| `borders` | 両方。属性がなければ、どちらも描きません。 |
| `region-names` | 地域の名前。地域の線を描いているあいだだけ出します (下の「名前」を見てください)。 |

プロパティ `borders` でも、`{ countries, regions }` の形で同じように読み書きできます。

- **国の輪郭は chizu のものです。** [chizu](https://github.com/johnmorrisdotca/chizu) の `world-geo` (`@johnmorrisdotca/chizu/world-geo`) から読み込みます。Natural Earth の 1:110m の国の輪郭 (パブリックドメイン) で、線の地球儀と同じ輪郭です。国か地域の境界線を初めてオンにしたときに動的 import で読み込むので、使わないページは何も読み込みません。線の地球儀も表示しているページでは、すでに読み込まれています。
- **地球が大きくなると、より細かい輪郭を使います。** 1:110m の線は数 km ずれることがあり、地球が大きいとそれが見えてしまいます。地球の半径が画面で 600 CSS ピクセル以上 (`BORDER_DETAIL_RADIUS`、1ピクセルが約 10 km) になると、国の境界線は chizu の `world-geo-detail` (Natural Earth の 1:50m) から描きます。読み込むのは、国の境界線がオンで地球がそれだけ大きくなった最初の1回だけで、それより前には読み込みません。細かい線を描くあいだは粗い線をしまうので、同じ境界線を2度描くことはありません。地球が小さくなると、粗い線に戻ります。
- **地域の輪郭も chizu のものです。** 32 か国の地域 (Natural Earth の admin-1、1:10m) は、chizu の `divisions-geo` から国ごとのファイルで読み込みます。そのため、ページに読み込み関数を用意しなくてもよく、デモの「境界線」ボタンで地域が表示されます。chizu にデータがない国は、となりの国との境界線だけを描きます。もっと良い地域のデータを持っているページや、ほかの国の地域を持っているページは、`borderData.regions` で渡します。渡したものは chizu のものの代わりに使われます。国のコードを受け取り、地域を経度と緯度の GeoJSON `FeatureCollection` で返す関数で、データがない国には `null` を返します。2種類の国の輪郭も、`borderData.countries` と `borderData.detail` で同じように置き換えられます。`borderData` は `borders` をオンにする前に設定してください。

```js no-run
const earth = document.querySelector("chikyu-earth-realistic");
earth.borderData = {
  regions: async (code) => (code === "JP" ? (await fetch("/regions/jp.json")).json() : null),
};
earth.borders = { countries: true, regions: true };
```

- **見分けられる大きさになってから地域を描きます。** 地球の半径が画面で 900 CSS ピクセル以上 (`BORDER_REGIONS_RADIUS`、1ピクセルが約 7 km) になると地域を描きます。読み込むのは画面に見えている国だけで (宇宙の見た目では、カメラから見て地平線より手前にある国)、1つの国につき1回です。縮小すると地域の線は消えます。国の境界線はどの大きさでも残ります。
- **主張が分かれている境界線。** Natural Earth は、どこかの国の主張ではなく、実際に管理されている線 (事実上の境界) を描いていて、そのことを明記しています。ここで描く線も同じです。特定の主張を支持するものではありません。
- **インストールされていないとき。** 輪郭を読み込めないとき (chizu がない、またはページの `borderData.countries` が失敗した) は、理由を添えて `chikyu-borders-unavailable` イベントを送ります。線は描かず、地球はそのまま動きます。`LineSegments` のない three.js を渡したときも、同じように知らせます。

## 名前

国の名前は `country-names` です ([経線・緯線と国名](grid-and-country-names.md) を見てください)。地域の名前は `region-names` で、同じしくみを地域に使います。

```html
<chikyu-earth-realistic borders region-names country-names style="width: 420px"></chikyu-earth-realistic>
```

- **地域を描いているあいだだけ出ます。** `region-names` は、届いた国の地域の名前を出します。そのため、`borders` に地域が含まれていて、地球が地域を見分けられる大きさ (上のとおり 900 CSS ピクセル) になるまでは何も出しません。地球を縮小したり地域をオフにしたりすると、線といっしょに名前もしまいます。自分では何も読み込まず、境界線が読み込んだ地域の名前を出します。値を付けないときは最大 40 個、数字 (1 から 120) を付けるとその数までです。
- **ページの言語で書きます。** 日本語のページでは、chizu に名前があれば日本語で、なければ Natural Earth の綴りの英語で書きます (国名と違って、大文字にはしません)。
- **名前どうしが重ならないようにします。** 名前は、地域のうち見えている部分のまん中に、その部分の大きさに合わせた文字の大きさで、収まるところにだけ置きます。大きい地域から順に置きます。地域の名前は、場所、都市、海、国の名前を置いたあとで配置し、それらと、ページの `keepOut` のボックスを避けます。ほかの名前に重なるときは、同じ地域の別の点に動かすか、出しません。
- **見た目。** `--chikyu-region-font`、`--chikyu-region-weight`、`--chikyu-region-colour`、`--chikyu-region-halo`、`--chikyu-region-halo-width` で決めます。ページがどれも指定しなければ、国名の `--chikyu-country-*` が使われるので、ページが指定するまでは同じ見た目です。文字は国名より小さく、9 から 13 ピクセルです。
- **状態。** `stats.regionNames` には、`on`、`max`、`countries` (受け取った地域の数)、`names` (直前の描画で出した名前の数)、`renders` (配置し直した回数) があります。

純粋な計算の部分は、ブラウザーがなくても使えます。`regionShapes` は、国の地域を、名前を置くための形に変えます。`countrySpots` と `layoutCountryNames` (`capitals: false` を付けます) がその配置を行います。

## サイズと負担

2026-11-26 に、chizu 1.17.1 (最小化したうえで gzip レベル 9) を使い、ドイツを表示した Chromium で計測しました。

| | サイズ |
|---|---|
| 各要素に入る境界線のコード | 最小化 4.4 kB、gzip 2.1 kB |
| 地域の名前のコード (国名と共有する部分は含みません) | 最小化 1.3 kB、gzip 0.8 kB |
| chizu の `world-geo` (国か地域の境界線を初めてオンにしたときに読み込みます) | 最小化 166 kB、gzip 44.3 kB |
| chizu の `world-geo-detail` (地球の半径が 600 ピクセルに達したときに読み込みます) | 最小化 1.38 MB、gzip 410 kB |
| 1か国分の chizu の地域 (その国が初めて見えたときに読み込みます) | gzip 4 から 176 kB。ドイツ 14 kB、日本 21 kB、ロシア 176 kB |
| GPU 上の国の境界線 | 3,012 本の線分 (72 kB)。細かい輪郭では 16,823 本 (404 kB、粗い線の代わりに使います) |
| GPU 上の地域の境界線 | ドイツの周りの 14 か国を読み込んだとき、31,472 本の線分 (755 kB) |

国の境界線 (粗い線でも細かい線でも)、地域の境界線は、それぞれまとめて1回で描きます。国がいくつあっても、描画命令 (ドローコール) は国の境界線で1回、地域の境界線で1回です。線は輪郭が届いたときに1回だけ作ります。止まっているときは何も描かず、輪郭が届いたときに1回だけ描き直します。名前は少数のテキストの箱 (標準では最大 40 個) で、transform で動かします。描画で視点が動いたときと地域が届いたときに配置し直し、止まっているときは配置し直しません。`stats.borders` には `countries`、`detail`、`regions` (線分の数)、`shown`、`loaded` (地域のデータが届いた国)、`builds`、`failed` があります。フリーズテスト (`e2e/freeze.demo.ts`) は、地域とその名前について、止まっているときに描画も配置もしないこと、コンテキストが1つであること、地球を縮小したあとに何も残らないことを確かめます。

純粋な計算の部分は、ブラウザーがなくても使えます。`@johnmorrisdotca/chikyu-earth/realistic` の `sharedEdges`、`shapeBoxes`、`codesNear`、`readBorders` で、どんな形の集まりからでも境界線を求め、今の視点から見える範囲にどれがあるかを調べられます。
