/** Imagens das telas do Tracking (computador e celular) para conferir a organização visual. Supabase SIMULADO. */
import { launch, login, mockSupabase, SHOTS } from "./support.mjs";

const mk = (i) => `e0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });

for (const [rotulo, w, h] of [["desktop", 1440, 900], ["celular", 390, 844]]) {
  const { browser, page } = await launch();
  await page.setViewportSize({ width: w, height: h });
  const db = await mockSupabase(page, { role: "admin" });
  for (let i = 0; i < 3; i++) {
    const id = mk(300 + i);
    db.clients.push(client(id, ["Excalibur - Atacado", "Acollar", "Cravina (Matriz e Xique-Xique)"][i]));
    db.trackingContainers.push({ id: `t-${i}`, client_id: id, kind: "site", name: `cliente${i}.com.br`, public_key: `bf_${String(i).padStart(24, "0")}`, allowed_domains: [`cliente${i}.com.br`, `loja${i}.com.br`],
      status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  }
  await login(page, "/tracking?secao=config");
  await page.getByTestId("cli-site-whatsapp").waitFor();
  for (const [nome, sel] of [["clientes", "#cfg-clientes"], ["ferramentas", "#cfg-link"]]) {
    const el = page.locator(sel).first();
    if (await el.count()) { await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: `${SHOTS}/ux-tracking-${nome}-${rotulo}.png` }); }
  }
  await page.goto(`${process.env.E2E_BASE_URL}/tracking`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/ux-tracking-painel-${rotulo}.png`, fullPage: false });
  await browser.close();
}
console.log("ok");
