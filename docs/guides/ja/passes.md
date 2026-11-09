---
title: ISS はいつ見える? 場所の上を通る衛星の通過
section: how-to
order: 9
description: ISS、天宮、ハッブル、そのほかの衛星が、ある場所の空を通る時刻、見る方角、明るさ、見えるかどうかを計算します。空の図、そのまま使える要素、Skyfield とどれくらい合っているかも説明します。
---

`findPasses` は、衛星が場所の上を通る次の「通過」を計算します。空に上がる時刻、いちばん高くなる時刻、地平線に沈む時刻、そのときの方角、見える明るさ、そして実際に見えるかどうかです。見えるには、衛星に太陽の光が当たっていて、見る人の空が十分に暗い必要があります。`createSatellites` と同じ SGP4 を使う純粋な関数で、DOM も時計も使わず、サーバーでも import できます。ほかに、空を横切る道すじを SVG 文字列にする `skySvg`、地球上の道すじを返す `groundTrack`、通過の一覧と空の図を表示する要素 `<chikyu-passes>` があります。

## インストール

```sh
npm install @johnmorrisdotca/chikyu-earth satellite.js
```

`satellite.js` (MIT、バージョン 6) は、人工衛星の機能と同じく任意の peer 依存です。このパッケージは軌道データを自分では取得しません。ページが渡します (入手先とルールは [地球儀に人工衛星を表示する](satellites.md) を見てください)。

## 1回の呼び出し

```js
import { findPasses } from "@johnmorrisdotca/chikyu-earth/passes";

// When the ISS crosses the sky over London, from one downloaded element set: the same answer on a server as in a page.
const iss = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-02T10:25:21.580320",
  MEAN_MOTION: 15.49150046,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: 20.6961,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
};
const day = Date.UTC(2026, 10, 3);
const [pass] = findPasses(iss, { latitude: 51.5074, longitude: -0.1278 }, { from: day, to: day + 3 * 86_400_000 }, { all: true });
console.log(`${pass.name}: highest ${Math.round(pass.highest.altitude)} degrees in the ${pass.highest.compass}, ${pass.reason}`);
```

`findPasses(sets, observer, window, options)` には、軌道要素を1つか複数、場所 (`latitude`、`longitude`、`heightM`)、時間の範囲 (`from` と `to`、Unix エポックからのミリ秒)、オプションを渡します。いちばん高い点が範囲に入る通過が一覧に入ります。初期設定では見える通過だけです。`all: true` にするとすべてが出て、見えない理由もわかります。

## 通過に入っているもの

- `start`、`highest`、`end`: それぞれ UTC の時刻 (`ms`)、方角 (北から時計回りの度数 `azimuth` と、16方位のことば `compass`、たとえば `SSE`)、地平線からの高さ (`altitude`、度)、距離です。通過とは、`minAltitude` (初期設定は10度) より上にいる間のことです。それより低いと木や建物やもやが邪魔になり、星空観察の表も10度を使います。地平線 (0度) から数えるには `minAltitude: 0` にします。高さは幾何学的な値で、大気による屈折は加えていません。
- `visible`: 実際に見える部分で、それぞれの `start`、`highest`、`end` を持ちます。見える部分がなければ `undefined` です。衛星に光が当たり、空が十分に暗く、衛星が十分に明るく、最低の高さより上にある間が見える部分です。ISS は通過の途中で地球の影に入ることが多く、その場合、見える部分は通過より先に終わります。
- `reason`: `visible` (見える)、`daylight` (通過の間ずっと空が明るすぎる)、`shadow` (空は暗いが、通過の間ずっと衛星が地球の影の中)、`faint` (光が当たり空も暗いが、暗すぎる) のどれかです。
- `sky` と `sunAltitude`: 太陽の高さから見た、見る人の空の暗さです。`day` (昼)、`civil` (市民薄明: 太陽が地平線の下6度まで)、`nautical` (航海薄明: 6〜12度)、`astronomical` (天文薄明: 12〜18度)、`night` (夜) です。初期設定では市民薄明かそれより暗ければ見える通過とし、どれだったかを通過が教えます。星空観察の表の中にはもっと暗い空だけを数えるものもあり、`sky: "nautical"` でそれと同じになります。太陽の位置はこのパッケージ自身の簡易な計算で、誤差は約0.02度です。日の出と日の入りは -0.833度としています。
- `sunlit`: 通過のうち少なくとも一部で、衛星に太陽の光が当たっています。影は、地球の赤道半径と同じ半径の円柱として計算します。
- `magnitude`: 見える部分でいちばん明るいときの等級です (見える部分がなければ、光が当たっている部分で)。数が小さいほど明るく、いちばん明るい恒星のシリウスが約 -1.5 等、金星の最大が約 -4.6 等です。衛星の標準等級 (1000 km の距離で半分に光が当たっているときの明るさ)、距離、衛星から見た太陽と見る人の間の角度から、衛星を光をむらなく反射する球と考えて出します。ISS、天和、ハッブルについては、おおよその断面積 (`ESTIMATED_CROSS_SECTIONS`。宇宙機関が公表している大きさから、約2,000、200、70平方メートル) と、仮定した反射率0.2をもとに、パッケージ自身が標準等級を計算します (`standardMagnitude`。太陽の等級 -26.74 から出します)。結果は -0.8、2.3、2.9 等です (`STANDARD_MAGNITUDES`)。これは測定値ではなくモデルです。実際の衛星は球ではなく (ステーションの大部分は太陽電池パネルで、光を反射してきらめくことがあります)、明るさは1〜2等ほどずれることがあります。自分の観測結果や、使ってよい表から得たより確かな値があれば、`magnitudes: { 25544: -1.8 }` のように渡せます。標準等級がわからない衛星には `magnitude` がなく、暗すぎるとは判定されません。`limitingMagnitude` (初期設定は4) より暗い衛星は、見えないものとして扱います。
- `elementEpochMs`、`elementAgeDays`、`stale`: 通過の時点で、軌道データがどれくらい古いかです。

`satelliteAt(set, observer, ms)` は、ある一瞬について同じことを返します。`passPath` は通過の空での道すじ、`groundTrack` は衛星の真下の地面の道すじを返します。

## 通過の正しさは軌道データの新しさしだい

通過の正しさは、軌道要素の新しさで決まります。SGP4 の誤差は1日に数 km ずつ増え、ステーションの高度を上げる作業 (ISS では1、2か月に1回ほど) のたびに、それよりずっと大きく一度に位置が変わります。そのあとでは、作業前の軌道要素は合いません。そのため、すべての通過が軌道要素の古さ (`elementAgeDays`) を持ち、2週間より古いと `stale` が真になり (`DEFAULT_DIM_AFTER_DAYS`)、軌道要素から30日より離れた通過は出しません (`maxAgeDays`)。デモは、軌道データを取得した日を一覧のそばに表示します。ISS では、少なくとも数日に1回は新しい軌道要素を取得し、取得先のルールを読んでください。

## どれくらい合っているか

2026年11月9日に CelesTrak から取得した同じ軌道要素を、このパッケージとも satellite.js ともコードを共有しない Skyfield で計算しました。数字は出典と日付つきで `test/recorded/` にあります。

- **Skyfield** 1.55 (Python の `sgp4` パッケージと NASA の DE421 を使用。`scripts/passes-reference.py` で作成): ロンドン、シドニー、キト、東京の上を10日間に通る ISS、天和、ハッブルの249回の通過。出る時刻、いちばん高くなる時刻、入る時刻はすべて Skyfield と1秒以内 (最大で0.3秒) で、通過の数も同じです。Skyfield が示す時刻での方角は0.06度以内 (真上では、わずかな位置の違いで方角が大きく変わるので比べません)、高さは0.005度以内、距離は50 m 以内、太陽の高さは0.005度以内です。747の時刻のうち、日照が違ったのは1つで、地球の影のふちから数秒以内でした。Skyfield は影を円すい形、このパッケージは円柱として扱っています。
- **手作業の比較**: 2026年11月9日に、よく使われている星空観察サイトが公表している予測とも比べました (そのサイトのデータはこのパッケージに入っていません)。高さ10度を超える249回の通過はすべてこのパッケージでも見つかり、時刻は2秒以内 (そのサイトは1秒単位です)、方角は同じ方位のことばでした。明るさにはこのような比較はなく、上のモデルによる値です。

時刻は UTC で、地球はグリニッジ平均恒星時で回るとして計算します。UTC と地球の実際の回転との小さな差 (1秒未満) は加えていません。そのぶんの差は、位置にして数百 m 以内です。

## ページで使う: `<chikyu-passes>` 要素

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Passes of the ISS over Tokyo</title>
  </head>
  <body>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/passes/element/+esm"></script>
    <!-- Your page chooses where the orbit data come from (its own file, or a source whose terms it has read); this address is an example. -->
    <chikyu-passes latitude="35.69" longitude="139.69" days="5" time-zone="Asia/Tokyo" elements-src="https://example.org/elements.json"></chikyu-passes>
  </body>
</html>
```

`<chikyu-passes>` は通過の一覧 (見える通過、または `show="all"` ですべて) と、押した通過の空の図と詳しい情報を、英語か日本語 (`lang`) で表示します。`latitude`、`longitude`、`height`、`days` (1〜14)、`sky`、`satellite` (複数の軌道要素の中から1つを選ぶ NORAD 番号)、`from` (最初の時刻。初期設定はページが最初に必要としたときの時刻で、1回だけ読みます)、`min-altitude` を受け取ります。軌道データは `elements` プロパティか、`elements-src` (この要素がページに入ったときに1回だけ読む URL。取得先に負担をかけない `fetchElements` のルールに従い、2時間以内に再び頼むことはなく、失敗した取得先はしばらく放っておきます) から渡します。この要素が定期的にデータを取り直すことはありません。時刻は、ブラウザのタイムゾーン、`time-zone` で指定したタイムゾーン (`Asia/Tokyo`)、または `utc-offset` で指定した UTC との差で表示し、UTC もそばに表示します。通過を押すと `chikyu-pass-select` イベントでその通過を知らせるので、ページは自分の図を描けます (デモは地球儀に地面の道すじを描きます)。要素の中に `<div slot="ground">` を入れると、空の図のそばに表示されます。

デモのページ [わたしの空を通る衛星](https://johnmorrisdotca.github.io/chikyu-earth/passes.html) には、地図、検索、「現在地」ボタン (ブラウザに場所を聞くのは、押したときだけで、ページを開いたときには聞きません)、そしてページの作り方ごとのコードがあります。script タグ、ES モジュール、React、Vue、Angular、Svelte、`passes-embed.html` の iframe です。

## 処理の負荷

時計やタイマーで動くものはありません。一覧は、表示しているものが変わったときに計算します。ISS の10日分で数十ミリ秒、3つの衛星ならもう少しかかります。この要素が時計を読むのは1回だけで、取得もページに追加されたときに多くても1回です。
