import { describe, expect, it } from "vitest";
import {
  adsBuilderDefaults, adsBuilderNormalize, type AdsBuilderForm, buildAdsPedido, faixaAviso, findSecret, nomeAnuncio, resizeMapeamento, validateAdsBuilder,
} from "./builder.ts";

const fill = (over: Partial<AdsBuilderForm> = {}): AdsBuilderForm => ({
  ...adsBuilderDefaults(new Date("2026-10-28T12:00:00Z")),
  conta: "Loja Aurora (act_123)", campanha: "[MSG] Aurora | Out", conjunto: "Aberto 25-45",
  pagina: "Loja Aurora", instagram: "@lojaaurora",
  pastas: [{ link: "https://drive.google.com/drive/folders/abc", rotulo: "Vídeos verticais", tipo: "video" },
    { link: "https://drive.google.com/drive/folders/def", rotulo: "Versão Feed", tipo: "video" }],
  quantidade: 14, faixa_inicio: "ADS-01", faixa_fim: "ADS-14",
  textos: ["Promoção de outubro!\nSó esta semana.", "Frete grátis"], titulos: ["Compre já"], descricoes: [],
  whatsapp_numero: "11 98765-4321", whatsapp_mensagem: "Olá! Quero saber mais", tema: "Promo",
  ...over,
});

describe("Criador de Anúncios — validação (Etapa 42)", () => {
  it("formulário completo passa", () => {
    expect(validateAdsBuilder(fill())).toEqual([]);
  });
  it("exige conta, campanha, conjunto, uma pasta e um texto", () => {
    const e = validateAdsBuilder({ ...adsBuilderDefaults(), textos: ["  "] }).map((x) => x.field);
    expect(e).toEqual(expect.arrayContaining(["conta", "campanha", "conjunto", "pastas", "textos"]));
  });
  it("link de pasta e URL do site precisam ser links", () => {
    const e = validateAdsBuilder(fill({ pastas: [{ link: "minha pasta", rotulo: "x", tipo: "video" }], destino: "site", site_url: "loja.com" }));
    expect(e.map((x) => x.field)).toEqual(expect.arrayContaining(["pasta:0", "site_url"]));
  });
  it("recusa senha, token e cartão em qualquer campo", () => {
    expect(validateAdsBuilder(fill({ observacoes: "token: EAABwzLixnjYBAKZCZB1234567890abcdef" }))[0].field).toBe("segredo");
    expect(findSecret("senha: minhaSenha123")).toBe("uma senha ou chave");
    expect(findSecret("cartão 4111 1111 1111 1111")).toBe("um número de cartão");
    expect(findSecret("WhatsApp 55 11 98765-4321")).toBeNull();
    expect(findSecret("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz")).toBeNull();
  });
  it("avisa quando a faixa não bate com a quantidade (sem impedir)", () => {
    expect(faixaAviso(fill())).toBeNull();
    expect(faixaAviso(fill({ quantidade: 10 }))).toMatch(/tem 14 anúncios, mas a quantidade é 10/);
  });
});

describe("nome dos anúncios", () => {
  it("variáveis {nº}, {tema}, {data} com a numeração da faixa", () => {
    expect(nomeAnuncio(fill(), 0)).toBe("ADS-01 | Promo | 28-10-2026");
    expect(nomeAnuncio(fill({ faixa_inicio: "ADS-09" }), 2)).toBe("ADS-11 | Promo | 28-10-2026");
    expect(nomeAnuncio(fill({ nome_modelo: "{campanha} - {nº}" }), 0)).toBe("[MSG] Aurora | Out - 01");
  });
});

describe("pedido gerado", () => {
  it("segue o formato, com mídia, textos numerados, destino e as regras padrão", () => {
    const t = buildAdsPedido(fill());
    expect(t.startsWith("Crie anúncios no Meta Ads com os dados abaixo.")).toBe(true);
    expect(t).toContain("Conta: Loja Aurora (act_123) | Campanha: [MSG] Aurora | Out | Conjunto: Aberto 25-45");
    expect(t).toContain("Página / Instagram: Loja Aurora / @lojaaurora");
    expect(t).toContain("1. Vídeos verticais (vídeo): https://drive.google.com/drive/folders/abc");
    expect(t).toContain("Quantidade: 14 (faixa ADS-01 até ADS-14).");
    expect(t).toContain("Feed para feed, vertical para Stories e Reels: sim.");
    expect(t).toContain("  1. Promoção de outubro!\n     Só esta semana.");
    expect(t).toContain("Distribuição: combinar todos");
    expect(t).toContain('Botão: Enviar mensagem | Destino: WhatsApp — número: 11 98765-4321 / mensagem pré-preenchida: "Olá! Quero saber mais"');
    expect(t).toContain('Nome dos anúncios: modelo "ADS-{nº} | {tema} | {data}" (ex.: ADS-01 | Promo | 28-10-2026)');
    expect(t).toContain("Regras: criar PAUSADO; todos os recursos de IA e aprimoramentos automáticos DESLIGADOS; pausados na origem: ignorar.");
    expect(t).toContain("Crie PRIMEIRO apenas um anúncio");
    expect(t).not.toContain("ATENÇÃO");
  });
  it("cliente, BM e IDs do Meta quando escolhidos nas listas (42.1)", () => {
    const t = buildAdsPedido(fill({ cliente: "Loja Aurora", bm: "BM Aurora", campanha_meta_id: "120001", conjunto_meta_id: "120009" }));
    expect(t).toContain("Cliente: Loja Aurora | BM: BM Aurora");
    expect(t).toContain("Campanha: [MSG] Aurora | Out (ID 120001) | Conjunto: Aberto 25-45 (ID 120009)");
    expect(buildAdsPedido(fill())).not.toContain("Cliente:");
  });
  it("IA ligada e status ATIVO aparecem destacados", () => {
    const t = buildAdsPedido(fill({ ia_ligados: ["musica"], status: "ATIVO" }));
    expect(t).toContain("⚠️ ATENÇÃO — recursos de IA LIGADOS a pedido: Música automática.");
    expect(t).toContain("⚠️ ATENÇÃO: os anúncios devem ser criados ATIVOS");
    expect(t).toContain("DESLIGADOS, EXCETO os listados abaixo");
  });
  it("rodízio e mapeamento manual", () => {
    expect(buildAdsPedido(fill({ distribuicao: "rodizio" }))).toContain("em rodízio");
    const f = fill({ distribuicao: "manual", quantidade: 2 });
    const t = buildAdsPedido({ ...f, mapeamento: [{ texto: 2, titulo: 1 }, { texto: 1, titulo: null }] });
    expect(t).toContain("ADS-01 → texto 2, título 1");
    expect(t).toContain("ADS-02 → texto 1");
    expect(resizeMapeamento({ ...f, quantidade: 3 })).toHaveLength(3);
  });
  it("site e formulário", () => {
    expect(buildAdsPedido(fill({ destino: "site", site_url: "https://loja.com", site_utms: "utm_source=meta" }))).toContain("Site — URL: https://loja.com / UTMs: utm_source=meta");
    expect(buildAdsPedido(fill({ destino: "formulario", formulario_nome: "Lead Outubro" }))).toContain("Formulário instantâneo — formulário: Lead Outubro");
  });
  it("modelo antigo é completado com os padrões", () => {
    const n = adsBuilderNormalize({ conta: "X", ia_ligados: ["musica", "inexistente"] });
    expect([n.conta, n.status, n.textos.length, n.ia_ligados]).toEqual(["X", "PAUSADO", 1, ["musica"]]);
  });
});
