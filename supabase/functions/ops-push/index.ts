/**
 * Edge Function: ops-push (Central 36.17) — lembrete de tarefa vencida no computador e no celular (Web Push).
 *
 *   public_key → chave pública VAPID para o navegador se inscrever (pessoa logada; gera as chaves na 1ª vez,
 *                a privada vai direto para o cofre e nunca sai do servidor)
 *   test       → manda uma notificação de teste para os aparelhos da própria pessoa
 *   send       → agendador (8h, 12h e 17h de Brasília, senha interna): avisa cada responsável com tarefa vencida
 *                que ainda não clicou "Vi" naquele horário
 *
 * O conteúdo da notificação só tem número e título da tarefa; nada vai para log.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { adminClient, requireRole } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { SITE_URL } from "../client-report-email/logic.ts";
import { generateVapidKeys, reminderPayload, sendPush, type Subscription } from "./webpush.ts";

const schema = z.object({ action: z.enum(["public_key", "test", "send"]) });
const TEAM = ["admin", "gestor", "operador", "visualizador", "equipe"] as const;
const SUBJECT = SITE_URL;

async function vapidKeys(db: SupabaseClient): Promise<{ publicKey: string; privateJwk: string }> {
  const { data, error } = await db.rpc("ops_push_keys");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler as chaves de notificação.", error);
  const k = (data ?? {}) as { public?: string | null; private?: string | null };
  if (k.public && k.private) return { publicKey: k.public, privateJwk: k.private };
  const fresh = await generateVapidKeys();
  const { error: setErr } = await db.rpc("ops_push_keys_set", { p_public: fresh.publicKey, p_private_jwk: fresh.privateJwk });
  if (setErr) throw new AppError(500, "DB_ERROR", "Não conseguimos criar as chaves de notificação.", setErr);
  // Outra chamada pode ter criado ao mesmo tempo: vale a que ficou guardada.
  const { data: again } = await db.rpc("ops_push_keys");
  const g = (again ?? {}) as { public?: string; private?: string };
  return { publicKey: g.public ?? fresh.publicKey, privateJwk: g.private ?? fresh.privateJwk };
}

async function deliver(db: SupabaseClient, keys: { publicKey: string; privateJwk: string }, subs: Subscription[], payload: Record<string, unknown>) {
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    const r = await sendPush(s, payload, { ...keys, subject: SUBJECT });
    if (r.ok) sent++; else failed++;
    await db.rpc("ops_push_mark", {
      p_id: s.id, p_ok: r.ok, p_gone: r.gone,
      p_error: r.ok ? null : r.gone ? `O navegador cancelou a autorização (${r.status}).` : `Serviço de notificação respondeu ${r.status || "sem conexão"}.`,
    });
  }
  return { sent, failed };
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");

  if (parsed.data.action === "send") {
    const { data: ok } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
    if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");
    const { data, error } = await db.rpc("ops_push_targets");
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler os lembretes.", error);
    const targets = (data ?? []) as { tasks: { id: string; number: number; title: string; days_late: number }[]; subscriptions: Subscription[] }[];
    if (!targets.length) return json(req, 200, { data: { people: 0, sent: 0, failed: 0 } });
    const keys = await vapidKeys(db);
    let sent = 0;
    let failed = 0;
    for (const t of targets) {
      const r = await deliver(db, keys, t.subscriptions ?? [], reminderPayload(t.tasks, SITE_URL));
      sent += r.sent;
      failed += r.failed;
    }
    return json(req, 200, { data: { people: targets.length, sent, failed } });
  }

  const caller = await requireRole(req, db, TEAM);
  const keys = await vapidKeys(db);
  if (parsed.data.action === "public_key") return json(req, 200, { data: { publicKey: keys.publicKey } });

  const { data: subs, error } = await db.from("ops_push_subscriptions").select("id, endpoint, p256dh, auth")
    .eq("user_id", caller.id).is("disabled_at", null);
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler os seus aparelhos.", error);
  if (!subs?.length) throw new AppError(400, "INVALID_STATE", "Nenhum aparelho ativado. Clique em \"Ativar neste aparelho\" primeiro.");
  const r = await deliver(db, keys, subs as Subscription[], {
    title: "Teste do Backstage Flow", body: "As notificações de tarefas vencidas vão chegar assim.", url: `${SITE_URL}/operacoes/tarefas`, tag: "ops-teste",
  });
  return json(req, 200, { data: r });
}, "ops-push"));
