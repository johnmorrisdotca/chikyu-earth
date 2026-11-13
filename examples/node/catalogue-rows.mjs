import { catalogueRows, findInCatalogue } from "@johnmorrisdotca/chikyu-earth/satellites";

const hubble = catalogueRows().find((row) => row.noradId === 20580);
console.log(`${hubble.names.en} / ${hubble.names.ja} (${hubble.aka.join(", ")})`);
console.log(findInCatalogue("ハッブル").map((entry) => entry.name).join(", "));
console.log(catalogueRows().filter((row) => row.kind === "group").length);
