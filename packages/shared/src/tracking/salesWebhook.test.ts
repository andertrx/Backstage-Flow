import { describe, expect, it } from "vitest";
import { collectPaths, extractSale, getPath, parseWebhookBody, suggestSalesMapping } from "./salesWebhook.ts";

const shop = {
  id: 9001,
  order_number: "1050",
  total_price: "1.297,50",
  currency: "brl",
  financial_status: "paid",
  customer: { id: 77, email: "Maria@Loja.com", phone: "(45) 99999-8888" },
  line_items: [{ price: "10.00", title: "Camiseta" }, { price: "20.00" }],
};

describe("aviso de venda (webhook de qualquer sistema)", () => {
  it("lê JSON, lista e formulário; recusa o resto", () => {
    expect(parseWebhookBody('{"a":1}', "application/json")).toEqual({ a: 1 });
    expect(parseWebhookBody('[{"a":2}]', null)).toEqual({ a: 2 });
    expect(parseWebhookBody("pedido=10&valor=29%2C90", "application/x-www-form-urlencoded")).toEqual({ pedido: "10", valor: "29,90" });
    expect(parseWebhookBody("{quebrado", "application/json")).toBeNull();
    expect(parseWebhookBody("texto solto qualquer", "text/plain")).toBeNull();
    expect(parseWebhookBody("   ", null)).toBeNull();
  });

  it("lista só os nomes dos campos (lista: só o 1º item)", () => {
    const paths = collectPaths(shop);
    expect(paths).toContain("customer.phone");
    expect(paths).toContain("line_items.0.price");
    expect(paths).not.toContain("line_items.1.price");
    expect(JSON.stringify(paths)).not.toContain("99999");
    expect(collectPaths({ a: 1, b: 2, c: 3 }, 2)).toHaveLength(2);
    expect(getPath(shop, "line_items.0.title")).toBe("Camiseta");
    expect(getPath(shop, "nao.existe")).toBeUndefined();
  });

  it("sugere o mapeamento pelos nomes mais comuns", () => {
    const m = suggestSalesMapping(collectPaths(shop));
    expect(m).toMatchObject({ order: "order_number", value: "total_price", currency: "currency", phone: "customer.phone", email: "customer.email", status: "financial_status" });
    expect(suggestSalesMapping(["data.amount_cents", "data.id"]).value_in_cents).toBe(true);
  });

  it("extrai a venda pelo mapeamento", () => {
    const r = extractSale(shop, { order: "order_number", value: "total_price", currency: "currency", phone: "customer.phone", email: "customer.email" });
    expect(r).toEqual({ ok: true, order: "1050", value: 1297.5, currency: "BRL", phone: "(45) 99999-8888", email: "Maria@Loja.com" });
    const cents = extractSale({ o: 5, v: 29750 }, { order: "o", value: "v", value_in_cents: true, default_currency: "usd" });
    expect(cents).toMatchObject({ ok: true, order: "5", value: 297.5, currency: "USD", phone: null, email: null });
  });

  it("status que não conta é ignorado; o que conta passa (sem acento e maiúscula)", () => {
    const m = { order: "order_number", value: "total_price", status: "financial_status", status_values: ["Paid", "aprovado"] };
    expect(extractSale(shop, m).ok).toBe(true);
    const r = extractSale({ ...shop, financial_status: "pending" }, m);
    expect(r).toMatchObject({ ok: false, result: "ignorado" });
    expect(extractSale({ ...shop, financial_status: "APROVADO" }, m).ok).toBe(true);
  });

  it("nada inventado: faltou dado → recusado com o motivo", () => {
    expect(extractSale(shop, { value: "total_price" })).toMatchObject({ ok: false, result: "recusado" });
    expect(extractSale(shop, { order: "nao.tem", value: "total_price" })).toMatchObject({ ok: false, result: "recusado", reason: expect.stringContaining("pedido") });
    expect(extractSale(shop, { order: "order_number", value: "customer" })).toMatchObject({ ok: false, result: "recusado", reason: expect.stringContaining("Valor") });
    expect(extractSale({ ...shop, currency: "reais" }, { order: "order_number", value: "total_price", currency: "currency" })).toMatchObject({ ok: false, result: "recusado" });
  });
});
