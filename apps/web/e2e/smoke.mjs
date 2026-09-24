/**
 * Teste de fumaça no navegador (Etapa 1): login, sessão, menu, usuários, celular e logout.
 *
 * O Supabase é SIMULADO (veja support.mjs), então o teste não toca em dados reais.
 * Como rodar (com o site rodando em http://localhost:5173 — "npm run dev"):
 *   npm run e2e -w @backstage/web
 * As capturas de tela ficam em apps/web/test-results/.
 */
import { BASE, check, launch, mockSupabase, PASSWORD, SHOTS as SP } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page);
const functionCalls = db.functionCalls;

await page.goto(`${BASE}/campanhas`);
await page.waitForURL("**/login");
check(page.url().endsWith("/login"), "sem login, página protegida redireciona para /login");
await page.screenshot({ path: `${SP}/01-login.png` });

await page.getByLabel("E-mail").fill("ander@teste.local");
await page.getByLabel("Senha").fill("errada");
await page.getByRole("button", { name: "Entrar" }).click();
await page.getByText("E-mail ou senha incorretos.").waitFor();
check(true, "senha errada mostra mensagem amigável");
await page.screenshot({ path: `${SP}/02-login-erro.png` });

await page.getByLabel("Senha").fill(PASSWORD);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL("**/campanhas");
check(true, "após login volta para a página que tentou abrir");
await page.getByText("Esta área será desenvolvida na Etapa 9.").waitFor();

await page.getByRole("link", { name: "Dashboard" }).click();
await page.getByText("Olá, Ander!").waitFor();
check(true, "dashboard mostra saudação e papel");
const menu = await page.getByRole("navigation", { name: "Menu principal" }).first().innerText();
check(menu.includes("Configurações") && menu.includes("Logs"), "admin vê o menu completo");
await page.screenshot({ path: `${SP}/03-dashboard.png` });

await page.reload();
await page.getByText("Olá, Ander!").waitFor();
check(true, "sessão persiste após recarregar a página");

await page.getByRole("link", { name: "Configurações" }).click();
await page.waitForURL("**/configuracoes/usuarios");
await page.getByText("Maria Gestora").waitFor();
check(true, "lista de usuários carrega");
await page.screenshot({ path: `${SP}/04-usuarios.png` });

await page.getByRole("button", { name: "Novo usuário" }).click();
const dialog = page.getByRole("dialog", { name: "Novo usuário" });
await dialog.getByLabel("Nome completo").fill("João Operador");
await dialog.getByLabel("E-mail").fill("repetido@agencia.com");
await dialog.getByLabel("Papel").selectOption("operador");
await dialog.getByLabel("Senha inicial").fill("curta");
await dialog.getByRole("button", { name: "Criar usuário" }).click();
await dialog.getByText("A senha precisa ter pelo menos 8 caracteres.").waitFor();
check(functionCalls.length === 0, "senha curta é barrada antes de ir ao servidor");
await dialog.getByLabel("Senha inicial").fill("Operador2026");
await dialog.getByRole("button", { name: "Criar usuário" }).click();
await dialog.getByText("Já existe um usuário com este e-mail.").waitFor();
check(true, "erro do servidor aparece com mensagem amigável");
await page.screenshot({ path: `${SP}/05-novo-usuario-erro.png` });
await dialog.getByLabel("E-mail").fill("joao@agencia.com");
await dialog.getByRole("button", { name: "Criar usuário" }).click();
await dialog.waitFor({ state: "detached" });
const last = functionCalls.at(-1);
check(last.action === "create" && last.role === "operador" && last.email === "joao@agencia.com", "criação envia os dados certos ao servidor");

page.once("dialog", (d) => d.accept());
await page.getByRole("row", { name: /Excalibur/ }).getByRole("button", { name: "Reativar" }).click();
await page.waitForTimeout(300);
check(functionCalls.at(-1).action === "update" && functionCalls.at(-1).active === true, "reativar envia update active=true");
const selfBtn = page.getByRole("row", { name: /Ander Rodrigues/ }).getByRole("button", { name: "Desativar" });
check(await selfBtn.isDisabled(), "admin não consegue desativar a si mesmo pela tela");

// celular
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Abrir menu" }).click();
await page.screenshot({ path: `${SP}/06-celular-menu.png` });
await page.getByRole("link", { name: "Dashboard" }).last().click();
check(true, "menu funciona no celular");

await page.setViewportSize({ width: 1366, height: 820 });
await page.getByRole("button", { name: "Sair" }).click();
await page.waitForURL("**/login");
check(true, "logout volta para a tela de login");

await page.goto(`${BASE}/recuperar-senha`);
await page.screenshot({ path: `${SP}/07-recuperar-senha.png` });
check(errors.length === 0, "nenhum erro de JavaScript na página: " + errors.join(" | "));
await browser.close();
console.log("SMOKE OK");
