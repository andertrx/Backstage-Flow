import { describe, expect, it } from "vitest";
import {
  describeRule,
  fieldNameMatches,
  fieldValueMatches,
  metaEventName,
  normalizeRuleText,
  pageMatches,
  parseMoneyText,
  type TrackingRuleInput,
  validateTrackingRule,
} from "./rules.ts";

const base: TrackingRuleInput = {
  name: "Regra", kind: "formulario", match_op: "contem", match_text: null, click_by: null, field_name: null, field_values: null,
  event_name: "Lead", meta_mode: "mesmo", meta_event: null, value_mode: "nenhum", value_fixed: null, value_selector: null, currency: null, order_param: null,
};

describe("regras de tracking (sem Tag Manager)", () => {
  it("normaliza texto sem acento e sem maiúscula", () => {
    expect(normalizeRuleText("  Lojísta   Atacado ")).toBe("lojista atacado");
  });

  it("página: contém, igual (barra no fim) e começa com", () => {
    expect(pageMatches("contem", "/obrigado", "https://loja.com/obrigado?pedido=9")).toBe(true);
    expect(pageMatches("contem", "/obrigado", "https://loja.com/contato")).toBe(false);
    expect(pageMatches("igual", "/obrigado", "https://loja.com/obrigado/")).toBe(true);
    expect(pageMatches("igual", "/obrigado", "https://loja.com/obrigado?x=1")).toBe(true);
    expect(pageMatches("igual", "/obrigado", "https://loja.com/obrigado-2")).toBe(false);
    expect(pageMatches("comeca", "/produto/", "https://loja.com/produto/camiseta")).toBe(true);
    expect(pageMatches("comeca", "/produto/", "https://loja.com/blog/produto/")).toBe(false);
    expect(pageMatches("contem", "https://loja.com/checkout/sucesso", "https://loja.com/checkout/sucesso?id=1")).toBe(true);
    expect(pageMatches("contem", "", "https://loja.com/")).toBe(false);
  });

  it("formulário: campo pelo nome/rótulo e resposta sem diferença de acento", () => {
    expect(fieldNameMatches("Tipo de cliente", ["tipo_cliente", "Tipo de cliente *"])).toBe(true);
    expect(fieldNameMatches("tipo", ["form-field-tipo"])).toBe(true);
    expect(fieldNameMatches("Tipo de cliente", ["email", "telefone"])).toBe(false);
    expect(fieldValueMatches(["Lojista"], " LOJÍSTA ")).toBe(true);
    expect(fieldValueMatches(["Lojista", "Atacado"], "Sacoleiro")).toBe(false);
    expect(fieldValueMatches(["Lojista"], "")).toBe(false);
  });

  it("valor escrito na página (real e dólar), sem inventar", () => {
    expect(parseMoneyText("Total: R$ 1.234,56")).toBe(1234.56);
    expect(parseMoneyText("R$ 297,00")).toBe(297);
    expect(parseMoneyText("$1,234.56")).toBe(1234.56);
    expect(parseMoneyText("R$ 1.234")).toBe(1234);
    expect(parseMoneyText("297")).toBe(297);
    expect(parseMoneyText("12,5")).toBe(12.5);
    expect(parseMoneyText("Grátis")).toBeNull();
    expect(parseMoneyText(null)).toBeNull();
  });

  it("nome no Meta: mesmo, personalizado ou não envia", () => {
    expect(metaEventName(base)).toBe("Lead");
    expect(metaEventName({ ...base, meta_mode: "personalizado", meta_event: "LeadOutros" })).toBe("LeadOutros");
    expect(metaEventName({ ...base, meta_mode: "nao_enviar" })).toBeNull();
  });

  it("resumo em português", () => {
    expect(describeRule({ ...base, field_name: "Tipo de cliente", field_values: ["Lojista"] }))
      .toBe('Quando enviar qualquer formulário com "Tipo de cliente" = "Lojista" → Lead (vai ao Meta)');
    expect(describeRule({ ...base, kind: "pagina", match_text: "/obrigado", event_name: "Purchase", meta_mode: "nao_enviar", value_mode: "fixo", value_fixed: 10, currency: "BRL" }))
      .toBe('Quando o endereço contém "/obrigado" → Compra (não vai ao Meta)');
    expect(describeRule({ ...base, meta_mode: "personalizado", meta_event: "LeadOutros" })).toContain('vai ao Meta como "LeadOutros"');
  });

  it("validação com as mesmas travas do banco", () => {
    expect(validateTrackingRule(base)).toEqual([]);
    expect(validateTrackingRule({ ...base, event_name: "Purchase" })).toContain("Compra precisa de valor (fixo ou lido da página): o Meta recusa compra sem valor.");
    expect(validateTrackingRule({ ...base, meta_mode: "personalizado" })).toHaveLength(1);
    expect(validateTrackingRule({ ...base, kind: "pagina" })).toContain("Informe o endereço (ou parte dele) da página.");
    expect(validateTrackingRule({ ...base, value_mode: "fixo", value_fixed: 10 })).toContain("Escolha a moeda do valor.");
    expect(validateTrackingRule({ ...base, field_name: "Tipo", field_values: [] })).toContain("Informe as respostas do campo que contam.");
  });
});
