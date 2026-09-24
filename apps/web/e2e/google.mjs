/**
 * Teste de navegador da Etapa 4 — Google Ads (login com Google e vínculo via MCC).
 * Supabase e Google SIMULADOS (support.mjs). Nenhuma credencial real é usada.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLIENT = {
  id: "66666666-6666-4666-8666-666666666666", name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null,
  phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false,
  created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null,
};

// ------------------------------------------------------------ servidor sem as chaves do Google
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.googleMissing = ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"];
  await login(page, "/configuracoes/integracoes");
  await page.getByText("Falta configurar o servidor para conectar o Google Ads:").waitFor();
  check(await page.getByRole("listitem").filter({ hasText: "GOOGLE_OAUTH_CLIENT_SECRET" }).first().isVisible(), "tela lista quais segredos faltam (só os nomes)");
  check(await page.getByRole("button", { name: "Conectar com o Google" }).isDisabled(), "botão fica desativado sem as chaves");
  await page.getByText("Como obter as chaves do Google (passo a passo)").click();
  check(await page.getByText("/configuracoes/integracoes/google/callback").first().isVisible(), "passo a passo mostra o endereço de retorno exato");
  await page.screenshot({ path: `${SHOTS}/30-google-sem-chaves.png`, fullPage: true });
  check(errors.length === 0, "nenhum erro de JavaScript (sem chaves): " + errors.join(" | "));
  await browser.close();
}

// ------------------------------------------------------------ fluxo completo
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push({ ...CLIENT });
  let googleUrl = null;
  await page.route("https://accounts.google.com/**", (route) => {
    googleUrl = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<h1>Página de login do Google (simulada)</h1>" });
  });

  await login(page, "/configuracoes/integracoes");
  await page.getByRole("button", { name: "Conectar com o Google" }).click();
  await page.getByText("Página de login do Google (simulada)").waitFor();
  check(googleUrl?.searchParams.get("redirect_uri") === `${BASE}/configuracoes/integracoes/google/callback`, "vai para o Google com o endereço de retorno certo");

  // Retorno com código inválido/expirado
  await page.goto(`${BASE}/configuracoes/integracoes/google/callback?code=codigo-velho&state=${"a".repeat(64)}`);
  await page.getByText("Autorização inválida ou expirada. Tente conectar de novo.").waitFor();
  check(true, "código expirado mostra mensagem amigável");

  // Usuário cancelou no Google
  await page.goto(`${BASE}/configuracoes/integracoes/google/callback?error=access_denied`);
  await page.getByText("A autorização foi cancelada no Google.").waitFor();
  check(true, "cancelamento no Google mostra mensagem clara");

  // Retorno válido
  await page.goto(`${BASE}/configuracoes/integracoes/google/callback?code=codigo-valido&state=${"a".repeat(64)}`);
  await page.getByText("Google Ads conectado com agencia@gmail.com.").waitFor();
  check(!page.url().includes("code="), "código some do endereço do navegador");
  const complete = db.adAccountCalls.filter((c) => c.action === "google_complete");
  check(complete.filter((c) => c.code === "codigo-valido").length === 1, "código é enviado uma única vez ao servidor");
  await page.screenshot({ path: `${SHOTS}/31-google-conectado.png` });
  await page.getByRole("link", { name: "Voltar para Integrações" }).click();
  await page.getByText("agencia@gmail.com", { exact: false }).first().waitFor();
  check(true, "conexão do Google aparece em Integrações");

  // Vincular conta via MCC
  await page.goto(`${BASE}/clientes/${CLIENT.id}`);
  await page.getByRole("heading", { name: "Contas Google Ads" }).waitFor();
  const googleCard = page.getByRole("region", { name: "Contas Google Ads" });
  await googleCard.getByRole("button", { name: "Vincular conta" }).click();
  const modal = page.getByRole("dialog", { name: "Vincular conta Google Ads" });
  await modal.getByText("Excalibur - Pesquisa").waitFor();
  check(await modal.getByText("ID 123-456-7890", { exact: false }).isVisible(), "Customer ID aparece no formato do Google");
  check(await modal.getByText("via MCC Agência", { exact: false }).isVisible(), "mostra por qual MCC a conta é acessada");
  check(await modal.getByText("Conta de teste", { exact: true }).isVisible(), "conta de teste é sinalizada");
  await page.screenshot({ path: `${SHOTS}/32-google-vincular.png` });
  await modal.getByRole("listitem").filter({ hasText: "Excalibur - Pesquisa" }).getByRole("button", { name: "Vincular" }).click();
  await modal.waitFor({ state: "detached" });
  const link = db.adAccountCalls.find((c) => c.action === "link");
  check(link.managerCustomerId === "9998887776", "vínculo envia a MCC ao servidor");
  await page.getByText("ID 123-456-7890", { exact: false }).waitFor();
  check(await page.getByText("MCC (conta administradora): MCC Agência").isVisible(), "página do cliente mostra a MCC");
  check(!(await page.getByText("Instagram:").isVisible()), "Google não mostra páginas/Instagram (não existe no Google)");
  await page.screenshot({ path: `${SHOTS}/33-cliente-com-google.png`, fullPage: true });

  check(errors.length === 0, "nenhum erro de JavaScript (fluxo Google): " + errors.join(" | "));
  await browser.close();
}

console.log("GOOGLE OK");
