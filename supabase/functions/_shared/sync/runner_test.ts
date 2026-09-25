import { assert, assertEquals } from "jsr:@std/assert@1";
import { AppError } from "../http.ts";
import type { PlatformAdapter } from "../platforms/adapter.ts";
import type { AccountFunding, PlatformAccount } from "../platforms/types.ts";
import {
  backfillAccount,
  backfillRange,
  reachRanges,
  type RunResult,
  type SyncAccount,
  syncAccount,
  syncRange,
  type SyncStore,
} from "./runner.ts";

const account: SyncAccount = {
  id: "acc-1", client_id: "cli-1", platform_id: "meta", external_id: "111", currency: "BRL", timezone: "America/Sao_Paulo",
  manager_customer_id: null, connection_id: "con-1", last_success_at: null,
};
const fresh: PlatformAccount = {
  externalId: "111", name: "Conta", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", rawStatus: "account_status=1",
  statusReason: null, businessId: null, businessName: null, isPrepay: false,
};
const funding: AccountFunding = {
  currency: "BRL", amountSpentMicros: null, amountDueMicros: null, spendCapMicros: null, budgetMicros: null, availableMicros: null,
  availableBasis: null, budgetEndAt: null, fundingDescription: null, issues: [], raw: {},
};

function fakeStore() {
  const log: string[] = [];
  const finished: { result: RunResult; next: Date }[] = [];
  const coverage: { from: string; to: string }[] = [];
  const backfills: { result: RunResult; retryAt: Date | null }[] = [];
  const triggers: string[] = [];
  const store: SyncStore = {
    loadToken: () => (log.push("token"), Promise.resolve("tok")),
    startRun: (_a, trigger) => (log.push("start"), triggers.push(trigger), Promise.resolve(42)),
    saveFunding: () => (log.push("saldo"), Promise.resolve(1)),
    upsertStructure: (_a, s) => (log.push("estrutura"), Promise.resolve({ count: s.campaigns.length, ids: { campaigns: new Map(), adGroups: new Map(), ads: new Map() } })),
    ingestMetrics: (_a, rows) => (log.push("metricas"), Promise.resolve(rows.length)),
    upsertReach: (_a, rows) => (log.push("alcance"), Promise.resolve(rows.length)),
    finishRun: (_id, _a, result, _d, next) => (log.push("fim"), finished.push({ result, next }), Promise.resolve()),
    markConnectionError: () => (log.push("conexao-erro"), Promise.resolve()),
    markCoverage: (_a, range) => (log.push("cobertura"), coverage.push(range), Promise.resolve()),
    loadIdMaps: () => (log.push("ids"), Promise.resolve({ campaigns: new Map(), adGroups: new Map(), ads: new Map() })),
    finishBackfill: (_id, _a, result, _d, retryAt) => (log.push("fim-importacao"), backfills.push({ result, retryAt }), Promise.resolve()),
  };
  return { store, log, finished, coverage, backfills, triggers };
}

function fakeAdapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter & { ranges: unknown[] } {
  const ranges: unknown[] = [];
  return {
    platform: "meta",
    ranges,
    validateCredentials: () => Promise.reject(new Error("não usado")),
    listAccounts: () => Promise.resolve([]),
    getAccount: () => Promise.resolve(fresh),
    listAssets: () => Promise.resolve([]),
    getFunding: () => Promise.resolve({ account: fresh, funding }),
    fetchStructure: () => Promise.resolve({ campaigns: [{ externalId: "c1" } as never, { externalId: "c2" } as never], adGroups: [], ads: [] }),
    fetchDailyMetrics: (_t, _e, _a, range) => (ranges.push(range), Promise.resolve([{} as never, {} as never, {} as never])),
    fetchPeriodReach: (_t, _e, _a, list) => Promise.resolve(list.map(() => ({}) as never)),
    ...overrides,
  };
}

Deno.test("sincroniza na ordem: saldo → estrutura → métricas → alcance, e registra o log", async () => {
  const { store, log, finished } = fakeStore();
  const r = await syncAccount(store, fakeAdapter(), account, { trigger: "manual", requestedBy: "u1", now: new Date("2026-09-24T15:00:00Z") });
  assertEquals(log, ["start", "token", "saldo", "estrutura", "metricas", "alcance", "cobertura", "fim"]);
  assertEquals(r.status, "sucesso");
  assertEquals(r.details.estrutura, 2);
  assertEquals(r.details.metricas, 3);
  assert((r.details.alcance as number) > 0);
  assertEquals(r.records, 1 + 2 + 3 + (r.details.alcance as number));
  // Próxima em ~1 hora
  const minutes = (finished[0].next.getTime() - Date.now()) / 60_000;
  assert(minutes > 58 && minutes <= 60, `próxima em ${minutes} min`);
});

Deno.test("primeira sincronização busca 30 dias; as seguintes, 7 (no fuso da conta)", () => {
  const now = new Date("2026-09-24T02:00:00Z"); // 23/09 23h em São Paulo
  assertEquals(syncRange(null, "America/Sao_Paulo", now), { from: "2026-08-25", to: "2026-09-23" });
  assertEquals(syncRange("2026-09-23T10:00:00Z", "America/Sao_Paulo", now), { from: "2026-09-17", to: "2026-09-23" });
});

Deno.test("alcance: busca os períodos prontos do painel e os de comparação, sem repetir", () => {
  const ranges = reachRanges("America/Sao_Paulo", new Date("2026-09-24T15:00:00Z"));
  const keys = ranges.map((r) => `${r.from}|${r.to}`);
  assertEquals(new Set(keys).size, keys.length);
  assert(keys.includes("2026-09-17|2026-09-23"), "últimos 7 dias");
  assert(keys.includes("2026-09-10|2026-09-16"), "7 dias anteriores");
  assert(keys.includes("2026-08-01|2026-08-31"), "mês anterior");
});

Deno.test("plataforma sem alcance (Google) não chama alcance", async () => {
  const { store, log } = fakeStore();
  const adapter = fakeAdapter();
  delete (adapter as Partial<PlatformAdapter>).fetchPeriodReach;
  const r = await syncAccount(store, adapter, { ...account, platform_id: "google" }, { trigger: "agendada", requestedBy: null });
  assertEquals(r.status, "sucesso");
  assert(!log.includes("alcance"));
});

Deno.test("erro na API: registra erro amigável, tenta de novo em 30 minutos", async () => {
  const { store, log, finished } = fakeStore();
  const adapter = fakeAdapter({
    fetchDailyMetrics: () => Promise.reject(new AppError(429, "RATE_LIMITED", "O Meta pediu uma pausa nas consultas.")),
  });
  const r = await syncAccount(store, adapter, account, { trigger: "agendada", requestedBy: null });
  assertEquals(r.status, "erro");
  assertEquals(r.errorCode, "RATE_LIMITED");
  assertEquals(r.errorMessage, "O Meta pediu uma pausa nas consultas.");
  assertEquals(r.records, 3, "o que já foi gravado (saldo + estrutura) é contado");
  assert(!log.includes("cobertura"), "com erro, o período não entra na cobertura do histórico");
  assert(!log.includes("conexao-erro"), "limite de uso não derruba a conexão");
  const minutes = (finished[0].next.getTime() - Date.now()) / 60_000;
  assert(minutes > 28 && minutes <= 30);
});

Deno.test("token expirado: marca a conexão com erro", async () => {
  const { store, log } = fakeStore();
  const adapter = fakeAdapter({ getFunding: () => Promise.reject(new AppError(400, "AUTH_EXPIRED", "O token do Meta expirou.")) });
  const r = await syncAccount(store, adapter, account, { trigger: "agendada", requestedBy: null });
  assertEquals(r.status, "erro");
  assert(log.includes("conexao-erro"));
});

Deno.test("conta sem conexão: erro claro, sem chamar a plataforma", async () => {
  const { store, log } = fakeStore();
  const r = await syncAccount(store, fakeAdapter(), { ...account, connection_id: null }, { trigger: "manual", requestedBy: "u1" });
  assertEquals(r.status, "erro");
  assertEquals(r.errorCode, "NO_CONNECTION");
  assert(!log.includes("token"));
});

Deno.test("erro inesperado vira mensagem genérica (detalhe técnico só no log)", async () => {
  const { store } = fakeStore();
  const adapter = fakeAdapter({ fetchStructure: () => Promise.reject(new TypeError("x is undefined")) });
  const r = await syncAccount(store, adapter, account, { trigger: "manual", requestedBy: "u1" });
  assertEquals(r.errorCode, "UNKNOWN");
  assertEquals(r.errorMessage, "Erro inesperado durante a sincronização.");
});

Deno.test("dias sem sincronizar: volta até o último dia já buscado (máx. 90 dias)", () => {
  const now = new Date("2026-09-24T15:00:00Z");
  assertEquals(syncRange("2026-09-24T10:00:00Z", "America/Sao_Paulo", now, "2026-09-24"), { from: "2026-09-18", to: "2026-09-24" }, "em dia: 7 dias");
  assertEquals(syncRange("2026-09-10T10:00:00Z", "America/Sao_Paulo", now, "2026-09-10"), { from: "2026-09-10", to: "2026-09-24" }, "14 dias parada: recupera tudo");
  assertEquals(syncRange("2026-01-10T10:00:00Z", "America/Sao_Paulo", now, "2026-01-10"), { from: "2026-06-27", to: "2026-09-24" }, "meses parada: 90 dias");
});

Deno.test("importação do passado: blocos de 30 dias até a meta", () => {
  assertEquals(backfillRange("2026-08-26", "2025-09-01"), { from: "2026-07-27", to: "2026-08-25" });
  assertEquals(backfillRange("2025-09-20", "2025-09-01"), { from: "2025-09-01", to: "2025-09-19" }, "último bloco para na meta");
  assertEquals(backfillRange("2025-09-01", "2025-09-01"), null, "já chegou");
  assertEquals(backfillRange(null, "2025-09-01"), null, "sem histórico ainda: espera a 1ª sincronização");
});

Deno.test("importação do passado: só métricas, registra cobertura e o log com origem histórico", async () => {
  const { store, log, coverage, backfills, triggers } = fakeStore();
  const adapter = fakeAdapter();
  const r = await backfillAccount(store, adapter, { ...account, history_from: "2026-08-26" }, "2025-09-01");
  assertEquals(r?.status, "sucesso");
  assertEquals(log, ["start", "token", "ids", "metricas", "cobertura", "fim-importacao"]);
  assertEquals(adapter.ranges, [{ from: "2026-07-27", to: "2026-08-25" }]);
  assertEquals(coverage, [{ from: "2026-07-27", to: "2026-08-25" }]);
  assertEquals(triggers, ["historico"]);
  assertEquals(backfills[0].retryAt, null);
});

Deno.test("importação do passado: erro não mexe na cobertura e tenta de novo em 1 hora", async () => {
  const { store, log, backfills } = fakeStore();
  const adapter = fakeAdapter({ fetchDailyMetrics: () => Promise.reject(new AppError(429, "RATE_LIMITED", "O Meta pediu uma pausa nas consultas.")) });
  const r = await backfillAccount(store, adapter, { ...account, history_from: "2026-08-26" }, "2025-09-01");
  assertEquals(r?.status, "erro");
  assertEquals(r?.errorMessage, "O Meta pediu uma pausa nas consultas.");
  assert(!log.includes("cobertura"));
  assert(!log.includes("fim"), "não mexe no estado da sincronização do dia a dia");
  const minutes = ((backfills[0].retryAt?.getTime() ?? 0) - Date.now()) / 60_000;
  assert(minutes > 58 && minutes <= 60);
});

Deno.test("importação do passado: conta já completa não chama a plataforma", async () => {
  const { store, log } = fakeStore();
  const r = await backfillAccount(store, fakeAdapter(), { ...account, history_from: "2025-09-01" }, "2025-09-01");
  assertEquals(r, null);
  assertEquals(log, []);
});
