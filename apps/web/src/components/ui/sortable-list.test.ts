import { describe, expect, it } from "vitest";
import { moveItem } from "./sortable-list.tsx";

describe("arrastar para ordenar", () => {
  it("move o item para a posição de destino", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "d", "a"]);
  });
  it("posição inválida ou igual não muda nada", () => {
    const list = ["a", "b"];
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, -1, 0)).toBe(list);
    expect(moveItem(list, 0, 5)).toBe(list);
  });
});
