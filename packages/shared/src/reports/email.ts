// E-mail semanal do relatório (Etapa 19.4) e a frase de resumo usada também
// no dashboard. Só números reais; moeda da conta; sem conversão BRL ↔ USD.
import type { KpiFormat } from "../metrics/kpis.ts";
import { kpiVariation } from "../metrics/kpis.ts";
import {
  computeReportKpis, type MainResult, mainResultFor, type ReportKpiKey, reportKpiDefinitions, type ReportTotals, type SummaryParts, summaryParts,
} from "./clientReport.ts";

/** Número no padrão brasileiro (mesmas regras do painel). */
export function formatReportValue(value: number, format: KpiFormat, currency: string): string {
  switch (format) {
    case "money": return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
    case "integer": return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
    case "decimal": return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
    case "percent": return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
    case "ratio": return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`;
  }
}

/** Variação com sinal: +20,0% / −5,3%. */
export function formatPercentChange(percent: number): string {
  const abs = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(percent));
  return percent > 0 ? `+${abs}%` : percent < 0 ? `−${abs}%` : `${abs}%`;
}

const lower = (label: string) => (label === label.toUpperCase() ? label : label.toLowerCase());

/**
 * Frase de resumo, só com fatos do período:
 * "Foram investidos R$ 700,00 e gerados 50 leads, a R$ 14,00 cada. Comparado ao período anterior: 25,0% mais leads e custo por resultado 20,0% menor."
 */
export function summarySentence(s: SummaryParts, main: MainResult, currency: string): string {
  if (s.spend == null) return "Sem investimento registrado neste período.";
  const money = (v: number) => formatReportValue(v, "money", currency);
  const name = lower(main.label);
  let text = `Foram investidos ${money(s.spend)}`;
  if (s.result == null) text += ".";
  else if (s.result === 0) text += `, sem ${name} no período.`;
  else {
    text += ` e gerados ${formatReportValue(s.result, "decimal", currency)} ${name}`;
    text += s.costPerResult != null ? `, a ${money(s.costPerResult)} cada.` : ".";
  }
  const parts: string[] = [];
  if (s.resultChange != null && Math.abs(s.resultChange) >= 0.05) {
    parts.push(`${formatPercentChange(Math.abs(s.resultChange)).replace("+", "")} ${s.resultChange > 0 ? "mais" : "menos"} ${name}`);
  }
  if (s.costChange != null && Math.abs(s.costChange) >= 0.05) {
    parts.push(`custo por resultado ${formatPercentChange(Math.abs(s.costChange)).replace("+", "")} ${s.costChange > 0 ? "maior" : "menor"}`);
  }
  if (parts.length) text += ` Comparado ao período anterior: ${parts.join(" e ")}.`;
  return text;
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

export interface EmailAccountInput {
  name: string;
  platformLabel: string;
  platformId: string;
  currency: string;
  cur: ReportTotals | null;
  prev: ReportTotals | null;
}

export interface WeeklyEmailInput {
  clientName: string;
  title: string;
  logoUrl: string | null;
  /** "20/09 a 26/09/2026" */
  periodText: string;
  mainResult: MainResult;
  /** Métricas do modelo do cliente (as 4 primeiras que existirem vão no e-mail). */
  kpis: ReportKpiKey[];
  accounts: EmailAccountInput[];
  button: { url: string; label: string } | null;
  agencyNote: string | null;
}

export interface EmailKpi {
  label: string;
  value: string;
  change: string | null;
  tone: "good" | "bad" | "neutral";
}

export interface EmailAccountBlock {
  heading: string;
  summary: string;
  kpis: EmailKpi[];
}

/** O conteúdo de cada conta (só as que tiveram dados). null = nada para enviar. */
export function weeklyEmailBlocks(input: WeeklyEmailInput): EmailAccountBlock[] {
  const blocks: EmailAccountBlock[] = [];
  for (const a of input.accounts) {
    if (!a.cur) continue;
    const main = mainResultFor(input.mainResult, a.platformId);
    const defs = reportKpiDefinitions(main);
    const cur = computeReportKpis(a.cur, main);
    const prev = computeReportKpis(a.prev, main);
    const keys = input.kpis.filter((k) => cur[k] != null).slice(0, 4);
    blocks.push({
      heading: `${a.platformLabel} · ${a.name}`,
      summary: summarySentence(summaryParts(a.cur, a.prev, main), main, a.currency),
      kpis: keys.map((k) => {
        const d = defs[k];
        const v = kpiVariation(cur[k], prev[k], d.direction);
        return {
          label: d.label,
          value: formatReportValue(cur[k] as number, d.format, a.currency),
          change: v.percent == null ? null : formatPercentChange(v.percent),
          tone: v.tone,
        };
      }),
    });
  }
  return blocks;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const TONE_COLOR = { good: "#047857", bad: "#b91c1c", neutral: "#475569" };

/** Assunto, HTML (tabelas e estilos simples: funciona no Gmail/Outlook) e texto puro. */
export function buildWeeklyEmail(input: WeeklyEmailInput): { subject: string; html: string; text: string } | null {
  const blocks = weeklyEmailBlocks(input);
  if (!blocks.length) return null;
  const subject = `${input.clientName}: resultados de ${input.periodText}`.slice(0, 150);

  const kpiCells = (b: EmailAccountBlock) => b.kpis.map((k) => `
      <td style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;vertical-align:top;width:25%">
        <div style="font-size:12px;color:#64748b">${esc(k.label)}</div>
        <div style="font-size:18px;font-weight:600;color:#0f172a;margin-top:2px">${esc(k.value)}</div>
        ${k.change ? `<div style="font-size:12px;color:${TONE_COLOR[k.tone]};margin-top:2px">${esc(k.change)} vs. semana anterior</div>` : `<div style="font-size:12px;color:#94a3b8;margin-top:2px">sem base de comparação</div>`}
      </td>`).join("");
  const accountHtml = blocks.map((b) => `
    <tr><td style="padding:16px 24px 0">
      <div style="font-size:15px;font-weight:600;color:#0f172a">${esc(b.heading)}</div>
      <div style="font-size:14px;line-height:1.5;color:#1e293b;margin:8px 0 12px;padding:10px 12px;border-left:4px solid #4f46e5;background:#f8fafc">${esc(b.summary)}</div>
      ${b.kpis.length ? `<table role="presentation" width="100%" cellspacing="6" cellpadding="0"><tr>${kpiCells(b)}</tr></table>` : ""}
    </td></tr>`).join("");
  const logo = input.logoUrl && /^https:\/\//.test(input.logoUrl)
    ? `<img src="${esc(input.logoUrl)}" alt="${esc(input.clientName)}" height="40" style="height:40px;max-width:180px;display:block;margin-bottom:12px">` : "";
  const button = input.button && /^https:\/\//.test(input.button.url)
    ? `<tr><td style="padding:20px 24px 4px" align="left"><a href="${esc(input.button.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${esc(input.button.label)}</a></td></tr>` : "";
  const note = input.agencyNote?.trim()
    ? `<tr><td style="padding:16px 24px 0"><div style="font-size:13px;font-weight:600;color:#0f172a">Análise da agência</div><div style="font-size:13px;line-height:1.5;color:#334155;white-space:pre-wrap">${esc(input.agencyNote.trim().slice(0, 1500))}</div></td></tr>` : "";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px">
  <tr><td style="padding:24px 24px 0">${logo}
    <div style="font-size:20px;font-weight:700;color:#0f172a">${esc(input.title)}</div>
    <div style="font-size:13px;color:#64748b;margin-top:4px">Semana de ${esc(input.periodText)}</div>
  </td></tr>
  ${accountHtml}
  ${note}
  ${button}
  <tr><td style="padding:20px 24px 24px;font-size:11px;line-height:1.5;color:#94a3b8">
    Números informados pelas próprias plataformas de anúncios, no fuso do cliente. Moedas diferentes nunca são somadas.<br>
    Você recebe este e-mail porque a agência cadastrou seu endereço para o relatório semanal.
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    input.title, `Semana de ${input.periodText}`, "",
    ...blocks.flatMap((b) => [b.heading, b.summary, ...b.kpis.map((k) => `- ${k.label}: ${k.value}${k.change ? ` (${k.change} vs. semana anterior)` : ""}`), ""]),
    ...(input.agencyNote?.trim() ? ["Análise da agência:", input.agencyNote.trim().slice(0, 1500), ""] : []),
    ...(input.button ? [`${input.button.label}: ${input.button.url}`, ""] : []),
    "Números informados pelas próprias plataformas de anúncios. Moedas diferentes nunca são somadas.",
  ].join("\n");
  return { subject, html, text };
}
