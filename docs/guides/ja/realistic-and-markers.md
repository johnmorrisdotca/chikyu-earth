---
title: リアルな地球と目印
section: how-to
order: 7
description: 宇宙から見た地球を表示し、どちらの地球儀にも好きな場所の目印を付けます。軽さを保つ制限も説明します。
---

どちらも任意で、import しなければ何も負担になりません。別のエントリーポイントになっています。

## 宇宙から見た地球

`<chikyu-earth-realistic>` は、選んだ日時の本物の太陽で、昼と夜の面を描きます。街の明かり、海の太陽の反射、雲、縁の大気も入ります。[three.js](https://threejs.org) を、kazoku-ui の共有レンダラー経由で使います。このレンダラーはページ全体で WebGL のコンテキストを1つだけ持つので、任意の依存パッケージを入れてください。

```sh
npm install three @johnmorrisdotca/kazoku-ui
```

```ts no-run
import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
earth.setAttribute("center", "139.7,35.7");
earth.setAttribute("time", "2026-06-21T03:00Z");
earth.setAttribute("texture-base", "/textures/");
document.body.append(earth);
```

`texture-base` は、パッケージの画像があるフォルダーです。`node_modules/@johnmorrisdotca/chikyu-earth/dist/textures/` を自分のサイトにコピーしてください (合計 1.6 MB。拡大の程度に合った大きさの画像だけを読み込み、要らなくなると解放します)。CDN から使うときは [CDN のガイド](html-and-cdn.md#リアルな地球) を見てください。

約 5 倍より近づいてもぼやけないようにするには、`tiles` (地図タイルのフォルダー。[近づいてもくっきり見える地球のタイル](earth-tiles.md)を見てください) を足します。要素は見える範囲のタイルだけを読み込み、ページは 40 倍までの拡大を許せます。

送る JavaScript を減らすには、three.js のうち要素が使う部分だけを渡します。

```ts no-check
import { setThreeLoader } from "@johnmorrisdotca/chikyu-earth/realistic/element";

setThreeLoader(() => import("./three-subset"));
```

`three-subset.ts` は、`"three"` から `BackSide`、`BufferAttribute`、`BufferGeometry`、`ClampToEdgeWrapping`、`Group`、`LinearFilter`、`LinearMipmapLinearFilter`、`Mesh`、`OrthographicCamera`、`RepeatWrapping`、`Scene`、`ShaderMaterial`、`Texture`、`Vector3`、`WebGLRenderer` を再エクスポートするファイルです。くわしい説明と制限は [docs/realistic.md](../../realistic.md) にあります (英語)。

背景に使うときは、画面に必要な細かさまでにします。`max-ratio="1"` (または `0.5`。半分の大きさで描いて、拡大して表示します) を付けると、ページ全体のキャンバスの細かさに上限がかかります。この値は、要素がページに入るときに読み込まれます。

要素は、スタイルを constructable stylesheet として書き込みます。そのため、`style-src 'self'` のページでも、ハッシュを足す必要はありません。ページがすでに kazoku-ui の共有レンダラーで別のものを描いているときは、最初の要素がページに入る前にそのレンダラーを渡してください。ページの WebGL コンテキストは 1 つのままです。

```ts no-run
import { createSharedRenderer } from "@johnmorrisdotca/kazoku-ui/renderer";
import { setSharedRenderer } from "@johnmorrisdotca/chikyu-earth/realistic/element";

setSharedRenderer(createSharedRenderer({ load: () => import("three") }));
```

## 目印

どちらの見た目にも、`[lon, lat]` の位置に、ラベル、色、アイコン付きの目印を付けられます。グループごとに表示と非表示を切り替えられます。Chikyu は場所のデータを持っていません。場所は自分で用意します。目印は地球儀と一緒に動き、裏側では薄くなり、ラベルの場所を空け、混み合うとまとまり、ホバー、クリック、キーボードのイベントで、自分のデータを渡します。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import { attachMarkers, type MarkerEventDetail } from "@johnmorrisdotca/chikyu-earth/markers";

const earth = document.querySelector("chikyu-earth")!;
const markers = attachMarkers(earth);
markers.add({ id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo", group: "Cities" });
earth.addEventListener("chikyu-marker-click", (event) => {
  const { marker } = (event as CustomEvent<MarkerEventDetail>).detail;
  console.log("chose", marker?.label);
});
```

目印は、何千か所でも描画1回で済み、ラベルは最大 24 個のボタンを使い回します。リアルな地球では、目印のラベルは要素自身の場所の名前と目印を避け、都市、星、星座の名前は目印のラベルを避けます。リファレンスの [attachMarkers](api:attachMarkers) と、[docs/markers.md](../../markers.md) (英語) を見てください。
