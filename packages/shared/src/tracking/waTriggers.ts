/**
 * Tracking T4.1 (25/10/2026): frases do WhatsApp, como no Tintim.
 * O atendente manda no chat uma frase combinada (ex.: "Parabéns pela sua compra de R$ 297") e o CRM marca
 * o contato daquele número. Usado pelo servidor (whatsapp-webhook, texto só na memória) e pela tela ("testar frase").
 */
import { parseMoneyText } from "./rules.ts";

// Marcas de acento (escrito como texto para o empacotador do servidor não trocar por caracteres especiais).
const ACCENTS = new RegExp("\\p{M}", "gu");

export type TriggerKind = "perfil" | "etapa" | "venda";

export interface WaTrigger {
  id: string;
  phrase: string;
  kind: TriggerKind;
  currency: string;
}

export interface TriggerMatch {
  trigger_id: string;
  kind: TriggerKind;
  value?: number;
  currency?: string;
}

/** Sem acento, minúsculo, só letras/números separados por um espaço. */
export function normalizeTriggerText(text: string): string {
  return ` ${text.toLowerCase().normalize("NFD").replace(ACCENTS, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

// "\u20ac" = símbolo do euro; "\u00f3" = ó (escritos assim para o servidor receber o arquivo só com letras simples).
const CURRENCY_BEFORE = new RegExp("(R\\$|US\\$|U\\$|USD|BRL|EUR|\u20ac|\\$)\\s*(\\d[\\d.,]*)", "i");
const CURRENCY_AFTER = new RegExp("(\\d[\\d.,]*)\\s*(reais|real|brl|d[o\u00f3]lares|usd|euros?|eur)\\b", "i");
const currencyOf = (s: string) => {
  const t = s.toLowerCase();
  if (t === "r$" || t === "brl" || t.startsWith("rea")) return "BRL";
  if (t === "\u20ac" || t.startsWith("eur")) return "EUR";
  return "USD";
};

/**
 * Valor da venda escrito na mensagem. Só vale com a moeda junto ("R$ 297", "297 reais", "US$ 50"):
 * um número solto (nº do pedido, telefone) nunca vira valor. Procura primeiro depois da frase.
 */
export function extractMessageValue(text: string, after = 0): { value: number; currency: string } | null {
  for (const part of [text.slice(after), text]) {
    const b = CURRENCY_BEFORE.exec(part);
    const a = CURRENCY_AFTER.exec(part);
    const first = b && (!a || b.index <= a.index) ? { num: b[2], cur: b[1] } : a ? { num: a[1], cur: a[2] } : null;
    if (first) {
      const value = parseMoneyText(first.num);
      if (value != null) return { value, currency: currencyOf(first.cur) };
    }
  }
  return null;
}

/** Frases que aparecem na mensagem. Ordem: perfil, etapa, venda (no máximo uma venda por mensagem). */
export function matchTriggers(text: string, triggers: WaTrigger[]): TriggerMatch[] {
  const norm = normalizeTriggerText(text);
  const order: Record<TriggerKind, number> = { perfil: 0, etapa: 1, venda: 2 };
  const out: TriggerMatch[] = [];
  let sold = false;
  for (const t of [...triggers].sort((x, y) => order[x.kind] - order[y.kind])) {
    const phrase = normalizeTriggerText(t.phrase);
    if (phrase.trim().length < 3 || !norm.includes(phrase)) continue;
    if (t.kind !== "venda") {
      out.push({ trigger_id: t.id, kind: t.kind });
      continue;
    }
    if (sold) continue;
    sold = true;
    // Posição aproximada da frase no texto original, para ler o valor que vem depois dela.
    const firstWord = phrase.trim().split(" ")[0];
    const pos = Math.max(0, text.toLowerCase().normalize("NFD").replace(ACCENTS, "").indexOf(firstWord));
    const v = extractMessageValue(text, pos);
    out.push(v ? { trigger_id: t.id, kind: "venda", value: v.value, currency: v.currency } : { trigger_id: t.id, kind: "venda" });
  }
  return out;
}

/**
 * Número como o WhatsApp manda → número completo. No Brasil, celulares antigos chegam sem o 9
 * (55 + DDD + 8 dígitos começando com 6 a 9): o 9 é colocado de volta, para achar o contato digitado com o 9.
 */
export function normalizeWhatsAppNumber(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("55") && /[6-9]/.test(d[4])) return d.slice(0, 4) + "9" + d.slice(4);
  return d;
}
