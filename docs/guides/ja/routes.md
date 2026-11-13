---
title: "2 つの場所のあいだの距離と経路"
section: how-to
order: 20
description: "大圏距離と、地球の本当の形で測った、より正確な距離、方位、およその飛行時間、そして地球儀に描く線。"
---

`<chikyu-earth>`、`<chikyu-earth-realistic>`、`<chikyu-space>` は、2 つの場所のあいだの経路を描けます。線は、設定するまで出ません。

```html
<chikyu-earth route="139.6917,35.6895,-0.1275,51.5072"></chikyu-earth>
```

| 属性 | プロパティ | 意味 |
|---|---|---|
| `route` | `route` | 2 つの場所を `経度,緯度,経度,緯度` で書きます。属性がないとき、またはプロパティが `null` のときは、線を描きません。プロパティを設定すると属性に書き込まれます。 |

- **2 つの距離。** `routeInfo.kilometres` は、WGS84 の測地線 (Vincenty の式) で、地球の本当の形の上の正確な距離です。`routeInfo.greatCircleKm` は、半径 6371.0088 km の球の上の大圏距離で、都市の距離と同じ球です。東京からロンドンまでは、この 2 つが約 24 km 違います。
- **方位。** `initialBearing` と `finalBearing` は、北から時計回りに測った角度で、出発点と到着点の値です。
- **飛行時間。** `flightHours` は、測地線の距離を時速 900 km (`FLIGHT_SPEED_KM_H`) で割ったものです。風も、上昇も、待ち時間もない、ジェット機の巡航の見積もりです。
- **線。** 線の地球儀では、国の上に描く線で、日付変更線で分かれるので、地図の端から端へ一本で渡りません。リアルな地球と宇宙の見た目では、地球といっしょに回る線分の列で、経緯線と同じ種類の線です。経路を設定したときだけ描きます。止まっているあいだは、描き直しません。
- **平らな世界地図はない。** このパッケージの平らな絵は線の地球儀で、球を正面から見たものです。平らな世界地図ではありません。日付変更線で分ける `routeRuns` は、自分の平らな地図に経路を描くページのためのものです。

同じ計算は、ページがなくても使えます。

```js no-run
import { routeLeg, routePoints } from "@johnmorrisdotca/chikyu-earth";

const tokyo = { lon: 139.6917, lat: 35.6895 };
const london = { lon: -0.1275, lat: 51.5072 };
const leg = routeLeg(tokyo, london);
console.log(leg.kilometres.toFixed(0), leg.flightHours.toFixed(1));
console.log(routePoints(tokyo, london, 8).length);
```
