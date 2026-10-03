/**
 * Grupos de objetivo de campanha para o filtro do Monitoramento (Etapa 37, filtro de objetivo).
 * Os nomes antigos do Meta entram no grupo do objetivo atual equivalente.
 * Eventos personalizados (ex.: "EndForm") ficam no objetivo da campanha: campanha de Leads → Leads.
 * A mesma regra existe no banco em private.monitor_objective_group (mantenha as duas iguais).
 */
export const OBJECTIVE_GROUPS = ["vendas", "leads", "engajamento", "trafego", "reconhecimento", "app", "outros"] as const;
export type ObjectiveGroup = (typeof OBJECTIVE_GROUPS)[number];

export const OBJECTIVE_GROUP_LABELS: Record<ObjectiveGroup, string> = {
  vendas: "Vendas",
  leads: "Leads (cadastros)",
  engajamento: "Engajamento (conversas)",
  trafego: "Tráfego",
  reconhecimento: "Reconhecimento",
  app: "Promoção de app",
  outros: "Outros (Google e sem objetivo)",
};

const MAP: Record<string, ObjectiveGroup> = {
  OUTCOME_SALES: "vendas", CONVERSIONS: "vendas", PRODUCT_CATALOG_SALES: "vendas",
  OUTCOME_LEADS: "leads", LEAD_GENERATION: "leads",
  OUTCOME_ENGAGEMENT: "engajamento", MESSAGES: "engajamento", POST_ENGAGEMENT: "engajamento", PAGE_LIKES: "engajamento",
  EVENT_RESPONSES: "engajamento", VIDEO_VIEWS: "engajamento",
  OUTCOME_TRAFFIC: "trafego", LINK_CLICKS: "trafego",
  OUTCOME_AWARENESS: "reconhecimento", BRAND_AWARENESS: "reconhecimento", REACH: "reconhecimento",
  OUTCOME_APP_PROMOTION: "app", APP_INSTALLS: "app",
};

/** Grupo do objetivo informado pela plataforma (sem objetivo ou desconhecido = "outros"). */
export function objectiveGroup(objective: string | null | undefined): ObjectiveGroup {
  return MAP[(objective ?? "").trim().toUpperCase()] ?? "outros";
}

/** Filtro vazio = todos os objetivos. */
export function matchesObjectives(objective: string | null | undefined, selected: readonly string[]): boolean {
  return selected.length === 0 || selected.includes(objectiveGroup(objective));
}
