// A page can restyle the flat map's buttons, tip, key and message: `part="button"`, `part="tip"`, `part="key"` and `part="msg"` take the page's `::part()` rules, and the custom properties set the radius, padding, height and border of the buttons
// and the size of the tip and key text. With none of them set the buttons are the pills they always were.
import { expect, test, type Page } from "@playwright/test";

const flat = (page: Page) => page.locator("chikyu-flat");

async function open(page: Page): Promise<void> {
  await page.goto("/chikyu-earth/flat.html?place=tokyo");
  await page.locator("body[data-ready=true]").waitFor({ timeout: 30_000 });
  await flat(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(flat(page).locator(".bar button").first()).toBeVisible();
}

/** The computed style of the first button of the bar, the legend's button and the key's text. */
const styles = (page: Page) =>
  flat(page).evaluate((el) => {
    const root = el.shadowRoot!;
    const button = getComputedStyle(root.querySelector(".bar button")!);
    const key = root.querySelector(".legend") as HTMLElement | null;
    return { radius: button.borderTopLeftRadius, minHeight: button.minHeight, padding: button.paddingTop, border: button.borderTopWidth, keySize: key ? getComputedStyle(key).fontSize : "" };
  });

test("the buttons are the usual pills until the page asks, and a page's ::part(button) and custom properties restyle them", async ({ page }, info) => {
  await open(page);
  const phone = info.project.name.endsWith("phone");
  const before = await styles(page);
  expect(before.radius, "a pill").toBe("999px");
  expect(before.minHeight).toBe(phone ? "44px" : "32px");
  // the parts are named
  expect(await flat(page).evaluate((el) => [...el.shadowRoot!.querySelectorAll("[part]")].map((one) => one.getAttribute("part")!.split(" ")[0]).filter((v, i, all) => all.indexOf(v) === i).sort())).toEqual(expect.arrayContaining(["button", "key", "msg", "tip"]));
  // a page's rule on the part
  await page.addStyleTag({ content: "chikyu-flat::part(button) { border-radius: 3px; min-height: 52px; padding: 9px; border: 3px solid #f0f; } chikyu-flat::part(key) { font-size: 20px; }" });
  const parted = await styles(page);
  expect(parted.radius).toBe("3px");
  expect(parted.minHeight).toBe("52px");
  expect(parted.padding).toBe("9px");
  expect(parted.border).toBe("3px");
  expect(parted.keySize).toBe("20px");
});

test("the custom properties set the buttons and the text of the tip and the key, and a pair of buttons keeps its radius at its two ends", async ({ page }) => {
  await open(page);
  await flat(page).evaluate((el) => {
    el.setAttribute("controls", "centre look key");
    (el as HTMLElement).style.setProperty("--chikyu-flat-button-radius", "7px");
    (el as HTMLElement).style.setProperty("--chikyu-flat-button-min-height", "40px");
    (el as HTMLElement).style.setProperty("--chikyu-flat-button-padding", "2px 20px");
    (el as HTMLElement).style.setProperty("--chikyu-flat-button-border", "2px dashed #0f0");
    (el as HTMLElement).style.setProperty("--chikyu-flat-key-font-size", "18px");
    (el as HTMLElement).style.setProperty("--chikyu-flat-tip-font-size", "21px");
  });
  const got = await flat(page).evaluate((el) => {
    const root = el.shadowRoot!;
    const first = getComputedStyle(root.querySelector('.pair button[data-act="look-map"]')!);
    const last = getComputedStyle(root.querySelector('.pair button[data-act="look-photo"]')!);
    const green = getComputedStyle(root.querySelector('[data-act="greenwich"]')!);
    const tip = root.querySelector(".tip") as HTMLElement;
    const key = root.querySelector(".legend") as HTMLElement;
    return { firstLeft: first.borderTopLeftRadius, firstRight: first.borderTopRightRadius, lastRight: last.borderTopRightRadius, lastLeft: last.borderTopLeftRadius, minHeight: green.minHeight, padding: green.paddingLeft, borderStyle: green.borderTopStyle, borderWidth: green.borderTopWidth, tip: getComputedStyle(tip).fontSize, key: getComputedStyle(key).fontSize };
  });
  expect(got.firstLeft).toBe("7px");
  expect(got.firstRight).toBe("0px");
  expect(got.lastRight).toBe("7px");
  expect(got.lastLeft).toBe("0px");
  expect(got.minHeight).toBe("40px");
  expect(got.padding).toBe("20px");
  expect(got.borderStyle).toBe("dashed");
  expect(got.borderWidth).toBe("2px");
  expect(got.tip).toBe("21px");
  expect(got.key).toBe("18px");
});
