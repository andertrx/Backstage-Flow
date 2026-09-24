/**
 * Teste: link de "esqueci minha senha" que chega na página inicial (?code=...)
 * precisa abrir a tela "Criar nova senha". Supabase SIMULADO.
 */
import { BASE, check, launch, mockSupabase } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
// O navegador que pediu a recuperação guarda o "verificador" do código (fluxo PKCE).
await page.addInitScript(() => {
  localStorage.setItem("sb-dkatllzkmlzpginuzvis-auth-token-code-verifier", JSON.stringify("verificador-de-teste/recovery"));
});
await page.goto(`${BASE}/?code=5349a5c6-2d13-4ed6-b1c1-1213c5da0336`);
await page.getByRole("heading", { name: "Criar nova senha" }).waitFor();
check(page.url().endsWith("/redefinir-senha"), "endereço muda para /redefinir-senha");
check(db.pkceExchanges === 1, "o código do e-mail é trocado por uma sessão");
check(true, "link que chega na página inicial abre a tela de nova senha");
check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();
console.log(`\nRecuperação de senha: tudo certo (${BASE}).`);
