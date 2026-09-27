/**
 * Edge Function: tracking-whatsapp (Etapas 34.5-W e 34.5-W2)
 *
 *   mark { code | conversationId, kind: "lead" | "venda", value?, currency?, orderId?, ud? }
 *        → admin, gestor e operador. App comum: pelo código da mensagem.
 *          API oficial: pela conversa que chegou sozinha pelo webhook.
 *   connection_save { containerId, phoneNumberId, wabaId, appSecret?, enabled }
 *   connection_reveal { containerId } → endereço do webhook e token de verificação
 *   connection_remove { containerId } → apaga os segredos e desliga
 *        → só admin e gestor. Segredos só no Vault.
 *
 * O contato do cliente (se informado) chega JÁ CIFRADO pela tela.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, type Caller, requireRole, userClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import {
  buildMarkIngest,
  type ConnectionInput,
  connectionSchema,
  MarkError,
  type MarkInput,
  markSchema,
  type MarkTarget,
  normalizeCode,
  webhookUrl,
} from "./logic.ts";

const MARKERS = ["admin", "gestor", "operador"] as const;
const MANAGERS = ["admin", "gestor"] as const;

async function audit(db: SupabaseClient, caller: Caller, action: string, clientId: string, details: Record<string, unknown>) {
  const { error } = await db.from("audit_logs").insert({ actor_id: caller.id, action, target_type: "tracking_whatsapp", target_id: clientId, details });
  if (error) await recordError({ source: "servidor", code: "AUDIT_FAILED", technical: error, context: { funcao: "tracking-whatsapp", acao: action }, userId: caller.id });
}

/** Acha o alvo da marcação, conferindo com o RLS de quem pede. */
async function resolveTarget(db: SupabaseClient, req: Request, input: MarkInput): Promise<{ target: MarkTarget; conversationId: number | null }> {
  if (input.code != null) {
    const code = normalizeCode(input.code);
    if (!code) throw new AppError(400, "INVALID_INPUT", "Código inválido. São 6 letras/números, como K7Q2M9.");
    const { data: found, error } = await userClient(req).rpc("tracking_whatsapp_lookup", { p_code: code });
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos buscar o código.", error);
    if (!Array.isArray(found) || found.length === 0) throw new AppError(404, "NOT_FOUND", "Código não encontrado.");
    const { data: c, error: e2 } = await db.from("tracking_whatsapp_clicks")
      .select("container_id, client_id, visitor_id, session_id, page_url, fbp, fbc").eq("code", code).single();
    if (e2) throw new AppError(500, "DB_ERROR", "Não conseguimos ler o clique.", e2);
    return {
      conversationId: null,
      target: { eventPrefix: `wa.${code}`, code, ...c, action_source: "chat", ctwa_clid: null, waba_id: null, ph_hash: null },
    };
  }
  const { data: visible, error } = await userClient(req).from("tracking_whatsapp_conversations").select("id").eq("id", input.conversationId!).maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos buscar a conversa.", error);
  if (!visible) throw new AppError(404, "NOT_FOUND", "Conversa não encontrada.");
  const { data: v, error: e2 } = await db.from("tracking_whatsapp_conversations")
    .select("id, container_id, client_id, visitor_id, session_id, wa_hash, origin, ctwa_clid, click_code, tracking_whatsapp_connections(waba_id)")
    .eq("id", input.conversationId!).single();
  if (e2) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a conversa.", e2);
  const conv = v as unknown as {
    id: number; container_id: string; client_id: string; visitor_id: string; session_id: string; wa_hash: string; origin: string;
    ctwa_clid: string | null; click_code: string | null; tracking_whatsapp_connections: { waba_id: string } | null;
  };
  let click: { page_url: string | null; fbp: string | null; fbc: string | null } = { page_url: null, fbp: null, fbc: null };
  if (conv.click_code) {
    const { data } = await db.from("tracking_whatsapp_clicks").select("page_url, fbp, fbc").eq("code", conv.click_code).single();
    if (data) click = data;
  }
  const fromAd = conv.origin === "anuncio_whatsapp" && conv.ctwa_clid != null;
  return {
    conversationId: conv.id,
    target: {
      // Conversa que veio do botão do site usa o mesmo id da marcação pelo código (não duplica).
      eventPrefix: conv.click_code ? `wa.${conv.click_code}` : `wac.${conv.id}`,
      code: conv.click_code,
      container_id: conv.container_id,
      client_id: conv.client_id,
      visitor_id: conv.visitor_id,
      session_id: conv.session_id,
      ...click,
      action_source: fromAd ? "business_messaging" : "chat",
      ctwa_clid: fromAd ? conv.ctwa_clid : null,
      waba_id: conv.tracking_whatsapp_connections?.waba_id ?? null,
      ph_hash: conv.wa_hash,
    },
  };
}

async function mark(db: SupabaseClient, req: Request, caller: Caller, input: MarkInput) {
  const { target, conversationId } = await resolveTarget(db, req, input);
  const { data: container } = await db.from("tracking_containers").select("test_mode").eq("id", target.container_id).single();
  let payload;
  try {
    payload = buildMarkIngest(input, target, { test: container?.test_mode ?? false, now: new Date(), randomId: crypto.randomUUID().slice(0, 8) });
  } catch (err) {
    if (err instanceof MarkError) throw new AppError(400, "INVALID_INPUT", err.userMessage);
    throw err;
  }
  const { data: result, error } = await db.rpc("tracking_ingest", { p: payload });
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos registrar a marcação.", error);
  const status = (result as { status: string }).status;
  if (status === "compra_duplicada") throw new AppError(409, "INVALID_STATE", "Este nº de pedido já foi registrado para este site.");
  if (status === "duplicado") return { status: "ja_marcado" };
  if (status !== "ok") throw new AppError(500, "DB_ERROR", "Não conseguimos registrar a marcação.", result);
  const leadId = (result as { lead_id?: number }).lead_id ?? null;

  if (target.code) {
    const { error: e } = await db.rpc("tracking_whatsapp_mark", { p_code: target.code, p_kind: input.kind, p_user_id: caller.id, p_lead_id: leadId });
    if (e) throw new AppError(500, "DB_ERROR", "Não conseguimos atualizar o clique.", e);
  }
  if (conversationId) {
    const { error: e } = await db.rpc("tracking_whatsapp_conversation_mark", { p_id: conversationId, p_kind: input.kind, p_user_id: caller.id, p_lead_id: leadId });
    if (e) throw new AppError(500, "DB_ERROR", "Não conseguimos atualizar a conversa.", e);
  }
  await audit(db, caller, `tracking_whatsapp.${input.kind}`, target.client_id, {
    codigo: target.code, conversa: conversationId, valor: input.value ?? null, moeda: input.currency ?? null, pedido: input.orderId ?? null,
    contato_cifrado: input.ud ? Object.keys(input.ud) : [],
  });
  return { status: "ok", leadId };
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
    .select("id, phone_number_id, has_app_secret").eq("container_id", site.id).maybeSingle();
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

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const body = await req.json().catch(() => null);
  const isConnection = typeof body?.action === "string" && body.action.startsWith("connection_");
  const parsed = isConnection ? connectionSchema.safeParse(body) : markSchema.safeParse(body);
  if (!parsed.success) {
    await requireRole(req, db, MARKERS);
    throw new AppError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.message);
  }
  const caller = await requireRole(req, db, isConnection ? MANAGERS : MARKERS);
  await enforceRateLimit(db, isConnection ? "tracking.manage" : "tracking.whatsapp", caller.id);
  const data = isConnection
    ? await connection(db, req, caller, parsed.data as ConnectionInput)
    : await mark(db, req, caller, parsed.data as MarkInput);
  return json(req, 200, { data });
}, "tracking-whatsapp"));
