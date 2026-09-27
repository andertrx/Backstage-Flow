/**
 * Regras puras do WhatsApp no CRM (Etapas 34.5-W e 34.5-W2).
 *  - App comum: a equipe digita o código da mensagem ("ref. K7Q2M9").
 *  - API oficial: a conversa já chega sozinha (webhook); a equipe só marca.
 * Lead/Venda vira evento normal da ingestão (leads, compras, Meta CAPI).
 */
import { z } from "npm:zod@4";

export const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{6}$/;

/** "ref. k7q-2m9 " → "K7Q2M9". Inválido → null. */
export function normalizeCode(input: string): string | null {
  let c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length === 9 && c.startsWith("REF")) c = c.slice(3);
  return CODE_PATTERN.test(c) ? c : null;
}

const HASH = z.string().regex(/^[0-9a-f]{64}$/);
const containerId = z.string().uuid("Site inválido.");

export const markSchema = z.object({
  action: z.literal("mark"),
  /** Clique do site (app comum) OU conversa da API oficial. */
  code: z.string().max(40).optional(),
  conversationId: z.number().int().positive().optional(),
  kind: z.enum(["lead", "venda"]),
  value: z.number().min(0).max(1e9).optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  orderId: z.string().trim().regex(/^[A-Za-z0-9_.:/#-]{1,100}$/, "Nº do pedido: use só letras, números e - _ . / #").optional(),
  /** Contato do cliente JÁ CIFRADO na tela do CRM (nunca o texto legível). */
  ud: z.object({ em: HASH, ph: HASH, fn: HASH, ln: HASH }).partial().strict().optional(),
}).refine((v) => (v.code != null) !== (v.conversationId != null), { message: "Informe o código ou a conversa." });
export type MarkInput = z.infer<typeof markSchema>;

export const connectionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("connection_save"),
    containerId,
    phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "O ID do número de telefone tem só números (fica em WhatsApp → Configuração da API)."),
    wabaId: z.string().trim().regex(/^\d{5,30}$/, "O ID da conta do WhatsApp Business tem só números."),
    appSecret: z.string().trim().regex(/^[A-Za-z0-9]{16,128}$/, "O segredo do app parece incompleto (Configurações do app → Básico → Chave secreta do app).").optional(),
    enabled: z.boolean(),
  }),
  z.object({ action: z.literal("connection_reveal"), containerId }),
  z.object({ action: z.literal("connection_remove"), containerId }),
]);
export type ConnectionInput = z.infer<typeof connectionSchema>;

/** Para onde a marcação vai: a visita do site (código) ou a conversa da API oficial. */
export interface MarkTarget {
  /** Prefixo do event_id: o mesmo alvo marcado de novo não duplica. */
  eventPrefix: string;
  code: string | null;
  container_id: string;
  client_id: string;
  visitor_id: string;
  session_id: string;
  page_url: string | null;
  fbp: string | null;
  fbc: string | null;
  /** "chat" (conversa) ou "business_messaging" (anúncio de WhatsApp com ctwa_clid). */
  action_source: "chat" | "business_messaging";
  ctwa_clid: string | null;
  waba_id: string | null;
  /** Hash do número do WhatsApp (API oficial): entra no reconhecimento do Meta. */
  ph_hash: string | null;
}

export class MarkError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
  }
}

/** Pacote de `tracking_ingest` para a marcação (Lead ou Purchase, canal WhatsApp). */
export function buildMarkIngest(input: MarkInput, t: MarkTarget, opts: { test: boolean; now: Date; randomId: string }) {
  const isSale = input.kind === "venda";
  if (isSale && (input.value == null || !input.currency)) throw new MarkError("Informe o valor e a moeda da venda.");
  const eventId = (isSale ? `${t.eventPrefix}.venda.${input.orderId ?? opts.randomId}` : `${t.eventPrefix}.lead`).slice(0, 80);
  let path = "/";
  try {
    path = t.page_url ? new URL(t.page_url).pathname : "/";
  } catch { /* fica "/" */ }
  const ud = { ...(t.ph_hash ? { ph: t.ph_hash } : {}), ...(input.ud ?? {}) };
  return {
    container_id: t.container_id,
    client_id: t.client_id,
    visitor_id: t.visitor_id,
    session_id: t.session_id,
    test: opts.test,
    device_type: "desconhecido",
    consent_status: "nao_exigido",
    consent_version: null,
    user: Object.keys(ud).length ? ud : null,
    capi: { user_agent: null, ip: null, fbp: t.fbp, fbc: t.fbc, action_source: t.action_source, ctwa_clid: t.ctwa_clid, waba_id: t.waba_id },
    event: {
      event_id: eventId,
      name: isSale ? "Purchase" : "Lead",
      occurred_at: opts.now.toISOString(),
      page_url: t.page_url,
      page_path: path,
      referrer_host: null,
      custom_data: { canal: "whatsapp", ...(t.code ? { ref: t.code } : {}) },
      ...(isSale
        ? { value_micros: Math.round(input.value! * 1_000_000), currency: input.currency!.toUpperCase(), transaction_id: input.orderId ?? null }
        : {}),
    },
    touch: null,
  };
}

/** Endereço do webhook que se cola no painel do Meta (um por conexão). */
export function webhookUrl(supabaseUrl: string, connectionId: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/whatsapp-webhook?c=${connectionId}`;
}
