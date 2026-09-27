/**
 * Edge Function: capi-sender (Etapa 34.3)
 *
 * Envia a fila de conversões ao Meta (API de Conversões). Só o agendador do
 * banco chama (cabeçalho x-cron-secret), a cada minuto e só quando há fila.
 * O token de cada Pixel é lido do Vault na hora e nunca sai do servidor.
 */
import { adminClient } from "../_shared/auth.ts";
import { runSender } from "../_shared/capi/sender.ts";
import { AppError, handle, json } from "../_shared/http.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { data: ok, error } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (error || !ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");
  const result = await runSender(db);
  return json(req, 200, { data: result });
}, "capi-sender"));
