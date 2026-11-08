import { describe, expect, it } from "vitest";
import { extractLead, suggestLeadMapping } from "./leadWebhook.ts";

const body = {
  respondent: { name: "Ana Maria Souza", whatsapp: "(45) 99999-8888", email: "Ana@X.com" },
  url_params: { utm_source: "facebook", utm_campaign: "Janeiro", fbclid: "IwAR1", bf_c: "120" },
  page: "https://www.site.com/oferta",
};

describe("lead por webhook (formulário de outro sistema)", () => {
  it("sugere o mapeamento pelos nomes comuns e pelos nomes dos parâmetros de URL", () => {
    const keys = ["respondent.name", "respondent.whatsapp", "respondent.email", "url_params.utm_source", "url_params.utm_campaign", "url_params.fbclid", "url_params.bf_c", "page"];
    const m = suggestLeadMapping(keys);
    expect(m).toMatchObject({ phone: "respondent.whatsapp", email: "respondent.email", name: "respondent.name", utm_source: "url_params.utm_source", fbclid: "url_params.fbclid", bf_c: "url_params.bf_c", page_url: "page" });
    expect(m.gclid).toBeUndefined();
  });
  it("lê o lead com a origem do aviso", () => {
    const r = extractLead(body, suggestLeadMapping(["respondent.name", "respondent.whatsapp", "respondent.email", "url_params.utm_source", "url_params.utm_campaign", "url_params.fbclid", "url_params.bf_c", "page"]));
    expect(r).toEqual({
      ok: true, phone: "(45) 99999-8888", email: "Ana@X.com", name: "Ana Maria Souza", page_url: "https://www.site.com/oferta",
      params: { utm_source: "facebook", utm_campaign: "Janeiro", fbclid: "IwAR1", bf_c: "120" },
    });
  });
  it("recusa sem mapeamento de contato ou sem contato no aviso (nada inventado)", () => {
    expect(extractLead(body, { utm_source: "url_params.utm_source" })).toMatchObject({ ok: false, result: "recusado" });
    expect(extractLead({ a: 1 }, { phone: "p", email: "e" })).toMatchObject({ ok: false, reason: expect.stringContaining("sem telefone nem e-mail") });
  });
  it("aviso sem origem continua sendo lead, só sem parâmetros", () => {
    const r = extractLead({ tel: "11999998888" }, { phone: "tel" });
    expect(r).toMatchObject({ ok: true, params: {}, email: null });
  });
});
