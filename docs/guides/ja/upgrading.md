---
title: アップグレード
section: upgrading
order: 11
description: バージョンごとの変更点と、必要な対応です。パッケージは 0.x なので、マイナーバージョンの前にここを読んでください。
---

パッケージは 0.x なので、マイナーバージョン (0.5 から 0.6 など) で動きが変わることがあります。各リリースの内容は [変更履歴](../../../CHANGELOG.md) にあります。このページには、対応が必要なことだけを書きます。

## 0.7 へ: `look` 属性

`<chikyu-earth look="thick">` は、`style` 属性の新しい名前です。普通の HTML では `style="thick"` も今までどおり動くので、壊れるものはありません。React、Vue、Angular では `style` が CSS として読まれて動かないので、そこでは `look` を使ってください。

## 0.6 へ: 太陽、月、惑星

新しい任意のエントリーポイント `/space` (計算部分) と `/space/element` (`<chikyu-space>`) が加わりました。`astronomy-engine` は任意の依存パッケージで、宇宙の表示を使うときだけ入れます。平面の地球儀とリアルな地球は変わっていません。

## 0.5 へ: リアルな地球と目印

新しいエントリーポイント `/realistic`、`/realistic/element`、`/markers` が加わりました。平面の地球儀は変わっていません。`three` と `@johnmorrisdotca/kazoku-ui` は任意の依存パッケージで、リアルな地球を使うときだけ入れます。

## 0.4 へ: chizu の輪郭

輪郭、名前、コードは `@johnmorrisdotca/chizu/world-geo` から来ます。177 か国で、コードのない3か所は `alpha2` が null です。`COUNTRIES` を使っているコードは、新しい数を想定してください。
