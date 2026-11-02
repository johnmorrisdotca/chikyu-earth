// The demo's own places, to show markers: city centres and stadiums, as longitude and latitude to two decimals. Coordinates are facts, taken from Wikidata (CC0);
// the package ships none of them.
import type { MarkerInput } from "../src/markers/index.ts";

const cities: [string, number, number][] = [
  ["Tokyo", 139.69, 35.69],
  ["Toronto", -79.38, 43.65],
  ["London", -0.13, 51.51],
  ["Paris", 2.35, 48.86],
  ["New York", -74.01, 40.71],
  ["Los Angeles", -118.24, 34.05],
  ["Mexico City", -99.13, 19.43],
  ["São Paulo", -46.63, -23.55],
  ["Buenos Aires", -58.38, -34.6],
  ["Cairo", 31.24, 30.04],
  ["Lagos", 3.38, 6.52],
  ["Nairobi", 36.82, -1.29],
  ["Cape Town", 18.42, -33.92],
  ["Moscow", 37.62, 55.76],
  ["Istanbul", 28.98, 41.01],
  ["Mumbai", 72.88, 19.08],
  ["Beijing", 116.41, 39.9],
  ["Seoul", 126.98, 37.57],
  ["Singapore", 103.82, 1.35],
  ["Sydney", 151.21, -33.87],
  ["Vancouver", -123.12, 49.28],
  ["Reykjavik", -21.94, 64.15],
];

const stadiums: [string, number, number][] = [
  ["Wembley Stadium", -0.28, 51.56],
  ["Camp Nou", 2.12, 41.38],
  ["Allianz Arena", 11.62, 48.22],
  ["Maracanã", -43.23, -22.91],
  ["Estadio Azteca", -99.15, 19.3],
  ["Yankee Stadium", -73.93, 40.83],
  ["Rogers Centre", -79.39, 43.64],
  ["Japan National Stadium", 139.71, 35.68],
  ["Melbourne Cricket Ground", 144.98, -37.82],
  ["Narendra Modi Stadium", 72.6, 23.09],
];

export const PLACES: MarkerInput[] = [
  ...cities.map(([name, lon, lat], i): MarkerInput => ({ id: `city:${name}`, lon, lat, label: name, group: "Cities", color: "#6cd0ff", priority: 30 - i, description: `${name}, a city` })),
  ...stadiums.map(([name, lon, lat], i): MarkerInput => ({ id: `stadium:${name}`, lon, lat, label: name, group: "Stadiums", color: "#ffb454", icon: "diamond", size: 9, priority: 10 - i, description: `${name}, a stadium` })),
];

/** `n` made-up places spread over the Earth, for checking that thousands of markers stay cheap (`?places=5000`). */
export function crowd(n: number): MarkerInput[] {
  let seed = 12345;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: n }, (_, i) => ({
    id: `crowd:${i}`,
    lon: random() * 360 - 180,
    lat: (Math.asin(random() * 2 - 1) * 180) / Math.PI,
    label: `Place ${i}`,
    group: "Crowd",
    color: "#a5e075",
    size: 6,
  }));
}
