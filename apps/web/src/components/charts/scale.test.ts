import { describe, expect, it } from "vitest";
import { niceStep, xLabelIndexes, yTicks } from "./scale.ts";

describe("escala do gráfico", () => {
  it("passos redondos", () => {
    expect(niceStep(300)).toBe(100);
    expect(niceStep(7)).toBe(2);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(0.9)).toBe(0.25);
  });
  it("marcas do eixo Y cobrem o maior valor", () => {
    expect(yTicks(300)).toEqual([0, 100, 200, 300]);
    expect(yTicks(310)).toEqual([0, 100, 200, 300, 400]);
    expect(yTicks(0)).toEqual([0, 1]);
  });
  it("rótulos do eixo X espaçados, com a primeira e a última", () => {
    expect(xLabelIndexes(3)).toEqual([0, 1, 2]);
    expect(xLabelIndexes(30, 6)).toEqual([0, 6, 12, 17, 23, 29]);
  });
});
