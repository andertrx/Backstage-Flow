import { describe, expect, it } from "vitest";
import { missingReason, NOT_AVAILABLE, pickCurrency } from "./summary.ts";
import { mergeFilterParams, parseFilters, resolveFilterPeriod, serializeFilters, updateFilters } from "./filters.ts";

const totals = { spend_micros: 100, impressions: 0, clicks: 0, leads: null, messages: null, conversions: 0, conversion_value_micros: 0 };
const ID = "0f8e7d6c-1111-4222-8333-444455556666";

describe("motivo de card sem valor", () => {
  it("diferencia 'não disponível' de 'zero'", () => {
    expect(missingReason("cpl", totals)).toBe(NOT_AVAILABLE);
    expect(missingReason("messages", totals)).toBe(NOT_AVAILABLE);
    expect(missingReason("cpc", totals)).toBe("Sem cliques no período.");
    expect(missingReason("ctr", totals)).toBe("Sem impressões no período.");
    expect(missingReason("roas", totals)).toBe("Sem valor de conversão informado no período.");
  });
  it("escolhe a moeda", () => {
    expect(pickCurrency(["BRL", "USD"], "USD")).toBe("USD");
    expect(pickCurrency(["BRL", "USD"], "EUR")).toBe("BRL");
    expect(pickCurrency([], null)).toBeNull();
  });
});

describe("filtros no endereço", () => {
  it("lê e escreve, ignorando lixo", () => {
    const f = parseFilters(new URLSearchParams(`periodo=last_30_days&cliente=${ID}&plataforma=tiktok&status=ativa&conta=abc&moeda=usd`));
    expect(f).toMatchObject({ period: "last_30_days", clientId: ID, platform: null, status: "ativa", accountId: null, currency: "USD" });
    expect(serializeFilters(f).toString()).toBe(`periodo=last_30_days&cliente=${ID}&status=ativa&moeda=USD`);
  });
  it("personalizado precisa de datas válidas", () => {
    expect(parseFilters(new URLSearchParams("periodo=custom&de=2026-09-10&ate=2026-09-01")).period).toBe("last_7_days");
    const ok = parseFilters(new URLSearchParams("periodo=custom&de=2026-09-01&ate=2026-09-10"));
    expect(resolveFilterPeriod(ok)).toEqual({ current: { from: "2026-09-01", to: "2026-09-10" }, previous: { from: "2026-08-22", to: "2026-08-31" } });
  });
  it("período padrão = últimos 7 dias, no fuso de Brasília", () => {
    const f = parseFilters(new URLSearchParams());
    const r = resolveFilterPeriod(f, "America/Sao_Paulo", new Date("2026-09-24T01:30:00Z"));
    expect(r.current).toEqual({ from: "2026-09-16", to: "2026-09-22" });
    expect(r.previous).toEqual({ from: "2026-09-09", to: "2026-09-15" });
    expect(serializeFilters(f).toString()).toBe("");
  });
  it("trocar o cliente limpa conta e campanha", () => {
    const f = { ...parseFilters(new URLSearchParams()), clientId: ID, accountId: ID, campaignId: ID };
    expect(updateFilters(f, { clientId: null })).toMatchObject({ clientId: null, accountId: null, campaignId: null });
    expect(updateFilters(f, { accountId: null })).toMatchObject({ clientId: ID, campaignId: null });
    expect(updateFilters(f, { status: "pausada" })).toMatchObject({ campaignId: ID, status: "pausada" });
  });
  it("mudar filtros preserva a busca da tabela e volta para a página 1", () => {
    const current = new URLSearchParams("busca=marca&situacao=ativa&pagina=3&periodo=today");
    const next = mergeFilterParams(current, { ...parseFilters(current), clientId: ID });
    expect(next.get("busca")).toBe("marca");
    expect(next.get("situacao")).toBe("ativa");
    expect(next.get("pagina")).toBeNull();
    expect(next.get("cliente")).toBe(ID);
    expect(next.get("periodo")).toBe("today");
  });
});
