/**
 * Edge Function: client-report-email (Etapa 19.4)
 *
 * Envia o e-mail semanal do relatório pelo Resend (API oficial). A chave do
 * Resend fica no cofre (Vault) e só este servidor lê.
 *
 * Ações (POST com JSON):
 *   scheduled                → agendador do banco (senha interna): envia para
 *                              quem está na vez (dia e hora no fuso do cliente)
 *   send_now { clientId }    → admin/gestor: envia agora para os destinatários
 *   test { clientId }        → admin/gestor: manda o e-mail do cliente só para quem pediu
 *   test_settings            → admin: e-mail simples para conferir chave e domínio
 *
 * Nunca manda e-mail sem dados (semana sem números = "pulado") e nunca duas
 * vezes na mesma semana pelo agendador. Todo envio fica no histórico.
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PLATFORM_LABELS } from "../../../packages/shared/src/platforms/catalog.ts";
import { normalizeReportSettings, toReportTotals } from "../../../packages/shared/src/reports/clientReport.ts";
import { buildWeeklyEmail } from "../../../packages/shared/src/reports/email.ts";
import { adminClient, type Caller, requireRole, userClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { emailButton, emailWeek, periodText, resendResult } from "./logic.ts";

const RESEND_URL = "https://api.resend.com/emails";
const MAX_PER_RUN = 20;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scheduled") }),
  z.object({ action: z.literal("send_now"), clientId: z.string().uuid() }),
  z.object({ action: z.literal("test"), clientId: z.string().uuid() }),
  z.object({ action: z.literal("test_settings") }),
]);

interface Sender { from: string; replyTo: string | null; key: string }

async function loadSender(db: SupabaseClient): Promise<Sender> {
  const { data: s, error } = await db.from("email_settings").select("from_name, from_email, reply_to, has_key").eq("id", true).maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a configuração de e-mail.", error);
  if (!s?.has_key) throw new AppError(400, "EMAIL_NOT_CONFIGURED", "O envio de e-mails ainda não foi configurado (falta a chave do Resend em Configurações → Integrações).");
  const { data: key, error: keyError } = await db.rpc("email_api_key_get");
  if (keyError || !key) throw new AppError(400, "EMAIL_NOT_CONFIGURED", "A chave do Resend não foi encontrada no cofre. Cole a chave de novo em Configurações → Integrações.", keyError);
  return { from: `${s.from_name} <${s.from_email}>`, replyTo: s.reply_to, key: key as string };
}

async function sendOne(sender: Sender, to: string, subject: string, html: string, text: string) {
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${sender.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender.from, to: [to], subject, html, text, ...(sender.replyTo ? { reply_to: sender.replyTo } : {}) }),
    });
  } catch (err) {
    return { ok: false as const, message: "Não conseguimos falar com o Resend agora.", technical: err };
  }
  const body = await res.json().catch(() => ({}));
  const r = resendResult(res.status, body);
  return r.ok ? r : { ...r, technical: { status: res.status, body } };
}

async function log(db: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await db.from("client_report_email_log").insert(row);
  if (error) await recordError({ source: "servidor", code: "EMAIL_LOG_FAILED", technical: error, context: { funcao: "client-report-email" } });
}

/** Monta e envia o e-mail de UM cliente. `onlyTo` = teste (só para quem pediu). */
async function sendForClient(db: SupabaseClient, sender: Sender, clientId: string, trigger: "agendado" | "manual" | "teste", caller: Caller | null, onlyTo?: string) {
  const [{ data: client }, { data: cfg }, { data: settingsRow }, { data: portal }] = await Promise.all([
    db.from("clients").select("id, name, timezone").eq("id", clientId).maybeSingle(),
    db.from("client_report_email").select("recipients, button").eq("client_id", clientId).maybeSingle(),
    db.from("client_report_settings").select("*").eq("client_id", clientId).maybeSingle(),
    db.from("client_portal").select("login_enabled").eq("client_id", clientId).maybeSingle(),
  ]);
  if (!client) throw new AppError(404, "NOT_FOUND", "Cliente não encontrado.");
  const week = emailWeek(client.timezone, new Date());
  const base = { client_id: clientId, trigger, period_from: week.from, period_to: week.to, requested_by: caller?.id ?? null };
  const recipients: string[] = onlyTo ? [onlyTo] : (cfg?.recipients ?? []);
  if (!recipients.length) {
    await log(db, { ...base, status: "pulado", detail: "Nenhum destinatário cadastrado." });
    return { status: "pulado" as const, detail: "Nenhum destinatário cadastrado." };
  }

  const { data: accounts, error } = await db.rpc("client_report_accounts", { p_client_id: clientId, p_from: week.from, p_to: week.to });
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler os números do cliente.", error);
  const settings = normalizeReportSettings(settingsRow, client.name);
  const linkToken = cfg?.button === "link" ? ((await db.rpc("client_report_email_link_get", { p_client_id: clientId })).data as string | null) : null;
  const logoUrl = settingsRow?.logo_path ? db.storage.from("client-logos").getPublicUrl(settingsRow.logo_path).data.publicUrl : null;
  const email = buildWeeklyEmail({
    clientName: client.name,
    title: settings.title,
    logoUrl,
    periodText: periodText(week),
    mainResult: settings.main_result,
    kpis: settings.kpis,
    accounts: (accounts as Record<string, unknown>[]).map((a) => ({
      name: String(a.name), platformId: String(a.platform_id), platformLabel: PLATFORM_LABELS[String(a.platform_id)] ?? String(a.platform_id),
      currency: String(a.currency), cur: toReportTotals(a.cur as Record<string, unknown> | null), prev: toReportTotals(a.prev as Record<string, unknown> | null),
    })),
    button: emailButton(cfg?.button ?? "login", linkToken, Boolean(portal?.login_enabled)),
    agencyNote: settings.sections.notes ? settings.agency_notes : null,
  });
  if (!email) {
    await log(db, { ...base, status: "pulado", detail: "Sem dados de anúncios nesta semana: nada foi enviado." });
    return { status: "pulado" as const, detail: "Sem dados de anúncios nesta semana: nada foi enviado." };
  }

  const subject = onlyTo ? `[Teste] ${email.subject}` : email.subject;
  let sent = 0;
  const errors: string[] = [];
  for (const to of recipients) {
    const r = await sendOne(sender, to, subject, email.html, email.text);
    if (r.ok) sent++;
    else {
      errors.push(r.message);
      await recordError({ source: "servidor", code: "EMAIL_SEND_FAILED", userMessage: r.message, technical: r.technical, clientId, context: { funcao: "client-report-email" } });
    }
  }
  const status = sent > 0 ? "enviado" : "erro";
  const detail = errors.length ? `${sent} de ${recipients.length} enviados. ${errors[0]}` : `${sent} enviado(s).`;
  await log(db, { ...base, status, recipients: sent, detail: detail.slice(0, 500) });
  if (sent > 0 && !onlyTo) await db.from("client_report_email").update({ last_sent_at: new Date().toISOString() }).eq("client_id", clientId);
  return { status, detail, sent };
}

/** A pessoa enxerga o cliente (confere com o RLS de quem pede). */
async function visibleClient(req: Request, clientId: string) {
  const { data, error } = await userClient(req).from("clients").select("id").eq("id", clientId).maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos verificar o cliente.", error);
  if (!data) throw new AppError(404, "NOT_FOUND", "Cliente não encontrado.");
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  const input = parsed.data;

  if (input.action === "scheduled") {
    const { data: ok } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
    if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");
    const { data: due, error } = await db.rpc("client_report_email_due", { p_limit: MAX_PER_RUN });
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos escolher os clientes.", error);
    const ids = (due as string[] | null) ?? [];
    if (!ids.length) return json(req, 200, { data: { results: [] } });
    const sender = await loadSender(db);
    const results = [];
    for (const id of ids) {
      try {
        results.push({ clientId: id, ...(await sendForClient(db, sender, id, "agendado", null)) });
      } catch (err) {
        const message = err instanceof AppError ? err.userMessage : "Erro inesperado ao montar o e-mail.";
        await recordError({ source: "servidor", code: "EMAIL_CLIENT_FAILED", technical: err, clientId: id, context: { funcao: "client-report-email" } });
        await log(db, { client_id: id, trigger: "agendado", status: "erro", detail: message.slice(0, 500) });
        results.push({ clientId: id, status: "erro", detail: message });
      }
    }
    return json(req, 200, { data: { results } });
  }

  if (input.action === "test_settings") {
    const caller = await requireRole(req, db, ["admin"]);
    await enforceRateLimit(db, "reports.email", caller.id);
    const sender = await loadSender(db);
    const r = await sendOne(sender, caller.email, "Teste de envio · Backstage Flow",
      "<p>Tudo certo! O envio de e-mails do Backstage Flow está funcionando.</p>", "Tudo certo! O envio de e-mails do Backstage Flow está funcionando.");
    await db.from("email_settings").update({
      last_test_at: new Date().toISOString(), last_test_ok: r.ok, last_test_error: r.ok ? null : r.message.slice(0, 500),
    }).eq("id", true);
    if (!r.ok) throw new AppError(400, "EMAIL_SEND_FAILED", r.message, r.technical);
    return json(req, 200, { data: { sentTo: caller.email } });
  }

  const caller = await requireRole(req, db, ["admin", "gestor"]);
  await enforceRateLimit(db, "reports.email", caller.id);
  await visibleClient(req, input.clientId);
  const sender = await loadSender(db);
  const result = await sendForClient(db, sender, input.clientId, input.action === "test" ? "teste" : "manual", caller, input.action === "test" ? caller.email : undefined);
  if (result.status === "erro") throw new AppError(400, "EMAIL_SEND_FAILED", result.detail);
  return json(req, 200, { data: result });
}, "client-report-email"));
