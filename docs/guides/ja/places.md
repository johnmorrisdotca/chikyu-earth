---
title: "地球の上の場所"
section: how-to
order: 16
description: "リアルな地球や宇宙の見た目に場所の一覧を渡すと、それぞれの場所が、足もとの輪、地表から立つビーム、先の明るい点として描かれ、名前が横に出ます。訪問者自身の場所は目立たせ、ほかは控えめにします。名前は重ならず、止まっているあいだは何も描き直しません。パッケージは誰がどこにいるかを尋ねず、何も保存しません。"
---

ページは、地球の上に場所を示せます。訪問者自身の場所、お気に入りの都市、どこでもかまいません。`<chikyu-earth-realistic>` と `<chikyu-space>` は `places` の一覧を受け取り、それぞれの場所を、地表から立つ細いビームとして描きます。足もとには輪があり、先には小さな明るい点があります。ビームは地球といっしょに回り、裏側では隠れます。名前は場所の横に出ます。

パッケージは描くだけです。誰がどこにいるかを尋ねることはありません (訪問者の場所がほしいページは、ブラウザー自身の確認画面を使って訪問者に尋ね、何を残すかもページが決めます)。何も保存せず、サーバーも呼びません。

## 一覧

```html
<chikyu-earth-realistic id="earth" center="139.69,35.68" camera="ground" style="width: 420px"></chikyu-earth-realistic>
<script type="module">
  import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/realistic/element/+esm";
  const earth = document.querySelector("#earth");
  earth.places = [
    { id: "here", lat: 35.68, lon: 139.69, label: "Tokyo", kind: "here" },
    { id: "seoul", lat: 37.57, lon: 126.98, label: "Seoul" },
  ];
  earth.addEventListener("chikyu-place-click", (event) => console.log("pressed", event.detail.place.id));
</script>
```

- **`id`** は、ページがその場所に付ける識別子で、クリックされたときに、この値が伝わります。**`lat`** と **`lon`** は度です (経度が -180 から 180 の外なら、その範囲に直します)。**`label`** は表示する名前です (60文字まで)。**`kind`** は、訪問者自身の場所なら `here` にします。目立ち、静かに脈打ちます。それ以外の値はお気に入りとして扱い、小さく、淡く、脈打ちません。
- 同じ一覧は、属性 `places` に JSON として書けます: `places='[{"id":"tokyo","lat":35.68,"lon":139.69,"label":"Tokyo"}]'`。プロパティに入れると一覧がまるごと入れ替わります。属性とプロパティは同じ一覧で、あとから設定したほうが使われます。
- 描けない場所は、ページに例外を投げず、除外してその数を数えます。`id` がない (または、すでに使われている)、緯度や経度が数でない、緯度の絶対値が90度を超える、といった場合です。残すのは最大200か所です。ページが渡したオブジェクトはコピーして使い、そのまま保存したり書き換えたりはしません。
- 裏側にある場所は描きません。ビームの長さは、地球の何割かではなくピクセルで決まるので、どの拡大率でも読めます。真正面から見る場所 (円盤の中心) では、ピンを真上から見たときのように、画面上では短くなります。宇宙の見た目では、地球の半径が14ピクセルより小さいときや、天体にカメラを載せて見ているときは描きません。

## 名前は重ならない

名前はそれぞれ、場所の横にある本物のボタン (`<button>`) です。まず右に置き、入らなければ左、上、下の順に試します。4つとも空いていないときは、優先度の低い場所の名前を出しません。訪問者自身の場所をいちばん先に置き、そのあとお気に入りを、渡した順に置きます。名前がほかの名前に重なることはありません。すべての場所は、名前を描いていてもいなくても、スクリーンリーダー向けの一覧に入っています。キーボードやポインターで名前を押すと、`detail: { place }` を添えた `chikyu-place-click` が送られます。属性 `places-turn` があれば、ビューもその場所へ回ります (`places-turn="off"` は、属性を書かないのと同じです)。

## 一覧を保存する

パッケージは何も保存しないので、場所を保存するページ (アカウントの中でも、アドレスでも、どこでも) は、変更のたびに `chikyu-places-change` を受け取れます。`detail: { places }` には、要素がいま持っている一覧がまるごと入ります (コピーです。描けなかった場所は、すでに除外されています)。プロパティを設定したとき、または属性が変わったときに、いまの一覧と違う一覧になる場合に送られます。同じ一覧をもう一度設定したときや、最初の空の一覧では送られません。

```js no-run
earth.addEventListener("chikyu-places-change", (event) => localStorage.setItem("places", JSON.stringify(event.detail.places)));
```

## 止まっているとき

印は、ビューや一覧が変わったときに描きます。ひとりでに動くのは、訪問者自身の場所の脈動だけです。脈動は、ビューが動いているあいだと、訪問者自身の場所を追加したり変えたりしてから約2秒のあいだ (1秒に20回ほど) だけ続き、そのあとは止まります。そのため、止まっているビューは何も描きません。脈動が動くのは、地球が画面に見えていて、タブが表示されていて、読む人が動きを減らす設定にしていないときに限ります。動きを減らす設定の人には、印は止まったまま描きます。`stats.places` で数を読めます (`places`、`facing`、`labels`、`renders`、`pulsing`)。

## 単独で使う

`@johnmorrisdotca/chikyu-earth/places` には DOM も three.js も入っていません。一覧の検査 (`readPlaces`、`readPlacesAttribute`) と、場所を画面に置く計算 (`orthographicProjector`、`putPlaces`、`destination`) があり、自分で描くページ向けです。

```js
import { orthographicProjector, putPlaces, readPlaces } from "@johnmorrisdotca/chikyu-earth/places";

// The list a page hands to the Earth: each place is checked and copied, and one that cannot be drawn is left out and counted.
const read = readPlaces([
  { id: "here", lat: 35.68, lon: 139.69, label: "Tokyo", kind: "here" },
  { id: "lima", lat: -12.05, lon: -77.04, label: "Lima" },
  { id: "bad", lat: 120, lon: 0 },
]);
console.log(`${read.places.length} places, ${read.skipped} left out`);

// Where they fall when the view is centred on Tokyo: Tokyo faces the viewer, Lima is on the far side and is not drawn.
const view = orthographicProjector({ lon: 139.69, lat: 35.68, radius: 200, cx: 210, cy: 210 }, 420, 420);
for (const mark of putPlaces(read.places, view)) console.log(`${mark.place.label}: ${mark.facing ? "drawn" : "far side"}`);
```
