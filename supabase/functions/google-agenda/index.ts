/**
 * Edge Function: google-agenda (Etapa 46.1) — cada pessoa conecta o PRÓPRIO Google Agenda.
 *
 *   status     → { configured, conexao }  (a conexão é só da pessoa que chama)
 *   start      → { url }  link de autorização do Google (estado de uso único, 10 min)
 *   complete   → troca o código pela chave de acesso (vai direto para o cofre) e anota a conta Google
 *   disconnect → desfaz no Google (revogação), apaga a chave do cofre e marca "desconectada"
 *
 * A chave de acesso nunca vai para o navegador, para log ou para o chat. Usa o mesmo cliente OAuth do Google Ads
 * (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET), com outro escopo e outro endereço de retorno.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { adminClient, requireRole } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { exchangeCode, fetchUserInfo } from "../_shared/platforms/google/oauth.ts";
import { buildAuthorizeUrl, hasCalendarScope, newState, REVOKE_URL, validRedirectUri } from "./logic.ts";

// Quem usa a Central de Operações (as reuniões); cliente e vendedor não.
const ROLES = ["admin", "gestor", "operador", "visualizador", "equipe"] as const;
const redirectUri = z.string().max(500).refine(validRedirectUri, "Endereço de retorno inválido.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("start"), redirectUri }),
  z.object({ action: z.literal("complete"), code: z.string().min(10).max(2048), state: z.string().regex(/^[0-9a-f]{64}$/, "Autorização inválida ou expirada. Tente conectar de novo."), redirectUri }),
  z.object({ action: z.literal("disconnect") }),
]);

const clientId = () => Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
const configured = () => Boolean(clientId() && Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET"));
const dbError = (e: unknown, m = "Não conseguimos salvar no banco de dados.") => new AppError(500, "DB_ERROR", m, e);

async function mine(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("google_agenda_conexoes").select("google_email, status, connected_at, last_sync_at, last_error").eq("user_id", userId).maybeSingle();
  if (error) throw dbError(error, "Não conseguimos ler a sua conexão.");
  return data;
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await requireRole(req, db, ROLES);
    throw new AppError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Pedido inválido.");
  }
  const caller = await requireRole(req, db, ROLES);
  await enforceRateLimit(db, "google.agenda", caller.id);
  const input = parsed.data;

  if (input.action === "status") return json(req, 200, { data: { configured: configured(), conexao: await mine(db, caller.id) } });

  if (input.action === "start") {
    if (!configured()) throw new AppError(400, "INVALID_STATE", "O login do Google ainda não foi configurado no servidor (falta o cliente OAuth). Fale com o administrador.");
    const state = newState();
    await db.from("oauth_states").delete().eq("user_id", caller.id).lt("expires_at", new Date().toISOString());
    const { error } = await db.from("oauth_states").insert({ state, provider: "google", user_id: caller.id, redirect_uri: input.redirectUri });
    if (error) throw dbError(error, "Não conseguimos iniciar a conexão com o Google.");
    return json(req, 200, { data: { url: buildAuthorizeUrl(clientId(), state, input.redirectUri, caller.email) } });
  }

  if (input.action === "complete") {
    if (!configured()) throw new AppError(400, "INVALID_STATE", "O login do Google ainda não foi configurado no servidor.");
    const { data: saved, error } = await db.from("oauth_states").delete().eq("state", input.state).eq("user_id", caller.id).eq("provider", "google")
      .select("redirect_uri, expires_at").maybeSingle();
    if (error) throw dbError(error);
    if (!saved || new Date(saved.expires_at) < new Date() || saved.redirect_uri !== input.redirectUri) {
      throw new AppError(400, "INVALID_STATE", "Autorização inválida ou expirada. Tente conectar de novo.");
    }
    const tokens = await exchangeCode(input.code, input.redirectUri);
    if (!hasCalendarScope(tokens.scope)) {
      throw new AppError(400, "INVALID_STATE", "A permissão para ver e editar eventos não foi concedida. Conecte de novo e deixe essa caixa marcada.");
    }
    if (!tokens.refresh_token) {
      throw new AppError(400, "NO_REFRESH_TOKEN", "O Google não enviou a autorização permanente. Remova o acesso do app em myaccount.google.com/permissions e conecte novamente.");
    }
    const info = await fetchUserInfo(tokens.access_token);
    const { error: upError } = await db.from("google_agenda_conexoes").upsert({
      user_id: caller.id, google_email: info.email ?? null, google_sub: info.sub, status: "conectada", scopes: tokens.scope ?? null,
      connected_at: new Date().toISOString(), last_error: null, sync_token: null, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (upError) throw dbError(upError, "Não conseguimos guardar a conexão.");
    const { error: secretError } = await db.rpc("gcal_secret_set", { p_user: caller.id, p_secret: tokens.refresh_token });
    if (secretError) throw dbError(secretError, "Não conseguimos guardar a chave de acesso no cofre.");
    return json(req, 200, { data: { conexao: await mine(db, caller.id) } });
  }

  // disconnect
  const { data: token } = await db.rpc("gcal_secret_get", { p_user: caller.id });
  if (token) { // desfaz no Google também (se falhar, a chave é apagada do mesmo jeito)
    try { await fetch(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: String(token) }) }); } catch { /* segue */ }
  }
  const { error: delError } = await db.rpc("gcal_secret_delete", { p_user: caller.id });
  if (delError) throw dbError(delError, "A conexão foi desativada, mas a chave não foi apagada do cofre.");
  const { error } = await db.from("google_agenda_conexoes").update({ status: "desconectada", last_error: null, sync_token: null, updated_at: new Date().toISOString() }).eq("user_id", caller.id);
  if (error) throw dbError(error);
  return json(req, 200, { data: { conexao: await mine(db, caller.id) } });
}, "google-agenda"));
