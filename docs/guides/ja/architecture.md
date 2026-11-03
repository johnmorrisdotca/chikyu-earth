---
title: アーキテクチャ
section: explanation
order: 11
description: 平面の地球儀、宇宙から見た地球、目印、宇宙の表示がどう組み合わさっているか、どこが純粋でどこが任意かを説明します。
---

Chikyu Earth は、小さな中核と4つの任意の層でできています。各層は独立したエントリーポイントなので、線画の地球儀だけがほしいページは、その分だけを負担します。

## 中核：純粋な関数と小さな要素

`globe(options)` は SVG の文字列をひとつ返します。正射図法の円盤、その上の国の輪郭、縁取りです。この関数は純粋で、時計も DOM も使わず、同じオプションなら同じマークアップを返します。そのため、サーバーでも、テストでも、要素の中でも動きます。

```ts
import { COUNTRIES, globe } from "@johnmorrisdotca/chikyu-earth";

const svg = globe({ size: 240, style: "thick", centre: { lon: 139.7, lat: 35.7 }, graticule: true });
console.log(svg.startsWith("<svg"), COUNTRIES.features.length, "countries");
```

輪郭はこのパッケージには入っていません。chizu の `world-geo`（Natural Earth 1:110m、パブリックドメイン）を、読み込み時に一度だけ整形して使います。実行時には何も取得しません。実行時の依存パッケージは d3-geo と chizu だけです。

## 見た目は表の1項目

見た目で変わるのは線と塗りだけで、形は変わりません。`STYLES` には `line` と `thick` の項目がひとつずつあり、色は同じファミリーのほかの図と同じです。それ以外の値は初期値に戻されます（`cleanStyle`）。

```ts
import { cleanStyle, DEFAULT_STYLE, STYLE_NAMES } from "@johnmorrisdotca/chikyu-earth";

console.log(STYLE_NAMES, cleanStyle("neon"), DEFAULT_STYLE);
```

## ビューはカメラで、投影に対応づけられる

共有のビューコントロール（kazoku-ui）は、カメラ `{ yaw, tilt, zoom, panX, panY }` を伝えてきます。`projectionView` はそれを d3-geo の正射投影に対応づけます。yaw は基準の経度から地球を軸まわりに回し、tilt は基準の緯度から極の方へ傾け、zoom は拡大率を掛け、pan は平行移動を足します。yaw、tilt、pan がなければ、ビューは基準の中心になり、Fit は zoom が1の状態です。この対応づけは純粋で、単独でテストされています。

```ts
import { HOME_VIEW, projectionView } from "@johnmorrisdotca/chikyu-earth";

const view = projectionView({ lon: 139.7, lat: 35.7 }, 420, { ...HOME_VIEW, yaw: 30, zoom: 2 });
console.log(view.rotation, view.scale, view.translate);
```

## 地球自身の速さ

自動で回すときの速さは選べません。地球自身の速さを使います。恒星日は23時間56分4.0905秒なので、地球儀は毎秒0.004178度で回り、実際の時間と合います。

```ts
import { DEGREES_PER_MS, SIDEREAL_DAY_MS, spinAt } from "@johnmorrisdotca/chikyu-earth";

console.log((SIDEREAL_DAY_MS / 3_600_000).toFixed(4), "hours;", (DEGREES_PER_MS * 1000).toFixed(6), "degrees a second;", spinAt(SIDEREAL_DAY_MS / 4), "degrees in a quarter day");
```

## 要素は必要なときだけ描く

`<chikyu-earth>` は状態を持ち、何かが変わったときだけ再描画を求めます。操作の最中は変形をひとつ動かすだけで、操作が落ち着くと SVG を最初から描き直します。スタイルは constructable stylesheet としてシャドウルートに書き込まれるので、厳格なコンテンツセキュリティポリシー（`style-src 'self'`）でも許可されます。

## 4つの任意の層

| エントリーポイント | 加わるもの | 必要なもの |
| --- | --- | --- |
| `/realistic` と `/realistic/element` | 宇宙から見た地球：本物の太陽による昼と夜、街の明かり、海の太陽の反射、雲、大気。 | `three` |
| `/markers` | `attachMarkers`：どちらの地球儀にも目印、まとめ表示、ラベルを付けます。投影、まとめ、ラベルの配置は純粋です。 | 追加なし |
| `/space` と `/space/element` | `<chikyu-space>`：ある日時の地球、月、太陽、惑星の位置。 | `three`、`astronomy-engine` |
| `/satellites` | 軌道要素（SGP4）から求める人工衛星の位置と、動く天体にカメラを載せる機能。 | `satellite.js` |

純粋な部分はどれもサーバーで読み込めます。three.js を使う部分は、kazoku-ui の**共有レンダラー**を通ります。WebGL コンテキストはページにひとつで、どの要素が描いても同じものを使い、最後の要素がページから外れて1秒後に解放されます。宇宙の表示と人工衛星は、毎フレーム計算し直す代わりに、1秒離れた2つの計算結果のあいだを補間します。

## しないこと

- 実行時に、輪郭、名前、そのほかのデータを取得すること。
- 何も変わらないのにフレームのループを回すこと、画面外や隠れたタブで描くこと、1辺4096ピクセル・合計600万ピクセルを超えるキャンバスを作ること。
- `style` 属性から見た目を読むこと。HTML では本物の CSS であり、React では壊れるので、見た目は `look` で指定します。[軽さを保つしくみ](how-it-works.md)を参照してください。

制限の全体は[軽さを保つしくみ](how-it-works.md)に、各層は[リアルな地球と目印](realistic-and-markers.md)にあります。
