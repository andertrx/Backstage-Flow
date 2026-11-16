/**
 * T5.38 (fase A) — WhatsApp de cada cliente por QR Code: o passo a passo, sem banco e sem rede própria (tudo entra por `Deps`),
 * para testar com um servidor de WhatsApp simulado. As rotas são as do servidor "estilo Evolution API".
 *
 * Regra importante: o aviso (webhook) é reconfigurado TODA vez que se conecta, porque a chave é trocada a cada preparo.
 * Sem isso, uma conexão que já estava ligada passaria a ter a chave velha no servidor e as mensagens seriam recusadas.
 */
import { type ConnState, type GatewayReply, mapConnectionState, normalizePhone, parseConnectResponse } from "../wa-gateway/logic.ts";

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
}

export interface ConnectResult {
  state: ConnState;
  qr: string | null;
  pairingCode: string | null;
  /** Número (com 55 e DDD) para o qual o código foi gerado: pode ser a variante com ou sem o 9, quando o servidor recusa o primeiro. */
  pairingNumber: string | null;
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

/** Celulares do Brasil existem com e sem o 9 na frente: devolve a outra forma do mesmo número (ou null se não for número do Brasil). */
export function altBrNumber(n: string): string | null {
  const m = /^55(\d{2})(\d{8,9})$/.exec(n);
  if (!m) return null;
  const [, ddd, rest] = m;
  if (rest.length === 8 && /^[6-9]/.test(rest)) return `55${ddd}9${rest}`;
  if (rest.length === 9 && rest.startsWith("9")) return `55${ddd}${rest.slice(1)}`;
  return null;
}

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

export async function connect(d: Deps, numberRaw?: string): Promise<ConnectResult> {
  let number: string | null = null;
  if (numberRaw?.trim()) {
    number = normalizePhone(numberRaw);
    if (!number) throw new GatewayFailure(400, "Telefone inválido. Use o número do chip com DDD (ex.: 11 98765-4321).");
  }
  const { instance, key } = await d.prepare();

  const cs = await d.gw(instance, "GET", "/instance/connectionState/{instance}");
  let current: ConnState = "desconhecido";
  let r: GatewayReply | null = null;
  if (cs.status === 404) {
    r = await d.gw(instance, "POST", "/instance/create", {
      body: { instanceName: instance, integration: "WHATSAPP-BAILEYS", qrcode: true, ...(number ? { number } : {}) },
    });
    if (r.status >= 400) throw new GatewayFailure(502, d.problem(r.status));
  } else if (cs.status >= 400) {
    throw new GatewayFailure(502, d.problem(cs.status));
  } else {
    current = mapConnectionState(cs.body);
  }

  // O aviso é configurado sempre (a chave acabou de ser trocada).
  const webhookOk = await setWebhook(d, instance, key);

  if (current === "conectado") {
    await d.setState("conectado", true);
    return { state: "conectado", qr: null, pairingCode: null, pairingNumber: null, webhookOk, message: webhookOk ? null : "Conectado, mas o servidor não aceitou o aviso automático. As mensagens não chegam ao CRM." };
  }
  if (!r) {
    r = await d.gw(instance, "GET", "/instance/connect/{instance}", { query: number ? { number } : {} });
    if (r.status >= 400) throw new GatewayFailure(502, d.problem(r.status));
  }
  let info = parseConnectResponse(r.body);
  let pairingNumber: string | null = number && info.pairingCode ? number : null;
  // Pediu o código e o servidor não devolveu: tenta a outra forma do número (com/sem o 9), uma vez.
  if (number && !info.pairingCode && !info.alreadyConnected) {
    const alt = altBrNumber(number);
    if (alt) {
      const r2 = await d.gw(instance, "GET", "/instance/connect/{instance}", { query: { number: alt } });
      if (r2.status < 400) {
        const info2 = parseConnectResponse(r2.body);
        if (info2.pairingCode) { info = info2; pairingNumber = alt; }
      }
    }
  }
  if (info.alreadyConnected) {
    await d.setState("conectado", true);
    return { state: "conectado", qr: null, pairingCode: null, pairingNumber: null, webhookOk, message: null };
  }
  if (!info.qr && !info.pairingCode) {
    await d.setState("desconhecido", null);
    return { state: "desconhecido", qr: null, pairingCode: null, pairingNumber: null, webhookOk, message: "O servidor não devolveu QR Code nem código agora. Tente de novo em alguns segundos." };
  }
  await d.setState("aguardando_leitura", null);
  const semCodigo = number && !info.pairingCode ? "O servidor não gerou o código de pareamento para esse número. Confira o número (com o DDD e o 9 na frente) ou use o QR Code abaixo." : null;
  return {
    state: "aguardando_leitura", qr: info.qr, pairingCode: info.pairingCode, pairingNumber, webhookOk,
    message: semCodigo ?? (webhookOk ? null : "O servidor não aceitou o aviso automático. Mesmo conectando, as mensagens não chegam ao CRM."),
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
