/**
 * Edge Function: sales-webhook (Tracking T3.2)
 *
 * Endereço que o SISTEMA DE VENDAS do cliente chama a cada venda (qualquer sistema com webhook:
 * loja virtual, plataforma de pagamento, ERP...). Um endereço por sistema:
 *   POST .../functions/v1/sales-webhook?w=<id>   com o cabeçalho x-webhook-key: <chave>
 *   (ou ?w=<id>&k=<chave> para sistemas que só aceitam o endereço)
 *
 * A chave aparece uma vez no CRM; o banco guarda só o hash dela.
 * Cada dado é lido pelo mapeamento feito no CRM. Telefone/e-mail do comprador são cifrados
 * aqui na chegada (SHA-256); o corpo do aviso nunca é guardado nem vai para log.
 *
 * Respostas: 200 {result} (aceito/repetido/ignorado/recusado/teste), 401, 404, 405, 413, 429.
 */
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { buildReceive, LIMIT, MAX_BODY_BYTES, readCredentials } from "./logic.ts";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  const cred = readCredentials(new URL(req.url), req.headers);
  if (!cred) return json(404, { error: "UNKNOWN_WEBHOOK" });
  try {
    const db = adminClient();
    const { data: hit } = await db.rpc("track_limit_hit", { p_bucket: `sv:${cred.id}`, p_max: LIMIT.max, p_window_seconds: LIMIT.windowSeconds });
    if (hit === false) return json(429, { error: "TOO_MANY_REQUESTS" });

    const { data: auth, error: authError } = await db.rpc("sales_webhook_auth", { p_id: cred.id, p_key: cred.key });
    if (authError) throw authError;
    if (!auth) return json(401, { error: "INVALID_KEY" });

    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: "TOO_LARGE" });
    const payload = await buildReceive(cred.id, text, req.headers.get("content-type"), auth.mapping ?? null);
    const { data, error } = await db.rpc("sales_webhook_receive", { p: payload });
    if (error) throw error;
    return json(200, { result: data?.result ?? "recusado" });
  } catch (err) {
    await recordError({ source: "servidor", code: "SALES_WEBHOOK_FAILED", technical: err, context: { funcao: "sales-webhook" } });
    return json(500, { error: "UNKNOWN" });
  }
});
