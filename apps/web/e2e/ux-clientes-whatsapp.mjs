/**
 * Teste de navegador — UX da lista "Clientes: site e/ou WhatsApp" (Tracking → Configurações): uma linha por cliente no computador,
 * cartão no celular, busca e filtros, lista grande (centenas de clientes) sem pesar. Servidor de WhatsApp e Supabase SIMULADOS.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const mk = (i) => `e0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const NOMES = ["Excalibur - Atacado", "Acollar", "Cravina (Matriz e Xique-Xique)", "Abraço de Algodão", "Acelera Atacado", "Loja Sem Número"];

function seed(db, total) {
  for (let i = 0; i < total; i++) {
    const id = mk(100 + i);
    const nome = i < NOMES.length ? NOMES[i] : `Cliente ${String(i + 1).padStart(3, "0")}`;
    db.clients.push(client(id, nome));
    if (i % 3 === 0) { // WhatsApp do servidor próprio em estados variados
      const cont = `t-${i}`;
      db.trackingContainers.push({ id: cont, client_id: id, kind: "whatsapp", name: "WhatsApp (sem site)", public_key: `bf_${String(i).padStart(24, "0")}`, allowed_domains: [],
        status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
      const estado = ["conectado", "aguardando_leitura", "desconectado", "erro"][(i / 3) % 4 | 0];
      db.whatsappConnections.push({ id: `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, container_id: cont, client_id: id, phone_number_id: `55819506${String(i).padStart(5, "0")}`, waba_id: null,
        enabled: estado === "conectado", last_webhook_at: estado === "conectado" ? new Date(Date.now() - 3600_000).toISOString() : null, last_error_at: null, last_error_message: null,
        mode: "nao_oficial", display_phone: `55819506${String(i).padStart(5, "0")}`, verified_name: null, has_inbound_key: true, inbound_key_hint: "abcd",
        instance_name: estado === "desconectado" ? null : `bf-${i}`, gateway_state: estado === "desconectado" ? null : estado, store_messages: i % 2 === 0, store_ack_at: i % 2 === 0 ? "2026-11-01T00:00:00Z" : null, ai_suggest: i % 4 === 0 });
    } else if (i % 3 === 1) { // só site
      db.trackingContainers.push({ id: `t-${i}`, client_id: id, kind: "site", name: `cliente${i}.com.br`, public_key: `bf_${String(i).padStart(24, "0")}`, allowed_domains: [`cliente${i}.com.br`],
        status: i % 2 ? "ativo" : "pausado", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
    }
  }
}

for (const [rotulo, w, h] of [["desktop", 1440, 900], ["celular", 390, 844]]) {
  const { browser, page, errors } = await launch();
  await page.setViewportSize({ width: w, height: h });
  const db = await mockSupabase(page, { role: "admin" });
  seed(db, 240);
  await login(page, "/tracking?secao=config");
  const lista = page.getByTestId("cli-site-whatsapp");
  await lista.waitFor();
  // lista grande: só 30 por vez, busca e filtros funcionam, sem barra de rolagem dentro da lista
  const linhas = lista.getByTestId("cli-site-whatsapp-row");
  check(await linhas.count() === 30, `${rotulo}: mostra 30 clientes por vez de 240`);
  await lista.getByRole("button", { name: /Mostrar mais/ }).click();
  check(await linhas.count() === 60, `${rotulo}: "Mostrar mais" soma mais 30`);
  await lista.getByLabel("Buscar cliente").fill("Cliente 150");
  check(await linhas.count() === 1, `${rotulo}: a busca acha o cliente no meio de 240`);
  await lista.getByLabel("Buscar cliente").fill("");
  await lista.getByRole("button", { name: /^Conectados/ }).click();
  check(await linhas.count() === 20 && await linhas.first().getByText("Funcionando").count() === 1, `${rotulo}: o filtro Conectados mostra só os 20 conectados`);
  await lista.getByRole("button", { name: /^Sem WhatsApp/ }).click();
  check(await linhas.first().getByText("Não ligado").count() >= 1, `${rotulo}: o filtro Sem WhatsApp mostra clientes sem WhatsApp`);
  await lista.getByRole("button", { name: /^Todos/ }).click();
  // uma linha só no computador: o WhatsApp (situação + botões) cabe numa linha
  if (w >= 1280) {
    const conectar = linhas.first().getByRole("button", { name: /Conectar o WhatsApp de/ });
    const caixa = await linhas.first().boundingBox();
    check(caixa.height < 70, `desktop: cada cliente ocupa uma linha só (altura ${Math.round(caixa.height)}px)`);
    void conectar;
  }
  await page.screenshot({ path: `${SHOTS}/ux-clientes-${rotulo}.png`, fullPage: false });
  await lista.screenshot({ path: `${SHOTS}/ux-clientes-${rotulo}-lista.png` });
  // recorte das primeiras linhas, em tamanho legível
  const caixas = await Promise.all([0, 1, 2, 3].map((n) => lista.getByTestId("cli-site-whatsapp-row").nth(n).boundingBox()));
  const x = Math.min(...caixas.map((c) => c.x)), y = Math.min(...caixas.map((c) => c.y)), x2 = Math.max(...caixas.map((c) => c.x + c.width)), y2 = Math.max(...caixas.map((c) => c.y + c.height));
  await page.screenshot({ path: `${SHOTS}/ux-clientes-${rotulo}-linhas.png`, clip: { x, y, width: x2 - x, height: Math.min(y2 - y, 760) }, fullPage: true });
  check(errors.length === 0, `${rotulo}: sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
console.log("shots em", SHOTS);
