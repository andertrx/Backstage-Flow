// Etapa 39.2 — Inteligência de Resultados: transformar as linhas da planilha na
// "última leitura" (sem nome nem telefone legíveis). Usado pelo servidor; testado aqui.
import { customParams, normalizeText, type RiField, type RiMapping } from "./sheets.ts";

/** Uma linha da última leitura (chaves curtas para caber bem no banco). */
export interface RiRow {
  /** Linha na planilha (para achar o registro lá). */
  n: number;
  /** Chave do registro: ID da planilha ou "L<linha>". */
  k: string;
  /** Impressão digital do contato (hash), para contar contatos únicos. null = sem telefone/e-mail. */
  h: string | null;
  /** Data do contato (AAAA-MM-DD). null = sem data ou data inválida. */
  d: string | null;
  /** Valor da coluna de perfil, normalizado (minúsculas, sem acento). As regras do cliente dizem o perfil. */
  p: string;
  acc: string | null;
  cid: string | null;
  cn: string | null;
  sid: string | null;
  sn: string | null;
  aid: string | null;
  an: string | null;
  st: string | null;
  sd: string | null;
  sv: number | null;
  /** utm_source e utm_medium (texto). */
  us?: string | null;
  um?: string | null;
  /** A linha tem clique do Google (gclid) / do Meta (fbclid). Só a marcação; o código do clique não é guardado. */
  gc?: true;
  fb?: true;
  /** Parâmetros personalizados: nome → valor. */
  x?: Record<string, string>;
}

export interface RiReadStats {
  /** Linhas com algum conteúdo abaixo do cabeçalho. */
  total: number;
  /** Linhas guardadas na última leitura. */
  stored: number;
  /** Linhas com ID repetido (fica a primeira). */
  duplicates: number;
  noDate: number;
  invalidDates: number;
  noProfile: number;
  /** Sem nenhuma informação de campanha, conjunto ou anúncio. */
  noOrigin: number;
  /** IDs de conta/campanha/conjunto/anúncio que não são números (ficam de fora; o nome continua). */
  invalidIds: number;
  noContact: number;
}

const DIGITS = /^\d{3,30}$/;

/** "10/10/2026", "10/10/26 14:30", "2026-10-10T14:30" → "2026-10-10". null = não reconhecida. */
export function parseSheetDate(value: string): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T,]+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(v);
  if (hit) {
    d = Number(hit[1]); m = Number(hit[2]); y = Number(hit[3].length === 2 ? `20${hit[3]}` : hit[3]);
  } else {
    hit = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(v);
    if (!hit) return null;
    y = Number(hit[1]); m = Number(hit[2]); d = Number(hit[3]);
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** "R$ 1.234,56", "1234.56", "1,234.56" → 1234.56. null = vazio ou não é número. */
export function parseMoney(value: string): number | null {
  const v = value.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(v)) return null;
  const dec = /[.,](\d{1,2})$/.exec(v);
  const whole = (dec ? v.slice(0, dec.index) : v).replace(/[.,]/g, "");
  if (!/^-?\d+$/.test(whole)) return null;
  const n = Number(`${whole}.${dec ? dec[1] : "0"}`);
  return Number.isFinite(n) ? n : null;
}

/** Telefone (só dígitos, com 55 do Brasil quando faltar) ou e-mail (minúsculo). null = vazio. */
export function normalizeContact(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@")) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
  let digits = v.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

/**
 * Linhas da planilha → linhas da última leitura + números da qualidade.
 * `hash` transforma o contato normalizado na impressão digital (o servidor usa SHA-256);
 * o telefone/e-mail legível nunca sai daqui.
 */
export async function buildRead(
  headers: string[], rows: string[][], mapping: RiMapping, headerRow: number,
  hash: (contact: string) => Promise<string>,
): Promise<{ rows: RiRow[]; stats: RiReadStats }> {
  const col = (field: RiField) => (mapping[field] ? headers.indexOf(mapping[field]!) : -1);
  // O Nome (contact_name) nunca é lido: o CRM não guarda dados pessoais.
  const idx = Object.fromEntries((["record_id", "contact_date", "contact_key", "profile", "account_id", "campaign_id", "campaign_name",
    "adset_id", "adset_name", "ad_id", "ad_name", "status", "sale_date", "sale_value", "utm_source", "utm_medium", "gclid", "fbclid"] as const)
    .map((f) => [f, col(f)]));
  const custom = customParams(mapping).map((c) => ({ label: c.label, index: headers.indexOf(c.column) })).filter((c) => c.index >= 0);
  const stats: RiReadStats = { total: 0, stored: 0, duplicates: 0, noDate: 0, invalidDates: 0, noProfile: 0, noOrigin: 0, invalidIds: 0, noContact: 0 };
  const out: RiRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((c) => String(c ?? "").trim())) continue;
    stats.total++;
    const cell = (f: string) => (idx[f] >= 0 ? String(r[idx[f]] ?? "").trim() : "");
    const text = (f: string) => cell(f).slice(0, 300) || null;
    const id = (f: string) => {
      const v = cell(f).replace(/^act_/i, "");
      if (!v) return null;
      if (DIGITS.test(v)) return v;
      stats.invalidIds++;
      return null;
    };

    const rowNumber = headerRow + 1 + i;
    const recordId = cell("record_id").slice(0, 200);
    const key = recordId ? `id:${recordId}` : `L${rowNumber}`;
    if (seen.has(key)) { stats.duplicates++; continue; }
    seen.add(key);

    const rawDate = cell("contact_date");
    const d = rawDate ? parseSheetDate(rawDate) : null;
    if (!rawDate) stats.noDate++;
    else if (!d) stats.invalidDates++;

    const p = normalizeText(cell("profile")).slice(0, 200);
    if (!p) stats.noProfile++;

    const contact = normalizeContact(cell("contact_key"));
    if (!contact) stats.noContact++;

    const row: RiRow = {
      n: rowNumber, k: key, h: contact ? await hash(contact) : null, d, p,
      acc: id("account_id"), cid: id("campaign_id"), cn: text("campaign_name"), sid: id("adset_id"), sn: text("adset_name"),
      aid: id("ad_id"), an: text("ad_name"), st: text("status"),
      sd: cell("sale_date") ? parseSheetDate(cell("sale_date")) : null, sv: cell("sale_value") ? parseMoney(cell("sale_value")) : null,
    };
    const us = text("utm_source"), um = text("utm_medium");
    if (us) row.us = us;
    if (um) row.um = um;
    if (cell("gclid")) row.gc = true;
    if (cell("fbclid")) row.fb = true;
    const extra = Object.fromEntries(custom.map((c) => [c.label, String(r[c.index] ?? "").trim().slice(0, 300)]).filter(([, v]) => v));
    if (Object.keys(extra).length) row.x = extra;
    if (!row.cid && !row.cn && !row.sid && !row.sn && !row.aid && !row.an) stats.noOrigin++;
    out.push(row);
  }
  stats.stored = out.length;
  return { rows: out, stats };
}

/** Próxima leitura automática (8h, 12h e 16h no horário de Brasília) depois de `now`. */
export function nextScheduledRead(now: Date = new Date()): Date {
  // Brasília = UTC−3 (sem horário de verão desde 2019): 8h, 12h e 16h = 11h, 15h e 19h UTC.
  const hours = [11, 15, 19];
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let add = 0; add < 2; add++) {
    for (const h of hours) {
      const t = new Date(day + add * 86_400_000 + h * 3_600_000);
      if (t.getTime() > now.getTime()) return t;
    }
  }
  return new Date(day + 86_400_000 + hours[0] * 3_600_000);
}
