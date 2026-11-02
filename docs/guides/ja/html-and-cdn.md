---
title: 普通の HTML ページで、CDN から使う
section: how-to
order: 2
description: jsDelivr か unpkg のスクリプトタグ1つで、どんなページにも地球儀を入れます。リアルな地球も同じ方法です。
---

ビルドを使わないページは、CDN からパッケージを読み込みます。下の2つの例は、パッケージのテストがブラウザーで実際に動かして確かめています。実際のアドレスも、公開済みのパッケージで確かめました。

## jsDelivr から

jsDelivr は、アドレスの最後に `/+esm` を付けると、パッケージと依存するものを1つのモジュールにまとめて返します。なのでタグは1つで足ります。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth from jsDelivr</title>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/element/+esm"></script>
  </head>
  <body>
    <chikyu-earth center="139.7,35.7" look="thick" graticule size="320"></chikyu-earth>
  </body>
</html>
```

アドレスはパッケージのエントリーポイントを指します。`.../chikyu-earth/element/+esm` は `./element` で、`<chikyu-earth>` を登録します。バージョンを書かないと最新が使われます。内容が変わっては困るページでは、`@johnmorrisdotca/chikyu-earth@0.7.0/element/+esm` のようにバージョンを固定してください。

## unpkg から

unpkg はファイルをそのまま返します。`?module` を付けると、ファイルの import を unpkg のアドレスに書き換えます。ブラウザーはパッケージの数個のファイルと依存先を、1つずつ取得します。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth from unpkg</title>
    <script type="module" src="https://unpkg.com/@johnmorrisdotca/chikyu-earth/dist/element.js?module"></script>
  </head>
  <body>
    <chikyu-earth center="139.7,35.7" look="thick" graticule size="320"></chikyu-earth>
  </body>
</html>
```

ページには、1回で済む jsDelivr のほうが向いています。ブラウザーが受け取るファイルを読みたいときは、unpkg が便利です。

## リアルな地球

宇宙から見た地球は別のエントリーポイントで、画像 (NASA のもの。合計 1.6 MB。パッケージの `dist/textures/` にあります) が必要です。CDN から使うときは、`texture-base` で場所を教えます。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The realistic Earth from jsDelivr</title>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/realistic/element/+esm"></script>
  </head>
  <body>
    <chikyu-earth-realistic
      center="139.7,35.7"
      time="2026-06-21T03:00Z"
      texture-base="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/dist/textures/"
      style="display: block; width: 360px"
    ></chikyu-earth-realistic>
  </body>
</html>
```

jsDelivr は three.js もモジュールにまとめます。送るものを減らすには、`setThreeLoader` で地球が使う部分だけを渡します ([リアルな地球と目印](realistic-and-markers.md) を見てください)。

## CDN のバージョンを選ぶ

バージョンのない CDN アドレスは、最新の公開版に付いていきます。このパッケージは 0.x で、マイナーバージョンで変わることがあります ([アップグレード](upgrading.md))。公開するものには、`@0.7.0` のような正確なバージョンを書いてください。

## Content-Security-Policy

厳しいポリシーのページでは、`script-src` に CDN のホストを入れてください。地球儀自体は、インラインのスタイルもスクリプトも使いません。共有コントロールの注意は、kazoku-ui の CSP のガイドにあります。
