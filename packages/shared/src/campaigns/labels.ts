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

export type StructureLevel = "campaign" | "ad_group" | "ad";

/** Nome de cada nível como a plataforma chama (Meta: conjunto; Google: grupo). */
export function levelLabel(level: StructureLevel, platform: string, plural = false): string {
  if (level === "campaign") return plural ? "Campanhas" : "Campanha";
  if (level === "ad") return plural ? "Anúncios" : "Anúncio";
  if (platform === "google") return plural ? "Grupos de anúncios" : "Grupo de anúncios";
  return plural ? "Conjuntos de anúncios" : "Conjunto de anúncios";
}

/** Meta de otimização do conjunto (Meta) / tipo do grupo (Google). Desconhecido → original. */
const OPTIMIZATION: Record<string, string> = {
  LEAD_GENERATION: "Geração de cadastros",
  QUALITY_LEAD: "Cadastros de qualidade",
  CONVERSATIONS: "Conversas",
  LINK_CLICKS: "Cliques no link",
  LANDING_PAGE_VIEWS: "Visualizações da página",
  OFFSITE_CONVERSIONS: "Conversões no site",
  VALUE: "Valor das conversões",
  REACH: "Alcance",
  IMPRESSIONS: "Impressões",
  THRUPLAY: "Reproduções do vídeo (ThruPlay)",
  POST_ENGAGEMENT: "Engajamento com a publicação",
  APP_INSTALLS: "Instalações do app",
  SEARCH_STANDARD: "Pesquisa (padrão)",
  DISPLAY_STANDARD: "Display (padrão)",
  SHOPPING_PRODUCT_ADS: "Anúncios de produtos",
  VIDEO_RESPONSIVE: "Vídeo responsivo",
};

export function optimizationLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return OPTIMIZATION[value] ?? value;
}

/** Tipo do anúncio/criativo. */
const CREATIVE: Record<string, string> = {
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  CAROUSEL: "Carrossel",
  COLLECTION: "Coleção",
  RESPONSIVE_SEARCH_AD: "Anúncio de pesquisa responsivo",
  RESPONSIVE_DISPLAY_AD: "Anúncio de display responsivo",
  EXPANDED_TEXT_AD: "Anúncio de texto expandido",
  IMAGE_AD: "Anúncio de imagem",
  VIDEO_RESPONSIVE_AD: "Anúncio de vídeo responsivo",
  DEMAND_GEN_MULTI_ASSET_AD: "Geração de demanda (vários recursos)",
};

export function creativeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return CREATIVE[value] ?? value;
}

/** Revisão do anúncio pela plataforma. */
const REVIEW: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  APPROVED: { label: "Aprovado", tone: "success" },
  APPROVED_LIMITED: { label: "Aprovado com limitações", tone: "warning" },
  PENDING_REVIEW: { label: "Em análise", tone: "warning" },
  UNDER_REVIEW: { label: "Em análise", tone: "warning" },
  IN_PROCESS: { label: "Em análise", tone: "warning" },
  WITH_ISSUES: { label: "Com problemas", tone: "danger" },
  DISAPPROVED: { label: "Reprovado", tone: "danger" },
  AREA_OF_INTEREST_ONLY: { label: "Veiculação limitada", tone: "warning" },
};

export function reviewInfo(value: string | null | undefined): { label: string; tone: "success" | "warning" | "danger" | "neutral" } | null {
  if (!value) return null;
  return REVIEW[value] ?? { label: value, tone: "neutral" };
}
