/**
 * Lógica do sales-webhook (Tracking T3.2), separada para ser testada sem banco.
 * Telefone e e-mail do comprador são cifrados (SHA-256) aqui, na chegada; o texto legível
 * nunca é guardado nem vai para log (aprovado pelo Ander em 25/10/2026).
 */
import { normalizeLeadEmail, normalizeLeadPhone, sha256Hex } from "../../../packages/shared/src/tracking/identity.ts";
import { collectPaths, extractSale, parseWebhookBody, type SalesMapping } from "../../../packages/shared/src/tracking/salesWebhook.ts";

export const MAX_BODY_BYTES = 64 * 1024;
export const LIMIT = { max: 120, windowSeconds: 60 } as const;
export const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const KEY_PATTERN = /^[0-9a-f]{48}$/;

/** Chave pelo cabeçalho x-webhook-key (preferido) ou ?k= (para sistemas que só aceitam o endereço). */
export function readCredentials(url: URL, headers: Headers): { id: string; key: string } | null {
  const id = (url.searchParams.get("w") ?? "").toLowerCase();
  const key = (headers.get("x-webhook-key") ?? url.searchParams.get("k") ?? "").trim().toLowerCase();
  return ID_PATTERN.test(id) && KEY_PATTERN.test(key) ? { id, key } : null;
}

/** Monta o pedido para o banco (sales_webhook_receive). Só nomes de campos e hashes saem daqui. */
export async function buildReceive(
  webhookId: string,
  text: string,
  contentType: string | null,
  mapping: SalesMapping | null,
): Promise<Record<string, unknown>> {
  const body = parseWebhookBody(text, contentType);
  if (!body) return { webhook_id: webhookId, keys: [], result: "recusado", reason: "Formato do aviso não reconhecido (aceito: JSON ou formulário)." };
  const keys = collectPaths(body);
  const sale = extractSale(body, mapping ?? {});
  if (!sale.ok) return { webhook_id: webhookId, keys, result: sale.result, reason: sale.reason };
  const phone = normalizeLeadPhone(sale.phone);
  const email = normalizeLeadEmail(sale.email);
  return {
    webhook_id: webhookId,
    keys,
    order_id: sale.order,
    value: sale.value,
    currency: sale.currency,
    ph_hash: phone ? await sha256Hex(phone) : null,
    em_hash: email ? await sha256Hex(email) : null,
  };
}
