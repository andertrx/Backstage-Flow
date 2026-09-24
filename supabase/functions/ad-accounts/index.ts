/**
 * Edge Function: ad-accounts
 *
 * Conexões com plataformas e vínculo de contas de anúncio a clientes.
 * O token da plataforma NUNCA sai do servidor: fica no Supabase Vault e é lido
 * só aqui, na hora de chamar a API oficial.
 *
 * Ações (POST com JSON):
 *   connect         { platform:"meta", label, accessToken }       → admin
 *   disconnect      { connectionId }                               → admin
 *   list_available  { connectionId }                               → admin, gestor
 *   link            { connectionId, externalId, clientId }         → admin, gestor com acesso ao cliente
 *   refresh         { adAccountId }                                → admin, gestor com acesso ao cliente
 *   unlink          { adAccountId }                                → admin, gestor com acesso ao cliente
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, type Caller, requireRole, userClient } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import type { PlatformAdapter } from "../_shared/platforms/adapter.ts";
import { getAdapter } from "../_shared/platforms/registry.ts";
import type { PlatformAccount } from "../_shared/platforms/types.ts";

const MANAGERS = ["admin", "gestor"] as const;

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("connect"),
    platform: z.literal("meta"),
    label: z.string().trim().min(2, "Dê um nome para a conexão.").max(80, "Nome muito longo (máx. 80)."),
    accessToken: z.string().trim().min(20, "Token muito curto. Copie o token completo.").max(4096, "Token muito longo."),
  }),
  z.object({ action: z.literal("disconnect"), connectionId: z.guid("Identificador inválido.") }),
  z.object({ action: z.literal("list_available"), connectionId: z.guid("Identificador inválido.") }),
  z.object({
    action: z.literal("link"),
    connectionId: z.guid("Identificador inválido."),
    externalId: z.string().regex(/^\d{1,32}$/, "Id de conta inválido."),
    clientId: z.guid("Identificador inválido."),
  }),
  z.object({ action: z.literal("refresh"), adAccountId: z.guid("Identificador inválido.") }),
  z.object({ action: z.literal("unlink"), adAccountId: z.guid("Identificador inválido.") }),
]);

type Input = z.infer<typeof schema>;
type Of<A extends Input["action"]> = Extract<Input, { action: A }>;

interface Ctx {
  req: Request;
  db: SupabaseClient;
  caller: Caller;
}

// ------------------------------------------------------------------ utilidades

function adapterFor(platform: string): PlatformAdapter {
  const adapter = getAdapter(platform);
  if (!adapter) throw new AppError(400, "PLATFORM_NOT_SUPPORTED", "Esta plataforma ainda não está disponível.");
  return adapter;
}

function dbError(error: unknown, message = "Não conseguimos salvar no banco de dados."): AppError {
  return new AppError(500, "DB_ERROR", message, error);
}

interface Connection {
  id: string;
  platform_id: string;
  status: string;
}

async function loadConnection(ctx: Ctx, connectionId: string): Promise<{ connection: Connection; token: string }> {
  const { data: connection, error } = await ctx.db
    .from("platform_connections")
    .select("id, platform_id, status")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw dbError(error, "Não conseguimos carregar a conexão.");
  if (!connection) throw new AppError(404, "NOT_FOUND", "Conexão não encontrada.");
  if (connection.status === "revogada") throw new AppError(400, "CONNECTION_REVOKED", "Esta conexão foi desconectada.");

  const { data: token, error: secretError } = await ctx.db.rpc("connection_secret_get", { p_connection_id: connectionId });
  if (secretError) throw dbError(secretError, "Não conseguimos ler a credencial da conexão.");
  if (!token) throw new AppError(400, "CONNECTION_WITHOUT_TOKEN", "Esta conexão está sem credencial. Conecte novamente.");
  return { connection, token: token as string };
}

/** Executa uma chamada à plataforma; se o token falhar, marca a conexão com erro. */
async function callPlatform<T>(ctx: Ctx, connectionId: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    await ctx.db
      .from("platform_connections")
      .update({ status: "ativa", last_checked_at: new Date().toISOString(), last_error: null, updated_by: ctx.caller.id })
      .eq("id", connectionId)
      .neq("status", "revogada");
    return result;
  } catch (err) {
    if (err instanceof AppError && (err.code === "AUTH_EXPIRED" || err.code === "PERMISSION_DENIED")) {
      await ctx.db
        .from("platform_connections")
        .update({ status: "erro", last_checked_at: new Date().toISOString(), last_error: err.userMessage, updated_by: ctx.caller.id })
        .eq("id", connectionId);
    }
    throw err;
  }
}

/** O usuário enxerga (pelo RLS) o cliente? Para gestor, isso = tem acesso a ele. */
async function assertCanManageClient(ctx: Ctx, clientId: string) {
  const { data, error } = await userClient(ctx.req).from("clients").select("id").eq("id", clientId).maybeSingle();
  if (error) throw dbError(error, "Não conseguimos verificar o cliente.");
  if (!data) throw new AppError(404, "NOT_FOUND", "Cliente não encontrado ou sem acesso.");
}

function accountColumns(account: PlatformAccount) {
  return {
    name: account.name,
    currency: account.currency,
    timezone: account.timezone,
    status: account.status,
    raw_status: account.rawStatus,
    status_reason: account.statusReason,
    business_id: account.businessId,
    business_name: account.businessName,
    is_prepay: account.isPrepay,
    details_updated_at: new Date().toISOString(),
  };
}

/** Atualiza páginas/Instagram. Falha aqui não impede o vínculo (vira aviso). */
async function syncAssets(ctx: Ctx, adapter: PlatformAdapter, token: string, adAccountId: string, externalId: string): Promise<string | null> {
  try {
    const assets = await adapter.listAssets(token, externalId);
    const now = new Date().toISOString();
    if (assets.length) {
      const { error } = await ctx.db.from("ad_account_assets").upsert(
        assets.map((a) => ({
          ad_account_id: adAccountId,
          asset_type: a.type,
          external_id: a.externalId,
          name: a.name,
          parent_external_id: a.parentExternalId,
          updated_at: now,
        })),
        { onConflict: "ad_account_id,asset_type,external_id" },
      );
      if (error) throw dbError(error);
    }
    // Remove o que a plataforma não informa mais (retrato atual da conta).
    const { error: cleanupError } = await ctx.db.from("ad_account_assets").delete().eq("ad_account_id", adAccountId).lt("updated_at", now);
    if (cleanupError) throw dbError(cleanupError);
    return null;
  } catch (err) {
    console.error(JSON.stringify({ code: "ASSETS_FAILED", adAccountId, technical: err instanceof AppError ? err.code : String(err) }));
    return "A conta foi salva, mas não conseguimos ler as páginas e perfis do Instagram agora.";
  }
}

interface AdAccountRow {
  id: string;
  platform_id: string;
  external_id: string;
  client_id: string;
  connection_id: string | null;
  unlinked_at: string | null;
}

/** Carrega a conta pelo cliente do usuário (RLS) e confere que ainda está vinculada. */
async function loadAccountForManager(ctx: Ctx, adAccountId: string): Promise<AdAccountRow> {
  const { data, error } = await userClient(ctx.req)
    .from("ad_accounts")
    .select("id, platform_id, external_id, client_id, connection_id, unlinked_at")
    .eq("id", adAccountId)
    .maybeSingle();
  if (error) throw dbError(error, "Não conseguimos carregar a conta.");
  if (!data) throw new AppError(404, "NOT_FOUND", "Conta não encontrada ou sem acesso.");
  if (data.unlinked_at) throw new AppError(400, "ALREADY_UNLINKED", "Esta conta já foi desvinculada.");
  return data as AdAccountRow;
}

// ------------------------------------------------------------------ ações

async function connect(ctx: Ctx, input: Of<"connect">) {
  const adapter = adapterFor(input.platform);
  const owner = await adapter.validateCredentials(input.accessToken);
  const now = new Date().toISOString();

  // Mesmo usuário do sistema já conectado? Renova o token em vez de duplicar.
  const { data: existing, error: findError } = await ctx.db
    .from("platform_connections")
    .select("id")
    .eq("platform_id", input.platform)
    .eq("external_user_id", owner.externalUserId)
    .neq("status", "revogada")
    .maybeSingle();
  if (findError) throw dbError(findError);

  let connectionId = existing?.id as string | undefined;
  const fields = {
    label: input.label,
    status: "ativa",
    external_user_name: owner.name,
    last_checked_at: now,
    last_error: null,
    updated_by: ctx.caller.id,
  };
  if (connectionId) {
    const { error } = await ctx.db.from("platform_connections").update(fields).eq("id", connectionId);
    if (error) throw dbError(error);
  } else {
    const { data, error } = await ctx.db
      .from("platform_connections")
      .insert({ ...fields, platform_id: input.platform, external_user_id: owner.externalUserId, created_by: ctx.caller.id })
      .select("id")
      .single();
    if (error) throw dbError(error);
    connectionId = data.id as string;
  }

  const { error: secretError } = await ctx.db.rpc("connection_secret_set", { p_connection_id: connectionId, p_secret: input.accessToken });
  if (secretError) {
    await ctx.db.from("platform_connections").update({ status: "erro", last_error: "Falha ao guardar o token no cofre." }).eq("id", connectionId);
    throw dbError(secretError, "Não conseguimos guardar o token com segurança.");
  }

  return { connectionId, ownerName: owner.name, renewed: Boolean(existing) };
}

async function disconnect(ctx: Ctx, input: Of<"disconnect">) {
  const { error } = await ctx.db
    .from("platform_connections")
    .update({ status: "revogada", updated_by: ctx.caller.id })
    .eq("id", input.connectionId);
  if (error) throw dbError(error);
  const { error: secretError } = await ctx.db.rpc("connection_secret_delete", { p_connection_id: input.connectionId });
  if (secretError) throw dbError(secretError, "A conexão foi desativada, mas o token não foi apagado do cofre.");
  return { connectionId: input.connectionId };
}

async function listAvailable(ctx: Ctx, input: Of<"list_available">) {
  const { connection, token } = await loadConnection(ctx, input.connectionId);
  const adapter = adapterFor(connection.platform_id);
  const accounts = await callPlatform(ctx, connection.id, () => adapter.listAccounts(token));

  const { data: linked, error } = await ctx.db
    .from("ad_accounts")
    .select("external_id, client_id")
    .eq("platform_id", connection.platform_id)
    .is("unlinked_at", null)
    .in("external_id", accounts.map((a) => a.externalId));
  if (error) throw dbError(error);
  const linkedTo = new Map(linked?.map((l) => [l.external_id as string, l.client_id as string]));

  return {
    accounts: accounts.map((a) => ({
      externalId: a.externalId,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone,
      status: a.status,
      businessName: a.businessName,
      linkedClientId: linkedTo.get(a.externalId) ?? null,
    })),
  };
}

async function link(ctx: Ctx, input: Of<"link">) {
  await assertCanManageClient(ctx, input.clientId);
  const { connection, token } = await loadConnection(ctx, input.connectionId);
  const adapter = adapterFor(connection.platform_id);
  const account = await callPlatform(ctx, connection.id, () => adapter.getAccount(token, input.externalId));

  const { data: row, error } = await ctx.db
    .from("ad_accounts")
    .insert({
      ...accountColumns(account),
      platform_id: connection.platform_id,
      external_id: account.externalId,
      client_id: input.clientId,
      connection_id: connection.id,
      updated_by: ctx.caller.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new AppError(409, "ALREADY_LINKED", "Esta conta já está vinculada a um cliente. Desvincule antes de vincular a outro.", error);
    throw dbError(error);
  }

  const { error: stateError } = await ctx.db.from("sync_state").insert({ ad_account_id: row.id, status: "pendente" });
  if (stateError) throw dbError(stateError);

  const warning = await syncAssets(ctx, adapter, token, row.id, account.externalId);
  return { adAccountId: row.id, warning };
}

async function refresh(ctx: Ctx, input: Of<"refresh">) {
  const account = await loadAccountForManager(ctx, input.adAccountId);
  if (!account.connection_id) throw new AppError(400, "NO_CONNECTION", "Esta conta não tem conexão ativa. Vincule novamente.");
  const { connection, token } = await loadConnection(ctx, account.connection_id);
  const adapter = adapterFor(connection.platform_id);
  const fresh = await callPlatform(ctx, connection.id, () => adapter.getAccount(token, account.external_id));

  const { error } = await ctx.db
    .from("ad_accounts")
    .update({ ...accountColumns(fresh), updated_by: ctx.caller.id })
    .eq("id", account.id);
  if (error) throw dbError(error);

  const warning = await syncAssets(ctx, adapter, token, account.id, account.external_id);
  return { adAccountId: account.id, warning };
}

async function unlink(ctx: Ctx, input: Of<"unlink">) {
  const account = await loadAccountForManager(ctx, input.adAccountId);
  const { error } = await ctx.db
    .from("ad_accounts")
    .update({ unlinked_at: new Date().toISOString(), updated_by: ctx.caller.id })
    .eq("id", account.id);
  if (error) throw dbError(error);
  return { adAccountId: account.id };
}

// ------------------------------------------------------------------ entrada

Deno.serve(
  handle(async (req) => {
    const db = adminClient();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      // Confere o login antes de devolver detalhes de validação.
      await requireRole(req, db, MANAGERS);
      throw new AppError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.message);
    }
    const input = parsed.data;
    const adminOnly = input.action === "connect" || input.action === "disconnect";
    const caller = await requireRole(req, db, adminOnly ? ["admin"] : MANAGERS);
    const ctx: Ctx = { req, db, caller };

    const result = await (() => {
      switch (input.action) {
        case "connect": return connect(ctx, input);
        case "disconnect": return disconnect(ctx, input);
        case "list_available": return listAvailable(ctx, input);
        case "link": return link(ctx, input);
        case "refresh": return refresh(ctx, input);
        case "unlink": return unlink(ctx, input);
      }
    })();
    return json(req, 200, { data: result });
  }),
);
