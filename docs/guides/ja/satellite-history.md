---
title: 衛星の履歴と Observe ビュー
section: how-to
order: 24
description: 打ち上げと消滅の日付、過去のどの時刻にも衛星を置く軌道要素の系列、最新の要素のあとの、不確かさを示した影つきの予測、グラフ用の各要素の平均高度、そして Observe ビュー (衛星の外から、直近の周回の軌跡とともに見る)。
---

1つの衛星には、その一生のあいだに多くの軌道要素があります。`@johnmorrisdotca/chikyu-earth/satellites` の `createSatelliteHistory(sets, options)` はそれらをすべて、打ち上げと消滅の日付とともに受け取り、その時刻に**いちばん近い要素**から衛星を置きます (SGP4。satellite.js はオプションのピア依存です)。**chikyu は何も取得しません。** 要素はページが持ってきます (入手先と規約は [地球上の衛星](satellites.md) を見てください)。サーバーでも読み込めます。

## ある時刻にどこにいたか

```js
import { altitudeSeries, createSatelliteHistory } from "@johnmorrisdotca/chikyu-earth/satellites";

// One satellite's history on a server: two element sets a week apart (your page brings them; chikyu fetches nothing), its launch and decay, and where it stands on four dates.
const set = (epoch, meanMotion, meanAnomaly) => ({
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: epoch,
  MEAN_MOTION: meanMotion,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: meanAnomaly,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
});
const sets = [set("2026-11-02T10:25:21.580320", 15.49150046, 20.6961), set("2026-11-09T10:25:21.580320", 15.50, 200)];
const history = createSatelliteHistory(sets, { launch: "1998-11-20", decay: "2031-01-01" });
for (const day of ["1998-01-01", "2026-11-05", "2026-11-20", "2031-06-01"]) {
  const now = history.describe(Date.parse(`${day}T12:00:00Z`));
  console.log(`${day}: ${now.status}${now.uncertaintyKm > 0 ? `, within ${Math.round(now.uncertaintyKm)} km` : ""}`);
}
console.log(altitudeSeries(sets).map((point) => `${new Date(point.epochMs).toISOString().slice(0, 10)} ${Math.round(point.altitudeKm)} km`).join(", "));
```

`history.describe(ms)` は、SGP4 を呼ばずに、その時刻が次の6つのどれかを答えます。

| `status` | その時刻は | 衛星は |
| --- | --- | --- |
| `before-launch` | 打ち上げの前 | 描かれません |
| `backcast` | 打ち上げのあと、最も古い要素より前 | 最も古い要素から戻して置かれます |
| `tracked` | 最も古い要素と最新の要素のあいだ | いちばん近い要素から置かれます |
| `predicted` | 最新の要素のあと | その要素から置かれ、**影つきで描かれます** |
| `decayed` | 消滅日のあと | 描かれません。`decayedMs` が落下した時刻を言います |
| `unplaceable` | SGP4 が置けない時刻 (使える要素がない、または大気圏に落ちた) | 描かれません |

打ち上げと消滅は `options.launch` と `options.decay` (`2026-11-02` のような日付、日時、またはミリ秒) から、なければ要素の `LAUNCH_DATE` と `DECAY_DATE` から、それもなければ (打ち上げのみ) `OBJECT_ID` の打ち上げ年の初めから取ります。`launchExact` は、打ち上げが与えられた日付だったかを示します。日付だけの消滅日は、その日の終わりです。SGP4 が始められない要素は除かれ、`history.refused` に載ります。残りは epoch 順に並べられます。

`history.exact(ms, out)` は位置と速度 (地球半径と km/s、宇宙ビューの軸) を `out` に入れ、状態を返します。`history.trailInto(ms, orbits, out)` と `history.trail(ms, orbits, points)` は、直近 `orbits` 周回の衛星自身の経路を返します。各点は、その点の時刻にいちばん近い要素から置かれます。

## 位置をどこまで信じるか

置かれた時刻にはどれも `uncertaintyKm` があります。いちばん近い要素からの日数 `d` に対する位置の不確かさの宣言で、`baseKm + kmPerDay * d + kmPerDaySquared * d * d`、既定では 1 km、1日 3 km、1日の2乗 1.5 km です (`DEFAULT_UNCERTAINTY`、`predictionUncertaintyKm(days, model)`。`uncertainty` オプションで変えられます)。要素から離れるほど、前でも後でも大きくなり、どちら向きでも**同じ値**です。NASA/JPL Horizons との実測から決めました。2026年11月2日に記録した ISS の要素1つから置いた ISS は、Horizons の ISS から 5.6、7.6、9.6、11.6 日で 25、59、108、168 km 離れていました (地球の中心から見た赤経、赤緯、距離。各限度は 1.4 から 2.5 倍の余裕で成り立ちます)。これは抗力の大きい低軌道なので、高い軌道にとってはこの値は上限であり、予報ではありません。軌道を上げた衛星や機動した衛星はもっと外れますが、それは起きる前の軌道要素には言えません。

## 宇宙ビュー

`<chikyu-space>` の `setSatelliteHistory(id, history)` は `createSatelliteHistory` が作ったものを受け取り (要素自身は satellite.js を読み込みません)、衛星をグループ `history:<id>` (インデックス 0 の1機) として設定します。時計が示すどの時刻でもいちばん近い要素から置かれ、打ち上げの前と落下したあとは省かれ、**最新の要素のあとは影つきで描かれます** (推定と同じ影つきで、`info`、`placeSatellite`、イベントの `estimated` が true になります)。`satelliteHistory(id)` は履歴を返すので、`describe(ms)` でページが「打ち上げ済み」「予測、40 km 以内」「2024-03-02 に落下」と言えます。`setSatelliteHistory(id, null)` で外します。

## Observe ビュー

`observe(id, options)` は、カメラを**衛星の外**に置き (follow ビュー、既定では 3000 km 後ろ。ページがモデルを設定していればそれを使います)、地球が回って足もとを滑っていくところを見せ、衛星の**直近 `orbits` 周回の軌跡** (0.25 から 20、省略すると 3) を後ろに1本の線として描きます。軌跡は衛星自身の経路で、同じ SGP4 が、各時刻にいちばん近い要素から置きます。そのため時計がどの速さでも遡れ、まだ打ち上げられていない部分は短くなります。過去の点は1周96点の格子で保持されるので、1フレームの費用は SGP4 を1回と、窓に入ってきた点だけで、軌跡全体ではありません。時計が動くときだけ作り直し、**静止中や視界の外では何も描きません**。`observe(null)` で止まり、ほかの `ride` でも止まります。`element.observing` は表示中のものを答えます。どのグループの衛星も観察できます (`observe({ group, index })` か NORAD 番号。履歴は要りません)。同じ例をページにしたもの:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Observe view: outside a satellite, with its trail</title>
  </head>
  <body>
    <chikyu-space time="2026-11-02T20:00Z" speed="0" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatelliteHistory, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// The ISS's element sets (see the satellites guide for where to get them: your page brings them, chikyu fetches nothing).
const sets: ElementSet[] = [
  {
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
    LAUNCH_DATE: "1998-11-20",
  },
];

const space = document.querySelector("chikyu-space")!;
// The history places it from the set nearest each moment, not before its launch, shaded (a prediction) after its newest set.
const history = createSatelliteHistory(sets);
space.setSatelliteHistory(25544, history);
// Observe: the camera outside the satellite, the Earth turning beneath, and its path over its last 3 orbits behind it.
space.observe(25544, { orbits: 3 });
const now = history.describe(Date.parse("2026-11-02T20:00:00Z"));
console.log(now.status, `within ${Math.round(now.uncertaintyKm)} km`); // predicted within 2 km
```

## 各要素の平均高度

`altitudeSeries(sets)` は、使える要素ごとに1点 `{ epochMs, altitudeKm, noradId }` を古い順に返します。要素の epoch のまわりの1周で平均した高度 (SGP4 を24時刻で)、地球の平均半径 6371 km からの高さです。ステーションの軌道上げや衛星のゆっくりした落下は、グラフでは段差や傾きになります。上の例は1つ印字します。グラフはページが作ります。

## ここにないもの

軌道要素の系列は、測った軌跡ではありません。最も古い要素より前、最新の要素より後、離れた2つの要素のあいだでは、SGP4 がモデルを前や後ろに運んでおり、どこまで信じるかは `uncertaintyKm` が言います。消滅した衛星のあとの位置は返さず、パッケージは何も取得しません。
