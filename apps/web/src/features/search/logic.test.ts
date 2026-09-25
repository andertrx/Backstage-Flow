import { describe, expect, it } from "vitest";
import { clientShortcuts, groupResults, resultDetail, resultHref, resultStatus, type SearchRow } from "./logic.ts";

const row = (p: Partial<SearchRow>): SearchRow => ({
  kind: "campanha", id: "x1", name: "Nome", external_id: "123", platform_id: "meta", client_id: "c1",
  client_name: "Excalibur", parent_name: "CA - Excalibur", status: "ativa", ...p,
});

describe("busca global", () => {
  it("cada tipo leva à página certa", () => {
    expect(resultHref(row({ kind: "cliente", id: "c1" }))).toBe("/clientes/c1");
    expect(resultHref(row({ kind: "conta", id: "a1", platform_id: "google" }))).toBe("/google-ads?cliente=c1&conta=a1");
    expect(resultHref(row({ kind: "conta", id: "a1", platform_id: "meta" }))).toBe("/meta-ads?cliente=c1&conta=a1");
    expect(resultHref(row({ kind: "campanha" }))).toBe("/campanhas/x1");
    expect(resultHref(row({ kind: "conjunto" }))).toBe("/conjuntos/x1");
    expect(resultHref(row({ kind: "anuncio" }))).toBe("/anuncios/x1");
  });

  it("detalhe mostra plataforma, cliente e onde fica", () => {
    expect(resultDetail(row({}))).toBe("Meta Ads · Excalibur · CA - Excalibur");
    expect(resultDetail(row({ kind: "conta", parent_name: null }))).toBe("Meta Ads · Excalibur · ID 123");
    expect(resultDetail(row({ kind: "cliente", parent_name: null, platform_id: null }))).toBe("");
  });

  it("status só aparece quando não está ativo", () => {
    expect(resultStatus(row({}))).toBeNull();
    expect(resultStatus(row({ status: "pausada" }))).toBe("Pausada");
    expect(resultStatus(row({ kind: "cliente", status: "encerrado" }))).toBe("Encerrado");
  });

  it("atalhos do cliente; relatórios só para quem pode gerar", () => {
    expect(clientShortcuts("c1", "gestor").map((l) => l.label)).toEqual(["Dashboard", "Meta Ads", "Google Ads", "Campanhas", "Relatórios"]);
    expect(clientShortcuts("c1", "visualizador").map((l) => l.label)).not.toContain("Relatórios");
    expect(clientShortcuts("c1", "gestor")[4].href).toBe("/relatorios?cliente=c1");
  });

  it("agrupa na ordem fixa e some com grupos vazios", () => {
    const groups = groupResults([row({ kind: "anuncio" }), row({ kind: "cliente" }), row({ kind: "campanha" })]);
    expect(groups.map((g) => g.kind)).toEqual(["cliente", "campanha", "anuncio"]);
  });
});
