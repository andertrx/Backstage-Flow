/**
 * Edge Function: wa-send (Etapa 44.3) — envia pelo WhatsApp conectado as mensagens da fila (wa_disparos).
 *
 *   tick → agendador do banco (senha interna), uma vez por minuto quando há fila: pede o próximo disparo ao banco
 *          (que já confere trava geral, limite de 60 por dia, ritmo de 45 s e se a aprovação ainda vale),
 *          envia UMA mensagem de texto ao grupo e anota o resultado.
 *
 * Nada de número de telefone, texto da conversa ou chave vai para log. O texto enviado é o da própria programação do envio.
 */
import { z } from "npm:zod@4";
import { adminClient } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import type { GatewayCfg } from "../wa-gateway/logic.ts";
import { classificar, disparoValido, enviarTexto, pausaAleatoria } from "./logic.ts";

const schema = z.object({ action: z.literal("tick") });

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  const { data: ok } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");

  const { data: c } = await db.rpc("wa_gateway_config_get");
  const g = (c ?? {}) as { base_url?: string | null; instance_name?: string; key?: string | null };
  if (!g.base_url || !g.key) return json(req, 200, { data: { enviados: 0, motivo: "sem_configuracao" } });
  const cfg: GatewayCfg = { baseUrl: g.base_url, instance: g.instance_name ?? "backstage", key: g.key };

  const { data: next, error } = await db.rpc("wa_disparo_proximo");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a fila de envios.", error);
  if (!next) return json(req, 200, { data: { enviados: 0, motivo: "nada_para_enviar" } });

  if (!disparoValido(next)) {
    const id = (next as { id?: number }).id;
    if (typeof id === "number") await db.rpc("wa_disparo_resultado", { p_id: id, p_ok: false, p_detalhe: "Grupo ou mensagem inválidos.", p_retry: false });
    return json(req, 200, { data: { enviados: 0, motivo: "disparo_invalido" } });
  }

  await new Promise((r) => setTimeout(r, pausaAleatoria()));
  const res = await enviarTexto(cfg, next, pausaAleatoria());
  const { error: e2 } = await db.rpc("wa_disparo_resultado", { p_id: next.id, p_ok: res.ok, p_detalhe: res.detalhe, p_retry: res.retry });
  if (e2) throw new AppError(500, "DB_ERROR", "Não conseguimos anotar o resultado do envio.", e2);
  if (res.acesso) await db.rpc("wa_gateway_state_set", { p_state: "erro", p_error: res.detalhe });
  return json(req, 200, { data: { enviados: res.ok ? 1 : 0, falha: res.ok ? null : res.detalhe } });
}, "wa-send"));
