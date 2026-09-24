import { AppError } from "../../http.ts";

/**
 * Classifica erros da Google Ads API e do OAuth do Google.
 * Os códigos (ex.: DEVELOPER_TOKEN_NOT_APPROVED) vêm do corpo da resposta
 * (GoogleAdsFailure). A mensagem técnica nunca é mostrada ao usuário.
 */
export function classifyGoogleError(status: number, body: unknown): AppError {
  const text = JSON.stringify(body ?? {});
  const has = (code: string) => text.includes(code);
  const technical = { httpStatus: status, body: text.slice(0, 2000) };

  if (has("invalid_grant")) {
    return new AppError(400, "AUTH_EXPIRED", "A autorização do Google expirou ou foi revogada. Conecte o Google Ads novamente.", technical);
  }
  if (has("DEVELOPER_TOKEN_NOT_APPROVED") || has("DEVELOPER_TOKEN_PROHIBITED")) {
    return new AppError(
      403,
      "DEVELOPER_TOKEN_LIMITED",
      "O developer token do Google Ads ainda não foi aprovado: por enquanto ele só acessa contas de teste. Solicite o acesso Básico ao Google.",
      technical,
    );
  }
  if (has("DEVELOPER_TOKEN_INVALID") || has("DEVELOPER_TOKEN_PARAMETER_MISSING") || has("invalid_client") || has("unauthorized_client")) {
    return new AppError(500, "CONFIG_ERROR", "As chaves do Google Ads configuradas no servidor estão incorretas. Confira os segredos no Supabase.", technical);
  }
  if (has("CUSTOMER_NOT_ENABLED")) {
    return new AppError(400, "ACCOUNT_NOT_ENABLED", "Esta conta do Google Ads não está ativa (cancelada ou ainda em configuração).", technical);
  }
  if (has("USER_PERMISSION_DENIED") || status === 403) {
    return new AppError(403, "PERMISSION_DENIED", "A conta Google conectada não tem acesso a esta conta de anúncio.", technical);
  }
  if (status === 401 || has("UNAUTHENTICATED")) {
    return new AppError(400, "AUTH_EXPIRED", "A autorização do Google expirou. Conecte o Google Ads novamente.", technical);
  }
  if (status === 429 || has("RESOURCE_EXHAUSTED")) {
    return new AppError(429, "RATE_LIMITED", "O Google pediu uma pausa nas consultas. Tente novamente em alguns minutos.", technical);
  }
  if (status === 400) {
    return new AppError(400, "PLATFORM_BAD_REQUEST", "O Google Ads não aceitou a solicitação.", technical);
  }
  return new AppError(502, "PLATFORM_UNAVAILABLE", "Não conseguimos falar com o Google Ads agora. Tente novamente em instantes.", technical);
}
