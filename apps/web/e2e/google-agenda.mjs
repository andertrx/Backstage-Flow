/** Teste de navegador da 46.1 — conectar o Google Agenda de cada pessoa (Reuniões e Minha conta). Google SIMULADO. */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  await login(page, "/reunioes");
  const card = page.getByTestId("google-agenda-card");
  await card.waitFor();
  check((await card.innerText()).includes("Não conectado") && (await card.innerText()).includes("Conectar minha agenda do Google"), "Reuniões mostra o cartão Google Agenda, ainda não conectado");
  await page.screenshot({ path: `${SHOTS}/google-agenda-reunioes.png` });

  // conectar: o "Google" devolve para a página de retorno e a conexão é concluída
  await card.getByRole("button", { name: "Conectar minha agenda do Google" }).click();
  await page.waitForURL("**/google-agenda/retorno");
  await page.getByText("Google Agenda conectado com ander@empresa.com.br.").waitFor();
  check(!page.url().includes("code="), "o código de autorização sai do endereço do navegador");
  check(db.functionCalls.filter((c) => c.fn === "google-agenda" && c.action === "complete").length === 1, "o código é enviado uma vez só");
  await page.getByRole("link", { name: "Voltar para Reuniões" }).click();
  await page.waitForURL("**/reunioes");
  const c2 = page.getByTestId("google-agenda-card");
  await c2.getByTestId("google-agenda-conectado").waitFor();
  check((await c2.innerText()).includes("Conectado") && (await c2.innerText()).includes("ander@empresa.com.br") && (await c2.innerText()).includes("nunca a sua senha"), "depois de conectar: mostra a conta e explica que a senha nunca é vista");

  // também em Minha conta
  await page.goto(`${BASE}/minha-conta`);
  await page.getByTestId("google-agenda-card").waitFor();
  check((await page.getByTestId("google-agenda-card").innerText()).includes("ander@empresa.com.br"), "Minha conta também mostra a conexão");

  // desconectar
  await page.getByRole("button", { name: "Desconectar" }).click();
  await page.getByText("Agenda desconectada. A chave de acesso foi apagada do cofre.").waitFor();
  check(db.gcal.conexao.status === "desconectada", "desconectar muda o estado");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

// cancelou no Google, estado inválido e servidor sem o login do Google
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  await login(page, "/reunioes");
  await page.getByTestId("google-agenda-card").waitFor();
  await page.goto(`${BASE}/google-agenda/retorno?error=access_denied`);
  await page.getByText("A autorização foi cancelada no Google.").waitFor();
  check(true, "cancelar no Google mostra o aviso");
  await page.goto(`${BASE}/google-agenda/retorno?code=zzzzzzzzzzzz&state=${"b".repeat(64)}`);
  await page.getByText("Autorização inválida ou expirada. Tente conectar de novo.").waitFor();
  check(db.gcal.conexao === null, "estado desconhecido não conecta nada");
  db.gcal.configured = false;
  await page.goto(`${BASE}/reunioes`);
  const card = page.getByTestId("google-agenda-card");
  await card.getByText("O login do Google ainda não foi configurado no servidor.").waitFor();
  check(await card.getByRole("button", { name: "Conectar minha agenda do Google" }).isDisabled(), "sem o login do Google configurado, o botão fica desligado");
  await browser.close();
}

// cliente e vendedor não usam a Central: sem o cartão em Minha conta
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "cliente" });
  await login(page, "/minha-conta");
  await page.getByText("Dados pessoais").waitFor();
  check(await page.getByTestId("google-agenda-card").count() === 0, "cliente não vê o Google Agenda");
  await browser.close();
}
console.log("OK: google-agenda");
