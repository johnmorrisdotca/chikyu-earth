---
title: ズーム、移動、回転
section: how-to
order: 13
description: パッケージの表示はどれも、バーや設定なしで、自分でズーム、移動、回転ができます。操作の一覧、要素ごとのズームの範囲とその理由、操作を止める方法、ボタンを付ける方法を説明します。
---

`<chikyu-earth>`、`<chikyu-earth-realistic>`、`<chikyu-space>` をページに置くと、読む人は絵を動かせると思います。実際に動かせます。ほかに何も要りません。どの要素も [kazoku-ui の表示操作](https://github.com/johnmorrisdotca/kazoku-ui)を自分で持っています (共有の `carryControls` です)。そのため、script タグでも、フレームワークでも、コードビルダーでも、iframe でも、同じ操作ができます。

## 操作でできること

- **ドラッグ。** 「全体」(Fit) の大きさでは、ドラッグで地球や視点が回ります。ズームしているときは、絵が動きます。2 本の指でつまむと、拡大縮小、移動、ひねりができます。ダブルタップで 2 倍になり、もう一度で戻ります。
- **ホイール。** 「全体」では、ふつうのホイールはページをスクロールします。そのため、絵にスクロールを奪われることはありません。Ctrl (Command、Alt でも) を押してホイールを回すと、ポインターの位置を中心にズームします。トラックパッドのピンチと同じです。ズームしているときは、ふつうのホイールで絵が動きます。
- **キー。** 要素にフォーカスが移ります (`tabindex` を付けていなければ、`tabindex="0"` が付きます)。矢印キーで回り、`+` と `-` でズームし、`0` と Home で「全体」に戻ります。
- **勝手には動きません。** ページが始めない限り、自動の回転はありません (始めるときは `element.controller.play()` です)。動きを減らす設定の人にも、止めるものがありません。

```html
<chikyu-earth center="139.7,35.7" look="thick" size="320"></chikyu-earth>
<chikyu-earth-realistic center="139.7,35.7" texture-base="/textures/" controls="none"></chikyu-earth-realistic>
```

1 つ目の地球はズームも回転もできます。2 つ目は `controls="none"` で操作を外しています (この属性は監視されているので、実行中に変えられます)。`element.controller` は操作の裏にあるコントローラーで、`set`、`fit`、`play`、`state` に使えます。

## ズームの範囲と、そこで止まる理由

ズームしても、描くピクセルは増えません。キャンバスの大きさは一定で、レンダラーの上限 (1 辺 4096 ピクセル、600 万ピクセル) の中にあります。ズームは、描いたものを拡大するだけです。そのため、下限は、絵のまわりに余裕がある所では、どこでも「全体」の 10 分の 1 です (対象全体が小さく見えます)。上限は、絵の細かさがなくなる所です。

| 要素 | 範囲 | 理由 |
| --- | --- | --- |
| `<chikyu-earth>` (line、thick) | 0.1 倍から 20 倍 | 輪郭は Natural Earth の 1:110m で、ズームのたびに描き直すので、くっきりしています。20 倍では、画面の幅が約 640 km で、海岸線は数十 km の直線がいくつか並ぶだけです。これ以上細かいものはありません。 |
| `<chikyu-earth-realistic>` | 0.1 倍から 5 倍 | パッケージの画像は、横が最大 4096 ピクセルです。約 3 倍まではくっきりで、5 倍まではきれいに見えます。 |
| `<chikyu-earth-realistic tiles="...">` | 0.1 倍から 20 倍 (タイルが見つかったとき) | いちばん細かいタイルは横 16384 ピクセルで、一番大きな画像の 4 倍です。タイルが見つからないときは 5 倍のままです。[タイルのガイド](earth-tiles.md)を見てください。 |
| `<chikyu-space>` | 100 万分の 1 倍から 2.5 倍 | ズームはカメラの距離です。太陽系全体は「全体」の 100 万分の 1 で入ります。惑星と、その距離が全部見えます。近づく側は、地球の 4096 ピクセルの画像と天体のテクスチャがくっきり見える 2.5 倍までです。 |
| 天体に乗って見る `<chikyu-space>` | 0.5 倍から 6 倍 | カメラは天体の上にあり、ズームは視野を少し狭くしたり広くしたりするだけです。0.5 より広いと魚眼のようになり、6 倍を超えると地球の画像がぼやけます。乗るのをやめると、上の範囲に戻ります。 |

どれも、両極まで傾けられます (`tilt-max` は 90)。範囲を変えるときは、要素に `zoom-min` と `zoom-max` を付けます (要素が決めた範囲より優先されます。乗っている間に要素が決める範囲より優先されます)。`tilt-max` と `roll-max` も同じです。

```html
<chikyu-earth zoom-min="1" zoom-max="5"></chikyu-earth>
```

## バーを付ける

ボタン、スライダー、自動の回転、アドレスの保存が欲しいときは、要素に `<kazoku-view-controls for="earth">` を付けます。バーがあるあいだは、バーが操作を引き受けます (要素自身の操作は引っ込むので、ドラッグが 2 回処理されることはありません)。バーは要素の範囲を読み取ります。ページは、これまでどおり、バーのイベントを要素に渡します。キーが届くように、要素には `id` と `tabindex` を付けてください。

```html
<chikyu-earth id="earth" size="420" tabindex="0"></chikyu-earth>
<kazoku-view-controls for="earth" address grab-radius="fit" controls="advanced" tilt-max="90"></kazoku-view-controls>
```

```js no-run
const earth = document.querySelector("chikyu-earth");
document.querySelector("kazoku-view-controls").addEventListener("kazoku-viewchange", (event) => {
  earth.setView(event.detail, event.detail.final, event.detail.reason !== "auto");
});
```

## kazoku-ui が必要です

要素が kazoku-ui の `view-controls` を読み込むようになったので、`@johnmorrisdotca/kazoku-ui` はこのパッケージの依存関係になりました (これまでは、なくてもよい peer でした)。平面の地球のスクリプトは、コントローラーの分だけ少し大きくなります。
