/**
 * Edge Function: tracking-whatsapp (Etapa 34.5-W)
 *
 * A equipe marca uma conversa do WhatsApp (aplicativo comum) como Lead ou
 * Venda pelo código de rastreio que veio na mensagem. Só admin, gestor e
 * operador, e só para clientes que a pessoa enxerga.
 *
 *   mark { code, kind: "lead" | "venda", value?, currency?, orderId?, ud? }
 *
 * O contato do cliente (e-mail/telefone/nome), se informado, chega JÁ CIFRADO
 * pela tela. A marcação vira evento normal: leads, compras e Meta CAPI ("chat").
 */
import { adminClient, requireRole, userClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { buildMarkIngest, type Click, MarkError, markSchema, normalizeCode } from "./logic.ts";

const ROLES = ["admin", "gestor", "operador"] as const;

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = markSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await requireRole(req, db, ROLES);
    throw new AppError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.message);
  }
  const input = parsed.data;
  const caller = await requireRole(req, db, ROLES);
  await enforceRateLimit(db, "tracking.whatsapp", caller.id);

  const code = normalizeCode(input.code);
  if (!code) throw new AppError(400, "INVALID_INPUT", "Código inválido. São 6 letras/números, como K7Q2M9.");

  // Enxerga? (RLS de quem pede)
  const { data: found, error: lookupError } = await userClient(req).rpc("tracking_whatsapp_lookup", { p_code: code });
  if (lookupError) throw new AppError(500, "DB_ERROR", "Não conseguimos buscar o código.", lookupError);
  if (!Array.isArray(found) || found.length === 0) throw new AppError(404, "NOT_FOUND", "Código não encontrado.");

  const { data: click, error: clickError } = await db.from("tracking_whatsapp_clicks")
    .select("code, container_id, client_id, visitor_id, session_id, page_url, fbp, fbc").eq("code", code).single();
  if (clickError) throw new AppError(500, "DB_ERROR", "Não conseguimos ler o clique.", clickError);
  const { data: container } = await db.from("tracking_containers").select("test_mode").eq("id", click.container_id).single();

  let payload;
  try {
    payload = buildMarkIngest(input, click as Click, { test: container?.test_mode ?? false, now: new Date(), randomId: crypto.randomUUID().slice(0, 8) });
  } catch (err) {
    if (err instanceof MarkError) throw new AppError(400, "INVALID_INPUT", err.userMessage);
    throw err;
  }
  const { data: result, error: ingestError } = await db.rpc("tracking_ingest", { p: payload });
  if (ingestError) throw new AppError(500, "DB_ERROR", "Não conseguimos registrar a marcação.", ingestError);
  const status = (result as { status: string; lead_id?: number }).status;
  if (status === "compra_duplicada") throw new AppError(409, "INVALID_STATE", "Este nº de pedido já foi registrado para este site.");
  if (status === "duplicado") return json(req, 200, { data: { status: "ja_marcado" } });
  if (status !== "ok") throw new AppError(500, "DB_ERROR", "Não conseguimos registrar a marcação.", result);

  const leadId = (result as { lead_id?: number }).lead_id ?? null;
  const { error: markError } = await db.rpc("tracking_whatsapp_mark", { p_code: code, p_kind: input.kind, p_user_id: caller.id, p_lead_id: leadId });
  if (markError) throw new AppError(500, "DB_ERROR", "Não conseguimos atualizar o clique.", markError);

  const { error: auditError } = await db.from("audit_logs").insert({
    actor_id: caller.id, action: `tracking_whatsapp.${input.kind}`, target_type: "tracking_whatsapp", target_id: click.client_id,
    details: { codigo: code, valor: input.value ?? null, moeda: input.currency ?? null, pedido: input.orderId ?? null, contato_cifrado: input.ud ? Object.keys(input.ud) : [] },
  });
  if (auditError) await recordError({ source: "servidor", code: "AUDIT_FAILED", technical: auditError, context: { funcao: "tracking-whatsapp" }, userId: caller.id });

  return json(req, 200, { data: { status: "ok", leadId } });
}, "tracking-whatsapp"));
