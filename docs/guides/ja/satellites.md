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

## 1つのグループだけを見る

`<chikyu-space>` と `<chikyu-earth-realistic>` の `focusSatelliteGroup(name, options)` は、`setSatellites` で載せたグループを1つ見せ、ほかの扱いを決めます。`options.others` は `"dim"` (既定: ほかは描いたまま、軌道要素が古い衛星と同じうすさなので、一目でうすく見えます) か `"hide"` (描きません) です。`options.frame` は既定で真です。視点は、そのグループの軌道が画面に入るところまで、表示自身のズームで引きます。距離は、各衛星の平均運動と離心率から出した遠地点です (1日に1周は地球半径の6.62倍)。8地球半径で止めます。遠くへ振れる衛星が1機あっても、地球が小さくなりすぎないようにするためです。`frame: false` では視点はそのままです。`null` にすると、各グループは元の表示か非表示に戻り、焦点が動かした視点も戻ります。いっしょに移動しているときは、それをやめます。殻を見るには、カメラが地球を向いている必要があるためです。焦点を外しても、いっしょに移動は再開しません。ズームは戻します。

`focusedSatelliteGroup` は名前、または `null` です。`satelliteGroups` は `count` を保ち、`emphasis` (`"focus"`、`"dim"`、`"hidden"`、`"plain"`) と `placed` (直前の描画で、そのグループのうち何機を置いたか) が加わります。載っていないグループは拒否します。呼び出しは `{ ok: false, reason: "not-set" }` を返し、何も変えません。例外は投げません。載っているグループは `{ ok: true, group, count }` を返します。選択が変わったときは、`chikyu-satellite-focus` が `{ group, count }` と一緒に送られます。

選んだグループは、`showSatellites` で隠してあっても描き、この選択ではうすくしません (軌道要素が古い衛星は、これまでどおりうすく描きます)。うすくするのに新しいものは作りません。点にもとからある dim の値です。止まっているときは何も描き直しません。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector("chikyu-space")!;
space.addEventListener("chikyu-satellite-focus", (event) => console.log((event as CustomEvent).detail.group, (event as CustomEvent).detail.count));
const answer = space.focusSatelliteGroup("gps", { others: "dim" });
console.log(answer.ok, space.focusedSatelliteGroup);
space.focusSatelliteGroup(null);
```

## 群の全部に輪と名前をつける

`space.labelSatellites("stations")` は、群のすべての衛星に輪をつけ、横に名前を書きます。宇宙ステーションのような小さな群のためのものです。名前はページの言語で出ます (`ISS`、`Tiangong` または `天宮`、`Hubble` または `ハッブル`。ほかの衛星は軌道要素にある名前で、`space.satelliteNames = { 25544: "Space Station" }` と指定すればその名前で出ます)。衛星の名前は `places` の場所の名前のあとから置き、場所の名前、天体の名前、ほかの衛星の名前とは重なりません。輪の右に入ればそこに、入らなければ左、上、下の順に置き、置く場所がない名前は出しません。輪をつけるのは、画面に入っていて地球の裏にない衛星だけで、すべての群をあわせて最大80機までです。止まっているときは何も描き直しません。`space.labelSatellites("stations", false)` で止め、`space.labelledSatellites` でその群の一覧が分かります。

`space.placeSatellite({ group: "stations", index })` は、直前の描画で衛星が画面のどこにあるかを答えます。`{ x, y, visible, heightKm, edge, behind, occluded }` で、位置はビューの左上からの CSS ピクセルです。`visible` は、枠の中にあり、カメラの前にあり、地球の裏側でないことを表します。`edge` は、画面の外にあるとき `"top"`、`"right"`、`"bottom"`、`"left"` のどれかで、枠の中では `null` です。`behind` は、カメラの後ろにあるときに真です。`occluded` は、地球が衛星を隠しているときに真です。カメラから衛星への線が、衛星より先に地球に当たる、ということです。手前にある衛星では偽、地球のふちをかすめるだけ（縁）のときも偽、カメラの後ろにあるだけでも偽です。`x` と `y` は枠の外に出ることがあります。`null` なのは、群が表示されていないときと、位置を出せないときだけです。これは描画に使っているカメラの計算と、地球に隠れるかどうかの判定そのものなので、自分で輪を描くページや、画面の外の衛星にふちの印を描くページは、どちらも自分で計算し直さなくて済みます。パッケージ自身の名前（宇宙ステーションも含みます）は、`occluded` のあいだ不透明度 45 パーセントで、輪なしで描かれ、衛星が出てくると元に戻ります。`dim-occluded="off"`（プロパティは `dimOccluded`。属性が無いときはオン）にすると、その名前は出ません。輪をつけた衛星が見えるようになったときと見えなくなったときには、`detail: { ref, visible }` をつけた `chikyu-satellite-visibility` イベントが送られます (フレームごとではありません)。ここでの `visible` はこれまでどおり「画面にあり、隠されていない」なので、薄くした名前は見えているとは知らせません。

`space.ringSatellites(refs)` は、渡した衛星に輪と名前を付けます。その一覧は覚えておきます。画面の外にある衛星には、まだ輪がありません。その衛星が画面に入った最初の描画 (視点を回したとき、ズームを変えたとき) で輪を描き、それを待つためだけに、止まっているあいだは描きません。

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector("chikyu-space")!;
space.labelSatellites("stations");
space.addEventListener("chikyu-satellite-visibility", (event) => console.log((event as CustomEvent).detail.ref.index, (event as CustomEvent).detail.visible));
console.log(space.placeSatellite({ group: "stations", index: 0 })); // { x, y, visible, heightKm } or null
```

## 1機を選ぶ

衛星を押すと (表示を回すドラッグや、地球の裏側の衛星は対象外です)、`chikyu-satellite-click` が `{ group, index, info }` と一緒に発生します。`info` には、名前、NORAD 番号、軌道要素の古さ、高さ、速さ、周期が入っています。軌道要素にカタログの持ち主コード (`COUNTRY_CODE` か `OWNER`) があり、持ち主が1つの国のときは、`ownerCountry` にその国の ISO 3166-1 の2文字コード (`CN`、`US`、`PK` など) も入ります。組織、複数の国、持ち主が分からないもの、一覧が1つの国に当てていないコード (旧ソ連の登録である `CIS` を含む) には入らず、その項目自体がありません。`ownerCountry(code)` と `OWNER_COUNTRIES` で、どのコードでも同じことを調べられます。このパッケージは国旗を描きません。`selectSatellite({ group, index })` はコードから1機を選び (リング、軌道、横に名前が出ます)、`satelliteInfo(ref)` はその情報を返します。検索ボックスや名前の一覧があるページでは、この2つを使えば、キーボードだけの人も選べます。

## ポインターの下の軌道

ポインターが衛星の上に止まると、その名前が出て、軌道がうすく描かれます。選んだ衛星の軌道の明るさのおよそ3分の1なので、ひと目で区別できます。こちらは幅1ピクセルで、選んだ衛星の軌道 (2ピクセル) より細く、明るさも低いので、さらにうすく見えます。ポインターが離れると、短いフェードのあと消えます (動きを減らす設定のときはすぐに消えます)。うすい軌道は一度に1本です。タッチにはホバーがないので、新しいものは描きません。

`hover-path` は、衛星が表示されていて `names-on-hover` がオンのときオンです。`hover-path="off"` でうすい軌道を消します。`names-on-hover="off"` で名前を消し、`hover-path` を別にオンにしていない限り、うすい軌道も消します。色と不透明度は、要素の `--chikyu-hover-path` と `--chikyu-hover-path-opacity` です。軌道は、読み込み済みの要素から一度だけ計算します。ポインターが止まっていて、下に衛星がないときは、何も描きません。

## 自分用の軌道線

ページは、自分のために軌道を描けます。読者のお気に入りの衛星、検索で見つかった衛星、ポインターが乗っている衛星などです。パッケージは、小さな表にある見た目で、**全部を1回の描画で**描き、静止しているときは何も描きません。

- **`setPaths(list)`** (プロパティ `paths`) は、最大16本の `{ id, style }` を受け取ります。`id` は NORAD 番号か `group:index` (`stations:0`)、`style` は見た目の名前か、一部だけの見た目 `{ color, width, opacity, dash }` です。それより長い一覧は、最後の16本 (新しいもの) を残し、残りは `stats.paths.dropped` に数えます。どの衛星にも合わない id は読み飛ばし、`stats.paths.unresolved` に数えます。`[]` で全部を消します。
- **`setPathStyles(table)`** (プロパティ `pathStyles` は使われている表の全体) は、見た目を名前で変えます。組み込みの見た目は、色だけでなく太さと破線も違うので、色が分からなくても見分けられます。`selected` (白、2 px、実線)、`hovered` (白、1.5 px、長い破線)、`favourite` (琥珀色、1.75 px、短い破線)、`path` (白、1.5 px、実線。名前を指定しない線の見た目) です。ページの項目は、同じ名前の組み込みの上に重なります。`null` でその項目を外します。見た目は `{ color: CSS の色、width: 0.5〜8 CSS ピクセル、opacity: 0〜1、dash: [線, すきま] (CSS ピクセル)、実線は null }` です。破線の長さは、描かれた地球の大きさで軌道に沿って測るので、地球と一緒に大きくなり、小さくなります。
- **`selected-path="off"`** (プロパティ `selectedPath`) は、選んだ衛星自身の軌道線をパッケージが描くのをやめます。輪と名前は残り、乗る動作もそのまま衛星を追います。線を描くときの見た目は表の `selected` なので、色や太さを変えたいだけなら、属性はそのままにして、その項目を設定します。選んだ軌道の幅は `selected` の2 pxになりました (以前は1 px)。
- 衛星に乗っているとき、その衛星自身の軌道も `selected` の見た目で描かれます (`selected-path="off"` でなければ)。

### ポインターの下にある線

`path-hit` (プロパティ `pathHit`) は、ポインターがどこまで近ければよいかを CSS ピクセルで表します。指定がなければ8、範囲は0〜40で、`off` か0でこの判定を止めます。タッチは2倍の距離 (最低16) まで届きます。判定の対象は、ページの線と選んだ衛星自身の軌道で、地球に隠れた部分は対象外です。衛星に乗っているときは、この属性を指定しない限り判定しません。

- `chikyu-path-hover` は、マウスが線に乗ったとき、別の線に移ったとき、離れたとき (そのとき `detail` は `null`) に出ます。タッチは止まらないので、出しません。
- `chikyu-path-click` は、ドラッグでない押下かタップのときに出ます。どちらも `detail: { id, ref, style, x, y, distancePx, pointer }` を持ちます。`id` は渡したとおり、`ref` は `chikyu-satellite-click` と同じ `{ group, index }` なので、探し直す必要はありません。`style` は見た目の名前 (指定の中に書いたものは `custom`)、`x` と `y` は線上の最も近い点 (要素の中の CSS ピクセル)、`pointer` は `mouse`、`pen`、`touch` です。
- `pathAt(x, y, radiusPx?)` は、ページが決めた点について同じことを答えます (届く範囲に線がなければ `null`)。
- **1回の押下は1つの意味だけ**で、どれが先かは `path-priority` (プロパティ `pathPriority`) で決まります。既定の `dots` では、衛星の点 (`chikyu-satellite-click`)、線 (`chikyu-path-click`)、空 (`chikyu-sky-pick`) の順です。点の下を通る線を押すと点のものになるので、点が線にひしめく「低い」レベルでは、線が聞こえないことがあります。`paths` では、まずページの一覧にある線の衛星か、選んだ (乗っている) 衛星自身の点 (その点は今までどおり先です)、次に線、次にそれ以外の点、最後に空です。ホバーも同じ順です。どちらでも、点か線が受けた押下は、その下の星には届きません。

`stats.paths` は描かれているものを答えます: `{ requested, drawn, dropped, unresolved, selectedDrawn, draws, hover, hits }`。`draws` は0か1で、それ以上にはなりません。線と選んだ軌道は、1回の描画を分け合います。ページの例は、まずページです。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Orbit paths on the Earth from space</title>
  </head>
  <body>
    <chikyu-space center="-100,40" time="2026-11-02T12:00Z" speed="0" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

そのスクリプトです。選んだ衛星自身の線は描かず、ページがその衛星の軌道を、自分の見た目のお気に入りとして描き、押すと知らせを受けます。

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
space.setSatellites("stations", createSatellites([iss]), { color: "#ffd54f", size: 6 });
// The package draws no orbit line for the chosen satellite: the page draws it, in a look of its own, with the other paths.
space.selectedPath = false;
space.selectSatellite({ group: "stations", index: 0 });
space.setPathStyles({ favourite: { color: "#7fdbff", width: 3, dash: [8, 5] } });
space.setPaths([{ id: 25544, style: "favourite" }]);
// A press or a mouse resting within 8 px of a path says which one, with the same ref as a click on the satellite.
space.addEventListener("chikyu-path-click", (event) => console.log((event as CustomEvent).detail.id, (event as CustomEvent).detail.ref));
space.addEventListener("chikyu-path-hover", (event) => console.log((event as CustomEvent).detail?.style ?? "off the path"));
console.log(space.pathAt(10, 10)); // { id, ref, style, x, y, distancePx, pointer } or null
```

## 今日から遠いとき: 推定

表示する時刻が軌道要素から30日 (`maxAgeDays`) より離れると、衛星は表示から外れます。要素を取った日からそれほど離れると、SGP4 に本当のことが言えないからです。時計を来年や去年に動かすページでは、衛星が消えます。**`estimate-far`** (プロパティ `estimateFar` または `createSatellites(sets, { estimateFar: true })`。初期値はオフなので、頼まない限り何も変わりません) は、衛星を残します。同じ要素を、同じ SGP4 のコードで先へ、または後ろへ進め、各衛星は、古い要素のうすい表示より**さらに明るい色**で描かれます。

**推定とは何か。** 要素を取ってから軌道が変わらなかったとしたら、衛星があるはずの場所です。それだけです。軌道が最も速く変わるところで、最もあてになりません。**低い軌道**では、空気抵抗が数日で軌道を縮め、遅くし、運用者は衛星を動かすので、数週間たつと、推定は本当の位置から軌道に沿って大きくずれることがあります。そして**長い時間**(数か月)が離れているときもそうです。高い軌道はゆっくり変わるので、数か月は近いままです。大気圏に再突入した衛星は、そこにはいません。ページには「推定」と書き、衛星がある場所の上を通る時刻のように、正しくなければならないことには推定を使わないでください。

- 推定された衛星は、`placeSatellite`、`satelliteInfo` (`estimatedDays` つき)、`chikyu-satellite-click` と `chikyu-satellite-visibility` の `detail` で `estimated: true` になります。`estimatedDays` は、表示している時刻が要素の時刻から、どちら向きでも何日離れているかです。カードに「推定、最後の追跡から36日」と書けます。`stats.satellites.estimated` は、直前の描画で置いた衛星のうち、推定のものの数です。30日以内の衛星はこれまでどおり置かれ、推定ではありません。
- 打ち上げの前、崩壊の後には置きません。要素に `LAUNCH_DATE` と `DECAY_DATE` があるとき (CelesTrak の衛星カタログが書いており、`parseElements` はそれを残します)、前者より前、後者の日の終わりより後には置きません。打ち上げ日がなければ、国際標識 (`1998-067A`) の年の初めが最も早い日です。
- SGP4 がそこまで要素を進められないとき、または衛星が高さ約120 km より下に落ちるときは、表示から外し、置いたものとして数えません。推定が地球の中や、燃え尽きたはずの大気の中に描かれることはありません。400日先へ進めると、低い Starlink 衛星の多くは、この理由で消えます。
- オンとオフを切り替えると、次の描画ですべての群を置き直し、静止しているときは何も描きません。ページが群をこのオプション付きで作ったかどうかにかかわらず、要素にあるすべての群に効きます。

`estimate-far` をつけ、要素から43日後の時刻にしたページです。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>A satellite far from its elements, as an estimate</title>
  </head>
  <body>
    <chikyu-space center="-100,40" time="2026-12-15T12:00Z" speed="0" estimate-far texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

そのスクリプトです。

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
space.setSatellites("stations", createSatellites([iss]), { color: "#ffd54f", size: 6 });
// The page's moment is 43 days after the elements, past the 30 days a satellite is placed within: `estimate-far` (in the page) keeps it on the picture, drawn lighter, as where it would be had its orbit not changed.
space.addEventListener("chikyu-satellite-click", (event) => {
  const { estimated, estimatedDays } = (event as CustomEvent).detail;
  console.log(estimated ? `estimated, ${Math.round(estimatedDays)} days from its last tracking` : "placed from current elements");
});
console.log(space.estimateFar, space.placeSatellite({ group: "stations", index: 0 })?.estimated); // true true
```

## カタログ

GPS 衛星がどのリストにあるかをページが知らなくてすむように、パッケージには、名前、番号、軌道の種類を日本語と英語で並べた小さなカタログがあります。14のグループ (宇宙ステーション、有名な衛星、科学、地球観測、気象、静止衛星、GPS、GLONASS、ガリレオ、北斗、アマチュア無線、OneWeb、イリジウム、Starlink) と、名前を挙げる価値のある約40機があります。ISS や天宮から、いちばん古い現役の衛星バンガード1までです。各グループには、どの CelesTrak のリストにあるか (`celestrak`)、またはどの番号を1つずつ頼むか (`catnr`) が書いてあります。**軌道要素は入っていません。** 要素は、これまでどおりページが取得します。静止衛星 (`still: true`) は赤道の1点の上にあり、動かないように見えます。JWST は地球の軌道にいないので、入っていません。

```js
import { SATELLITE_GROUPS, catalogueEntry, findInCatalogue } from "@johnmorrisdotca/chikyu-earth/satellites";

const gps = SATELLITE_GROUPS.find((group) => group.id === "gps");
console.log(`${gps.label}: ${gps.about} (CelesTrak list ${gps.celestrak})`);
console.log(catalogueEntry(5).about);
console.log(findInCatalogue("sentinel 2").map((entry) => entry.name).join(", "));
```

`findInCatalogue(text)` は、名前、番号、衛星の役目 ("weather"、"telescope" など) に合う項目を、大文字小文字や記号を無視して探します。日本語の名前と、グループの日本語の見出しにも、入力したまま合います。かなでも漢字でも同じです。揃えるのは、大文字と小文字、全角と半角だけです。英語や数字で探すと、これまでと同じ項目が返ります。デモの「探す」欄はこれを使い、そのあと、読み込んだ衛星の名前の中も探します。

`catalogueRows()` は、すべてのグループと、名前のある衛星のそれぞれについて、平らな行を1つ返します。ページは、これを自分の検索ボックスの索引にできます。行には `kind` (`group` または `satellite`)、`id`、英語と日本語の `names`、`orbit` があります。衛星の行には `noradId` と `group` もあります。日本語の名前は、パッケージが短い名前を持っているときはその短い名前です (ISS、天宮、ハッブル)。短い名前がないときは、日本語の名前は英語の名前と同じです。Sentinel-2A のように、日本語でも同じ綴りで書く名前です。`aka` は、カタログにすでに書いてある別の名前です。ハッブルの HST などです。ページが表示している言語として `en` または `ja` を渡せます。どちらの名前も常に行に入っているので、1つの索引で両方の言語に使えます。

```js
import { catalogueRows, findInCatalogue } from "@johnmorrisdotca/chikyu-earth/satellites";

const hubble = catalogueRows().find((row) => row.noradId === 20580);
console.log(`${hubble.names.en} / ${hubble.names.ja} (${hubble.aka.join(", ")})`);
console.log(findInCatalogue("ハッブル").map((entry) => entry.name).join(", "));
console.log(catalogueRows().filter((row) => row.kind === "group").length);
```

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

## 通った場所を塗る

`element.paint = { id, length, swath }` は、1機の人工衛星の軌跡を地球の上に残します。`<chikyu-space>` と `<chikyu-earth-realistic>` の両方です。`id` は NORAD の番号、または `setSatellites` で置いたグループの `グループ名:番号` です。`length` は `1d` (既定)、`1w`、`1m` で、模擬した時間のうち、どれだけの長さを残すかです。`swath` は `track` (衛星の真下の点。既定) または `coverage` (衛星が地平線から 10° 以上の高さに見える地面で、高さから求めます)。`clearPaint()` で消します。別の衛星に変えても消えます。

軌跡は、地球に敷く 1 枚の絵です。フレームは、前のフレームから衛星が通った地面だけを足すので、1秒に1時間の時計でも線は切れず、時計を戻すと線も戻ります。時刻が止まっているとき、または塗っていないときは、絵を送りません。`length` より古い部分は、薄くなって消えます。日付変更線と極では線を分けるので、地図の端から端へ線が走りません。標本は、衛星の平均運動から求めた周回の3分の1より離さずに取るので、1か月分を一度に描いても、速い時計でも、軌道に沿った線になり、弦を引いたような線は出ません。時計を戻すと、現れる古い側を描き足すので、軌跡は縮みません。日付変更線をまたぐ範囲(coverage)は、地図の反対の端へ回り込みます。絵(2MB)は、最初の衛星を塗るときに作り、ビューを作るときには作りません。`clearPaint()` で返します。何も塗らないビューは、これを持ちません。

## 制限 (軽さのために)

宇宙の表示のほかの部分と同じルールで、6,000機でそれぞれテストしています。

- 止まっているときは何もしません。描画せず、フレームも要求せず、SGP4 も動かしません。
- SGP4 は、フレームレートに関係なく、おおよそ1秒に1回です。グループ全体を、ステップ (時計の速さに応じて1〜60秒) だけ離した2つの時刻で計算し、その間は算術だけで求めます。
- 描画は1秒に最大30回で、実際の速さのとき、または動きを減らす設定のときは、1秒に1回です。
- 実際の60倍より速いときは、2つの時刻が離れすぎて補間できないので、各衛星を、1フレームのあいだに進む軌道の短い線として描きます。場所は、その衛星のおおよそ1秒に1回の SGP4 の位置を、平均運動で軌道に沿って回したもので、毎フレーム SGP4 を呼びません。SGP4 の計算は、グループの一部ずつ (1秒に30フレームなら約30分の1ずつ) 各フレームに分け、各衛星は自分の位置から回すので、テンポよく描くときのフレームが、グループ全体の SGP4 を計算することはありません (17,000機を1回でまとめて計算すると、約12ミリ秒かかります)。1秒に1回かそれより少なくしか描かないときは、描くたびにグループ全体を計算します。離心率が0.02以上の軌道 (モルニヤ軌道や遷移軌道など) は、高さも回る速さも一定でないので、この方法では回さず、毎フレーム SGP4 で、いまの場所と1フレーム前の場所を求めます。この離心率の衛星はわずかなので、1フレームで1機あたり2回の呼び出しで済みます。選んだ衛星は、そのまま正確に置きます。`satellite-tint="orbit"` (既定ではオフ) は、軌道の分類ごとに (低軌道、中軌道、静止軌道、高楕円軌道、その他) 点の色を変えます。点は、地球が大きく描かれるほど大きく、小さく描かれるほど小さくなり、明るい地面の上でも見えるように暗い縁がつきます。`stats.satellites.placed` は描いた数、`segments` は線の数 (60倍以下では 0)、`epochMs` はいちばん新しい軌道要素の時刻です。
- 線には画面上の最大の長さがあり、1秒が1時間でも1日でも、1秒が10分のときと同じ見た目になります。地球が画面いっぱいのときは数ミリで、地球をまたぐ長い直線にはなりません。長さは次の2つのうち短いほうです。1つは地球の描かれた半径に対する割合の 0.025 (軌道に沿って約160 km、1秒が10分のとき低い衛星が1フレームで進む分) で、地球が小さく描かれるほど線も比例して短くなり、最後は点になります。長さを固定すると、小さな地球では長く太く見えてしまうためです。もう1つは `satellite-streak-max` (プロパティは `satelliteStreakMax`) で、CSS ピクセルの上限です。ページで指定しないときは 8 で、地球が半径約320ピクセルより大きく描かれるときに効きます。`off` または `0` にすると、これまでどおり1フレームが進む分の全体を描きます。上限を移動時間 (秒) ではなく画面上の長さにしたのは、低軌道の衛星が秒速約7.7 km、静止衛星が約3 km で動くためです。秒で決めると高い衛星の線が低い衛星の半分より短くなりますが、この方法なら両方が同じ長さになります。進む分は、実際のフレーム時間に関わらず1秒30フレームの1フレーム分で決まるので、遅いコンピューターでも線は長くなりません。線は衛星の位置で終わり、そこから軌道に沿って後ろへ伸びます。地球が小さく描かれると、印の重みも軽くなります。描かれた半径が150ピクセルから40ピクセルへ小さくなるにつれ、線は薄くなり、点のまわりの暗い縁は消えていきます。衛星が地球の手前側の一定の割合 (点は6%、線は35%) を超えて覆うときは、その分だけ薄く描くので、1万6千の衛星で小さな地球が白っぽくなることはありません。地球全体が見えるときの描き方は、これまでと同じです。`stats.satellites.longestStreakPx` は、いま描いている最長の線の長さ、`streakCapPx` はいまの上限、`weight` は0から1の重み、`fade` は混み具合に応じた濃さの割合です。
- 画面の外や、隠れたタブでは何も描きません。WebGL のコンテキストは1つで、グループや要素を取り除くとすべて解放され、コンテキストが失われても、衛星ごと戻ります。

数値とテストは、[docs/satellites.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellites.md) にあります。
