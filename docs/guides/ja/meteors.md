---
title: 宇宙から見た流星
section: how-to
order: 14
description: リアルな地球の上に流星を出します。流星が光る高さで、夜の側に短い光の筋が現れ、流星群の活動中はその数が増えます。流星群の表と出現数の計算だけを使うこともできます。どこまでが実際の値で、どこからがイメージかも説明します。
---

宇宙から見ると、流星は地球の夜の側の上空、うすい大気の中に一瞬だけ現れる短い光の筋です。`<chikyu-earth-realistic>` と `<chikyu-space>` はこれを描けます。属性ひとつで出せます。また、1年の流星群の表と、絵のもとになる計算をまとめた小さなエントリーポイントもあり、数値だけがほしいページでも使えます。

## 流星を出す

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>夜の側に降る流星</title>
    <script type="module">
      import "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/realistic/element/+esm";
    </script>
  </head>
  <body>
    <chikyu-earth-realistic meteors center="-100,30" time="2026-12-14T08:00Z" speed="60" style="width: 420px"></chikyu-earth-realistic>
  </body>
</html>
```

これは、ふたご座流星群の極大のときの、夜の北アメリカです。時計は1秒で1分進みます。スクリプトでは、プロパティに真偽値を入れます: `earth.meteors = true`。`<chikyu-space meteors>` は、宇宙の見た目での同じ属性です。光の筋は、人工衛星にまじって地球のまわりに現れます。画面の上で地球の半径が40ピクセルより小さいときは出ません。

- **指定しなければ出ません。** `meteors` がなければ、流星のための準備も描画も何もしません。
- **時計が動いているあいだだけ出ます。** 時計が止まっているとき (`speed="0"`、または `speed` なしで `time` を指定したとき) は、流星のない止まった絵になります。実際の時間の速さでも流星は出ます。時計の速さに関係なく、ひとつの流星は約0.5秒で消えます。
- **動きを減らす設定。** この設定の人には、ページに要素が置かれたあと、ページが `speed` を設定するまで (たとえば「再生」ボタンを押すまで)、流星を出しません。
- **止まっているときは何もしません。** 要素が画面の外にあるときや、見えていないタブのときは、流星を始めず、何も描きません。光の筋はすべて1回の描画でまとめて描き、同時に出るのは48本まで、描画は1秒に30回までです。

## 流星の強さ

`meteors-strength` は 0 から 1 までの数で、光の筋をどのくらい控えめにするかを決めます。ひとつひとつの光の筋の明るさと、描く本数の両方が、この数に比例して変わります。指定しなければ 1、つまりこれまでと同じ見た目なので、何も指定していないページは変わりません。

```html
<chikyu-earth-realistic meteors meteors-strength="0.3" center="-100,30" time="2026-12-14T08:00Z" speed="60" style="width: 420px"></chikyu-earth-realistic>
```

- **0.3** は控えめです。本数はおよそ3分の1、明るさも3分の1になります。**0.5** は半分、**1** はいつもの見た目です。
- **0 にすると、光の筋は出ません。** 要素そのものは有効のままです。絵の下の行も出たままで、空の計算も続き、`chikyu-meteors` も送られます。
- **変わるのは描き方だけです。** 1時間あたりの出現数、流星群、その `zhr` は、どの強さでも実際の値のままで、イベントや `stats.meteors` で読めます。`stats.meteors.perSecond` は、いま1秒に描いている光の筋の本数なので、強さに合わせて減ります。`stats.meteors.strength` は、使っている強さです。
- **絵の下の行は残ります。** どの強さでも、光の筋はイメージだということを、絵の下の行が伝えます。
- **スクリプトからも指定できます。** プロパティに数を入れます: `earth.meteorsStrength = 0.3`。属性に書き込まれます。0 より小さい数は 0、1 より大きい数は 1 として扱い、数でない値は 1 として扱います。`<chikyu-space>` にも同じ属性とプロパティがあります。
- **計算だけを使うこともできます。** `@johnmorrisdotca/chikyu-earth/meteors` の `readMeteorStrength(attribute)` と `streaksPerSecond(rate, strength)` は、要素が使うのと同じ計算です。

```js
import { METEOR_STRENGTH_DEFAULT, readMeteorStrength, streaksPerSecond } from "@johnmorrisdotca/chikyu-earth/meteors";

// What a page's `meteors-strength` means: 1 when it says nothing, a number from 0 to 1 as written, and the nearest end outside.
console.log(METEOR_STRENGTH_DEFAULT, readMeteorStrength("0.3"), readMeteorStrength("7"), readMeteorStrength("soft"));

// Streaks drawn a second over a dark view on a night with no shower (8 meteors an hour): 2.5 at the full look, fewer at a low strength, none at 0.
for (const strength of [1, 0.3, 0]) console.log(`strength ${strength}: ${streaksPerSecond(8, strength)} a second`);
```

## 実際の値と、イメージ

表示している時刻について計算した、実際の値:

- **場所ごとの数。** それぞれの場所に、1時間あたりの出現数があります。どの流星群にも属さない流星 (散在流星) の数に、地球の進む向きの側ではやや多めになる補正をかけ、さらに活動中の流星群ごとに「その流星群の天頂修正出現数 (ZHR) × その場所での放射点の高度の正弦 (sin)」を足します。ZHR は、放射点が真上にある暗い空で、1時間に数えられる流星の数です。そのため流星群の活動中は、放射点が高く昇っている側の半球に流星が集まります。
- **暗い場所だけ。** 太陽が出ている場所には出ません。太陽が地平線の下6度以上にある場所ではすべて出て、そのあいだの薄明の場所では一部だけが出ます。
- **流れる向き。** 流星群の流星は、放射点から遠ざかる向きに流れます。それ以外の流星は、あらゆる向きに流れます。
- **高さと速さ。** 光の筋は、高さ110 kmから85 kmまで下ります。流星が光る80〜120 kmの範囲の中です。速さは流星群ごとの値です。
- **流星群。** 活動期間、極大、ZHR、放射点、速さは、国際流星機構 (IMO) の2026年版の眼視流星群一覧の値です。

イメージ:

- **ひとつひとつの光の筋。** 場所と時刻は乱数で決めています。次の流星がどこに現れるかは、だれにもわかりません。
- **数。** ひとつの光の筋は、たくさんの流星を表しています。見えている半球がすべて夜のとき、流星群のない夜は1秒に2.5本、流星群の活動中はそれより多く (出現数の0.6乗に比例)、最大でも1秒に9本です。これらすべてに、強さ (`meteors-strength`、指定しなければ 1) をかけます。
- **長さ。** 短すぎて見えない光の筋は、最大14倍まで、約34ピクセルになるように伸ばしています。まっすぐこちらへ向かってくる流星は、点のままです。
- **散在流星の数。** 1時間に8個という値は、切りのよい仮の数です。地球の進む向きの側に多いという補正も、1日の中での実際の変化を簡単に表したものです。
- **流星群ごとの増え方と減り方。** 一覧にあるのは、極大のときの ZHR と、活動の最初の日と最後の日です。そのあいだの値は、それらを通るいちばん単純な曲線で表しています。

要素は、絵の下に1行でこのことを示します。日本語のページでは「流星の光の筋はイメージです。出やすさ、場所、高さ、時期は実際のデータにもとづいています。」、英語のページでは英語の文になります。自分の言葉で説明するページは、`meteors-label="off"` でこの行を消せます。

## いま活動中の流星群

いちばん活発な流星群が変わると、`detail: { shower, zhr }` をつけた `chikyu-meteors` を送ります。活動中の流星群がないとき、`shower` は `null` です。数は `stats.meteors` で読めます。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/realistic/element";
import type { MeteorShower } from "@johnmorrisdotca/chikyu-earth/meteors";

const earth = document.querySelector("chikyu-earth-realistic")!;
earth.addEventListener("chikyu-meteors", (event) => {
  const { shower, zhr } = (event as CustomEvent<{ shower: MeteorShower | null; zhr: number }>).detail;
  console.log(shower ? `${shower.nameJa}: 放射点が真上にある暗い空で、1時間に約${zhr.toFixed(0)}個` : "今夜は活動中の流星群がありません");
});
earth.meteors = true;
console.log(earth.stats.meteors); // { on, alive, spawned, perSecond, shower, zhr, strength }
```

## 表と計算だけを使う

`@johnmorrisdotca/chikyu-earth/meteors` には、DOM も three.js も入っていません。ブラウザーでも、Node でも、ほかのパッケージの中でも動きます。

```js
import { METEOR_SHOWERS, activeShowers, hourlyRateAt, meteorSky, pointBeneath } from "@johnmorrisdotca/chikyu-earth/meteors";

const moment = Date.UTC(2026, 7, 13, 2);
// The showers active on the night of the Perseids' maximum, strongest first.
for (const { shower, zhr } of activeShowers(moment)) console.log(`${shower.name} (${shower.code}): ${zhr.toFixed(1)} an hour`);

// Where the Perseids' radiant stands overhead then, and the rate an ideal watcher in Tokyo would count.
const perseids = METEOR_SHOWERS.find((shower) => shower.code === "PER");
const overhead = pointBeneath(perseids.radiant, moment);
console.log(`Overhead at ${overhead.lat} N, ${overhead.lon.toFixed(0)} E; Tokyo: ${hourlyRateAt(meteorSky(moment), { lon: 139.7, lat: 35.7 }).toFixed(0)} an hour`);
```

- `METEOR_SHOWERS`: 37の流星群の表です。それぞれに、コード、IAU の番号、英語と日本語の名前、活動の最初の日と最後の日、極大 (2026年の日付と、どの年にも使える太陽黄経)、放射点、速さ、光度比、極大のときの ZHR (一覧が「変動する」としているものは `null`) が入っています。IAU 流星データセンターが母天体を挙げている流星群には、母天体も入っています。
- `showerRate(shower, ms)` と `activeShowers(ms)`: ある時刻での流星群の活発さ。
- `pointBeneath(radiant, ms)` と `apexPoint(ms)`: 空の1点 (放射点など) や、地球の進む向きの点が、真上に来る場所。
- `meteorSky(ms)` と `hourlyRateAt(sky, place)`: ある場所で、理想的な条件の人が1時間に数える出現数。
- `darkness(place, sun)`、`streaksPerSecond(rate, strength)`、`streakPath(place, radiant)`: 流星の描画が使う値。

## 母天体と IAU の流星群リスト

流星群は、その流星のもとになった彗星や小惑星と、流星群の IAU コードと天体の符号でひも付けられています。つながりと、表を IAU 流星データセンターのリストと照らし合わせた結果は、同じエントリーポイントにあります。

```js
import { METEOR_LINKS, parentBodyOf, showerSource, showersOfParent } from "@johnmorrisdotca/chikyu-earth/meteors";

// The Perseids' parent body, found by the shower's IAU code, and every shower that comes from comet Halley.
console.log(parentBodyOf("PER")?.designation, showersOfParent("1P/Halley").map((shower) => shower.name).join(", "));

// Where one row's figures come from.
console.log(showerSource(METEOR_LINKS.find((link) => link.code === "LYR")));
```

- `METEOR_LINKS`: 流星群ごとに、次の内容が入っています。IAU での名前、データセンターが「確立した流星群」(`established`) としているか作業リストにだけ載せているか、母天体 (`designation` と `kind`)、放射点と速さが一致したデータセンターの解（収録された個々の観測結果）、そして、放射点と速さがそれぞれ IMO の表の値かデータセンターの値かです。
- `parentBodyOf(code)` は流星群の母天体を返します (データセンターが挙げていなければ `null`)。`showersOfParent(designation)` は、ひとつの天体の流星群を、符号全体、番号 (`2P`)、名前 (`Encke`) のどれからでも探します。
- `showerSource(link)` は、表の1行の数値の出どころを、英語の1文で返します。
- **照らし合わせた内容。** 放射点と速さを、データセンターの解のうち、流星が100個以上で、平均の太陽黄経が極大から3度以内のものと比べました。放射点は、その解自身の日々の動きで極大の黄経まで動かしてあります。どれかの解と、放射点が2度以内、速さが2 km/s 以内であれば、そのままにしました。3つの行は、データセンターの解どうしのばらつきよりも大きくずれていたので、データセンターの値に直しました。4月こと座流星群の速さ (49 ではなく 47 km/s)、いっかくじゅう座α流星群の速さ (65 ではなく 62)、エリダヌス座η流星群の放射点 (赤経 42度、赤緯 -13度) です。データセンターには極大の日付も出現数 (ZHR) もないので、日付と ZHR は IMO のままです。条件に合う解がない4つの確立した流星群は、IMO の値のままです。
- **データセンターの呼び方。** データセンターでは、表の「Draconids」が October Draconids、「Monocerotids」が December Monocerotids (`iauName`) で、IMO の Puppid-Velids (IAU 301) は gamma-Puppids です。3つの流星群 (α-Centaurids、September Lyncids、gamma-Puppids) は、作業リストにだけ載っています。データセンターのデータファイルの求めに従って、引用は Jenniskens ほか (2020、`Planetary and Space Science` 182、104821) と Jopek・Kanuchova (2017、`Planetary and Space Science` 143、3-6) としてください。

## できないこと

- 表の極大の日付は、2026年のものです。ほかの年には、極大が1日前後にずれることがあります。出現数の関数は太陽黄経で時刻を決めるので、年が変わっても極大の時刻に合います。
- アンチヘリオン源 (ANT。太陽と反対側の黄道付近から出る、弱い散在流星の広がり) は、決まった放射点がないので、表には入っていません。
- 一覧が「変動する」としている流星群 (たとえば6月うしかい座流星群) には、流星を出しません。ZHR は前もってわかりません。
- モデルで予測される、ある年だけの突発出現や流星雨は、入っていません。
- 流星を描くのは、リアルな地球と宇宙の見た目です。線で描いた地球では描きません。
