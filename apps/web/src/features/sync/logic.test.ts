import { describe, expect, it } from "vitest";
import type { SyncOverviewRow } from "./api.ts";
import { accountState, describeRun, formatDuration, formatNext, summarize } from "./logic.ts";

const row = (over: Partial<SyncOverviewRow> = {}): SyncOverviewRow => ({
  ad_account_id: "a", client_id: "c", client_name: "Cliente", platform_id: "meta", external_id: "1", name: "Conta",
  is_test_account: false, has_connection: true, status: "pendente", last_attempt_at: null, last_success_at: null,
  next_run_at: null, last_error_message: null, running: false, run_status: null, run_started_at: null,
  run_finished_at: null, run_duration_ms: null, run_records: null, run_trigger: null, run_error: null, ...over,
});

describe("sincronização", () => {
  it("situação da conta", () => {
    expect(accountState(row())).toBe("pendente");
    expect(accountState(row({ running: true, status: "erro" }))).toBe("executando");
    expect(accountState(row({ status: "erro" }))).toBe("erro");
    expect(accountState(row({ has_connection: false, status: "sucesso" }))).toBe("sem_conexao");
    expect(accountState(row({ is_test_account: true }))).toBe("teste");
  });

  it("duração em texto simples", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(850)).toBe("menos de 1 s");
    expect(formatDuration(12_400)).toBe("12 s");
    expect(formatDuration(65_000)).toBe("1 min 5 s");
    expect(formatDuration(120_000)).toBe("2 min");
  });

  it("próxima sincronização", () => {
    const now = new Date("2026-09-24T15:00:00Z");
    expect(formatNext("2026-09-24T15:35:00Z", now)).toBe("em 35 minutos");
    expect(formatNext("2026-09-24T16:00:00Z", now)).toBe("em 1 hora");
    expect(formatNext("2026-09-24T16:10:00Z", now)).toBe("em 1 hora e 10 min");
    expect(formatNext("2026-09-24T14:59:00Z", now)).toMatch(/Na fila/);
    expect(formatNext(null, now)).toMatch(/Na fila/);
  });

  it("resumo: última terminada, próxima prevista (ignora contas de teste e sem conexão)", () => {
    const s = summarize([
      row({ status: "sucesso", run_status: "sucesso", run_finished_at: "2026-09-24T14:00:00Z", last_success_at: "2026-09-24T14:00:00Z", next_run_at: "2026-09-24T15:00:00Z" }),
      row({ status: "erro", run_status: "erro", run_finished_at: "2026-09-24T14:30:00Z", next_run_at: "2026-09-24T15:00:00Z" }),
      row({ is_test_account: true, next_run_at: "2026-09-24T14:40:00Z" }),
      row({ has_connection: false }),
    ]);
    expect(s.lastFinishedAt).toBe("2026-09-24T14:30:00Z");
    expect(s.lastStatus).toBe("erro");
    expect(s.lastSuccessAt).toBe("2026-09-24T14:00:00Z");
    expect(s.nextRunAt).toBe("2026-09-24T15:00:00Z");
    expect([s.success, s.errors, s.scheduled, s.total]).toEqual([1, 1, 2, 4]);
    expect(summarize([row({ has_connection: false })]).nextRunAt).toBeUndefined();
    expect(summarize([row()]).nextRunAt).toBeNull();
  });

  it("mensagem depois de sincronizar", () => {
    expect(describeRun({
      results: [
        { adAccountId: "a", status: "sucesso", records: 1200, durationMs: 1, error: null },
        { adAccountId: "b", status: "erro", records: 3, durationMs: 1, error: "x" },
      ],
      queued: 1,
      alreadyRunning: 1,
    })).toBe("2 contas sincronizadas · 1 com sucesso · 1 com erro · 1.203 registros atualizados. 1 já estava sincronizando. 1 ficou na fila e será sincronizada em poucos minutos.");
  });
});
