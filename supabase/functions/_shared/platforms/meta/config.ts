/**
 * Configuração da Marketing API do Meta.
 *
 * Versão: cada versão da Marketing API expira cerca de 1 ano após o lançamento
 * (a v23.0 expirou em 06/2026). Para trocar sem mexer no código, defina o
 * segredo META_GRAPH_VERSION nas Edge Functions do Supabase.
 */
export const DEFAULT_GRAPH_VERSION = "v26.0";

export function graphVersion(): string {
  return Deno.env.get("META_GRAPH_VERSION") || DEFAULT_GRAPH_VERSION;
}

/** App Secret do app do Meta. Quando presente, toda chamada leva o appsecret_proof. */
export function appSecret(): string | undefined {
  return Deno.env.get("META_APP_SECRET") || undefined;
}

export const GRAPH_HOST = "https://graph.facebook.com";

/** Limite de páginas ao percorrer listas (proteção contra laços infinitos). */
export const MAX_PAGES = 50;
