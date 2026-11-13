---
title: 地点がどの場所にあるか
section: how-to
order: 22
description: 経度と緯度がどの国、海、大陸、都市の上にあるか、また地上軌跡に沿ってそれがどう変わるかを調べます。
---

`@johnmorrisdotca/chikyu-earth/place` は、1つの地点、または地上軌跡になる点の列について「ここはどこか」を返します。これを読み込まないページは、この部分を読み込みません。何も描きません。

## 1つの地点

```js
import { alongTrack, placeOf } from "@johnmorrisdotca/chikyu-earth/place";

const paris = placeOf(2.35, 48.86);
const ocean = placeOf(-150, 0);
const cities = {
  nearest() {
    return { city: { id: "Q90", name: { en: "Paris", ja: "パリ" }, country: "FR", lat: 48.8566, lon: 2.3522 }, km: 0.5 };
  },
};
const named = placeOf(2.35, 48.86, { cities });
const track = alongTrack([
  { lon: -40, lat: 40, t: 0 },
  { lon: -3.7, lat: 40.4, t: 1 },
  { lon: 2.35, lat: 48.86, t: 2 },
]);
console.log(paris.country.code, paris.continent.id);
console.log(ocean.sea.id, ocean.country === null);
console.log(named.nearestCity.name, Math.round(named.nearestCity.bearingDeg));
console.log(track.map((row) => row.entering.id).join(" "));
```

`placeOf(lon, lat)` は5つの欄を返します。

- **country** は、点が国の輪郭の内側にあるときに入ります。輪郭は、線で描く地球儀と同じ、ナチュラルアースの1億1000万分の1の図です。`code` は2文字のコードで、コードのない輪郭だけ null です。`name` と `nameJa` は英語と日本語の名前です。
- **near** は、どの輪郭の内側でもなく、いちばん近い輪郭まで 50 km 以内のときに、代わりに入ります（`PLACE_COAST_KM`）。この縮尺の線は、実際の海岸から数十キロメートルずれることがあるので、それだけ近い点は国の内側とは返しません。`distanceKm` は輪郭までの距離です。ページは、その国に近づいている、と読めます。
- **sea** は、`country` が無いときだけ入ります。名前のある海、湾、大洋のうち、その水域の点まで届く範囲（`SEA_REACH_KM`）で最も近いものです。小さい水域の点の方が近いので、地中海は大西洋より先に選ばれます。5つの大洋は、地球全体で一番近い名前では分けません。大西洋の点は赤道の近くにあり、その分け方では北大西洋が北極海になってしまいます。どの水域にも届かない点は、`sea` が null です。
- **continent** は、国、または近くの国に従い、外洋の上では null です。名前は海の名前の一覧と同じです（アフリカ、南極、アジア、ヨーロッパ、北アメリカ、南アメリカ、オーストラリア）。国としてのオーストラリアは、その大陸になります。輪郭がオセアニアとする国は、オーストラリア以外は `oceania` で、輪郭自身の名前です。ロシアの東部とフランス領ギアナは、その国が属するとされた大陸の点から大きく離れています。別の大陸の点が 2,500 km 以上近いときは、そちらを使います。
- **nearestCity** は、呼び出した側が都市の一覧を渡さないかぎり null です。`cities` は `here-city` と同じ形です（首都、100万人の都市、10万人の都市）。`towns` は渡したときだけ読み、その3段階が名指しした1つか2つの国についてだけ読みます。`maxKm` は既定が 100 で、上限は 20,000 です。`nameJa` は短い日本語名、なければ日本語名、それも無ければ英語名です。`bearingDeg` は、地点から都市へ、北から時計回りの角度です。

輪郭は15度の升目に分けてあります。その表ができてから、1回の呼び出しはおよそ 0.14 ミリ秒なので、1秒に1回なら余裕があります。

-180 から 180 の外の `lon` は折り返します。緯度が -90 から 90 の間でなければ、すべての欄は null です。

## 地上軌跡に沿って

`alongTrack(points)` は、順番に並んだ `{ lon, lat, t }` を受け取り、変わったところを返します。最初の点は必ず入り、`leaving` は null です。その後の行は、国、近くの国、または海が変わった点です。`t` はその点自身の時刻で、点と点のあいだを推測した時刻ではありません。`entering.kind` は `country`、`near`、`sea` のいずれかです。ページは、種類が `near` のあいだを「近づいている」、`leaving` を「離れた」と読めます。
