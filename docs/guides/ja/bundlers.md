---
title: バンドラーで使う: Vite、webpack、ES モジュール
section: how-to
order: 3
description: パッケージをインストールして、Vite や webpack のプロジェクト、または ES モジュールの環境で要素を import します。
---

インストールします。

```sh
npm install @johnmorrisdotca/chikyu-earth
# または: pnpm add @johnmorrisdotca/chikyu-earth
# または: yarn add @johnmorrisdotca/chikyu-earth
```

すべて ES モジュールで、エントリーポイントごとに分かれているので、バンドラーは import したものだけを含めます。`@johnmorrisdotca/chikyu-earth` (SVG の文字列と補助関数)、`/element` (`<chikyu-earth>` タグ)、`/markers`、`/realistic`、`/realistic/element` があります。`/element` を import すると、タグが1回だけ登録されます。

## Vite

ページです。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chikyu Earth with Vite</title>
  </head>
  <body>
    <chikyu-earth id="earth" center="139.7,35.7" look="thick"></chikyu-earth>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

スクリプトです。要素を import するとタグが登録されます。ほかは普通の DOM の操作です。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/element";
import { globe } from "@johnmorrisdotca/chikyu-earth";

const earth = document.querySelector("chikyu-earth")!;
earth.setAttribute("graticule", "");
console.log(globe({ size: 64 }).startsWith("<svg"));
```

プロジェクトは `npm create vite@latest` で作れます。地球儀に必要なのは、この2つのファイルだけです。Vite は設定なしでこのエントリーをビルドします。リアルな地球の画像は自分でコピーします ([リアルな地球と目印](realistic-and-markers.md))。

## webpack

エントリーです。

```js no-run
import "@johnmorrisdotca/chikyu-earth/element";

const earth = document.createElement("chikyu-earth");
earth.setAttribute("center", "139.7,35.7");
earth.setAttribute("look", "thick");
document.body.append(earth);
```

`webpack.config.mjs` です。webpack 5 は、`exports` を持つパッケージに特別な設定が要りません。

```mjs no-run
import { fileURLToPath } from "node:url";

export default {
  mode: "production",
  entry: "./src/index.js",
  output: { path: fileURLToPath(new URL("./dist", import.meta.url)), filename: "main.js" },
};
```

`npx webpack` を実行し、できた `dist/main.js` をページから読み込みます。

## ほかのツール

`package.json` の `exports` を読めるツールなら、同じように使えます。Rollup、esbuild、Parcel、Bun、Deno (`npm:@johnmorrisdotca/chikyu-earth/element`) などです。パッケージは普通の ES2022 で、副作用があるのは `./element` のエントリーだけです。それは `package.json` の `sideEffects` に書いてあるので、ツリーシェイキングで残りは取り除かれます。
