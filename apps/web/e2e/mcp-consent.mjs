/**
 * Teste de navegador da Etapa 40 — tela de autorização do servidor MCP (/oauth/consent), 26/10/2026.
 * Um programa de IA (ex.: Claude Code) pede acesso: sem login vai para o login e volta; mostra quem pede e as regras
 * (só leitura); Permitir e Recusar devolvem para o programa; pedido vencido mostra aviso; papel cliente não pode permitir.
 * Supabase SIMULADO (o servidor de login também).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const RET = `${BASE}/retorno-ia-teste`;

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.oauthRequests["autoriza-0001"] = { client: "Claude Code", redirect_uri: RET };
  db.oauthRequests["autoriza-0002"] = { client: "Claude Code", redirect_uri: RET };

  // Sem login: vai para o login e volta para a autorização
  await login(page, "/oauth/consent?authorization_id=autoriza-0001");
  const box = page.getByTestId("oauth-consent");
  await box.getByRole("button", { name: "Permitir" }).waitFor();
  const txt = await box.innerText();
  check(txt.includes("Claude Code") && txt.includes("ander@teste.local"), "mostra o programa de IA e a conta que está autorizando");
  check((await box.getByTestId("oauth-consent-rules").innerText()).includes("Só leitura"), "deixa claro: só leitura, vê o mesmo que no CRM");
  await page.screenshot({ path: `${SHOTS}/mcp-autorizacao.png`, fullPage: true });

  await box.getByRole("button", { name: "Permitir" }).click();
  await page.waitForURL(/retorno-ia-teste\?code=codigo-teste/);
  check(db.oauthDecisions.some((d) => d.id === "autoriza-0001" && d.action === "approve"), "Permitir registra a autorização e devolve o código ao programa de IA");

  // Recusar
  await page.goto(`${BASE}/oauth/consent?authorization_id=autoriza-0002`);
  await box.getByRole("button", { name: "Recusar" }).click();
  await page.waitForURL(/retorno-ia-teste\?error=access_denied/);
  check(db.oauthDecisions.some((d) => d.id === "autoriza-0002" && d.action === "deny"), "Recusar avisa o programa de IA (access_denied)");

  // Já autorizado antes: volta direto
  await page.goto(`${BASE}/oauth/consent?authorization_id=autoriza-0001`);
  await page.waitForURL(/retorno-ia-teste\?code=codigo-teste/);
  check(true, "pedido já autorizado volta direto para o programa de IA");

  // Pedido vencido ou endereço mexido
  await page.goto(`${BASE}/oauth/consent?authorization_id=nao-existe-123`);
  await box.getByText("expirou ou não existe").waitFor();
  await page.goto(`${BASE}/oauth/consent?authorization_id=<script>`);
  await box.getByText("Pedido de autorização inválido").waitFor();
  check(await box.getByRole("button", { name: "Permitir" }).count() === 0, "pedido vencido ou inválido: só o aviso, sem botão");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Papel cliente: não pode usar o MCP (o servidor também bloqueia)
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "cliente" });
  db.oauthRequests["autoriza-0003"] = { client: "Claude Code", redirect_uri: RET };
  await login(page, "/oauth/consent?authorization_id=autoriza-0003");
  const box = page.getByTestId("oauth-consent");
  await box.getByText("Seu tipo de usuário não pode usar o MCP").waitFor();
  check(await box.getByRole("button", { name: "Permitir" }).count() === 0 && await box.getByRole("button", { name: "Recusar" }).count() === 1,
    "cliente: sem botão Permitir, só Recusar");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}
console.log("Tela de autorização do MCP (Etapa 40): tudo certo.");
