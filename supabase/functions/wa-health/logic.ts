/**
 * T5.38 fase C — conferência do WhatsApp de cada cliente. Só decide o estado; nada de rede nem banco aqui (testável).
 * Se o PROBLEMA é do servidor de WhatsApp (fora do ar, chave recusada, erro interno), não mexe no estado dos clientes
 * e não avisa por cliente: isso já é coberto pelo aviso da conexão da agência (e evitaria uma enxurrada de avisos).
 */
import { type ConnState, type GatewayReply, mapConnectionState } from "../wa-gateway/logic.ts";

export type Veredito = { tipo: "estado"; state: ConnState } | { tipo: "servidor" };

/** `reply` = resposta do servidor ao pedido do estado da instância; null = o servidor não respondeu. */
export function classificar(reply: GatewayReply | null): Veredito {
  if (!reply) return { tipo: "servidor" };
  if (reply.status === 404) return { tipo: "estado", state: "desconhecido" }; // a instância deste cliente sumiu do servidor
  if (reply.status === 401 || reply.status === 403 || reply.status >= 500 || reply.status >= 400) return { tipo: "servidor" };
  return { tipo: "estado", state: mapConnectionState(reply.body) };
}

export interface Item { id: string; instance: string }

/** Lista vinda do banco → só itens válidos (id e nome da instância), no máximo `max`. */
export function itensValidos(raw: unknown, max = 200): Item[] {
  if (!Array.isArray(raw)) return [];
  const out: Item[] = [];
  for (const r of raw) {
    const o = r as { id?: unknown; instance?: unknown };
    if (typeof o?.id === "string" && typeof o?.instance === "string" && /^[0-9a-f-]{36}$/.test(o.id) && /^[A-Za-z0-9._-]{1,80}$/.test(o.instance)) out.push({ id: o.id, instance: o.instance });
    if (out.length >= max) break;
  }
  return out;
}
