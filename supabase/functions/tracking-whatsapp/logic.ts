/**
 * Regras puras da marcação de conversas do WhatsApp (Etapa 34.5-W).
 * A equipe digita o código que veio na mensagem ("ref. K7Q2M9") e marca
 * Lead ou Venda. Vira um evento normal da ingestão (leads, compras, Meta CAPI).
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

export const markSchema = z.object({
  action: z.literal("mark"),
  code: z.string().max(40),
  kind: z.enum(["lead", "venda"]),
  value: z.number().min(0).max(1e9).optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  orderId: z.string().trim().regex(/^[A-Za-z0-9_.:/#-]{1,100}$/, "Nº do pedido: use só letras, números e - _ . / #").optional(),
  /** Contato do cliente JÁ CIFRADO na tela do CRM (nunca o texto legível). */
  ud: z.object({ em: HASH, ph: HASH, fn: HASH, ln: HASH }).partial().strict().optional(),
});
export type MarkInput = z.infer<typeof markSchema>;

export interface Click {
  code: string;
  container_id: string;
  client_id: string;
  visitor_id: string;
  session_id: string;
  page_url: string | null;
  fbp: string | null;
  fbc: string | null;
}

export class MarkError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
  }
}

/** Pacote de `tracking_ingest` para a marcação (Lead ou Purchase, canal WhatsApp). */
export function buildMarkIngest(input: MarkInput, click: Click, opts: { test: boolean; now: Date; randomId: string }) {
  const isSale = input.kind === "venda";
  if (isSale && (input.value == null || !input.currency)) throw new MarkError("Informe o valor e a moeda da venda.");
  const eventId = isSale ? `wa.${click.code}.venda.${input.orderId ?? opts.randomId}`.slice(0, 80) : `wa.${click.code}.lead`;
  let path = "/";
  try {
    path = click.page_url ? new URL(click.page_url).pathname : "/";
  } catch { /* fica "/" */ }
  return {
    container_id: click.container_id,
    client_id: click.client_id,
    visitor_id: click.visitor_id,
    session_id: click.session_id,
    test: opts.test,
    device_type: "desconhecido",
    consent_status: "nao_exigido",
    consent_version: null,
    user: input.ud ?? null,
    capi: { user_agent: null, ip: null, fbp: click.fbp, fbc: click.fbc, action_source: "chat" },
    event: {
      event_id: eventId,
      name: isSale ? "Purchase" : "Lead",
      occurred_at: opts.now.toISOString(),
      page_url: click.page_url,
      page_path: path,
      referrer_host: null,
      custom_data: { canal: "whatsapp", ref: click.code },
      ...(isSale
        ? { value_micros: Math.round(input.value! * 1_000_000), currency: input.currency!.toUpperCase(), transaction_id: input.orderId ?? null }
        : {}),
    },
    touch: null,
  };
}
