---
title: 地点の真下を写した衛星画像
section: how-to
order: 23
description: 地点や衛星の真下の地上を写した、実際のNASAの衛星画像のアドレスを作ります。画像のない日に試す日付と、表示するクレジットも返します。
---

`@johnmorrisdotca/chikyu-earth/photos` は、緯度、経度、大きさ、日付から、実際の衛星画像（NASA GIBS、Worldview の元になっている画像）のアドレスを作り、NASAが求めるクレジット表記を返します。作るのは文字列だけで、取得も描画もしません。これを読み込まないページは、この部分を読み込みません。画像は読む人のブラウザーがNASAから直接取得します。APIキーもアカウントも不要で、NASAのサービスはどのページからの要求にも応じます。

## アドレス

```js
import { photoCredit, photoFallbacks, photoPieces, photoUrl } from "@johnmorrisdotca/chikyu-earth/photos";

const tokyo = { lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10", widthPx: 512 };
const url = new URL(photoUrl(tokyo));
const fiji = photoPieces({ lat: -17.7, lon: 179.9, sizeKm: 200, date: "2026-11-10", widthPx: 512 });
const days = photoFallbacks(tokyo, 3).map((shot) => shot.date);
console.log(url.searchParams.get("LAYERS"), url.searchParams.get("TIME"));
console.log(fiji.length, fiji.map((piece) => piece.widthPx).join("+"));
console.log(days.join(" "));
console.log(photoCredit("en"));
```

`photoUrl({ lat, lon, sizeKm, date, widthPx })` は、緯度と経度の格子（EPSG:4326、JPEG）に対する WMS GetMap の要求です。画像は地上の正方形の範囲で、1辺が `sizeKm`（1 km から 4,000 km の範囲に収められます）、幅と高さが `widthPx` ピクセル（既定は512、最大2,048）です。日付は `yyyy-mm-dd`、`Date`、またはミリ秒で、UTCの日を表します。有限でない数や、日として正しくない日付は `RangeError` を投げます。

アドレスの形は次のとおりです。

```text
https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=<layer>&STYLES=&FORMAT=image%2Fjpeg&SRS=EPSG%3A4326&BBOX=<west>,<south>,<east>,<north>&WIDTH=<px>&HEIGHT=<px>&TIME=<day>
```

## どのレイヤーと日付か

どのレイヤーも1日ごとの自然色（カメラで見たままの色）で、1ピクセルは約250 m、雲も写っています。`photoLayer(day)` は、使うレイヤーの名前を返します。次の3つのうち、その日の画像がある最初のものです。NOAA-20 VIIRS（2018-01-05 から最新まで毎日）、Suomi NPP VIIRS（2015-11-24 から、終了する 2026-11-02 まで）、MODIS Terra（2000-02-24 から最新まで）。2000-02-24 より前には画像がなく、`photoUrl` は `null` を返します。日の範囲は、NASAの capabilities ファイルが 2026-11-17 に載せていたものです。いまも続いているレイヤーでは、載っている最後の日より後の日も要求します。

1ピクセル約250 mでは、海岸、都市、川、島、雪、雲は見えますが、建物は見えません。

## 範囲

経度1度の長さは赤道から離れるほど短くなるので、`photoBox` は、地上で `sizeKm` の幅になるのに必要な度数を、経度の幅にします。画像は正方形で、赤道から遠いほど、含まれる経度の度数は大きくなります。

- **日付変更線。** 経度180度をまたぐ範囲は、1回の要求では取れません。`photoPieces` は、それを左から右の順に2つの要求として返します（それぞれを置く位置は `offsetPx` と `widthPx` で分かります）。ページが2枚を並べれば、地点は中心のままです。`photoUrl` は1回の要求にとどめ、範囲を世界地図の内側へずらすので、地点は中心から外れます。
- **極。** 極を越えてしまう範囲は、地球の内側に収まるようずらすので、極は範囲の縁になります。極の近くは経度1度がとても短いため、範囲の幅は約115度になります。

## 画像のない日

NASAは、その日の画像を日が終わってから数時間後に作ります。範囲の上を通る観測がなかった日は、エラーではなく黒い画像が返ります。`photoFallbacks(options, days)` は試す日を新しい順に返します（既定では、指定の日とその前の2日）。それぞれにレイヤー、アドレス、分割した部分が付きます。ページは最初のものを試し、画像が黒いか届かないときに次のものを試します。デモは画像を小さな canvas に読み込んで調べます。サービスが許可しているので、これができます。黒い画像かどうかは、`/door` の `samplesAreBlank` で調べられます。

```js no-run
import { photoUrl } from "@johnmorrisdotca/chikyu-earth/photos";

const image = new Image();
image.crossOrigin = "anonymous";
image.src = photoUrl({ lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10" });
document.body.append(image);
```

## クレジット

`photoCredit("ja")` は、画像のそばに表示する短い一文です。NASAを出典として示し、NASAが承認したものではないことを述べます。`photoCredit("ja", true)` は、GIBSを使うすべてのクライアントにNASAが表示を求める謝辞の文で、英語は原文のままです。日本語はこのパッケージの翻訳です（NASAは日本語版を出していません）。画像を出す場所には、どちらか一方を必ず添えてください。NASAによると、NASAの画像は米国では一般に著作権の対象になりません。条件と、それを読んだ日は `NOTICE.md` にあります。

## デモ

平面地図のページに「真下の地上」というパネルがあります。地図で衛星を選び、範囲の幅（100 km、300 km、1,000 km）を決めてボタンを押すと、そのときの衛星の真下の場所の画像が、クレジットの一文とともに表示されます。
