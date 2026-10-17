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
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { distinctValues, parseSpreadsheetId } from "../../../packages/shared/src/results/sheets.ts";
import { adminClient, requireRole, userClient } from "../_shared/auth.ts";
import { accessToken, parseServiceAccount, quoteSheet, type ServiceAccount, SheetsClient, SheetsError, splitHeader } from "../_shared/google/sheets.ts";
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
]);

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
