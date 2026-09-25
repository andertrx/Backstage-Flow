// Busca global: agrupa os resultados por tipo e diz para onde cada um leva.
import {
  AD_ACCOUNT_STATUS_LABELS,
  type AdAccountStatus,
  can,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
  ENTITY_STATUS_LABELS,
  type EntityStatus,
  PLATFORM_LABELS,
  type Role,
} from "@backstage/shared";

export type SearchKind = "cliente" | "conta" | "campanha" | "conjunto" | "anuncio";

export interface SearchRow {
  kind: SearchKind;
  id: string;
  name: string;
  external_id: string | null;
  platform_id: string | null;
  client_id: string;
  client_name: string;
  parent_name: string | null;
  status: string;
}

/** Mínimo de letras para buscar (igual ao banco). */
export const MIN_QUERY = 2;

export const KIND_ORDER: SearchKind[] = ["cliente", "conta", "campanha", "conjunto", "anuncio"];
export const KIND_LABELS: Record<SearchKind, string> = {
  cliente: "Clientes",
  conta: "Contas de anúncio",
  campanha: "Campanhas",
  conjunto: "Conjuntos e grupos",
  anuncio: "Anúncios",
};

const PLATFORM_PATH: Record<string, string> = { meta: "/meta-ads", google: "/google-ads" };

/** Endereço de cada resultado. */
export function resultHref(r: SearchRow): string {
  switch (r.kind) {
    case "cliente":
      return `/clientes/${r.id}`;
    case "conta":
      return `${PLATFORM_PATH[r.platform_id ?? ""] ?? "/"}?cliente=${r.client_id}&conta=${r.id}`;
    case "campanha":
      return `/campanhas/${r.id}`;
    case "conjunto":
      return `/conjuntos/${r.id}`;
    case "anuncio":
      return `/anuncios/${r.id}`;
  }
}

/** Linha de apoio: plataforma, cliente e onde o item fica. */
export function resultDetail(r: SearchRow): string {
  const platform = r.platform_id ? (PLATFORM_LABELS[r.platform_id] ?? r.platform_id) : null;
  const parts =
    r.kind === "cliente"
      ? [r.parent_name]
      : r.kind === "conta"
        ? [platform, r.client_name, r.external_id ? `ID ${r.external_id}` : null]
        : [platform, r.client_name, r.parent_name];
  return parts.filter(Boolean).join(" · ");
}

/** Status em português, só quando não está ativo (o normal não precisa de aviso). */
export function resultStatus(r: SearchRow): string | null {
  if (r.kind === "cliente") return r.status === "ativo" ? null : (CLIENT_STATUS_LABELS[r.status as ClientStatus] ?? r.status);
  if (r.kind === "conta") return r.status === "ativa" ? null : (AD_ACCOUNT_STATUS_LABELS[r.status as AdAccountStatus] ?? r.status);
  return r.status === "ativa" ? null : (ENTITY_STATUS_LABELS[r.status as EntityStatus] ?? r.status);
}

export interface QuickLink {
  label: string;
  href: string;
}

/** Atalhos para um cliente encontrado: painel, plataformas, campanhas e relatórios. */
export function clientShortcuts(clientId: string, role: Role | null | undefined): QuickLink[] {
  const q = `?cliente=${clientId}`;
  return [
    { label: "Dashboard", href: `/${q}` },
    { label: "Meta Ads", href: `/meta-ads${q}` },
    { label: "Google Ads", href: `/google-ads${q}` },
    { label: "Campanhas", href: `/campanhas${q}` },
    ...(can(role, "reports.generate") ? [{ label: "Relatórios", href: `/relatorios${q}` }] : []),
  ];
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  rows: SearchRow[];
}

/** Grupos na ordem fixa (clientes primeiro); grupos vazios somem. */
export function groupResults(rows: SearchRow[]): SearchGroup[] {
  return KIND_ORDER.map((kind) => ({ kind, label: KIND_LABELS[kind], rows: rows.filter((r) => r.kind === kind) })).filter(
    (g) => g.rows.length > 0,
  );
}
