---
title: なぜパッケージが2つあるのか
section: explanation
order: 12
description: chikyu-earth と wakusei-planets がそれぞれ何をするか、どちらを入れればよいか、1つだけで使うときと2つ一緒に使うときを説明します。
---

人が暮らす場所としての地球は、この chikyu-earth にあります。国、昼と夜、街の明かり、雲、場所の目印、地球を回る人工衛星です。太陽、ほかの惑星、衛星は [wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets) にあります。どちらも1つだけで動き、ページが両方を使いたいときは一緒に使えます。

## 決まり

- **chikyu-earth は、地球だけに興味がある人のためのものです。** 地球をくわしく扱うものは、すべてここにあります。国、昼と夜、街の明かり、雲、場所の目印、人工衛星です。
- **wakusei-planets は、地球以外の天体と太陽系のためのものです。** 太陽、惑星、準惑星、衛星、ある日にそれぞれがどこにあるか、そしてその間の宇宙です。地球もそこにありますが、ほかの天体と同じ1つの天体としてです。大きさ、傾き、自転、宇宙から見た写真です。
- **依存は一方向だけです。** wakusei-planets は chikyu-earth を使ってもよく (任意の依存)、chikyu-earth は wakusei-planets を必要としません。このパッケージのどの入口も、wakusei-planets をimportしません。

新しい機能をどちらに入れるかは、「片方のパッケージだけを入れた人が、それでもほしいと思うか」で決めます。世界の国の地図は、木星のことを考えない人もほしがるので chikyu-earth です。今夜の火星の位置は、国を描かない人もほしがるので wakusei-planets です。

## どこに何があるか

| ほしいもの | パッケージ |
|---|---|
| 国の入った地球儀 (地球と同じ速さで回る) | chikyu-earth |
| 宇宙から見た地球 (昼と夜、街の明かり、雲、太陽の反射) | chikyu-earth |
| 場所の目印、地球の上をいっしょに動くカメラ | chikyu-earth |
| 地球を回る人工衛星、宇宙ステーション、スペースシャトルの飛行 | chikyu-earth |
| 国の名前とコード (データとして) | chikyu-earth |
| 太陽、惑星、準惑星、衛星 (3つの見た目) | wakusei-planets |
| ある日の各天体の位置、極の向き、満ち欠け、環 | wakusei-planets |
| ある場所から見た日の出、月の出、月の満ち欠け | wakusei-planets |
| ほかの惑星と同じ見た目で描く地球 | wakusei-planets |
| 中を飛んで回れる太陽系の場面 | wakusei-planets (chikyu-earth の宇宙ビューから移しているところ) |

## 片方だけ入れる人はいるか

はい。それがこの分け方の目的です。

- 場所を載せるサイト (会場、フライト、チーム) は chikyu-earth がほしく、惑星は使いません。
- 土星の環の学校のページや、今夜の星図は wakusei-planets がほしく、世界の国の輪郭や人工衛星の計算は使いません。
- 太陽系の中の地球を見せるページは、両方がほしいです。

2つに分けると、片方だけがほしい人には小さいままです。共有の部分 (レンダラー、表示の操作、テーマと言語) は kazoku-ui から来るので、両方を使っても、それぞれを1つずつ使うより重くなりません。

## chikyu-earth だけを使う

このパッケージだけを入れます。wakusei-planets をimportしないので、ビルドがそれを求めることはなく、何も必要としません。

```sh
npm install @johnmorrisdotca/chikyu-earth
```

ほかのガイドはすべて、そのまま使えます。たとえばバンドラーでは次のとおりです。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import { globe } from "@johnmorrisdotca/chikyu-earth";

const earth = document.querySelector("chikyu-earth")!;
earth.setAttribute("graticule", "");
console.log(globe({ size: 64 }).startsWith("<svg"));
```

`pnpm test:usage` の確認が、wakusei-planets のない状態ですべての入口をバンドルし、どれかがそれを求めたら失敗します。

## wakusei-planets だけを使う

太陽、惑星、衛星だけがほしいときは [wakusei-planets](https://github.com/johnmorrisdotca/wakusei-planets) だけを入れます。地球もほかの天体と同じように描くので、そのために chikyu-earth は要りません。使い方は wakusei-planets の README とガイド「なぜパッケージが2つあるのか」にあります。

## 2つを一緒に使う

両方を入れます。

```sh
npm install @johnmorrisdotca/chikyu-earth @johnmorrisdotca/wakusei-planets
```

wakusei-planets の `/earth` と一緒に chikyu-earth の要素をimportすると、ページの `<wakusei-body body="earth" look="line">` はすべて、国の入った chikyu-earth の地球儀になります。ほかの天体は wakusei-planets 自身の線画のままです。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth and Wakusei Planets together</title>
  </head>
  <body>
    <wakusei-body body="earth" look="line" size="260"></wakusei-body>
    <wakusei-body body="mars" look="line" size="160"></wakusei-body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import "@johnmorrisdotca/wakusei-planets/element";
import "@johnmorrisdotca/wakusei-planets/earth";
```

`pnpm test:usage` が、npm が作るとおりのパッケージからこのページを Vite でビルドし、地球が国の入った地球儀になっていて、火星はそうなっていないことを確かめています。

- **realistic と painted の地球は、wakusei-planets のままです。** となりのほかの惑星と同じ見た目になります。このパッケージの宇宙から見た地球 (昼と夜、雲つき) は `<chikyu-earth-realistic>` です。[リアルな地球と目印](realistic-and-markers.md)を見てください。
- **ページの WebGL は1つです。** どちらのパッケージも kazoku-ui の共有レンダラーで描くので、惑星と地球儀が並ぶページでも、WebGL は1つ、負荷の上限も1つです。
- **宇宙ビュー。** 今は `<chikyu-space>` が、wakusei-planets のペインターで太陽と惑星を描いています。ペインターは `setBodyPainter` で渡します ([本物の太陽・惑星・冥王星・衛星](the-real-planets.md))。このパッケージが wakusei-planets から受け取るのはそこだけで、渡すのはあなたのコードです。太陽系を1か所にまとめるため、このビューは wakusei-planets へ移しているところです。移ったら[アップグレード](upgrading.md)に切り替え方を書きます。このパッケージには地球と人工衛星が残ります。
