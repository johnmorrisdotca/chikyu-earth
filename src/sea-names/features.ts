// Label points for oceans, seas, gulfs, bays and continents. Each point is the sample inside the
// published public-domain shape that sits nearest that shape's centre. The names are the published
// English and Japanese names. The shapes themselves are not in this package. See NOTICE.md.
import type { SeaFeature } from "./geometry.ts";

/**
 * The oceans, seas, gulfs, bays and continents that can be named, each with the point its name is set at.
 *
 * @example
 * ```ts
 * import { SEA_FEATURES } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(SEA_FEATURES.find((one) => one.id === "africa")?.name.en);
 * ```
 */
export const SEA_FEATURES: readonly SeaFeature[] = [
  { id: "arctic-ocean", kind: "ocean", lon: -178.50, lat: 87.71, name: { en: "Arctic Ocean", ja: "北極海" } },
  { id: "southern-ocean", kind: "ocean", lon: -88.50, lat: -70.76, name: { en: "Southern Ocean", ja: "南極海" } },
  { id: "atlantic-ocean", kind: "ocean", lon: -28.59, lat: -5.03, name: { en: "Atlantic Ocean", ja: "大西洋" } },
  { id: "pacific-ocean", kind: "ocean", lon: -145.50, lat: -8.03, name: { en: "Pacific Ocean", ja: "太平洋" } },
  { id: "indian-ocean", kind: "ocean", lon: 81.12, lat: -38.03, name: { en: "Indian Ocean", ja: "インド洋" } },
  { id: "south-america", kind: "continent", lon: -59.34, lat: -19.88, name: { en: "South America", ja: "南アメリカ" } },
  { id: "australia", kind: "continent", lon: 139.18, lat: -25.15, name: { en: "Australia", ja: "オーストラリア大陸" } },
  { id: "africa", kind: "continent", lon: 16.50, lat: 7.21, name: { en: "Africa", ja: "アフリカ" } },
  { id: "antarctica", kind: "continent", lon: 34.00, lat: -88.00, name: { en: "Antarctica", ja: "南極大陸" } },
  { id: "asia", kind: "continent", lon: 96.10, lat: 47.33, name: { en: "Asia", ja: "アジア" } },
  { id: "europe", kind: "continent", lon: 20.52, lat: 54.03, name: { en: "Europe", ja: "ヨーロッパ" } },
  { id: "north-america", kind: "continent", lon: -102.09, lat: 61.65, name: { en: "North America", ja: "北アメリカ" } },
  { id: "black-sea", kind: "sea", lon: 34.98, lat: 42.42, name: { en: "Black Sea", ja: "黒海" } },
  { id: "philippine-sea", kind: "sea", lon: 134.32, lat: 19.12, name: { en: "Philippine Sea", ja: "フィリピン海" } },
  { id: "tasman-sea", kind: "sea", lon: 159.86, lat: -40.29, name: { en: "Tasman Sea", ja: "タスマン海" } },
  { id: "bay-of-bengal", kind: "bay", lon: 87.19, lat: 13.02, name: { en: "Bay of Bengal", ja: "ベンガル湾" } },
  { id: "south-china-sea", kind: "sea", lon: 112.85, lat: 10.28, name: { en: "South China Sea", ja: "南シナ海" } },
  { id: "arabian-sea", kind: "sea", lon: 64.53, lat: 12.82, name: { en: "Arabian Sea", ja: "アラビア海" } },
  { id: "beaufort-sea", kind: "sea", lon: -137.07, lat: 70.71, name: { en: "Beaufort Sea", ja: "ボーフォート海" } },
  { id: "caribbean-sea", kind: "sea", lon: -74.85, lat: 15.99, name: { en: "Caribbean Sea", ja: "カリブ海" } },
  { id: "gulf-of-mexico", kind: "gulf", lon: -90.36, lat: 25.30, name: { en: "Gulf of Mexico", ja: "メキシコ湾" } },
  { id: "labrador-sea", kind: "sea", lon: -54.27, lat: 54.96, name: { en: "Labrador Sea", ja: "ラブラドル海" } },
  { id: "hudson-bay", kind: "bay", lon: -84.46, lat: 59.20, name: { en: "Hudson Bay", ja: "ハドソン湾" } },
  { id: "caspian-sea", kind: "sea", lon: 51.21, lat: 41.11, name: { en: "Caspian Sea", ja: "カスピ海" } },
  { id: "baffin-bay", kind: "bay", lon: -65.57, lat: 74.42, name: { en: "Baffin Bay", ja: "バフィン湾" } },
  { id: "gulf-of-alaska", kind: "gulf", lon: -149.88, lat: 58.55, name: { en: "Gulf of Alaska", ja: "アラスカ湾" } },
  { id: "red-sea", kind: "sea", lon: 38.33, lat: 22.96, name: { en: "Red Sea", ja: "紅海" } },
  { id: "sea-of-okhotsk", kind: "sea", lon: 147.72, lat: 50.78, name: { en: "Sea of Okhotsk", ja: "オホーツク海" } },
  { id: "weddell-sea", kind: "sea", lon: -46.28, lat: -75.96, name: { en: "Weddell Sea", ja: "ウェッデル海" } },
  { id: "persian-gulf", kind: "gulf", lon: 52.22, lat: 25.47, name: { en: "Persian Gulf", ja: "ペルシア湾" } },
  { id: "mediterranean-sea", kind: "sea", lon: 20.41, lat: 35.33, name: { en: "Mediterranean Sea", ja: "地中海" } },
  { id: "ross-sea", kind: "sea", lon: -169.50, lat: -77.69, name: { en: "Ross Sea", ja: "ロス海" } },
  { id: "coral-sea", kind: "sea", lon: 156.28, lat: -19.38, name: { en: "Coral Sea", ja: "珊瑚海" } },
  { id: "sea-of-japan", kind: "sea", lon: 135.81, lat: 41.78, name: { en: "Sea of Japan", ja: "日本海" } },
];
