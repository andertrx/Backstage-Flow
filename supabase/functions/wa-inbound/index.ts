/**
 * Edge Function: wa-inbound (Tracking T5.3)
 *
 * Endereço que o SERVIDOR DE WHATSAPP NÃO OFICIAL (estilo Evolution API) chama a cada mensagem do número do cliente:
 *   POST .../functions/v1/wa-inbound?c=<id da conexão>   com o cabeçalho x-webhook-key: <chave>
 *   (ou ?c=<id>&k=<chave> para servidores que só aceitam o endereço)
 *
 * Mensagem recebida → conta a conversa, lê o código "(ref. …)" do botão do site e a origem do anúncio de WhatsApp (ctwa_clid).
 * Mensagem enviada pela agência → só é lida para achar as frases de venda/etapa do cliente (T4.1).
 * Grupos, listas de transmissão e outros eventos são ignorados. O número vira hash. O texto só é guardado se a opção
 * "guardar conversas" estiver ligada no site (opt-in), sem prazo e com o telefone completo, e só depois de o aviso de privacidade ser confirmado (T5.7).
 *
 * Respostas: 200 (sempre que o aviso foi aceito, mesmo ignorado), 401, 404, 405, 413, 429.
 */
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import type { WaTrigger } from "../../../packages/shared/src/tracking/waTriggers.ts";
import { echoesFor, HISTORY_MAX_BODY_BYTES, LIMIT, planGatewayPayload } from "./logic.ts";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = /^[0-9a-f]{48}$/;
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  const url = new URL(req.url);
  const id = (url.searchParams.get("c") ?? "").toLowerCase();
  const key = (req.headers.get("x-webhook-key") ?? url.searchParams.get("k") ?? "").trim().toLowerCase();
  if (!ID.test(id) || !KEY.test(key)) return json(404, { error: "UNKNOWN_CONNECTION" });
  try {
    const db = adminClient();
    const { data: hit } = await db.rpc("track_limit_hit", { p_bucket: `wi:${id}`, p_max: LIMIT.max * 5, p_window_seconds: LIMIT.windowSeconds });
    if (hit === false) return json(429, { error: "TOO_MANY_REQUESTS" });
    const { data: auth, error: authError } = await db.rpc("wa_unofficial_auth", { p_id: id, p_key: key });
    if (authError) throw authError;
    if (!auth) return json(401, { error: "INVALID_KEY" });

    const body = await req.text();
    if (new TextEncoder().encode(body).length > HISTORY_MAX_BODY_BYTES) return json(413, { error: "TOO_LARGE" });
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(200, { result: "ignorado" });
    }
    if (!auth.enabled || !auth.client_active) return json(200, { result: "ignorado" });

    const { inbound, echoRaw, store, ignored, reasons } = await planGatewayPayload(payload, Date.now());
    // Diagnóstico dos avisos grandes (histórico): só contagens e motivos, nunca texto, nome ou telefone.
    if (body.length > 5000) console.log(JSON.stringify({ wa_inbound_diag: { bytes: body.length, ignored, reasons, store: store.length, history: store.filter((m) => m.history).length } }));
    for (const msg of inbound) {
      const { error } = await db.rpc("tracking_whatsapp_inbound", { p: { connection_id: id, ...msg } });
      if (error) throw error;
    }
    // Texto: só com a opção ligada no site e o aviso confirmado (o banco confere); guardado sem prazo (Tracking T5.7).
    if (auth.store_messages) {
      for (const msg of store.filter((m) => !m.history)) {
        const { error } = await db.rpc("wa_message_store", { p: { connection_id: id, ...msg } });
        if (error) throw error;
      }
      // T5.8: histórico antigo do aparelho, em lotes (só guarda na caixa de conversas; não conta lead, venda nem frase).
      const old = store.filter((m) => m.history);
      for (let i = 0; i < old.length; i += 200) {
        const { error } = await db.rpc("wa_messages_store_many", { p_connection: id, p_items: old.slice(i, i + 200) });
        if (error) throw error;
      }
    }
    if (echoRaw.length) {
      const { data: triggers, error: tErr } = await db.rpc("wa_triggers_for", { p_connection: id });
      if (tErr) throw tErr;
      for (const echo of await echoesFor(echoRaw, (triggers ?? []) as WaTrigger[])) {
        const { error } = await db.rpc("wa_echo", { p: { connection_id: id, ...echo } });
        if (error) throw error;
      }
    }
    return json(200, { result: "ok", recebidas: inbound.length, enviadas: echoRaw.length, ignoradas: ignored, historico: store.filter((m) => m.history).length });
  } catch (err) {
    await recordError({ source: "servidor", code: "WA_INBOUND_FAILED", technical: err, context: { funcao: "wa-inbound" } });
    // 500 = o servidor de WhatsApp tenta de novo (mensagem repetida não conta em dobro).
    return json(500, { error: "UNKNOWN" });
  }
});
