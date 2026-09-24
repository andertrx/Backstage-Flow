import { assertEquals } from "jsr:@std/assert@1";
import { createGoogleAdapter } from "./google/adapter.ts";
import { activeBudget, mapGoogleFunding, zonedToIso } from "./google/funding.ts";
import { createMetaAdapter } from "./meta/adapter.ts";
import { mapMetaFunding, metaMoneyToMicros } from "./meta/funding.ts";
import type { PlatformAccount } from "./types.ts";

Deno.env.set("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV-TOKEN");
Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client-id");
Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");

const M = 1_000_000;

// ------------------------------------------------------------------ Meta

Deno.test("Meta: dinheiro vem em centavos (e sem centavos em moedas como JPY)", () => {
  assertEquals(metaMoneyToMicros("125050", "BRL"), 1250.5 * M);
  assertEquals(metaMoneyToMicros("5000", "JPY"), 5000 * M);
  assertEquals(metaMoneyToMicros(undefined, "BRL"), null);
  assertEquals(metaMoneyToMicros("abc", "BRL"), null);
});

Deno.test("Meta: disponível = limite de gastos − gasto; texto da forma de pagamento como veio", () => {
  const f = mapMetaFunding({
    id: "act_1", currency: "BRL", account_status: 1, amount_spent: "30000", spend_cap: "100000", balance: "1500",
    funding_source_details: { type: 20, display_string: " Saldo disponível (R$ 123,45 BRL) " },
  });
  assertEquals(f.spendCapMicros, 1000 * M);
  assertEquals(f.amountSpentMicros, 300 * M);
  assertEquals(f.availableMicros, 700 * M);
  assertEquals(f.availableBasis, "meta_spend_cap");
  assertEquals(f.amountDueMicros, 15 * M);
  assertEquals(f.fundingDescription, "Saldo disponível (R$ 123,45 BRL)");
  assertEquals(f.issues, []);
});

Deno.test("Meta: sem limite de gastos (spend_cap 0) → disponível não informado", () => {
  const f = mapMetaFunding({ id: "act_1", currency: "BRL", account_status: 1, amount_spent: "30000", spend_cap: "0" });
  assertEquals(f.spendCapMicros, null);
  assertEquals(f.availableMicros, null);
  assertEquals(f.availableBasis, null);
  assertEquals(f.fundingDescription, null);
});

Deno.test("Meta: limite atingido e problemas de cobrança", () => {
  assertEquals(mapMetaFunding({ id: "act_1", currency: "BRL", account_status: 1, amount_spent: "100000", spend_cap: "100000" }).issues, ["sem_saldo"]);
  assertEquals(mapMetaFunding({ id: "act_1", account_status: 3 }).issues, ["pagamento_pendente"]);
  assertEquals(mapMetaFunding({ id: "act_1", account_status: 9 }).issues, ["cobranca_problema"]);
  assertEquals(mapMetaFunding({ id: "act_1", account_status: 2, disable_reason: 3 }).issues, ["cobranca_problema", "conta_desativada"]);
  assertEquals(mapMetaFunding({ id: "act_1", account_status: 7 }).issues, ["conta_limitada"]);
});

Deno.test("Meta getFunding: sem permissão para a forma de pagamento, lê o resto", async () => {
  const calls: URL[] = [];
  const responses = [
    { status: 400, body: { error: { code: 200, message: "no permission" } } },
    { status: 200, body: { id: "act_1", account_id: "1", name: "Conta", currency: "BRL", account_status: 1, amount_spent: "100", spend_cap: "0" } },
  ];
  const impl = ((input: URL | string) => {
    calls.push(new URL(input.toString()));
    const r = responses.shift()!;
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
  }) as typeof fetch;
  const { account, funding } = await createMetaAdapter(impl).getFunding("TOKEN", "1");
  assertEquals(account.status, "ativa");
  assertEquals(funding.amountSpentMicros, 1 * M);
  assertEquals(calls[0].searchParams.get("fields")?.includes("funding_source_details"), true);
  assertEquals(calls[1].searchParams.get("fields")?.includes("funding_source_details"), false);
});

// ------------------------------------------------------------------ Google

const account: PlatformAccount = {
  externalId: "222", name: "Loja", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", rawStatus: "customer.status=ENABLED",
  statusReason: null, businessId: null, businessName: null, isPrepay: null, managerId: null, isTestAccount: false,
};
const now = new Date("2026-09-24T15:00:00Z"); // 12:00 em São Paulo

Deno.test("Google: horário do fuso da conta → UTC", () => {
  assertEquals(zonedToIso("2026-10-31 23:59:59", "America/Sao_Paulo"), "2026-11-01T02:59:59.000Z");
  assertEquals(zonedToIso("inválido", "America/Sao_Paulo"), null);
});

Deno.test("Google: orçamento vigente → disponível = limite ajustado − veiculado", () => {
  const f = mapGoogleFunding(account, [
    { id: "1", approvedStartDateTime: "2026-01-01 00:00:00", approvedEndDateTime: "2026-06-30 23:59:59", approvedSpendingLimitMicros: String(9999 * M), amountServedMicros: "0" },
    { id: "2", approvedStartDateTime: "2026-07-01 00:00:00", approvedEndDateTime: "2026-12-31 23:59:59",
      approvedSpendingLimitMicros: String(5000 * M), adjustedSpendingLimitMicros: String(4800 * M), amountServedMicros: String(3000 * M) },
  ], [{ id: "b", status: "APPROVED" }], now);
  assertEquals(f.budgetMicros, 5000 * M);
  assertEquals(f.spendCapMicros, 4800 * M);
  assertEquals(f.amountSpentMicros, 3000 * M);
  assertEquals(f.availableMicros, 1800 * M);
  assertEquals(f.availableBasis, "google_account_budget");
  assertEquals(f.budgetEndAt, "2027-01-01T02:59:59.000Z");
  assertEquals(f.issues, []);
});

Deno.test("Google: sem orçamento com limite (cartão) → disponível não informado", () => {
  const f = mapGoogleFunding(account, [], [{ status: "APPROVED" }], now);
  assertEquals(f.availableMicros, null);
  assertEquals(f.spendCapMicros, null);
  const infinite = mapGoogleFunding(account, [{ approvedSpendingLimitType: "INFINITE", amountServedMicros: "10", approvedEndTimeType: "FOREVER" }], [{ status: "APPROVED" }], now);
  assertEquals(infinite.availableMicros, null);
  assertEquals(activeBudget([{ approvedStartDateTime: "2027-01-01 00:00:00" }], "2026-09-24 12:00:00"), null);
});

Deno.test("Google: faturamento pendente, sem forma de pagamento, limite atingido", () => {
  assertEquals(mapGoogleFunding(account, [], [{ status: "PENDING" }], now).issues, ["pagamento_pendente"]);
  assertEquals(mapGoogleFunding(account, [], [{ status: "CANCELLED" }], now).issues, ["sem_forma_pagamento"]);
  assertEquals(mapGoogleFunding(account, null, null, now).issues, [], "sem permissão de leitura: nada é presumido");
  assertEquals(mapGoogleFunding({ ...account, isTestAccount: true }, [], [], now).issues, [], "conta de teste não tem faturamento");
  assertEquals(mapGoogleFunding({ ...account, status: "restrita" }, [], [{ status: "APPROVED" }], now).issues, ["conta_limitada"]);
  const full = mapGoogleFunding(account, [{ approvedSpendingLimitMicros: String(100 * M), amountServedMicros: String(120 * M) }], [{ status: "APPROVED" }], now);
  assertEquals(full.availableMicros, 0);
  assertEquals(full.issues, ["sem_saldo"]);
});

Deno.test("Google getFunding: sem permissão de faturamento, a conta ainda é lida", async () => {
  const queries: string[] = [];
  const impl = ((input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    if (url.includes("oauth2.googleapis.com/token")) return ok({ access_token: "ACCESS", expires_in: 3600 });
    const query = JSON.parse(init!.body as string).query as string;
    queries.push(query);
    if (query.includes("FROM customer")) {
      return ok({ results: [{ customer: { id: "222", descriptiveName: "Loja", status: "ENABLED", currencyCode: "BRL", timeZone: "America/Sao_Paulo" } }] });
    }
    return Promise.resolve(new Response(JSON.stringify({ error: { code: 400, message: "QUERY_ERROR" } }), { status: 400 }));
  }) as typeof fetch;
  const { account: acc, funding } = await createGoogleAdapter(impl).getFunding("REFRESH", "222");
  assertEquals(acc.name, "Loja");
  assertEquals(funding.availableMicros, null);
  assertEquals(funding.issues, []);
  assertEquals(funding.raw.account_budget_readable, false);
  assertEquals(queries.length, 3);
});
