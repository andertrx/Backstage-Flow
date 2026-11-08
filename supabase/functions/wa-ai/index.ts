/**
 * Edge Function: wa-ai (Tracking T5.6b) — uma vez por dia (03h de Brasília) a IA lê as conversas do dia
 * (buffer de 2 dias do WhatsApp) e SUGERE onde pode ter havido venda. Quem confirma é o administrador, à mão.
 *
 *   run → agendador do banco (senha interna). Sem chave ou com a IA desligada, não faz nada.
 *
 * Guarda só a sugestão (cliente, final do número, nome, motivo curto). O texto da conversa nunca vai para log nem para a sugestão.
 */
import { z } from "npm:zod@4";
import { adminClient } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { recordError } from "../_shared/errorlog.ts";
import { askClaude, type BatchConversation, MAX_CONVERSATIONS, parseVerdict, renderConversation } from "./logic.ts";

const schema = z.object({ action: z.literal("run") });

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Pedido inválido.");
  const { data: ok } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");

  const { data: cfg } = await db.from("wa_ai_settings").select("enabled, has_key, model").eq("id", true).maybeSingle();
  if (!cfg?.enabled || !cfg.has_key) return json(req, 200, { data: { analisadas: 0, motivo: "desligada" } });
  const { data: apiKey } = await db.rpc("wa_ai_key_get");
  if (!apiKey) return json(req, 200, { data: { analisadas: 0, motivo: "sem_chave" } });

  const { data: batch, error } = await db.rpc("wa_ai_batch", { p_hours: 24 });
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler as conversas do dia.", error);
  const list = ((batch ?? []) as BatchConversation[]).slice(0, MAX_CONVERSATIONS);

  let analisadas = 0;
  let sugestoes = 0;
  let falha: string | null = null;
  for (const conv of list) {
    const res = await askClaude({ apiKey, model: cfg.model }, renderConversation(conv));
    if (!res.ok) {
      falha = res.auth ? "A chave da Anthropic foi recusada. Cole uma chave nova." : `A Anthropic respondeu com erro ${res.status}.`;
      break; // chave ruim ou serviço fora: não adianta insistir nas outras
    }
    analisadas++;
    const verdict = parseVerdict(res.text);
    if (!verdict) continue;
    const { data: r, error: e2 } = await db.rpc("wa_suggestion_add", {
      p: { connection_id: conv.connection_id, wa_hash: conv.wa_hash, push_name: conv.push_name, phone_tail: conv.phone_tail, reason: verdict.reason, confidence: verdict.confidence },
    });
    if (e2) {
      await recordError({ source: "servidor", code: "WA_AI_SAVE_FAILED", technical: e2, context: { funcao: "wa-ai" } });
      continue;
    }
    if (r === "criada") sugestoes++;
  }
  await db.rpc("wa_ai_report", { p: { ok: !falha, count: sugestoes, error: falha } });
  return json(req, 200, { data: { analisadas, sugestoes, falha } });
}, "wa-ai"));
