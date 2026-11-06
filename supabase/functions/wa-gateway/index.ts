/**
 * Edge Function: wa-gateway (Etapa 44.1) — conexão do WhatsApp por API NÃO OFICIAL (só administrador).
 *
 *   status  → confere se o WhatsApp está conectado e anota o estado
 *   connect → mostra o QR Code ou, se vier o telefone do chip, o código de pareamento (cria a instância se não existir)
 *   logout  → desconecta o WhatsApp (a trava dos envios automáticos desliga sozinha)
 *
 * A chave do servidor de conexão fica no cofre (Vault) e só este servidor lê; ela nunca volta na resposta.
 * Nada daqui envia mensagem. O QR Code só é devolvido a quem está logado como administrador e nunca vai para log.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { adminClient, requireRole } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { callGateway, type ConnState, type GatewayCfg, type GatewayReply, gatewayProblem, mapConnectionState, normalizePhone, parseConnectResponse } from "./logic.ts";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("connect"), number: z.string().max(30).optional() }),
  z.object({ action: z.literal("logout") }),
]);

async function loadCfg(db: SupabaseClient): Promise<GatewayCfg> {
  const { data, error } = await db.rpc("wa_gateway_config_get");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a configuração do WhatsApp.", error);
  const c = (data ?? {}) as { base_url?: string | null; instance_name?: string; key?: string | null };
  if (!c.base_url || !c.key) throw new AppError(400, "INVALID_STATE", "Salve o endereço do servidor e a chave de acesso antes de conectar.");
  return { baseUrl: c.base_url, instance: c.instance_name ?? "backstage", key: c.key };
}

async function setState(db: SupabaseClient, state: ConnState, error: string | null) {
  const { error: e } = await db.rpc("wa_gateway_state_set", { p_state: state, p_error: error });
  if (e) throw new AppError(500, "DB_ERROR", "Não conseguimos guardar o estado da conexão.", e);
}

async function gw(cfg: GatewayCfg, method: "GET" | "POST" | "DELETE", path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<GatewayReply> {
  try {
    return await callGateway(cfg, method, path, opts);
  } catch (e) {
    const unsafe = e instanceof Error && e.message === "ENDERECO_INSEGURO";
    throw new AppError(unsafe ? 400 : 502, unsafe ? "INVALID_STATE" : "GATEWAY_ERROR",
      unsafe ? "O endereço do servidor não é seguro. Use https:// com um domínio." : gatewayProblem("sem_conexao"));
  }
}

/** Confere a conexão; devolve o estado e, se deu problema, a mensagem para a tela. */
async function checkState(db: SupabaseClient, cfg: GatewayCfg): Promise<{ state: ConnState; message: string | null }> {
  const r = await gw(cfg, "GET", "/instance/connectionState/{instance}");
  if (r.status === 404) {
    await setState(db, "desconhecido", "Instância ainda não criada.");
    return { state: "desconhecido", message: "A instância ainda não existe no servidor. Clique em conectar para criar." };
  }
  if (r.status >= 400) {
    const message = gatewayProblem(r.status);
    await setState(db, "erro", message);
    return { state: "erro", message };
  }
  const state = mapConnectionState(r.body);
  await setState(db, state, null);
  return { state, message: null };
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await requireRole(req, db, ["admin"]);
    throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  }
  const caller = await requireRole(req, db, ["admin"]);
  await enforceRateLimit(db, "wa.gateway", caller.id);
  const input = parsed.data;
  const cfg = await loadCfg(db);

  if (input.action === "status") {
    return json(req, 200, { data: await checkState(db, cfg) });
  }

  if (input.action === "logout") {
    const r = await gw(cfg, "DELETE", "/instance/logout/{instance}");
    if (r.status >= 400 && r.status !== 404) throw new AppError(502, "GATEWAY_ERROR", gatewayProblem(r.status));
    await setState(db, "desconectado", null);
    return json(req, 200, { data: { state: "desconectado" as ConnState, message: null } });
  }

  // connect
  let number: string | null = null;
  if (input.number?.trim()) {
    number = normalizePhone(input.number);
    if (!number) throw new AppError(400, "INVALID_INPUT", "Telefone inválido. Use o número do chip com DDD (ex.: 11 98765-4321).");
  }
  const current = await checkState(db, cfg);
  if (current.state === "conectado") return json(req, 200, { data: { state: "conectado" as ConnState, qr: null, pairingCode: null, message: null } });

  let r = await gw(cfg, "GET", "/instance/connect/{instance}", { query: number ? { number } : {} });
  if (r.status === 404) {
    r = await gw(cfg, "POST", "/instance/create", {
      body: { instanceName: cfg.instance, integration: "WHATSAPP-BAILEYS", qrcode: true, ...(number ? { number } : {}) },
    });
  }
  if (r.status >= 400) throw new AppError(502, "GATEWAY_ERROR", gatewayProblem(r.status));
  const info = parseConnectResponse(r.body);
  if (info.alreadyConnected) {
    await setState(db, "conectado", null);
    return json(req, 200, { data: { state: "conectado" as ConnState, qr: null, pairingCode: null, message: null } });
  }
  if (!info.qr && !info.pairingCode) {
    return json(req, 200, { data: { state: current.state, qr: null, pairingCode: null, message: "O servidor não devolveu QR Code nem código agora. Tente de novo em alguns segundos." } });
  }
  await setState(db, "aguardando_leitura", null);
  return json(req, 200, { data: { state: "aguardando_leitura" as ConnState, qr: info.qr, pairingCode: info.pairingCode, message: null } });
}, "wa-gateway"));
