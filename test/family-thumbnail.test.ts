// The family's thumbnails (johnmorrisdotca/.github, family/family-thumbnail.mjs): this package has its card, its dark
// card and its icon at their sizes, its README opens with the card, and its demo carries og:image and publishes the
// three on Pages. The same file in every package that tests with node:test (family-thumbnail.test.js for Vitest).
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  FAMILY_THUMBNAIL_VERSION,
  pngSize,
  thumbnailFaults,
  thumbnailHead,
  thumbnailReadmeBlock,
} from "../scripts/family-thumbnail.mjs";

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
/** The hash of scripts/family-thumbnail.mjs, recorded each time the family changes it. */
const HASH = "b8f703fb7fe0da75cfd6b45e1b152f0ae1ecfa297c06eb2caac023fad1795f47";

/**
 * The addresses of every tag in some HTML that a browser fetches by itself: a link's href (icon, apple-touch-icon,
 * stylesheet, preload, manifest), and the src and srcset of an img, script, source, iframe, video or audio. A meta tag's
 * content is not among them: og:image and twitter:image are read by link previews, never by the browser.
 */
const fetchedAddresses = (html: string): string[] =>
  [...html.matchAll(/<(link|img|script|source|iframe|video|audio)\b[^>]*>/gi)].flatMap(([tag, name]) =>
    [...tag.matchAll(/\s(href|src|srcset)\s*=\s*"([^"]*)"/gi)]
      .filter(([, attribute]) => name.toLowerCase() === "link" || attribute.toLowerCase() !== "href")
      .flatMap(([, attribute, value]) =>
        attribute.toLowerCase() === "srcset" ? value.split(",").map((one) => one.trim().split(/\s+/)[0]) : [value],
      ),
  );
/** An address that leaves the page's own site, or names it from the server's root: a scheme, `//host` or `/path`. */
const offSite = (address: string) => /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(address.trim());

/** The bytes of a PNG header saying a size: enough for pngSize, not a picture. */
const header = (width: number, height: number) => {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};

const SIZES: Record<string, [number, number]> = {
  "thumbnail.png": [1200, 630],
  "thumbnail-dark.png": [1200, 630],
  "icon.png": [512, 512],
};

/** A package folder with what a test names: pictures of given sizes, a README, a site builder. */
const sample = ({
  sizes = SIZES,
  readme,
  site = "thumbnailHead(pkg); publishThumbnails(root, out);",
}: {
  sizes?: Record<string, [number, number]>;
  readme?: string;
  site?: string;
} = {}) => {
  const root = mkdtempSync(join(tmpdir(), "thumbnail-"));
  const pkg = {
    name: "@johnmorrisdotca/sample",
    description: "Samples drawn as SVG.",
    repository: { url: "git+https://github.com/johnmorrisdotca/sample.git" },
  };
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  mkdirSync(join(root, "docs", "images"), { recursive: true });
  for (const [file, [width, height]] of Object.entries(sizes))
    writeFileSync(join(root, "docs", "images", file), header(width, height));
  writeFileSync(join(root, "README.md"), readme ?? `${thumbnailReadmeBlock(pkg)}\n\n# Sample\n`);
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts", "site.mjs"), site);
  return root;
};

describe("this package's thumbnails", () => {
  it("keeps the family's thumbnail file", () => {
    assert.equal(FAMILY_THUMBNAIL_VERSION, "2026-11-03.2");
    assert.equal(sha("scripts/family-thumbnail.mjs"), HASH);
  });

  it("has the card, the dark card and the icon, a README that opens with the card, and a demo that carries and publishes them", () => {
    assert.deepEqual(thumbnailFaults("."), []);
  });
});

describe("the thumbnail checks catch what they are for", () => {
  it("passes a package that keeps the convention", () => {
    assert.deepEqual(thumbnailFaults(sample()), []);
  });

  it("refuses a missing picture and one of the wrong size", () => {
    const faults = thumbnailFaults(sample({ sizes: { "thumbnail.png": [1280, 640], "icon.png": [512, 512] } })).join(
      "\n",
    );
    assert.match(faults, /thumbnail\.png is 1280×640; it is 1200×630/);
    assert.match(faults, /thumbnail-dark\.png does not exist/);
  });

  it("refuses a demo with no og:image and a site build that does not publish the pictures", () => {
    const faults = thumbnailFaults(sample({ site: "// nothing" })).join("\n");
    assert.match(faults, /no og:image/);
    assert.match(faults, /does not publish the thumbnails/);
  });

  it("refuses a README that does not open with the card", () => {
    assert.match(thumbnailFaults(sample({ readme: "# Sample\n" })).join("\n"), /does not open with its thumbnail/);
  });

  it("reads a PNG's size and writes the head's tags at the Pages address", () => {
    assert.deepEqual(pngSize(header(1200, 630)), { width: 1200, height: 630 });
    assert.equal(pngSize(Buffer.from("not a png at all, not at all")), null);
    const head = thumbnailHead({ name: "@johnmorrisdotca/sample", repository: "https://github.com/spxis/sample" });
    assert.ok(head.includes('<meta property="og:image" content="https://spxis.github.io/sample/thumbnail.png" />'));
    assert.ok(head.includes('<meta name="twitter:card" content="summary_large_image" />'));
    assert.ok(head.includes('<meta name="twitter:image" content="https://spxis.github.io/sample/thumbnail.png" />'));
  });

  it("gives no tag a browser fetches an absolute or cross-origin address, so a strict CSP (img-src 'self') allows the head", () => {
    const pkg = { name: "@johnmorrisdotca/sample", repository: "https://github.com/spxis/sample" };
    assert.deepEqual(
      fetchedAddresses(
        '<link rel="icon" href="https://a.test/i.png"><img src="//b.test/x.png" srcset="c.png 1x, /d.png 2x"><script src="e.js"></script>',
      ),
      ["https://a.test/i.png", "//b.test/x.png", "c.png", "/d.png", "e.js"],
    );
    assert.deepEqual(
      ["https://a.test/i.png", "//b.test/x.png", "/d.png", "data:x", "icon.png", "../icon.png"].map(offSite),
      [true, true, true, true, false, false],
    );
    for (const [base, icon] of [
      ["", "icon.png"],
      ["../", "../icon.png"],
      ["../../", "../../icon.png"],
    ]) {
      const head = thumbnailHead(pkg, { base });
      assert.deepEqual(fetchedAddresses(head), [icon]);
      assert.deepEqual(fetchedAddresses(head).filter(offSite), []);
      assert.ok(head.includes('<meta property="og:image" content="https://spxis.github.io/sample/thumbnail.png" />'));
    }
    assert.deepEqual(
      fetchedAddresses(thumbnailHead(JSON.parse(readFileSync("package.json", "utf8")))).filter(offSite),
      [],
    );
    assert.doesNotMatch(thumbnailHead(pkg, { icon: false }), /apple-touch-icon/);
    for (const base of [
      "/",
      "./",
      "docs/",
      "https://spxis.github.io/sample/",
      "//spxis.github.io/sample/",
      "..",
      "../..",
    ])
      assert.throws(() => thumbnailHead(pkg, { base }), /base is the way from the page to the site's root/);
  });
});
