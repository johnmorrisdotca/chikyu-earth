// A diagnostic, not a test: what language the star names are laid out in, over eight seconds of a page opened with ?lang=ja, and whether the element changes under it.
import { test, type Page } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

test("timeline of the star names on a Japanese page", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(`console.${message.type()} ${message.text()}`);
  });
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40&lang=ja&star-names=12");
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  await page.locator("chikyu-space").evaluate((el) => Reflect.set(el, "__mark", "first"));
  const rows: string[] = [];
  for (let i = 0; i < 32; i += 1) {
    rows.push(
      JSON.stringify(
        await page.evaluate(() => {
          const els = [...document.querySelectorAll("chikyu-space")];
          const el = els[0] as HTMLElement | undefined;
          const names = el ? [...el.shadowRoot!.querySelectorAll<HTMLElement>("#sk-names .sk-name")].filter((b) => !b.hidden).map((b) => b.textContent) : [];
          const stats = el ? (Reflect.get(el, "stats") as { sky: unknown }).sky : null;
          return { elements: els.length, mark: el ? Reflect.get(el, "__mark") ?? null : null, htmlLang: document.documentElement.lang, nearest: el?.closest("[lang]")?.tagName ?? null, nearestLang: el?.closest("[lang]")?.getAttribute("lang") ?? null, sky: stats, first: names.slice(0, 4) };
        }),
      ),
    );
    await page.waitForTimeout(250);
  }
  console.log(rows.join("\n"));
  console.log(`errors: ${JSON.stringify(errors)}`);
});
