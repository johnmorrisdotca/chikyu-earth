---
title: 全画面表示、星に対して止めたカメラ、すべての人工衛星
section: how-to
order: 9
description: リアルな地球を画面いっぱいに出し、カメラを星に対して止めて、地球がその下で回り、昼夜の境目が太陽の本当の位置に出るようにします。人工衛星の全グループも、描画の予算内で一度に表示できます。
---

`<chikyu-earth-realistic>` は、宇宙から見た地球です。このガイドは、地球を画面いっぱいに出したいページに必要な3つのことを説明します。全画面の表示、カメラの止め方の選択、地球の上に描く人工衛星です。どれも使わなければ負担になりません。デモの `fullscreen.html` が、この3つをすべて150行ほどで見せています (`demo/fullscreen.ts`)。

## 全画面: `immersive`

```html
<style>
  chikyu-earth-realistic { position: fixed; inset: 0; width: 100%; height: 100%; }
  body { margin: 0; background: #04060c; }
</style>
<chikyu-earth-realistic immersive camera="space" texture-base="/textures/"></chikyu-earth-realistic>
```

- 要素は、どんな形の枠でも、その枠いっぱいに広がります。地球は短い辺に収まり、大気の光も枠の内側に入るので、横長のデスクトップでも縦長のスマートフォンでも、全体表示で光が切れません。
- ふつうのホイールで拡大・縮小し、ページはスクロールしません。要素のどこでもドラッグすると向きが変わり、タッチ画面では、指1本のドラッグがスクロールではなく回転になります。Ctrl (Command、Alt) を押したホイール、ピンチ、キー、そのほかの操作は、これまでどおり kazoku-ui のものです。`immersive` で手放すのは、ホイールでの移動 (パン) だけです。
- `immersive` がなければ何も変わりません。要素は正方形で、全体表示でのふつうのホイールはページをスクロールし、ドラッグは正方形の中で回転します。
- バーを付けるには、`<kazoku-view-controls for="...">` を置き、デモのように、バーの `kazoku-viewchange` を `setView` に渡します。ホイールの拡大・縮小は、その表示を受け持つ側 (要素自身か、つないだバー) に渡るので、バーの上限・下限や数値の表示と食い違いません。

ページは、このシリーズ共通のルールも守ります。時計は「今」から動き出す状態で開き (`speed="3600"`、1秒で1時間)、動きを減らす設定の人には、止まった表示で「再生」を押せる状態にします。ページが見せる時刻は、その端末の時刻です。

## カメラ: `ground`、`space`、`sun`

`camera` 属性 (とプロパティ) は、カメラの止め方を決めます。`center` は、カメラが見る場所です。

| `camera` | カメラの止め方 | 見え方 |
|---|---|---|
| `ground` (既定) | `center` が示す地上の場所の上 | 地球は動かず、時計が光、夜の側、雲を地球の上で動かします |
| `space` | 星に対して止める。カメラを設定した時点の `center` が見える向きにする | 時計が進むと、地球がカメラの下で回ります (360度を23時間56分で)。昼夜の境目は、太陽が実際にある場所にあり、1日に1度ほど動きます |
| `sun` | 太陽の側に止める。`center` は、太陽が真上にある場所からの経度と緯度です (`0,0` は正午の場所をまっすぐ見ます) | 地球がその下で回っても、昼夜の境目は画面の同じ場所にあります |

星に対して止めたカメラは、要素が読み込まれたときに設定され、`time` や `center` を設定したときにも、もう一度設定されます。別の日付に飛ぶページでは、その日付の `center` が見えるように向き直ります。ドラッグすると、止めた位置から向きが変わり、「中央」を押すと元に戻ります。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/realistic/element";
import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.querySelector<ChikyuEarthRealistic>("chikyu-earth-realistic")!;
earth.setAttribute("center", "139.7,35.7");
earth.camera = "space";
earth.speed = 3600;
console.log(earth.camera);
```

`cameraCentre` と `greenwichSidereal` (`@johnmorrisdotca/chikyu-earth/realistic` から) は、その計算だけを取り出したものです。ある時刻に地球が星に対して回っている角度と、カメラが見る場所を返します。

光と雲は、どのモードでも本物の太陽と本物の時刻をもとに描きます。動くのはカメラだけです。

## 地球の見た目

リアルな地球は、パッケージがすでに持っている NASA の画像 (Blue Marble、Black Marble、雲の画像、水域の画像。`NOTICE.md` を参照) に陰影をつけて描きます。新しいデータは使いません。

- **大気。** 縁に細く明るい層があり、その外に広く淡い光のにじみがあります。昼の側は青、昼夜の境目は橙色で、夜の側では消えていきます。
- **昼夜の境目。** 太陽が低くなるほど赤みを帯び、明るい側には暖色の帯が、境目の向こう側にはブルーアワーの青みがあります。
- **海。** 澄んだ青で、太陽の真下には鋭い反射、そのまわりには広い照り返しがあり、浅い角度で見る縁では空が映ります。雲があると反射は隠れます。
- **雲** は地面に影を落とし、太陽が低いほど影が長くなります。
- **夜。** 街の明かりは暖かい色で、やわらかく広がり、雲がかかると暗くなります。

`light="lit"` と `light="boost"` は、これまでどおり使えます。

## すべての人工衛星を一度に

リアルな地球も、宇宙の表示と同じ呼び出しで人工衛星を描きます。ページが取得した軌道要素から `createSatellites` でグループを作り (要素の入手先は人工衛星のガイドを参照)、`setSatellites` に渡します。

```ts no-run
import { createSatellites } from "@johnmorrisdotca/chikyu-earth/satellites";
import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.querySelector<ChikyuEarthRealistic>("chikyu-earth-realistic")!;
const sets = await fetch("elements/starlink.json").then((response) => response.json());
earth.setSatellites("starlink", createSatellites(sets), { color: "#7fd4ff", size: 2.5 });
earth.addEventListener("chikyu-satellite-click", (event) => {
  console.log((event as CustomEvent).detail.info?.name);
});
```

- **1グループにつき描画は1回** です。何機入っていても同じなので、カタログの全グループを同時に出せます (デモの「すべての人工衛星」は、14グループで約4,000機です)。
- **描画の予算。** 1秒に30回まで (小さな端末や電池が少ないときはもっと少なく)、SGP4 の計算は時計の1秒に1回ほどで、その間は補間します。時計が止まっているときや要素が画面の外にあるときは何も描かず、WebGL のコンテキストはページに1つです。時計が `MAX_SATELLITE_SPEED` より速く進むときは、ぼやけるだけなので、グループを隠します。`element.stats.satellites` で、配置した衛星の数と、描画1回のうち衛星に使った時間がわかります。
- **地球の裏側。** 地球の裏にある衛星は地球に隠れ、押すこともできません。
- `showSatellites(group, on)`、`satelliteGroups`、`selectSatellite(ref)` (衛星のまわりの輪と軌道)、`selectedSatellite`、`satelliteInfo(ref)` は宇宙の表示と同じで、イベント `chikyu-satellite-click` も同じです。
- 軌道要素は古くなります。人工衛星のガイドのとおり、表示している時刻から14日以上離れたものは、うすく描きます。
- `three` として `Points` を渡す必要があります (必要な部品は、デモの `three-subset.ts` に並んでいます)。

デモの「人工衛星」の行は、リアルな見た目でも使えます。`fullscreen.html?sats=all` は、全画面の暗い表示ですべてのグループを見せます。
