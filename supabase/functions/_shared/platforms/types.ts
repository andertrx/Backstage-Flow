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
  businessId: string | null;
  businessName: string | null;
  isPrepay: boolean | null;
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
