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
| `track` | 選んだ衛星の地上軌跡を描きます。1周分で、後ろは破線、前は実線で、**衛星に日が当たっているところは琥珀色、地球の影に入っているところは青**で描き、色の凡例が付きます。時計に合わせて動きます。 |
| `selected` | 選んだ衛星の NORAD 番号。 |
| `shade` | `off` で夜の側を描きません。 |
| `look` | `map` (初期値: 描いた国の地図) または `photo` (NASAの地球の写真。下を参照)。 |
| `borders` | `off` で写真の上の国境線を描きません。初期値は薄くて細い線です。 |
| `texture-base` | 画像を配信する場所。`<chikyu-earth-realistic>` と同じです。初期値はコードの隣にあるこのパッケージの `textures/` フォルダです。 |
| `max-texture` | 読み込む画像の最大の幅。4096まで (メモリ 2 GB 以下と報告する端末では 2048)。 |
| `dot-size` | 点の幅 (ピクセル)。 |
| `controls` | `none`、または `centre zoom footprint track chips key` のいくつか。組み込みのボタン、絞り込みチップ、凡例です。初期値はすべて。ページが自分で操作部を作るときは `none` にして属性を操作します。 |
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

ポインターが点の上を通る、点をタップまたはクリックする、キーボードで選ぶと、`chikyu-flat-pick` が `{ id, index, group, name, plane, altitudeKm, sunlit, bearingDeg, ascending, via }` つきで送られます。`via` は `hover`、`tap`、`key` のどれかで、何もない所をタップすると `id: null` が送られ、選択が解除されます。キャンバスはキーボードフォーカスを受け取ります。矢印キーで地図の左から右の順に次の点へ移り、Page Up と Page Down で10個ずつ飛び、Enter で選び、Escape で解除します。点の名前は読み上げ領域に出力し、点のそばにも表示します。`pick(id)` はコードから、イベントを送らずに選びます。`placeOf(id)` は衛星の画面上の位置を返します。`stateOf(id)` と `selectedState` は、衛星が地上のどこにいて、どちらへ進み、太陽が当たっているかを `{ lat, lon, heightKm, bearingDeg, ascending, sunlit }` で返します。表示している時刻について SGP4 で正確に求めた値で、選択イベントで送られる値と同じです。

### 凡例と、自分で名前を言う印

地図の下には凡例 (`key`) があり、いま地図に描いている印をすべて、小さな絵といっしょに英語か日本語で示します: **太陽が真上にある場所** (黄色い点。太陽が真上に来る地球上の点で、夜の側を表示しているとき)、**自分の場所** (白いひし形。`home-lon` と `home-lat` を渡したとき)、**衛星** (色がグループを表すのか軌道面を表すのかも)、**うすい衛星** (軌道データが古く、場所は推定です。あるときだけ)、**選んだ衛星** (その輪)、**可視範囲** (その衛星が見える範囲。表示中のみ)、**日なたと地球の影の中の地上軌跡** (表示中のみ)、**夜の側** (写真の表示では「暗くなり、街の明かりが見えます」)。描いていないものは凡例に出ません。凡例は地図の下に並ぶ文字で、地図の上には重なりません。幅 600 px 以上の地図では開いていて、それより狭い地図 (スマートフォン) では **凡例** ボタンを押すまで閉じています。コードからはプロパティ `keyOpen` で切り替えます。開いている間は軌跡の2色も凡例に載るので、地図の上の凡例は出しません。`controls="centre zoom"` のように `key` を除くと凡例は出ません。

地図そのものの絵に描かれた2つの印は、自分で名前を言います。

- **太陽の点**は「ここは太陽が真上にある場所です：大西洋の上、南緯23° 西経15°」、**自分の場所**は「自分の場所：日本、北緯36° 東経140°」と言います。場所は、その点がある国 (描いたとおりの Natural Earth の輪郭) か、なければ最も近い大洋・海・湾で、位置は整数の度です。
- **指す、押す、キーボードで選ぶ。** マウスを印に重ねると横に名前が出ます。タップやクリックでは名前がそこに残り (指ではホバーできないため)、ほかの場所をタップするか Escape を押すまで続き、読み上げもされます。Tab キーで地図から太陽の点、次に自分の場所へ進みます (それぞれ印の上に重ねた、ポインターを受けないボタンなので、印の上から始めたドラッグでも地図は動きます)。Enter で押します。
- **`chikyu-flat-mark`** は押したときに `{ mark: "sun" | "home", name, text, lon, lat, place, via }` つきで送られます。`via` は `tap` か `key`、`place` はその点がある場所の名前 (なければ null) です。たとえば、ページがその場所へ地図の中心を動かすのに使えます。

写真の表示でも印は読めます。太陽の点には暗い縁と薄い輪、ひし形には暗い縁がつきます。

### 日なたと影

地上軌跡は2色で描かれます。**衛星に日が当たっているところは琥珀色、地球の影に入っているところは青**です。暗い縁取りの上に重ねるので、暗い海でも明るい海でも読めます。衛星の後ろの部分は破線、前の部分は実線のままで、軌跡を描いている間は、2色の凡例が地図の下に出ます。琥珀色と青は色相だけでなく明るさも違うので、赤と緑の区別がつきにくい人にも読めます。影は、円錐ではなく、地球の円柱形の影です (意味と試験の方法は[人工衛星や惑星といっしょに動く](ride-along.md)を参照)。衛星は日なたか影かのどちらかで、半影はありません。ほかの色にしたいページは、`--chikyu-flat-track-sun` と `--chikyu-flat-track-shadow` を設定します。`/passes` の `groundTrack(set, from, to)` も、軌跡の各点に `sunlit` を付けて返すので、自分で軌跡を描くページにも使えます。

### 写真の表示

`look="photo"` にすると、描いた国の代わりに NASA の地球の写真 (ブルーマーブル) が地図に敷かれます。`look="map"` または属性なしは今までどおりの描いた地図なので、写真を指定しないページは何も変わりません。プロパティ `look` でも同じことができ、`controls="centre look"` にすると、地図の操作の列に **地図 / 写真** のボタンが加わります (初期値には入っていないので、指定しないページにボタンは増えません)。`lookState` で状態がわかります: `map`、`loading` (画像が届くまでは描いた地図を表示)、`photo`、`failed` (画像を取得できなかったとき。描いた地図のまま)。どちらかが変わると `chikyu-flat-look` が `{ look, state }` つきで送られます。

```js no-run
const flat = document.querySelector("chikyu-flat");
flat.setAttribute("look", "photo"); // 描いた地図に戻すには: flat.setAttribute("look", "map")
flat.setAttribute("texture-base", "/textures/"); // このパッケージの textures/ フォルダを置いた場所
```

- **3Dの地球と同じ画像です。** 昼と夜の画像は `<chikyu-earth-realistic>` が読み込むファイル (`textures/day-*.webp` と `night-*.webp`。NASA Earth Observatory のブルーマーブルとブラックマーブルで、パブリックドメイン。条件は `NOTICE.md`) です。写真の表示中は、そのクレジットが地図の隅に出ます。
- **地図とぴったり重なります。** 画像は地図と同じ投影 (正距円筒図法で、左端が経度 -180) で、中心、拡大、日付変更線でのつながりにピクセル単位で合います。衛星、可視範囲、地上軌跡、太陽と自分の場所の印は、描いた地図と同じ場所にのります。衛星には暗い縁、可視範囲には暗い縁取りがつくので、雲の上でも砂漠の上でも読めます。
- **昼と夜。** 地図が夜を示す場所では昼の画像が暗くなり、夜の画像の街の明かりが、時計が示す時刻の太陽の高さ 15 度から地平線の下 7 度にかけて、境界線をまたいで点灯します。`shade="off"` ならどこも昼の画像です。
- **負荷。** 画像は `look` が `photo` のときだけ取得します。それぞれ1つのサイズだけを持ちます (幅 1024、2048、昼だけ 4096 ピクセル。その拡大率で世界の幅のピクセル数以上になる最小のサイズ)。大きなサイズは直ちに、小さなサイズは拡大を戻して 4 秒たってから切り替えます。`look` を `map` に戻すか要素がページから外れると解放されます。キャンバスは 600 万ピクセル、1辺 4096 以内です。地図は表示範囲か太陽の位置 (0.5 度) が変わったときだけ描き、静止中、画面の外、時計を止めているときは描きません。視差効果を減らす設定の読者には、時間が進んでいる間も 1 秒に 1 コマまでです。

### 見た目

海、陸、輪郭、夜の色は、カスタムプロパティ `--chikyu-flat-sea`、`--chikyu-flat-land`、`--chikyu-flat-line`、`--chikyu-flat-night` で決めます。軌跡の2色は `--chikyu-flat-track-sun` と `--chikyu-flat-track-shadow` です。`--chikyu-flat-aspect` (2 / 1) と `--chikyu-flat-aspect-narrow` (幅 600 px 未満では 4 / 3) で地図の形、`--chikyu-flat-radius` で角の丸みを決めます。要素に高さを与えると、地図はそれいっぱいに広がります。

## 処理の負荷

すべて、渡された軌道要素からブラウザの中で計算します。通信もサーバーもなく、時計を止めている間はタイマーもありません。2つのキャンバスは、画面がどうであっても600万ピクセル以内、1辺4096以内に収めます。開発に使った Mac では、スターリンク1万1千機とほかのグループを合わせた1万2千個の点が、実時間の600倍、1秒60フレーム、尾つきで、CPU で描くブラウザでも1フレーム約6〜9ミリ秒でした。
