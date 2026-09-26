/**
 * Edge Function: ad-accounts
 *
 * Conexões com plataformas e vínculo de contas de anúncio a clientes.
 * O token da plataforma NUNCA sai do servidor: fica no Supabase Vault e é lido
 * só aqui, na hora de chamar a API oficial.
 *
 * Ações (POST com JSON):
 *   connect         { platform:"meta", label, accessToken }       → admin
 *   google_status   {}                                             → admin (segredos configurados?)
 *   google_start    { redirectUri }                                → admin (inicia o login com o Google)
 *   google_complete { code, state, redirectUri, label }            → admin (conclui o login com o Google)
 *   disconnect      { connectionId }                               → admin
 *   list_available  { connectionId }                               → admin, gestor
 *   link            { connectionId, externalId, clientId, managerCustomerId? } → admin, gestor com acesso ao cliente
 *   refresh         { adAccountId }                                → admin, gestor com acesso ao cliente
 *   unlink          { adAccountId }                                → admin, gestor com acesso ao cliente
 *   refresh_balance { adAccountIds[] }                             → admin, gestor com acesso ao cliente (saldo e cobrança;
 *                                                                    fotografia de menos de 10 min é reaproveitada — cache)
 *   balance_settings { adAccountId, lowBalanceDays, lowBalanceAmount } → admin, gestor com acesso ao cliente
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, type Caller, requireRole, userClient } from "../_shared/auth.ts";
import { EXPECTED_CODES, recordError } from "../_shared/errorlog.ts";
import { enforceRateLimit, type RateBucket } from "../_shared/ratelimit.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import type { PlatformAdapter } from "../_shared/platforms/adapter.ts";
import { getAdapter } from "../_shared/platforms/registry.ts";
import { missingConfig as googleMissingConfig } from "../_shared/platforms/google/config.ts";
import { buildAuthorizeUrl, exchangeCode, fetchUserInfo } from "../_shared/platforms/google/oauth.ts";
import type { AccountFunding, CredentialOwner, PlatformAccount } from "../_shared/platforms/types.ts";
import { FRESH_MINUTES } from "../../../packages/shared/src/sync/freshness.ts";

const MANAGERS = ["admin", "gestor"] as const;
const ADMIN_ONLY = new Set(["connect", "disconnect", "google_status", "google_start", "google_complete"]);
const GOOGLE_CALLBACK_PATH = "/configuracoes/integracoes/google/callback";

/** O endereço de retorno do Google precisa ser a página de callback do site (https, ou localhost em testes). */
const redirectUri = z
  .string()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      const secure = url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost");
      return secure && url.pathname === GOOGLE_CALLBACK_PATH && !url.search && !url.hash;
    } catch {
      return false;
    }
  }, "Endereço de retorno inválido.");
const label = z.string().trim().min(2, "Dê um nome para a conexão.").max(80, "Nome muito longo (máx. 80).");

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("connect"),
    platform: z.literal("meta"),
    label,
    accessToken: z.string().trim().min(20, "Token muito curto. Copie o token completo.").max(4096, "Token muito longo."),
  }),
  z.object({ action: z.literal("google_status") }),
  z.object({ action: z.literal("google_start"), redirectUri }),
  z.object({
    action: z.literal("google_complete"),
    code: z.string().min(10, "Código de autorização inválido.").max(2048),
    state: z.string().regex(/^[0-9a-f]{64}$/, "Autorização inválida ou expirada. Tente conectar de novo."),
    redirectUri,
    label,
  }),
  z.object({ action: z.literal("disconnect"), connectionId: z.guid("Identificador inválido.") }),
  z.object({ action: z.literal("list_available"), connectionId: z.guid("Identificador inválido.") }),
  z.object({
    action: z.literal("link"),
    connectionId: z.guid("Identificador inválido."),
    externalId: z.string().regex(/^\d{1,32}$/, "Id de conta inválido."),
    clientId: z.guid("Identificador inválido."),
    managerCustomerId: z.string().regex(/^\d{1,20}$/, "Id da conta administradora inválido.").nullish(),
  }),
  z.object({ action: z.literal("refresh"), adAccountId: z.guid("Identificador inválido.") }),
  z.object({ action: z.literal("unlink"), adAccountId: z.guid("Identificador inválido.") }),
  z.object({
    action: z.literal("refresh_balance"),
    adAccountIds: z.array(z.guid("Identificador inválido.")).min(1, "Escolha ao menos uma conta.").max(50, "Máximo de 50 contas por vez."),
  }),
  z.object({
    action: z.literal("balance_settings"),
    adAccountId: z.guid("Identificador inválido."),
    lowBalanceDays: z.number().int("Use um número inteiro de dias.").min(1, "Mínimo de 1 dia.").max(60, "Máximo de 60 dias."),
    lowBalanceAmount: z.number().min(0, "O valor não pode ser negativo.").max(1_000_000_000, "Valor alto demais.").nullable(),
  }),
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
    manager_customer_id: account.managerId ?? null,
    is_test_account: account.isTestAccount ?? null,
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
    const warning = "A conta foi salva, mas não conseguimos ler as páginas e perfis do Instagram agora.";
    await recordError({ source: "servidor", code: "ASSETS_FAILED", userMessage: warning, technical: err, context: { funcao: "ad-accounts", acao: "paginas_instagram" }, userId: ctx.caller.id, adAccountId });
    return warning;
  }
}

interface AdAccountRow {
  id: string;
  platform_id: string;
  external_id: string;
  client_id: string;
  connection_id: string | null;
  manager_customer_id: string | null;
  unlinked_at: string | null;
}

/** Carrega a conta pelo cliente do usuário (RLS) e confere que ainda está vinculada. */
async function loadAccountForManager(ctx: Ctx, adAccountId: string): Promise<AdAccountRow> {
  const { data, error } = await userClient(ctx.req)
    .from("ad_accounts")
    .select("id, platform_id, external_id, client_id, connection_id, manager_customer_id, unlinked_at")
    .eq("id", adAccountId)
    .maybeSingle();
  if (error) throw dbError(error, "Não conseguimos carregar a conta.");
  if (!data) throw new AppError(404, "NOT_FOUND", "Conta não encontrada ou sem acesso.");
  if (data.unlinked_at) throw new AppError(400, "ALREADY_UNLINKED", "Esta conta já foi desvinculada.");
  return data as AdAccountRow;
}

// ------------------------------------------------------------------ ações

/**
 * Grava (ou renova) a conexão e guarda o segredo no cofre. Se o mesmo usuário
 * da plataforma já estiver conectado, renova em vez de duplicar.
 */
async function saveConnection(ctx: Ctx, platform: string, connectionLabel: string, owner: CredentialOwner, secret: string) {
  const now = new Date().toISOString();
  const { data: existing, error: findError } = await ctx.db
    .from("platform_connections")
    .select("id")
    .eq("platform_id", platform)
    .eq("external_user_id", owner.externalUserId)
    .neq("status", "revogada")
    .maybeSingle();
  if (findError) throw dbError(findError);

  let connectionId = existing?.id as string | undefined;
  const fields = {
    label: connectionLabel,
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
      .insert({ ...fields, platform_id: platform, external_user_id: owner.externalUserId, created_by: ctx.caller.id })
      .select("id")
      .single();
    if (error) throw dbError(error);
    connectionId = data.id as string;
  }

  const { error: secretError } = await ctx.db.rpc("connection_secret_set", { p_connection_id: connectionId, p_secret: secret });
  if (secretError) {
    await ctx.db.from("platform_connections").update({ status: "erro", last_error: "Falha ao guardar o token no cofre." }).eq("id", connectionId);
    throw dbError(secretError, "Não conseguimos guardar o token com segurança.");
  }

  return { connectionId, ownerName: owner.name, renewed: Boolean(existing) };
}

async function connect(ctx: Ctx, input: Of<"connect">) {
  const owner = await adapterFor(input.platform).validateCredentials(input.accessToken);
  return saveConnection(ctx, input.platform, input.label, owner, input.accessToken);
}

function requireGoogleConfig() {
  const missing = googleMissingConfig();
  if (missing.length) {
    throw new AppError(400, "CONFIG_MISSING", `Faltam configurar no servidor: ${missing.join(", ")}.`);
  }
}

function googleStatus() {
  return { missing: googleMissingConfig(), callbackPath: GOOGLE_CALLBACK_PATH };
}

/** Passo 1 do login com o Google: cria um "estado" único e devolve o link de autorização. */
async function googleStart(ctx: Ctx, input: Of<"google_start">) {
  requireGoogleConfig();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // Limpa estados vencidos deste usuário e grava o novo.
  await ctx.db.from("oauth_states").delete().eq("user_id", ctx.caller.id).lt("expires_at", new Date().toISOString());
  const { error } = await ctx.db
    .from("oauth_states")
    .insert({ state, provider: "google", user_id: ctx.caller.id, redirect_uri: input.redirectUri });
  if (error) throw dbError(error, "Não conseguimos iniciar a conexão com o Google.");

  return { url: buildAuthorizeUrl(state, input.redirectUri) };
}

/** Passo 2: o Google devolveu um código; trocamos por um refresh token e guardamos no cofre. */
async function googleComplete(ctx: Ctx, input: Of<"google_complete">) {
  requireGoogleConfig();
  // O estado só vale uma vez, só para quem iniciou e só por 10 minutos.
  const { data: saved, error } = await ctx.db
    .from("oauth_states")
    .delete()
    .eq("state", input.state)
    .eq("user_id", ctx.caller.id)
    .eq("provider", "google")
    .select("redirect_uri, expires_at")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!saved || new Date(saved.expires_at) < new Date() || saved.redirect_uri !== input.redirectUri) {
    throw new AppError(400, "INVALID_STATE", "Autorização inválida ou expirada. Tente conectar de novo.");
  }

  const tokens = await exchangeCode(input.code, input.redirectUri);
  if (!tokens.refresh_token) {
    throw new AppError(
      400,
      "NO_REFRESH_TOKEN",
      "O Google não enviou a autorização permanente. Remova o acesso do app em myaccount.google.com/permissions e conecte novamente.",
    );
  }
  const info = await fetchUserInfo(tokens.access_token);
  return saveConnection(ctx, "google", input.label, { externalUserId: info.sub, name: info.email ?? null }, tokens.refresh_token);
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
      managerId: a.managerId ?? null,
      isTestAccount: a.isTestAccount ?? null,
      linkedClientId: linkedTo.get(a.externalId) ?? null,
    })),
  };
}

async function link(ctx: Ctx, input: Of<"link">) {
  await assertCanManageClient(ctx, input.clientId);
  const { connection, token } = await loadConnection(ctx, input.connectionId);
  const adapter = adapterFor(connection.platform_id);
  const account = await callPlatform(ctx, connection.id, () =>
    adapter.getAccount(token, input.externalId, { managerId: input.managerCustomerId ?? null })
  );

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
  const fresh = await callPlatform(ctx, connection.id, () =>
    adapter.getAccount(token, account.external_id, { managerId: account.manager_customer_id })
  );

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

/**
 * Busca saldo, limites e problemas de cobrança na API oficial e guarda uma
 * fotografia (account_snapshots). Uma conta com erro não impede as outras.
 */
async function refreshBalance(ctx: Ctx, input: Of<"refresh_balance">) {
  const tokens = new Map<string, Promise<{ connection: Connection; token: string }>>();
  const results: { adAccountId: string; ok: boolean; cached?: boolean; error?: string }[] = [];

  // Cache: fotografia de saldo de menos de 10 minutos já responde (sem chamar a API).
  const cutoff = new Date(Date.now() - FRESH_MINUTES * 60_000).toISOString();
  const { data: recentSnaps, error: recentError } = await ctx.db
    .from("account_snapshots").select("ad_account_id").in("ad_account_id", input.adAccountIds).gte("captured_at", cutoff);
  if (recentError) throw dbError(recentError);
  const recent = new Set((recentSnaps ?? []).map((r) => r.ad_account_id as string));

  for (const adAccountId of new Set(input.adAccountIds)) {
    let clientId: string | null = null;
    try {
      const account = await loadAccountForManager(ctx, adAccountId);
      clientId = account.client_id;
      if (recent.has(account.id)) {
        results.push({ adAccountId, ok: true, cached: true });
        continue;
      }
      if (!account.connection_id) throw new AppError(400, "NO_CONNECTION", "Esta conta não tem conexão ativa. Vincule novamente.");
      if (!tokens.has(account.connection_id)) tokens.set(account.connection_id, loadConnection(ctx, account.connection_id));
      const { connection, token } = await tokens.get(account.connection_id)!;
      const adapter = adapterFor(connection.platform_id);
      const { account: fresh, funding } = await callPlatform(ctx, connection.id, () =>
        adapter.getFunding(token, account.external_id, { managerId: account.manager_customer_id })
      );

      const { error } = await ctx.db.from("ad_accounts").update({ ...accountColumns(fresh), updated_by: ctx.caller.id }).eq("id", account.id);
      if (error) throw dbError(error);
      const { error: snapError } = await ctx.db.from("account_snapshots").insert(snapshotRow(account, fresh, funding));
      if (snapError) throw dbError(snapError, "Não conseguimos guardar a fotografia do saldo.");
      results.push({ adAccountId, ok: true });
    } catch (err) {
      const message = err instanceof AppError ? err.userMessage : "Erro inesperado ao consultar o saldo.";
      // Conta inexistente/sem acesso não é erro técnico; o resto vai para o log do administrador.
      if (!(err instanceof AppError && EXPECTED_CODES.has(err.code))) {
        await recordError({
          source: "servidor", code: err instanceof AppError ? err.code : "BALANCE_REFRESH_FAILED", userMessage: "Não conseguimos atualizar o saldo desta conta. " + message,
          technical: err, context: { funcao: "ad-accounts", acao: "atualizar_saldo" }, userId: ctx.caller.id, adAccountId: clientId ? adAccountId : null, clientId,
        });
      }
      results.push({ adAccountId, ok: false, error: message });
    }
  }
  return { results };
}

function snapshotRow(account: AdAccountRow, fresh: PlatformAccount, funding: AccountFunding) {
  return {
    ad_account_id: account.id,
    client_id: account.client_id,
    platform_id: account.platform_id,
    status: fresh.status,
    raw_status: fresh.rawStatus,
    currency: funding.currency ?? fresh.currency,
    amount_spent_micros: funding.amountSpentMicros,
    balance_micros: funding.amountDueMicros,
    spend_cap_micros: funding.spendCapMicros,
    budget_micros: funding.budgetMicros,
    available_micros: funding.availableMicros,
    available_basis: funding.availableBasis,
    budget_end_at: funding.budgetEndAt,
    funding_description: funding.fundingDescription,
    issues: funding.issues,
    payload: funding.raw,
  };
}

async function balanceSettings(ctx: Ctx, input: Of<"balance_settings">) {
  const account = await loadAccountForManager(ctx, input.adAccountId);
  const { error } = await ctx.db
    .from("ad_accounts")
    .update({
      low_balance_days: input.lowBalanceDays,
      low_balance_amount_micros: input.lowBalanceAmount == null ? null : Math.round(input.lowBalanceAmount * 1_000_000),
      updated_by: ctx.caller.id,
    })
    .eq("id", account.id);
  if (error) throw dbError(error);
  return { adAccountId: account.id };
}

// ------------------------------------------------------------------ entrada

/** Qual limite de requisições vale para cada ação (Etapa 26). */
function rateBucket(action: Input["action"]): RateBucket {
  if (action === "connect" || action === "google_start" || action === "google_complete" || action === "disconnect") return "accounts.connect";
  if (action === "refresh_balance") return "accounts.balance";
  return "accounts.other";
}

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
    const caller = await requireRole(req, db, ADMIN_ONLY.has(input.action) ? ["admin"] : MANAGERS);
    await enforceRateLimit(db, rateBucket(input.action), caller.id);
    const ctx: Ctx = { req, db, caller };

    const result = await (() => {
      switch (input.action) {
        case "connect": return connect(ctx, input);
        case "google_status": return googleStatus();
        case "google_start": return googleStart(ctx, input);
        case "google_complete": return googleComplete(ctx, input);
        case "disconnect": return disconnect(ctx, input);
        case "list_available": return listAvailable(ctx, input);
        case "link": return link(ctx, input);
        case "refresh": return refresh(ctx, input);
        case "unlink": return unlink(ctx, input);
        case "refresh_balance": return refreshBalance(ctx, input);
        case "balance_settings": return balanceSettings(ctx, input);
      }
    })();
    return json(req, 200, { data: result });
  }, "ad-accounts"),
);
