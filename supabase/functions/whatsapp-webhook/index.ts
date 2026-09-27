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
 */
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { extractInbound, MAX_BODY_BYTES, safeEqual, validSignature } from "./logic.ts";

const text = (status: number, body = "") => new Response(body, { status, headers: { "Content-Type": "text/plain" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
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
    for (const msg of await extractInbound(payload, conn.phone_number_id)) {
      const { error } = await db.rpc("tracking_whatsapp_inbound", { p: { connection_id: conn.id, ...msg } });
      if (error) throw error;
    }
    return text(200);
  } catch (err) {
    await recordError({ source: "servidor", code: "WHATSAPP_WEBHOOK_FAILED", technical: err, context: { funcao: "whatsapp-webhook" } });
    // 500 = o Meta tenta de novo depois (avisos repetidos não contam em dobro).
    return text(500);
  }
});
