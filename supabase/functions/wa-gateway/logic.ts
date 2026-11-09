/**
 * Etapa 44.1 — conexão do WhatsApp por API NÃO OFICIAL: regras puras (sem banco), para testar.
 * Fala com um servidor de conexão no estilo Evolution API (rotas /instance/...). O que não foi possível confirmar
 * na documentação oficial é tratado de forma tolerante (ver parseConnectResponse).
 */
export type ConnState = "conectado" | "desconectado" | "aguardando_leitura" | "erro" | "desconhecido";

export interface GatewayCfg {
  baseUrl: string;
  instance: string;
  key: string;
}

export interface GatewayReply {
  status: number;
  body: unknown;
}

const TIMEOUT_MS = 12_000;
/** A lista de grupos é pesada no servidor de conexão (medido: ~41 s com muitos grupos); as demais rotas são rápidas. */
export const GROUPS_TIMEOUT_MS = 100_000;

/** Endereço completo de uma rota do servidor de conexão (a instância sempre codificada). */
export function gatewayUrl(cfg: Pick<GatewayCfg, "baseUrl" | "instance">, path: string, query?: Record<string, string>): string {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const p = path.replace("{instance}", encodeURIComponent(cfg.instance));
  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : "";
  return `${base}${p}${qs}`;
}

/** Só endereços seguros de domínio (nunca IP nem localhost): evita usar o servidor para alcançar redes internas. */
export function safeBaseUrl(url: string): boolean {
  return /^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}(:[0-9]{2,5})?$/i.test(url);
}

/** Chamada ao servidor de conexão. A chave vai só no cabeçalho; erros nunca carregam a chave nem o corpo. */
export async function callGateway(
  cfg: GatewayCfg,
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { query?: Record<string, string>; body?: unknown; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<GatewayReply> {
  if (!safeBaseUrl(cfg.baseUrl)) throw new Error("ENDERECO_INSEGURO");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(gatewayUrl(cfg, path, opts.query), {
      method,
      headers: { apikey: cfg.key, ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      redirect: "error",
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    throw new Error("SEM_CONEXAO");
  } finally {
    clearTimeout(timer);
  }
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** "open" = conectado, "close" = desconectado, "connecting" = esperando a leitura do QR Code / código. */
export function mapConnectionState(body: unknown): ConnState {
  const b = obj(body);
  const state = String(obj(b?.instance)?.state ?? b?.state ?? "").toLowerCase();
  if (state === "open") return "conectado";
  if (state === "close" || state === "closed") return "desconectado";
  if (state === "connecting") return "aguardando_leitura";
  return "desconhecido";
}

export interface ConnectInfo {
  /** Imagem do QR Code (data URL png/jpeg) ou null. */
  qr: string | null;
  /** Código para digitar no WhatsApp ("Conectar com número de telefone") ou null. */
  pairingCode: string | null;
  alreadyConnected: boolean;
}

/** Aceita a resposta de "connect" e a de "create" (que traz o mesmo dentro de qrcode). Só devolve o que é seguro mostrar. */
export function parseConnectResponse(body: unknown): ConnectInfo {
  const root = obj(body);
  const b = obj(root?.qrcode) ?? root;
  const base64 = typeof b?.base64 === "string" ? b.base64 : "";
  const qr = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(base64) && base64.length <= 200_000 ? base64 : null;
  const code = typeof b?.pairingCode === "string" ? b.pairingCode.trim().toUpperCase() : "";
  const pairingCode = /^[A-Z0-9-]{6,12}$/.test(code) ? code : null;
  const alreadyConnected = mapConnectionState(body) === "conectado";
  return { qr, pairingCode, alreadyConnected };
}

/** Telefone só com dígitos, no formato internacional (assume Brasil se vier com 10 ou 11 dígitos). */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^\d{12,15}$/.test(full) ? full : null;
}

/** Mensagem em português para cada falha ao falar com o servidor de conexão (sem detalhes técnicos). */
export function gatewayProblem(status: number | "sem_conexao"): string {
  if (status === "sem_conexao") return "Não consegui falar com o servidor do WhatsApp. Confira o endereço e se o servidor está ligado.";
  if (status === 401 || status === 403) return "O servidor do WhatsApp recusou a chave de acesso. Confira a chave e salve de novo.";
  if (status === 404) return "O servidor respondeu que não achou isso. Confira o nome da instância.";
  if (status >= 500) return "O servidor do WhatsApp deu erro agora. Tente de novo em instantes.";
  return `O servidor do WhatsApp respondeu de um jeito inesperado (código ${status}).`;
}

export interface WaGroup {
  id: string;
  name: string;
  size: number | null;
}

/** Lista de grupos do servidor de conexão: só id (@g.us) e nome; nunca participantes. Até 1000, em ordem de nome. */
export function parseGroups(body: unknown): WaGroup[] {
  if (!Array.isArray(body)) return [];
  const out: WaGroup[] = [];
  for (const g of body) {
    const o = obj(g);
    const id = typeof o?.id === "string" ? o.id : "";
    const name = typeof o?.subject === "string" ? o.subject.trim().slice(0, 200) : "";
    if (!/^[0-9A-Za-z._-]{5,60}@g\.us$/.test(id) || !name) continue;
    out.push({ id, name, size: typeof o?.size === "number" && Number.isFinite(o.size) ? o.size : null });
    if (out.length >= 1000) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export interface WaParticipante {
  /** Só dígitos, com DDI (ex.: 5545999991111). */
  numero: string;
  admin: boolean;
}

/**
 * Participantes de um grupo (T5.20): só o número (para o administrador escolher quem marcar com @) e se é admin do grupo.
 * O servidor devolve `phoneNumber` ("55...@s.whatsapp.net") e um `id` que pode ser interno ("...@lid"): só vale o telefone real.
 */
export function parseParticipants(body: unknown): WaParticipante[] {
  const list = obj(body)?.participants;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: WaParticipante[] = [];
  for (const p of list) {
    const o = obj(p);
    const raw = [o?.phoneNumber, o?.id].find((v) => typeof v === "string" && v.endsWith("@s.whatsapp.net")) as string | undefined;
    const numero = raw ? raw.replace(/@.*$/, "") : "";
    if (!/^[0-9]{10,15}$/.test(numero) || seen.has(numero)) continue;
    seen.add(numero);
    out.push({ numero, admin: typeof o?.admin === "string" && o.admin.length > 0 });
    if (out.length >= 1000) break;
  }
  return out;
}
