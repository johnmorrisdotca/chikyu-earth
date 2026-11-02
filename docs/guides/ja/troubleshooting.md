---
title: 困ったとき、よくある質問
section: troubleshooting
order: 10
description: 何も表示されない、ブラウザーが位置情報を尋ねる、フレームワークやサーバーで出るエラーについて説明します。
---

## 何も表示されない

- **普通のページで、スクリプトタグの中に `import "@johnmorrisdotca/chikyu-earth/element"` と書いた。** ブラウザーはパッケージ名を解決できません。CDN のアドレス ([普通の HTML](html-and-cdn.md))、import map、またはバンドラー ([バンドラー](bundlers.md)) を使ってください。
- **タグに大きさがない。** `<chikyu-earth>` は `display: block` で、幅は `size` 属性 (初期値 320) です。flex や grid の中では、幅を指定してください。
- **スクリプトがモジュールではない。** `<script type="module">` を使ってください。
- **コンソールに「タグが定義されていない」と出る。** import がまだ動いていないか、要素の登録の前にフレームワークが未知のタグを取り除いています。[フレームワーク](frameworks.md) を見てください。

## ブラウザーが位置情報を尋ねる

`center` がないと、要素は見る人の場所を中心にするので、ブラウザーが尋ねます。`center="経度,緯度"` を書けば、尋ねません。iframe の埋め込みは、`center=me` と書かない限り、尋ねません。

## 「HTMLElement is not defined」と出る、またはサーバーの描画が失敗する

要素をサーバーで import しています。`/element` は、ブラウザーで動くコードの中だけで import してください ([フレームワーク](frameworks.md))。サーバーでは `globe()` で描きます ([TypeScript と Node](typescript-and-node.md))。

## React で「The `style` prop expects a mapping」と出る

`style` ではなく `look` を使ってください。

## Vue で「Maximum call stack size exceeded」と出る

`ChikyuEarth.vue` というファイルは、テンプレートに `<chikyu-earth>` と書くと自分自身を描きます。ファイル名を変えてください。

## Vue で「Failed to resolve component: chikyu-earth」と出る

このタグがカスタム要素だと、コンパイラーに教えます。[フレームワーク](frameworks.md) の `isCustomElement` を見てください。

## リアルな地球が「WebGL が必要」と言う、または空白のまま

ブラウザーや GPU が WebGL のコンテキストを渡していません (使えない GPU、リモートデスクトップ、プライバシーの設定など)。要素は `chikyu-unavailable` を送ります。デモは、かわりに線の地球儀を表示します。画面が空白で、コンソールに 404 が出ているときは、`texture-base` が間違っています。`day-1024.webp` などの画像があるフォルダーを指す必要があります。

## リアルな地球を2つ置くと、片方が古い絵のまま

WebGL のコンテキストは、決まりとして1つを共有します。地球を押すかフォーカスすると、そちらがコンテキストを使います。もう片方は、それまで最後の絵を表示します。

## バンドルが大きい

パッケージ全体ではなく、使うエントリーポイントだけを import してください。タグなら `/element`、`globe()` なら本体のエントリーです。輪郭のデータは、どちらでも約 100 KB です。リアルな地球の画像は、リアルな地球を表示するページでだけ読み込まれます。
