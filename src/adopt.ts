// Puts an element's styles into its shadow root so a strict Content-Security-Policy (`style-src 'self'`) allows them: a constructable stylesheet is not inline
// markup. A browser without that gets a <style> carrying the element's `nonce` attribute, which a page can allow by nonce.
const sheets = new Map<string, CSSStyleSheet>();

export function adoptStyles(root: ShadowRoot, css: string, nonce = ""): void {
  if (typeof CSSStyleSheet === "function" && "replaceSync" in CSSStyleSheet.prototype && "adoptedStyleSheets" in root) {
    try {
      let sheet = sheets.get(css);
      if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        sheets.set(css, sheet);
      }
      if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    } catch {
      // a browser that has the API and refuses it: the <style> below
    }
  }
  const style = root.ownerDocument.createElement("style");
  if (nonce) style.setAttribute("nonce", nonce);
  style.textContent = css;
  root.prepend(style);
}
