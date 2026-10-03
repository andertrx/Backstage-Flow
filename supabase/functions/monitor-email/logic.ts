/**
 * E-mail dos avisos do monitoramento (Etapa 37.5) sem banco nem rede, para testar.
 */
import { SITE_URL } from "../client-report-email/logic.ts";

export interface MonitorEmailInput {
  toName: string | null;
  subject: string | null;
  body: string | null;
  link: string | null;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Só aceita endereços internos do monitoramento (nunca leva para fora do site). */
export function monitorLink(link: string | null): string {
  return link && /^\/monitoramento(\?[\w=&%-]*)?$/.test(link) ? `${SITE_URL}${link}` : `${SITE_URL}/monitoramento?aba=alertas`;
}

/** Monta o e-mail (assunto, HTML e texto simples). */
export function buildMonitorEmail(m: MonitorEmailInput): { subject: string; html: string; text: string } {
  const subject = (m.subject?.trim() || "Aviso do monitoramento").slice(0, 200);
  const body = (m.body ?? "").trim();
  const url = monitorLink(m.link);
  const hello = m.toName ? `Olá, ${m.toName.split(" ")[0]}.` : "Olá.";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;color:#2563eb;font-weight:bold;text-transform:uppercase;letter-spacing:.04em">Backstage Flow · Monitoramento</p>
<h1 style="margin:0 0 16px;font-size:18px;line-height:1.35">${esc(subject)}</h1>
<p style="margin:0 0 8px;font-size:14px">${esc(hello)}</p>
${body ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.5">${esc(body)}</p>` : ""}
<a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold">Abrir no Backstage Flow</a>
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Você recebe este e-mail porque ligou os avisos por e-mail em Monitoramento → Configurações → Minhas notificações. Lá também dá para desligar.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${subject}\n\n${hello}\n${body ? `${body}\n` : ""}\nAbrir: ${url}\n\nPara desligar: Monitoramento → Configurações → Minhas notificações.`;
  return { subject, html, text };
}
