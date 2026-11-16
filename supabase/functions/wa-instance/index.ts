/**
 * Edge Function: wa-instance (T5.38) — conectar o WhatsApp de CADA CLIENTE por QR Code, dentro do Tracking (servidor não oficial).
 *
 *   connect { connectionId, number? } → cria a instância do cliente, configura o aviso e devolve o QR Code (ou o código de pareamento)
 *   status  { connectionId }          → confere se conectou; ao conectar, liga a conexão sozinha
 *   logout  { connectionId }          → desconecta o WhatsApp do cliente e desliga a conexão
 *   remove  { connectionId }          → remove a instância do servidor (contatos e conversas continuam guardados)
 *
 * Quem pode: administrador, gestor com acesso ao cliente e Account Manager do cliente. A regra é conferida NO BANCO
 * (private.wa_instance_can); aqui só se confere o login. A chave do servidor e a chave do aviso nunca voltam na resposta.
 * O QR Code só é devolvido a quem está logado e nunca vai para log.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { adminClient, requireRole } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { callGateway, type GatewayCfg, gatewayProblem } from "../wa-gateway/logic.ts";
import { connect, type Deps, GatewayFailure, logout, remove, status } from "./flow.ts";

const id = z.guid("Identificador inválido.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), connectionId: id, number: z.string().max(30).optional() }),
  z.object({ action: z.literal("status"), connectionId: id }),
  z.object({ action: z.literal("logout"), connectionId: id }),
  z.object({ action: z.literal("remove"), connectionId: id }),
]);

async function loadBase(db: SupabaseClient): Promise<{ baseUrl: string; key: string }> {
  const { data, error } = await db.rpc("wa_gateway_config_get");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a configuração do WhatsApp.", error);
  const c = (data ?? {}) as { base_url?: string | null; key?: string | null };
  if (!c.base_url || !c.key) throw new AppError(400, "INVALID_STATE", "Salve o endereço do servidor e a chave de acesso em Integrações antes de conectar clientes.");
  return { baseUrl: c.base_url, key: c.key };
}

/** Erros do banco com a nossa mensagem (42501/22023) viram erro amigável. */
function dbFail(error: { code?: string; message: string }, fallback: string): AppError {
  if (error.code === "42501") return new AppError(403, "FORBIDDEN", error.message);
  if (error.code === "22023") return new AppError(400, "INVALID_STATE", error.message);
  return new AppError(500, "DB_ERROR", fallback, error);
}

function depsFor(db: SupabaseClient, base: { baseUrl: string; key: string }, userId: string, connectionId: string): Deps {
  const supaUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  return {
    inboundUrl: `${supaUrl}/functions/v1/wa-inbound?c=${connectionId}`,
    problem: gatewayProblem,
    async gw(instance, method, path, opts = {}) {
      const cfg: GatewayCfg = { baseUrl: base.baseUrl, instance, key: base.key };
      try {
        return await callGateway(cfg, method, path, opts);
      } catch (e) {
        const unsafe = e instanceof Error && e.message === "ENDERECO_INSEGURO";
        throw new GatewayFailure(unsafe ? 400 : 502, unsafe ? "O endereço do servidor não é seguro. Use https:// com um domínio." : gatewayProblem("sem_conexao"));
      }
    },
    async prepare() {
      const { data, error } = await db.rpc("wa_instance_prepare", { p_user: userId, p_connection: connectionId });
      if (error) throw dbFail(error, "Não conseguimos preparar a conexão.");
      return data as { instance: string; key: string; phone: string | null };
    },
    async get() {
      const { data, error } = await db.rpc("wa_instance_get", { p_user: userId, p_connection: connectionId });
      if (error) throw dbFail(error, "Não conseguimos ler a conexão.");
      return data as { instance: string | null; state: string | null; enabled: boolean };
    },
    async setState(state, enable) {
      const { error } = await db.rpc("wa_instance_state_set", { p_user: userId, p_connection: connectionId, p_state: state, p_enable: enable });
      if (error) throw dbFail(error, "Não conseguimos guardar o estado da conexão.");
    },
    async clear() {
      const { error } = await db.rpc("wa_instance_clear", { p_user: userId, p_connection: connectionId });
      if (error) throw dbFail(error, "Não conseguimos limpar a conexão.");
    },
  };
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  // A autorização de verdade é do banco (wa_instance_can); aqui só se confere que a pessoa é da equipe e está logada.
  const staff = ["admin", "gestor", "operador", "equipe"] as const;
  if (!parsed.success) {
    await requireRole(req, db, staff);
    throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  }
  const caller = await requireRole(req, db, staff);
  await enforceRateLimit(db, "wa.gateway", caller.id);
  const input = parsed.data;
  const base = await loadBase(db);
  const d = depsFor(db, base, caller.id, input.connectionId);
  try {
    if (input.action === "connect") return json(req, 200, { data: await connect(d, input.number) });
    if (input.action === "status") return json(req, 200, { data: await status(d) });
    if (input.action === "logout") return json(req, 200, { data: await logout(d) });
    return json(req, 200, { data: await remove(d) });
  } catch (e) {
    if (e instanceof GatewayFailure) throw new AppError(e.status === 400 ? 400 : 502, e.status === 400 ? "INVALID_INPUT" : "GATEWAY_ERROR", e.message);
    throw e;
  }
}, "wa-instance"));
