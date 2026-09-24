/**
 * Tradução de erros técnicos em mensagens amigáveis.
 * O detalhe técnico vai para o console (e, nas próximas etapas, para os logs).
 */

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  user_banned: "Seu acesso está desativado. Fale com o administrador.",
  email_not_confirmed: "Seu e-mail ainda não foi confirmado.",
  over_request_rate_limit: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.",
  weak_password: "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.",
  same_password: "A nova senha precisa ser diferente da atual.",
  session_expired: "Sua sessão expirou. Faça login novamente.",
  otp_expired: "Este link expirou. Peça um novo link de recuperação.",
};

const GENERIC = "Não foi possível concluir a operação. Tente novamente em instantes.";
const NETWORK = "Sem conexão com o servidor. Verifique sua internet e tente de novo.";

export function friendlyAuthError(error: unknown): string {
  if (!error) return GENERIC;
  const e = error as { code?: string; name?: string; message?: string };
  if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code];
  if (e.name === "AuthRetryableFetchError" || e.message === "Failed to fetch") return NETWORK;
  console.error("[auth]", error);
  return GENERIC;
}

/**
 * Lê a mensagem amigável devolvida por uma Edge Function
 * (formato { error: { code, message } }).
 */
export async function friendlyFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: { message?: string } };
      if (body?.error?.message) return body.error.message;
    } catch {
      // resposta não era JSON — cai na mensagem genérica
    }
  }
  const name = (error as { name?: string })?.name;
  if (name === "FunctionsFetchError") return NETWORK;
  console.error("[function]", error);
  return GENERIC;
}
