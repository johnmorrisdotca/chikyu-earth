---
title: 地球儀に人工衛星を表示する
section: how-to
order: 8
description: ページが用意した軌道要素から、ISS、宇宙ステーション、数千機の Starlink 衛星を宇宙の表示に出します。要素の入手のルールと、軽さを保つ制限も説明します。
---

`<chikyu-space>` は、表示している日時の人工衛星の位置を SGP4 で計算して描き、軌道も表示します。押された衛星については、情報を知らせます。任意の機能で、import しなければ何も負担になりません。

**このパッケージは何も取得せず、軌道のデータも含みません。** 軌道要素はページが入手して渡します。だれにデータを頼んでよいか、どれくらいの頻度か、どう出典を示すかは、頼むページ側の責任として残ります。

## インストール

```sh
npm install @johnmorrisdotca/chikyu-earth three @johnmorrisdotca/kazoku-ui astronomy-engine satellite.js
```

`three`、`@johnmorrisdotca/kazoku-ui`、`astronomy-engine`、`satellite.js` ([MIT](https://github.com/shashwatak/satellite-js)。バージョン6を使ってください。素の JavaScript で、gzip で 10 KB です) は任意の依存パッケージです。使うのは宇宙の表示と `/satellites` だけです。

## 軌道要素を入手する

形式は、[CelesTrak](https://celestrak.org) が配信する「GP」の JSON で、衛星1機につき1つのオブジェクトです (読み取る項目は `ElementSet` にあります)。取得する前に CelesTrak の[利用ポリシー](https://celestrak.org/usage-policy.php)を読み、ページに出典を書いてください。2026年11月3日の時点の要点です。

- データは、早くても2時間おきにしか更新されません。リストは、訪問者ごとではなく、更新ごとに1回だけ頼みます。決まった間隔でサーバーから取得して保存し、その写しを配信してください。
- 200 以外の応答が返ったら、そこで止めてください。2時間に50回より多くエラーになると、あなたのアドレスが CelesTrak のファイアウォールに入ります。
- Starlink などのグループは、全体リストの一部です。取得するのはどちらか一方です。
- [Space-Track](https://www.space-track.org) も同じ要素を、承認されたアカウントに配信しています。ログインが必要で、ページには持たせられません。利用規約では、基本のデータ (TLE と OMM) は出典を書けば他の人に渡せます。デモサイトの定期ビルドは、CelesTrak の要素が古いままのグループがあるとき、Space-Track を第二の取得元として使い、出典 (`Data from Space-Track.org (USSPACECOM)`) を書いています。[SatNOGS DB](https://db.satnogs.org) は公開のライセンス (CC BY-SA 4.0) ですが、別のサイトからの読み込みを許す設定がないので、ブラウザーからは直接頼めません。
- [docs/satellite-sources.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellite-sources.md) に、各サイトの規約の引用と、使ってよい場所 (訪問者のブラウザー、自分のサイトの写し、パッケージ) があります。

軌道要素は古くなります。SGP4 の誤差は、1日に数キロメートルずつ増えます。表示している日時から14日より離れた要素の衛星は、位置は出しますが、`group.dimmed` に印がつき、うすく描きます (`dimAfterDays`)。30日より離れると表示から外します (`maxAgeDays`)。要素の古さは `info(index, ms).ageDays` でわかります。デモのサイトは、CelesTrak の14のリスト (Starlink は5機に1機、ほかはすべて) を、スケジュールされたビルドで6時間おきに取得し直します。ページに出典を書き、取得してからの時間、衛星ごとの要素の古さ、うすく表示する理由を表示します。見る人が来たときに動くものはなく、ファイルを読むだけです。

## 表示する

宇宙の表示を置いたページです。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Satellites on the Earth from space</title>
  </head>
  <body>
    <chikyu-space center="-100,40" time="2026-11-02T12:00Z" speed="0" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

そのスクリプトです。`createSatellites` は、軌道要素ごとに SGP4 を始め、使えなかったものを `refused` に並べます。`setSatellites` は、そのグループを表示に載せます。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// Your page gets the elements (CelesTrak's JSON, within its usage policy) and passes them in; this is one downloaded element set.
const iss: ElementSet = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-02T10:25:21.580320",
  MEAN_MOTION: 15.49150046,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: 20.6961,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
};

const space = document.querySelector("chikyu-space")!;
space.setSatellites("stations", createSatellites([iss]), { color: "#ffd54f", size: 6, orbits: true });
space.addEventListener("chikyu-satellite-click", (event) => console.log((event as CustomEvent).detail.info?.name));
```

グループは、何機入っていても**描画の呼び出しは1回**です。グループには名前を付けます (`"stations"`、`"starlink"`)。`showSatellites(name, false)` で隠し、`setSatellites(name, null)` で取り除いて、持っていたものを解放します。`orbits: true` を付けると、40機以下のグループで、すべての軌道を描きます。

## 群の全部に輪と名前をつける

`space.labelSatellites("stations")` は、群のすべての衛星に輪をつけ、横に名前を書きます。宇宙ステーションのような小さな群のためのものです。名前はページの言語で出ます (`ISS`、`Tiangong` または `天宮`、`Hubble` または `ハッブル`。ほかの衛星は軌道要素にある名前で、`space.satelliteNames = { 25544: "Space Station" }` と指定すればその名前で出ます)。名前は `places` の場所といっしょに、同じ規則で置かれます。まず輪の右に置き、入らなければ左、上、下の順に試して、4つとも空いていないときは優先度の低い名前を出しません。輪をつけるのは、画面に入っていて地球の裏側にない衛星だけで、すべての群をあわせて最大80機までです。止まっているときは何も描き直しません。`space.labelSatellites("stations", false)` で止め、`space.labelledSatellites` で輪をつけている群の一覧が分かります。

`space.placeSatellite({ group: "stations", index })` は、直前の描画で衛星が画面のどこにあるかを答えます。`{ x, y, visible, heightKm }` で、位置はビューの左上からの CSS ピクセルです。`visible` は、枠の中にあり、地球の裏側でないことを表します。群が表示されていないとき、または位置を出せないときは `null` です。これは描画に使っているカメラの計算と、地球に隠れるかどうかの判定そのものなので、自分で輪を描くページは、どちらも自分で計算し直さなくて済みます。輪をつけた衛星が見えるようになったときと見えなくなったときには、`detail: { ref, visible }` をつけた `chikyu-satellite-visibility` イベントが送られます (フレームごとではありません)。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector("chikyu-space")!;
space.labelSatellites("stations");
space.addEventListener("chikyu-satellite-visibility", (event) => console.log((event as CustomEvent).detail.ref.index, (event as CustomEvent).detail.visible));
console.log(space.placeSatellite({ group: "stations", index: 0 })); // { x, y, visible, heightKm } or null
```

## 1機を選ぶ

衛星を押すと (表示を回すドラッグや、地球の裏側の衛星は対象外です)、`chikyu-satellite-click` が `{ group, index, info }` と一緒に発生します。`info` には、名前、NORAD 番号、軌道要素の古さ、高さ、速さ、周期が入っています。`selectSatellite({ group, index })` はコードから1機を選び (リング、軌道、横に名前が出ます)、`satelliteInfo(ref)` はその情報を返します。検索ボックスや名前の一覧があるページでは、この2つを使えば、キーボードだけの人も選べます。

## カタログ

GPS 衛星がどのリストにあるかをページが知らなくてすむように、パッケージには、名前、番号、軌道の種類を日本語と英語で並べた小さなカタログがあります。14のグループ (宇宙ステーション、有名な衛星、科学、地球観測、気象、静止衛星、GPS、GLONASS、ガリレオ、北斗、アマチュア無線、OneWeb、イリジウム、Starlink) と、名前を挙げる価値のある約40機があります。ISS や天宮から、いちばん古い現役の衛星バンガード1までです。各グループには、どの CelesTrak のリストにあるか (`celestrak`)、またはどの番号を1つずつ頼むか (`catnr`) が書いてあります。**軌道要素は入っていません。** 要素は、これまでどおりページが取得します。静止衛星 (`still: true`) は赤道の1点の上にあり、動かないように見えます。JWST は地球の軌道にいないので、入っていません。

```js
import { SATELLITE_GROUPS, catalogueEntry, findInCatalogue } from "@johnmorrisdotca/chikyu-earth/satellites";

const gps = SATELLITE_GROUPS.find((group) => group.id === "gps");
console.log(`${gps.label}: ${gps.about} (CelesTrak list ${gps.celestrak})`);
console.log(catalogueEntry(5).about);
console.log(findInCatalogue("sentinel 2").map((entry) => entry.name).join(", "));
```

`findInCatalogue(text)` は、名前、番号、衛星の役目 ("weather"、"telescope" など) に合う項目を、大文字小文字や記号を無視して探します。デモの「探す」欄はこれを使い、そのあと、読み込んだ衛星の名前の中も探します。

## 自分の取得元

`fetchElements(url)` は、**あなたが選んだ**アドレスに、訪問者のブラウザーから、OMM の JSON、OMM の CSV、または TLE の文字を頼み、`createSatellites` に渡せる軌道要素にして返します。パッケージには初めから決まったアドレスはありません。どこに頼むか、その規約を読むのは、あなたです ([docs/satellite-sources.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellite-sources.md) に、CelesTrak や Space-Track などの規約があります)。礼儀正しい利用者としての決まりを守ります。

- `https` だけです (`localhost` だけは `http`)。Cookie も参照元も送らず、リダイレクトにも従いません。
- 同じアドレスには、2時間以内に頼み直しません (`minIntervalMs`)。すでに読んだ答えを返します (ページの中、または `localStorage` から。`fromCache: true`)。
- 200 以外の答え、または答えがないときは、そこで止めます。そのアドレスは1時間そっとしておき (`blockedMs`)、状態コードと、次に頼める時刻を持つ `ElementSourceError` を投げます。すでに読んだ答えがあれば、その間はそれを使います。
- 2,000万バイトより大きい答え、または5万機より多い答えは断ります。数字が足りない、TLE のチェックサムが違う、あり得ない軌道の軌道要素は、除いて、理由つきで `skipped` に並べます。
- 取得元が、ページから読むための見出し (CORS) を送っている必要があります。CelesTrak は送っています。送らないところは、ページからは読めず、ここには回避する方法もありません。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, fetchElements, ElementSourceError } from "@johnmorrisdotca/chikyu-earth/satellites";

const space = document.querySelector("chikyu-space")!;
try {
  // 自分で選び、規約を読んだアドレス (これは作り物です)
  const source = await fetchElements("https://example.org/my-elements.json");
  space.setSatellites("mine", createSatellites(source.sets), { color: "#ffffff", size: 4 });
  console.log(`${source.sets.length} satellites, ${source.skipped.length} left out, ${source.fromCache ? "kept from earlier" : "just asked"}`);
} catch (error) {
  if (error instanceof ElementSourceError) console.log(error.message, error.status, error.retryAt);
}
```

`parseElements(text)` は、読み取りだけです。頼む動作はなく、すでに手元にある文字に使えます (サーバーでも動きます)。

```js
import { parseElements } from "@johnmorrisdotca/chikyu-earth/satellites";

const tle = [
  "0 MADE-UP 1",
  "1 30001U 26001A   26307.50000000  .00001000  00000-0  10000-3 0  9991",
  "2 30001  53.0000   0.0000 0002000  90.0000   0.0000  2.00570000123454",
].join("\n");
const { sets, skipped, format } = parseElements(tle);
console.log(format, sets.length, skipped.length);
```

デモには「自分の取得元」の欄があります。アドレスを貼って「読み込む」を押します。ページ自身のアドレスから頼むことはなく、訪問者がボタンを押したときだけです。

## サーバーで

同じ位置の計算に、ブラウザーは要りません。次は、1つの軌道要素から ISS の高さと速さを求める例です。

```js
import { createSatellites } from "@johnmorrisdotca/chikyu-earth/satellites";

// SGP4 on a server: the same positions the space view draws, no browser needed.
const group = createSatellites([
  {
    OBJECT_NAME: "ISS (ZARYA)",
    OBJECT_ID: "1998-067A",
    EPOCH: "2026-11-02T10:25:21.580320",
    MEAN_MOTION: 15.49150046,
    ECCENTRICITY: 0.0007139,
    INCLINATION: 51.6332,
    RA_OF_ASC_NODE: 335.9757,
    ARG_OF_PERICENTER: 339.3739,
    MEAN_ANOMALY: 20.6961,
    NORAD_CAT_ID: 25544,
    BSTAR: 0.00012,
    MEAN_MOTION_DOT: 0.0001,
    MEAN_MOTION_DDOT: 0,
  },
]);
const info = group.info(0, Date.UTC(2026, 10, 2, 12));
console.log(`${info.name}: ${Math.round(info.altitudeKm)} km up, ${info.speedKmS.toFixed(2)} km/s`);
```

## 制限 (軽さのために)

宇宙の表示のほかの部分と同じルールで、6,000機でそれぞれテストしています。

- 止まっているときは何もしません。描画せず、フレームも要求せず、SGP4 も動かしません。
- SGP4 は、フレームレートに関係なく、おおよそ1秒に1回です。グループ全体を、ステップ (時計の速さに応じて1〜60秒) だけ離した2つの時刻で計算し、その間は算術だけで求めます。
- 描画は1秒に最大30回で、実際の速さのとき、または動きを減らす設定のときは、1秒に1回です。
- 実際の60倍より速いときは、グループを隠し、SGP4 も動かしません。2つの時刻が離れすぎて、補間できないからです。選んだ衛星は、そのまま正確に置きます。
- 画面の外や、隠れたタブでは何も描きません。WebGL のコンテキストは1つで、グループや要素を取り除くとすべて解放され、コンテキストが失われても、衛星ごと戻ります。

数値とテストは、[docs/satellites.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellites.md) にあります。
