/**
 * Teste de navegador — Tracking T4.2: ligar o WhatsApp pelo cadastro oficial do Meta (Coexistence), 25/10/2026.
 * Admin configura o app do Meta da agência em Integrações (segredo nunca volta para a tela), vê webhook/token/retorno;
 * no Tracking, "Ligar WhatsApp Business" → (Meta simulado) → página de retorno → número ligado; o formulário manual some.
 * Gestor sem o app configurado: sem botão, com aviso. Supabase SIMULADO (o Meta também).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004801";
const SECRET = "0123456789abcdef0123456789abcdef";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-coex", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234599", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/configuracoes/integracoes");
  const card = page.getByTestId("wa-app-card");
  await card.getByTestId("wa-app-status").waitFor();
  check((await card.getByTestId("wa-app-status").innerText()).includes("Falta configurar"), "card do WhatsApp (Coexistence) começa sem configurar");

  // Antes de configurar, o Tracking não mostra o botão (sem botão de mentira)
  await page.goto(`${BASE}/tracking`);
  await page.getByRole("button", { name: "WhatsApp API oficial: loja.com.br" }).click();
  const dlg = page.getByRole("dialog", { name: /WhatsApp — API oficial/ });
  await dlg.getByTestId("wa-coex-not-ready").waitFor();
  check(await dlg.getByRole("button", { name: "Ligar WhatsApp Business" }).count() === 0, "sem o app da agência: sem botão, com aviso");
  await page.goto(`${BASE}/configuracoes/integracoes`);

  await card.getByLabel("ID do app").fill("12a");
  await card.getByRole("button", { name: "Salvar" }).click();
  await card.getByText("O ID do app tem só números.").waitFor();
  await card.getByLabel("ID do app").fill("123456789012");
  await card.getByLabel("ID da configuração").fill("987654321098");
  await card.getByLabel(/Segredo do app/).fill(SECRET);
  await card.getByRole("button", { name: "Salvar" }).click();
  await card.getByText("já aparece no Tracking").waitFor();
  check((await card.getByTestId("wa-app-status").innerText()).includes("Pronto") && db.waApp.secret === SECRET, "app da agência salvo (segredo no cofre)");
  check(await card.getByLabel(/Segredo do app/).inputValue() === "" && !(await page.locator("body").innerText()).includes(SECRET), "o segredo some da tela e nunca é mostrado");
  const hook = await card.getByTestId("wa-app-webhook").innerText();
  check(hook.includes("/functions/v1/whatsapp-webhook?app=1") && hook.includes(db.waApp.verify_token) && hook.includes("/tracking/whatsapp/retorno"),
    "mostra webhook do app, token de verificação e endereço de retorno para colar no Meta");
  await page.screenshot({ path: `${SHOTS}/whatsapp-coexistence-app.png`, fullPage: true });

  // Tracking → Ligar WhatsApp Business → Meta (simulado) → retorno
  await page.goto(`${BASE}/tracking`);
  await page.getByRole("button", { name: "WhatsApp API oficial: loja.com.br" }).click();
  await dlg.getByRole("button", { name: "Ligar WhatsApp Business" }).click();
  await page.getByRole("heading", { name: "Ligando o WhatsApp" }).waitFor();
  await page.getByText("WhatsApp ligado: +55 45 3000-4242 (Loja Atacado)").waitFor();
  check(!page.url().includes("code="), "o código do Meta sai do endereço do navegador");
  const conn = db.whatsappConnections.find((w) => w.container_id === "t-coex");
  check(conn?.mode === "coexistencia" && conn.enabled, "número ligado por Coexistence");
  const start = db.functionCalls.find((c) => c.action === "coex_start");
  check(start?.redirectUri?.endsWith("/tracking/whatsapp/retorno") && start.containerId === "t-coex", "cadastro começa pelo site certo e volta para o Tracking");

  await page.getByRole("link", { name: "Voltar para o Tracking" }).click();
  await page.getByRole("button", { name: "WhatsApp API oficial: loja.com.br" }).click();
  await dlg.getByTestId("wa-coex-on").waitFor();
  check((await dlg.getByTestId("wa-coex-on").innerText()).includes("+55 45 3000-4242") && await dlg.getByLabel(/ID do número de telefone/).count() === 0,
    "ligado: mostra o número e esconde o formulário manual");
  check(await dlg.getByRole("button", { name: "Ligar de novo (trocar o número)" }).count() === 1, "dá para ligar de novo (trocar o número)");
  check(!(await dlg.getByTestId("wa-api-status").innerText()).includes("Falta o segredo"), "ligado por Coexistence não pede segredo por número (usa o do app da agência)");
  await page.screenshot({ path: `${SHOTS}/whatsapp-coexistence-ligado.png`, fullPage: true });
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Retorno sem código (cadastro cancelado no Meta)
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking/whatsapp/retorno?error=access_denied");
  await page.getByText("O cadastro foi cancelado no Meta.").waitFor();
  check(!db.functionCalls.some((c) => c.action === "coex_complete"), "cadastro cancelado: nada é enviado ao servidor");
  await browser.close();
}

{
  // Gestor: app ainda não configurado → aviso, sem botão; não abre as Integrações
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: CLI, created_at: "" });
  await login(page, "/tracking");
  await page.getByRole("button", { name: "WhatsApp API oficial: loja.com.br" }).click();
  await page.getByTestId("wa-coex-not-ready").waitFor();
  check(true, "gestor sem o app da agência configurado: aviso para falar com o administrador");
  db.waApp = { app_id: "123456789012", config_id: "987654321098", graph_version: "v23.0", secret: SECRET, verify_token: "x" };
  await page.reload();
  await page.getByRole("button", { name: "WhatsApp API oficial: loja.com.br" }).click();
  await page.getByRole("button", { name: "Ligar WhatsApp Business" }).waitFor();
  check(true, "gestor com o app pronto: pode ligar o WhatsApp do cliente");
  await browser.close();
}

console.log("WhatsApp por Coexistence (T4.2): tudo certo.");
