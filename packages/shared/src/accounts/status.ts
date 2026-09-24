/** Deve ser igual ao tipo public.ad_account_status do banco. */
export const AD_ACCOUNT_STATUSES = [
  "ativa",
  "atencao",
  "restrita",
  "desativada",
  "pagamento_pendente",
  "encerrada",
  "desconhecida",
] as const;

export type AdAccountStatus = (typeof AD_ACCOUNT_STATUSES)[number];

export const AD_ACCOUNT_STATUS_LABELS: Record<AdAccountStatus, string> = {
  ativa: "Ativa",
  atencao: "Atenção",
  restrita: "Restrita",
  desativada: "Desativada",
  pagamento_pendente: "Pagamento pendente",
  encerrada: "Encerrada",
  desconhecida: "Status desconhecido",
};

/** Gravidade para cores e alertas: ok, aviso ou problema. */
export const AD_ACCOUNT_STATUS_SEVERITY: Record<AdAccountStatus, "ok" | "warning" | "danger" | "neutral"> = {
  ativa: "ok",
  atencao: "warning",
  restrita: "danger",
  desativada: "danger",
  pagamento_pendente: "danger",
  encerrada: "neutral",
  desconhecida: "neutral",
};

export const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
};

/** Deve ser igual ao tipo public.connection_status do banco. */
export type ConnectionStatus = "ativa" | "erro" | "revogada";

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  ativa: "Ativa",
  erro: "Com erro",
  revogada: "Desconectada",
};
