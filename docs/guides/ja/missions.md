---
title: スペースシャトルの飛行とハッブル望遠鏡の訪問
section: how-to
order: 9
description: STS-1 から STS-135 までのスペースシャトルの全飛行について、NASA の事実と、飛行中のどの時刻でも、オービター (とハッブル宇宙望遠鏡) がどこにいたかを、当時 Space-Track が保存していた軌道要素から計算します。
---

`satellites` のエントリーには、STS-1 (1981年4月12日) から STS-135 (2011年7月8日) までの、スペースシャトル135回の飛行があります。オービター、打ち上げと着陸の時刻 (UTC)、NASA のページに載っている人数、主な積み荷を短く (英語と日本語で) 持っています。事実は NASA の飛行ページのもの (パブリックドメイン、2026-11-08 に読みました) です。ハッブル宇宙望遠鏡を放出した、または修理した飛行 (STS-31、STS-61、STS-82、STS-103、STS-109、STS-125) には `hubble` が付いています。飛行中のオービターの位置は、ほかの人工衛星と同じ SGP4 で、オービターが宇宙にいたあいだに Space-Track が保存していた軌道要素から計算します。

## 事実と位置

`missions()` は、打ち上げた順に飛行を並べます。`missionOf` は `"STS-31"`、`"31"`、`31` で1つを探します。`missionPosition(sets, ms, flight)` は、時刻にいちばん近い軌道要素から、緯度、経度、高さ、速さを返します。このエントリーのほかの部分と同じく satellite.js が必要で、ブラウザーでもサーバーでも動きます。

```js
import { missionOf, missionPosition, missions } from "@johnmorrisdotca/chikyu-earth/satellites";

// The Space Shuttle flights, and where the craft was at a moment of one, from the element sets Space-Track kept at the time (two of STS-1's, here).
const sets = [
  { OBJECT_NAME: "STS 1 (OFT-1)", EPOCH: "1981-04-12T20:49:32.182176", MEAN_MOTION: 16.01389059, ECCENTRICITY: 0.0004879, INCLINATION: 40.3433, RA_OF_ASC_NODE: 259.625, ARG_OF_PERICENTER: 296.3562, MEAN_ANOMALY: 63.4235, NORAD_CAT_ID: 12399, BSTAR: 0.002351, MEAN_MOTION_DOT: 0.01317629, MEAN_MOTION_DDOT: 0.0011342 },
  { OBJECT_NAME: "STS 1 (OFT-1)", EPOCH: "1981-04-13T08:47:54.639168", MEAN_MOTION: 16.01452947, ECCENTRICITY: 0.0006363, INCLINATION: 40.3379, RA_OF_ASC_NODE: 256.3348, ARG_OF_PERICENTER: 298.5494, MEAN_ANOMALY: 61.4705, NORAD_CAT_ID: 12399, BSTAR: 0.002351, MEAN_MOTION_DOT: 0.01372851, MEAN_MOTION_DDOT: 0.0000027732 },
];
const flight = missionOf("STS-1");
const place = missionPosition(sets, Date.UTC(1981, 3, 13, 6), flight);
console.log(`${missions().length} flights; ${flight.name} ${flight.orbiter}, ${flight.crew} crew: ${place.altitudeKm.toFixed(0)} km up over ${place.latitude.toFixed(0)} degrees`);
```

`missionPosition` に飛行を渡すと、打ち上げの前と着陸のあと (オービターは地上にいます) は何も返しません。その時刻から2日以上離れた軌道要素でも、何も返しません。打ち上げの73秒後に失われた STS-51L には、着陸も軌道要素もありません。

## 軌道要素のありか

パッケージには軌道要素を入れていません。デモサイトには、飛行ごとに小さなファイル (`missions/sts-31.json` など) があります。Space-Track の SATCAT と `gp_history` から、1回だけ作りました (134ファイル、軌道要素 約3,100件、410 kB、圧縮で180 kB。望遠鏡の分は、その6回の飛行のファイルに入っています)。`missionElements(file)` で、ファイルを NORAD 番号ごとの軌道要素にして、`missionPosition` に渡せます。数値は当時 Space-Track が保存していたもので、3時間に1件までに間引き、数字が書き間違えられた少数のものは除いています (`scripts/missions.ts`)。`Data from Space-Track.org (USSPACECOM)`。それぞれの情報源の規約は、[地球儀に人工衛星を表示する](satellites.md)にあります。

## どのくらい正確か

古い軌道要素は、数時間ぶんの軌道しか表せません。地上の軌跡は、別の方法で計算したもの (2体問題に J2 のずれを加えたもの) と、要素の前後90分で60 km 以内、高さは25 km 以内で合っています。2つの要素のあいだでは近いほうから位置を出すので、軌道を変えたあと (噴射やランデブー) は、要素が切り替わるところで数百 km 飛んで見えることがあります。要素が少ない飛行 (STS-27 は1件) は、その前後2日だけ位置が出ます。

## デモでは

宇宙の表示に、「スペースシャトルの飛行」の行があります。ハッブル望遠鏡の訪問と、オービターごとの飛行がボタンになっていて、1つ押すと、打ち上げの時刻にオービター (と望遠鏡) が地球儀に出ます。「再生」で、飛行を実際の600倍、3600倍、21600倍の速さで動かせます。アドレスには、飛行と時刻が残ります (`?look=space&mission=sts-31&time=1990-04-25T00:00Z`)。
