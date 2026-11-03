---
title: 本物の太陽・惑星・冥王星・衛星
section: how-to
order: 10
description: wakusei-planets を使って、宇宙の表示で太陽・惑星・冥王星・衛星を、リアルな見た目か表面の地図で描きます。ページの WebGL は1つのままです。
---

何もしないと、`<chikyu-space>` は太陽・惑星・冥王星を、本来の色の単色の球で描きます。[wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets) (任意の依存、0.5.0 以降) を使うと、本物のように描けます。縞のある木星、輪のある土星、明暗のある火星、光の輪のある太陽。惑星にズームすると、表示している日時の位置に衛星も出ます。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { setBodyPainter } from "@johnmorrisdotca/chikyu-earth/space/element";
import { painter } from "@johnmorrisdotca/wakusei-planets/painter";

setBodyPainter(painter);
```

最初の `<chikyu-space>` が接続する前に `setBodyPainter` を呼びます。見た目は `bodies` で選びます。

```html
<chikyu-space time="2026-11-02T12:00Z" speed="0" bodies="painted"></chikyu-space>
```

- `bodies="realistic"` (ペインターがあるときの標準): 天体ごとの本当の色と地形から陰影をつけます。
- `bodies="painted"`: NASA・USGS・JPL の表面の画像 (パブリックドメイン) を使います。土星の輪はカッシーニの画像です。画像が届くまでは、陰影つきの見た目を出します。
- `bodies="plain"`: 単色の球です。ペインターがあっても、衛星は出ません。

衛星は、惑星が数ピクセルの大きさになると周りに出て、カメラが離れると消えます。`element.zoomFor("Jupiter-moons")` は、惑星と近くの衛星が見えるズームです (`Saturn-moons`、`Mars-moons`、`Uranus-moons`、`Neptune-moons`、`Pluto-moons` もあります)。先に `element.body = "Jupiter"` にしてください。地球の月は、これまでどおり NASA の地図で描きます。惑星や月に「いっしょに動く」ときも、同じ天体が見えます。

負荷は抑えています。ペインターは、ページがすでに渡した three.js (共有レンダラー、WebGL は1つ) で描き、描くのはビューが頼んだときだけです。画面で大きいときだけ細かい画像を取り、小さくなったら手放します。衛星は視野から出て4秒で手放し、要素が消えるときはすべて解放します。`element.stats.bodies` には、ペインターが作った天体の数 (`painted`) と、出ている衛星の数 (`moons`) が入ります。`setThreeLoader` で渡す three.js の一部には、wakusei-planets が使う部品 (`AdditiveBlending`、`DataTexture`、`NoColorSpace`、`PlaneGeometry`、`RGBAFormat`、`RingGeometry`、`SphereGeometry`、`TextureLoader`、`Vector2`) も必要です。デモの `three-subset.ts` に一覧があります。

## 自分のペインター

`setBodyPainter` は、どんな `BodyPainter` も受け取ります。`make(three, name, context)` は、半径1のオブジェクト (またはその Promise) を返します。`update({ toSun, ms, radiusPx })`、`billboard`、`dispose` は省略できます。`moons(planet, ms)` を付けると、惑星の衛星の位置 (惑星の半径が単位) を教えられ、`looks` で `bodies` に使える名前を伝えます。位置、大きさ、光はビューが決め、ペインターは描くだけです。
