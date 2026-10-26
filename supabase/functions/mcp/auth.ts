import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isRole, type Role } from "../../../packages/shared/src/constants/roles.ts";
import type { Caller } from "./tools.ts";

/**
 * Etapa 40 — quem está chamando o MCP. O login vem SÓ no cabeçalho Authorization (nunca na URL).
 * O Supabase confere o token (assinatura, validade, sessão não encerrada); o papel e o "ativo"
 * são lidos do banco a cada chamada, para que desativar alguém tenha efeito imediato.
 */

/** Papéis que podem usar o MCP na primeira versão (cliente e vendedor ficam de fora). */
export const MCP_ROLES: readonly Role[] = ["admin", "gestor", "operador", "visualizador", "equipe"];

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403, public readonly code: string, message: string) {
    super(message);
  }
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i.exec(h.trim());
  return m ? m[1] : null;
}

/** Lê (sem confiar) o client_id do OAuth no token, só para o registro. A validade é conferida pelo Supabase. */
export function oauthClientId(token: string): string | null {
  try {
    const part = token.split(".")[1] ?? "";
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4)));
    const id = payload?.client_id;
    return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function authenticate(token: string | null, admin: SupabaseClient): Promise<Caller> {
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Faça login no Backstage Flow para usar o MCP.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new AuthError(401, "UNAUTHENTICATED", "Login expirado ou inválido. Conecte de novo.");
  const { data: profile, error: pErr } = await admin.from("profiles").select("id, full_name, role, active").eq("id", data.user.id).maybeSingle();
  if (pErr) throw new Error("Não conseguimos conferir o seu usuário.");
  if (!profile || !profile.active) throw new AuthError(403, "FORBIDDEN", "Usuário desativado no Backstage Flow.");
  if (!isRole(profile.role) || !MCP_ROLES.includes(profile.role)) {
    throw new AuthError(403, "FORBIDDEN", "Seu tipo de usuário não pode usar o MCP nesta versão.");
  }
  return { id: profile.id, name: profile.full_name ?? "", role: profile.role };
}
