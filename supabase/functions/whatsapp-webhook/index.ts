/**
 * Edge Function: whatsapp-webhook (Etapa 34.5-W2)
 *
 * Endereço que o Meta chama a cada mensagem recebida no número da empresa
 * (WhatsApp Business Platform / API oficial). Um endereço por conexão:
 *   .../functions/v1/whatsapp-webhook?c=<id da conexão>
 *
 *   GET  → verificação do Meta (hub.verify_token precisa bater com o do cofre).
 *   POST → aviso de mensagem. Só aceito com a assinatura X-Hub-Signature-256
 *          feita com o segredo do app (guardado no Vault).
 *
 * Não guarda o texto das conversas: só o hash do número do cliente, a origem
 * (anúncio de WhatsApp ou código do site) e a contagem de mensagens.
 * Tracking T4.2: um endereço só para o app do Meta DA AGÊNCIA (números ligados pelo cadastro oficial, Coexistence):
 *   .../functions/v1/whatsapp-webhook?app=1 — assinatura e token de verificação do app da agência (cofre);
 *   cada aviso é separado pelo número (metadata.phone_number_id) e vai para a conexão daquele número.
 * Tracking T4.1: mensagens do atendente ("smb_message_echoes" / "message_echoes") são lidas só na
 * memória para achar as frases do cliente (ex.: "Parabéns pela sua compra de R$ 297") e marcar o contato.
 */
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import type { WaTrigger } from "../../../packages/shared/src/tracking/waTriggers.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { extractEchoes, extractInbound, hasEchoes, MAX_BODY_BYTES, phoneNumberIds, safeEqual, validSignature } from "./logic.ts";

const text = (status: number, body = "") => new Response(body, { status, headers: { "Content-Type": "text/plain" } });

/** Mensagens recebidas e frases do atendente de UM número (conexão). */
async function processFor(db: SupabaseClient, conn: { id: string; phone_number_id: string }, payload: unknown) {
  for (const msg of await extractInbound(payload, conn.phone_number_id)) {
    const { error } = await db.rpc("tracking_whatsapp_inbound", { p: { connection_id: conn.id, ...msg } });
    if (error) throw error;
  }
  // Tracking T4.1: frases que o atendente mandou (como no Tintim).
  if (hasEchoes(payload)) {
    const { data: triggers, error: tErr } = await db.rpc("wa_triggers_for", { p_connection: conn.id });
    if (tErr) throw tErr;
    for (const echo of await extractEchoes(payload, conn.phone_number_id, (triggers ?? []) as WaTrigger[])) {
      const { error } = await db.rpc("wa_echo", { p: { connection_id: conn.id, ...echo } });
      if (error) throw error;
    }
  }
}

/** T4.2: webhook do app da agência (todos os números ligados por Coexistence). */
async function appWebhook(req: Request, url: URL, db: SupabaseClient): Promise<Response> {
  const { data: creds, error } = await db.rpc("wa_app_credentials");
  if (error) throw error;
  const c = (creds ?? {}) as { app_secret?: string | null; verify_token?: string | null };
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && typeof c.verify_token === "string" &&
      safeEqual(url.searchParams.get("hub.verify_token") ?? "", c.verify_token);
    return ok ? text(200, url.searchParams.get("hub.challenge") ?? "") : text(403);
  }
  if (req.method !== "POST") return text(405);
  const body = await req.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return text(413);
  if (typeof c.app_secret !== "string" || !(await validSignature(req.headers.get("x-hub-signature-256"), body, c.app_secret))) return text(401);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return text(400);
  }
  for (const phoneId of phoneNumberIds(payload)) {
    const { data: conn } = await db.rpc("wa_coex_connection_for", { p_phone_number_id: phoneId });
    const found = conn as { id: string; phone_number_id: string; enabled: boolean } | null;
    if (!found?.enabled) continue;
    await db.from("tracking_whatsapp_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", found.id);
    await processFor(db, found, payload);
  }
  return text(200);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("app") === "1") {
    try {
      return await appWebhook(req, url, adminClient());
    } catch (err) {
      await recordError({ source: "servidor", code: "WHATSAPP_WEBHOOK_FAILED", technical: err, context: { funcao: "whatsapp-webhook", modo: "app" } });
      return text(500);
    }
  }
  const connectionId = url.searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(connectionId)) return text(404);
  const db = adminClient();

  const { data: conn } = await db.from("tracking_whatsapp_connections")
    .select("id, phone_number_id, enabled").eq("id", connectionId).maybeSingle();
  if (!conn) return text(404);

  try {
    if (req.method === "GET") {
      const { data: token } = await db.rpc("tracking_whatsapp_secret_get", { p_connection_id: conn.id, p_kind: "verify_token" });
      const ok = url.searchParams.get("hub.mode") === "subscribe" && typeof token === "string" &&
        safeEqual(url.searchParams.get("hub.verify_token") ?? "", token);
      return ok ? text(200, url.searchParams.get("hub.challenge") ?? "") : text(403);
    }
    if (req.method !== "POST") return text(405);

    const body = await req.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return text(413);
    const { data: secret } = await db.rpc("tracking_whatsapp_secret_get", { p_connection_id: conn.id, p_kind: "app_secret" });
    if (typeof secret !== "string" || !(await validSignature(req.headers.get("x-hub-signature-256"), body, secret))) {
      await db.from("tracking_whatsapp_connections")
        .update({ last_error_at: new Date().toISOString(), last_error_message: "Aviso do WhatsApp recusado: assinatura inválida (confira o segredo do app)." })
        .eq("id", conn.id);
      return text(401);
    }
    if (!conn.enabled) return text(200);

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return text(400);
    }
    await processFor(db, conn, payload);
    return text(200);
  } catch (err) {
    await recordError({ source: "servidor", code: "WHATSAPP_WEBHOOK_FAILED", technical: err, context: { funcao: "whatsapp-webhook" } });
    // 500 = o Meta tenta de novo depois (avisos repetidos não contam em dobro).
    return text(500);
  }
});
