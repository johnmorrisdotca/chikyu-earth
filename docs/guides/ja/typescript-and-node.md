---
title: TypeScript、Node、サーバー
section: how-to
order: 6
description: パッケージの型を使い、サーバーで地球儀を SVG の文字列として描き、それを含むページを作ります。
---

## 型

パッケージは自分の型定義を含んでいるので、ほかに入れるものはありません。ブラウザー用の部分には、DOM のライブラリーが要ります (`tsconfig.json` の `"lib": ["dom"]`)。

```ts
import { COUNTRIES, countryList, globe, type CountryProps, type GlobeOptions } from "@johnmorrisdotca/chikyu-earth";
import type { ChikyuEarth } from "@johnmorrisdotca/chikyu-earth/element";
import { attachMarkers, type MarkerInput } from "@johnmorrisdotca/chikyu-earth/markers";

const options: GlobeOptions = { size: 240, style: "thick", centre: { lon: 139.7, lat: 35.7 } };
const svg: string = globe(options);
const japan: CountryProps | undefined = countryList().find((country) => country.alpha2 === "JP");
console.log(svg.length, japan?.name, COUNTRIES.features.length);

export function mark(earth: ChikyuEarth): void {
  const tokyo: MarkerInput = { id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo" };
  attachMarkers(earth).add(tokyo);
}

// @ts-expect-error "neon" is not a look
globe({ style: "neon" });
```

`@ts-expect-error` の行は、型が働く様子を示しています。パッケージにない見た目は、ビルドのときにエラーになります。実行時には、知らない値でもエラーにはなりません。外から来る値 (属性やクエリーパラメーター) は、`cleanStyle` で初期値に戻されます。

## サーバーで、DOM なしで

`globe()` は純粋な関数です。同じ引数なら同じマークアップを返し、DOM もブラウザーの機能も使いません。なので、サーバー、ビルド、テストで、ブラウザーと同じ地球儀を描けます。次の例は、パッケージのテストが Node で実行しています。

```mjs
import { countryList, globe } from "@johnmorrisdotca/chikyu-earth";

// A server draws the same SVG a browser does: pure, no DOM, no browser globals.
const svg = globe({ size: 240, rotation: [-139.7, -35.7], style: "thick" });
const page = `<!doctype html><title>The Earth</title>${svg}`;
console.log(page.length, countryList().length);
```

できた SVG の文字列は、どんなページにも入れられます。すべての国を含めると、約 130 KB のマークアップです。もっと小さくしたいときは、`size` を小さくするか、拡大した表示にします。または、ブラウザーで要素を使い、サーバーからは何も送りません。

## サーバーで使えるエントリーポイント

| エントリーポイント | サーバーで |
|---|---|
| `@johnmorrisdotca/chikyu-earth` | 使える: `globe()`、回転と表示の計算、`COUNTRIES`、`countryList()` |
| `/realistic` | 使える: 太陽の位置、画像の大きさ、フレームの制限 |
| `/markers` | import はできる。`attachMarkers` はブラウザーの要素が必要。投影、まとめ、ラベルの配置は純粋な計算 |
| `/element`、`/realistic/element` | 使えない: `HTMLElement` を継承するので、ブラウザーで import する |

## サーバーで描画するページ

フレームワークがサーバーで描画し、そのあとブラウザーで引き継ぐページでは、サーバーで要素を import してはいけません。[フレームワーク](frameworks.md) に、React、Vue、Svelte、Angular の、ブラウザー専用のフックの中で import する例があります。
