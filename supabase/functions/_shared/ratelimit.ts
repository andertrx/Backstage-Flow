import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { recordError } from "./errorlog.ts";
import { AppError } from "./http.ts";

/**
 * Limite de requisições por pessoa e ação (Etapa 26). Protege contra abuso e
 * contra uso indevido de uma sessão roubada. Janela e máximo por ação.
 */
export interface RateRule {
  max: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  "sync.run": { max: 30, windowSeconds: 600 },
  "accounts.connect": { max: 10, windowSeconds: 600 },
  "accounts.balance": { max: 30, windowSeconds: 600 },
  "accounts.other": { max: 120, windowSeconds: 600 },
  "users.manage": { max: 30, windowSeconds: 600 },
} as const satisfies Record<string, RateRule>;

export type RateBucket = keyof typeof RATE_LIMITS;

export const RATE_LIMIT_MESSAGE = "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";

/**
 * Conta a tentativa e barra quem passou do limite. Se o contador falhar (banco
 * fora do ar), deixa seguir e registra o problema: o limite nunca derruba o site.
 */
export async function enforceRateLimit(db: SupabaseClient, bucket: RateBucket, userId: string): Promise<void> {
  const rule = RATE_LIMITS[bucket];
  const { data, error } = await db.rpc("rate_limit_hit", {
    p_bucket: bucket,
    p_subject: userId,
    p_max: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    await recordError({ source: "servidor", code: "RATE_LIMIT_CHECK_FAILED", technical: error, context: { acao: bucket }, userId });
    return;
  }
  if (data === false) {
    throw new AppError(429, "TOO_MANY_REQUESTS", RATE_LIMIT_MESSAGE, { bucket, max: rule.max, windowSeconds: rule.windowSeconds });
  }
}
