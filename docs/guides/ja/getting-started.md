---
title: はじめに
section: tutorial
order: 1
description: ページに地球儀を置き、中心を決め、見る人が回せるようにするまでを、5分ほどで進めます。
---

このガイドでは、ページに地球儀を置き、東京を中心にして、見る人が回したり傾けたり拡大したりできるようにします。必要なのはテキストエディターとブラウザーだけです。何もインストールしません。ページが CDN からパッケージを読み込みます。

## 1. 地球儀のあるページ

次の内容を `globe.html` という名前で保存して、開いてください。`<chikyu-earth>` タグが地球儀です。その上にあるスクリプトが、このタグを動かします。

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

地球儀は SVG で、Natural Earth の国の輪郭から描かれます。中心は `center` 属性で決めます。値は「経度,緯度」の形です。`center` を書かないと、ブラウザーが見る人の場所を尋ね、その場所が中心になります。見る人が答えるまで、または断った場合は、グリニッジ子午線が中心です。

`look` は `line` (細い線。初期値) か `thick` (太い線) です。`graticule` を付けると、経線と緯線が入ります。`size` は幅と高さで、単位はピクセルです。

## 2. 見る人が回せるようにする

地球儀は、何もしなくても自分で動かせます。要素が kazoku-ui の操作を持っているので、ドラッグで回り、2 本の指でつまんで拡大縮小でき、Ctrl を押してホイールを回すとズームします (「全体」でのふつうのホイールはページをスクロールします)。フォーカスすると、矢印キー、`+`、`-`、`0` も使えます。範囲は「全体」の 10 分の 1 から 20 倍です (各範囲とその理由は[ズーム、移動、回転](zoom-and-pan.md)にあります)。`controls="none"` で操作を外せます。

ボタン、スライダー、速さの選択、全体表示、アドレスへの保存が欲しいときは、共有の [kazoku-ui](https://github.com/johnmorrisdotca/kazoku-ui) のビューコントロール (バー) を要素に付け、その結果をリスナー1つで地球儀に渡します。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth with the shared controls</title>
    <script type="module">
      import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/kazoku-ui/view-controls/define/+esm";
      import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/element/+esm";

      const earth = document.querySelector("chikyu-earth");
      document.querySelector("kazoku-view-controls").addEventListener("kazoku-viewchange", (event) => {
        earth.setView(event.detail, event.detail.final, event.detail.reason !== "auto");
      });
    </script>
  </head>
  <body>
    <chikyu-earth id="earth" size="420" look="thick" center="139.7,35.7" tabindex="0"></chikyu-earth>
    <kazoku-view-controls for="earth" address grab-radius="fit" controls="advanced" tilt-max="90" speed="0.004178"></kazoku-view-controls>
  </body>
</html>
```

`setView(view, final, live)` は、コントロールのカメラを受け取ります。操作の途中は `final` が false で、軽い変形だけを行います。操作が落ち着くと true になり、正射図法をもう一度描きます。`live` は、手がビューに触れていること (自動で回るとき以外) を伝えます。その間は回している最中も正射図法を描き直し、1秒に30回までなので、地球儀はポインターについてきます。自動で回るときは、約1秒に1回描きます。自動で回る速さは、地球と同じ毎秒 `0.004178` 度で、恒星日で1回転します。動きを減らす設定の人には、コントロールが止めたままにします。

## 3. 次に読むもの

- バンドラーやフレームワークで使う: [バンドラー](bundlers.md)、[フレームワーク](frameworks.md)
- 自分のスクリプトなしで、ほかのページに表示する: [iframe で埋め込む](embed-in-an-iframe.md)
- サーバーで描く、または型を使う: [TypeScript と Node](typescript-and-node.md)
- 宇宙から見た地球と、好きな場所の目印: [リアルな地球と目印](realistic-and-markers.md)
- 表示されないとき: [困ったとき](troubleshooting.md)
