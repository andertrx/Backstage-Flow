/**
 * Edge Function: tracking-whatsapp (Etapas 34.5-W2 e T4.2)
 *
 *   connection_save { containerId, phoneNumberId, wabaId, appSecret?, enabled }
 *   connection_reveal { containerId } → endereço do webhook e token de verificação
 *   connection_remove { containerId } → apaga os segredos e desliga
 *        → só admin e gestor. Segredos só no Vault.
 *   coex_start { containerId, redirectUri } → endereço do cadastro oficial do Meta (Coexistence, T4.2)
 *   coex_complete { code, state, redirectUri } → liga o número (token só no cofre)
 *        → só admin e gestor; precisa do app do Meta da agência configurado em Integrações.
 *
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, type Caller, requireRole, userClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { type ConnectionInput, connectionSchema, webhookUrl } from "./logic.ts";
import { buildCoexAuthorizeUrl, type CoexInput, coexSchema, completeCoex, credentialsReady, type AppCredentials } from "./coex.ts";

const MANAGERS = ["admin", "gestor"] as const;

async function audit(db: SupabaseClient, caller: Caller, action: string, clientId: string, details: Record<string, unknown>) {
  const { error } = await db.from("audit_logs").insert({ actor_id: caller.id, action, target_type: "tracking_whatsapp", target_id: clientId, details });
  if (error) await recordError({ source: "servidor", code: "AUDIT_FAILED", technical: error, context: { funcao: "tracking-whatsapp", acao: action }, userId: caller.id });
}

async function visibleContainer(req: Request, id: string) {
  const { data, error } = await userClient(req).from("tracking_containers").select("id, client_id").eq("id", id).maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos verificar o site.", error);
  if (!data) throw new AppError(404, "NOT_FOUND", "Site não encontrado.");
  return data as { id: string; client_id: string };
}

async function connection(db: SupabaseClient, req: Request, caller: Caller, input: ConnectionInput) {
  const site = await visibleContainer(req, input.containerId);
  const { data: existing } = await db.from("tracking_whatsapp_connections")
    .select("id, phone_number_id, has_app_secret, mode").eq("container_id", site.id).maybeSingle();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  if (input.action === "connection_remove") {
    if (!existing) throw new AppError(404, "NOT_FOUND", "Este site não tem WhatsApp (API oficial) configurado.");
    const { error } = await db.rpc("tracking_whatsapp_secret_delete", { p_connection_id: existing.id });
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos apagar os segredos.", error);
    await audit(db, caller, "tracking_whatsapp.connection_remove", site.client_id, { phone_number_id: existing.phone_number_id });
    return { removed: true };
  }
  if (input.action === "connection_reveal") {
    if (!existing) throw new AppError(404, "NOT_FOUND", "Salve a conexão primeiro.");
    const { data: token } = await db.rpc("tracking_whatsapp_secret_get", { p_connection_id: existing.id, p_kind: "verify_token" });
    await audit(db, caller, "tracking_whatsapp.connection_reveal", site.client_id, { phone_number_id: existing.phone_number_id });
    return { webhookUrl: webhookUrl(supabaseUrl, existing.id), verifyToken: token ?? null };
  }

  if (existing?.mode === "coexistencia") {
    throw new AppError(400, "INVALID_STATE", "Este número foi ligado pelo cadastro oficial do Meta (Coexistence). Para trocar, use \"Ligar WhatsApp Business\" de novo.");
  }
  let id = existing?.id as string | undefined;
  const fields = { phone_number_id: input.phoneNumberId, waba_id: input.wabaId, updated_by: caller.id };
  if (!id) {
    const { data, error } = await db.from("tracking_whatsapp_connections")
      .insert({ ...fields, container_id: site.id, client_id: site.client_id, enabled: false, created_by: caller.id }).select("id").single();
    if (error) {
      const dup = (error as { code?: string }).code === "23505";
      throw new AppError(dup ? 409 : 500, dup ? "INVALID_STATE" : "DB_ERROR", dup ? "Este número já está ligado a outro site." : "Não conseguimos salvar a conexão.", error);
    }
    id = (data as { id: string }).id;
    // Token de verificação: gerado aqui, guardado no cofre, mostrado só para quem configura.
    const verify = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    const { error: e } = await db.rpc("tracking_whatsapp_secret_set", { p_connection_id: id, p_kind: "verify_token", p_secret: verify });
    if (e) throw new AppError(500, "DB_ERROR", "Não conseguimos guardar o token de verificação.", e);
  } else {
    const { error } = await db.from("tracking_whatsapp_connections").update(fields).eq("id", id);
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos salvar a conexão.", error);
  }
  if (input.appSecret) {
    const { error } = await db.rpc("tracking_whatsapp_secret_set", { p_connection_id: id, p_kind: "app_secret", p_secret: input.appSecret });
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos guardar o segredo do app.", error);
  }
  const hasSecret = !!existing?.has_app_secret || !!input.appSecret;
  if (input.enabled && !hasSecret) throw new AppError(400, "INVALID_STATE", "Cole o segredo do app do Meta antes de ligar (sem ele não dá para conferir que o aviso veio mesmo do Meta).");
  const { error: e3 } = await db.from("tracking_whatsapp_connections").update({ enabled: input.enabled }).eq("id", id);
  if (e3) throw new AppError(500, "DB_ERROR", "Não conseguimos ligar/desligar.", e3);
  await audit(db, caller, "tracking_whatsapp.connection_save", site.client_id, {
    phone_number_id: input.phoneNumberId, waba_id: input.wabaId, enabled: input.enabled, segredo_do_app: input.appSecret ? "alterado (Vault)" : "sem alteração",
  });
  return { id, enabled: input.enabled, hasAppSecret: hasSecret, webhookUrl: webhookUrl(supabaseUrl, id) };
}

async function appCredentials(db: SupabaseClient): Promise<AppCredentials | null> {
  const { data, error } = await db.rpc("wa_app_credentials");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler o app do Meta da agência.", error);
  return (data ?? null) as AppCredentials | null;
}

async function coex(db: SupabaseClient, req: Request, caller: Caller, input: CoexInput) {
  const creds = await appCredentials(db);
  if (!credentialsReady(creds)) {
    throw new AppError(400, "INVALID_STATE", "O administrador precisa configurar o app do Meta da agência em Integrações → WhatsApp (Coexistence).");
  }
  if (input.action === "coex_start") {
    const site = await visibleContainer(req, input.containerId);
    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    await db.from("oauth_states").delete().eq("user_id", caller.id).lt("expires_at", new Date().toISOString());
    const { error } = await db.from("oauth_states").insert({ state, provider: "meta", user_id: caller.id, redirect_uri: input.redirectUri, context: { kind: "wa_coex", container_id: site.id } });
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos iniciar o cadastro.", error);
    return { url: buildCoexAuthorizeUrl(creds, input.redirectUri, state) };
  }
  const { data: st, error: stErr } = await db.from("oauth_states").select("state, user_id, redirect_uri, expires_at, context")
    .eq("state", input.state).maybeSingle();
  if (stErr) throw new AppError(500, "DB_ERROR", "Não conseguimos conferir a autorização.", stErr);
  await db.from("oauth_states").delete().eq("state", input.state);
  const ctx = (st?.context ?? {}) as { kind?: string; container_id?: string };
  if (!st || st.user_id !== caller.id || st.redirect_uri !== input.redirectUri || ctx.kind !== "wa_coex" || !ctx.container_id
      || new Date(st.expires_at as string).getTime() < Date.now()) {
    throw new AppError(400, "INVALID_STATE", "Autorização inválida ou expirada. Tente ligar de novo.");
  }
  const site = await visibleContainer(req, ctx.container_id);
  const r = await completeCoex(creds, input.code, input.redirectUri);
  const { error } = await db.rpc("wa_coex_connect", { p: {
    container_id: site.id, phone_number_id: r.phone_number_id, waba_id: r.waba_id, token: r.token,
    display_phone: r.display_phone, verified_name: r.verified_name, user_id: caller.id,
  } });
  if (error) {
    const dup = (error as { code?: string }).code === "23505";
    throw new AppError(dup ? 409 : 500, dup ? "INVALID_STATE" : "DB_ERROR", dup ? "Este número já está ligado a outro site." : "Não conseguimos salvar a ligação.", error);
  }
  return { containerId: site.id, displayPhone: r.display_phone, verifiedName: r.verified_name, numbers: r.numbers };
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const body = await req.json().catch(() => null);
  if (typeof body?.action === "string" && body.action.startsWith("coex_")) {
    const parsedCoex = coexSchema.safeParse(body);
    const callerCoex = await requireRole(req, db, MANAGERS);
    if (!parsedCoex.success) throw new AppError(400, "INVALID_INPUT", parsedCoex.error.issues[0]?.message ?? "Dados inválidos.", parsedCoex.error.message);
    await enforceRateLimit(db, "tracking.manage", callerCoex.id);
    return json(req, 200, { data: await coex(db, req, callerCoex, parsedCoex.data) });
  }
  const parsed = connectionSchema.safeParse(body);
  if (!parsed.success) {
    await requireRole(req, db, MANAGERS);
    throw new AppError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.message);
  }
  const caller = await requireRole(req, db, MANAGERS);
  await enforceRateLimit(db, "tracking.manage", caller.id);
  return json(req, 200, { data: await connection(db, req, caller, parsed.data) });
}, "tracking-whatsapp"));
