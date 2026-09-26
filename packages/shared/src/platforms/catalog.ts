/**
 * Catálogo ÚNICO das plataformas de anúncio.
 *
 * Tudo o que muda de uma plataforma para outra (nome, endereço da tela, como
 * mostrar o id da conta, nome dos níveis, indicadores, saldo...) fica aqui.
 * As telas e relatórios leem este catálogo em vez de escrever "meta"/"google".
 *
 * Adicionar TikTok Ads, LinkedIn Ads, Pinterest Ads etc. no futuro:
 *   1. uma linha na tabela public.platforms (migração);
 *   2. um adaptador no servidor (supabase/functions/_shared/platforms/<id>/);
 *   3. uma entrada neste catálogo.
 * Passo a passo completo: docs/etapa-28-novas-plataformas/README.md.
 */
import type { KpiKey } from "../metrics/kpis.ts";

/** Mesmo formato aceito pela coluna public.platforms.id. */
export const PLATFORM_ID_PATTERN = /^[a-z][a-z0-9_]{1,30}$/;

export interface PlatformDefinition {
  /** Igual a public.platforms.id. */
  id: string;
  /** Nome exibido (ex.: "Meta Ads"). */
  name: string;
  /** Endereço da tela da plataforma no menu (ex.: "/meta-ads"). */
  path: string;
  /** Como a pessoa se conecta: token colado (Meta) ou login da plataforma (OAuth). */
  connection: "token" | "oauth";
  /** Nome do nível entre campanha e anúncio. */
  groupLevel: { singular: string; plural: string; short: string };
  /**
   * Agrupador de contas (Business Manager, MCC...).
   * short: prefixo do grupo ("BM: Agência"); count: palavra na contagem ("3 BMs");
   * none: contas sem agrupador; via: texto antes do nome ("via Agência").
   */
  business: { label: string; short: string; count: { one: string; many: string }; none: string; via: string };
  /** Como a plataforma mostra o id da conta (o banco guarda só os números). */
  formatAccountId(externalId: string): string;
  /** O que a plataforma oferece. false = a tela não mostra (nunca inventamos o número). */
  capabilities: {
    /** Alcance (pessoas únicas). */
    reach: boolean;
    leads: boolean;
    messages: boolean;
    /** Páginas / perfis do Instagram ligados à conta. */
    assets: boolean;
    /** Acesso às contas por uma conta administradora (MCC do Google). */
    managerAccess: boolean;
  };
  /** Dinheiro da conta: "saldo" (limite de gastos) ou "orçamento" (orçamento da conta). */
  money: "saldo" | "orçamento";
  /** Indicadores da tela da plataforma, na ordem. */
  kpis: KpiKey[];
  /** Nomes próprios da plataforma para alguns indicadores. */
  kpiLabels?: Partial<Record<KpiKey, string>>;
  /** Resultado principal na lista de campanhas. */
  result: "leads" | "conversions";
}

const META: PlatformDefinition = {
  id: "meta",
  name: "Meta Ads",
  path: "/meta-ads",
  connection: "token",
  groupLevel: { singular: "Conjunto de anúncios", plural: "Conjuntos de anúncios", short: "Conjuntos" },
  business: { label: "Business Manager", short: "BM", count: { one: "BM", many: "BMs" }, none: "Sem Business Manager", via: "" },
  formatAccountId: (externalId) => `act_${externalId}`,
  capabilities: { reach: true, leads: true, messages: true, assets: true, managerAccess: false },
  money: "saldo",
  kpis: ["spend", "reach", "impressions", "frequency", "clicks", "ctr", "cpc", "cpm", "leads", "messages", "conversions", "cpl", "cpa", "roas"],
  result: "leads",
};

const GOOGLE: PlatformDefinition = {
  id: "google",
  name: "Google Ads",
  path: "/google-ads",
  connection: "oauth",
  groupLevel: { singular: "Grupo de anúncios", plural: "Grupos de anúncios", short: "Grupos" },
  business: { label: "MCC (conta administradora)", short: "MCC", count: { one: "grupo", many: "grupos" }, none: "Acesso direto (sem MCC)", via: "via " },
  formatAccountId: (externalId) => {
    const d = externalId.replace(/\D/g, "");
    return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : externalId;
  },
  capabilities: { reach: false, leads: false, messages: false, assets: false, managerAccess: true },
  money: "orçamento",
  kpis: ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversions", "cpa", "conversion_value", "roas"],
  kpiLabels: { cpa: "Custo/conversão" },
  result: "conversions",
};

/** Plataformas ativas, na ordem do menu. */
export const PLATFORMS: readonly PlatformDefinition[] = [META, GOOGLE];

export const PLATFORM_IDS: readonly string[] = PLATFORMS.map((p) => p.id);

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

/** Definição da plataforma; undefined se ela ainda não existe no sistema. */
export function getPlatform(id: string | null | undefined): PlatformDefinition | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function isPlatformId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}

/** Nome da plataforma; se desconhecida, o próprio id (nunca some da tela). */
export function platformName(id: string): string {
  return getPlatform(id)?.name ?? id;
}

/** { meta: "Meta Ads", google: "Google Ads", ... } */
export const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name]));

/** Nome do "agrupador" de contas em cada plataforma. */
export const BUSINESS_LABELS: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.business.label]));

const GENERIC_BUSINESS: PlatformDefinition["business"] = {
  label: "Agrupador",
  short: "Grupo",
  count: { one: "grupo", many: "grupos" },
  none: "Sem agrupador",
  via: "",
};

/** Agrupador de contas da plataforma (ou um genérico, se ela for desconhecida). */
export function platformBusiness(id: string): PlatformDefinition["business"] {
  return getPlatform(id)?.business ?? GENERIC_BUSINESS;
}

/** Opções para filtros ("Todas as plataformas" fica a cargo da tela). */
export const PLATFORM_OPTIONS: readonly { value: string; label: string }[] = PLATFORMS.map((p) => ({ value: p.id, label: p.name }));

/**
 * Como cada plataforma exibe o ID da conta:
 *   Meta:   act_1234567890   (o banco guarda só os números)
 *   Google: 123-456-7890     (Customer ID com traços)
 */
export function formatAccountId(platform: string, externalId: string): string {
  return getPlatform(platform)?.formatAccountId(externalId) ?? externalId;
}
