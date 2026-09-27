/**
 * Edge Function: client-report-link (Etapa 19.2)
 *
 * Endpoint PÚBLICO do link secreto do dashboard do cliente (/r/<código>).
 * Não usa login: quem tem o código vê o dashboard daquele cliente, enquanto o
 * link estiver ligado e dentro da validade. A conferência do código (SHA-256),
 * o limite de consultas por link e o recorte dos dados ficam no banco
 * (public.client_report_public, que só o servidor pode chamar).
 *
 * POST { token, period? | from?, to? } → 200 com o dashboard; 400/404/429 recusado.
 */
import { adminClient } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { mapDbError, requestSchema } from "./logic.ts";

Deno.serve(handle(async (req) => {
  const text = await req.text();
  if (text.length > 1000) throw new AppError(413, "INVALID_INPUT", "Pedido grande demais.");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new AppError(400, "INVALID_INPUT", "Pedido inválido."); }
  const parsed = requestSchema.safeParse(body);
  // Código com formato errado = mesmo aviso do link inexistente (não ajuda quem tenta adivinhar).
  if (!parsed.success) {
    const tokenOk = typeof (body as { token?: unknown })?.token === "string" && /^[A-Za-z0-9_-]{43}$/.test((body as { token: string }).token);
    const e = tokenOk ? mapDbError("22023") : mapDbError("P0002");
    throw new AppError(e.status, e.code, e.message);
  }
  const { token, period, from, to } = parsed.data;
  const { data, error } = await adminClient().rpc("client_report_public", {
    p_token: token, p_period: period ?? null, p_from: from ?? null, p_to: to ?? null,
  });
  if (error) {
    const e = mapDbError(error.code);
    throw new AppError(e.status, e.code, e.message, e.code === "DB_ERROR" ? error : undefined);
  }
  const res = json(req, 200, data);
  res.headers.set("Cache-Control", "no-store");
  return res;
}, "client-report-link"));
