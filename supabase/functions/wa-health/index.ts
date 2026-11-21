/**
 * Edge Function: wa-health (T5.38 fase C) — confere, a cada 5 minutos, se o WhatsApp (QR Code) de cada cliente continua conectado.
 *
 *   tick → agendador do banco (senha interna): para cada conexão ligada pergunta ao servidor o estado da instância,
 *          anota o estado e o banco decide os avisos no sino (caiu há 10 min / voltou).
 *
 * Só lê o ESTADO da conexão. Não envia mensagem, não lê conversa e nada de telefone ou chave vai para log.
 */
import { z } from "npm:zod@4";
import { adminClient } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { callGateway, type GatewayCfg, type GatewayReply } from "../wa-gateway/logic.ts";
import { classificar, itensValidos } from "./logic.ts";

const schema = z.object({ action: z.literal("tick") });
const PARALELO = 5;

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  const { data: ok } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");

  const { data: c } = await db.rpc("wa_gateway_config_get");
  const g = (c ?? {}) as { base_url?: string | null; key?: string | null };
  if (!g.base_url || !g.key) return json(req, 200, { data: { conferidas: 0, motivo: "sem_configuracao" } });

  const { data: lista, error } = await db.rpc("wa_client_health_list");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler as conexões dos clientes.", error);
  const itens = itensValidos(lista);

  const resumo = { conferidas: 0, servidor: 0, caiu: 0, voltou: 0 };
  const fila = [...itens];
  async function trabalhador() {
    for (let it = fila.shift(); it; it = fila.shift()) {
      const cfg: GatewayCfg = { baseUrl: g.base_url as string, instance: it.instance, key: g.key as string };
      let reply: GatewayReply | null = null;
      try {
        reply = await callGateway(cfg, "GET", "/instance/connectionState/{instance}", { timeoutMs: 15_000 });
      } catch {
        reply = null;
      }
      const v = classificar(reply);
      if (v.tipo === "servidor") { resumo.servidor++; continue; }
      const { data: r, error: e } = await db.rpc("wa_client_health_apply", { p_connection: it.id, p_state: v.state });
      if (e) continue; // uma conexão com problema não derruba a conferência das outras
      resumo.conferidas++;
      if (r === "avisou_caiu") resumo.caiu++;
      if (r === "avisou_voltou") resumo.voltou++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALELO, itens.length) }, trabalhador));
  return json(req, 200, { data: resumo });
}, "wa-health"));
