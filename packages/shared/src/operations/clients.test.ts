import { describe, expect, it } from "vitest";
import { opsProgress, opsQueueColumnFor } from "./clients.ts";

const cols = [
  { id: "a", sector_id: "s1", status_id: "nao_iniciado", position: 1, active: true },
  { id: "b", sector_id: "s1", status_id: "em_andamento", position: 2, active: true },
  { id: "c", sector_id: "s1", status_id: "em_andamento", position: 3, active: true },
  { id: "d", sector_id: "s1", status_id: "em_revisao", position: 4, active: false },
  { id: "x", sector_id: "s2", status_id: "em_andamento", position: 1, active: true },
];

describe("filas por setor", () => {
  it("usa a coluna escolhida quando o status bate", () => {
    expect(opsQueueColumnFor({ sector_id: "s1", status_id: "em_andamento", queue_column_id: "c" }, cols)).toBe("c");
  });
  it("status mudou por fora: vai para a primeira coluna do novo status", () => {
    expect(opsQueueColumnFor({ sector_id: "s1", status_id: "nao_iniciado", queue_column_id: "c" }, cols)).toBe("a");
    expect(opsQueueColumnFor({ sector_id: "s1", status_id: "em_andamento", queue_column_id: null }, cols)).toBe("b");
  });
  it("coluna desativada ou de outro setor não vale; sem coluna do status: nenhuma", () => {
    expect(opsQueueColumnFor({ sector_id: "s1", status_id: "em_revisao", queue_column_id: "d" }, cols)).toBeNull();
    expect(opsQueueColumnFor({ sector_id: "s1", status_id: "em_andamento", queue_column_id: "x" }, cols)).toBe("b");
  });
  it("progresso só quando há tarefas obrigatórias", () => {
    expect(opsProgress(0, 0)).toBeNull();
    expect(opsProgress(1, 3)).toBe(33);
    expect(opsProgress(5, 3)).toBe(100);
  });
});
