/**
 * Edge Function: monitor-email (Etapa 37.5)
 *
 * Envia pelo Resend os avisos do monitoramento que as pessoas pediram por e-mail.
 * Quem chama é só o agendador do banco (senha interna), a cada 5 minutos e só quando há fila.
 * A chave do Resend fica no cofre (Vault) e só este servidor lê.
 *
 * Ação (POST com JSON): scheduled → lê a fila (monitor_email_queue), envia e anota o resultado
 * (monitor_email_mark: enviado; ou tenta de novo até 3 vezes e fica "falhou" com o motivo).
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { resendResult } from "../client-report-email/logic.ts";
import { buildMonitorEmail } from "./logic.ts";

const RESEND_URL = "https://api.resend.com/emails";
const MAX_PER_RUN = 50;

const schema = z.object({ action: z.literal("scheduled") });

interface Sender { from: string; replyTo: string | null; key: string }
interface QueueRow { id: number; to_email: string; to_name: string | null; subject: string | null; body: string | null; link: string | null }

async function loadSender(db: SupabaseClient): Promise<Sender | string> {
  const { data: s } = await db.from("email_settings").select("from_name, from_email, reply_to, has_key").eq("id", true).maybeSingle();
  if (!s?.has_key) return "O envio de e-mails ainda não foi configurado (falta a chave do Resend em Configurações → Integrações).";
  const { data: key } = await db.rpc("email_api_key_get");
  if (!key) return "A chave do Resend não foi encontrada no cofre.";
  return { from: `${s.from_name} <${s.from_email}>`, replyTo: s.reply_to, key: key as string };
}

async function mark(db: SupabaseClient, id: number, ok: boolean, reason: string | null) {
  const { error } = await db.rpc("monitor_email_mark", { p_id: id, p_ok: ok, p_reason: reason });
  if (error) await recordError({ source: "servidor", code: "MONITOR_EMAIL_MARK_FAILED", technical: error, context: { funcao: "monitor-email" } });
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  const { data: ok } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");

  const { data, error } = await db.rpc("monitor_email_queue", { p_limit: MAX_PER_RUN });
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a fila de e-mails.", error);
  const rows = (data as QueueRow[] | null) ?? [];
  if (!rows.length) return json(req, 200, { data: { sent: 0, failed: 0 } });

  const sender = await loadSender(db);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (typeof sender === "string") {
      await mark(db, row.id, false, sender);
      failed++;
      continue;
    }
    const email = buildMonitorEmail({ toName: row.to_name, subject: row.subject, body: row.body, link: row.link });
    let reason: string | null = null;
    try {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${sender.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender.from, to: [row.to_email], subject: email.subject, html: email.html, text: email.text, ...(sender.replyTo ? { reply_to: sender.replyTo } : {}) }),
      });
      const r = resendResult(res.status, await res.json().catch(() => ({})));
      if (!r.ok) reason = r.message;
    } catch {
      reason = "Não conseguimos falar com o Resend agora.";
    }
    await mark(db, row.id, reason === null, reason);
    if (reason === null) sent++;
    else failed++;
  }
  return json(req, 200, { data: { sent, failed } });
}, "monitor-email"));
