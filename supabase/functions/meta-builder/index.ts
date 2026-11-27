/**
 * Edge Function: meta-builder (Campaign Builder, Fase A) — LEITURAS da conta do Meta e VALIDAÇÃO. Não cria nada no Meta.
 *
 *   account_lists { adAccountId } → pixels, públicos personalizados e públicos salvos da conta (só id e nome)
 *   validate      { draftId }     → pergunta ao Meta se a CAMPANHA do rascunho seria aceita (validate_only: sem criar)
 *
 * Quem pode: administrador, gestor e operador com acesso ao cliente. A permissão do módulo e o acesso à conta são conferidos
 * NO BANCO com o login da pessoa (userClient): o token do Meta nunca sai do servidor e nunca vai para log.
 */
import { z } from "npm:zod@4";
import { adminClient, requireRole, userClient } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { buildCampaignFields, fetchAccountLists, validateCampaign } from "../_shared/platforms/meta/builder.ts";
import { normalizeDraft } from "../../../packages/shared/src/campaign-builder/model.ts";

const id = z.guid("Identificador inválido.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("account_lists"), adAccountId: id }),
  z.object({ action: z.literal("validate"), draftId: id }),
]);

interface AccountRow {
  id: string;
  external_id: string;
  currency: string;
  platform_id: string;
  connection_id: string | null;
}

async function loadAccount(req: Request, adAccountId: string): Promise<AccountRow> {
  // Pelo RLS: só enxerga a conta quem tem acesso ao cliente dela.
  const { data, error } = await userClient(req).from("ad_accounts")
    .select("id, external_id, currency, platform_id, connection_id").eq("id", adAccountId).is("unlinked_at", null).maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos carregar a conta.", error);
  if (!data) throw new AppError(404, "NOT_FOUND", "Conta não encontrada ou sem acesso.");
  const a = data as AccountRow;
  if (a.platform_id !== "meta") throw new AppError(400, "PLATFORM_NOT_SUPPORTED", "O Criador vale só para contas do Meta.");
  if (!a.connection_id) throw new AppError(400, "NO_CONNECTION", "Esta conta não tem conexão ativa. Vincule novamente.");
  return a;
}

async function tokenFor(connectionId: string): Promise<string> {
  const db = adminClient();
  const { data: conn } = await db.from("platform_connections").select("status").eq("id", connectionId).maybeSingle();
  if (!conn || conn.status === "revogada") throw new AppError(400, "CONNECTION_REVOKED", "A conexão do Meta foi desconectada.");
  const { data: token, error } = await db.rpc("connection_secret_get", { p_connection_id: connectionId });
  if (error || !token) throw new AppError(400, "CONNECTION_WITHOUT_TOKEN", "A conexão do Meta está sem credencial. Conecte novamente.", error);
  return token as string;
}

async function myPermissions(req: Request): Promise<{ ver: boolean; editar: boolean }> {
  const { data, error } = await userClient(req).rpc("builder_my_permissions");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos conferir a sua permissão.", error);
  const p = (data ?? {}) as { ver?: boolean; editar?: boolean };
  return { ver: p.ver === true, editar: p.editar === true };
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  const caller = await requireRole(req, db, ["admin", "gestor", "operador"]);
  if (!parsed.success) throw new AppError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Pedido inválido.");
  await enforceRateLimit(db, "builder.meta", caller.id);
  const input = parsed.data;
  const perms = await myPermissions(req);
  if (!perms.ver) throw new AppError(403, "FORBIDDEN", "Você não tem permissão para usar o Criar Campanhas.");

  if (input.action === "account_lists") {
    const account = await loadAccount(req, input.adAccountId);
    const lists = await fetchAccountLists(await tokenFor(account.connection_id!), account.external_id);
    return json(req, 200, { data: lists });
  }

  // validate
  if (!perms.editar) throw new AppError(403, "FORBIDDEN", "Você não tem permissão para validar rascunhos.");
  const { data: draftRow, error } = await userClient(req).rpc("builder_draft_get", { p_id: input.draftId });
  if (error || !draftRow) throw new AppError(404, "NOT_FOUND", "Rascunho não encontrado ou sem acesso.", error);
  const row = draftRow as { ad_account_id: string | null; data: unknown };
  if (!row.ad_account_id) throw new AppError(400, "INVALID_STATE", "Escolha a conta de anúncio do rascunho antes de validar.");
  const draft = normalizeDraft(row.data);
  const c = draft.campaign;
  if (!c.name.trim() || !c.objective) throw new AppError(400, "INVALID_STATE", "Preencha o nome e o objetivo da campanha antes de validar.");
  const account = await loadAccount(req, row.ad_account_id);
  const fields = buildCampaignFields(c, account.currency, "PAUSED");
  const result = await validateCampaign(await tokenFor(account.connection_id!), account.external_id, fields);
  return json(req, 200, { data: { ...result, scope: "campaign" as const } });
}, "meta-builder"));
