import { describe, expect, it } from "vitest";
import { captureParams, classifyTouch, isHostAllowed, normalizeDomain, normalizeSource } from "./params.ts";

const touch = (url: string, referrer: string | null = null) => classifyTouch({ params: captureParams(url), referrer, pageUrl: url });

describe("captura de parâmetros", () => {
  it("lê UTMs, click IDs e IDs do anúncio sem alterar o valor bruto", () => {
    const p = captureParams("https://site.com/?utm_source=Facebook&utm_medium=paid_social&utm_campaign=Black%20Friday&fbclid=IwAR1&bf_c=120&bf_s=121&bf_a=122&x=1");
    expect(p.utm).toEqual({ utm_source: "Facebook", utm_medium: "paid_social", utm_campaign: "Black Friday" });
    expect(p.clickIds).toEqual({ fbclid: "IwAR1" });
    expect(p.adIds).toEqual({ campaign: "120", adset: "121", ad: "122" });
  });

  it("ignora IDs de anúncio que não são números e URLs inválidas", () => {
    expect(captureParams("https://site.com/?bf_c={{campaign.id}}").adIds).toEqual({});
    expect(captureParams("não é url")).toEqual({ utm: {}, clickIds: {}, adIds: {} });
  });

  it("guarda gclid, wbraid e gbraid", () => {
    expect(captureParams("https://s.com/?gclid=G1&wbraid=W1&gbraid=B1").clickIds).toEqual({ gclid: "G1", wbraid: "W1", gbraid: "B1" });
  });
});

describe("classificação da origem (nunca inventar)", () => {
  it("gclid = anúncio do Google confirmado", () => {
    expect(touch("https://s.com/?gclid=abc")).toMatchObject({ channel: "google", paid: true, evidence: "confirmada" });
  });

  it("IDs do anúncio do Meta = confirmada", () => {
    expect(touch("https://s.com/?utm_source=meta&bf_c=1&bf_a=2")).toMatchObject({ channel: "meta", paid: true, evidence: "confirmada" });
    expect(touch("https://s.com/?fbclid=x&utm_source=fb&utm_medium=cpc")).toMatchObject({ channel: "meta", evidence: "confirmada" });
  });

  it("fbclid sozinho = provável (link orgânico também tem fbclid)", () => {
    expect(touch("https://s.com/?fbclid=x")).toMatchObject({ channel: "meta", paid: null, evidence: "provavel" });
  });

  it("só UTM = provável, com fonte normalizada", () => {
    const t = touch("https://s.com/?utm_source=Instagram&utm_medium=paid");
    expect(t).toMatchObject({ channel: "meta", paid: true, evidence: "provavel", sourceNormalized: "instagram" });
    expect(touch("https://s.com/?utm_source=parceiro_x")).toMatchObject({ channel: "outros", evidence: "provavel" });
  });

  it("sem parâmetros: buscador, rede social, WhatsApp, outro site ou direto", () => {
    expect(touch("https://s.com/", "https://www.google.com.br/")).toMatchObject({ channel: "busca_organica", paid: false });
    expect(touch("https://s.com/", "https://l.instagram.com/")).toMatchObject({ channel: "social_organico" });
    expect(touch("https://s.com/", "https://wa.me/55")).toMatchObject({ channel: "whatsapp" });
    expect(touch("https://s.com/", "https://blog.parceiro.com/post")).toMatchObject({ channel: "referral" });
    expect(touch("https://s.com/")).toMatchObject({ channel: "direto", evidence: "desconhecida" });
  });

  it("navegação dentro do próprio site não cria nova origem", () => {
    expect(touch("https://www.s.com/produto", "https://www.s.com/")).toBeNull();
  });

  it("normaliza a fonte sem perder o bruto", () => {
    expect(normalizeSource(" Facebook Ads ")).toBe("facebook_ads");
  });
});

describe("domínios autorizados", () => {
  it("limpa o que foi digitado", () => {
    expect(normalizeDomain("https://www.Cliente.com.br/loja?x=1")).toBe("www.cliente.com.br");
    expect(normalizeDomain("cliente.com.br")).toBe("cliente.com.br");
    expect(normalizeDomain("não é domínio")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("libera o domínio e os subdomínios, e mais nada", () => {
    expect(isHostAllowed("www.cliente.com.br", ["cliente.com.br"])).toBe(true);
    expect(isHostAllowed("cliente.com.br", ["cliente.com.br"])).toBe(true);
    expect(isHostAllowed("cliente.com.br.golpe.com", ["cliente.com.br"])).toBe(false);
    expect(isHostAllowed("outrocliente.com.br", ["cliente.com.br"])).toBe(false);
  });
});
