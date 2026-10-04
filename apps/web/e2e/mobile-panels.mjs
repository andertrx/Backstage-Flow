/**
 * Teste de navegador — correção de 04/10 (2ª parte): no celular, os painéis que abrem pelos sininhos do topo
 * (Avisos do monitoramento e Notificações da Central) aparecem inteiros, sem cortar na lateral. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const until = async (page, fn, ms = 10000) => { for (let i = 0; i < ms / 200; i++) { if (await fn()) return true; await page.waitForTimeout(200); } return false; };

function seed(db) {
  const sector = db.opsSectors?.[0]?.id ?? null;
  db.opsMembers[USER_ID] = { primary: sector, secondary: [], job_title: "Gestor", active: true, joins_meetings: true, permissions: ["ops.access"] };
  db.monitorNotifications.push({ id: 1, user_id: USER_ID, kind: "resumo.diario", alert_id: null, link: "/monitoramento?aba=alertas",
    title: "Resumo do monitoramento: 3 alerta(s) aberto(s) com um título comprido para testar a quebra de linha", body: "Excalibur Fitness · Custo por resultado: alta de 150,0%.",
    read_at: null, created_at: ago(5) });
  db.opsNotifications.push({ id: 1, user_id: USER_ID, actor_id: USER_ID, kind: "tarefa.prazo", title: "Prazo amanhã: tarefa com um nome bem comprido para ocupar a linha toda",
    body: null, link: "/operacoes/tarefas", read_at: null, created_at: ago(5), dedupe_key: "x1" });
}

async function inside(page, testid, w, h, label) {
  const panel = page.getByTestId(testid);
  await panel.waitFor();
  await page.waitForTimeout(250);
  const b = await panel.boundingBox();
  check(b && b.x >= 0 && b.x + b.width <= w + 0.5 && b.y >= 0 && b.y + b.height <= h + 0.5,
    `${w}x${h}: ${label} inteiro na tela (x ${Math.round(b?.x)}–${Math.round((b?.x ?? 0) + (b?.width ?? 0))}, y ${Math.round(b?.y)}–${Math.round((b?.y ?? 0) + (b?.height ?? 0))})`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${w}x${h}: ${label} não cria rolagem lateral`);
}

for (const [w, h] of [[390, 664], [360, 560], [1366, 820]]) {
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await page.setViewportSize({ width: w, height: h });
  await login(page, "/");
  await page.getByTestId("monitor-bell").waitFor();
  await page.getByTestId("ops-bell").waitFor();

  await page.getByTestId("monitor-bell").click();
  await inside(page, "monitor-bell-panel", w, h, "painel de avisos do monitoramento");
  if (w < 1000) await page.screenshot({ path: `${SHOTS}/sino-monitoramento-celular-${w}.png` });
  await page.keyboard.press("Escape");
  await until(page, async () => (await page.getByTestId("monitor-bell-panel").count()) === 0);

  await page.getByTestId("ops-bell").click();
  await inside(page, "ops-bell-panel", w, h, "painel de notificações da Central");
  if (w < 1000) await page.screenshot({ path: `${SHOTS}/sino-central-celular-${w}.png` });
  if (w > 1000) {
    // No computador o painel continua pequeno, preso ao sininho (não ocupa a largura toda).
    const b = await page.getByTestId("ops-bell-panel").boundingBox();
    check(b.width < 400, `computador: painel com largura de caixinha (${Math.round(b.width)}px)`);
  }
  check(errors.length === 0, `sem erros (${w}x${h})`);
  await browser.close();
}
