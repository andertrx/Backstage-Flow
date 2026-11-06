import { describe, expect, it } from "vitest";
import { buildHojeItems, type HojeInputs, hojeWatching, saudacao } from "./hojeLogic.ts";

const nada: HojeInputs = {
  enviosPendentes: [], alertasCriticos: 0, alertasAntigosAbertos: 0, tarefasVencidas: 0, reunioesHoje: 0,
  leadsAtrasados: 0, contasSaldoCritico: 0, contasComErroDeSync: 0,
};

describe("Hoje — Precisa de você agora (Etapa 43.2)", () => {
  it("sem nada pendente, a lista fica vazia", () => {
    expect(buildHojeItems(nada)).toEqual([]);
  });
  it("assunto sem acesso (null) não aparece e não conta como visto", () => {
    const so = { ...nada, enviosPendentes: null, alertasCriticos: null, alertasAntigosAbertos: null, contasSaldoCritico: null, contasComErroDeSync: null, leadsAtrasados: null };
    expect(buildHojeItems(so)).toEqual([]);
    expect(hojeWatching(so)).toBe(2);
    expect(hojeWatching(nada)).toBe(8);
  });
  it("ordem de prioridade: envio, saldo, alerta crítico, erro de sync, tarefas, reuniões, leads, alertas novos", () => {
    const items = buildHojeItems({
      enviosPendentes: [{ nome: "ENV-001", horario: "08:00" }], alertasCriticos: 2, alertasAntigosAbertos: 4, tarefasVencidas: 3,
      reunioesHoje: 1, leadsAtrasados: 5, contasSaldoCritico: 1, contasComErroDeSync: 2,
    });
    expect(items.map((x) => x.id)).toEqual(["envio", "saldo", "monitor", "sync", "tarefas", "reunioes", "leads", "alertas"]);
    expect(items[0]).toMatchObject({ tone: "danger", to: "/operacoes/envios", title: "Aprovar o envio de hoje até 08:00", detail: "ENV-001" });
  });
  it("singular e plural", () => {
    const [um] = buildHojeItems({ ...nada, tarefasVencidas: 1 });
    expect(um.title).toBe("1 tarefa sua vencida");
    const [varios] = buildHojeItems({ ...nada, tarefasVencidas: 3 });
    expect(varios.title).toBe("3 tarefas suas vencidas");
    const [envios] = buildHojeItems({ ...nada, enviosPendentes: [{ nome: "A", horario: "08:00" }, { nome: "B", horario: "10:00" }] });
    expect(envios.title).toBe("Aprovar 2 envios de hoje");
    expect(envios.detail).toBe("A (08:00) · B (10:00)");
  });
  it("saudação segue o horário de Brasília", () => {
    expect(saudacao(new Date("2026-11-06T11:00:00Z"))).toBe("Bom dia"); // 8h
    expect(saudacao(new Date("2026-11-06T15:00:00Z"))).toBe("Boa tarde"); // 12h
    expect(saudacao(new Date("2026-11-06T22:00:00Z"))).toBe("Boa noite"); // 19h
  });
});
