import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { AppError } from "./http.ts";

/** Cliente com permissão total. SÓ existe no servidor; nunca vai para o navegador. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Caller {
  id: string;
  email: string;
  role: string;
}

/**
 * Descobre quem está chamando (pelo token de login) e confere no banco se é
 * um administrador ATIVO. O papel é lido da tabela, não do token, para que
 * desativações tenham efeito imediato.
 */
export async function requireAdmin(req: Request, admin: SupabaseClient): Promise<Caller> {
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
  if (!profile || !profile.active || profile.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Apenas administradores podem gerenciar usuários.");
  }
  return { id: profile.id, email: profile.email, role: profile.role };
}
