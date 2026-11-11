---
title: 地球周回軌道にある物体のカタログ
section: how-to
order: 16
description: 軌道要素から軌道の分類を求め、物体の種類、それぞれの色と凡例、衛星群、そして最大20万件を一度に読めるパック形式のファイルを扱います。データはパッケージに含まれていません。
---

地球のまわりには、公開された軌道要素をもつ登録済みの物体がおよそ3万2千個あり、そのうち運用中の人工衛星は半分に届きません。残りは運用を終えた衛星、役目を終えたロケットの段、そしてデブリ（宇宙ごみ）です。`@johnmorrisdotca/chikyu-earth/catalogue` は、この全体像のうち、データなしで使える部分をまとめたものです。軌道の分類、物体の種類、色と凡例、衛星群、そしてカタログ全体をおさめる小さなファイル形式が入っています。軌道要素そのものは、選んだ提供元からデータの入口を通して渡します。要素は数日で古くなるので、パッケージには入れていません。

## エントリーポイントの中身

```js
import { classOfElements, gzipBytes, legend, packCatalogue, readCatalogueRecords, unpackAny } from "@johnmorrisdotca/chikyu-earth/catalogue";

// Two made-up rows in the shape Space-Track's GP class answers (OMM as CSV), the second with a six-digit catalogue number.
const csv = [
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,NORAD_CAT_ID,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT,OBJECT_TYPE,COUNTRY_CODE,LAUNCH_DATE,RCS_SIZE",
  "MADE-UP COMSAT,2020-010A,2026-11-08T04:12:35,1.0027,0.0002,0.05,120.5,80.25,10.75,45678,0.0001,0.000001,0,PAYLOAD,FR,2020-02-02,LARGE",
  "MADE-UP DEB,2026-060C,2026-11-08T04:12:35,14.9,0.01,82,120.5,80.25,10.75,100123,0.0001,0.000001,0,DEBRIS,PRC,2026-07-09,SMALL",
].join("\n");
const { records } = readCatalogueRecords(csv);

// The class of each orbit, from its elements alone.
for (const { set, kind } of records) console.log(set.OBJECT_NAME, kind, classOfElements(set.MEAN_MOTION, set.ECCENTRICITY));

// Packed, gzipped and read back: the file a site hosts, and the legend a page shows beside it.
const file = await unpackAny(await gzipBytes(packCatalogue(records, { group: "example" })));
console.log(file.count, file.norad[1], file.recordAt(1).owner, legend("kind", "en").map((line) => line.label).join(", "));
```

- **軌道の分類**は、どの要素にもある2つの数、平均運動と離心率から決まります。`classOfElements(meanMotion, eccentricity)` を使います。高さも知りたいときは `orbitShape` から `orbitClass` へ進みます。しきい値はこのパッケージが決めたもので、`CLASS_LIMITS` と `CLASS_LABELS` に書いてあります。高さは、平均半径 6,371 km の地球の表面からの高さです。
  - **高楕円軌道**（`heo`）: 離心率が 0.25 以上。高さは問いません。
  - **低軌道**（`leo`）: 最も高い点が 2,000 km 未満。
  - **静止軌道**（`geo`）: 最も低い点も最も高い点も、高度 35,786 km ±1,500 km の範囲内。
  - **中軌道**（`meo`）: 最も低い点が 2,000 km 以上で、最も高い点が 34,286 km 未満。測位衛星がここに入ります。
  - **その他**（`other`）: 上のどれにも当てはまらないもの。静止軌道のさらに外側や、分類のあいだにあるものです。
- **物体の種類**は、カタログの物体種別から決めます。`readKind` は Space-Track の `PAYLOAD`、`ROCKET BODY`、`DEBRIS`、`TBA`、または短い記号 `PAY`、`R/B`、`DEB`、`UNK` を読みます。それ以外は種類不明です。
- **色と凡例**は、軌道の分類ごと、種類ごとにあります。`legend("class", lang)` と `legend("kind", lang)` が、凡例に並べる順にラベルと色を返します。言語は `en` か `ja` です。`CLASS_COLOURS` と `KIND_COLOURS` は暗い背景向けに選んだ色そのものです。
- **衛星群**: `FLEETS` は、Starlink、OneWeb、GPS、Galileo、GLONASS、BeiDou、Iridium、宇宙ステーションを、名前のパターンで見分けます。`fleetOf(name, kind)` はその物体がどの群に属するかを返します（群に入るのは人工衛星だけです）。`countFleets` は群ごとの数を数えます。フィルターに表示される「N / M」は、この数です。名前から群がわからない衛星は、どの群にも入りません。

## パック形式のファイル

`packCatalogue(records, meta)` は、各レコードを数値ごとの列と名前の表にして書き出します。1件あたりおよそ95バイト、gzip で約37バイトなので、3万2千件は展開して3 MB、ダウンロードはおよそ1.2 MB です。軌道要素の元期はマイクロ秒まで、平均運動はそのまま保ち、角度は32ビット浮動小数点の精度（約0.00003度）です。これは軌道要素の精度に比べて十分に細かい値です。カタログ番号は 4,294,967,295 まで入るので、99,999 のあとに増えた6桁の番号もそのまま入ります。6桁の番号を運べるのは OMM だけで、`readCatalogueRecords` は、Space-Track の GP クラスの項目（`OBJECT_TYPE`、`COUNTRY_CODE`、`LAUNCH_DATE`、`RCS_SIZE`）が軌道要素に添えられた OMM を、JSON でも CSV でも読めます。

- 1つのファイルに入るレコードは最大20万件で、データの入口が受け取れる上限と同じです。これを超える件数を名乗るヘッダーは受け付けません。展開すると 64 MB を超える gzip も受け付けません。
- `gzipBytes` と `unpackAny` はウェブ標準の `CompressionStream` を使うので、同じコードがブラウザーと Node 18 以降で動きます。`unpackAny` は先頭の2バイトから gzip かどうかを見分けます。
- 読み込みは列ごとです。`file.norad` や `file.meanMotion` などは型付き配列で、`setAt(i)` や `recordAt(i)` は求められたレコードの分だけオブジェクトを作ります。

## データの入口でパックファイルを読む

`@johnmorrisdotca/chikyu-earth/door` の `packedElementsFrom(url, info)` は、指定したアドレスのパックファイルを読むレコードソースです。軌道要素は最大20万組、リクエストは1回だけで、クッキーもリファラーも送りません。使えるのは `https` だけ（`localhost` では `http` も可）で、200 以外の応答や大きすぎる応答は読み込み失敗として扱い、やり直しはしません。`info` にそのデータの出どころを書くので、出典は画面上でほかの出典と並んで表示されます。

```ts no-run
import { packedElementsFrom } from "@johnmorrisdotca/chikyu-earth/door";

const debris = packedElementsFrom("https://example.org/catalogue/debris.pack.gz", {
  id: "catalogue-debris",
  name: { en: "Debris in Earth orbit", ja: "地球周回軌道のデブリ" },
  credit: { en: "Data from Space-Track.org (USSPACECOM)", ja: "データ：Space-Track.org（USSPACECOM）" },
  licence: { name: "Space-Track basic SSA data, with citation", url: "https://www.space-track.org/documentation" },
  url: "https://www.space-track.org",
  retrieved: "2026-11-11",
});
console.log(debris.info.id);
```

`readPackedFrom(url)` は同じリクエストをして、ファイル全体を返します。物体の位置だけでなく、種類、所有国、打ち上げ日も表示したいページで使えます。

## ファイルを作る

このリポジトリの `scripts/catalogue.ts` は、サイトが公開する4つのファイルを作ります。`working`、`inactive`、`rocket-bodies`、`debris`（どれも `.pack.gz`）と、`manifest.json` です。マニフェストには、提供元と出典表記 `Data from Space-Track.org (USSPACECOM)`、各群の件数、軌道要素を取得した時刻が入ります。これはデモのサイトのためのスクリプトで、パッケージには含まれません。決まりは次のとおりです。

- **ログインは1回、リクエストは2回。** 軌道上のすべての物体を1回のリクエストで取得し（Space-Track 自身が示す、位置を計算できる物体の絞り込みを使います）、少し間をおいて、17:00 UTC 以降に限り SATCAT を1回リクエストします。200 以外の応答が返った時点で、それ以降のリクエストはしません。
- **運用中と運用終了の人工衛星**は、運用中の衛星の一覧で分けます。Space-Track には、人工衛星がまだ動いているかを示す項目がないからです。スクリプトは CelesTrak の「アクティブな衛星の一覧」から、カタログ番号だけを1回のリクエストで取り、ほかには何も残しません。
- **Space-Track が応答しないとき**は、前回のファイルをそのまま使い、ログにその古さを書きます。
- **総数は正直に**、「公開された軌道要素をもつ登録済みの物体」と書きます。宇宙にあるすべてではありません。どの物体にも、軌道要素が何日前のものかが付いています。

定期実行する workflow が1日に1回このスクリプトを動かし、サイトがそのファイルを公開します。ページは `packedElementsFrom` で読み込みますが、読むのはスイッチを入れた群だけなので、最初の読み込みは小さいままです。
