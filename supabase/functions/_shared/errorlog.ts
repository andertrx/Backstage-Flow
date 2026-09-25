import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { redactSecrets } from "../../../packages/shared/src/errors/redact.ts";

/**
 * Registro de erros técnicos (Etapa 25). A pessoa vê só a mensagem amigável;
 * o detalhe técnico vai para a tabela error_logs (só o administrador lê) e
 * para o log da função. Tokens, chaves e senhas são apagados ANTES de gravar.
 */

export type ErrorSource = "servidor" | "sincronizacao" | "historico";

export interface ErrorRecord {
  source: ErrorSource;
  code: string;
  userMessage?: string | null;
  technical?: unknown;
  context?: Record<string, unknown>;
  userId?: string | null;
  adAccountId?: string | null;
  clientId?: string | null;
}

export { redactSecrets };

/**
 * Erros "esperados", causados por quem usa (campo inválido, sem permissão,
 * e-mail repetido...). A mensagem já explica tudo; não vão para o log técnico.
 */
export const EXPECTED_CODES: ReadonlySet<string> = new Set([
  "INVALID_INPUT", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "ALREADY_LINKED", "ALREADY_UNLINKED",
  "EMAIL_IN_USE", "LAST_ADMIN", "SELF_LOCKOUT", "INVALID_STATE", "NO_CONNECTION", "METHOD_NOT_ALLOWED",
]);

/** Qualquer erro (Error, AppError, objeto do banco) → texto legível e já sem segredos. */
export function describeError(err: unknown): string {
  let text: string;
  if (err == null) text = "";
  else if (typeof err === "string") text = err;
  else if (err instanceof Error) {
    const extra = err as Error & { code?: unknown; technical?: unknown };
    text = `${err.name}: ${err.message}`;
    if (typeof extra.code === "string") text = `${extra.code} — ${text}`;
    if (extra.technical !== undefined) text += ` | ${describeError(extra.technical)}`;
  } else {
    try {
      text = JSON.stringify(err);
    } catch {
      text = String(err);
    }
  }
  return redactSecrets(text).slice(0, 4000);
}

let client: SupabaseClient | null | undefined;
function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}

/** Só para os testes: troca (ou desliga) o destino da gravação. */
export function setErrorLogClient(c: SupabaseClient | null | undefined) {
  client = c;
}

function cleanContext(context: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    if (v === undefined || v === null) continue;
    out[k] = redactSecrets(typeof v === "string" ? v : JSON.stringify(v)).slice(0, 300);
  }
  return out;
}

/**
 * Guarda o erro técnico. Nunca lança: se a gravação falhar, o erro fica ao
 * menos no log da função (e a tela continua funcionando).
 */
export async function recordError(rec: ErrorRecord): Promise<void> {
  const technical = describeError(rec.technical);
  const context = cleanContext(rec.context);
  const code = (rec.code.replace(/[^A-Za-z0-9_.:-]/g, "") || "UNKNOWN").slice(0, 80);
  console.error(JSON.stringify({ code, source: rec.source, adAccountId: rec.adAccountId ?? undefined, technical, ...context }));
  const c = db();
  if (!c) return;
  try {
    const { error } = await c.from("error_logs").insert({
      source: rec.source,
      code,
      user_message: rec.userMessage ? redactSecrets(rec.userMessage).slice(0, 500) : null,
      technical: technical || null,
      context,
      user_id: rec.userId ?? null,
      ad_account_id: rec.adAccountId ?? null,
      client_id: rec.clientId ?? null,
    });
    if (error) console.error(JSON.stringify({ code: "ERROR_LOG_FAILED", technical: redactSecrets(error.message) }));
  } catch (err) {
    console.error(JSON.stringify({ code: "ERROR_LOG_FAILED", technical: redactSecrets(String(err)) }));
  }
}
