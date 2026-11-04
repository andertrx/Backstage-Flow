/**
 * Edge Function: envio-aviso (04/11/2026) — aviso para aprovar o envio semanal, no aparelho (Web Push) e por e-mail.
 *
 *   send → agendador do banco (senha interna), só quando há aviso pendente: lê a fila (ops_envio_aviso_fila),
 *          manda a notificação nos aparelhos da pessoa e o e-mail (Resend) e anota o resultado de cada um.
 *
 * O sino do CRM é gerado direto no banco. Nada da mensagem nem de contatos vai no aviso; nada vai para log.
 * A chave do Resend fica no cofre (Vault) e as chaves do Web Push também; só este servidor lê.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { resendResult, SITE_URL } from "../client-report-email/logic.ts";
import { sendPush, type Subscription } from "../ops-push/webpush.ts";
import { type AvisoEnvio, avisoEmail, avisoPush } from "./logic.ts";

const RESEND_URL = "https://api.resend.com/emails";
const schema = z.object({ action: z.literal("send") });

interface QueueRow extends AvisoEnvio {
  id: number;
  push_pendente: boolean;
  email_pendente: boolean;
  email: string | null;
  subscriptions: Subscription[] | null;
}
interface Sender { from: string; replyTo: string | null; key: string }

async function loadSender(db: SupabaseClient): Promise<Sender | string> {
  const { data: s } = await db.from("email_settings").select("from_name, from_email, reply_to, has_key").eq("id", true).maybeSingle();
  if (!s?.has_key) return "O envio de e-mails ainda não foi configurado (falta a chave do Resend em Configurações → Integrações).";
  const { data: key } = await db.rpc("email_api_key_get");
  if (!key) return "A chave do Resend não foi encontrada no cofre.";
  return { from: `${s.from_name} <${s.from_email}>`, replyTo: s.reply_to, key: key as string };
}

async function mark(db: SupabaseClient, id: number, canal: "push" | "email", status: string, reason: string | null) {
  const { error } = await db.rpc("ops_envio_aviso_mark", { p_id: id, p_canal: canal, p_status: status, p_reason: reason });
  if (error) await recordError({ source: "servidor", code: "ENVIO_AVISO_MARK_FAILED", technical: error, context: { funcao: "envio-aviso" } });
}

async function pushRow(db: SupabaseClient, keys: { publicKey: string; privateJwk: string } | null, row: QueueRow) {
  const subs = row.subscriptions ?? [];
  if (!subs.length) return mark(db, row.id, "push", "sem_aparelho", null);
  if (!keys) return mark(db, row.id, "push", "falhou", "As chaves de notificação ainda não foram criadas.");
  let ok = 0;
  let lastStatus = 0;
  for (const s of subs) {
    const r = await sendPush(s, avisoPush(row), { ...keys, subject: SITE_URL });
    if (r.ok) ok++; else lastStatus = r.status;
    await db.rpc("ops_push_mark", {
      p_id: s.id, p_ok: r.ok, p_gone: r.gone,
      p_error: r.ok ? null : r.gone ? `O navegador cancelou a autorização (${r.status}).` : `Serviço de notificação respondeu ${r.status || "sem conexão"}.`,
    });
  }
  return ok > 0 ? mark(db, row.id, "push", "enviado", null) : mark(db, row.id, "push", "falhou", `Nenhum aparelho recebeu (resposta ${lastStatus || "sem conexão"}).`);
}

async function emailRow(db: SupabaseClient, sender: Sender | string, row: QueueRow) {
  if (!row.email) return mark(db, row.id, "email", "sem_email", null);
  if (typeof sender === "string") return mark(db, row.id, "email", "falhou", sender);
  const email = avisoEmail(row);
  let reason: string | null = null;
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${sender.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender.from, to: [row.email], subject: email.subject, html: email.html, text: email.text, ...(sender.replyTo ? { reply_to: sender.replyTo } : {}) }),
    });
    const r = resendResult(res.status, await res.json().catch(() => ({})));
    if (!r.ok) reason = r.message;
  } catch {
    reason = "Não conseguimos falar com o Resend agora.";
  }
  return mark(db, row.id, "email", reason === null ? "enviado" : "falhou", reason);
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  const { data: ok } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");

  const { data, error } = await db.rpc("ops_envio_aviso_fila");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a fila de avisos.", error);
  const rows = (data as QueueRow[] | null) ?? [];
  if (!rows.length) return json(req, 200, { data: { avisos: 0 } });

  let keys: { publicKey: string; privateJwk: string } | null = null;
  if (rows.some((r) => r.push_pendente && (r.subscriptions ?? []).length)) {
    const { data: k } = await db.rpc("ops_push_keys");
    const g = (k ?? {}) as { public?: string | null; private?: string | null };
    if (g.public && g.private) keys = { publicKey: g.public, privateJwk: g.private };
  }
  const sender = rows.some((r) => r.email_pendente) ? await loadSender(db) : "";

  for (const row of rows) {
    if (row.push_pendente) await pushRow(db, keys, row);
    if (row.email_pendente) await emailRow(db, sender, row);
  }
  return json(req, 200, { data: { avisos: rows.length } });
}, "envio-aviso"));
