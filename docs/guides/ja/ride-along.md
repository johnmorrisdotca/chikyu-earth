---
title: 人工衛星や惑星といっしょに動く
section: how-to
order: 9
description: カメラを ISS、Starlink 衛星、月、惑星に載せて、そこから地球を見ます。動くにつれて、地球が下で回り、流れていきます。軽さを保つ制限もあります。
---

`<chikyu-space>` では、動く天体にカメラを載せて「いっしょに動く」ことができます。カメラは、表示している日時のその天体の本物の位置にあり、地球を見ています。ISS からは、足の下を地球が流れていき、約93分で地球を1周します。月からは、地球は地球の半径の10倍離れた (本当の縮尺では60倍) 球で、1日に1回転します。宇宙の表示が必要で、衛星の場合は衛星のグループも必要です ([地球儀に人工衛星を表示する](satellites.md)を見てください)。

## 1つに乗る

ページです。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Riding along with the ISS</title>
  </head>
  <body>
    <chikyu-space time="2026-11-02T12:00Z" speed="60" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

そのスクリプトです。`ride` には、天体の名前 (`"Moon"`、`"Mars"` など) か、衛星 `{ group, index }` と、いくつかのオプションを渡します。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// One downloaded element set of the ISS (see the satellites guide for where to get them).
const iss: ElementSet = {
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

const space = document.querySelector("chikyu-space")!;
space.setSatellites("stations", createSatellites([iss]));
// The camera sits at the ISS, tipped towards the horizon, and the Earth goes by beneath it a minute a second.
space.ride({ group: "stations", index: 0 }, { view: "from", look: "horizon" });
space.addEventListener("chikyu-ride-lost", () => console.log("the elements are too old for this date"));
```

- `view: "from"` (初期値) は、カメラを天体の位置に置いて地球を見ます。進む方向が画面の上になります。`view: "follow"` は、天体の後ろに一定の距離 (`distanceKm`。衛星は3000) を保ち、その天体のほうを見ます。惑星の場合の距離は、ズームで決まります (デモの「見る天体」の行と同じです)。
- `look: "down"` (初期値) は、地球の中心を見ます。`look: "horizon"` は、地平線が真ん中より少し上に来るまで、カメラを前に傾けます。ドラッグすると、首をふるように見回せます (右にドラッグするとカメラが左を向き、上にドラッグするとカメラが画面の下のほうを向くので、地面がポインターについてきます)。`horizon` では、カメラは水平を保ちます。横にドラッグすると、その場の鉛直 (地球の中心と天体を結ぶ線) を軸に、360度ぐるりと見回せます。上下にドラッグすると、真下から地平線の20度上まで傾くだけで、ロール (横の傾き) は起きません。ズームで視野が狭くなります。要素は、ドラッグ、ピンチ、ホイール、キーを自分で持っています。天体に乗って見ている間は、ズームを 0.5 から 6 に自分で保ちます (乗るのをやめると元の範囲に戻ります。自分で付けた `zoom-min` と `zoom-max` はそのままです)。
- `ride` をもう一度呼ぶと、**なめらかに切り替わります**。カメラは、いまの場所から1秒ちょっとかけて移動します (`smooth: false` のときと、動きを減らす設定の人には、一瞬で切り替わります)。`ride(null)` で止まります。
- 時間はページの時計です。`speed` で、速くも遅くも、逆向きにもできます。乗っている衛星は正確に (1フレームに SGP4 を1回) 計算するので、衛星のグループが隠れる速さでも、位置は正しいままです。
- `chikyu-ride` は変更をページに伝えます。`chikyu-ride-lost` は、この日付ではその衛星の位置を出せない (軌道要素が古すぎる) ので、ふつうのカメラに戻ったことを伝えます。`element.riding` は、いま乗っているものを返します。

宇宙の表示に目印はありません。`attachMarkers` の場所は、平面の地球儀とリアルな地球儀のものです。

## 衛星をモデルとして追う

`space.ride(ref, { view: "follow" })` は、衛星から一定の距離を保ってそれを見つめ、その下では地球が回りながら流れていきます。モデルがあれば、衛星はもう点ではありません。**パッケージはモデルを同梱しません**。モデルはページが用意し、ページがモデルを用意した衛星を追っているときは、そのモデルが画面の真ん中に固定され、形が見分けられる大きさで、実際に飛ぶ向きに向けて、本物の太陽の向きの光で描かれます。モデルのない衛星は点のままです。

```ts no-run
import { setSatellitePainter } from "@johnmorrisdotca/chikyu-earth/space/element";
import type { SatellitePainter } from "@johnmorrisdotca/chikyu-earth/space";

const painter: SatellitePainter = {
  has: (norad) => norad === 25544, // the ISS
  make: async (three, norad) => {
    const group = new three.Group(); // your model, scaled to a radius of 1 about the origin
    return { object: group, light: (toSun) => undefined, dispose: () => undefined };
  },
};
setSatellitePainter(painter);

const space = document.querySelector("chikyu-space")!;
space.ride({ group: "stations", index: 0 }, { view: "follow" });
console.log(space.largeSatellites().map((one) => one.name), space.followNext()?.name);
```

- **モデルの軸。** モデルは、中心を原点とする半径1で、長い軸が +x (衛星の飛ぶ向き)、上 (宇宙に向いた側) が +z、左が +y です。ビューは、これを衛星の実際の飛行方向に向け (`satelliteAxes`)、中心を衛星の位置に置きます。
- **大きさ。** 画面上の半径は、カメラがどの距離にあっても、ビューの高さの17パーセントです (`MODEL_RADIUS_SHARE`、`modelRadius`)。ただし本当の大きさより小さくはならないので、カメラが近づいたときは、本当の大きさで見えます。
- **太陽。** `light(toSun)` には、描くたびに、衛星から太陽へ向かう単位ベクトルがシーンの軸 (x は春分点の向き、y は北) で渡されます。モデル自身の向きは `object.matrix` に入っています (ビューが設定し、`matrixAutoUpdate` は切ってあります)。光を1つ持つモデルは、この行列の列から、モデルの軸での太陽の向きを求められます。`update({ toSun, ms, radiusPx })` には、半径が何ピクセルあるかが渡されるので、より精細な画像を読み込む価値があるかどうかの判断に使えます。
- **どの衛星か。** `has(noradId)` は、NORAD 番号 (`25544` は ISS、`48274` は天宮、`20580` はハッブル) で、モデルがあるかどうかを答えます。`make` はすぐ答えても、あとで答えても (`Promise`) かまいません。`null` はモデルなしです。追わなくなった衛星のために作ったモデルは、解放されます。
- **一覧と切り替え。** `space.largeSatellites()` は、いま設定されている群のうち、モデルがある衛星を、ページの言語の名前つきで挙げます。`space.followNext(step = 1)` は、次の衛星 (`-1` なら前の衛星) を追って、その衛星を返します。最後の衛星の次は最初の衛星に戻ります。`stats.followModel` には、直前の描画でのモデルの中心の画面上の位置が入り、描いていないときは `null` です。
- **止まっているとき。** モデルは絵の一部です。時計が止まりビューが動かないあいだは、何も描き直しません。次の衛星へ移るときの動きはビュー自身のもので、1秒ちょっとです (動きを減らす設定の人には、ジャンプします)。

デモでは、見た目を確かめられるよう、仮のモデル (`demo/station-models.ts`。ISS、天宮、ハッブルの形に見立てた箱と円柱) を描きます。実物の写真や図ではありません。NASA 自身の ISS のモデルはパブリックドメインです。ページの作者が作ったモデルや、ページが再配布できるライセンスつきのモデルを用意するのは、ページの側です。

## カメラを数字で

カメラがどこを向くかの計算は、ブラウザーの要らない純粋な関数 `ridePose` です。次は、420 km 上空で -z の向きに進み、地平線のほうに傾けたカメラの例です。

```js
import { ridePose } from "@johnmorrisdotca/chikyu-earth/space";

// Where a camera riding along with the ISS looks: 420 km up over the +x axis, going along -z, tipped towards the horizon.
const pose = ridePose({ position: [1.066, 0, 0], velocity: [0, 0, -7.66], look: "horizon", yaw: 0, tilt: 0, zoom: 1 });
console.log(`The horizon is ${pose.earthRadiusDegrees.toFixed(0)} degrees from straight down; the camera looks ${pose.forward.map((n) => n.toFixed(2)).join(", ")}.`);
```

## 制限 (軽さのために)

乗っているあいだは絵が動き続けるので、1行ずつテストしています (`e2e/ride.gl.ts`)。

- 描画は、絵が1ピクセル動くごとに、1秒に1〜30回で、それ以上はしません。止まっているとき (一時停止のとき、移動が終わったあと) は、何も描かず、フレームも要求しません。
- 動きを減らす設定の人には、1秒に1回の更新で、なめらかな移動の代わりに一瞬で切り替えます。
- 画面の外や隠れたタブでは、時計がどんなに速くても、何も描きません。
- なめらかな移動は約1.2秒で、そのフレームも同じ上限に収まります。
- WebGL のコンテキストは1つで、乗ることで増えるバッファーやテクスチャーはなく、乗るのをやめるか要素を取り除くとすべて解放されます。コンテキストが失われても、乗ったまま戻ります。

数値は [docs/ride-along.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/ride-along.md) にあります。
