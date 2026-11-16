/**
 * Conferência das permissões do token do Meta (Fase 35.1 — Campaign Builder).
 * Só LÊ (`GET /me/permissions`): não cria nem altera nada no Meta.
 */
import { graphGet } from "./client.ts";

/** Permissões que o Campaign Builder usa, com o motivo de cada uma. */
export const BUILDER_PERMISSIONS = [
  { name: "ads_management", why: "Criar e alterar campanhas, conjuntos e anúncios.", needsToCreate: true },
  { name: "ads_read", why: "Ler campanhas e métricas.", needsToCreate: true },
  { name: "business_management", why: "Listar contas, páginas e Instagram da BM.", needsToCreate: true },
  { name: "pages_show_list", why: "Escolher a página do anúncio.", needsToCreate: true },
  { name: "pages_read_engagement", why: "Ler dados da página usada no anúncio.", needsToCreate: true },
  { name: "instagram_basic", why: "Escolher o perfil de Instagram do anúncio.", needsToCreate: true },
] as const;

export type PermissionState = "concedida" | "recusada" | "ausente";

export interface PermissionCheck {
  name: string;
  why: string;
  state: PermissionState;
}

export interface PermissionsReport {
  checks: PermissionCheck[];
  /** Todas as permissões necessárias para criar campanha estão concedidas? */
  canCreate: boolean;
  /** Só faltam permissões de escrita? (leitura funciona) */
  canRead: boolean;
  /** Nomes concedidos que não são usados pelo Builder (informativo). */
  others: string[];
}

interface MetaPermission {
  permission?: string;
  status?: string;
}

/** Transforma a resposta de `/me/permissions` no relatório mostrado na tela. */
export function summarizePermissions(data: MetaPermission[]): PermissionsReport {
  const byName = new Map<string, string>();
  for (const p of data) if (p.permission) byName.set(p.permission, p.status ?? "");
  const checks: PermissionCheck[] = BUILDER_PERMISSIONS.map((p) => {
    const status = byName.get(p.name);
    const state: PermissionState = status === "granted" ? "concedida" : status === "declined" || status === "expired" ? "recusada" : "ausente";
    return { name: p.name, why: p.why, state };
  });
  const granted = (n: string) => checks.find((c) => c.name === n)?.state === "concedida";
  const known = new Set<string>(BUILDER_PERMISSIONS.map((p) => p.name));
  return {
    checks,
    canCreate: checks.every((c) => c.state === "concedida"),
    canRead: granted("ads_read") && granted("business_management"),
    others: [...byName.entries()].filter(([n, s]) => s === "granted" && !known.has(n)).map(([n]) => n).sort(),
  };
}

export async function fetchPermissions(token: string, fetchImpl: typeof fetch = fetch): Promise<PermissionsReport> {
  const body = await graphGet<{ data?: MetaPermission[] }>("me/permissions", {}, token, fetchImpl);
  return summarizePermissions(body.data ?? []);
}
