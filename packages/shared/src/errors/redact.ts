/**
 * Erros técnicos (Etapa 25): nunca guardar tokens, chaves ou senhas no log.
 * A mesma regra existe no banco (private.redact_secrets).
 */
export function redactSecrets(text: string): string {
  return text
    .replace(
      /((access_token|refresh_token|appsecret_proof|client_secret|developer[-_]token|password|senha|apikey|api_key|secret|token)["']?\s*[=:]\s*["']?)[^&"'\s,}]+/gi,
      "$1[oculto]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[oculto]")
    .replace(/EAA[A-Za-z0-9]{20,}/g, "[token oculto]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[jwt oculto]");
}

/** Origem do erro técnico (coluna error_logs.source). */
export const ERROR_SOURCES = [
  { value: "site", label: "Site (navegador)" },
  { value: "servidor", label: "Servidor" },
  { value: "sincronizacao", label: "Sincronização" },
  { value: "historico", label: "Importação do histórico" },
] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number]["value"];

export function errorSourceLabel(source: string): string {
  return ERROR_SOURCES.find((s) => s.value === source)?.label ?? source;
}
