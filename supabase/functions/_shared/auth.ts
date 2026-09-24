import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { AppError } from "./http.ts";

/** Cliente com permissão total. SÓ existe no servidor; nunca vai para o navegador. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente "com o crachá do usuário": as consultas passam pelo RLS como se
 * fossem feitas pelo site. Usado para conferir se o usuário enxerga um dado.
 */
export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

export interface Caller {
  id: string;
  email: string;
  role: string;
}

/**
 * Descobre quem está chamando (pelo token de login) e confere no banco se o
 * usuário está ATIVO e tem um dos papéis permitidos. O papel é lido da tabela,
 * não do token, para que desativações tenham efeito imediato.
 */
export async function requireRole(req: Request, admin: SupabaseClient, roles: readonly string[]): Promise<Caller> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AppError(401, "UNAUTHENTICATED", "Faça login para continuar.");

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Sua sessão expirou. Faça login novamente.", userError);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, role, active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) throw new AppError(500, "DB_ERROR", "Não conseguimos verificar sua permissão.", profileError);
  if (!profile || !profile.active || !roles.includes(profile.role)) {
    throw new AppError(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
  }
  return { id: profile.id, email: profile.email, role: profile.role };
}

export async function requireAdmin(req: Request, admin: SupabaseClient): Promise<Caller> {
  try {
    return await requireRole(req, admin, ["admin"]);
  } catch (err) {
    if (err instanceof AppError && err.code === "FORBIDDEN") {
      throw new AppError(403, "FORBIDDEN", "Apenas administradores podem gerenciar usuários.");
    }
    throw err;
  }
}
