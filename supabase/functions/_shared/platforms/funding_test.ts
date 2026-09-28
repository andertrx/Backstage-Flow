import { assertEquals } from "jsr:@std/assert@1";
import { createGoogleAdapter } from "./google/adapter.ts";
import { activeBudget, mapGoogleFunding, zonedToIso } from "./google/funding.ts";
import { createMetaAdapter } from "./meta/adapter.ts";
import { mapMetaFunding, metaMoneyToMicros, parseMetaPrepaidBalance } from "./meta/funding.ts";
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

Deno.test("Meta: saldo pré-pago (PIX/boleto) = valor que o Meta informa, nunca limite − gasto", () => {
  const f = mapMetaFunding({
    id: "act_1", currency: "BRL", account_status: 1, amount_spent: "30000", spend_cap: "821443", balance: "1500", is_prepay_account: true,
    funding_source_details: { type: 20, display_string: " Saldo disponível (R$1.345,32 BRL) " },
  });
  assertEquals(f.spendCapMicros, 8214.43 * M);
  assertEquals(f.amountSpentMicros, 300 * M);
  assertEquals(f.availableMicros, 1345.32 * M);
  assertEquals(f.availableBasis, "meta_prepaid_balance");
  assertEquals(f.amountDueMicros, 15 * M);
  assertEquals(f.fundingDescription, "Saldo disponível (R$1.345,32 BRL)");
  assertEquals(f.issues, []);
});

Deno.test("Meta: pago no cartão → sem saldo em conta (o limite de gastos não vira disponível)", () => {
  const f = mapMetaFunding({
    id: "act_1", currency: "BRL", account_status: 1, amount_spent: "156786", spend_cap: "500000", is_prepay_account: false,
    funding_source_details: { type: 1, display_string: "Mastercard *2596" },
  });
  assertEquals(f.spendCapMicros, 5000 * M, "o limite continua guardado como limite");
  assertEquals(f.availableMicros, null);
  assertEquals(f.availableBasis, "meta_card");
  assertEquals(f.issues, [], "cartão não gera alerta de 'sem saldo'");
});

Deno.test("Meta: sem forma de pagamento legível → disponível não informado", () => {
  const f = mapMetaFunding({ id: "act_1", currency: "BRL", account_status: 1, amount_spent: "30000", spend_cap: "0" });
  assertEquals(f.spendCapMicros, null);
  assertEquals(f.availableMicros, null);
  assertEquals(f.availableBasis, null);
  assertEquals(f.fundingDescription, null);
  const prepaidNoText = mapMetaFunding({ id: "act_1", currency: "BRL", is_prepay_account: true, funding_source_details: { type: 20 } });
  assertEquals(prepaidNoText.availableMicros, null, "pré-pago sem o texto do saldo: não inventa");
});

Deno.test("Meta: texto do saldo pré-pago", () => {
  assertEquals(parseMetaPrepaidBalance("Saldo disponível (R$1.345,32 BRL)", "BRL"), 1345.32 * M);
  assertEquals(parseMetaPrepaidBalance("Saldo disponível (R$392,15 BRL)", "BRL"), 392.15 * M);
  assertEquals(parseMetaPrepaidBalance("Saldo disponível (R$0,00 BRL)", "BRL"), 0);
  assertEquals(parseMetaPrepaidBalance("Available balance ($1,234.50 USD)", "USD"), 1234.5 * M);
  assertEquals(parseMetaPrepaidBalance("Saldo disponível (R$12.345 BRL)", "BRL"), 12345 * M);
  assertEquals(parseMetaPrepaidBalance("Saldo disponível (R$1.345,32 BRL)", "USD"), null, "moeda diferente da conta");
  assertEquals(parseMetaPrepaidBalance("Mastercard *2596", "BRL"), null);
  assertEquals(parseMetaPrepaidBalance(null, "BRL"), null);
});

Deno.test("Meta: saldo pré-pago zerado e problemas de cobrança", () => {
  assertEquals(mapMetaFunding({ id: "act_1", currency: "BRL", account_status: 1, is_prepay_account: true,
    funding_source_details: { type: 20, display_string: "Saldo disponível (R$0,00 BRL)" } }).issues, ["sem_saldo"]);
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
