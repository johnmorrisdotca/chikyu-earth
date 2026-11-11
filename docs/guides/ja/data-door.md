---
title: "外部のデータを使う: データの入口"
section: how-to
order: 15
description: 自分で用意した地球の地図や軌道データを、ライセンスと出典つきの「ソース」としてパッケージに渡す方法、ソースを切る方法、いま画面にあるのは誰のデータかをページに示す方法を説明します。非営利のみや同一条件での共有を求めるデータも、呼び出す側からなら使えます。ライセンスは出典の横に表示されます。
---

パッケージは描くだけで、データはあなたが持ってきます。`@johnmorrisdotca/chikyu-earth/door` は、より細かい地球の地図や、人工衛星の軌道データの一覧を渡すための唯一の入口です。いま画面にあるのは誰のデータかも、同じ入口で示せます。ソースを渡さなければ、パッケージはこれまでどおり自分のデータで描きます。それは、地球全体の画像と、NASA の地図から切り出した細かい地図のタイルです (`OWN_SOURCES`。`NOTICE.md` の表をもとに書いてあります)。パッケージに同梱するのは、そのまま渡してよいと分かっているデータだけです。あなたのソースは、非営利のみのものでも、同一条件での共有を求めるものでもかまいません。その場合、出典の行には、ライセンスの横にそのことも表示されます。

型 (`SourceInfo`、`Licence`、`RecordSource`、`TileSource`、`Credit`、`MapPlace`、`ImageTile`) と4つの小さな関数 (`validateSource`、`creditLine`、`loadRecords`、`createTileStore`) は、ファミリー共通のデータの入口です。1つのファイル (`src/data-door.ts`。kazoku-ui の `templates/data-door.ts` を変えずにコピーしたもの) を、各パッケージに置いてあります。入口はこれらをそのまま再エクスポートしているので、import は1つで足ります。

## ソースは自分が誰かを名乗る

`info` がソースの素性を表します。`id` (小文字、数字、ハイフン。ビューの中で重複しないこと。パッケージ自身の `chikyu-pictures` と `chikyu-tiles` は使えません)、英語と日本語の `name` と `credit` (空は不可)、`licence` (名前とリンク。該当するときは `nonCommercial` か `shareAlike`)、ソースのページ、取得した日です。

```js
import { createSourceBook, creditLine, mapKeys, mergeElementSets, ownCredit } from "@johnmorrisdotca/chikyu-earth/door";

// A map of your own: here a day picture with no pictures behind it, only the keys it would answer. A real one fetches tiles, and says whose they are and under what licence.
const info = (id, name) => ({
  id,
  name: { en: name, ja: "私のデータ" },
  credit: { en: `${name}, A. Person (2026)`, ja: `私のデータ（A. Person、2026年）` },
  licence: { name: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/", nonCommercial: true },
  url: "https://example.org/mine",
  retrieved: "2026-11-11",
});
const myMap = {
  kind: "tiles",
  layer: "day",
  info: info("my-map", "My map"),
  need: (place, detail) => mapKeys(place, detail, undefined, "mine/"),
  load: async () => ({ width: 512, height: 512, image: { width: 512, height: 512 } }),
  bytes: (tile) => tile.width * tile.height * 4,
};

// An element keeps a book like this one: `earth.addSource(myMap)` is `book.addSource(myMap)`, and `passes.addSource(mine)` is the same for orbit data.
const book = createSourceBook();
book.addSource(myMap);
const mine = {
  kind: "records",
  info: info("my-orbits", "My orbits"),
  records: () => [
    { OBJECT_NAME: "ISS (ZARYA)", EPOCH: "2026-11-10T00:00:00", MEAN_MOTION: 15.49, ECCENTRICITY: 0.0007, INCLINATION: 51.6, RA_OF_ASC_NODE: 335.9, ARG_OF_PERICENTER: 339.3, MEAN_ANOMALY: 20.6, NORAD_CAT_ID: 25544, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0 },
    { OBJECT_NAME: "Broken", EPOCH: "2026-11-10T00:00:00", MEAN_MOTION: Number.NaN, ECCENTRICITY: 0, INCLINATION: 0, RA_OF_ASC_NODE: 0, ARG_OF_PERICENTER: 0, MEAN_ANOMALY: 0, NORAD_CAT_ID: 1, BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0 },
  ],
};
book.addSource(mine);
await book.ready();
const sets = mergeElementSets(book.elementLists());
console.log(`${sets.length} element set kept, ${book.stats().records["my-orbits"].skipped} left out: ${sets[0].set.OBJECT_NAME}`);
console.log(`the day map answers ${book.mapSources("day")[0].need({ lonMin: -10, lonMax: 10, latMin: -5, latMax: 5 }, 8192).join(", ")}`);
const credits = [ownCredit("chikyu-pictures", 1), { source: myMap.info, own: false, used: 6 }];
console.log(creditLine(credits, "en"));
console.log(creditLine(credits, "ja"));

book.enableSource("my-map", false);
console.log(`${book.mapSources("day").length} day maps with the source off`);
```

`createSourceBook` は、要素の中でソースをまとめて持つ部分です。要素の `addSource` は、上のコードの `book.addSource` と同じものです。ソースは追加したときに `validateSource` で調べられます。出典が空、ライセンスがない、id が重複している、地球が対応していないレイヤー、必要な関数がない、といったときは、最初の描画のときではなく、その場で `TypeError` になります。

## 地球の地図

地図のソースは、タイルのソースです。`need(place, detail)` は、ある場所に必要なタイルのキーを答えます。`load(key, signal)` はタイルを1枚取ってきて `ImageTile` (幅、高さ、画像) として返します。`bytes(tile)` は、予算のために、そのタイルがメモリに占める大きさを答えます。どのレイヤー用かも `layer` で名乗ります。`day` と `night` は、`<chikyu-earth-realistic>` がタイルを重ねる画像です。`clouds` と `water` は、地球全体のレイヤーとして受け付けますが、まだタイルにして描くことはしません (描かれないので、これらのソースは保持されても出典には載りません)。場所はファミリー共通の `MapPlace` (経度と緯度、単位は度) で、`detail` は地球一周あたりのピクセル数です。レベルの番号ではありません。タイルのピラミッドはパッケージ独自のものです。レベル L は、512ピクセルのタイルで一周 `1024 * 2^L` ピクセル、列は `2^(L+1)`、行は `2^L` です。列0は経度-180、行0は緯度90で、タイルのキーの末尾は `level/column/row` です。`mapKeys(place, detail, levels)` がそのキーを返すので、自分のソースの `need` はこれを使って作れます。ソースが持つレベルは、省略してもよい `levels(layer, signal)` で伝えます (省略するとレベル3と4、一周8192と16384ピクセルです)。地球は、必要なタイルごとに、そのタイルの場所をソースにたずね、そのタイルのレベル、列、行で終わるキーを使います。

あるレイヤーの地図ソースは、そのレイヤーについて、パッケージのタイルのフォルダの代わりになります。見えている範囲のタイルは、これまでどおり、パッケージ自身の4096ピクセルの画像の上に重ねられます。その画像は遠景として下に残ります。夜のタイルは昼のタイルといっしょに使います。夜のソースだけで昼のソースがなければ、何も描きません。1つのレイヤーに2つのソースがあるときは、あとから追加したほうが描かれます。

`earthTiles(base)` は、パッケージ自身のフォルダをソースにしたものです。`manifest.json` と、レイヤー、レベル、場所ごとのタイル `<layer>/<level>/<column>/<row>.webp` があります。これが `tiles` 属性の意味で、属性は短い書き方としてそのまま使えます。`tiles="/my-tiles/"` と `addSource(earthTiles("/my-tiles/"))` は同じです。

## 軌道データ

軌道要素のソースは、メモリに収まる一覧です。一覧は最大20万件 (`MAX_RECORDS`) で、ソースを追加したときに1回だけ読み込みます。1件は `ElementSet` です (CelesTrak や Space-Track が出している OMM の「GP」形式)。`elementsFrom(url, info)` は、あなたが選んだアドレスをソースにします。読み込みは `fetchElements` を通すので、その礼儀の決まりに従います (ソースを読むまでは何も問い合わせず、問い合わせは2時間に1回までです)。`<chikyu-passes>` は、ソースの軌道要素と、自分の `elements`、`elements-src` をまとめて通過を計算します。同じ衛星が2つの一覧にあるときは、エポックが新しいほうが使われます。使えない軌道要素 (有限でない数、文字でない名前、楕円でない軌道) は、除いて数えます。

## 要素で使う

`<chikyu-earth-realistic>` は地図のソースを、`<chikyu-passes>` は軌道データを受け取ります。呼び出しはどちらも同じです。

```js no-run
import { creditLine } from "@johnmorrisdotca/chikyu-earth/door";
import "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.querySelector("chikyu-earth-realistic");
const remove = earth.addSource(myMap); // checked at once; returns the way to take it away
earth.addEventListener("chikyu-creditschange", () => (credit.textContent = creditLine(earth.credits(), "en")));
earth.enableSource("my-map", false); // a layers panel's switch
```

`sources` はプロパティです (データは文字ではないので、属性にはしません)。一覧を代入するとソースが入れ替わり、1つでも断られたら何も変わりません。`removeSource(id)` と、`addSource` が返す `remove()` は、ソースを取り除きます。`enableSource(id, false)` はソースを切りますが、ビューには残します。属性 `data="own"` は、パッケージ自身のもの以外のソースをすべて一度に無視します。

## いま画面にあるのは誰のデータか

`credits()` は、直前に描いたフレームにタイルか衛星を1つ以上出したソースを、パッケージ自身のものを先にして並べます。地球全体の画像、見えている範囲に細かいタイルがあるときはそのタイル、そしてタイルを出したあなたのソースそれぞれです (`<chikyu-passes>` では、一覧に載った衛星を出したソース)。`creditLine(credits, "en" | "ja")` は、それぞれのライセンスを横に添えた1行にします。たとえば英語では `Earth pictures: NASA Earth Observatory (...) (Public domain); My map, A. Person (2026) (CC BY-NC 4.0; non-commercial).` となり、日本語では `地球の画像：NASA Earth Observatory（…）（パブリックドメイン）／私のデータ（A. Person、2026年）（CC BY-NC 4.0、非営利のみ）` となります。要素は、出典の組み合わせが変わったときに、`detail: { credits }` をつけた `chikyu-creditschange` を送ります (フレームごとではありません)。`<chikyu-passes>` は、一覧の下に、`credit` 属性のテキスト (これはそのまま残ります) に続けてこの行を表示します。デモの地球のページは、この行をビューの下に、ページの言語で出し、アドレスの `?data=own` を読みます。

## ソースを切る

`remove()`、`removeSource(id)`、`enableSource(id, false)`、`data="own"` は、どれも同じことをします。そのソースの読み込みを中止し (`AbortSignal`)、タイルと軌道要素を解放し、そのタイルの範囲を絵から外し、描き直し、出典を外します。絵は最初のものに戻ります。もう一度入れたソースは、もう一度読み込まれます。

## 上限

- **メモリ。** 1つのビューのタイルすべてに予算は1つ、`TILE_BUDGET` です。デコードしたタイル72MB (512ピクセルのタイルはミップマップ込みで1.4MB。ビューがこれまで持っていた48枚分) で、いちばん長く使われていないものから外し、見えている範囲が必要としているタイルは外しません。持っているものがすべて必要なときに届いたタイルは、入りきらないので断って数えます (`stats.tiles.refused`)。地球は、いま持っている絵を保ちます。テンプレート自身の既定は48MBですが、地球は、すでにある絵がタイルを失わないよう、それより大きくしています。
- **リクエスト。** 1つのレイヤーにつき、同時に行う読み込みは最大6つです。読み込みを始めるのは、ビューが変わったときだけで、止まっているあいだ入口は何も送りません。取得に失敗したタイルをもう一度求めるのは、そのタイルがいったん見える範囲を外れ、また入ってきたときだけです。一定時間ごとには再試行せず、見えているあいだも再試行しません。
- **不正なデータ。** 例外を投げる、空で返る、画像でない、大きさが数でないタイルは、`stats.tiles.failed` に数えて、描きません。有限でない数を含む軌道要素は、除いて数えます。
- **ライセンスの条件。** パッケージ自身のソースは、非営利のみでも同一条件での共有を求めるものでもなく、テストがそれを保証しています。呼び出す側のものは、どちらでもかまいません。その場合は出典の行がそう伝えます。

## 変わらないこと

属性も関数も、これまでどおりです。ソースがなければ、同じタイルから同じ絵を描き、`credits()` にはパッケージ自身のソースだけが出ます。`tiles`、`texture-base`、`elements`、`elements-src`、`credit` の意味は変わりません。1つだけ違うのは、取得できなかったタイルを30秒後にもう一度試すことはしなくなったことです。そのタイルがいったん見える範囲を外れ、また入ってきたときに試します。`stats.tiles` には小さな追加が3つあります。`heldBytes`、`refused`、`used` (見えているタイルの、ソースごとの数) です。
