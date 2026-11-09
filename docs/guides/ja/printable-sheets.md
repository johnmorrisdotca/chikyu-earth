---
title: 印刷できるシート
section: how-to
order: 10
description: 色をぬる地球と世界地図、「わたしの国」のシート、日にちと時間に合わせた昼と夜、季節。A4、USレター、A3、タブロイドで、英語と日本語で印刷できます。子ども向けの太い線と大きな文字、できあがりの PDF もあります。
---

`/sheets` は、このパッケージ自身の輪郭と太陽の位置から、印刷できるものを5つ描きます。どれも1つの SVG 文字列で、長さはミリメートルです (絵の1 mm は紙の1 mm です)。ブラウザーも依存パッケージもいりません。

- **地球** (`globeSheetSvg`): 地球の片側を大きな円で描き、大陸を太い線で囲んで、大陸と海の名前をその場所に書きます。向きは `americas`、`europe-africa`、`asia-oceania` の3つです。線は大陸の海岸だけです。同じ大陸の国と国の境の線はないので、子どもは大陸ぜんぶに色をぬれます。ロシアはウラル山脈 (東経60度の線) で分けてあり、シベリアはアジアに入ります。
- **世界地図** (`worldMapSvg`): すべての陸地を1枚の平らな地図 (ナチュラルアース図法) に描き、7つの大陸と5つの海の名前を書きます。
- **わたしの国** (`countrySheetSvg`): 国の輪郭を、場所が許すかぎり大きく描きます。首都を渡すと、首都に星と名前を付けます。旗をかく箱もあります (シートに旗は載りません)。事実は3つで、大陸、接している国 (描いてある陸地だけで数えるので、フランスのギアナの隣の国は入りません)、首都です。
- **昼と夜** (`dayNightSvg`): 右から太陽の光が来る地球です。光が当たる半分は白、暗い半分は斜めの線で塗ります。日にちと時間は自分で決められます。太陽が真上に来る場所はパッケージ自身のもの (リアルな地球が光を決めるのと同じ `subsolarPoint`) で、昼と夜の境の線は、そこから90度はなれた大円 (`terminator`) です。
- **季節** (`seasonsSvg`): 太陽のまわりの4か所 (3月、6月、9月、12月。1方向にまわる) の地球です。軸は23.4度かたむいて、4か所とも同じ向きです。だから6月は北が太陽のほうに、12月は太陽と反対にかたむきます。それぞれの地球の暗い半分は斜めの線です。

```js
import { countrySheetSvg, dayNightSvg, globeSheetSvg, seasonsSvg, terminator, worldMapSvg } from "@johnmorrisdotca/chikyu-earth/sheets";

// Every sheet is a string of SVG measured in millimetres, drawn for the room it will print in (the body of an A4 page is about 184.6 by 180 mm).
const room = { widthMm: 184.6, heightMm: 180, lang: "en" };
const sheets = {
  globe: globeSheetSvg("europe-africa", room),
  map: worldMapSvg(room),
  japan: countrySheetSvg("JP", { ...room, capital: { name: "Tokyo", lon: 139.69, lat: 35.69 } }),
  night: dayNightSvg(Date.UTC(2026, 5, 21, 12), room),
  seasons: seasonsSvg(room),
};
console.log(Object.keys(sheets).join(" "), Object.values(sheets).every((svg) => svg.startsWith("<svg")));

// The line between day and night at that moment: points 90 degrees from the place where the Sun is straight overhead.
console.log(terminator(Date.UTC(2026, 5, 21, 12), 6).map(([lon, lat]) => `${lon.toFixed(0)},${lat.toFixed(0)}`).join(" "));
```

## 関数

| 関数 | 返すもの |
|---|---|
| `globeSheetSvg(view, options)`、`GLOBE_VIEWS` | 地球のシートと、用意してある3つの向き |
| `worldMapSvg(options)` | 世界地図 |
| `countrySheetSvg(code, options)`、`countryShape(code)`、`countryCodes()` | 「わたしの国」のシート (輪郭がない国コードは `undefined`)、その元になる形 (陸地、大陸、となりの国)、輪郭がある国コード |
| `dayNightSvg(ms, options)`、`terminator(ms)`、`dayNightView(ms)` | 昼と夜のシート、昼と夜の境の線 (経度と緯度)、シートの上の地球の向き |
| `seasonsSvg(options)`、`TILT_DEGREES` | 季節のシートと、そこに描く地軸のかたむき |
| `continentLines()`、`landShares()` | 大陸の海岸の線と、地球のうち陸地がどれだけか、陸地のうち各大陸がどれだけか (輪郭から計算: アジア30%、アフリカ20%、ヨーロッパ7%) |
| `earthFacts`、`dayNightFacts`、`seasonsFacts`、`countryFacts`、`TITLES`、`SAY`、`PLACES` | 言葉: 各シートの3つの事実とタイトル、ブランドと出典、大陸と海の名前 (日本語つき) |
| `thickPath`、`hatchPath` | 線の下ごしらえ: 太い線のために単純にした線と、形の中だけの斜線 |

`options` は `{ widthMm, heightMm, lang, type }` です。絵の場所の大きさ、`en` か `ja`、そして `kid` (外の線3 mm、中の線2.5 mm、名前24 pt、事実18 pt) か `normal` (細い線、小さな文字) です。入りきらない名前は書きません。

## 絵のまわりのページ

絵はシートの本文です。ヘッダー (ブランド、パッケージ名、タイトル、「なまえ:」の箱) とフッター (出典、バージョン、日にち、デモに戻る QR コード) は [kazoku-ui の印刷パーツ](https://github.com/johnmorrisdotca/kazoku-ui/blob/main/docs/guides/print.md) のものです。このパッケージは kazoku-ui に依存しないので、デモが作っています。まず見えない場所でシートを1回レイアウトして、本文の大きさを測り、その大きさを関数に渡します。

```ts no-run
import { buildSheet, printCss, printSheet } from "@johnmorrisdotca/kazoku-ui/print";
import { SAY, TITLES, globeSheetSvg } from "@johnmorrisdotca/chikyu-earth/sheets";

const layout = { page: "a4", type: "kid", language: "en" } as const;
const holder = document.createElement("div");
holder.style.cssText = "position:absolute;inset:0";
const sheet = buildSheet({ ...layout, brand: "Space Program X", packageName: SAY.en.pack, title: TITLES.globe("americas", "en"), credits: SAY.en.credits, pages: [holder] });

// lay it out out of sight once, to read the body's size
const style = document.createElement("style");
style.textContent = printCss(layout);
document.head.append(style);
sheet.style.cssText = "position:fixed;left:-10000px;visibility:hidden";
document.body.append(sheet);
const body = sheet.querySelector(".kazoku-body")!.getBoundingClientRect();
sheet.style.cssText = "";
holder.innerHTML = globeSheetSvg("americas", { widthMm: (body.width * 25.4) / 96, heightMm: (body.height * 25.4) / 96, lang: "en" });
document.body.append(sheet);
printSheet(sheet);
```

## 白黒で印刷

線はすべて白い紙に黒です。地球の夜の半分は灰色ではなく斜めの線なので、家の白黒プリンターでもそのまま印刷できます。斜線はパターン塗りではなく、ふつうの線なので、どのブラウザーでも同じように印刷されます。

## 場所

デモの国えらびでは、首都を `kuni` から、かいた絵とくらべる旗を `hata` から使っています。どちらもデモの中だけで、このパッケージは使っていません。首都は `capital: { name, ja, lon, lat }` で渡します。渡さないときは、シートが「首都をさがして星をかこう」と聞きます。旗はシートには載りません。

## できあがりの PDF

Pages のビルドが、デモから PDF を作ります。地球の3つの向き、世界地図、季節、春分・夏至・秋分・冬至の昼と夜、12か国の「わたしの国」を、A4 と US レターで、英語と日本語で。[英語の一覧](https://johnmorrisdotca.github.io/chikyu-earth/pdf/) と [日本語の一覧](https://johnmorrisdotca.github.io/chikyu-earth/pdf/ja.html)。

## どう確かめているか

ブラウザーなしで: 4つの紙 (A4、USレター、A3、タブロイド)、2つの言葉、2つの文字の大きさのすべてでシートを作り、おかしな数がないこと。線は2.5 mm 以上で、外の線は3 mm。陸地の割合を知られた値と比べること (陸地29%、アジア30%、ヨーロッパ7%、アフリカ20%)。同じ大陸の国と国の境の線がないこと。文字がすべて絵の場所の中に入ること。輪郭のある国ぜんぶのシートが収まること。昼と夜の線をパッケージ自身の太陽の位置と、さらに astronomy-engine と、2つの日にちで比べること (斜線をシートから読み戻して、端がすべて夜の側にあること)。季節の軸が地球のかたむきと同じで、6月は太陽のほうに、12月は反対にかたむくこと。Chromium と WebKit ではデモを動かし、Chromium では各シートを4つの紙で PDF に印刷して、紙の大きさとページ数 (1ページ) を読みます。
