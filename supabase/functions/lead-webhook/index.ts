/**
 * Edge Function: lead-webhook (Tracking T5.2b)
 *
 * Endereço que um FORMULÁRIO DE OUTRO SISTEMA (ex.: Responde App) chama a cada resposta:
 *   POST .../functions/v1/lead-webhook?w=<id>   com o cabeçalho x-webhook-key: <chave>
 *   (ou ?w=<id>&k=<chave> para sistemas que só aceitam o endereço)
 *
 * Mesma chave e mesmo mapeamento dos sistemas de venda (T3.2), com finalidade "lead" e um site do Tracking.
 * O lead entra pela mesma porta do script do site (tracking_ingest): origem recalculada no servidor,
 * dados pessoais só em hash, Lead ao Meta pela fila de sempre. O corpo do aviso nunca é guardado.
 *
 * Respostas: 200 {result} (aceito/repetido/ignorado/recusado/teste), 401, 404, 405, 413, 429.
 */
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { buildLeadReceive, LIMIT, MAX_BODY_BYTES, readCredentials } from "./logic.ts";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  const cred = readCredentials(new URL(req.url), req.headers);
  if (!cred) return json(404, { error: "UNKNOWN_WEBHOOK" });
  try {
    const db = adminClient();
    const { data: hit } = await db.rpc("track_limit_hit", { p_bucket: `lw:${cred.id}`, p_max: LIMIT.max, p_window_seconds: LIMIT.windowSeconds });
    if (hit === false) return json(429, { error: "TOO_MANY_REQUESTS" });

    const { data: auth, error: authError } = await db.rpc("sales_webhook_auth", { p_id: cred.id, p_key: cred.key });
    if (authError) throw authError;
    if (!auth || auth.purpose !== "lead") return json(401, { error: "INVALID_KEY" });

    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: "TOO_LARGE" });
    const log = (keys: string[], result: string, reason?: string) =>
      db.rpc("lead_webhook_log", { p: { webhook_id: cred.id, keys, result, reason: reason ?? null } });

    if (!auth.enabled) {
      await log([], "ignorado", "Endereço desligado no CRM.");
      return json(200, { result: "ignorado" });
    }
    const container = auth.container;
    if (!auth.client_active || !container || container.status !== "ativo") {
      await log([], "ignorado", !auth.client_active ? "Cliente desativado." : "Site do Tracking pausado ou removido.");
      return json(200, { result: "ignorado" });
    }

    const r = await buildLeadReceive(cred.id, text, req.headers.get("content-type"), auth.mapping ?? null, container, Date.now(), Boolean(auth.test_mode));
    if (r.result !== "enviar") {
      await log(r.keys, r.result, r.reason);
      return json(200, { result: r.result, reason: r.reason });
    }
    const { data, error } = await db.rpc("tracking_ingest", { p: r.ingest });
    if (error) throw error;
    const status = data?.status as string | undefined;
    const result = status === "duplicado" ? "repetido" : status === "cliente_desativado" ? "ignorado" : "aceito";
    await log(r.keys, result, result === "repetido" ? "Este contato já enviou o formulário hoje." : null as unknown as undefined);
    return json(200, { result });
  } catch (err) {
    await recordError({ source: "servidor", code: "LEAD_WEBHOOK_FAILED", technical: err, context: { funcao: "lead-webhook" } });
    return json(500, { error: "UNKNOWN" });
  }
});
