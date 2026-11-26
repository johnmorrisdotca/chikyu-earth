---
title: 小さな平面地図の上の衛星1機
section: how-to
order: 11
description: 選んだ衛星のいまの地点、次の一周の地上軌跡（日付変更線で分割）、夜の側を、小さな平面の世界地図に表示します。陸地は chizu のものです。WebGL は使いません。
---

`<chikyu-track>` は、衛星1機を平面の世界地図に描きます。いま衛星の真下にある点、一周分の地上軌跡（たった今飛んだ部分と、これから飛ぶ部分を2色で、日付変更線をまたぐところで分割）、指定した時刻の夜の側です。陸地と海は [chizu](https://github.com/johnmorrisdotca/chizu) の世界地図です。このパッケージは緯度と経度を計算し、chizu に渡します。WebGL は使いません。

数値だけを使う入口は別で、地図もブラウザも要りません。`trackPicture` と `nightSide` です。

## インストール

```sh
npm install @johnmorrisdotca/chikyu-earth satellite.js
```

chizu は、このパッケージがすでに依存しています。`satellite.js` (MIT、バージョン 6) は、通過の機能と同じく任意の peer 依存です。必要なのは要素と `trackPicture` だけで、`nightSide` には要りません。

## 数値

```js
import { nightSide, trackPicture } from "@johnmorrisdotca/chikyu-earth/track";

const iss = {
  OBJECT_NAME: "ISS (ZARYA)",
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
const noon = Date.UTC(2026, 10, 3, 12);
const picture = trackPicture(iss, noon, 90);
const mark = picture.some((item) => item.kind === "mark");
const night = nightSide(noon).length > 3;
console.log(`${mark ? "mark" : "none"} ${night ? "night" : "day"}`);
```

`trackPicture` は、夜の輪、地上軌跡の各区間（日付変更線で1本ずつ）、地点の印の順に返します。線の `part` は `past`（過ぎた部分）か `coming`（これから）です。夜の輪の経度は飛びません。地図の塗りが逆側まで広がらないためです。窓は、その時刻を中心にした `span` 分です。省略すると一周分です。

## 要素

```html
<script type="module">
  import "@johnmorrisdotca/chikyu-earth/track/define";
  const track = document.querySelector("chikyu-track");
  track.satellite = iss;
</script>
<chikyu-track span="90" theme="dark"></chikyu-track>
```

タグの登録には `@johnmorrisdotca/chikyu-earth/track/define` を読み込みます。`time` は `now`（既定）か ISO の日時です。時計が進むときは10秒ごとに描き、要素が画面の中にあり、タブが表示されているときだけです。要素の `satellite` 属性はカタログ番号で、軌道要素そのものは `satellite` プロパティに渡します。`span` は窓の長さ（分）です。`theme` は `light` か `dark` です。

地図の幅は240ピクセルで、陸地と海だけです。国名はありません。この入口を読み込まないページは、これを読み込みません。
