// The sheets page in a real browser: pick a sheet, the paper and the type, see the sheet as it prints, press Print / save PDF. Chromium also prints each kind of sheet on every paper to a PDF (page.pdf) and the PDF is read for its
// paper size and its page count.
import { expect, test, type Page } from "@playwright/test";

const PAPERS = [["a4", 210, 297], ["letter", 215.9, 279.4], ["a3", 297, 420], ["tabloid", 279.4, 431.8]] as const;
const PT = 72 / 25.4;
const MM = 25.4 / 96;
const PAGE = "/chikyu-earth/kids.html";
const KINDS = ["globe", "map", "country", "daynight", "seasons"] as const;

const open = async (page: Page, query = "kind=globe&view=americas"): Promise<string[]> => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Reflect.set(window, "__printed", 0);
    window.print = () => Reflect.set(window, "__printed", (Reflect.get(window, "__printed") as number) + 1);
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${PAGE}?${query}`);
  await expect(page.locator("#paper-inner .kazoku-body svg").first()).toBeVisible();
  return errors;
};
const readPdf = (bytes: Buffer): { pages: number; boxes: [number, number][] } => {
  const text = bytes.toString("latin1");
  const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m): [number, number] => [Number(m[1]), Number(m[2])]);
  return { pages: (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length, boxes };
};
const near = (got: number, want: number): boolean => Math.abs(got - want) <= 1.5;

test("the page has the five sheets as a row of buttons; a sheet has the brand, the title, the Name box, the credits, a QR code and one page", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator("#kinds button")).toHaveCount(5);
  const sheet = page.locator("#paper-inner .kazoku-sheet");
  await expect(sheet.locator(".kazoku-brand").first()).toHaveText("Space Program X");
  await expect(sheet.locator(".kazoku-package").first()).toHaveText("Chikyu Earth");
  await expect(sheet.locator(".kazoku-title").first()).toHaveText("The Americas");
  await expect(sheet.locator(".kazoku-namelabel").first()).toHaveText("Name:");
  await expect(sheet.locator(".kazoku-page")).toHaveCount(1);
  await expect(sheet.locator(".kazoku-qr svg").first()).toBeVisible();
  await expect(sheet.locator(".kazoku-credits").first()).toContainText("Natural Earth");
  await expect(sheet.locator(".kazoku-meta").first()).toContainText("Version");
  await expect(page.locator("#info")).toHaveText("A4: one page");
  await expect(sheet.locator("svg [data-coast]")).toHaveCount(1);
  await expect(sheet.locator('svg [data-place="north-america"]').first()).toBeVisible();
  await page.locator("#views [data-value=europe-africa]").click();
  await expect(sheet.locator(".kazoku-title").first()).toHaveText("Europe and Africa");
  await expect(sheet.locator('svg [data-place="africa"]').first()).toBeVisible();
  await expect(page).toHaveURL(/view=europe-africa/);
  await page.locator("#kinds [data-value=map]").click();
  await expect(sheet.locator(".kazoku-title").first()).toHaveText("A map of the world");
  expect(await sheet.locator("svg [data-place]").evaluateAll((els) => new Set(els.map((el) => el.getAttribute("data-place"))).size)).toBe(12);
  await page.locator("#kinds [data-value=seasons]").click();
  await expect(sheet.locator("svg [data-season]")).toHaveCount(4);
  await expect(page.locator("#row-view")).toBeHidden();
  expect(errors).toEqual([]);
});

test("my country: a country, its capital as a star, the box to draw the flag; the flag to check against is beside the buttons, never on the sheet", async ({ page }) => {
  await open(page, "kind=country&c=JP");
  const sheet = page.locator("#paper-inner .kazoku-sheet");
  await expect(sheet.locator(".kazoku-title").first()).toHaveText("My country: Japan");
  await expect(sheet.locator("svg [data-capital]")).toBeVisible();
  await expect(sheet.locator("svg [data-capital-name]")).toHaveText("Tokyo");
  await expect(sheet.locator("svg [data-flag-box]")).toBeVisible();
  await expect(sheet.locator("svg [data-flag-say]").first()).toContainText("Draw");
  await expect(page.locator("#flag")).toBeHidden();
  await page.locator("#flag-toggle").click();
  await expect(page.locator("#flag")).toBeVisible();
  await expect(page.locator("#flag")).toHaveAttribute("alt", "The flag of Japan");
  await expect(sheet.locator("img")).toHaveCount(0);
  await page.locator("#country").selectOption("FR");
  await expect(sheet.locator(".kazoku-title").first()).toHaveText("My country: France");
  await expect(sheet.locator("svg [data-capital-name]")).toHaveText("Paris");
  await expect(page).toHaveURL(/c=FR/);
  await page.locator("#country").selectOption("AQ");
  await expect(sheet.locator("svg [data-capital]")).toHaveCount(0);
  await expect(page.locator("#flag-note")).toContainText("no flag");
});

test("day and night: the date and time change the Sun's place on the sheet, and the buttons pick the equinoxes and solstices", async ({ page }) => {
  await open(page, "kind=daynight&when=2026-06-21T12:00Z");
  const sheet = page.locator("#paper-inner .kazoku-sheet");
  const sun = async (): Promise<number[]> => ((await sheet.locator("svg").first().getAttribute("data-sun")) ?? "").split(" ").map(Number);
  const june = await sun();
  expect(june[1]).toBeGreaterThan(23);
  await expect(sheet.locator("svg [data-night]")).toBeVisible();
  await page.locator("#whens [data-value=kd_solsticeDec]").click();
  const december = await sun();
  expect(december[1]).toBeLessThan(-23);
  await expect(page).toHaveURL(/when=2026-12-21T12%3A00Z/);
  await page.locator("#date").fill("2026-03-20");
  await page.locator("#time").fill("18:00");
  await page.locator("#time").dispatchEvent("change");
  const march = await sun();
  expect(Math.abs(march[1]!)).toBeLessThan(1.5);
  expect(Math.abs(march[0]! + 90)).toBeLessThan(5);
  await expect(sheet.locator('.kazoku-credits')).toContainText("Meeus");
});

test("the picture is drawn at the size it prints, whatever font draws the words: every line of text is inside it", async ({ page }) => {
  await open(page);
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = '.kazoku-sheet { font-family: Verdana, "DejaVu Sans", sans-serif !important; }';
    document.documentElement.append(style);
  });
  for (const paper of ["a4", "letter"]) {
    for (const query of ["kind=globe&view=americas", "kind=globe&view=asia-oceania&type=normal", "kind=map", "kind=country&c=CA", "kind=country&c=ID&lang=ja", "kind=daynight&when=2026-06-21T12:00Z", "kind=seasons", "kind=seasons&lang=ja&type=normal", "kind=map&lang=ja"]) {
      await page.goto(`${PAGE}?${query}&paper=${paper}`);
      await expect(page.locator("#paper-inner .kazoku-body svg").first()).toBeVisible();
      const got = await page.locator("#paper-inner .kazoku-body svg").evaluateAll((svgs, mm) => {
        const scaled = new DOMMatrix(getComputedStyle(document.querySelector("#paper-inner")!).transform).a;
        return svgs.map((svg) => {
          const frame = svg.getBoundingClientRect();
          const box = (svg as SVGSVGElement).viewBox.baseVal;
          const slack = 0.5 / mm;
          const outside = [...svg.querySelectorAll("text")]
            .map((text) => ({ text: text.textContent, b: text.getBoundingClientRect() }))
            .filter(({ b }) => !(b.left >= frame.left - slack && b.top >= frame.top - slack && b.right <= frame.right + slack && b.bottom <= frame.bottom + slack))
            .map(({ text, b }) => `${text}: left ${((b.left - frame.left) * mm).toFixed(1)}, right ${((frame.right - b.right) * mm).toFixed(1)}, top ${((b.top - frame.top) * mm).toFixed(1)}, bottom ${((frame.bottom - b.bottom) * mm).toFixed(1)} mm`);
          return { scale: Math.min((frame.width * mm) / scaled / box.width, (frame.height * mm) / scaled / box.height), outside };
        });
      }, MM);
      for (const one of got) {
        expect(one.scale, `${query} ${paper}: the picture's scale`).toBeGreaterThan(0.99);
        expect(one.scale, `${query} ${paper}`).toBeLessThan(1.01);
        expect(one.outside, `${query} ${paper}: the text outside the picture`).toEqual([]);
      }
    }
  }
});

test("Print / save PDF opens a print-only copy, calls window.print, and removes the copy afterwards", async ({ page }) => {
  await open(page);
  await page.locator("#print").click();
  expect(await page.evaluate(() => Reflect.get(window, "__printed"))).toBe(1);
  await expect(page.locator("body > .kazoku-print-root .kazoku-sheet")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".kazoku-print-root")).toHaveCount(0);
});

test("the sheet speaks Japanese in plain words", async ({ page }) => {
  await open(page, "kind=country&c=JP&lang=ja");
  const sheet = page.locator("#paper-inner .kazoku-sheet");
  await expect(sheet.locator(".kazoku-namelabel").first()).toHaveText("なまえ:");
  await expect(sheet.locator(".kazoku-title").first()).toContainText("わたしの くに");
  await expect(sheet.locator("svg [data-flag-say]").first()).toContainText("はた");
  await expect(page.locator("#print")).toHaveText("いんさつ / PDFで ほぞん");
  await page.locator("#kinds [data-value=globe]").click();
  await expect(sheet.locator(".kazoku-title").first()).toHaveText("アメリカ");
  await expect(sheet.locator('svg [data-place="pacific"]').first()).toContainText("たいへいよう");
});

test("the buttons are a finger wide and the page fits the screen", async ({ page }) => {
  await open(page, "kind=daynight");
  const small = await page.locator(".kids-picks button, .kids-picks select, .kids-picks input").evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).filter((el) => el.getBoundingClientRect().height < 47.5).length);
  expect(small).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const area = await page.locator("#paper").boundingBox();
  const first = await page.locator(".kazoku-page").first().boundingBox();
  expect(first!.width).toBeLessThanOrEqual(area!.width + 1);
});

for (const [paper, wide, tall] of PAPERS) {
  test(`${paper}: every kind of sheet prints to one page of the paper's size`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "page.pdf is Chromium's");
    test.setTimeout(120_000);
    await open(page, `kind=globe&paper=${paper}`);
    const cases = [
      `kind=globe&view=americas&paper=${paper}`,
      `kind=globe&view=asia-oceania&paper=${paper}&lang=ja`,
      `kind=map&paper=${paper}`,
      `kind=map&paper=${paper}&lang=ja&type=normal`,
      `kind=country&c=JP&paper=${paper}`,
      `kind=country&c=RU&paper=${paper}&lang=ja`,
      `kind=daynight&when=2026-12-21T12:00Z&paper=${paper}`,
      `kind=seasons&paper=${paper}`,
      `kind=seasons&paper=${paper}&lang=ja&type=normal`,
    ];
    for (const query of cases) {
      await page.goto(`${PAGE}?${query}`);
      await expect(page.locator("#paper-inner .kazoku-body svg").first()).toBeVisible();
      await page.locator("#print").click();
      await page.emulateMedia({ media: "print", colorScheme: "light" });
      const pdf = readPdf(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
      expect(await page.locator("#paper-inner .kazoku-page").count(), `${query}: pages on the screen`).toBe(1);
      expect(pdf.pages, `${query}: pages`).toBe(1);
      expect(pdf.boxes.every(([w, h]) => near(w, wide * PT) && near(h, tall * PT)), `${query}: the page is ${wide} by ${tall} mm`).toBe(true);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await page.emulateMedia({ media: "screen", colorScheme: "light" });
    }
  });
}

test("every kind of sheet is on the page's buttons and in the address", async ({ page }) => {
  await open(page, "kind=seasons");
  for (const kind of KINDS) {
    await page.locator(`#kinds [data-value=${kind}]`).click();
    await expect(page).toHaveURL(new RegExp(`kind=${kind}`));
    await expect(page.locator("#paper-inner .kazoku-body svg").first()).toBeVisible();
  }
});
