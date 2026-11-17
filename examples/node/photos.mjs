import { photoCredit, photoFallbacks, photoPieces, photoUrl } from "@johnmorrisdotca/chikyu-earth/photos";

const tokyo = { lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10", widthPx: 512 };
const url = new URL(photoUrl(tokyo));
const fiji = photoPieces({ lat: -17.7, lon: 179.9, sizeKm: 200, date: "2026-11-10", widthPx: 512 });
const days = photoFallbacks(tokyo, 3).map((shot) => shot.date);
console.log(url.searchParams.get("LAYERS"), url.searchParams.get("TIME"));
console.log(fiji.length, fiji.map((piece) => piece.widthPx).join("+"));
console.log(days.join(" "));
console.log(photoCredit("en"));
