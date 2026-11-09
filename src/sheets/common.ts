// What every printable sheet shares: the type sizes (the same numbers as kazoku-ui's print part, so a test holds them together), text measuring and wrapping, and the small helpers that write SVG.
// Pure: strings in, strings out. Nothing here touches the DOM, and kazoku-ui is not imported (this package has no runtime dependency).

const PT = 25.4 / 72;

/** The type of a printed sheet, in millimetres: `kid` is large and round for children, `normal` for everyone else. */
export interface SheetType {
  titleMm: number;
  nameMm: number;
  bodyMm: number;
  smallMm: number;
  /** The thickness of a sheet's own lines. */
  lineMm: number;
}

/** The two type presets: the same sizes as kazoku-ui's `TYPE_PRESETS` (title, name, body and small in points, and the line in millimetres), checked against it by a test. */
export const TYPES: Readonly<Record<"kid" | "normal", SheetType>> = {
  kid: { titleMm: 40 * PT, nameMm: 28 * PT, bodyMm: 18 * PT, smallMm: 10 * PT, lineMm: 3 },
  normal: { titleMm: 24 * PT, nameMm: 14 * PT, bodyMm: 11 * PT, smallMm: 8 * PT, lineMm: 0.4 },
};

export type Lang = "en" | "ja";

export const n = (v: number): string => (Math.round(v * 100) / 100).toString();
export const esc = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The width of a text in millimetres, estimated on the wide side so a fallback font still fits: a full-width character is as wide as the type is tall, a Latin capital or a digit 0.82 of it, a small letter 0.7 (DejaVu Sans Bold, the usual fallback on a server, is that wide), a percent sign or a wide capital (M, W) 1.0, a space or a stop 0.38. */
export function textWidth(text: string, sizeMm: number): number {
  let total = 0;
  for (const ch of text) total += /[\u3000-ヿ一-鿿＀-￯]/.test(ch) ? sizeMm : /[ .,:;!'|]/.test(ch) ? 0.38 * sizeMm : /[%@#&MW]/.test(ch) ? 1.0 * sizeMm : /[A-Z0-9]/.test(ch) ? 0.82 * sizeMm : 0.7 * sizeMm;
  return total;
}

function cut(line: string, maxMm: number, sizeMm: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (current !== "" && textWidth(current + ch, sizeMm) > maxMm && !/[。、！？」）]/.test(ch)) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  return current === "" ? out : [...out, current];
}

/** Break a sentence into lines no wider than `maxMm`: at spaces for English; for Japanese after a space or a comma or a full stop (the words are written with spaces between), and anywhere only for a word wider than the line. */
export function wrap(text: string, maxMm: number, sizeMm: number): string[] {
  const japanese = /[぀-ヿ一-鿿]/.test(text);
  const pieces = japanese ? (text.match(/[^ 、。！]+[ 、。！]?/g) ?? [text]) : text.split(" ");
  const joiner = japanese ? "" : " ";
  const lines: string[] = [];
  let line = "";
  for (const piece of pieces) {
    const next = line === "" ? piece : line + joiner + piece;
    if (line !== "" && textWidth(next, sizeMm) > maxMm) {
      lines.push(line);
      line = piece;
    } else line = next;
  }
  if (line !== "") lines.push(line);
  return japanese ? lines.flatMap((one) => cut(one.trimEnd(), maxMm, sizeMm)) : lines;
}

export const text = (x: number, y: number, size: number, body: string, extra = ""): string => `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-weight="700" fill="#000"${extra}>${esc(body)}</text>`;

/** Lines of words one under the other, left aligned at `x`, the first baseline at `y`; the height they take is `lines * 1.3 * size`. */
export function paragraph(words: string, x: number, y: number, widthMm: number, sizeMm: number, extra = ""): { markup: string; height: number } {
  const lines = wrap(words, widthMm, sizeMm);
  return { markup: lines.map((line, i) => text(x, y + sizeMm * 1.3 * i, sizeMm, line, extra)).join(""), height: lines.length * sizeMm * 1.3 };
}

export const svgOpen = (width: number, height: number, label: string, id: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(label)}" data-chikyu-sheet="${esc(id)}" font-family="inherit"><title>${esc(label)}</title>`;

/** Lines of words at the foot of a page: the last baseline sits `0.55` of a line above the edge, so the letters that hang below it still fit the room in a font taller than the sheet's own. */
export function footer(words: string, widthMm: number, heightMm: number, sizeMm: number, extra = ""): { markup: string; height: number } {
  const lines = wrap(words, widthMm - 2.4, sizeMm);
  const last = heightMm - 0.55 * sizeMm;
  return { markup: lines.map((line, i) => text(1.2, last - (lines.length - 1 - i) * sizeMm * 1.3, sizeMm, line, extra)).join(""), height: lines.length * sizeMm * 1.3 + 0.25 * sizeMm };
}

export type TypeName = "kid" | "normal";

/** The thickness of a sheet's outline in millimetres, and of the lines inside it (2.5 mm when the outline is 3). */
export const outlineMm = (type: TypeName): number => TYPES[type].lineMm;
export const innerMm = (type: TypeName): number => Math.max(TYPES[type].lineMm * (2.5 / 3), 0.3);

/** The size of the names written on a picture: 24 pt for a child (never less), else the normal name size. */
export const labelMm = (type: TypeName): number => (type === "kid" ? 24 * PT : TYPES.normal.nameMm);

/** Text with a white edge so it reads over a line: the edge is painted first. */
export const haloText = (x: number, y: number, size: number, body: string, extra = "", anchor: "start" | "middle" | "end" = "middle"): string =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-weight="700" fill="#000" stroke="#fff" stroke-width="${n(size * 0.28)}" stroke-linejoin="round" paint-order="stroke" text-anchor="${anchor}"${extra}>${esc(body)}</text>`;

/** A name of one or more lines, centred on `x` with the middle of the block at `y`. */
export function nameBlock(lines: readonly string[], x: number, y: number, size: number, extra = ""): { markup: string; width: number; height: number } {
  const pitch = size * 1.12;
  const top = y - ((lines.length - 1) * pitch) / 2 + size * 0.34;
  return { markup: lines.map((line, i) => haloText(x, top + i * pitch, size, line, extra)).join(""), width: Math.max(...lines.map((line) => textWidth(line, size))), height: lines.length * pitch };
}

export interface Block {
  markup: string;
  height: number;
}

/** The facts as numbered dots and lines of words, one under the other, `width` wide, the first at `y`. */
export function factsBlock(list: readonly string[], width: number, y: number, type: TypeName = "kid"): Block {
  const bodyMm = TYPES[type].bodyMm;
  const dot = type === "kid" ? 4.6 : 2.6;
  const left = 2 * dot + 4;
  const lineHeight = bodyMm * 1.3;
  const out: string[] = [];
  let at = y;
  list.forEach((fact, i) => {
    const lines = wrap(fact, width - left, bodyMm);
    const rowHeight = Math.max(2 * dot, lines.length * lineHeight);
    const mid = at + rowHeight / 2;
    out.push(`<circle cx="${n(dot)}" cy="${n(mid)}" r="${dot}" fill="#000"/>`, `<text x="${n(dot)}" y="${n(mid + bodyMm * 0.36)}" font-size="${n(bodyMm)}" font-weight="700" fill="#fff" text-anchor="middle">${i + 1}</text>`);
    lines.forEach((line, k) => out.push(text(left, mid - (lines.length * lineHeight) / 2 + lineHeight * (k + 0.72), bodyMm, line, ' data-fact=""')));
    at += rowHeight + 3.5;
  });
  return { markup: `<g data-facts="">${out.join("")}</g>`, height: at - y - 3.5 };
}
