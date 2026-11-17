---
title: 世界の平面地図の上の衛星
section: how-to
order: 10
description: <chikyu-flat> 要素で、衛星のグループを世界の平面地図の上に表示します。グループや軌道面ごとの色分け、昼と夜、可視範囲、地上軌跡、3D 表示と同じ時計、軌道要素だけから求めるグループの情報を説明します。
---

`<chikyu-flat>` は、衛星を世界の平面地図の上に、表示している時刻に SGP4 が求める位置のまま描きます。時計に合わせて動くので、3D 表示と同じように、衛星が地図の上を進んでいきます。描画はキャンバス (点ごとの要素は作りません) なので、スターリンク全体の1万1千個の点もなめらかに動きます。ブラウザも他のライブラリも必要としない `groupFacts` (衛星の数、高さ、傾き、速さ、軌道面の数) と `clusterPlanes` も公開しているので、ビルドの段階で「GPS: 6つの軌道面、高さ 20,200 km、傾き55度、周期11時間58分」のような文をページに書き込めます。

## インストール

```sh
npm install @johnmorrisdotca/chikyu-earth satellite.js
```

`satellite.js` (MIT、バージョン 6) は人工衛星の機能と同じく任意の peer 依存です。必要なのは `<chikyu-flat>` 要素だけで、グループの情報の計算には要りません。このパッケージは軌道データを自分では取得しません。ページが渡します (入手先とルールは [地球儀の上の衛星](satellites.md) を見てください)。

## グループの情報

```js
import { clusterPlanes, groupFacts } from "@johnmorrisdotca/chikyu-earth/flat";

// Six GPS satellites from one downloaded list, two in each of three planes: the same facts on a server as in a page, from the elements alone.
const gps = (RA_OF_ASC_NODE) => ({ MEAN_MOTION: 2.00563, ECCENTRICITY: 0.0102, INCLINATION: 55.1, RA_OF_ASC_NODE });
const sets = [gps(24), gps(26), gps(144), gps(146), gps(264), gps(266)];
const facts = groupFacts(sets);
const planes = clusterPlanes(sets).planes.map((plane) => `${plane.id}:${plane.count}`).join(" ");
console.log(`${facts.count} satellites, ${Math.round(facts.meanAltitudeKm)} km up, ${Math.round(facts.meanInclinationDeg)} degrees, ${facts.planeCount} planes (${planes})`);
```

`groupFacts(sets)` は `count`、`meanAltitudeKm`、最も低い点と高い点 (`minAltitudeKm`、`maxAltitudeKm`)、`meanInclinationDeg` (範囲つき)、`periodMinutes`、`speedKmS`、`planeCount`、`planes`、`newestEpochMs` を返します。高さは地球の平均半径 6,371 km からの高さで、衛星自身の表示と同じです。`clusterPlanes(sets)` は昇交点赤経で衛星を軌道面に分けます。昇交点を円に沿って並べ、10度 (`gapDeg`) より広いすき間で切ります。GPS は6面、ガリレオとグロナスは3面、イリジウムは6面、ワンウェブは12面になります。最大のクラスターの4分の1 (`minShare`) より小さいもの、または2機未満のものは予備や外れ値として `other` に残ります (誤った軌道に入ったガリレオの2機がその例です)。赤道から5度以内 (`minInclination`) の軌道は昇交点が意味を持たないので、静止軌道の衛星は軌道面に分けられません。軌道面は赤経0度から東向きに `A`、`B`、`C` と名づけます。**スターリンクのように昇交点がひとかたまりになるときは `clustered` が false です。見せるべき軌道面がないので、ページは軌道面があるとは言わないでください。**

## 要素

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GPS satellites on a flat map</title>
  </head>
  <body>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/flat/define/+esm"></script>
    <!-- Your page chooses where the orbit data come from (its own file, or a source whose terms it has read); this address is an example. -->
    <chikyu-flat group="gps" colour-by="plane" center="0" home-lon="139.69" home-lat="35.69" elements-src="https://example.org/gps.json"></chikyu-flat>
  </body>
</html>
```

タグの登録には `@johnmorrisdotca/chikyu-earth/flat/define` を読み込みます (CDN からは `/+esm` のアドレスです)。`@johnmorrisdotca/chikyu-earth/flat` は計算部分で、サーバーでも読み込めます。軌道要素は、グループごとに `setGroup(id, sets)` で、グループが1つだけなら `elements` プロパティで、または `elements-src` (アドレスを1回だけ、取得先に負担をかけないように読みます) で渡します。`SATELLITE_GROUPS` の id (`gps`、`starlink`) は、日本語と英語の名前と色が決まっています。ほかの id には `{ colour, label, labelJa }` の `style` を渡します。

```js no-run
import "@johnmorrisdotca/chikyu-earth/flat/define";

const flat = document.querySelector("chikyu-flat");
flat.setGroup("gps", gpsElements); // ページが用意した軌道要素
flat.setGroup("galileo", galileoElements);
flat.setGroup("mine", mySets, { colour: "#ffffff", label: "My satellites", labelJa: "私の衛星" });
flat.addEventListener("chikyu-flat-pick", (event) => console.log(event.detail.name, event.detail.plane));
```

### 地図と中心

地図は正距円筒図法 (経度と緯度を等間隔に並べたもの) で、国の輪郭、経緯線、実際の太陽の位置から求めた夜の側を描きます。`center` は真ん中の経度で、初期値は 0 (グリニッジ) です。どの値でも使え、日付変更線で自然につながります。組み込みの **グリニッジ** ボタンで 0 に戻ります。読者が保存した場所を `home-lon` と `home-lat` で渡すと、地図にその場所の目印と、そこを中心にする **自分の場所** ボタンが出ます。**この要素がブラウザに位置情報を求めることはありません。** 読者が保存した場所をページが読み、2つの属性に設定します。縦横比が2対1より縦長の枠 (スマートフォン) では枠いっぱいに表示され、地図は左右でつながります。拡大・縮小は + と − のボタン、Control キーまたは Command キーとホイール (トラックパッドのピンチ)、2本指、+ と − のキーでできます。ドラッグで動かせます。

### 表示するもの

| 属性 | はたらき |
|---|---|
| `group` | 表示するグループ。`all` (初期値)、1つの id、またはカンマ区切りの複数。 |
| `off` | `group` を指定しないとき、最初は表示しないグループ (`starlink` など)。読み込みは済んでいて、チップを1回押すと表示します。 |
| `colour-by` | `group` (初期値) または `plane`。`plane` ではグループの軌道面ごとに色が変わります (12色を順に使います)。 |
| `plane` | 軌道面の文字 (`A`)。表示中の1つのグループのその軌道面だけを表示します。 |
| `footprint` | 選んだ衛星の可視範囲 (カバーする円) を描きます。表示中の衛星が80機以下なら、そのすべてを描きます。`footprint-elevation` は円を求める最低仰角で、初期値は25度 (3D のビームと同じ) です。 |
| `track` | 選んだ衛星の地上軌跡を描きます。1周分で、後ろは破線、前は実線です。時計に合わせて動きます。 |
| `selected` | 選んだ衛星の NORAD 番号。 |
| `shade` | `off` で夜の側を描きません。 |
| `dot-size` | 点の幅 (ピクセル)。 |
| `controls` | `none`、または `centre zoom footprint track chips` のいくつか。組み込みのボタンと絞り込みチップです。初期値はすべて。ページが自分で操作部を作るときは `none` にして属性を操作します。 |
| `lang` | `en` または `ja`。初期値はページの言語です。 |

絞り込みチップは凡例も兼ねます。2つ以上のグループを読み込んでいるときはグループのチップ (衛星の数つき、それぞれ切り替え式)、1つのグループを軌道面で色分けして表示しているときは軌道面のチップ (`すべて`、`A`、`B`…と数) です。チップを押すと `chikyu-flat-filter` が `{ groups, plane }` つきで送られるので、読者が求めたグループをページが読み込めます。`planes` プロパティは読み込んだすべてのグループの軌道面 (`group`、`id`、`count`、`raanDeg`、`colour`) の一覧で、変わるたびに `chikyu-flat-planes` が送られます。`facts(id)` は読み込んだグループの `groupFacts`、`groups` は読み込んだものの一覧です。

### 時計

`time`、`speed`、`paused` は `<chikyu-space>` と同じように働き、属性でもプロパティでも設定できます。

- `time` は `now` または ISO 形式の日時です。指定しなければ現在の時刻に合わせて動きます。ミリ秒の数値 (または `Date`) をプロパティに入れるとその時刻へ移り、点はすぐに置き直されます。
- `speed` は 1 が実時間、0 が停止、86400 が1秒で1日、負の値は逆向きです。
- `paused` は速さを保ったまま時計を止めます。止めている間は何も描きません。
- `chikyu-timechange` は `{ time, running, paused }` を含み、1秒に最大4回送られます。

時間が進んでいる間は、衛星が半ピクセル動くたびに描き、最大で毎フレーム (1秒に60回)、最低でも1秒に1回描きます。動きを減らす設定の読者には1秒に1回です。実時間の60倍までは、すべての点を SGP4 で置きます (グループ全体で1秒に1回計算し、その間は補間します)。それより速いと SGP4 を毎フレーム実行できないため、少し前に SGP4 が求めた位置から軌道に沿って各点を進め (グループの一部を毎フレーム計算し直します)、その位置で終わる**尾**として描きます。ちらつかず、軌跡として見えます。`trails="off"` なら通常の点です。選んだ衛星は毎フレーム SGP4 で正確に置きます。止まっているとき、画面の外にあるとき、非表示のタブでは何も描きません。時計を止めている間は、フレームの要求も、タイマーもありません。表示が戻ったときに1回だけ描きます。

### 衛星を選ぶ

ポインターが点の上を通る、点をタップまたはクリックする、キーボードで選ぶと、`chikyu-flat-pick` が `{ id, index, group, name, plane, altitudeKm, via }` つきで送られます。`via` は `hover`、`tap`、`key` のどれかで、何もない所をタップすると `id: null` が送られ、選択が解除されます。キャンバスはキーボードフォーカスを受け取ります。矢印キーで地図の左から右の順に次の点へ移り、Page Up と Page Down で10個ずつ飛び、Enter で選び、Escape で解除します。点の名前は読み上げ領域に出力し、点のそばにも表示します。`pick(id)` はコードから、イベントを送らずに選びます。`placeOf(id)` は衛星の画面上の位置を返します。

### 見た目

海、陸、輪郭、夜の色は、カスタムプロパティ `--chikyu-flat-sea`、`--chikyu-flat-land`、`--chikyu-flat-line`、`--chikyu-flat-night` で決めます。`--chikyu-flat-aspect` (2 / 1) と `--chikyu-flat-aspect-narrow` (幅 600 px 未満では 4 / 3) で地図の形、`--chikyu-flat-radius` で角の丸みを決めます。要素に高さを与えると、地図はそれいっぱいに広がります。

## 処理の負荷

すべて、渡された軌道要素からブラウザの中で計算します。通信もサーバーもなく、時計を止めている間はタイマーもありません。2つのキャンバスは、画面がどうであっても600万ピクセル以内、1辺4096以内に収めます。開発に使った Mac では、スターリンク1万1千機とほかのグループを合わせた1万2千個の点が、実時間の600倍、1秒60フレーム、尾つきで、CPU で描くブラウザでも1フレーム約6〜9ミリ秒でした。
