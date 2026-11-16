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
  /** Espera (injetável para os testes não esperarem de verdade). */
  wait(ms: number): Promise<void>;
}

export interface ConnectResult {
  state: ConnState;
  qr: string | null;
  /** Código de pareamento (quando se pede por código em vez de QR). */
  pairingCode: string | null;
  /** Número (com 55 e DDD) para o qual o código foi gerado: pode ser a forma com ou sem o 9, quando o servidor recusa a primeira. */
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

  // Uma chamada só para pedir o QR (ou o código, se veio o número): se a instância ainda não existe (404), cria já pedindo.
  let r = await d.gw(instance, "GET", "/instance/connect/{instance}", { query: number ? { number } : {} });
  if (r.status === 404) {
    r = await d.gw(instance, "POST", "/instance/create", {
      body: { instanceName: instance, integration: "WHATSAPP-BAILEYS", qrcode: true, ...(number ? { number } : {}) },
    });
  }
  if (r.status >= 400) throw new GatewayFailure(502, d.problem(r.status));

  // O aviso é configurado SEMPRE (a chave acabou de ser trocada), em paralelo com a espera do QR/código.
  const hook = setWebhook(d, instance, key);

  let info = parseConnectResponse(r.body);
  // O servidor gera o QR em segundo plano: logo depois de criar, ele pode ainda não ter vindo. Tenta de novo poucas vezes.
  for (let i = 0; i < 4 && !info.qr && !info.pairingCode && !info.alreadyConnected; i++) {
    await d.wait(1500);
    const again = await d.gw(instance, "GET", "/instance/connect/{instance}", { query: number ? { number } : {} });
    if (again.status >= 400) break;
    info = parseConnectResponse(again.body);
  }
  let pairingNumber: string | null = number && info.pairingCode ? number : null;
  let webhookOk = await hook;

  // Pediu o código e o servidor devolveu só o QR (pairingCode vazio): esse tipo de servidor só gera o código quando a conexão
  // é CRIADA já com o número. Como ela já existia, apaga e cria de novo com o número (e, se não vier, com a outra forma do número: com/sem o 9).
  if (number && !info.pairingCode && !info.alreadyConnected) {
    const tries = [number, altBrNumber(number)].filter((n): n is string => Boolean(n));
    for (const n of tries) {
      const del = await d.gw(instance, "DELETE", "/instance/delete/{instance}");
      if (del.status >= 400 && del.status !== 404) break;
      const rc = await d.gw(instance, "POST", "/instance/create", {
        body: { instanceName: instance, integration: "WHATSAPP-BAILEYS", qrcode: true, number: n },
      });
      if (rc.status >= 400) break;
      let info2 = parseConnectResponse(rc.body);
      for (let i = 0; i < 3 && !info2.pairingCode && !info2.qr; i++) {
        await d.wait(1500);
        const again = await d.gw(instance, "GET", "/instance/connect/{instance}", { query: { number: n } });
        if (again.status >= 400) break;
        info2 = parseConnectResponse(again.body);
      }
      // A instância é nova: o aviso (webhook) precisa ser configurado de novo.
      webhookOk = await setWebhook(d, instance, key);
      if (info2.pairingCode) { info = info2; pairingNumber = n; break; }
      if (!info.qr && info2.qr) info = info2;
    }
  }

  // Diagnóstico: pediu código e não veio. Registra SÓ os nomes dos campos da resposta (nunca valores), para saber o que o servidor devolve.
  if (number && !info.pairingCode && !info.alreadyConnected) {
    const o = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    console.log(JSON.stringify({ wa_instance: "codigo_nao_veio", http: r.status, campos: Object.keys(o(r.body)), campos_qrcode: Object.keys(o(o(r.body).qrcode)), numero_digitos: number.length, pc_tipo: typeof o(r.body).pairingCode, pc_tamanho: typeof o(r.body).pairingCode === "string" ? (o(r.body).pairingCode as string).length : null, count: o(r.body).count ?? null }));
  }

  if (info.alreadyConnected) {
    await d.setState("conectado", true);
    return { state: "conectado", qr: null, pairingCode: null, pairingNumber: null, webhookOk, message: webhookOk ? null : "Conectado, mas o servidor não aceitou o aviso automático. As mensagens não chegam ao CRM." };
  }
  if (!info.qr && !info.pairingCode) {
    await d.setState("desconhecido", null);
    return { state: "desconhecido", qr: null, pairingCode: null, pairingNumber: null, webhookOk, message: "O servidor ainda não gerou o QR Code. Clique de novo em alguns segundos." };
  }
  await d.setState("aguardando_leitura", null);
  const semCodigo = number && !info.pairingCode ? "O servidor não gerou o código de pareamento para esse número. Confira o número (com o DDD, com ou sem o 9) ou use o QR Code abaixo." : null;
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

/**
 * Desconectar = apagar de verdade no servidor: sai do WhatsApp E apaga a instância (sessão, número, códigos), e limpa o cadastro da instância.
 * Assim a próxima conexão (inclusive de OUTRO número) começa do zero. Contatos e conversas guardados no CRM não são tocados.
 */
export async function logout(d: Deps): Promise<{ state: ConnState }> {
  const cur = await d.get();
  if (cur.instance) {
    const r = await d.gw(cur.instance, "DELETE", "/instance/logout/{instance}");
    if (r.status >= 400 && r.status !== 404 && r.status !== 400) throw new GatewayFailure(502, d.problem(r.status));
    const del = await d.gw(cur.instance, "DELETE", "/instance/delete/{instance}");
    if (del.status >= 400 && del.status !== 404) throw new GatewayFailure(502, d.problem(del.status));
    await d.setState("desconectado", false);
    await d.clear();
    return { state: "desconectado" };
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
