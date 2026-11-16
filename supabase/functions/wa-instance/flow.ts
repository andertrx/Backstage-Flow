/**
 * T5.38 (fase A) — WhatsApp de cada cliente por QR Code: o passo a passo, sem banco e sem rede própria (tudo entra por `Deps`),
 * para testar com um servidor de WhatsApp simulado. As rotas são as do servidor "estilo Evolution API".
 *
 * Regra importante: o aviso (webhook) é reconfigurado TODA vez que se conecta, porque a chave é trocada a cada preparo.
 * Sem isso, uma conexão que já estava ligada passaria a ter a chave velha no servidor e as mensagens seriam recusadas.
 */
import { type ConnState, type GatewayReply, mapConnectionState, parseConnectResponse } from "../wa-gateway/logic.ts";

export interface Deps {
  /** Chama o servidor de WhatsApp para a instância informada. */
  gw(instance: string, method: "GET" | "POST" | "DELETE", path: string, opts?: { query?: Record<string, string>; body?: unknown }): Promise<GatewayReply>;
  /** Confere quem pode, dá o nome da instância e troca a chave do aviso. */
  prepare(): Promise<{ instance: string; key: string; phone: string | null }>;
  get(): Promise<{ instance: string | null; state: string | null; enabled: boolean }>;
  setState(state: ConnState, enable: boolean | null): Promise<void>;
  clear(): Promise<void>;
  /** Endereço do aviso no CRM (wa-inbound?c=<conexão>). */
  inboundUrl: string;
  /** Mensagem amigável para um erro HTTP do servidor. */
  problem(status: number): string;
  /** Espera (injetável para os testes não esperarem de verdade). */
  wait(ms: number): Promise<void>;
}

export interface ConnectResult {
  state: ConnState;
  qr: string | null;

  /** O servidor aceitou o aviso automático? Se não, as mensagens não chegam ao CRM. */
  webhookOk: boolean;
  message: string | null;
}

export class GatewayFailure extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const EVENTS = ["MESSAGES_UPSERT", "MESSAGES_SET"];

/** Configura o aviso. Tenta o formato novo e, se o servidor não reconhecer, o antigo. */
export async function setWebhook(d: Deps, instance: string, key: string): Promise<boolean> {
  const headers = { "x-webhook-key": key };
  const v2 = await d.gw(instance, "POST", "/webhook/set/{instance}", {
    body: { webhook: { enabled: true, url: d.inboundUrl, byEvents: false, base64: false, headers, events: EVENTS } },
  });
  if (v2.status < 400) return true;
  if (![400, 404, 422].includes(v2.status)) return false;
  const v1 = await d.gw(instance, "POST", "/webhook/set/{instance}", {
    body: { enabled: true, url: d.inboundUrl, webhook_by_events: false, webhook_base64: false, headers, events: EVENTS },
  });
  return v1.status < 400;
}

export async function connect(d: Deps): Promise<ConnectResult> {
  const { instance, key } = await d.prepare();

  // Uma chamada só para pedir o QR: se a instância ainda não existe (404), cria já pedindo o QR.
  let r = await d.gw(instance, "GET", "/instance/connect/{instance}");
  if (r.status === 404) {
    r = await d.gw(instance, "POST", "/instance/create", {
      body: { instanceName: instance, integration: "WHATSAPP-BAILEYS", qrcode: true },
    });
  }
  if (r.status >= 400) throw new GatewayFailure(502, d.problem(r.status));

  // O aviso é configurado SEMPRE (a chave acabou de ser trocada), em paralelo com a espera do QR.
  const hook = setWebhook(d, instance, key);

  let info = parseConnectResponse(r.body);
  // O servidor gera o QR em segundo plano: logo depois de criar, ele pode ainda não ter vindo. Tenta de novo poucas vezes.
  for (let i = 0; i < 4 && !info.qr && !info.alreadyConnected; i++) {
    await d.wait(1500);
    const again = await d.gw(instance, "GET", "/instance/connect/{instance}");
    if (again.status >= 400) break;
    info = parseConnectResponse(again.body);
  }
  const webhookOk = await hook;

  if (info.alreadyConnected) {
    await d.setState("conectado", true);
    return { state: "conectado", qr: null, webhookOk, message: webhookOk ? null : "Conectado, mas o servidor não aceitou o aviso automático. As mensagens não chegam ao CRM." };
  }
  if (!info.qr) {
    await d.setState("desconhecido", null);
    return { state: "desconhecido", qr: null, webhookOk, message: "O servidor ainda não gerou o QR Code. Clique em Conectar por QR Code de novo em alguns segundos." };
  }
  await d.setState("aguardando_leitura", null);
  return {
    state: "aguardando_leitura", qr: info.qr, webhookOk,
    message: webhookOk ? null : "O servidor não aceitou o aviso automático. Mesmo conectando, as mensagens não chegam ao CRM.",
  };
}

export async function status(d: Deps): Promise<{ state: ConnState; message: string | null }> {
  const cur = await d.get();
  if (!cur.instance) return { state: "desconhecido", message: "Este número ainda não foi conectado por QR Code." };
  const r = await d.gw(cur.instance, "GET", "/instance/connectionState/{instance}");
  if (r.status === 404) {
    await d.setState("desconhecido", null);
    return { state: "desconhecido", message: "A instância não existe mais no servidor. Conecte de novo." };
  }
  if (r.status >= 400) {
    const message = d.problem(r.status);
    await d.setState("erro", null);
    return { state: "erro", message };
  }
  const state = mapConnectionState(r.body);
  // Só liga sozinho na passagem para conectado (não religa uma conexão que a pessoa desligou de propósito).
  await d.setState(state, state === "conectado" && cur.state !== "conectado" ? true : null);
  return { state, message: null };
}

export async function logout(d: Deps): Promise<{ state: ConnState }> {
  const cur = await d.get();
  if (cur.instance) {
    const r = await d.gw(cur.instance, "DELETE", "/instance/logout/{instance}");
    if (r.status >= 400 && r.status !== 404) throw new GatewayFailure(502, d.problem(r.status));
  }
  await d.setState("desconectado", false);
  return { state: "desconectado" };
}

/** Remove a instância do servidor. O cadastro, os contatos e as conversas continuam guardados. */
export async function remove(d: Deps): Promise<{ removed: boolean }> {
  const cur = await d.get();
  if (!cur.instance) return { removed: false };
  const r = await d.gw(cur.instance, "DELETE", "/instance/delete/{instance}");
  if (r.status >= 400 && r.status !== 404) throw new GatewayFailure(502, d.problem(r.status));
  await d.clear();
  return { removed: true };
}
