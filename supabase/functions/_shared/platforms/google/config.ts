/**
 * Configuração da Google Ads API (interface REST oficial).
 *
 * Versão: o Google lança versões novas a cada poucos meses e desliga as
 * antigas (v20 e v21 foram desligadas em 2026). Para trocar sem mexer no
 * código, defina o segredo GOOGLE_ADS_API_VERSION nas Edge Functions.
 *
 * Segredos obrigatórios (Edge Functions → Secrets no painel do Supabase):
 *   GOOGLE_ADS_DEVELOPER_TOKEN  — token de desenvolvedor da MCC da agência
 *   GOOGLE_OAUTH_CLIENT_ID      — cliente OAuth (Google Cloud)
 *   GOOGLE_OAUTH_CLIENT_SECRET  — segredo do cliente OAuth
 */
export const DEFAULT_API_VERSION = "v25";
export const ADS_HOST = "https://googleads.googleapis.com";
export const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** adwords = Google Ads API; openid/email = saber qual conta Google foi conectada. */
export const OAUTH_SCOPES = ["https://www.googleapis.com/auth/adwords", "openid", "email"];

/** Limite de contas acessíveis consultadas por vez (evita estourar o tempo da função). */
export const MAX_ACCESSIBLE_CUSTOMERS = 50;

const REQUIRED = ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"] as const;

export function apiVersion(): string {
  return Deno.env.get("GOOGLE_ADS_API_VERSION") || DEFAULT_API_VERSION;
}

/** Nomes dos segredos que ainda não foram configurados. */
export function missingConfig(): string[] {
  return REQUIRED.filter((name) => !Deno.env.get(name));
}

export function env(name: (typeof REQUIRED)[number]): string {
  return Deno.env.get(name) ?? "";
}
