/**
 * Tracking T3.2 (25/10/2026): ler a venda do aviso (webhook) de QUALQUER sistema de vendas.
 *
 * Cada sistema manda o aviso num formato. No CRM, a agência diz onde está cada dado
 * ("mapeamento"), por caminho: "order.id", "customer.phone", "items.0.price".
 * Usado pelo servidor (Edge Function sales-webhook) e pela tela (sugestão do mapeamento).
 * Telefone e e-mail saem daqui legíveis só para serem cifrados na hora pelo servidor.
 */
import { parseMoneyText } from "./rules.ts";

export interface SalesMapping {
  order?: string;
  value?: string;
  /** Valor em centavos (ex.: 29750 = R$ 297,50). */
  value_in_cents?: boolean;
  currency?: string;
  /** Moeda quando o aviso não diz (padrão BRL). */
  default_currency?: string;
  phone?: string;
  email?: string;
  status?: string;
  /** Respostas do campo de status que contam como venda (ex.: "paid", "aprovado"). Vazio = toda venda conta. */
  status_values?: string[];
}

export const MAPPING_FIELDS: { key: keyof SalesMapping; label: string; required?: boolean }[] = [
  { key: "order", label: "Nº do pedido", required: true },
  { key: "value", label: "Valor", required: true },
  { key: "currency", label: "Moeda (opcional)" },
  { key: "phone", label: "Telefone do comprador" },
  { key: "email", label: "E-mail do comprador" },
  { key: "status", label: "Status do pagamento (opcional)" },
];

/** Corpo do aviso: JSON ou formulário (a=1&b=2). Outro formato → null. */
export function parseWebhookBody(text: string, contentType: string | null): Record<string, unknown> | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return v.length && typeof v[0] === "object" && v[0] ? (v[0] as Record<string, unknown>) : null;
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if ((contentType ?? "").includes("form") || /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(t)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(t)) out[k] = v;
    return Object.keys(out).length ? out : null;
  }
  return null;
}

/** Caminhos de todos os campos do aviso (só os nomes, nunca os valores). Listas: só o 1º item. */
export function collectPaths(obj: unknown, max = 200): string[] {
  const out: string[] = [];
  const walk = (v: unknown, prefix: string, depth: number) => {
    if (out.length >= max || depth > 6) return;
    if (Array.isArray(v)) {
      if (v.length) walk(v[0], prefix ? `${prefix}.0` : "0", depth + 1);
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        if (out.length >= max) return;
        walk(child, prefix ? `${prefix}.${k}` : k, depth + 1);
      }
      return;
    }
    if (prefix) out.push(prefix.slice(0, 200));
  };
  walk(obj, "", 0);
  return out;
}

export function getPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const last = (p: string) => norm(p.split(".").filter((x) => !/^\d+$/.test(x)).at(-1) ?? "");

/** Sugestão de mapeamento pelos nomes mais comuns (a agência confere e ajusta). Ordem dos nomes = preferência. */
export function suggestSalesMapping(paths: string[]): SalesMapping {
  const find = (names: string[], avoid?: RegExp) => {
    for (const n of names) {
      const hit = paths.find((p) => last(p) === n && !(avoid && avoid.test(norm(p))));
      if (hit) return hit;
    }
    return undefined;
  };
  const value = find(["total_price", "totalprice", "grand_total", "valor_total", "total", "amount", "amount_cents", "total_cents", "valor", "value", "full_price", "price", "preco"],
    /(item|product|produto|shipping|frete|discount|desconto)/);
  return {
    order: find(["order_id", "orderid", "order_number", "transaction_id", "pedido", "numero", "number", "transaction", "id"], /(customer|cliente|buyer|comprador|product|item|produto)/),
    value,
    value_in_cents: value ? /cents|centavos/.test(norm(value)) : false,
    currency: find(["currency", "currency_code", "moeda"]),
    default_currency: "BRL",
    phone: find(["phone", "phone_number", "mobile_phone", "telefone", "celular", "cellphone", "mobile", "whatsapp", "fone"]),
    email: find(["email", "e_mail", "mail"]),
    status: find(["financial_status", "payment_status", "status", "situacao", "order_status"]),
    status_values: [],
  };
}

export type SaleExtract =
  | { ok: true; order: string; value: number; currency: string; phone: string | null; email: string | null }
  | { ok: false; result: "recusado" | "ignorado"; reason: string };

const asText = (v: unknown) => (v == null || typeof v === "object" ? null : String(v).trim() || null);

/** Lê a venda do aviso pelo mapeamento. Nada inventado: faltou dado obrigatório → recusado, com o motivo. */
export function extractSale(body: Record<string, unknown>, m: SalesMapping): SaleExtract {
  if (typeof m.order !== "string" || typeof m.value !== "string" || !m.order || !m.value) return { ok: false, result: "recusado", reason: "Mapeamento incompleto: diga no CRM onde estão o nº do pedido e o valor." };
  const accepted = Array.isArray(m.status_values) ? m.status_values.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
  if (m.status && accepted.length) {
    const st = asText(getPath(body, m.status));
    if (!st || !accepted.some((s) => norm(s.trim()) === norm(st))) {
      return { ok: false, result: "ignorado", reason: `Status "${(st ?? "vazio").slice(0, 40)}" não conta como venda.` };
    }
  }
  const order = asText(getPath(body, m.order));
  if (!order) return { ok: false, result: "recusado", reason: `Nº do pedido não encontrado em "${m.order}".` };
  const rawValue = getPath(body, m.value);
  let value = typeof rawValue === "number" ? rawValue : parseMoneyText(asText(rawValue));
  if (value == null || !Number.isFinite(value) || value < 0) return { ok: false, result: "recusado", reason: `Valor não encontrado em "${m.value}".` };
  if (m.value_in_cents) value = Math.round(value) / 100;
  const currency = (asText(getPath(body, m.currency)) ?? m.default_currency ?? "BRL").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, result: "recusado", reason: "Moeda inválida no aviso." };
  return {
    ok: true,
    order: order.slice(0, 100).replace(/[^A-Za-z0-9_.:/#-]/g, "-"),
    value: Math.round(value * 100) / 100,
    currency,
    phone: asText(getPath(body, m.phone)),
    email: asText(getPath(body, m.email)),
  };
}
