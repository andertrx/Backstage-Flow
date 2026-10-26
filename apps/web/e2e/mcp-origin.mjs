/**
 * Teste de navegador da Etapa 40.3 — o histórico da tarefa mostra o que foi feito pelo Claude (MCP).
 * O banco marca a origem "mcp" (testado em supabase/tests/etapa40_3_mcp_origem.sql); aqui a tela mostra o rótulo.
 * Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
const sector = db.opsSectors[0].id;
const t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, title: "Tarefa criada pelo Claude", description: null, client_id: null, sector_id: sector,
  priority: "media", start_date: null, due_date: null, effort_hours: null, visibility: "setor", tags: [], client_stage_id: null, mandatory: false,
  status_id: "nao_iniciado", people: [], version: 2, created_by: USER_ID, created_at: new Date().toISOString(), updated_at: "", completed_at: null,
  archived_at: null, demand_id: null, queue_column_id: null };
db.opsTasks.push(t);
db.opsActivity.push(
  { id: 900, task_id: t.id, client_id: null, action: "tarefa.criada", actor_id: USER_ID, origin: "mcp", before: null, after: { titulo: t.title }, created_at: "2026-10-26T20:00:00Z" },
  { id: 901, task_id: t.id, client_id: null, action: "tarefa.editada", actor_id: USER_ID, origin: "manual", before: null, after: {}, created_at: "2026-10-26T20:05:00Z" },
);
await login(page, `/operacoes/tarefas?tarefa=${t.id}`);
await page.getByText("via Claude (MCP)").first().waitFor();
const text = await page.locator("body").innerText();
check(text.includes("via Claude (MCP)"), "ação feita pelo MCP aparece com \"via Claude (MCP)\"");
check((text.match(/via Claude \(MCP\)/g) ?? []).length === 1, "ação feita na tela continua sem o rótulo");
await page.getByText("via Claude (MCP)").first().scrollIntoViewIfNeeded();
await page.screenshot({ path: `${SHOTS}/mcp-origem.png` });
check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();
console.log("Origem via MCP no histórico (Etapa 40.3): tudo certo.");
