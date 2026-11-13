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
