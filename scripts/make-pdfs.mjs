// The ready-made PDFs of the printable sheets, printed from the built demo (site/kids.html) by Chromium's page.pdf into site/pdf/, with a list page for each language:
//   pnpm site && node scripts/make-pdfs.mjs
// A4 and US Letter, English and Japanese: the three sides of the globe, the world map, the seasons, day and night at the two equinoxes and the two solstices, and "my country" for twelve countries.
// The server is this package's picture-script port, 8202; one headless browser under the browser lock, closed when the last PDF is written.
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "@playwright/test";
import { SOFTWARE_GL_ARGS, withBrowserLock } from "@johnmorrisdotca/kazoku-ui/testing";

const PORT = Number(process.env.PDF_PORT ?? 8202);
const site = new URL("../site/", import.meta.url).pathname;
const PAPERS = ["a4", "letter"];
const LANGS = ["en", "ja"];
const YEAR = 2026;
const GLOBES = [["americas", "The Americas", "アメリカ"], ["europe-africa", "Europe and Africa", "ヨーロッパと アフリカ"], ["asia-oceania", "Asia and Oceania", "アジアと オセアニア"]];
const WHENS = [["03-20", "20 March", "3がつ 20にち"], ["06-21", "21 June", "6がつ 21にち"], ["09-22", "22 September", "9がつ 22にち"], ["12-21", "21 December", "12がつ 21にち"]];
const COUNTRIES = [["JP", "Japan", "日本"], ["US", "United States", "アメリカ合衆国"], ["CA", "Canada", "カナダ"], ["GB", "United Kingdom", "イギリス"], ["FR", "France", "フランス"], ["DE", "Germany", "ドイツ"], ["AU", "Australia", "オーストラリア"], ["BR", "Brazil", "ブラジル"], ["CN", "China", "中国"], ["IN", "India", "インド"], ["MX", "Mexico", "メキシコ"], ["NZ", "New Zealand", "ニュージーランド"]];
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };

const server = createServer((req, res) => {
  void (async () => {
    let url = (req.url ?? "/").split("?")[0].replace(/^\/chikyu-earth\/?/, "/");
    if (url === "/") url = "/index.html";
    try {
      const path = join(site, normalize(url));
      res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  })();
}).listen(PORT);

/** Every PDF: its file name, the page's address and the words that list it. */
const jobs = [];
for (const lang of LANGS) {
  for (const paper of PAPERS) {
    const add = (section, slug, query, en, ja) => jobs.push({ lang, paper, section, file: `chikyu-earth-${slug}-${paper}-${lang}.pdf`, query: `${query}&paper=${paper}&lang=${lang}`, label: lang === "ja" ? ja : en });
    for (const [view, en, ja] of GLOBES) add("globe", `globe-${view}`, `kind=globe&view=${view}`, en, ja);
    add("map", "map", "kind=map", "A map of the world", "せかいちず");
    for (const [code, en, ja] of COUNTRIES) add("country", `country-${code.toLowerCase()}`, `kind=country&c=${code}`, en, ja);
    for (const [day, en, ja] of WHENS) add("daynight", `daynight-${day}`, `kind=daynight&when=${YEAR}-${day}T12:00Z`, `${en}, 12:00 UTC`, `${ja}、12じ (UTC)`);
    add("seasons", "seasons", "kind=seasons", "The seasons", "きせつ");
  }
}

await mkdir(join(site, "pdf"), { recursive: true });
let written = 0;
let bytes = 0;
await withBrowserLock(async () => {
  const browser = await chromium.launch({ args: SOFTWARE_GL_ARGS });
  try {
    for (const lang of LANGS) {
      for (const paper of PAPERS) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: lang === "ja" ? "ja-JP" : "en-US", reducedMotion: "reduce" });
        await page.addInitScript(() => { window.print = () => {}; });
        await page.emulateMedia({ colorScheme: "light" });
        for (const job of jobs.filter((one) => one.lang === lang && one.paper === paper)) {
          await page.goto(`http://127.0.0.1:${PORT}/chikyu-earth/kids.html?${job.query}`);
          await page.locator("#paper-inner .kazoku-body svg").first().waitFor();
          await page.locator("#print").click();
          await page.emulateMedia({ media: "print", colorScheme: "light" });
          const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
          await writeFile(join(site, "pdf", job.file), pdf);
          written += 1;
          bytes += pdf.length;
          await page.evaluate(() => window.dispatchEvent(new window.Event("afterprint")));
          await page.emulateMedia({ media: "screen", colorScheme: "light" });
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
});

const SAY = {
  en: { title: "Printable sheets: PDFs", intro: "Print on A4 or US Letter, one page each, in black and white if you like. The globe to colour, a world map, my country (draw the flag), day and night and the seasons.", back: "Back to the page where you pick a sheet", paper: { a4: "A4", letter: "US Letter" }, other: "日本語 (Japanese)", otherPage: "ja.html", page: "kids.html", sections: { globe: "The globe", map: "World map", country: "My country", daynight: "Day and night", seasons: "The seasons" } },
  ja: { title: "印刷するシートの PDF", intro: "A4 か USレターで、1まいずつ いんさつします。しろくろでも だいじょうぶです。ちきゅう、せかいちず、わたしの くに (はたを かこう)、ひると よる、きせつ。", back: "シートを えらぶ ページに もどる", paper: { a4: "A4", letter: "USレター" }, other: "English", otherPage: "./", page: "kids.html?lang=ja", sections: { globe: "ちきゅう", map: "せかいちず", country: "わたしの くに", daynight: "ひると よる", seasons: "きせつ" } },
};
for (const lang of LANGS) {
  const say = SAY[lang];
  const sections = Object.keys(say.sections).map((section) => {
    const labels = [...new Set(jobs.filter((job) => job.lang === lang && job.section === section).map((job) => job.label))];
    const rows = labels.map((label) => `<tr><th scope="row">${label}</th>${PAPERS.map((paper) => `<td><a href="${jobs.find((job) => job.lang === lang && job.section === section && job.label === label && job.paper === paper).file}">${say.paper[paper]}</a></td>`).join("")}</tr>`).join("\n");
    return `<h2>${say.sections[section]}</h2>\n<table><tbody>\n${rows}\n</tbody></table>`;
  });
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${say.title} · Chikyu Earth</title>
<style>:root{color-scheme:light dark}body{margin:0 auto;max-width:44rem;padding:1rem 16px;font:1rem/1.5 system-ui,"Hiragino Sans","Noto Sans JP",sans-serif}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.3rem .6rem;border-bottom:1px solid #8886}a{display:inline-block;min-height:48px;line-height:48px;padding:0 .5rem}</style></head>
<body><h1>${say.title}</h1><p>${say.intro}</p><p><a href="../${say.page}">${say.back}</a> · <a href="${say.otherPage}">${say.other}</a></p>
${sections.join("\n")}
</body></html>
`;
  await writeFile(join(site, "pdf", lang === "en" ? "index.html" : "ja.html"), html, "utf8");
}
console.log(`pdfs: ${written} written to site/pdf/, ${(bytes / 1048576).toFixed(1)} MB`);
// The sheets are vector drawings and should stay small: over 20 MB in all, say so in the run (a warning, so a font on the runner never stops the site going out).
if (bytes > 20 * 1048576) console.log(`::warning::the PDFs are ${(bytes / 1048576).toFixed(1)} MB, over the 20 MB budget`);
