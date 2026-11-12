---
title: 本物の太陽・惑星・冥王星・衛星
section: how-to
order: 10
description: wakusei-planets を使って、宇宙の表示で太陽・惑星・冥王星・衛星を、リアルな見た目か表面の地図で描きます。ページの WebGL は1つのままです。
---

何もしないと、`<chikyu-space>` は太陽・惑星・冥王星を、本来の色の単色の球で描きます。[wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets) (任意の依存、0.5.0 以降。以下の機能をすべて使うには 0.31.0 以降) を使うと、本物のように描けます。どのズームでも、天体ごとの表面の画像で描きます。縞のある木星、輪のある土星、明暗のある火星、光の輪のある太陽、そして月。惑星にズームすると、表示している日時の位置に衛星も出ます。

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

- `bodies="realistic"` (ペインターがあるときの標準): 表面の画像がある天体は、すべてその画像で描きます (ビューが `mapped` でペインターに頼みます)。画像のない一部の天体 (フォボス、ダイモス、天王星の衛星) は、本当の色と地形をもとに陰影をつけて描きます。
- `bodies="painted"`: こちらも表面の画像を使います。土星の輪はカッシーニの画像です。画像が読み込まれるまでは、陰影つきの見た目を出します。
- `bodies="plain"`: 単色の球です。ペインターがあっても、衛星は出ません。

**近くでは細かいタイル。** ビューは、どのカメラで見ているかと表示の大きさを、天体ごとにペインターに伝えます。そのため、画面に大きく映る惑星や月には、見えている部分に wakusei-planets の細かい地図のタイルを重ねます (タイルがあるのは火星と月です)。小さくなると、数秒後に手放します。ペインターには、タイルのフォルダーを次のように渡します。`createPainter({ textureBase: "/planets/", tiles: "https://johnmorrisdotca.github.io/wakusei-planets/tiles/" })` (wakusei-planets 自身のサイトで、どのページからも読めます)。自分で置いたコピーでもかまいません。`element.stats.bodies.tiles` は、タイルを重ねている天体の数です。

**月**も、ペインターがあるときはペインターが描きます。惑星と同じように描かれ、タイルも使えます。ペインターの月が読み込まれるまでのあいだと、`bodies="plain"` のとき、ペインターがないときは、ビュー自身の月 (NASA の地図から描いたもの) を出します。

**クレジット。** 画像の一部は CC BY 4.0 なので、見える場所にクレジットが必要です。ペインターに `credit: { en, ja }` を付けると、ペインターが天体を描いているあいだ、ビューがそれを要素またはページの言語で、画像の下に表示します。クレジットをページ自身で書くときは、`bodies-credit="off"` でこの行を消せます。wakusei-planets のペインターには、まだ自分の `credit` がないので、デモのように付けてください (出典は wakusei-planets の NOTICE.md にあるものです)。

```ts no-run
import { setBodyPainter } from "@johnmorrisdotca/chikyu-earth/space/element";
import { createPainter } from "@johnmorrisdotca/wakusei-planets/painter";

const credit = {
  en: "Planet and Moon pictures: NASA, USGS and JPL (public domain); Solar System Scope, Shady Tex and Nestaeric (CC BY 4.0), by way of Wakusei Planets.",
  ja: "惑星と月の画像：NASA・USGS・JPL（パブリックドメイン）、Solar System Scope・Shady Tex・Nestaeric（CC BY 4.0）。Wakusei Planets 経由。",
};
setBodyPainter({ ...createPainter({ textureBase: "/planets/" }), credit });
```

衛星は、惑星が数ピクセルの大きさになると周りに出て、カメラが離れると消えます。`element.zoomFor("Jupiter-moons")` は、惑星と近くの衛星が見えるズームです (`Saturn-moons`、`Mars-moons`、`Uranus-moons`、`Neptune-moons`、`Pluto-moons` もあります)。先に `element.body = "Jupiter"` にしてください。惑星や月に「いっしょに動く」ときも、同じ天体が見えます。

負荷は抑えています。ペインターは、ページがすでに渡した three.js (共有レンダラー、WebGL は1つ) で描き、描くのはビューが頼んだときだけです。画面で大きいときだけ細かい画像を取り、小さくなったら手放します。衛星は視野から出て4秒で手放し、要素が消えるときはすべて解放します。`element.stats.bodies` には、ペインターが作った天体の数 (`painted`)、出ている衛星の数 (`moons`)、まだ手放していない衛星の数 (`held`。表示中か、視野から出てまだ4秒たっていないもの)、月をペインターが描いているかどうか (`moon`)、タイルを重ねている天体の数 (`tiles`) が入ります。`setThreeLoader` で渡す three.js の一部には、wakusei-planets が使う部品 (`AdditiveBlending`、`DataTexture`、`NoColorSpace`、`PlaneGeometry`、`RGBAFormat`、`RingGeometry`、`SphereGeometry`、`TextureLoader`、`Vector2`) も必要です。デモの `three-subset.ts` に一覧があります。

## 自分のペインター

`setBodyPainter` は、どんな `BodyPainter` も受け取ります。`make(three, name, context)` は、半径1のオブジェクト (またはその Promise) を返します。`update({ toSun, ms, radiusPx, view })` (`view` はカメラと表示の大きさで、`BodyView` です)、`tiles`、`billboard`、`dispose` は省略できます。`context.mapped` は、どの見た目でも表面の画像を使うようにという頼みです。省略できる `moons(planet, ms)` は惑星の衛星の位置 (単位は惑星の半径) を返し、`looks` は `bodies` に使える名前を示します。`credit` は画像の下に表示されます。位置、大きさ、光はビューが決め、ペインターは描くだけです。
