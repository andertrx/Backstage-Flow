import { reportError } from "./errorReporting.ts";

/**
 * Tradução de erros técnicos em mensagens amigáveis.
 * O detalhe técnico vai para o log do administrador (Logs → Erros técnicos).
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

export const GENERIC = "Não foi possível concluir a operação. Tente novamente em instantes.";
const NETWORK = "Sem conexão com o servidor. Verifique sua internet e tente de novo.";

export function friendlyAuthError(error: unknown): string {
  if (!error) return GENERIC;
  const e = error as { code?: string; name?: string; message?: string };
  if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code];
  if (e.name === "AuthRetryableFetchError" || e.message === "Failed to fetch") return NETWORK;
  reportError("AUTH_ERROR", error, { userMessage: GENERIC });
  return GENERIC;
}

/**
 * Lê a mensagem amigável devolvida por uma Edge Function
 * (formato { error: { code, message } }).
 */
export async function friendlyFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  let status: number | undefined;
  if (context instanceof Response) {
    status = context.status;
    try {
      const body = (await context.clone().json()) as { error?: { message?: string } };
      // O servidor já guardou o detalhe técnico; aqui só a mensagem amigável.
      if (body?.error?.message) return body.error.message;
    } catch {
      // resposta não era JSON — cai na mensagem genérica
    }
  }
  const name = (error as { name?: string })?.name;
  if (name === "FunctionsFetchError") return NETWORK;
  reportError("FUNCTION_ERROR", error, { userMessage: GENERIC, context: { status } });
  return GENERIC;
}

/**
 * Erros do banco (PostgREST/PostgreSQL) → mensagem amigável.
 * Códigos: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export function friendlyDbError(error: unknown, fallback = GENERIC): string {
  const e = error as { code?: string; message?: string; details?: string };
  const text = `${e.message ?? ""} ${e.details ?? ""}`;
  switch (e.code) {
    case "23505":
      if (text.includes("cnpj")) return "Já existe um cliente com este CNPJ.";
      if (text.includes("user_client_access")) return "Este usuário já tem acesso a este cliente.";
      return "Este registro já existe.";
    case "23514":
      return "Algum campo está em formato inválido. Confira os dados e tente de novo.";
    case "42501":
      return "Você não tem permissão para esta ação.";
    case "PGRST301":
    case "PGRST303":
      return "Sua sessão expirou. Faça login novamente.";
  }
  if (e.message === "Failed to fetch" || e.message?.includes("NetworkError")) return NETWORK;
  reportError(`DB_${e.code ?? "ERROR"}`, error, { userMessage: fallback });
  return fallback;
}

/** Erro cuja mensagem já é amigável (pode aparecer na tela). */
export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendlyError";
  }
}

/**
 * Texto para a tela: a mensagem amigável, ou uma genérica quando o erro é
 * técnico (ex.: "TypeError: x is undefined" nunca aparece para a pessoa).
 */
export function errorMessage(error: unknown, fallback = GENERIC): string {
  if (error instanceof FriendlyError) return error.message;
  return fallback;
}
