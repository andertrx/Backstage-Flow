/**
 * Teste de navegador da Etapa 42 — Criador de Anúncios (monta o pedido em texto para o Claude). Supabase SIMULADO.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLI = "c4200000-0000-4000-8000-0000000000c4";
const ACC = "a4200000-0000-4000-8000-0000000000a4";
const CAMP = "b4200000-0000-4000-8000-0000000000b4";
const CLI2 = "c4200000-0000-4000-8000-0000000000c5";
const ACC2 = "a4200000-0000-4000-8000-0000000000a5";
const CLI3 = "c4200000-0000-4000-8000-0000000000c6";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });

function seed(db) {
  db.clients.push(client(CLI, "Loja Aurora"));
  db.clients.push(client(CLI2, "Loja Brisa"), { ...client(CLI3, "Loja Encerrada"), status: "encerrado" });
  db.adAccounts.push(
    { id: ACC, platform_id: "meta", external_id: "111", client_id: CLI, name: "Loja Aurora", currency: "BRL", status: "ativa", unlinked_at: null, business_id: "9001", business_name: "BM Aurora" },
    { id: ACC2, platform_id: "meta", external_id: "112", client_id: CLI, name: "Aurora Atacado", currency: "BRL", status: "ativa", unlinked_at: null, business_id: "9002", business_name: "BM Aurora 2" },
    { id: crypto.randomUUID(), platform_id: "meta", external_id: "211", client_id: CLI2, name: "Loja Brisa", currency: "BRL", status: "ativa", unlinked_at: null, business_id: "9003", business_name: "BM Brisa" },
    { id: crypto.randomUUID(), platform_id: "meta", external_id: "311", client_id: CLI3, name: "Loja Encerrada", currency: "BRL", status: "ativa", unlinked_at: null, business_id: "9004", business_name: "BM Encerrada" },
  );
  db.campaigns.push(
    { id: CAMP, ad_account_id: ACC, client_id: CLI, platform_id: "meta", external_id: "120001", name: "[MSG] Aurora | Outubro", status: "ativa" },
    { id: crypto.randomUUID(), ad_account_id: ACC, client_id: CLI, platform_id: "meta", external_id: "120002", name: "[LEADS] Aurora", status: "pausada" },
  );
  db.adGroups.push({ id: crypto.randomUUID(), campaign_id: CAMP, ad_account_id: ACC, client_id: CLI, platform_id: "meta", external_id: "130001", name: "Aberto 25-45", status: "ativa" },
    { id: crypto.randomUUID(), campaign_id: CAMP, ad_account_id: ACC, client_id: CLI, platform_id: "meta", external_id: "130002", name: "Remarketing 7d", status: "ativa" });
}

// ---------------------------------------------------------------- Admin no computador
{
  const { browser, page, errors } = await launch();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/criador-de-anuncios");
  await page.getByTestId("ads-builder").waitFor();
  check((await page.getByRole("navigation", { name: "Menu principal" }).first().innerText()).includes("Criador de Anúncios"), "item Criador de Anúncios no menu (Anúncios)");
  await page.evaluate(() => localStorage.removeItem("adsBuilder.rascunho"));
  await page.reload();
  const form = page.getByTestId("ads-form");
  await form.waitFor();

  // Validação: conta, campanha, conjunto, pasta e texto obrigatórios
  await page.getByRole("button", { name: "Gerar pedido" }).click();
  const errs = await page.getByTestId("ads-erros").innerText();
  check(["Informe a conta", "Informe a campanha", "Informe o conjunto", "pelo menos uma pasta", "pelo menos um texto"].every((m) => errs.includes(m)),
    "não gera sem conta, campanha, conjunto, pasta e texto");
  check(db.adsPedidos.length === 0, "nada guardado com erro");

  // 42.1 — Onde criar: cliente → BM → conta → campanha → conjunto (listas do CRM)
  await form.getByLabel("Cliente").locator("option").nth(2).waitFor({ state: "attached" });
  check((await form.getByLabel("Cliente").locator("option").allInnerTexts()).join("|") === "Escolha… (2)|Loja Aurora|Loja Brisa", "só clientes ativos na lista (encerrado não aparece)");
  await form.getByLabel("Cliente").selectOption({ label: "Loja Aurora" });
  check(await form.getByLabel("Business Manager (BM)").locator("option").allInnerTexts().then((o) => o.join("|")) === "Escolha…|BM Aurora|BM Aurora 2", "BMs do cliente");
  check(await form.getByLabel("Conta de anúncios").isDisabled(), "conta só depois de escolher a BM");
  await form.getByLabel("Business Manager (BM)").selectOption("BM Aurora");
  await form.getByLabel("Conta de anúncios").selectOption({ label: "Loja Aurora (act_111)" });
  await page.getByText("2 campanha(s); as ativas primeiro.").waitFor();
  check((await form.getByLabel("Campanha de destino").locator("option").allInnerTexts()).join("|") === "Escolha…|[MSG] Aurora | Outubro|[LEADS] Aurora (pausada)", "campanhas da conta, ativas primeiro e pausadas marcadas");
  await form.getByLabel("Campanha de destino").selectOption({ label: "[MSG] Aurora | Outubro" });
  await page.getByText("2 conjunto(s); os ativos primeiro.").waitFor();
  await form.getByLabel("Conjunto de destino").selectOption({ label: "Aberto 25-45" });
  await form.getByLabel("Cliente").selectOption({ label: "Loja Brisa" });
  check(await form.getByLabel("Conta de anúncios").inputValue() !== "" && await form.getByLabel("Campanha de destino").inputValue() === "", "trocar o cliente limpa o resto (cliente com uma só BM e conta já vem escolhido)");
  await form.getByLabel("Cliente").selectOption({ label: "Loja Aurora" });
  await form.getByLabel("Business Manager (BM)").selectOption("BM Aurora");
  await form.getByLabel("Conta de anúncios").selectOption({ label: "Loja Aurora (act_111)" });
  await page.getByText("2 campanha(s); as ativas primeiro.").waitFor();
  await form.getByLabel("Campanha de destino").selectOption({ label: "[MSG] Aurora | Outubro" });
  await page.getByText("2 conjunto(s); os ativos primeiro.").waitFor();
  await form.getByLabel("Conjunto de destino").selectOption({ label: "Aberto 25-45" });
  await page.getByTestId("ads-secao-1").screenshot({ path: `${SHOTS}/criador-anuncios-onde-criar.png` });
  await form.getByLabel("Página do Facebook").fill("Loja Aurora");
  await form.getByLabel("Perfil do Instagram").fill("@lojaaurora");

  // Mídia
  check((await page.getByTestId("ads-secao-2").innerText()).includes("permissão de leitura para o Claude"), "aviso fixo da permissão de leitura do Drive");
  await form.getByLabel("Link da pasta 1").fill("https://drive.google.com/drive/folders/verticais");
  await form.getByRole("button", { name: "adicionar pasta" }).click();
  await form.getByLabel("Link da pasta 2").fill("https://drive.google.com/drive/folders/feed");
  await form.getByLabel("Quantidade de anúncios").fill("2");
  await form.getByLabel("até").fill("ADS-02");

  // Textos: 2 textos + 1 título, mapeamento manual
  await form.getByLabel("Texto principal 1", { exact: true }).fill("Promoção de outubro!\nSó esta semana.");
  await form.getByRole("button", { name: "adicionar texto" }).click();
  await form.getByLabel("Texto principal 2", { exact: true }).fill("Frete grátis para todo o Brasil");
  await form.getByRole("button", { name: "adicionar título" }).click();
  await form.getByLabel("Título 1", { exact: true }).fill("Compre já");
  await form.getByLabel("Mapeamento manual").check();
  await page.getByTestId("ads-mapeamento").waitFor();
  check(await page.getByTestId("ads-mapeamento").locator("tbody tr").count() === 2, "tabela anúncio → texto/título com uma linha por anúncio");
  await form.getByLabel("Texto do anúncio 2").selectOption("2");

  // Destino e nome
  await form.getByLabel("Número do WhatsApp (com DDD)").fill("(11) 98765-4321");
  await form.getByLabel("Mensagem pré-preenchida").fill("Olá! Quero saber da promoção");
  await form.getByLabel("Tema").fill("Promo");
  await form.getByLabel("Data").fill("28-10-2026");
  check((await page.getByTestId("ads-nome-previa").innerText()) === "ADS-01 | Promo | 28-10-2026", "prévia do primeiro nome");

  // Segredo recusado
  await form.getByLabel("Observações (opcional)").fill("token: EAABwzLixnjYBAKZCZB1234567890abcdef");
  await page.getByRole("button", { name: "Gerar pedido" }).click();
  check((await page.getByTestId("ads-erros").innerText()).includes("Não coloque senhas, tokens nem dados de pagamento"), "token num campo é recusado");
  await form.getByLabel("Observações (opcional)").fill("Usar a copy aprovada pelo cliente.");

  // IA: ligar uma aparece destacado
  await form.getByRole("switch", { name: "Música automática" }).click();
  await page.screenshot({ path: `${SHOTS}/criador-anuncios-formulario.png`, fullPage: true });
  await page.getByRole("button", { name: "Gerar pedido" }).click();
  await page.getByTestId("ads-pedido").waitFor();
  const pedido = await page.getByTestId("ads-pedido").locator("pre").innerText();
  check(pedido.startsWith("Crie anúncios no Meta Ads com os dados abaixo.") && pedido.includes("Conta: Loja Aurora (act_111) | Campanha:")
    && pedido.includes("Cliente: Loja Aurora | BM: BM Aurora") && pedido.includes("Campanha: [MSG] Aurora | Outubro (ID 120001) | Conjunto: Aberto 25-45 (ID 130001)")
    && pedido.includes("Quantidade: 2 (faixa ADS-01 até ADS-02).") && pedido.includes("ADS-02 → texto 2, título 1")
    && pedido.includes("WhatsApp — número: (11) 98765-4321") && pedido.includes("(ex.: ADS-01 | Promo | 28-10-2026)")
    && pedido.includes("recursos de IA LIGADOS a pedido: Música automática") && pedido.includes("Crie PRIMEIRO apenas um anúncio"), "pedido gerado no formato, com a IA ligada destacada");
  await page.getByTestId("ads-copiar").click();
  check((await page.evaluate(() => navigator.clipboard.readText())) === pedido, "botão Copiar copia o pedido");
  check(db.adsPedidos.length === 1 && db.adsPedidos[0].campanha === "[MSG] Aurora | Outubro", "pedido guardado no histórico");
  await page.getByTestId("ads-pedido").screenshot({ path: `${SHOTS}/criador-anuncios-pedido.png` });

  // Modelos: salvar, limpar, carregar
  await page.getByRole("button", { name: "Salvar como modelo" }).click();
  await page.getByTestId("ads-salvar-modelo").getByLabel("Nome do modelo").fill("WhatsApp — Loja Aurora");
  await page.getByTestId("ads-salvar-modelo").getByRole("button", { name: "Salvar modelo" }).click();
  await page.getByTestId("ads-salvar-modelo").waitFor({ state: "detached" });
  check(db.adsModelos.length === 1 && db.adsModelos[0].dados.textos.length === 2, "modelo salvo com os dados");
  await page.getByRole("button", { name: "Limpar" }).click();
  check(await page.getByTestId("ads-form").getByLabel("Cliente").inputValue() === "", "Limpar zera o formulário");
  await page.getByRole("button", { name: "Carregar modelo" }).click();
  await page.getByRole("button", { name: "Carregar WhatsApp — Loja Aurora" }).click();
  check(await page.getByTestId("ads-form").getByLabel("Conjunto de destino").locator("option:checked").innerText() === "Aberto 25-45"
    && await page.getByTestId("ads-form").getByLabel("Texto principal 2", { exact: true }).inputValue() === "Frete grátis para todo o Brasil", "Carregar modelo preenche o formulário");

  // Histórico: copiar de novo e duplicar mudando o conjunto
  await page.getByRole("button", { name: "Histórico" }).click();
  await page.getByTestId("ads-historico-item").first().waitFor();
  check((await page.getByTestId("ads-historico-item").first().innerText()).includes("[MSG] Aurora | Outubro"), "histórico lista o pedido com data");
  await page.getByRole("button", { name: "Copiar de novo o pedido 1" }).click();
  check((await page.evaluate(() => navigator.clipboard.readText())) === pedido, "copiar de novo do histórico");
  await page.getByRole("button", { name: "Duplicar o pedido 1" }).click();
  await page.getByText("Duplicado do pedido de").waitFor();
  await page.getByText("2 conjunto(s); os ativos primeiro.").waitFor();
  await page.getByTestId("ads-form").getByLabel("Conjunto de destino").selectOption({ label: "Remarketing 7d" });
  await page.getByRole("button", { name: "Gerar pedido" }).click();
  await page.getByTestId("ads-pedido").waitFor();
  check(db.adsPedidos.length === 2 && db.adsPedidos[1].conjunto === "Remarketing 7d" && db.adsPedidos[1].origem_pedido_id === 1
    && db.adsPedidos[1].texto.includes("Conjunto: Remarketing 7d (ID 130002)") && db.adsPedidos[1].texto.includes("Frete grátis"), "duplicar reaproveita tudo e muda só o conjunto");
  // Digitar à mão (campanha criada agora no Meta)
  await page.getByRole("button", { name: "Digitar à mão" }).click();
  await page.getByTestId("ads-form").getByLabel("Conjunto de destino (nome completo)").fill("Conjunto novo");
  check(await page.getByTestId("ads-form").getByLabel("Conta de anúncios (nome ou ID)").inputValue() === "Loja Aurora (act_111)", "digitar à mão mantém o que já estava escolhido");
  await page.getByRole("button", { name: "Histórico" }).click();
  await page.getByTestId("ads-historico-item").nth(1).waitFor();
  await page.screenshot({ path: `${SHOTS}/criador-anuncios-historico.png` });
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Celular (operador)
{
  const { browser, page, errors } = await launch();
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await mockSupabase(page, { role: "operador" });
  seed(db);
  await login(page, "/criador-de-anuncios");
  await page.getByTestId("ads-form").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `celular: sem rolagem para os lados (${overflow}px)`);
  check(await page.getByRole("button", { name: "Gerar pedido" }).isVisible(), "celular: botão Gerar pedido visível (fixo embaixo)");
  await page.screenshot({ path: `${SHOTS}/criador-anuncios-celular.png` });
  check(errors.length === 0, `sem erros (celular) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Visualizador: sem acesso
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "visualizador" });
  await login(page, "/");
  await page.getByRole("navigation", { name: "Menu principal" }).first().waitFor();
  check(!(await page.getByRole("navigation", { name: "Menu principal" }).first().innerText()).includes("Criador de Anúncios"), "visualizador não vê o item no menu");
  await page.goto(`${BASE}/criador-de-anuncios`);
  await page.waitForTimeout(800);
  check(await page.getByTestId("ads-builder").count() === 0, "visualizador não entra pela URL");
  check(errors.length === 0, `sem erros (visualizador) ${errors.join(" | ")}`);
  await browser.close();
}
console.log("Criador de Anúncios (Etapa 42): tudo certo.");
