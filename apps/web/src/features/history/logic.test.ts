import { describe, expect, it } from "vitest";
import {
  answerSentence,
  checkCoverage,
  type CoverageRow,
  coverageText,
  importProgress,
  monthOptions,
  monthRange,
  previousRange,
  whenText,
} from "./logic.ts";

const cov = (p: Partial<CoverageRow>): CoverageRow => ({
  ad_account_id: "a1", name: "Conta A", client_id: "c1", client_name: "Excalibur", platform_id: "meta", currency: "BRL",
  history_from: "2026-08-26", history_to: "2026-09-25", target: "2025-09-01", importing: false, backfill_error: null, ...p,
});
const plain = (s: string) => s.replace(/\u00a0/g, " ");
const totals = { spend_micros: 1_234_560_000, impressions: 1000, clicks: 50, leads: 120, messages: null, conversions: 3, conversion_value_micros: null };

describe("histórico: meses", () => {
  it("mês fechado vai do dia 1 ao último dia; o mês atual, até hoje", () => {
    expect(monthRange("2026-02", "2026-09-25")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2026-09", "2026-09-25")).toEqual({ from: "2026-09-01", to: "2026-09-25" });
  });

  it("lista do mês atual até o mês da meta (13 meses)", () => {
    const list = monthOptions("2025-09-01", "2026-09-25");
    expect(list).toHaveLength(13);
    expect(list[0]).toMatchObject({ value: "2026-09", label: "setembro de 2026" });
    expect(list[1].label).toBe("agosto de 2026");
    expect(list.at(-1)?.value).toBe("2025-09");
  });

  it("compara com o mês anterior inteiro (janeiro → dezembro do ano anterior)", () => {
    expect(previousRange({ from: "2026-01-01", to: "2026-01-31" }, "2026-01")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(previousRange({ from: "2026-08-10", to: "2026-08-19" }, null)).toEqual({ from: "2026-07-31", to: "2026-08-09" });
  });

  it("texto de quando", () => {
    expect(whenText({ from: "2026-08-01", to: "2026-08-31" }, "2026-08")).toBe("Em agosto de 2026");
    expect(whenText({ from: "2026-08-01", to: "2026-08-15" }, null)).toBe("De 01/08/2026 a 15/08/2026");
  });
});

describe("histórico: cobertura", () => {
  it("completo quando todas as contas têm o período inteiro", () => {
    const c = checkCoverage({ from: "2026-09-01", to: "2026-09-20" }, [cov({}), cov({ ad_account_id: "a2", name: "B" })]);
    expect(c.state).toBe("completo");
  });

  it("agosto inteiro com histórico só desde 26/08 = parcial, dizendo qual conta", () => {
    const c = checkCoverage({ from: "2026-08-01", to: "2026-08-31" }, [cov({})]);
    expect(c.state).toBe("parcial");
    expect(c.missing).toEqual([{ name: "Conta A", client_name: "Excalibur", from: "2026-08-26", importing: false }]);
  });

  it("julho sem nada importado ainda = sem histórico (nada de mostrar zero)", () => {
    expect(checkCoverage({ from: "2026-07-01", to: "2026-07-31" }, [cov({})]).state).toBe("sem_historico");
    expect(checkCoverage({ from: "2026-07-01", to: "2026-07-31" }, [cov({ history_from: null, history_to: null })]).state).toBe("sem_historico");
  });

  it("período antes da meta de 13 meses é avisado", () => {
    expect(checkCoverage({ from: "2025-01-01", to: "2025-01-31" }, [cov({})]).beforeTarget).toBe(true);
  });

  it("texto por conta e progresso da importação", () => {
    expect(coverageText(cov({}))).toBe("Histórico de 26/08/2026 até 25/09/2026. Importando o passado até 01/09/2025…");
    expect(coverageText(cov({ history_from: "2025-09-01" }))).toBe("Histórico de 01/09/2025 até 25/09/2026 (completo).");
    expect(coverageText(cov({ backfill_error: "O Meta pediu uma pausa." }))).toContain("pausada: O Meta pediu uma pausa.");
    expect(coverageText(cov({ history_from: null }))).toBe("Ainda não sincronizada.");
    expect(importProgress([cov({ history_from: "2025-09-01" })], "2026-09-25")).toBe(100);
    expect(importProgress([cov({})], "2026-09-25")).toBe(8);
    expect(importProgress([], "2026-09-25")).toBeNull();
  });
});

describe("histórico: resposta em frase", () => {
  it("investimento, leads e CPL", () => {
    expect(plain(answerSentence("Em agosto de 2026", "Excalibur", totals, "BRL")))
      .toBe("Em agosto de 2026, Excalibur investiu R$ 1.234,56, teve 120 leads e CPL de R$ 10,29.");
  });

  it("sem leads informados (Google): não inventa lead nem CPL", () => {
    expect(plain(answerSentence("Em julho de 2026", "a conta X", { ...totals, leads: null }, "BRL"))).toBe("Em julho de 2026, a conta X investiu R$ 1.234,56.");
  });
});
