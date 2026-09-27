/**
 * Teste de navegador da Etapa 19.4 — logo do cliente e e-mail semanal (Resend).
 * Supabase SIMULADO (support.mjs): nenhum e-mail de verdade é enviado.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (o) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000001941";
const META = "a0000000-0000-4000-8000-000000001941";
// PNG de 1×1 pixel
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  db.adAccounts.push({ id: META, platform_id: "meta", external_id: "941", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null,
    connection_id: null, timezone: null, raw_status: null, status_reason: null, business_name: null, is_prepay: null, linked_at: "2026-09-01T12:00:00Z", details_updated_at: null, assets: [] });
  addMetric(db);
}
function addMetric(db) {
  db.metrics.push({ ad_account_id: META, client_id: EXC, platform_id: "meta", currency: "BRL", reach: null, level: "account", campaign_id: null,
    impressions: 10000, clicks: 300, link_clicks: 200, messages: null, conversions: null, conversion_value_micros: null, raw_actions: null,
    date: day(-2), spend_micros: 100 * M, leads: 10 });
}
const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  // Arquivo público da logo: devolve uma imagem de verdade (a rota mais nova vale primeiro).
  await page.route("**/storage/v1/object/public/client-logos/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PNG }));

  // --- Configurações → Integrações: remetente e chave (vai para o cofre)
  await login(page, "/configuracoes/integracoes");
  const sc = page.getByTestId("email-settings-card");
  await sc.waitFor();
  check((await sc.getByTestId("email-key-status").innerText()).includes("Nenhuma chave cadastrada"), "começa sem chave");
  check(await sc.getByRole("button", { name: "Enviar e-mail de teste" }).isDisabled(), "teste só depois de ter a chave");
  check((await sc.getByLabel("E-mail do remetente").inputValue()) === "relatorios@backstageflow.com.br", "remetente padrão preenchido");
  const keyInput = sc.getByLabel("Chave do Resend");
  check((await keyInput.getAttribute("type")) === "password", "campo da chave escondido (tipo senha)");
  await keyInput.fill("chave-errada");
  await sc.getByRole("button", { name: "Salvar" }).click();
  check((await sc.innerText()).includes('começa com "re_"'), "chave em formato errado: avisa antes de enviar");
  await keyInput.fill("re_TesteFalso_1234567890");
  await sc.getByLabel("Responder para (opcional)").fill("contato@agencia.com.br");
  await sc.getByRole("button", { name: "Salvar" }).click();
  await sc.getByText("A chave foi para o cofre").waitFor();
  check(db.emailKey === "re_TesteFalso_1234567890" && db.emailSettings.reply_to === "contato@agencia.com.br", "chave e resposta salvas no servidor");
  check((await sc.getByLabel("Trocar a chave do Resend (opcional)").inputValue()) === "", "a chave some da tela depois de salvar");
  check(!(await page.content()).includes("re_TesteFalso_1234567890"), "a chave não aparece em lugar nenhum da página");
  check(db.rpcCalls.find((c) => c.fn === "email_settings_save").p_api_key === "***", "(registro do teste sem a chave)");
  await sc.getByTestId("email-key-status").getByText("Chave guardada no cofre").waitFor();
  check(true, "mostra só que a chave existe");
  await sc.getByRole("button", { name: "Enviar e-mail de teste" }).click();
  await sc.getByText("E-mail de teste enviado para ander@teste.local").waitFor();
  check(db.emailsSent.at(-1).to === "ander@teste.local", "teste vai para o próprio admin");
  await sc.getByText("funcionou").waitFor();
  check(true, "resultado do último teste aparece");
  db.emailResult = "O domínio do remetente ainda não foi verificado no Resend.";
  await sc.getByRole("button", { name: "Enviar e-mail de teste" }).click();
  await sc.getByText("O domínio do remetente ainda não foi verificado no Resend.").first().waitFor();
  check(true, "erro do Resend explicado em português");
  db.emailResult = "ok";
  await page.screenshot({ path: `${SHOTS}/email-settings.png`, fullPage: true });

  // --- Logo no dashboard do cliente
  await page.goto(`${BASE}/clientes/${EXC}/dashboard`);
  await page.getByTestId("report-title").waitFor();
  check(await page.getByTestId("report-logo").count() === 0, "sem logo: nada no cabeçalho");
  await page.getByRole("button", { name: "Personalizar" }).click();
  const lf = page.getByTestId("logo-field");
  await lf.waitFor();
  await lf.getByLabel("Arquivo da logo").setInputFiles({ name: "logo.txt", mimeType: "text/plain", buffer: Buffer.from("oi") });
  check((await lf.innerText()).includes("Use uma imagem PNG, JPG ou WebP"), "arquivo que não é imagem: recusado");
  await lf.getByLabel("Arquivo da logo").setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: Buffer.alloc(1024 * 1024 + 1) });
  check((await lf.innerText()).includes("no máximo 1 MB"), "imagem acima de 1 MB: recusada");
  await lf.getByLabel("Arquivo da logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await lf.getByTestId("logo-preview").waitFor();
  const path1 = db.reportSettings.find((r) => r.client_id === EXC)?.logo_path;
  check(new RegExp(`^${EXC}/[a-z0-9]{12}\\.png$`).test(path1 ?? "") && db.storageObjects[path1], `logo enviada na pasta do cliente (${path1})`);
  check(db.reportSettings.find((r) => r.client_id === EXC).title === "Relatório de anúncios · Excalibur Fitness", "modelo criado com o título padrão");
  await lf.getByLabel("Arquivo da logo").setInputFiles({ name: "logo2.webp", mimeType: "image/webp", buffer: PNG });
  await page.waitForFunction((old) => document.querySelector("[data-testid=logo-preview]")?.getAttribute("src")?.includes(".webp") && !document.querySelector("[data-testid=logo-preview]")?.getAttribute("src")?.includes(old), path1);
  const path2 = db.reportSettings.find((r) => r.client_id === EXC).logo_path;
  check(path2.endsWith(".webp") && !db.storageObjects[path1] && db.storageObjects[path2], "trocar a logo apaga o arquivo antigo");
  // Salvar o modelo não perde a logo
  await page.getByLabel("Título", { exact: true }).fill("Resultados Excalibur");
  await page.getByRole("button", { name: "Salvar modelo" }).click();
  await page.getByTestId("report-logo").waitFor();
  check(db.reportSettings.find((r) => r.client_id === EXC).logo_path === path2, "salvar o modelo mantém a logo");
  check((await page.getByTestId("report-logo").getAttribute("src")).endsWith(`/storage/v1/object/public/client-logos/${path2}`), "logo no cabeçalho do dashboard (endereço público)");
  check((await page.getByTestId("report-logo").getAttribute("alt")) === "Logo Excalibur Fitness", "logo com texto alternativo");
  await page.waitForFunction(() => document.querySelector("[data-testid=report-logo]")?.naturalWidth > 0);
  check(true, "imagem da logo carrega");
  await page.screenshot({ path: `${SHOTS}/client-logo.png`, fullPage: true });

  // Logo no link secreto também
  const bytes = "A".repeat(43);
  db.portals[EXC] = { client_id: EXC, login_enabled: false, link_enabled: true, link_token: bytes, link_created_at: new Date().toISOString(), link_expires_at: null, link_last_used_at: null, link_uses: 0 };
  db.portalTokens[bytes] = EXC;
  await page.goto(`${BASE}/r/${bytes}`);
  await page.getByTestId("report-logo").waitFor();
  check(true, "logo aparece no link secreto");

  // Tirar a logo
  await page.goto(`${BASE}/clientes/${EXC}/dashboard`);
  await page.getByRole("button", { name: "Personalizar" }).click();
  await lf.getByRole("button", { name: "Tirar logo" }).click();
  await lf.getByText("Sem logo").waitFor();
  check(db.reportSettings.find((r) => r.client_id === EXC).logo_path === null && !db.storageObjects[path2], "tirar a logo apaga o arquivo");
  await page.keyboard.press("Escape");

  // --- E-mail semanal na página do cliente
  await page.goto(`${BASE}/clientes/${EXC}`);
  const ec = page.getByTestId("client-email-card");
  await ec.waitFor();
  const sw = ec.getByRole("switch", { name: "Enviar e-mail semanal" });
  check((await sw.getAttribute("aria-checked")) === "false", "começa desligado");
  check(await ec.getByRole("button", { name: "Enviar agora" }).isDisabled(), "\"Enviar agora\" só com destinatários salvos");
  check((await ec.getByTestId("email-login-off").innerText()).includes("login do cliente está desligado"), "avisa que o botão de login não vai enquanto o login estiver desligado");
  await sw.click();
  await ec.getByRole("button", { name: "Salvar" }).click();
  check((await ec.innerText()).includes("pelo menos um destinatário"), "ligar sem destinatário: avisa");
  await ec.getByLabel("Destinatários").fill("dono@excalibur.com.br, nao-e-email");
  await ec.getByRole("button", { name: "Salvar" }).click();
  check((await ec.innerText()).includes("E-mail inválido: nao-e-email"), "e-mail inválido: avisa qual");
  await ec.getByLabel("Destinatários").fill("Dono@Excalibur.com.br\nfinanceiro@excalibur.com.br, dono@excalibur.com.br");
  await ec.getByLabel("Dia").selectOption("5");
  await ec.getByLabel("Hora").selectOption("9");
  await ec.getByRole("button", { name: "Salvar" }).click();
  await ec.getByText("E-mail semanal salvo.").waitFor();
  const saved = db.clientEmails[EXC];
  check(saved.enabled && saved.weekday === 5 && saved.send_hour === 9 && saved.button === "login", "ligado, sexta às 09:00, botão de login");
  check(JSON.stringify(saved.recipients) === JSON.stringify(["dono@excalibur.com.br", "financeiro@excalibur.com.br"]), "destinatários limpos (minúsculas, sem repetidos)");
  check((await ec.innerText()).includes("America/Sao_Paulo"), "hora no fuso do cliente");

  // Teste: vai só para quem pediu
  await ec.getByRole("button", { name: "Enviar teste para mim" }).click();
  await ec.getByText("Teste enviado para ander@teste.local").waitFor();
  check(db.emailsSent.at(-1).to === "ander@teste.local" && db.emailsSent.at(-1).subject.startsWith("[Teste]"), "teste vai só para quem pediu, marcado [Teste]");
  // Enviar agora
  const before = db.emailsSent.length;
  page.once("dialog", (d) => d.accept());
  await ec.getByRole("button", { name: "Enviar agora" }).click();
  await ec.getByText("Enviado: 2 enviado(s).").waitFor();
  check(db.emailsSent.slice(before).map((e) => e.to).join(",") === "dono@excalibur.com.br,financeiro@excalibur.com.br", "um e-mail para cada destinatário");
  const log = ec.getByTestId("email-log");
  await log.waitFor();
  check(clean(await log.innerText()).includes("Enviado Enviado agora"), "histórico mostra o envio");
  check((await log.innerText()).includes("Teste"), "histórico mostra o teste");

  // Botão com link secreto: guardar o link atual
  await ec.getByLabel("Botão no e-mail").selectOption("link");
  const box = ec.getByTestId("email-link-box");
  await box.getByText("Nenhum link guardado").waitFor();
  check(true, "sem link guardado: explica");
  await box.getByLabel("Link secreto para o e-mail").fill(`${BASE}/r/${"B".repeat(43)}`);
  await box.getByRole("button", { name: "Guardar link" }).click();
  await ec.getByText("Este não é o link atual do cliente").waitFor();
  check(true, "link que não é o atual: recusado");
  await box.getByLabel("Link secreto para o e-mail").fill(`${BASE}/r/${bytes}`);
  await box.getByRole("button", { name: "Guardar link" }).click();
  await box.getByText("Link guardado e válido").waitFor();
  check(db.emailLinks[EXC] === bytes, "link atual guardado (no cofre, no servidor real)");
  check((await box.getByLabel("Link secreto para o e-mail").inputValue()) === "", "o link some do campo depois de guardar");
  db.portals[EXC].link_enabled = false;
  await page.reload();
  await ec.getByLabel("Botão no e-mail").selectOption("link");
  await ec.getByTestId("email-link-box").getByText("não vale mais").waitFor();
  check(true, "link desligado: avisa que o guardado não vale mais");

  // Semana sem números: não envia
  db.metrics = [];
  await ec.getByRole("button", { name: "Enviar teste para mim" }).click();
  await ec.getByText("Nada foi enviado: Sem dados de anúncios nesta semana").waitFor();
  check(true, "semana sem dados: nada é enviado (e fica no histórico)");

  // Erro do Resend
  addMetric(db);
  db.emailResult = "A chave do Resend foi recusada. Cole uma chave nova em Configurações → Integrações.";
  await ec.getByRole("button", { name: "Enviar teste para mim" }).click();
  await ec.getByText("A chave do Resend foi recusada").first().waitFor();
  check(true, "erro do envio explicado");
  await page.screenshot({ path: `${SHOTS}/client-email.png`, fullPage: true });

  // Remover a chave → aviso no card do cliente
  await page.goto(`${BASE}/configuracoes/integracoes`);
  page.once("dialog", (d) => d.accept());
  await sc.getByRole("button", { name: "Remover chave" }).click();
  await sc.getByText("Chave removida").waitFor();
  check(db.emailKey === null && !db.emailSettings.has_key, "chave removida");
  await page.goto(`${BASE}/clientes/${EXC}`);
  await ec.getByText("O envio ainda não foi configurado").waitFor();
  check(true, "sem chave: o card do cliente avisa");

  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// Visualizador: não vê o card de e-mail; gestor não vê o remetente
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, `/clientes/${EXC}`);
  await page.getByText("Dados cadastrais").waitFor();
  check(await page.getByTestId("client-email-card").count() === 0, "visualizador não vê o e-mail semanal");
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC, created_at: "" });
  await login(page, `/clientes/${EXC}`);
  await page.getByTestId("client-email-card").waitFor();
  check(await page.getByText("O envio ainda não foi configurado").count() === 0, "gestor não vê a configuração do remetente (só admin)");
  check(!(await page.getByRole("link", { name: "Integrações" }).count()), "gestor não abre Integrações");
  check(errors.length === 0, "sem erros (gestor)");
  await browser.close();
}
