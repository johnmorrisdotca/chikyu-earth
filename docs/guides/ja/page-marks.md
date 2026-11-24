---
title: "ページが渡す一覧の目印"
section: how-to
order: 19
description: "ページが持っている場所の一覧 (たとえばサイトの火球) を、地球の上に描きます。それぞれ緯度、経度、ピクセルの大きさ、名前と色 (どちらも省略できます) を持ちます。ページが一覧を渡すまでは何も出ず、いくつあっても 1 回の描画で、地球の裏側では出ません。押すと、その目印の id がページに届きます。名前は、都市の名前とページ自身のボックスを避けます。"
---

ページが自分の場所の一覧 (火球 888 個。それぞれ緯度、経度、エネルギー、日付) を持っているときは、それを `<chikyu-space>` か `<chikyu-earth-realistic>` に `places` として渡します。目印のための別のしくみを覚える必要はありません。[場所のガイド](places.md)の場所の層が、ページの一覧をすでに描いています。このページは、大きさをページが決める目印として使う方法を示します。

```js no-run
const marks = fireballs.map((fireball) => ({
  id: fireball.id,
  lat: fireball.lat,
  lon: fireball.lon,
  size: 2 + 10 * Math.sqrt(fireball.energy / maxEnergy),
  ...(fireball.famous ? { label: fireball.place } : {}),
  color: "#ff6b8a",
}));
space.placeGroups = false;
space.places = marks;
space.addEventListener("chikyu-place-click", (event) => {
  const fireball = byId.get(event.detail.id);
  console.log(fireball.place, fireball.date, fireball.energy);
});
```

- **目印は `{ id, lat, lon, size, label, color }` です。** `id` はページが決める ID で、押したときにそのまま返ります。`size` は、地面に置く輪の半径 (CSS ピクセル) で、`MIN_PLACE_RING` (1.5) から `MAX_PLACE_RING` (14) までです。範囲の外の数はその範囲に収められ、ズームしても大きさは変わりません。大きさが何を表すか (エネルギー、個数) はページが決め、パッケージは描くだけです。`label` は目印の名前、`color` は CSS の色です。`size` は場所のガイドと同じく `"small"` も使え、書かなければ種類の標準の大きさです。
- **ページが渡すまでは何も出ません。** `places` がないあいだは、層はページの中に目印を 1 つも作らず、配置も描画もしません (`stats.places.shown` は 0)。`places = []` にするとまた消えます。
- **1 回の描画。** 見えている目印のうち最初の `PLACE_MARKS` (32) 個は、名前といっしょに立ち上がります。順番は、`here` が先、次に `label` のある目印 (一覧の後ろのほうにあっても)、そのあとは渡した順です。ほかの目印はすべて地面に置いた輪になり、いくつあっても絵の 1 回の描画にまとめます。`places-look="ring"` (または目印の `look: "ring"`) にすると、立つ目印も輪だけになり、すべて同じ見た目にそろいます。
- **混み合うとき。** 初期値では、約 24 ピクセルより近い目印は数つきの 1 つの大きな輪にまとまり、ズームするとほどけます。目印を 1 つずつ残したいページは `placeGroups = false` (属性なら `place-groups="off"`) にします。複数をまとめた輪は目印ではないので、押しても何も届きません。
- **地球の裏側では出ません。** 裏側の目印は、描かず、名前も出さず、`stats.places.shown` にも数えず、押しても反応しません。ふちに近いとうすくなり、夜の側では暗めになります。
- **押すと id が届きます。** `chikyu-place-click` の `detail: { id, kind, label?, layer?, lon, lat, x, y }` が、押した位置にある目印 (12 ピクセル以内でいちばん近いもの。輪でも立っている目印でも) について届きます。エネルギーや日付などは、ページが `id` で探します。キーボードの `P`、`Shift`+`P`、`Enter` でも目印へ行けます。
- **名前は避けます。** 目印の名前は都市の名前より先に置かれ、都市の名前が目印の名前を避けます。ほかの目印の名前、宇宙の見た目の天体の名前、`keepOut` のボックス (ページのバーやカードなど、絵の上に重ねたもの) も避けます。置く場所がない名前は出しませんが、目印は描かれ、押すこともできます。
- **まとめて出す、隠す。** 目印に `layer` (`"fireballs"`) をつけて、`placeLayers = { fireballs: false }` で切り替えます。一覧は 1 回渡すだけです。
- **止まっているときは何もしない。** 目印の配置は、絵を描くときだけ計算します。ページが止まっているあいだ、`stats.places.renders` は増えません。目印は最大 `MAX_PLACES` (5,000) 個で、経度が -180 から 180、緯度が -90 から 90 の外にあるものは出しません。

## `<chikyu-earth>` では

線画の地球儀には `places` がありません。[リアルな地球のガイド](realistic-and-markers.md)にある、canvas で描く `attachMarkers(earth)` を使います。`{ id, lon, lat, size (直径 4 から 32 ピクセル), label, color, icon, group }` を渡せ、混み合う目印は 1 つにまとまり、押すと `chikyu-marker-click` が届きます。`<chikyu-earth-realistic>` でも使えます。

## ページがすること

データを上の一覧の形にし、大きさを決め (エネルギーの平方根にすると、とても大きな火球がほかを隠しません)、名前は目立たせたい少数だけにつけ、`chikyu-place-click` のイベントを受けて、`id` からページ自身のカードを出します。パッケージは自分では一覧を持たず、どこにも何も送りません。
