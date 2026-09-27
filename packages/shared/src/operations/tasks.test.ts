import { describe, expect, it } from "vitest";
import { opsAddDays, opsMySection, opsToday, type OpsMyTaskInput } from "./tasks.ts";

const me = "u1";
const base: OpsMyTaskInput = { category: "aberto", due_date: null, completed_at: null, blockers: 0, people: [{ user_id: me, role: "principal" }] };

describe("tarefas da Central", () => {
  it("hoje no fuso de São Paulo (vira o dia às 03:00 UTC)", () => {
    expect(opsToday(new Date("2026-09-28T02:30:00Z"))).toBe("2026-09-27");
    expect(opsToday(new Date("2026-09-28T03:30:00Z"))).toBe("2026-09-28");
    expect(opsAddDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("cada tarefa cai em uma seção de Minhas tarefas", () => {
    const today = "2026-09-27";
    expect(opsMySection({ ...base, due_date: "2026-09-26" }, me, today)).toBe("atrasadas");
    expect(opsMySection({ ...base, due_date: today }, me, today)).toBe("hoje");
    expect(opsMySection(base, me, today)).toBe("minha_acao");
    expect(opsMySection({ ...base, blockers: 1 }, me, today)).toBe("terceiros");
    expect(opsMySection({ ...base, category: "revisao", people: [{ user_id: me, role: "aprovador" }] }, me, today)).toBe("minha_acao");
    expect(opsMySection({ ...base, category: "revisao" }, me, today)).toBe("outras");
    expect(opsMySection({ ...base, category: "aguardando_cliente" }, me, today)).toBe("terceiros");
    expect(opsMySection({ ...base, category: "andamento", due_date: "2026-10-01" }, me, today)).toBe("andamento");
    expect(opsMySection({ ...base, category: "revisao", due_date: "2026-10-01" }, me, today)).toBe("proximos");
    expect(opsMySection({ ...base, category: "concluido", completed_at: "2026-09-25T10:00:00Z", due_date: "2026-09-01" }, me, today)).toBe("concluidas");
    expect(opsMySection({ ...base, category: "concluido", completed_at: "2026-09-01T10:00:00Z" }, me, today)).toBeNull();
    expect(opsMySection({ ...base, category: "cancelado" }, me, today)).toBeNull();
  });
});
