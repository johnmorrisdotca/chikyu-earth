// The places the passes page offers as one press, with the time zone each is in (an IANA name: the browser turns it into local time). Coordinates are facts, as in places.ts (Wikidata, CC0), to two decimals.
export interface TryPlace {
  id: string;
  name: string;
  ja: string;
  lat: number;
  lon: number;
  zone: string;
}

export const TRY_PLACES: readonly TryPlace[] = [
  { id: "tokyo", name: "Tokyo", ja: "東京", lat: 35.69, lon: 139.69, zone: "Asia/Tokyo" },
  { id: "toronto", name: "Toronto", ja: "トロント", lat: 43.65, lon: -79.38, zone: "America/Toronto" },
  { id: "london", name: "London", ja: "ロンドン", lat: 51.51, lon: -0.13, zone: "Europe/London" },
  { id: "sydney", name: "Sydney", ja: "シドニー", lat: -33.87, lon: 151.21, zone: "Australia/Sydney" },
  { id: "nairobi", name: "Nairobi", ja: "ナイロビ", lat: -1.29, lon: 36.82, zone: "Africa/Nairobi" },
  { id: "reykjavik", name: "Reykjavik", ja: "レイキャビク", lat: 64.15, lon: -21.94, zone: "Atlantic/Reykjavik" },
];

/** Other cities the search finds, with their zones. */
export const MORE_PLACES: readonly TryPlace[] = [
  { id: "paris", name: "Paris", ja: "パリ", lat: 48.86, lon: 2.35, zone: "Europe/Paris" },
  { id: "new-york", name: "New York", ja: "ニューヨーク", lat: 40.71, lon: -74.01, zone: "America/New_York" },
  { id: "los-angeles", name: "Los Angeles", ja: "ロサンゼルス", lat: 34.05, lon: -118.24, zone: "America/Los_Angeles" },
  { id: "mexico-city", name: "Mexico City", ja: "メキシコシティ", lat: 19.43, lon: -99.13, zone: "America/Mexico_City" },
  { id: "sao-paulo", name: "São Paulo", ja: "サンパウロ", lat: -23.55, lon: -46.63, zone: "America/Sao_Paulo" },
  { id: "buenos-aires", name: "Buenos Aires", ja: "ブエノスアイレス", lat: -34.6, lon: -58.38, zone: "America/Argentina/Buenos_Aires" },
  { id: "cairo", name: "Cairo", ja: "カイロ", lat: 30.04, lon: 31.24, zone: "Africa/Cairo" },
  { id: "lagos", name: "Lagos", ja: "ラゴス", lat: 6.52, lon: 3.38, zone: "Africa/Lagos" },
  { id: "cape-town", name: "Cape Town", ja: "ケープタウン", lat: -33.92, lon: 18.42, zone: "Africa/Johannesburg" },
  { id: "moscow", name: "Moscow", ja: "モスクワ", lat: 55.76, lon: 37.62, zone: "Europe/Moscow" },
  { id: "istanbul", name: "Istanbul", ja: "イスタンブール", lat: 41.01, lon: 28.98, zone: "Europe/Istanbul" },
  { id: "mumbai", name: "Mumbai", ja: "ムンバイ", lat: 19.08, lon: 72.88, zone: "Asia/Kolkata" },
  { id: "beijing", name: "Beijing", ja: "北京", lat: 39.9, lon: 116.41, zone: "Asia/Shanghai" },
  { id: "seoul", name: "Seoul", ja: "ソウル", lat: 37.57, lon: 126.98, zone: "Asia/Seoul" },
  { id: "singapore", name: "Singapore", ja: "シンガポール", lat: 1.35, lon: 103.82, zone: "Asia/Singapore" },
  { id: "vancouver", name: "Vancouver", ja: "バンクーバー", lat: 49.28, lon: -123.12, zone: "America/Vancouver" },
  { id: "quito", name: "Quito", ja: "キト", lat: -0.18, lon: -78.47, zone: "America/Guayaquil" },
];

/** The satellites the page offers: its NORAD number, and which of the shipped group files holds it. */
export const SATELLITES = [
  { id: "iss", norad: 25544, group: "stations" },
  { id: "css", norad: 48274, group: "stations" },
  { id: "hst", norad: 20580, group: "famous" },
] as const;
