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
  | "CONVERSATIONS" | "LEAD_GENERATION" | "QUALITY_LEAD" | "OFFSITE_CONVERSIONS" | "VALUE"
  | "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS" | "EVENT_RESPONSES" | "PAGE_LIKES" | "VISIT_INSTAGRAM_PROFILE" | "PROFILE_VISIT" | "QUALITY_CALL" | "REMINDERS_SET";

export const GOAL_LABELS: Record<OptimizationGoal, string> = {
  REACH: "Alcance", IMPRESSIONS: "Impressões", AD_RECALL_LIFT: "Lembrança do anúncio", LINK_CLICKS: "Cliques no link",
  LANDING_PAGE_VIEWS: "Visualizações da página de destino", POST_ENGAGEMENT: "Engajamento com a publicação", THRUPLAY: "ThruPlay (vídeo)",
  CONVERSATIONS: "Conversas (mensagens)", LEAD_GENERATION: "Geração de leads (formulário)", QUALITY_LEAD: "Leads de qualidade",
  OFFSITE_CONVERSIONS: "Conversões no site", VALUE: "Valor das conversões",
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "Reproduções de vídeo de 2 segundos", EVENT_RESPONSES: "Respostas ao evento", PAGE_LIKES: "Curtidas na página",
  VISIT_INSTAGRAM_PROFILE: "Visitas ao perfil do Instagram", PROFILE_VISIT: "Visitas ao perfil", QUALITY_CALL: "Ligações", REMINDERS_SET: "Lembretes definidos",
};

/**
 * Metas de otimização que cada objetivo aceita. A LISTA É A DO PRÓPRIO META (conferida na ferramenta oficial de anúncios do Meta em 28/11/2026),
 * na ordem dele (a primeira é a padrão). Algumas o Publicar ainda não monta: ver PUBLISH_UNSUPPORTED_GOALS em publish.ts.
 */
export const GOALS_BY_OBJECTIVE: Record<ObjectiveId, OptimizationGoal[]> = {
  OUTCOME_AWARENESS: ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT", "THRUPLAY", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS"],
  OUTCOME_TRAFFIC: ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "OFFSITE_CONVERSIONS", "IMPRESSIONS", "POST_ENGAGEMENT", "REACH", "CONVERSATIONS", "THRUPLAY", "VISIT_INSTAGRAM_PROFILE", "PROFILE_VISIT", "QUALITY_CALL", "REMINDERS_SET"],
  OUTCOME_ENGAGEMENT: ["THRUPLAY", "POST_ENGAGEMENT", "EVENT_RESPONSES", "PAGE_LIKES", "IMPRESSIONS", "REACH", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", "LINK_CLICKS", "CONVERSATIONS", "OFFSITE_CONVERSIONS", "LANDING_PAGE_VIEWS", "QUALITY_CALL"],
  OUTCOME_LEADS: ["OFFSITE_CONVERSIONS", "LEAD_GENERATION", "QUALITY_LEAD", "LANDING_PAGE_VIEWS", "LINK_CLICKS", "IMPRESSIONS", "REACH", "VALUE", "CONVERSATIONS", "QUALITY_CALL"],
  OUTCOME_SALES: ["OFFSITE_CONVERSIONS", "VALUE", "LANDING_PAGE_VIEWS", "IMPRESSIONS", "POST_ENGAGEMENT", "REACH", "LINK_CLICKS", "CONVERSATIONS"],
};

/** O que cada meta exige no conjunto (objeto promovido). */
export const GOAL_REQUIRES: Partial<Record<OptimizationGoal, { pixel?: boolean; page?: boolean; customEvent?: boolean }>> = {
  OFFSITE_CONVERSIONS: { pixel: true, customEvent: true },
  VALUE: { pixel: true, customEvent: true },
  LEAD_GENERATION: { page: true },
  QUALITY_LEAD: { page: true },
  CONVERSATIONS: { page: true },
  POST_ENGAGEMENT: { page: true },
  VISIT_INSTAGRAM_PROFILE: { page: true },
  PROFILE_VISIT: { page: true },
};

/** Para onde o anúncio leva a pessoa (destination_type do Meta). Site é o padrão (campo vazio). */
export type DestinationType = "WEBSITE" | "WHATSAPP" | "MESSENGER" | "INSTAGRAM_DIRECT" | "ON_AD" | "ON_POST" | "INSTAGRAM_PROFILE";
export const DESTINATION_LABELS: Record<DestinationType, string> = {
  WEBSITE: "Site", WHATSAPP: "WhatsApp", MESSENGER: "Messenger", INSTAGRAM_DIRECT: "Direct do Instagram", ON_AD: "Formulário no próprio anúncio",
  ON_POST: "Post que já existe no Instagram", INSTAGRAM_PROFILE: "Perfil do Instagram",
};
export const DESTINATION_TYPES = Object.keys(DESTINATION_LABELS) as DestinationType[];

/**
 * Destinos que o Meta oferece para a meta escolhida (só onde há escolha). Regra do Meta: Conversas aceita WhatsApp, Messenger ou Direct do Instagram,
 * mas em Cadastros (leads) só destinos com WhatsApp; Geração de leads usa o formulário no anúncio. Demais metas: site (sem escolha).
 */
export function destinationsFor(goal: OptimizationGoal | "", objective: ObjectiveId | ""): DestinationType[] {
  if (goal === "CONVERSATIONS") return objective === "OUTCOME_LEADS" ? ["WHATSAPP"] : ["WHATSAPP", "MESSENGER", "INSTAGRAM_DIRECT"];
  if (goal === "LEAD_GENERATION") return ["ON_AD"];
  // Post existente: o Meta só oferece engajamento com a publicação (ON_POST) dentro do objetivo Engajamento.
  if (goal === "POST_ENGAGEMENT" && objective === "OUTCOME_ENGAGEMENT") return ["ON_POST"];
  if (goal === "VISIT_INSTAGRAM_PROFILE" || goal === "PROFILE_VISIT") return ["INSTAGRAM_PROFILE"];
  return [];
}

/** O anúncio leva ao site (precisa de link e botão)? Falso para mensagens e formulário no anúncio. */
/** O anúncio usa um post que já existe no Instagram (sem imagem, texto, link nem botão para montar)? */
export const usesExistingPost = (d: DestinationType | ""): boolean => d === "ON_POST" || d === "INSTAGRAM_PROFILE";
export const leadsToWebsite = (d: DestinationType | ""): boolean => d === "" || d === "WEBSITE";

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
