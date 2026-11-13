// Which GL programs are alive, by what their shaders say: a hash and a length for the vertex and fragment text of each program made and not yet deleted. Two programs with the same text are one program kept twice, for two states of the draw
// (three keys a program by more than its text: the number of lights, for one): the same text twice is the mark of a leak the count of programs alone does not name. Not a test file.
import type { Page } from "@playwright/test";

/** An init script that watches the shader and program calls of every WebGL2 context. */
export const PROGRAMS_SCRIPT = (): void => {
  const proto = WebGL2RenderingContext.prototype;
  const sources = new Map<unknown, string>();
  const attached = new Map<unknown, unknown[]>();
  const live = new Set<unknown>();
  const shaderSource = proto.shaderSource;
  proto.shaderSource = function (this: WebGL2RenderingContext, shader: WebGLShader, text: string) {
    sources.set(shader, text);
    return shaderSource.call(this, shader, text);
  };
  const attachShader = proto.attachShader;
  proto.attachShader = function (this: WebGL2RenderingContext, program: WebGLProgram, shader: WebGLShader) {
    attached.set(program, [...(attached.get(program) ?? []), shader]);
    live.add(program);
    return attachShader.call(this, program, shader);
  };
  const deleteProgram = proto.deleteProgram;
  proto.deleteProgram = function (this: WebGL2RenderingContext, program: WebGLProgram | null) {
    live.delete(program);
    return deleteProgram.call(this, program);
  };
  const hash = (text: string): string => {
    let h = 0;
    for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
    return `${(h >>> 0).toString(16)}:${text.length}`;
  };
  // the lights a program was made for: the sum of the sizes of the light arrays in its fragment text (three writes the number of lights of the draw into the text it hands to the driver)
  const lightsOf = (text: string): number => [...text.matchAll(/(?:directionalLights|pointLights|spotLights|hemisphereLights|rectAreaLights)\[ (\d+) \]/g)].reduce((sum, one) => sum + Number(one[1]), 0);
  Reflect.set(window, "__lightCounts", () => [...live].map((program) => Math.max(0, ...(attached.get(program) ?? []).map((shader) => lightsOf(sources.get(shader) ?? "")))));
  Reflect.set(window, "__programs", () => [...live].map((program) => (attached.get(program) ?? []).map((shader) => hash(sources.get(shader) ?? "")).join("+")).sort());
};

/** The programs alive now, sorted. */
export const listPrograms = (page: Page): Promise<string[]> => page.evaluate(() => (Reflect.get(window, "__programs") as () => string[])());

/** For each program alive now, how many lights it was made for (0 for one that is not lit). A scene with one Sun makes every lit program for one light. */
export const lightCounts = (page: Page): Promise<number[]> => page.evaluate(() => (Reflect.get(window, "__lightCounts") as () => number[])());

/** The programs that are in the list more than once. */
export const duplicates = (list: readonly string[]): string[] => [...new Set(list.filter((one, i) => list.indexOf(one) !== i))];
