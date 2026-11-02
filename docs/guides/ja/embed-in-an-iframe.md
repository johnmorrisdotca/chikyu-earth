---
title: iframe で埋め込む
section: how-to
order: 5
description: iframe 1つ、スクリプトなしで、どんなページにも地球儀を入れます。表示する内容はアドレスで選びます。
---

デモサイトには、枠に入れるための専用ページ `embed.html` があります。アドレスに書かれた内容を描き、自分のファイル以外は取得しません。なので、あなたの側にはスクリプトも、ビルドも、パッケージも要りません。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth in an iframe</title>
  </head>
  <body>
    <iframe
      src="https://johnmorrisdotca.github.io/chikyu-earth/embed.html?look=thick&center=139.7,35.7&turn=1"
      title="The Earth, centred on Tokyo"
      width="420"
      height="420"
      loading="lazy"
      style="border: 0"
    ></iframe>
  </body>
</html>
```

地球儀は枠いっぱいに、幅と高さの小さいほうに合わせた正方形で表示されます。背景は透明なので、ページの色の上に乗ります。

## アドレスで指定できるもの

| パラメーター | 値 | 初期値 |
|---|---|---|
| `look` | `line`、`thick`、`realistic` (WebGL が必要。使えないときは `thick`) | `line` |
| `center` | `経度,緯度`。`me` なら、ブラウザーに見る人の場所を尋ねる | `0,20` |
| `graticule` | `1` | なし |
| `turn` | `0` は静止、`1` は手で回せる (ドラッグ、ホイール、ピンチ、矢印キー)、`auto` は地球と同じ速さで自動で回る | `0` |
| `time` | リアルな見た目の日時。例: `2026-06-21T12:00Z` | 今 |
| `clouds`、`lights` | `off` にすると、リアルな見た目でその層を隠す | 表示 |

初期状態の枠は止まっていて、コントロールがなく、見る人の位置も尋ねません。描くのは何かが変わったときだけで、画面の外にあるときや、タブが隠れているときは何も描きません。

## 大きさとアクセシビリティ

iframe には `title` (例には付けてあります)、`width`、`height` を付け、`loading="lazy"` も付けてください。画面の近くに来るまで、何も負担になりません。枠は正方形です。横が長い枠にすると、左右に空きができます。

## 枠を自分のサーバーに置く

枠は `embed.html` と `embed.js` (と、分割されたファイル)、そして `look=realistic` 用の `textures/` フォルダーです。`pnpm site` で `site/` に作られます。デモサイトを使いたくないときは、そのフォルダーを自分のサーバーにコピーしてください。
