/**
 * Edge Function: sheets (Etapa 39.1 — Inteligência de Resultados)
 *
 * Lê as planilhas do Google Sheets com a conta de serviço do Google (chave no
 * cofre do Supabase). Nesta fase só serve à configuração; nada é gravado além
 * do resultado do teste da chave.
 *
 * Ações (POST com JSON):
 *   test_settings                                     → admin: confere a chave no Google
 *   inspect { clientId, url }                         → admin/gestor: título e abas da planilha
 *   preview { clientId, spreadsheetId, sheet, headerRow }
 *                                                     → admin/gestor: cabeçalho e as 20 primeiras linhas
 *   column_values { clientId, spreadsheetId, sheet, headerRow, column }
 *                                                     → admin/gestor: valores distintos de uma coluna (para as regras de perfil)
 *   read_now { sourceId }                             → admin/gestor/operador: lê a planilha agora (botão "Atualizar agora")
 *   scheduled                                         → agendador do banco (senha interna): lê as planilhas ligadas
 *                                                       (8h, 12h e 16h de Brasília)
 *
 * Etapa 39.2: a leitura guarda só a ÚLTIMA leitura de cada planilha (ri_snapshots),
 * trocada a cada leitura boa. Telefone/e-mail viram impressão digital (SHA-256);
 * nada legível é guardado. Se a leitura falhar, a última leitura boa continua.
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildRead } from "../../../packages/shared/src/results/read.ts";
import { distinctValues, parseSpreadsheetId, type RiMapping } from "../../../packages/shared/src/results/sheets.ts";
import { adminClient, requireRole, userClient } from "../_shared/auth.ts";
import { accessToken, parseServiceAccount, quoteSheet, type ServiceAccount, SheetsClient, SheetsError, splitHeader } from "../_shared/google/sheets.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";

const PREVIEW_ROWS = 20;
const sheet = z.string().trim().min(1).max(100);
const target = { clientId: z.string().uuid(), spreadsheetId: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/), sheet, headerRow: z.number().int().min(1).max(50) };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test_settings") }),
  z.object({ action: z.literal("inspect"), clientId: z.string().uuid(), url: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("preview"), ...target }),
  z.object({ action: z.literal("column_values"), ...target, column: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("read_now"), sourceId: z.string().uuid() }),
  z.object({ action: z.literal("scheduled") }),
]);

interface SourceRow {
  id: string;
  client_id: string;
  spreadsheet_id: string;
  sheet_name: string;
  header_row: number;
  mapping: RiMapping;
}
const SOURCE_COLUMNS = "id, client_id, spreadsheet_id, sheet_name, header_row, mapping";

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ReadResult = { sourceId: string; status: "ok"; rows: number } | { sourceId: string; status: "ocupada" } | { sourceId: string; status: "erro"; detail: string };

/** Lê a planilha e troca a última leitura. Nunca apaga a leitura anterior quando falha. */
async function readSource(db: SupabaseClient, client: SheetsClient, source: SourceRow, trigger: "agendada" | "manual"): Promise<ReadResult> {
  const { data: claimed, error: claimError } = await db.rpc("ri_read_claim", { p_source_id: source.id });
  if (claimError) throw new AppError(500, "DB_ERROR", "Não conseguimos reservar a planilha para leitura.", claimError);
  if (!claimed) return { sourceId: source.id, status: "ocupada" };
  try {
    const values = await client.values(source.spreadsheet_id, `${quoteSheet(source.sheet_name)}!A${source.header_row}:ZZ`);
    const { headers, rows } = splitHeader(values);
    const missing = Object.values(source.mapping).filter((h) => h && !headers.includes(h));
    if (!source.mapping.profile || !headers.includes(source.mapping.profile)) {
      throw new AppError(400, "SHEETS_COLUMN_NOT_FOUND", `A coluna SQL "${source.mapping.profile ?? ""}" não existe mais na planilha. Confira a configuração.`);
    }
    // Contato vira impressão digital por cliente (o mesmo telefone em clientes diferentes não se cruza).
    const read = await buildRead(headers, rows, source.mapping, source.header_row, (c) => sha256Hex(`${source.client_id}:${c}`));
    const { error } = await db.rpc("ri_read_store", {
      p_source_id: source.id, p_trigger: trigger, p_rows: read.rows, p_stats: { ...read.stats, missingColumns: missing },
    });
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos guardar a leitura da planilha.", error);
    return { sourceId: source.id, status: "ok", rows: read.rows.length };
  } catch (err) {
    const app = toApp(err);
    const message = app instanceof AppError ? app.userMessage : "Falha inesperada ao ler a planilha.";
    await db.rpc("ri_read_fail", { p_source_id: source.id, p_error: message });
    await recordError({ source: "servidor", code: app instanceof AppError ? app.code : "SHEETS_READ_FAILED", technical: err,
      clientId: source.client_id, context: { funcao: "sheets", planilha: source.id, origem: trigger } });
    return { sourceId: source.id, status: "erro", detail: message };
  }
}

async function loadAccount(db: SupabaseClient): Promise<ServiceAccount> {
  const { data, error } = await db.rpc("sheets_key_get");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a chave do Google no cofre.", error);
  return parseServiceAccount(data as string | null);
}

async function visibleClient(req: Request, clientId: string) {
  const { data, error } = await userClient(req).from("clients").select("id").eq("id", clientId).maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos verificar o cliente.", error);
  if (!data) throw new AppError(404, "NOT_FOUND", "Cliente não encontrado.");
}

const toApp = (err: unknown) =>
  err instanceof SheetsError ? new AppError(err.status, err.code, err.userMessage, err.technical) : err;

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  const input = parsed.data;

  if (input.action === "scheduled") {
    const { data: ok } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
    if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");
    const { data: sources, error } = await db.from("ri_sources").select(SOURCE_COLUMNS).eq("enabled", true).order("updated_at");
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos listar as planilhas.", error);
    if (!sources?.length) return json(req, 200, { data: { results: [] } });
    let client: SheetsClient;
    try {
      client = new SheetsClient(await loadAccount(db));
    } catch (err) {
      const app = toApp(err);
      const message = app instanceof AppError ? app.userMessage : "Falha ao preparar a leitura.";
      for (const s of sources) await db.rpc("ri_read_fail", { p_source_id: s.id, p_error: message });
      throw app;
    }
    const results: ReadResult[] = [];
    for (const s of sources as SourceRow[]) results.push(await readSource(db, client, s, "agendada"));
    return json(req, 200, { data: { results } });
  }

  if (input.action === "read_now") {
    const caller = await requireRole(req, db, ["admin", "gestor", "operador"]);
    await enforceRateLimit(db, "sheets.read", caller.id);
    // O RLS decide se a pessoa enxerga esta planilha (cliente liberado).
    const { data: source, error } = await userClient(req).from("ri_sources").select(SOURCE_COLUMNS).eq("id", input.sourceId).maybeSingle();
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a configuração da planilha.", error);
    if (!source) throw new AppError(404, "NOT_FOUND", "Planilha não encontrada.");
    const result = await readSource(db, new SheetsClient(await loadAccount(db).catch((e) => { throw toApp(e); })), source as SourceRow, "manual");
    if (result.status === "ocupada") throw new AppError(409, "SHEETS_BUSY", "Esta planilha já está sendo lida agora. Aguarde um instante.");
    if (result.status === "erro") throw new AppError(400, "SHEETS_READ_FAILED", result.detail);
    return json(req, 200, { data: result });
  }

  if (input.action === "test_settings") {
    const caller = await requireRole(req, db, ["admin"]);
    await enforceRateLimit(db, "sheets.read", caller.id);
    let ok = true;
    let message: string | null = null;
    let email: string | null = null;
    try {
      const sa = await loadAccount(db);
      email = sa.client_email;
      await accessToken(sa);
    } catch (err) {
      ok = false;
      message = err instanceof SheetsError ? err.userMessage : err instanceof AppError ? err.userMessage : "Falha inesperada ao testar a chave.";
      await db.from("sheets_settings").update({ last_test_at: new Date().toISOString(), last_test_ok: false, last_test_error: message.slice(0, 500) }).eq("id", true);
      throw toApp(err);
    }
    await db.from("sheets_settings").update({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_error: message }).eq("id", true);
    return json(req, 200, { data: { ok, serviceAccountEmail: email } });
  }

  const caller = await requireRole(req, db, ["admin", "gestor"]);
  await enforceRateLimit(db, "sheets.read", caller.id);
  await visibleClient(req, input.clientId);

  try {
    const client = new SheetsClient(await loadAccount(db));
    if (input.action === "inspect") {
      const spreadsheetId = parseSpreadsheetId(input.url);
      if (!spreadsheetId) throw new AppError(400, "INVALID_INPUT", "Link da planilha não reconhecido. Copie o endereço da planilha aberta no navegador.");
      const info = await client.inspect(spreadsheetId);
      return json(req, 200, { data: { spreadsheetId, ...info } });
    }

    const top = input.headerRow;
    if (input.action === "preview") {
      const values = await client.values(input.spreadsheetId, `${quoteSheet(input.sheet)}!A${top}:ZZ${top + PREVIEW_ROWS}`);
      const { headers, rows } = splitHeader(values);
      return json(req, 200, { data: { headers, rows: rows.slice(0, PREVIEW_ROWS) } });
    }

    // column_values: lê a aba inteira (do cabeçalho para baixo) e conta os valores da coluna.
    const values = await client.values(input.spreadsheetId, `${quoteSheet(input.sheet)}!A${top}:ZZ`);
    const { headers, rows } = splitHeader(values);
    const index = headers.indexOf(input.column);
    if (index < 0) throw new AppError(400, "SHEETS_COLUMN_NOT_FOUND", `A coluna "${input.column}" não existe no cabeçalho da planilha.`);
    return json(req, 200, { data: { totalRows: rows.length, values: distinctValues(rows, index) } });
  } catch (err) {
    throw toApp(err);
  }
}, "sheets"));
