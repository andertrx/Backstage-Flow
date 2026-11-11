/**
 * Teste de navegador — Tracking T5.3: WhatsApp do cliente pelo servidor não oficial (08/11/2026).
 * Admin cria a conexão (desligada, com chave mostrada uma vez), vê o endereço do webhook, liga, e a situação muda quando chega mensagem.
 * Site com WhatsApp oficial não deixa usar o servidor. Operador e visualizador não configuram. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005301";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db, official = false) {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  if (official) db.whatsappConnections.push({ id: "c-oficial", container_id: "t-cont", client_id: CLI, phone_number_id: "109876543210", waba_id: "123456789012", enabled: true,
    last_webhook_at: null, last_error_at: null, last_error_message: null, mode: "manual", display_phone: null, verified_name: null });
}

{
  const { browser, page, errors } = await launch();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?secao=config");
  await page.getByRole("button", { name: "WhatsApp pelo servidor: loja.com.br" }).click();
  const modal = page.getByTestId("wa-server");
  await modal.waitFor();
  check(await modal.getByRole("button", { name: "Criar conexão" }).isDisabled(), "sem número, o botão criar fica travado");
  await modal.getByLabel("Número com DDD (só números)").fill("(45) 99999-8888");
  await modal.getByRole("button", { name: "Criar conexão" }).click();
  await page.getByTestId("wa-server-key").waitFor();
  const w = db.whatsappConnections[0];
  check(w && w.mode === "nao_oficial" && w.phone_number_id === "5545999998888" && w.enabled === false && w.waba_id === null && /^[0-9a-f]{48}$/.test(w.inbound_key),
    "conexão nova: modo não oficial, número com 55, desligada, sem conta oficial, com chave");
  const txt = await modal.innerText();
  check(txt.includes(`/functions/v1/wa-inbound?c=${w.id}`) && txt.includes(`&k=${w.inbound_key}`) && txt.includes("Servidor: desligado"), "mostra o endereço do webhook, a chave uma vez e a situação desligada");
  await modal.getByRole("button", { name: "Copiar: Chave (cabeçalho x-webhook-key)" }).click();
  check((await page.evaluate(() => navigator.clipboard.readText())) === w.inbound_key, "botão copia a chave");
  check(txt.includes("conta oficial") && txt.includes("conversa"), "avisa que sem a conta oficial o Meta recebe a venda como conversa");

  await modal.getByRole("checkbox", { name: "Ligado" }).click();
  await page.getByTestId("wa-server-status").getByText("aguardando mensagem").waitFor();
  check(w.enabled === true, "ligar muda a situação para aguardando mensagem");

  // Chegou uma mensagem (o servidor avisou o CRM)
  w.last_webhook_at = new Date().toISOString();
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.reload();
  await page.getByRole("button", { name: "WhatsApp pelo servidor: loja.com.br" }).click();
  await modal.waitFor();
  check(await page.getByTestId("wa-server-key").count() === 0 && (await modal.innerText()).includes(`••••${w.inbound_key_hint}`), "reaberto: a chave não aparece mais");
  check((await page.getByTestId("wa-server-status").innerText()).includes("funcionando"), "com mensagem recebida: funcionando");
  // Guardar as conversas (opt-in, sem prazo, só depois de confirmar o aviso de privacidade — T5.7)
  const store = modal.getByRole("checkbox", { name: "Guardar as conversas deste WhatsApp" });
  check(w.store_messages !== true && await store.isChecked() === false, "guardar as conversas nasce desligado");
  await store.click();
  await page.getByTestId("wa-store-ack").waitFor();
  check(w.store_messages !== true, "ligar abre o aviso e ainda não liga");
  check((await page.getByTestId("wa-store-ack").innerText()).includes("Política de Privacidade"), "o aviso traz o texto pronto para o cliente usar");
  check(await page.getByTestId("wa-store-ack").getByRole("button", { name: "Confirmar e ligar" }).isDisabled(), "sem marcar a confirmação não liga");
  await page.getByTestId("wa-store-ack").getByRole("checkbox").check();
  await page.getByTestId("wa-store-ack").getByRole("button", { name: "Confirmar e ligar" }).click();
  await page.waitForFunction(() => document.body.textContent.includes("Guarda das conversas ligada."));
  check(w.store_messages === true && Boolean(w.store_ack_at), "liga a guarda e registra o aceite do aviso");
  // IA que sugere vendas: por WhatsApp, nasce desligada e só liga com as conversas guardadas
  const aiBox = modal.getByRole("checkbox", { name: "IA que sugere vendas neste WhatsApp" });
  check(w.ai_suggest !== true && await aiBox.isChecked() === false && await aiBox.isEnabled(), "IA por WhatsApp nasce desligada e liberada (conversas já guardadas)");
  await aiBox.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="wa-server-ai"] input')?.checked === true);
  check(w.ai_suggest === true, "liga a IA só para este WhatsApp");
  await aiBox.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="wa-server-ai"] input')?.checked === false);
  check(w.ai_suggest === false, "desliga a IA deste WhatsApp");
  // T5.23: período do histórico e limpeza dos dados de conversa (só administrador, com dupla confirmação)
  const per = modal.getByLabel("Período do histórico a guardar");
  check(await per.inputValue() === "todo", "conexão antiga: histórico sem limite (como era)");
  await per.selectOption("180");
  await page.waitForFunction(() => document.querySelector('[data-testid="wa-history-days"] select')?.value === "180");
  check(w.history_days === 180, "6 meses (180 dias) grava os dias do histórico");
  // T5.27: qualquer quantidade de dias
  await per.selectOption("outro");
  const aplicar = modal.getByRole("button", { name: "Aplicar" });
  await modal.getByLabel("Quantidade de dias do histórico").fill("0");
  check(await aplicar.isDisabled(), "quantidade inválida não aplica");
  await modal.getByLabel("Quantidade de dias do histórico").fill("500");
  await aplicar.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="wa-history-custom"] input')?.value === "500");
  check(w.history_days === 500, "outra quantidade de dias (500) grava no histórico");
  db.waMessages.push({ id: 1 }, { id: 2 }, { id: 3 });
  db.waPeople.push({ id: 1 });
  await modal.getByRole("button", { name: "Limpar dados deste cliente" }).click();
  const lm = page.getByTestId("wa-limpar-modal");
  await lm.waitFor();
  check((await lm.innerText()).includes("3 mensagem(ns)") && (await lm.innerText()).includes("1 pessoa(s)") && (await lm.innerText()).includes("13 conversa(s)"), "passo 1: mostra o que será apagado e o que fica");
  await lm.getByRole("button", { name: "Cancelar" }).click();
  check((db.waLimpezas ?? []).length === 0 && db.waMessages.length === 3, "cancelar não apaga nada");
  await modal.getByRole("button", { name: "Limpar dados deste cliente" }).click();
  await lm.getByRole("button", { name: "Continuar" }).click();
  check((await lm.innerText()).includes("quer mesmo apagar"), "passo 2: pergunta de novo");
  await page.screenshot({ path: `${process.env.SHOTS_DIR ?? "test-results"}/wa-limpar-confirmar.png` });
  await lm.getByRole("button", { name: "Sim, apagar tudo" }).click();
  await page.waitForFunction(() => document.body.textContent.includes("Apagado: 3 mensagem(ns)"));
  check(db.waMessages.length === 0 && db.waPeople.length === 0 && db.waLimpezas.length === 1, "confirmando duas vezes, apaga");
  const old = w.inbound_key;
  page.once("dialog", (d) => d.accept());
  await modal.getByRole("button", { name: "Gerar nova chave" }).click();
  await page.getByTestId("wa-server-key").waitFor();
  check(w.inbound_key !== old, "gerar nova chave troca a chave");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
{
  // Site com WhatsApp oficial: não usa o servidor, e o botão da API oficial segue no lugar
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db, true);
  await login(page, "/tracking?secao=config");
  await page.getByRole("button", { name: /WhatsApp API oficial/ }).waitFor();
  await page.waitForTimeout(500);
  check(await page.getByRole("button", { name: "WhatsApp pelo servidor: loja.com.br" }).count() === 0 && await page.getByRole("button", { name: /WhatsApp API oficial/ }).count() === 1,
    "com API oficial ligada: só o botão da API oficial");
  await browser.close();
}
{
  for (const role of ["operador", "visualizador"]) {
    const { browser, page } = await launch();
    const db = await mockSupabase(page, { role });
    seed(db);
    await login(page, "/tracking?secao=config");
    await page.getByTestId("wa-connection-row").waitFor();
    await page.waitForTimeout(500);
    check(await page.getByRole("button", { name: "WhatsApp pelo servidor: loja.com.br" }).count() === 0, `${role} não configura o WhatsApp pelo servidor`);
    await browser.close();
  }
}
{
  // T5.26: "Por cliente": cada cliente pode ter só WhatsApp, só site, ou os dois
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  const SO_WA = "e0000000-0000-4000-8000-000000005302", SO_SITE = "e0000000-0000-4000-8000-000000005303";
  db.clients.push(client(CLI, "Loja Os Dois"), client(SO_WA, "Loja Só WhatsApp"), client(SO_SITE, "Loja Só Site"));
  await login(page, "/tracking?secao=config");
  const lista = page.getByTestId("cli-site-whatsapp");
  await lista.waitFor();
  const linha = (nome) => lista.getByTestId("cli-site-whatsapp-row").filter({ hasText: nome });
  check((await linha("Loja Só WhatsApp").innerText()).includes("sem site") && (await linha("Loja Só WhatsApp").innerText()).includes("não ligado"), "cada cliente mostra o site e o WhatsApp separados");

  // 1) só WhatsApp: sem cadastrar site
  await linha("Loja Só WhatsApp").getByRole("button", { name: /Ligar WhatsApp/ }).click();
  const modal = page.getByTestId("wa-server");
  await modal.waitFor();
  check(db.trackingContainers.length === 1 && db.trackingContainers[0].kind === "whatsapp" && db.trackingContainers[0].allowed_domains.length === 0, "só WhatsApp: cria o recipiente técnico, sem domínio");
  await modal.getByLabel("Número com DDD (só números)").fill("(45) 99999-1234");
  await modal.getByRole("button", { name: "Criar conexão" }).click();
  await page.getByTestId("wa-server-key").waitFor();
  check(db.whatsappConnections.length === 1 && db.whatsappConnections[0].client_id === SO_WA && db.whatsappConnections[0].mode === "nao_oficial", "o WhatsApp é ligado sem site");
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  // T5.28: o botão de limpar os dados está na própria linha do cliente (administrador)
  await linha("Loja Só WhatsApp").getByRole("button", { name: "Limpar dados deste cliente" }).waitFor();
  check(await linha("Loja Só Site").getByRole("button", { name: "Limpar dados deste cliente" }).count() === 0, "limpar dados aparece na linha só de quem tem WhatsApp ligado");
  await linha("Loja Só WhatsApp").getByRole("button", { name: "Limpar dados deste cliente" }).click();
  await page.getByTestId("wa-limpar-modal").waitFor();
  await page.getByTestId("wa-limpar-modal").getByRole("button", { name: "Cancelar" }).click();
  check(true, "limpar dados pela linha do cliente abre a confirmação");

  // 2) só site: sem WhatsApp
  await linha("Loja Só Site").getByRole("button", { name: /Adicionar site/ }).click();
  const form = page.getByRole("dialog").last();
  await form.getByLabel(/Domínios autorizados/).fill("lojasosite.com.br");
  await form.getByLabel("Nome do site *").fill("lojasosite.com.br").catch(() => {});
  await form.getByRole("button", { name: /Salvar|Criar/ }).click();
  await page.waitForFunction(() => document.body.textContent.includes("lojasosite.com.br"));
  check(db.trackingContainers.some((c) => c.client_id === SO_SITE && c.kind !== "whatsapp") && !db.whatsappConnections.some((w) => w.client_id === SO_SITE), "só site: cadastra o site e o WhatsApp continua não ligado");

  // 3) o recipiente técnico nunca aparece como site
  const sitesSecao = page.locator("#cfg-sites");
  check(!(await sitesSecao.innerText()).includes("WhatsApp (sem site)"), "o recipiente técnico não aparece na lista de sites");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
{
  // T5.26: configuração por cliente (um lugar só) e cliques no número x no grupo, separados
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push(client(CLI, "Loja Os Dois"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null, kind: "site" });
  const at = new Date().toISOString();
  db.trackingEvents.push(
    { event_id: "c1", container_id: "t-cont", client_id: CLI, event_name: "Contact", occurred_at: at, page_path: "/", test: false, touchpoint_id: null, custom_data: { canal: "whatsapp" } },
    { event_id: "c2", container_id: "t-cont", client_id: CLI, event_name: "Contact", occurred_at: at, page_path: "/", test: false, touchpoint_id: null, custom_data: { canal: "whatsapp" } },
    { event_id: "c3", container_id: "t-cont", client_id: CLI, event_name: "Contact", occurred_at: at, page_path: "/vip", test: false, touchpoint_id: null, custom_data: { canal: "whatsapp_grupo" } },
  );
  await login(page, "/tracking?secao=config");
  await page.getByTestId("cliente-detalhe").first().waitFor();
  const det = await page.getByTestId("cliente-detalhe").first().innerText();
  check(det.includes("Loja Os Dois") && det.includes("loja.com.br") && await page.getByTestId("wa-connections").count() === 1, "configuração por cliente: site e WhatsApp do cliente no mesmo bloco");
  check(await page.locator("#cfg-sites").count() === 1 && await page.locator("#cfg-whatsapp").count() === 1 && await page.getByTestId("section-index").count() === 1, "âncoras antigas e índice continuam");
  await page.goto(page.url().split("/").slice(0, 3).join("/") + "/tracking?aba=whatsapp");
  const ch = page.getByTestId("wa-click-channels");
  await ch.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="wa-clicks-numero"]')?.textContent.includes("2"));
  check((await ch.getByTestId("wa-clicks-numero").innerText()).includes("2") && (await ch.getByTestId("wa-clicks-grupo").innerText()).includes("1"), "cliques separados: 2 no número e 1 no grupo");
  check((await ch.innerText()).includes("não é identificado"), "avisa que quem entra no grupo não é identificado");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
console.log("\nWhatsApp pelo servidor (T5.3): tudo certo.");
