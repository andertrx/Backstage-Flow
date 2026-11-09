/**
 * Aviso para aprovar o envio semanal (04/11/2026): texto da notificação no aparelho e do e-mail, sem banco nem rede.
 * Só leva nome, código, horário e número de grupos do envio; nunca a mensagem nem contatos.
 */
import { SITE_URL } from "../client-report-email/logic.ts";

export type Momento = "inicio" | "meio" | "fim";

export interface AvisoEnvio {
  momento: Momento;
  nome: string;
  codigo: string;
  horario: string; // HH:MM (Brasília)
  grupos: number;
  nome_pessoa: string | null;
}

export const ENVIOS_URL = `${SITE_URL}/operacoes/envios`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function avisoTitulo(a: Pick<AvisoEnvio, "momento" | "horario">): string {
  return `${a.momento === "fim" ? "Última chamada: aprove" : "Aprove"} o envio de hoje até ${a.horario}`;
}

export function avisoCorpo(a: Pick<AvisoEnvio, "codigo" | "nome" | "grupos" | "horario">): string {
  return `${a.codigo} · ${a.nome} · ${a.grupos} grupo(s). Sem a sua aprovação até as ${a.horario} o envio não sai.`.slice(0, 300);
}

/** Notificação no aparelho (mesmo formato do lembrete de tarefas). */
export function avisoPush(a: AvisoEnvio): { title: string; body: string; url: string; tag: string } {
  return { title: avisoTitulo(a), body: avisoCorpo(a), url: ENVIOS_URL, tag: `envio-aprovar-${a.codigo}` };
}

/** E-mail (assunto, HTML e texto simples). */
export function avisoEmail(a: AvisoEnvio): { subject: string; html: string; text: string } {
  const subject = avisoTitulo(a).slice(0, 200);
  const body = avisoCorpo(a);
  const hello = a.nome_pessoa ? `Olá, ${a.nome_pessoa.split(" ")[0]}.` : "Olá.";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;color:#2563eb;font-weight:bold;text-transform:uppercase;letter-spacing:.04em">Backstage Flow · Envios semanais</p>
<h1 style="margin:0 0 16px;font-size:18px;line-height:1.35">${esc(subject)}</h1>
<p style="margin:0 0 8px;font-size:14px">${esc(hello)}</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.5">${esc(body)}</p>
<a href="${ENVIOS_URL}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold">Revisar e aprovar</a>
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Você recebe este aviso porque tem a permissão de Envios semanais. Para desligar, use Central de Operações → Notificações → "Aprovar o envio semanal".</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${subject}\n\n${hello}\n${body}\n\nRevisar e aprovar: ${ENVIOS_URL}\n\nPara desligar: Central de Operações → Notificações → "Aprovar o envio semanal".`;
  return { subject, html, text };
}

// ---------------------------------------------------------------- Aviso de WhatsApp dos envios caiu/voltou (T5.18)
export interface AvisoWa {
  tipo: "caiu" | "voltou";
  titulo: string;
  corpo: string;
  nome_pessoa: string | null;
}

export const WA_CONEXAO_URL = `${SITE_URL}/configuracoes/integracoes`;

export function waAvisoPush(a: AvisoWa): { title: string; body: string; url: string; tag: string } {
  return { title: a.titulo.slice(0, 120), body: a.corpo.slice(0, 300), url: WA_CONEXAO_URL, tag: `wa-conexao-${a.tipo}` };
}

export function waAvisoEmail(a: AvisoWa): { subject: string; html: string; text: string } {
  const subject = a.titulo.slice(0, 200);
  const hello = a.nome_pessoa ? `Olá, ${a.nome_pessoa.split(" ")[0]}.` : "Olá.";
  const cor = a.tipo === "caiu" ? "#b91c1c" : "#047857";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;color:${cor};font-weight:bold;text-transform:uppercase;letter-spacing:.04em">Backstage Flow · WhatsApp dos envios</p>
<h1 style="margin:0 0 16px;font-size:18px;line-height:1.35">${esc(subject)}</h1>
<p style="margin:0 0 8px;font-size:14px">${esc(hello)}</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.5">${esc(a.corpo)}</p>
<a href="${WA_CONEXAO_URL}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold">Abrir Integrações</a>
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Você recebe este aviso por ser administrador do CRM.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${subject}\n\n${hello}\n${a.corpo}\n\nAbrir Integrações: ${WA_CONEXAO_URL}`;
  return { subject, html, text };
}
