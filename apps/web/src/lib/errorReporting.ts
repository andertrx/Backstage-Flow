import { redactSecrets } from "@backstage/shared";
import { supabase } from "./supabase.ts";

/**
 * Envia um erro técnico do site para o log do administrador (Etapa 25).
 * A pessoa continua vendo só a mensagem amigável. Nunca lança erro, não
 * repete o mesmo erro (5 min) e para depois de 20 envios por visita.
 */

const WINDOW_MS = 5 * 60_000;
const MAX_PER_VISIT = 20;
const recent = new Map<string, number>();
let sent = 0;

export interface ReportOptions {
  userMessage?: string;
  context?: Record<string, string | number | boolean | null | undefined>;
}

/** Texto técnico legível de qualquer erro (sem segredos, no máximo 4.000 letras). */
export function technicalText(error: unknown): string {
  let text: string;
  if (error == null) text = "";
  else if (typeof error === "string") text = error;
  else if (error instanceof Error) text = `${error.name}: ${error.message}${error.stack ? `\n${error.stack.split("\n").slice(1, 8).join("\n")}` : ""}`;
  else {
    try {
      text = JSON.stringify(error);
    } catch {
      text = String(error);
    }
  }
  return redactSecrets(text).slice(0, 4000);
}

/** Só para os testes. */
export function resetErrorReporting() {
  recent.clear();
  sent = 0;
}

export function reportError(code: string, error: unknown, options: ReportOptions = {}): void {
  try {
    const technical = technicalText(error);
    const key = `${code}|${technical.slice(0, 200)}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < WINDOW_MS || sent >= MAX_PER_VISIT) return;
    recent.set(key, now);
    sent += 1;
    console.error(`[${code}]`, error);
    const context: Record<string, string> = { pagina: typeof window === "undefined" ? "" : window.location.pathname };
    for (const [k, v] of Object.entries(options.context ?? {})) if (v != null) context[k] = String(v);
    void supabase
      .rpc("log_client_error", { p_code: code, p_user_message: options.userMessage ?? null, p_technical: technical, p_context: context })
      .then(({ error: rpcError }) => {
        if (rpcError) console.warn("[log_client_error]", rpcError.message);
      }, () => {});
  } catch {
    // registrar o erro nunca pode gerar outro erro na tela
  }
}
