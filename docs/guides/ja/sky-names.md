---
title: "星の名前と、ごく淡い星座の線"
section: how-to
order: 18
description: "宇宙の見た目やリアルな地球の後ろの空に、いちばん明るい星の名前と、88の星座を、ごく淡い線で重ねます。ポインターの下の図形は最大の強さで描き、名前は重ならず、地球の後ろの星は除きます。指定したときだけ表示され、そのときだけ hoshi-stars を読み込みます。"
---

`<chikyu-space>` と `<chikyu-earth-realistic>` は、ページがその後ろに描いている空の上に、いちばん明るい星の名前と、星座をごく淡い線で重ねられます。使うのは hoshi-stars の空のラベル (`@johnmorrisdotca/hoshi-stars/sky-labels`) で、**任意のピア依存**です。下の属性のどれかが設定されたときだけ読み込むので、使わないページに負担はかかりません。空の大部分は名前も線もないままで、どちらも指定するまで出ません。

```html
<chikyu-space star-names="12" constellation-lines="0.16" lang="ja" style="width: 420px"></chikyu-space>
```

| 属性 | 意味 |
|---|---|
| `star-names="12"` | 見える範囲にあって、隠れていない星のうち、いちばん明るい12個に名前をつけます。値を省略した `star-names` は10です。上限は335で、名前のある星すべてです。 |
| `star-names-magnitude="1.5"` | その明るさ以上の星だけに名前をつけます (シリウスは -1.46)。`star-names` もあるときは、両方の上限が守られます。 |
| `constellation-lines="0.16"` | 88の星座を、この強さ (0から1) の線で描きます。値を省略した `constellation-lines` は0.16です。ポインターが乗っている図形 (その線か、構成する星のどれか)、またはタッチされた図形は最大の強さになり、名前が出ます。 |

これらは hoshi-stars 自身の属性名で、意味は hoshi-stars のガイドのとおりです。プロパティ `skyStyle` は名前の見た目を決めるもので、hoshi-stars の `LabelStyle` の一部 (フォント、大きさ、大文字小文字、輪、引き出し線など) を指定できます。既定は hoshi-stars のスタイルで、フォントは Michroma です。ページが自分のフォントを指定していないときだけ、要素がこのフォントを読み込みます。読み込む場所は、地球に書く名前と同じで、`setBodyLabelFontUrl` で指定します。

- **天体に隠れた星。** 地球、月、太陽が空をおおっている場所の名前は出さず、代わりに次の星に名前をつけるので、天体の上に名前が浮くことはありません。名前は重なりません。それぞれの名前は、星の右、左、上、下の順に置ける場所を試し、空いている場所がなければ出しません。
- **ページの言語。** 名前は、英語のページでは IAU の綴り、日本語のページではカタカナです (要素の `lang`、なければページの言語)。星座の名前も同じで、ラテン語名か日本語名になります。
- **ポインターとタッチ。** マウスは乗っている図形を光らせ、離れると元に戻します。指は触れた図形を光らせ、次にタッチするまでそのままです。描き直すのはこのレイヤーだけで、絵は描き直しません。
- **止まっているときは何もしません。** 名前と線は、絵を描くとき (カメラが動いたとき、大きさが変わったとき、設定が変わったとき) だけ計算します。`stats.sky` に `on`、`loaded`、`names`、`figures`、`picked`、`renders` があります。
- **空の位置。** `<chikyu-space>` には自分の星がありません。名前は、ページが自分で描いた空の星の位置に、絵のカメラを使って置きます。そのため、ページが星をビューの後ろにファミリーの軸 (x は春分点の向き、y は北) で描いていれば、名前はその星の上に重なります。`<chikyu-earth-realistic>` はカメラが地球をまっすぐ見ているので、空は絵自身の軸に沿って見える方向を、枠いっぱいに映したものになります。
- **見える数。** `star-names="12"` は上限で、実際に出る数ではありません。宇宙の見た目は、地球が絵の90%を占める状態で開くので、空が見えるのは四隅だけです。名前のつく星は平均して2つほどで、10回に1回は1つもありません。地球を小さくする (`earth-size` 属性) か、星の多い方向へ視点を向ければ、12個すべてに名前がつきます。`<chikyu-earth-realistic>` は、空の半分を枠いっぱいに映すので、いつもたくさん出ます。
- **インストールされていないとき。** hoshi-stars (バージョン0.30以降) がなければ、理由を添えた `chikyu-sky-unavailable` イベントが送られ、何も描きません。

## hoshi-stars がないページ

hoshi-stars は任意のピア依存なので、入れていないページでも型は通ります。名前の見た目 `skyStyle` は、このパッケージ自身の型 `SkyLabelStyle` で、hoshi-stars の `LabelStyle` と同じ形です。hoshi-stars がなければ `chikyu-sky-unavailable` が理由つきで送られ、名前は出ず、絵はいつものままです。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space/element";
import type { SkyLabelStyle } from "@johnmorrisdotca/chikyu-earth/realistic";

// A page without hoshi-stars installed still type-checks: the look of the names is chikyu-earth's own type.
const space = document.querySelector<ChikyuSpace>("chikyu-space")!;
const look: Partial<SkyLabelStyle> = { size: 12, colour: "#ffe9b0", ring: 0 };
space.skyStyle = look;
space.setAttribute("star-names", "12");

// With no hoshi-stars the element says so and draws no names; the picture is as it was.
space.addEventListener("chikyu-sky-unavailable", (event) => console.log((event as CustomEvent<{ reason: string }>).detail.reason));
```
