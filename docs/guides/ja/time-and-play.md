---
title: 時計に合わせて進む日付と再生
section: how-to
order: 11
description: 宇宙の見た目の時計が進むのに合わせて日付を見せ、「再生」「一時停止」「もとの日付へ」で、選んだ日付から時計を動かします。イベントと、その送る回数、デモがアドレスに残すものを説明します。
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

`<chikyu-earth-realistic>` で動く時計は `time="now"` だけです。太陽と雲は `live-seconds` ごとに (ふつうは1分、短くても1秒) 更新します。そのたびに `running: true` をつけた `chikyu-timechange` を送り、`time` を日付に設定したときは `running: false` をつけて1回送ります。日付は動かないので、日付の欄が追いかけるものは、これ以上ありません。

## 再生、一時停止、もとの日付へ

デモの「時間」の行は、日付の欄の横にある、ファミリー共通の再生バー (kazoku-ui の `<kazoku-replay-bar>`) です。速さは `1 3600 86400 -3600` で、実際の時間の何倍かを表します。

- **再生**は、表示している日時から時計を進め、日付の欄もいっしょに進みます。「今」に従っていた日付は、その瞬間の日時になるので、時計がもっと後の「今」へ飛ぶことはありません。
- **一時停止**は、そこで時計を止め、進んだ日時をアドレス (`time`) に書きます。止まっているあいだは何も描き直しません。
- **もとの日付へ**は、読む人が選んだ日付 (アドレス、日付の欄、または「今」) にもどして止めます。
- 天体や衛星と「いっしょに動く」と、時計が動き出し、日付もそれに合わせて進みます。

アドレスには `play=on` と `speed` (1秒で1時間は初期値なので書きません) が残り、時計が止まったときと読む人がページを離れるときは `time` も残ります。動きを減らす設定の人には、アドレスが「再生」を求めていても、「再生」を始めません。

宇宙の見た目は、止まった状態で開きます。再生バーができる前のリンクもそのまま使えます。`speed=0` は止まったまま、`play` がなくて `speed` に0以外の値があるリンクは、これまでどおりその速さで動き、どちらもないリンクは止まった状態で開きます。
