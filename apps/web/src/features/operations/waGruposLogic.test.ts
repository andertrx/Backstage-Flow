import { describe, expect, it } from "vitest";
import { normalizaNome, sugerirGrupos } from "./waGruposLogic.ts";

const grupos = [
  { id: "1@g.us", name: "Acelera A. – Aurora 🚀" },
  { id: "2@g.us", name: "STG - Brisa (Marketing)" },
  { id: "3@g.us", name: "Brisa Kids" },
  { id: "4@g.us", name: "Grupo da Família" },
];

describe("Grupos do WhatsApp — sugestão por nome (Etapa 44.2)", () => {
  it("ignora maiúsculas, acentos e símbolos", () => {
    expect(normalizaNome("  Acelera A. – ÁURORA 🚀 ")).toBe("acelera a aurora");
  });
  it("sugere o grupo de mesmo nome e o de nome parecido", () => {
    const s = sugerirGrupos([{ cliente_id: "a", nome_grupo: "acelera a. aurora" }, { cliente_id: "b", nome_grupo: "STG – Brisa" }], grupos, new Map());
    expect(s.get("a")).toEqual({ grupoId: "1@g.us", tipo: "igual" });
    expect(s.get("b")).toEqual({ grupoId: "2@g.us", tipo: "parecido" });
  });
  it("com dois candidatos parecidos não chuta", () => {
    const s = sugerirGrupos([{ cliente_id: "c", nome_grupo: "Brisa" }], grupos, new Map());
    expect(s.has("c")).toBe(false);
  });
  it("não sugere grupo já ligado a outro cliente nem para quem já tem grupo", () => {
    const s = sugerirGrupos(
      [{ cliente_id: "a", nome_grupo: "Acelera A. Aurora" }, { cliente_id: "x", nome_grupo: "Acelera A. Aurora" }],
      grupos, new Map([["x", "1@g.us"]]));
    expect(s.has("a")).toBe(false);
    expect(s.has("x")).toBe(false);
  });
  it("cada grupo vai para um cliente só (o de nome igual ganha)", () => {
    const s = sugerirGrupos([{ cliente_id: "p", nome_grupo: "STG Brisa" }, { cliente_id: "q", nome_grupo: "STG - Brisa (Marketing)" }], grupos, new Map());
    expect(s.get("q")).toEqual({ grupoId: "2@g.us", tipo: "igual" });
    expect(s.has("p")).toBe(false);
  });
  it("nome do CRM vazio ou curto demais não gera sugestão parecida", () => {
    const s = sugerirGrupos([{ cliente_id: "z", nome_grupo: "  " }, { cliente_id: "w", nome_grupo: "Gr" }], grupos, new Map());
    expect(s.size).toBe(0);
  });
});
