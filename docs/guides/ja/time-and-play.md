---
title: 時計に合わせて進む日付と再生
section: how-to
order: 11
description: 宇宙の見た目とリアルな地球で、時計が進むのに合わせて日付を見せ、「再生」「一時停止」「もとの日付へ」で、選んだ日付から時計を動かします。速さの指定、イベントとその送る回数、デモがアドレスに残すものを説明します。
---

`<chikyu-space>` には時計があります。`time` は見せている時刻で、`speed` は現実の1秒で進む模擬の秒数です (`0` は止め、`3600` は1秒で1時間、`86400` は1秒で1日、負の数は逆戻りです)。日付の欄があるページは、時計が進んだ日付を見せる必要があります。読む人も、欄の日付から時計を動かしたり、止めたりしたくなります。このガイドは、日付を伝えるイベントと、デモが日付の欄の横に置くボタンの説明です。

## 時計が進むあいだの日付の見せ方

`<chikyu-space>` は、`detail: { time, running }` をつけた `chikyu-timechange` を送ります。`time` は、いま見せている時刻で、1970年からのミリ秒です。

- 時計が進んでいるあいだ (`speed` が0でないとき) は、絵を何回描き直しても1秒に4回まで送ります。タブが表示されているときだけです。実際の時間の速さでは、時計は1分に1回 (衛星を出しているときや乗って見ているときは1秒に1回) 進み、そのたびにイベントを送ります。
- 時計が止まったとき (`speed` を0にしたとき) は、`running: false` をつけて1回だけ送ります。だから、ページは止まった日時をアドレスに書けます。
- ページ自身が `time` を設定したときは送りません。`time` は、いつでもいま見せている時刻を返します。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector("chikyu-space")!;
const box = document.querySelector<HTMLInputElement>("#when")!;
space.setAttribute("time", "2026-11-02T12:00Z");
space.setAttribute("speed", "86400");
space.addEventListener("chikyu-timechange", (event) => {
  const { time, running } = (event as CustomEvent<{ time: number; running: boolean }>).detail;
  // 欄は時計について行きますが、読む人が入力しているあいだは書き換えません
  if (document.activeElement !== box) box.value = new Date(time).toISOString().slice(0, 16);
  if (!running) history.replaceState(null, "", `?time=${new Date(time).toISOString()}`);
});
```

`chikyu-time` は以前からあるイベントで、時計が進むたびに、1秒に30回まで送ります。すでにこのイベントを使っているページのために残してあり、回数は減らしません。日付を見せるページは、`chikyu-timechange` を使ってください。

## リアルな地球

`<chikyu-earth-realistic>` にも同じ時計があり、`time` や `speed` の名前も同じです。`speed` は、現実の1秒で進む模擬の秒数です (`0` は止め、`3600` は1秒で1時間、`86400` は1秒で1日、負の数は逆戻りです)。時計は、表示している日時から進みます。太陽の光、夜の側、雲もそれに合わせて変わり、ページの日付の欄も同じイベント `chikyu-timechange` で追いかけます。送る回数のきまりも同じです。時計が動いているあいだは、1秒に4回までイベントを送ります。タブが表示されているときだけで、止まったときは `running: false` をつけて1回送ります。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.querySelector("chikyu-earth-realistic")!;
earth.setAttribute("time", "2026-11-02T12:00Z");
earth.setAttribute("speed", "86400");
earth.addEventListener("chikyu-timechange", (event) => {
  const { time, running } = (event as CustomEvent<{ time: number; running: boolean }>).detail;
  console.log(new Date(time).toISOString(), running ? "running" : "held");
});
```

- **これまでのリンクやページはそのまま使えます。** `speed` がないときは、これまでどおり `time` に従います。`time="now"` (または `time` なし) は実際の時計に従い、太陽と雲は `live-seconds` ごとに (ふつうは1分、短くても1秒) 更新します。日付を指定したときは止まったままです。`speed` をつけると、表示している日時からその速さで進みます (`time` が `now` のときは、いまの時刻から)。`speed="0"` は止め、属性をはずすと、また `time` に従います。`speed` プロパティの設定は、属性の設定と同じです。
- **描き直す回数。** 実際の時間の速さでは、`live-seconds` ごとに描き直します。それより速いときは、昼と夜の境が画面で1ピクセル動くたびに描き直します。ただし1秒に1回は描き、多くても30回までです。動きを減らす設定の人には、1秒に1回です。止まっているとき、画面の外にあるとき、見えていないタブのときは、何も描かず、次のフレームも要求しません。
- **`time`** は、時計が動いているあいだはいま表示している日時を返し、実際の時計に従っているあいだは `"now"` を返します。

## 再生、一時停止、もとの日付へ

デモの「時間」の行は、日付の欄の横にある、ファミリー共通の再生バー (kazoku-ui の `<kazoku-replay-bar>`) です。速さは `1 3600 86400 -3600` で、実際の時間の何倍かを表します。

- **再生**は、表示している日時から時計を進め、日付の欄もいっしょに進みます。「今」に従っていた日付は、その瞬間の日時になるので、時計がもっと後の「今」へ飛ぶことはありません。
- **一時停止**は、そこで時計を止め、進んだ日時をアドレス (`time`) に書きます。止まっているあいだは何も描き直しません。
- **もとの日付へ**は、読む人が選んだ日付 (アドレス、日付の欄、または「今」) にもどして止めます。
- 天体や衛星と「いっしょに動く」と、時計が動き出し、日付もそれに合わせて進みます。

アドレスには `play=on` と `speed` (1秒で1時間は初期値なので書きません) が残り、時計が止まったときと読む人がページを離れるときは `time` も残ります。動きを減らす設定の人には、アドレスが「再生」を求めていても、「再生」を始めません。

「時間」の行は、宇宙の見た目でもリアルな地球でも使えます。宇宙の見た目は、止まった状態で開きます。リアルな地球は、これまでどおり開きます。`now` のときは実際の時計に従い、日付があるときは止まったままです。`now` から「再生」すると、表示している日時から進み、その日時をアドレスの `time` に書きます。もとの日付が `now` だったときは、「もとの日付へ」で実際の時計に従う状態にもどります。再生バーができる前のリンクもそのまま使えます。`speed=0` は止まったまま、`play` がなくて `speed` に0以外の値があるリンクは、これまでどおりその速さで動き、どちらもないリンクは止まった状態で開きます。
