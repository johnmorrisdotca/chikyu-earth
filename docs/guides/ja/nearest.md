---
title: "場所にいちばん近い衛星"
section: how-to
order: 21
description: "地上の場所、空の方向、または別の衛星にいちばん近い衛星と、2 つの衛星が次に近づくとき。"
---

`@johnmorrisdotca/chikyu-earth/satellites` の `nearest` と `within` は、SGP4 がすでに出す位置 (`exact`) から答えます。1 回の呼び出しで、各衛星を 1 回だけ置きます。それ自身では繰り返さず、ページが頼むまで何も描きません。

```js no-run
import { nearest, within } from "@johnmorrisdotca/chikyu-earth/satellites";

const date = Date.now();
const near = nearest(stations, { place: { lon: -0.13, lat: 51.51 } }, { date, by: "space", count: 5 });
console.log(near[0].name, near[0].distance.kilometres.toFixed(0));
const overhead = nearest(stations, { place: { lon: -0.13, lat: 51.51 } }, { date, by: "sky", count: 3 });
console.log(overhead[0].angle.toFixed(1));
```

| | 初期値 | 意味 |
|---|---|---|
| `by` | `"space"` | `"space"` はキロメートルです。`"sky"` は角度 (度) です。 |
| `count` | 5 (`NEAREST_COUNT`) | 近い順に、いくつ返すかです。 |
| `within` | 制限なし | これより遠いものを除きます。`"sky"` のときは度、それ以外はキロメートルです。 |
| `date` | 必須 | 時刻です。Unix 元期からのミリ秒です。 |

- **場所。** `{ place: { lon, lat } }` と `by: "space"` は、斜めの距離です。真上の衛星までの距離は、その高さです。`by: "sky"` は、真上からの角度です。
- **方向。** `{ azimuth, elevation, observer }` と `by: "sky"` は、その方向からの角度です。方位は北から時計回りです。
- **別の衛星。** `{ satellite: index }` と `by: "space"` は、2 つのあいだの距離です。`by: "sky"` は、`observer` から見た角度です。`observer` がなければ、相手の真下の地面から見ます。
- **確かさ。** `distance.uncertaintyKm` は、軌道要素の時刻で 1 km、そこから 1 日ごとに 1 km 足します。このパッケージの粗い目安で、公表された誤差ではありません。
- **次に近づくとき。** `closeApproach(group, a, b, from, to)` は、60 秒ごと (または指定した間隔、最短 1 秒) に見ます。1 回の見本で 2 回置きます。不確かさは、前後の見本がどれだけ遠いかです。
- **かかる量。** 1 回の呼び出しで、衛星 1 つにつき 1 回置きます。衛星 1 つ (2026-11-09 の要素の ISS) で 0.15 ms でした。数千でも 1 秒の程度です。タイマーでは呼ばないでください。
- **地球儀の上。** `<chikyu-space>` の `ringSatellites` は、渡した衛星に輪と名前を付けます。名前を付けるグループと同じ輪で、1 回描いて、そのあとは止まります。デモは、衛星を選ぶと近い 5 つを書き、輪を付けます。
