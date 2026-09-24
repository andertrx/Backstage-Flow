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
  /** Disponível = limite − gasto, só quando os dois vêm da API. */
  availableMicros: number | null;
  availableBasis: "meta_spend_cap" | "google_account_budget" | null;
  budgetEndAt: string | null;
  /** Meta: texto da forma de pagamento, exatamente como veio. */
  fundingDescription: string | null;
  issues: FundingIssue[];
  /** Valores originais (auditoria). Nunca contém tokens. */
  raw: Record<string, unknown>;
}
