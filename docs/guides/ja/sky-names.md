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
| `constellation-lines="0.16"` | 88の星座を、この強さ (0から1) の線で描きます。値を省略した `constellation-lines` は0.16です。ポインターが乗っている図形 (その線の上か、輪郭の内側)、またはクリックやタップされた図形は最大の強さになり、名前が出ます。 |
| `constellation-names` | 指定したときだけ有効です。見えている図形ごとに、絵の上にある部分の中心へ、星の名前より控えめに、ページの言語で星座名を書きます。星の名前、地球、月、太陽、名前のついた場所や衛星、避ける場所、ほかの星座名とは重ねません。必要なのは hoshi-stars だけで、`constellation-lines` は要りません。 |
| `constellation-culture="japanese"` | 図形の星座文化です。`iau` (IAU の88星座、既定)、`western`、`japanese` (88星座の日本語名と、すばるなどの伝統的な図形)、`chinese` (中国の図形と二十八宿)。線、ポインターの下の図形、選ばれた図形、その名前のすべてがこれに従います。値はページが設定したとおりに扱われ、日本語のページ (`lang=ja`) でも、`japanese` を設定しない限り IAU の図形のままです。どの星座文化にもない値は `iau` になり、コンソールに警告が1回出ます。 |
| `keep-clear=".hero h1"` | 空の名前を置いてはいけないページ上の場所を指す CSS セレクターです (下の「避ける場所」を参照)。プロパティ `keepClear` は同じものをリストで受け取ります。 |

これらは hoshi-stars 自身の属性名で、意味は hoshi-stars のガイドのとおりです。プロパティ `skyStyle` は名前の見た目を決めるもので、hoshi-stars の `LabelStyle` の一部 (フォント、大きさ、大文字小文字、輪、引き出し線など) を指定できます。既定は hoshi-stars のスタイルで、フォントは Michroma です。ページが自分のフォントを指定していないときだけ、要素がこのフォントを読み込みます。読み込む場所は、地球に書く名前と同じで、`setBodyLabelFontUrl` で指定します。

- **空は地球の後ろにあります。** 地球、月、太陽の上や、地球の大気の上には、空のものを何も描きません。星座の線は縁でぴったり途切れ (線全体が隠れるのではなく、縁の手前までは描かれます)、星の点、輪、名前の枠のどれかが天体に重なる星は、名前と輪を出さず、代わりに次の星に名前をつけるので、天体の上に名前が浮くことはありません。縁はカメラから求めます。各ピクセルを通る光線を天体の見かけの大きさと比べるので、天体に乗って見ていて地球が絵いっぱいに大きな弧になるときも、下の地球の明るさに左右されない夜側でも、正しく求まります。衛星自身の軌道の線は、空ではなく衛星のものなので、切りません。名前どうしは重なりません。それぞれの名前は、星の右、左、上、下の順に置き場所を試し、空いている場所がなければ出しません。
- **避ける場所。** 要素の上に自分の文章を重ねるページは、名前を置いてはいけない場所を要素に伝えられます。プロパティ `keepClear` は、長方形 (`{ x, y, width, height }`、要素の CSS ピクセル) かページの要素のリストを受け取り、属性 `keep-clear` は CSS セレクターを受け取ります。名前の枠がその場所に触れる星は名前を出さず、星の点がその場所の中にある星も同じです (代わりに次の星に名前をつけます)。選ばれた星座の名前は、その場所を避けて動きます。線はそのまま描かれます。場所を読み直すのは、リストが変わったとき、ページや要素の大きさが変わったとき、スクロールされたときだけで、1フレームごとには読みません。そのため、静止中は再描画されません。大きさを変えずに文章を動かすページは、プロパティをもう一度設定してください。
- **重なり順。** `<chikyu-earth>`、`<chikyu-earth-realistic>`、`<chikyu-space>` はそれぞれ独立した重ね合わせコンテキスト (`isolation: isolate`) になるので、中の名前や線が、要素より前面にあるページの内容より手前に出ることはありません。
- **ページの言語。** 名前は、英語のページでは IAU の綴り、日本語のページではカタカナです (要素の `lang`、なければページの言語)。星座の名前も同じで、ラテン語名か日本語名になります。
- **ホバー。** マウスが図形の上 (線の上、または図形の内側) に止まると、その図形の線が光り、名前が (約150ミリ秒で、動きを減らす設定のときはすぐに) フェードインします。名前は、図形のうち絵の上にある部分の中心に置かれ、絵の内側に収まり、地球を避け、星の名前とも重なりません。ポインターが離れるとフェードアウトします。ホバーしている図形が変わると `chikyu-constellation-hover` が送られ、`detail` は `{ abbreviation, id, name, english, japanese, kind, culture }` です (`abbreviation` は IAU の略号で `Ori` など、`culture` は `constellation-culture` が別の文化を指さない限り `iau`)。ポインターが離れると `detail` は `null` です。当たり判定はポインターが動いたときだけ、1フレームに1回以下で行い、ホバーしている図形が変わったときだけ、このレイヤーを描き直します。
- **選択。** 図形 (その線または内側) をクリックするか指でタップすると選ばれ、別の図形を選ぶか解除するまで、線の光と名前はそのままです (何もない空や地球のクリック・タップ、`Escape`、プロパティへの `null` の設定で解除されます)。要素にフォーカスがあるとき、`C` で見えている図形を左から順に次へ、`Shift`+`C` で前へ選びます。ページを見ている人が選ぶたびに `chikyu-constellation-pick` が同じ `detail` で送られ、解除されると `detail` は `null` です。プロパティ `constellation` は選ばれた図形の略号を返し、`el.constellation = "Ori"` のように設定するとイベントなしで選べるので、ページはその星座のカードを出せます。
- **読み上げ。** 選択 (クリック、タップ、`C`) は、要素の中にある、見えない丁寧な (polite) ライブリージョンで、ページの言語の図形名とともに知らされます (`Orion selected`、`オリオン座を選択`)。ホバーは多すぎて聞き取りにくくなるので知らせません。図形のカードをページが出す場合、その読み上げはページの仕事です。
- **星座文化。** 各文化の図形は、属性が求めたときにだけ、その文化専用の動的インポートで読み込まれるので、`chinese` を設定しないページがそれをダウンロードすることはありません。文化の図形が届くまでは何も描かず、代わりに IAU の図形を描くこともありません。文化の図形は `id` で識別され (星座は IAU の略号で `Ori`、それ以外は短い単語で `subaru`、`hokkyokusei` など)、これがイベントの `abbreviation` で、プロパティ `constellation` が受け取る値です。イベントの `detail` には `abbreviation`、`id`、`name`、`english`、`japanese`、`kind` (`constellation`、`asterism`、`mansion`) と `culture` があります。日本語のページでは、伝統的な図形は仮名の読み (すばる) で名前が出ます。属性を変えると、選ばれていた図形は解除されます。
- **止まっているときは何もしません。** 名前と線は、絵を描くとき (カメラが動いたとき、大きさが変わったとき、設定が変わったとき) だけ計算します。`stats.sky` に `on`、`loaded`、`names`、`figures`、`picked` (ホバー中の図形、なければ選択中の図形)、`pick`、`hover`、`constellations` (`constellation-names` が書いた名前の数)、`renders` があります。
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
