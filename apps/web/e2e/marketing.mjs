/**
 * Teste de navegador — T5.35 (etapa 4): a visão de marketing do Tracking.
 * "De onde veio cada venda": origem × resultado, o caminho até a venda e o
 * investimento que ainda não voltou. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const AUR = "e0000000-0000-4000-8000-000000004601";
const OUTRO = "e0000000-0000-4000-8000-000000004602";
const SEM_SITE = "e0000000-0000-4000-8000-000000004603";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });

function seed(db) {
  db.clients.push(client(AUR, "Loja Aurora"));
  db.clients.push(client(OUTRO, "Outro Cliente"));
  db.clients.push(client(SEM_SITE, "Cliente sem site"));
  db.trackingContainers.push({ id: "t-aur", client_id: AUR, name: "aurora.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["aurora.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.trackingContainers.push({ id: "t-outro", client_id: OUTRO, name: "outro.com.br", public_key: "bf_0123456789abcdef01234568", allowed_domains: ["outro.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });

  const nada = { channel: null, campaign_id: null, campaign_label: null, match: null, leads: 0, purchases: 0, confirmed: 0, revenue: {},
    spend_currency: null, spend_micros: null, platform_leads: null, platform_conversions: null, platform_value_micros: null };

  db.trackingAttribution = {
    last: [
      { ...nada, client_id: AUR, channel: "meta", campaign_id: "c1", campaign_label: "Black Friday", match: "id", leads: 4, purchases: 2, confirmed: 4,
        revenue: { BRL: 400_000_000 }, spend_currency: "BRL", spend_micros: 200_000_000 },
      { ...nada, client_id: AUR, channel: "google", campaign_id: "c2", campaign_label: "Pesquisa Marca", match: "id", leads: 2,
        spend_currency: "BRL", spend_micros: 50_000_000 },
      { ...nada, client_id: AUR, channel: "meta", campaign_id: "c3", campaign_label: "Campanha sem lead", match: "sem_conversao",
        spend_currency: "BRL", spend_micros: 80_000_000 },
      { ...nada, client_id: AUR, channel: "direto", leads: 1 },
      // A mesma campanha vista por duas origens: o investimento não pode ser contado duas vezes.
      { ...nada, client_id: AUR, channel: "whatsapp", campaign_id: "c1", campaign_label: "Black Friday", match: "id", leads: 1,
        spend_currency: "BRL", spend_micros: 200_000_000 },
      { ...nada, client_id: OUTRO, channel: "meta", campaign_id: "c9", campaign_label: "Campanha de outro cliente", match: "id", leads: 9, purchases: 9,
        revenue: { BRL: 900_000_000 }, spend_currency: "BRL", spend_micros: 100_000_000 },
    ],
    first: [],
  };

  db.trackingJourneySummary = [
    { client_id: AUR, leads: 8, purchases: 2, toques_0: 1, toques_1: 4, toques_2_3: 2, toques_4p: 1, media_toques: 2.1, media_dias: 3.5, mais_rapido_dias: 1, origem_paga: 6 },
    { client_id: OUTRO, leads: 9, purchases: 9, toques_0: 0, toques_1: 9, toques_2_3: 0, toques_4p: 0, media_toques: 1, media_dias: 1, mais_rapido_dias: 1, origem_paga: 9 },
  ];
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?aba=marketing");
  await page.getByTestId("marketing-view").waitFor();
  await page.getByTestId("mk-leads").waitFor();

  // Escolhe o cliente: a tela é do cliente escolhido (ou de todos).
  await page.getByTestId("tracking-client").selectOption(AUR);
  await page.waitForTimeout(400);

  const txt = async (id) => (await page.getByTestId(id).innerText()).replace(/ /g, " ");

  // 1) Resumo do período
  check((await txt("mk-leads")).includes("8"), "o resumo mostra os leads do período");
  check((await txt("mk-purchases")).includes("2"), "o resumo mostra as compras");
  check((await txt("mk-receita")).includes("R$ 400,00"), "o resumo mostra a receita");
  check((await txt("mk-investimento")).includes("R$ 330,00"), "o resumo mostra o investimento (a campanha repetida não conta duas vezes)");
  check((await txt("mk-custo-lead")).includes("R$ 41,25"), "o custo por lead (investimento ÷ leads)");
  check((await txt("mk-roas")).includes("1,21×"), "o ROAS (receita ÷ investimento, na mesma moeda)");

  // 2) Origem × resultado
  const origens = (await page.getByTestId("mk-origem-row").allInnerTexts()).join(" | ").replace(/ /g, " ");
  check(origens.includes("Meta Ads") && origens.includes("WhatsApp") && origens.includes("Direto"), "a tabela de origem mostra cada canal");
  check(origens.includes("60%"), "a tabela de origem mostra o peso de cada canal");

  // 3) Caminho até a venda
  const caminho = await page.getByTestId("mk-caminho").innerText();
  check(caminho.includes("2,1"), "mostra a média de origens antes de comprar");
  check(caminho.includes("3,5 dias"), "mostra quantos dias leva da primeira origem até a conversão");
  check(caminho.includes("1 dia"), "mostra o caminho mais curto");
  check(caminho.includes("6 de 8"), "mostra quantos vieram de anúncio");
  check(caminho.includes("4 lead(s) chegaram numa origem só"), "mostra a distribuição das origens");

  // 4) Onde foi o dinheiro
  const campanhas = (await page.getByTestId("mk-campanha-row").allInnerTexts()).join(" | ").replace(/ /g, " ");
  check(campanhas.includes("Black Friday") && campanhas.includes("Pesquisa Marca"), "a tabela mostra as campanhas");
  check(campanhas.includes("Sem lead no site"), "a campanha que gastou e não trouxe lead é apontada");
  check(!campanhas.includes("Campanha de outro cliente"), "as campanhas de outro cliente não aparecem com o cliente escolhido");

  // 5) O investimento que ainda não voltou
  const semLead = await page.getByTestId("mk-sem-lead").innerText();
  check(semLead.includes("Campanha sem lead") && semLead.replace(/ /g, " ").includes("R$ 80,00"), "o bloco final mostra a campanha sem lead e quanto foi gasto");

  // 6) Trocando de cliente
  await page.getByTestId("tracking-client").selectOption(OUTRO);
  await page.waitForTimeout(400);
  const outro = (await page.getByTestId("mk-campanha-row").allInnerTexts()).join(" | ");
  check(outro.includes("Campanha de outro cliente") && !outro.includes("Black Friday"), "escolhendo outro cliente, a tela mostra só o marketing dele");
  check((await txt("mk-leads")).includes("9"), "o resumo acompanha o cliente escolhido");

  await page.getByTestId("tracking-client").selectOption("");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/tracking-marketing.png`, fullPage: true });

  // Cliente sem site: a tela diz isso em vez de mostrar zeros.
  await page.getByTestId("tracking-client").selectOption(SEM_SITE);
  await page.waitForTimeout(400);
  const semSite = await page.getByTestId("mk-sem-site").innerText();
  check(semSite.includes("ainda não tem site configurado"), "cliente sem site: a tela explica que ainda não há site configurado");

  check(errors.length === 0, `sem erros na página${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

console.log("marketing: OK");
