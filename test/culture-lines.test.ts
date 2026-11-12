// The lines of a sky culture's figures, laid out as hoshi-stars lays out the IAU's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCultureLines } from "../src/sky/culture-lines.ts";

const star = (rightAscension: number, declination: number): { rightAscension: number; declination: number } => ({ rightAscension, declination });
const figures = [
  { id: "a", segments: [[star(10, 0), star(20, 0)], [star(20, 0), star(20, 10)]] as const },
  { id: "b", segments: [[star(100, 0), star(110, 0)]] as const },
  { id: "dot", segments: [] },
];
// the sky as a flat picture: right ascension is x, declination is y; a star above 90 degrees of right ascension is behind the viewer
const project = (ra: number, dec: number, out: { x: number; y: number }): boolean => {
  out.x = ra * 4;
  out.y = 100 - dec * 4;
  return ra < 90;
};
const style = (): never => ({}) as never;

test("the segments of the figures in view are laid out, each figure with its run and its box, and one behind the viewer is left out", () => {
  const lines = createCultureLines(figures, 0.2, style);
  assert.equal(lines.update(project, { width: 400, height: 200 }), 2);
  const [a, b, dot] = lines.figures;
  assert.equal(a!.abbreviation, "a");
  assert.deepEqual([a!.start, a!.end], [0, 2]);
  assert.deepEqual([a!.left, a!.right, a!.top, a!.bottom], [40, 80, 60, 100]);
  assert.equal(a!.x, 60);
  assert.equal(b!.end, b!.start, "behind the viewer");
  assert.equal(dot!.end, dot!.start, "a figure of one star has no lines");
  assert.deepEqual(Array.from(lines.segments).slice(0, 4), [40, 100, 80, 100]);
});

test("a segment wholly off the picture is left out, and strength 0 lays out nothing", () => {
  const lines = createCultureLines(figures, 0.2, style);
  assert.equal(lines.update(project, { width: 30, height: 200 }), 0, "everything is to the right of a picture 30 wide");
  lines.set({ strength: 0 });
  assert.equal(lines.update(project, { width: 400, height: 200 }), 0, "strength 0 draws nothing");
  lines.set({ strength: 7 });
  assert.equal(lines.settings.strength, 1, "a strength is held to 1");
  assert.equal(lines.opacityOf(lines.figures[0]!), 1);
});
