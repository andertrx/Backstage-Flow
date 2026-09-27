/**
 * Meta API de Conversões (CAPI) — regras puras (Etapa 34.3): montar o evento
 * no formato do Meta e ler a resposta. Sem rede e sem banco (testável).
 *
 * Deduplicação: o mesmo event_id que o navegador usa no Pixel (eventID) vai
 * aqui como event_id; o Meta junta os dois e conta uma vez só.
 * Dados de contato: já chegam em hash SHA-256 (cifrados no navegador).
 */
import { GRAPH_HOST, graphVersion } from "../platforms/meta/config.ts";

export interface QueueRow {
  id: number;
  destination_id: string;
  client_id: string;
  pixel_id: string;
  test_event_code: string | null;
  event_id: string;
  event_name: string;
  occurred_at: string;
  visitor_id: string;
  page_url: string | null;
  custom_data: Record<string, unknown> | null;
  user_agent: string | null;
  ip_address: string | null;
  fbp: string | null;
  fbc: string | null;
  test: boolean;
  attempts: number;
  em_hash: string | null;
  ph_hash: string | null;
  fn_hash: string | null;
  ln_hash: string | null;
  /** "website" (padrão) ou "chat" (conversão fechada no WhatsApp). */
  action_source?: string | null;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Só valores simples viram custom_data (o resto é ignorado). transaction_id → order_id. */
function customData(cd: Record<string, unknown> | null): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cd ?? {})) {
    if (v == null || !["string", "number", "boolean"].includes(typeof v)) continue;
    if (k === "transaction_id") {
      if (!("order_id" in out)) out.order_id = String(v);
      continue;
    }
    out[k] = v;
  }
  if (typeof out.value === "string") out.value = Number(out.value);
  return Object.keys(out).length ? out : undefined;
}

/** Um evento no formato do Meta (server event). */
export async function buildMetaEvent(row: QueueRow) {
  const user_data: Record<string, unknown> = {
    external_id: [await sha256Hex(row.visitor_id)],
  };
  if (row.em_hash) user_data.em = [row.em_hash];
  if (row.ph_hash) user_data.ph = [row.ph_hash];
  if (row.fn_hash) user_data.fn = [row.fn_hash];
  if (row.ln_hash) user_data.ln = [row.ln_hash];
  if (row.ip_address) user_data.client_ip_address = row.ip_address;
  if (row.user_agent) user_data.client_user_agent = row.user_agent;
  if (row.fbp) user_data.fbp = row.fbp;
  if (row.fbc) user_data.fbc = row.fbc;
  const event: Record<string, unknown> = {
    event_name: row.event_name,
    event_time: Math.floor(Date.parse(row.occurred_at) / 1000),
    event_id: row.event_id,
    action_source: row.action_source === "chat" ? "chat" : "website",
    user_data,
  };
  // Endereço da página só faz sentido (e só é exigido) em evento do site.
  if (row.page_url && event.action_source === "website") event.event_source_url = row.page_url;
  const cd = customData(row.custom_data);
  if (cd) event.custom_data = cd;
  return event;
}

export function eventsUrl(pixelId: string): string {
  return `${GRAPH_HOST}/${graphVersion()}/${encodeURIComponent(pixelId)}/events`;
}

/** Corpo do POST. O token vai no corpo (nunca na URL, para não aparecer em logs). */
export function requestBody(events: unknown[], token: string, testEventCode: string | null): string {
  const body: Record<string, unknown> = { data: events, access_token: token };
  if (testEventCode) body.test_event_code = testEventCode;
  return JSON.stringify(body);
}

export interface MetaResult {
  ok: boolean;
  httpStatus: number;
  eventsReceived: number | null;
  fbtraceId: string | null;
  errorCode: string | null;
  /** Mensagem em português para a tela (sem token). */
  message: string | null;
  /** Erro de dado de UM evento (o lote todo é recusado): vale reenviar um a um. */
  invalidParameter: boolean;
  /** Token/permissão: não adianta tentar logo de novo. */
  authProblem: boolean;
}

const FRIENDLY: Record<string, string> = {
  "190": "Token inválido ou expirado. Gere um novo token no Gerenciador de Eventos e cole no CRM.",
  "10": "O token não tem permissão para este Pixel.",
  "200": "O token não tem permissão para este Pixel.",
  "803": "Pixel não encontrado. Confira o ID do Pixel.",
  "100": "O Meta recusou um dado do evento.",
  "4": "Muitas chamadas seguidas ao Meta. O envio tenta de novo sozinho.",
  "17": "Muitas chamadas seguidas ao Meta. O envio tenta de novo sozinho.",
  "613": "Muitas chamadas seguidas ao Meta. O envio tenta de novo sozinho.",
};

export function parseMetaResponse(httpStatus: number, body: unknown): MetaResult {
  const b = (body ?? {}) as { events_received?: number; fbtrace_id?: string; error?: { code?: number; error_subcode?: number; message?: string; error_user_msg?: string; fbtrace_id?: string } };
  if (httpStatus >= 200 && httpStatus < 300 && !b.error) {
    return { ok: true, httpStatus, eventsReceived: b.events_received ?? null, fbtraceId: b.fbtrace_id ?? null, errorCode: null, message: null, invalidParameter: false, authProblem: false };
  }
  const code = b.error?.code != null ? String(b.error.code) : null;
  const detail = (b.error?.error_user_msg || b.error?.message || "").replace(/access_token=[^&\s]+/g, "access_token=[oculto]").slice(0, 300);
  const base = code && FRIENDLY[code] ? FRIENDLY[code] : httpStatus >= 500 ? "O Meta está instável agora. O envio tenta de novo sozinho." : "O Meta recusou o envio.";
  return {
    ok: false,
    httpStatus,
    eventsReceived: null,
    fbtraceId: b.error?.fbtrace_id ?? b.fbtrace_id ?? null,
    errorCode: code,
    message: detail && code === "100" ? `${base} (${detail})` : base,
    invalidParameter: code === "100",
    authProblem: code === "190" || code === "10" || code === "200" || code === "803",
  };
}

/** Separa em lotes (o Meta aceita até 1000 por chamada; usamos lotes menores). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Token do Meta: formato básico (o Meta confere de verdade no envio de teste). */
export function looksLikeToken(t: string): boolean {
  return /^[A-Za-z0-9_\-|.]{30,600}$/.test(t);
}
