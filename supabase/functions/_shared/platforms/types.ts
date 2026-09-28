/**
 * Formato COMUM a todas as plataformas. Cada adaptador (Meta, Google e, no
 * futuro, TikTok/LinkedIn...) converte a resposta da sua API para estes tipos.
 */

/** Deve ser igual ao tipo public.ad_account_status do banco. */
export type AccountStatus =
  | "ativa"
  | "atencao"
  | "restrita"
  | "desativada"
  | "pagamento_pendente"
  | "encerrada"
  | "desconhecida";

export interface PlatformAccount {
  externalId: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  status: AccountStatus;
  /** Valor original da plataforma, para auditoria (ex.: "account_status=3"). */
  rawStatus: string | null;
  /** Motivo informado pela plataforma, quando houver (ex.: disable_reason). */
  statusReason: string | null;
  /** Meta: Business Manager. Google: MCC (conta administradora) que dá acesso. */
  businessId: string | null;
  businessName: string | null;
  isPrepay: boolean | null;
  /** Google Ads: Customer ID da MCC usada no cabeçalho login-customer-id. */
  managerId?: string | null;
  /** Google Ads: conta de teste. */
  isTestAccount?: boolean | null;
}

/** Contexto opcional para acessar uma conta (ex.: MCC do Google Ads). */
export interface AccountAccess {
  managerId?: string | null;
}

export interface PlatformAsset {
  type: "page" | "instagram";
  externalId: string;
  name: string | null;
  /** Instagram: id da página à qual o perfil está ligado. */
  parentExternalId: string | null;
}

export interface CredentialOwner {
  externalUserId: string;
  name: string | null;
}

/** Problemas de pagamento/conta. Deve ser igual ao check de account_snapshots.issues. */
export type FundingIssue =
  | "pagamento_pendente"
  | "cobranca_problema"
  | "conta_limitada"
  | "conta_desativada"
  | "sem_saldo"
  | "sem_forma_pagamento";

/**
 * Saldo e cobrança como a plataforma informa. Dinheiro em micros.
 * null = a API não informou (nunca preenchemos com estimativa).
 */
export interface AccountFunding {
  currency: string | null;
  /** Gasto contado contra o limite (Meta amount_spent; Google amount_served). */
  amountSpentMicros: number | null;
  /** Meta: valor devido (balance). */
  amountDueMicros: number | null;
  /** Limite (Meta spend_cap; Google limite do orçamento da conta). */
  spendCapMicros: number | null;
  /** Google: limite aprovado do orçamento da conta. */
  budgetMicros: number | null;
  /**
   * Dinheiro disponível, só quando a plataforma informa:
   * Meta = saldo pré-pago (PIX/boleto) informado pelo Meta; Google = orçamento − veiculado.
   * Nunca é o limite de gastos nem o limite do cartão.
   */
  availableMicros: number | null;
  /**
   * meta_prepaid_balance: saldo pré-pago informado pelo Meta · meta_card: pago no cartão
   * (não há saldo em conta; a tela mostra R$ 0,00) · google_account_budget: orçamento da conta.
   * "meta_spend_cap" existe só em fotografias antigas (antes da correção de 28/09/2026).
   */
  availableBasis: "meta_prepaid_balance" | "meta_card" | "google_account_budget" | null;
  budgetEndAt: string | null;
  /** Meta: texto da forma de pagamento, exatamente como veio. */
  fundingDescription: string | null;
  issues: FundingIssue[];
  /** Valores originais (auditoria). Nunca contém tokens. */
  raw: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Sincronização (Etapa 16): estrutura, métricas diárias e alcance por período
// -----------------------------------------------------------------------------

/** Deve ser igual ao tipo public.entity_status do banco. */
export type EntityStatus = "ativa" | "pausada" | "encerrada" | "arquivada" | "erro" | "desconhecida";

export interface PlatformCampaign {
  externalId: string;
  name: string;
  objective: string | null;
  status: EntityStatus;
  /** Status exatamente como a plataforma informou. */
  rawStatus: string | null;
  effectiveStatus: string | null;
  budgetMicros: number | null;
  budgetPeriod: "diario" | "vitalicio" | null;
  bidStrategy: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface PlatformAdGroup {
  externalId: string;
  campaignExternalId: string;
  name: string;
  status: EntityStatus;
  rawStatus: string | null;
  effectiveStatus: string | null;
  budgetMicros: number | null;
  budgetPeriod: "diario" | "vitalicio" | null;
  optimizationGoal: string | null;
}

export interface PlatformAd {
  externalId: string;
  adGroupExternalId: string;
  campaignExternalId: string;
  name: string;
  status: EntityStatus;
  rawStatus: string | null;
  effectiveStatus: string | null;
  creativeType: string | null;
  reviewStatus: string | null;
  /** Só endereços https (o banco recusa outros). */
  thumbnailUrl: string | null;
}

export interface PlatformStructure {
  campaigns: PlatformCampaign[];
  adGroups: PlatformAdGroup[];
  ads: PlatformAd[];
}

export type MetricLevel = "account" | "campaign" | "ad_group" | "ad";

/**
 * Números de UM dia de UM item. Dinheiro em micros.
 * null = a plataforma não fornece esta métrica (ex.: leads no Google).
 */
export interface DailyMetric {
  date: string;
  level: MetricLevel;
  entityExternalId: string;
  campaignExternalId: string | null;
  adGroupExternalId: string | null;
  adExternalId: string | null;
  spendMicros: number | null;
  impressions: number | null;
  /** Alcance DO DIA (não somar entre dias). */
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversionValueMicros: number | null;
  /** Ações originais da plataforma (auditoria; permite recalcular no futuro). */
  rawActions: unknown | null;
}

export interface DateRange {
  from: string;
  to: string;
}

/** Alcance de um período EXATO, calculado pela plataforma (pessoas únicas). */
export interface PeriodReach {
  level: "account" | "campaign";
  entityExternalId: string;
  from: string;
  to: string;
  reach: number | null;
  impressions: number | null;
  frequency: number | null;
}

/** Dimensões das divisões (Etapa 19.3). region = estado (Meta); city = cidade (Google). */
export type BreakdownDimension = "age" | "gender" | "publisher_platform" | "device" | "hour" | "region" | "city";

/**
 * Números de UM dia de UMA conta, numa fatia de UMA dimensão (ex.: idade "25-34").
 * Valores normalizados: idade "18-24"…"65+"; gênero female/male; horário "00"…"23";
 * "unknown" = a plataforma não identificou.
 */
export interface BreakdownMetric {
  date: string;
  dimension: BreakdownDimension;
  value: string;
  spendMicros: number;
  impressions: number;
  clicks: number;
  linkClicks: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversionValueMicros: number | null;
  /** Ações do Meta resumidas {"tipo": total} (só os tipos que o painel usa). */
  actions: Record<string, number> | null;
}

export interface BreakdownResult {
  rows: BreakdownMetric[];
  /** Dimensões buscadas com sucesso (as demais ficam como estavam). */
  dimensions: BreakdownDimension[];
  /** Dimensões que a plataforma recusou nesta busca (vão para o log). */
  failed: { dimension: BreakdownDimension; code: string }[];
}
