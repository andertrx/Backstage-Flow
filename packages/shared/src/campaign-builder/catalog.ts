/**
 * Fase 35.2 — Campaign Builder: catálogo de regras do Meta (API v26).
 *
 * TRANSPARÊNCIA: o Meta não publica um endpoint com todas as combinações válidas de objetivo × otimização × cobrança.
 * Este catálogo foi montado a partir da documentação oficial e fica num só lugar; quando a versão da API mudar, só ele muda.
 * Ele serve para NÃO oferecer combinações que o Meta recusa. A garantia final é o "Validar" (passo 3), que pergunta ao Meta
 * (`validate_only`) e mostra a resposta dele. Se o catálogo estiver desatualizado, o Meta recusa lá e nada é criado.
 */

export const CATALOG_VERSION = "v26.0";

export type ObjectiveId =
  | "OUTCOME_AWARENESS" | "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_LEADS" | "OUTCOME_SALES";

export const OBJECTIVE_LABELS: Record<ObjectiveId, string> = {
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_LEADS: "Cadastros (leads)",
  OUTCOME_SALES: "Vendas",
};

export type OptimizationGoal =
  | "REACH" | "IMPRESSIONS" | "AD_RECALL_LIFT" | "LINK_CLICKS" | "LANDING_PAGE_VIEWS" | "POST_ENGAGEMENT" | "THRUPLAY"
  | "CONVERSATIONS" | "LEAD_GENERATION" | "QUALITY_LEAD" | "OFFSITE_CONVERSIONS" | "VALUE";

export const GOAL_LABELS: Record<OptimizationGoal, string> = {
  REACH: "Alcance", IMPRESSIONS: "Impressões", AD_RECALL_LIFT: "Lembrança do anúncio", LINK_CLICKS: "Cliques no link",
  LANDING_PAGE_VIEWS: "Visualizações da página de destino", POST_ENGAGEMENT: "Engajamento com a publicação", THRUPLAY: "ThruPlay (vídeo)",
  CONVERSATIONS: "Conversas (mensagens)", LEAD_GENERATION: "Geração de leads (formulário)", QUALITY_LEAD: "Leads de qualidade",
  OFFSITE_CONVERSIONS: "Conversões no site", VALUE: "Valor das conversões",
};

/** Metas de otimização que cada objetivo aceita. */
export const GOALS_BY_OBJECTIVE: Record<ObjectiveId, OptimizationGoal[]> = {
  OUTCOME_AWARENESS: ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT", "THRUPLAY"],
  OUTCOME_TRAFFIC: ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS", "CONVERSATIONS"],
  OUTCOME_ENGAGEMENT: ["POST_ENGAGEMENT", "THRUPLAY", "CONVERSATIONS", "REACH", "IMPRESSIONS"],
  OUTCOME_LEADS: ["LEAD_GENERATION", "QUALITY_LEAD", "OFFSITE_CONVERSIONS", "CONVERSATIONS", "LINK_CLICKS"],
  OUTCOME_SALES: ["OFFSITE_CONVERSIONS", "VALUE", "CONVERSATIONS", "LINK_CLICKS", "LANDING_PAGE_VIEWS"],
};

/** O que cada meta exige no conjunto (objeto promovido). */
export const GOAL_REQUIRES: Partial<Record<OptimizationGoal, { pixel?: boolean; page?: boolean; customEvent?: boolean }>> = {
  OFFSITE_CONVERSIONS: { pixel: true, customEvent: true },
  VALUE: { pixel: true, customEvent: true },
  LEAD_GENERATION: { page: true },
  QUALITY_LEAD: { page: true },
  CONVERSATIONS: { page: true },
};

export type BillingEvent = "IMPRESSIONS" | "LINK_CLICKS" | "THRUPLAY";
export const BILLING_LABELS: Record<BillingEvent, string> = { IMPRESSIONS: "Impressões", LINK_CLICKS: "Cliques no link", THRUPLAY: "ThruPlay" };

/** Cobrança aceita por meta (padrão do Meta: IMPRESSIONS; LINK_CLICKS só para cliques; THRUPLAY só para ThruPlay). */
export function billingFor(goal: OptimizationGoal): BillingEvent[] {
  if (goal === "LINK_CLICKS") return ["IMPRESSIONS", "LINK_CLICKS"];
  if (goal === "THRUPLAY") return ["IMPRESSIONS", "THRUPLAY"];
  return ["IMPRESSIONS"];
}

export const CUSTOM_EVENTS = [
  "PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "ADD_TO_CART", "INITIATE_CHECKOUT", "CONTACT", "SUBMIT_APPLICATION", "SCHEDULE", "VIEW_CONTENT", "OTHER",
] as const;
export type CustomEvent = (typeof CUSTOM_EVENTS)[number];

export const SPECIAL_AD_CATEGORIES = [
  { id: "CREDIT", label: "Crédito" },
  { id: "EMPLOYMENT", label: "Emprego" },
  { id: "HOUSING", label: "Moradia" },
  { id: "ISSUES_ELECTIONS_POLITICS", label: "Temas sociais, eleições ou política" },
  { id: "ONLINE_GAMBLING_AND_GAMING", label: "Jogos de azar e apostas online" },
  { id: "FINANCIAL_PRODUCTS_SERVICES", label: "Produtos e serviços financeiros" },
] as const;
export type SpecialAdCategory = (typeof SPECIAL_AD_CATEGORIES)[number]["id"];

/** Com categoria especial, o Meta trava idade (18–65 fixa), gênero (todos) e outros campos de público. */
export const SPECIAL_AGE_MIN = 18;
export const SPECIAL_AGE_MAX = 65;

export const COUNTRIES = [
  { id: "BR", label: "Brasil" }, { id: "PT", label: "Portugal" }, { id: "US", label: "Estados Unidos" }, { id: "AR", label: "Argentina" },
  { id: "CL", label: "Chile" }, { id: "CO", label: "Colômbia" }, { id: "MX", label: "México" }, { id: "UY", label: "Uruguai" },
  { id: "PY", label: "Paraguai" }, { id: "ES", label: "Espanha" },
] as const;

export const AD_CTAS = [
  { id: "LEARN_MORE", label: "Saiba mais" }, { id: "SIGN_UP", label: "Cadastre-se" }, { id: "SHOP_NOW", label: "Comprar agora" },
  { id: "ORDER_NOW", label: "Pedir agora" }, { id: "CONTACT_US", label: "Fale conosco" }, { id: "GET_OFFER", label: "Obter oferta" },
  { id: "BOOK_TRAVEL", label: "Reservar" }, { id: "SUBSCRIBE", label: "Inscrever-se" }, { id: "WHATSAPP_MESSAGE", label: "Enviar mensagem pelo WhatsApp" },
  { id: "MESSAGE_PAGE", label: "Enviar mensagem" }, { id: "CALL_NOW", label: "Ligar agora" }, { id: "DOWNLOAD", label: "Baixar" },
  { id: "GET_QUOTE", label: "Solicitar orçamento" }, { id: "NO_BUTTON", label: "Sem botão" },
] as const;
export type AdCta = (typeof AD_CTAS)[number]["id"];
