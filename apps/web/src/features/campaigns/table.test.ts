import { describe, expect, it } from "vitest";
import { DEFAULT_TABLE, parseTable, toggleSort, writeTable } from "./table.ts";

describe("estado da tabela de campanhas", () => {
  it("lê o endereço e ignora valores inválidos", () => {
    expect(parseTable(new URLSearchParams())).toEqual(DEFAULT_TABLE);
    expect(parseTable(new URLSearchParams("ordem=drop&situacao=x&pagina=-2"))).toEqual(DEFAULT_TABLE);
    expect(parseTable(new URLSearchParams("busca=marca&situacao=ativa&ordem=cpl&dir=asc&pagina=3")))
      .toEqual({ search: "marca", status: "ativa", sort: "cpl", desc: false, page: 3 });
  });

  it("colunas de texto começam de A a Z", () => {
    expect(parseTable(new URLSearchParams("ordem=name")).desc).toBe(false);
    expect(toggleSort(DEFAULT_TABLE, "name")).toMatchObject({ sort: "name", desc: false });
    expect(toggleSort(DEFAULT_TABLE, "cpl")).toMatchObject({ sort: "cpl", desc: true });
  });

  it("clicar de novo inverte e volta para a página 1", () => {
    expect(toggleSort({ ...DEFAULT_TABLE, page: 4 }, "spend")).toMatchObject({ sort: "spend", desc: false, page: 1 });
  });

  it("grava só o que difere do padrão e preserva outros filtros", () => {
    const base = new URLSearchParams("periodo=last_30_days&cliente=abc");
    expect(writeTable(base, DEFAULT_TABLE).toString()).toBe("periodo=last_30_days&cliente=abc");
    expect(writeTable(base, { search: " marca ", status: "erro", sort: "name", desc: false, page: 2 }).toString())
      .toBe("periodo=last_30_days&cliente=abc&busca=marca&situacao=erro&ordem=name&pagina=2");
    expect(writeTable(base, { ...DEFAULT_TABLE, desc: false }).toString()).toBe("periodo=last_30_days&cliente=abc&dir=asc");
  });
  it("ordem fora da lista da tela volta ao padrão", () => {
    expect(parseTable(new URLSearchParams("ordem=objective"), ["name", "spend"]).sort).toBe("spend");
    expect(parseTable(new URLSearchParams("ordem=name"), ["name", "spend"]).sort).toBe("name");
  });
});
