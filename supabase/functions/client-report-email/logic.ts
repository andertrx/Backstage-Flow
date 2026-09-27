/**
 * Regras do e-mail semanal (Etapa 19.4) sem banco nem rede, para testar.
 */
import { addDays, type PeriodPreset, resolvePeriod } from "../../../packages/shared/src/metrics/periods.ts";

/** Semana do e-mail: os últimos 7 dias completos, no fuso do cliente. */
export function emailWeek(timezone: string, now: Date): { from: string; to: string } {
  return resolvePeriod("last_7_days" as PeriodPreset, timezone, now);
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** "20/09 a 26/09/2026" */
export function periodText(range: { from: string; to: string }): string {
  return `${ddmm(range.from)} a ${ddmm(range.to)}/${range.to.slice(0, 4)}`;
}

export const SITE_URL = "https://www.backstageflow.com.br";

/** Para onde o botão do e-mail leva. */
export function emailButton(kind: string, linkToken: string | null, loginEnabled: boolean): { url: string; label: string } | null {
  if (kind === "link" && linkToken) return { url: `${SITE_URL}/r/${linkToken}`, label: "Ver dashboard completo" };
  if ((kind === "login" || kind === "link") && loginEnabled) return { url: `${SITE_URL}/login`, label: "Entrar e ver o dashboard completo" };
  return null;
}

/** Resposta do Resend → resultado simples (sem repetir a chave em lugar nenhum). */
export function resendResult(status: number, body: unknown): { ok: true; id: string } | { ok: false; message: string } {
  const b = (body ?? {}) as { id?: string; message?: string; name?: string };
  if (status >= 200 && status < 300 && b.id) return { ok: true, id: b.id };
  if (status === 401 || status === 403) {
    const msg = String(b.message ?? "");
    if (/domain/i.test(msg)) return { ok: false, message: `O domínio do remetente ainda não foi verificado no Resend. (${msg.slice(0, 200)})` };
    return { ok: false, message: "O Resend recusou a chave. Confira se ela está certa e tem permissão de envio." };
  }
  if (status === 422 || status === 400) return { ok: false, message: `O Resend não aceitou o envio: ${String(b.message ?? "dados inválidos").slice(0, 250)}` };
  if (status === 429) return { ok: false, message: "O Resend pediu uma pausa (limite de envios). Tente de novo em alguns minutos." };
  return { ok: false, message: `O Resend não respondeu como esperado (código ${status}). Tente de novo mais tarde.` };
}

export { addDays };
