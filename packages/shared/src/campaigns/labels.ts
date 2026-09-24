// Textos em português para campanhas, conjuntos/grupos e anúncios.

/** Deve ser igual ao tipo public.entity_status do banco. */
export const ENTITY_STATUSES = ["ativa", "pausada", "encerrada", "arquivada", "erro", "desconhecida"] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  ativa: "Ativa",
  pausada: "Pausada",
  encerrada: "Encerrada",
  arquivada: "Arquivada",
  erro: "Com erro",
  desconhecida: "Status desconhecido",
};

export const ENTITY_STATUS_TONE: Record<EntityStatus, "success" | "neutral" | "danger" | "warning"> = {
  ativa: "success",
  pausada: "warning",
  encerrada: "neutral",
  arquivada: "neutral",
  erro: "danger",
  desconhecida: "neutral",
};

/**
 * Filtros rápidos da tela de campanhas. "Encerrada" inclui as arquivadas
 * (para quem usa o painel, as duas significam "não roda mais").
 */
export const CAMPAIGN_STATUS_FILTERS = {
  ativa: ["ativa"],
  pausada: ["pausada"],
  encerrada: ["encerrada", "arquivada"],
  erro: ["erro"],
} as const satisfies Record<string, readonly EntityStatus[]>;
export type CampaignStatusFilter = keyof typeof CAMPAIGN_STATUS_FILTERS;

/** Objetivos do Meta (ODAX) e tipos de campanha do Google Ads. Desconhecido → valor original. */
const OBJECTIVES: Record<string, string> = {
  OUTCOME_LEADS: "Cadastros (leads)",
  OUTCOME_SALES: "Vendas",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_APP_PROMOTION: "Promoção do app",
  SEARCH: "Pesquisa",
  DISPLAY: "Display",
  SHOPPING: "Shopping",
  VIDEO: "Vídeo",
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Geração de demanda",
  MULTI_CHANNEL: "App",
  LOCAL: "Local",
  SMART: "Inteligente",
  HOTEL: "Hotel",
};

export function objectiveLabel(objective: string | null | undefined): string | null {
  if (!objective) return null;
  return OBJECTIVES[objective] ?? objective;
}
