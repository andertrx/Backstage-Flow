/** Teste de navegador da 43.3 — Integrações em seções e "o que cada papel vê no menu" em Papéis e permissões. Supabase SIMULADO. */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const { browser, page, errors } = await launch();
await mockSupabase(page, { role: "admin" });
await login(page, "/configuracoes/integracoes");
const ind = page.getByTestId("integracoes-indice");
await ind.waitFor();
check((await ind.innerText()).replace(/\s+/g, " ").includes("Anúncios Comunicação Dados"), "índice com as 3 seções");
const com = page.getByTestId("secao-comunicacao");
check(await com.getByTestId("wa-gateway-card").count() === 1 && await com.getByTestId("wa-avisos-card").count() === 1, "WhatsApp e avisos ficam em Comunicação");
check(await page.getByTestId("secao-dados").innerText().then((t) => t.includes("Google Sheets") || t.includes("planilha")), "Sheets fica em Dados");
await page.screenshot({ path: `${SHOTS}/integracoes-secoes.png` });

await page.goto(page.url().replace("/integracoes", "/permissoes"));
const cards = page.getByTestId("role-card");
await cards.first().waitFor();
const txt = async (role) => (await page.locator(`[data-testid="role-card"][data-role="${role}"]`).innerText()).replace(/\s+/g, " ");
const admin = await txt("admin"), vis = await txt("visualizador"), eq = await txt("equipe"), cli = await txt("cliente");
check(admin.includes("Configurações") && admin.includes("Central de Operações (sempre)"), "administrador: tudo e Central sempre");
check(!vis.includes("Relatórios") && vis.includes("Monitoramento"), "visualizador: sem Relatórios, com Monitoramento");
check(eq.includes("só com a permissão da Central"), "equipe: Central só com a permissão");
check(cli.includes("área do cliente"), "cliente: visão simplificada");
await page.screenshot({ path: `${SHOTS}/papeis-menu.png`, fullPage: true });
check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();
console.log("OK: organizacao");
