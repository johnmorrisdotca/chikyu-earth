import { COUNTRIES, countryList, globe, type CountryProps, type GlobeOptions } from "@johnmorrisdotca/chikyu-earth";
import type { ChikyuEarth } from "@johnmorrisdotca/chikyu-earth/element";
import { attachMarkers, type MarkerInput } from "@johnmorrisdotca/chikyu-earth/markers";

const options: GlobeOptions = { size: 240, style: "thick", centre: { lon: 139.7, lat: 35.7 } };
const svg: string = globe(options);
const japan: CountryProps | undefined = countryList().find((country) => country.alpha2 === "JP");
console.log(svg.length, japan?.name, COUNTRIES.features.length);

export function mark(earth: ChikyuEarth): void {
  const tokyo: MarkerInput = { id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo" };
  attachMarkers(earth).add(tokyo);
}

// @ts-expect-error "neon" is not a look
globe({ style: "neon" });
