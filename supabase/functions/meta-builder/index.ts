/**
 * Edge Function: meta-builder (Campaign Builder, Fase A) — LEITURAS da conta do Meta e VALIDAÇÃO. Não cria nada no Meta.
 *
 *   account_lists { adAccountId } → pixels, públicos personalizados e públicos salvos da conta (só id e nome)
 *   validate      { draftId }     → pergunta ao Meta se a CAMPANHA do rascunho seria aceita (validate_only: sem criar)
 *   publish       { draftId, operationKey } → (Fase B) CRIA no Meta, tudo PAUSADO, e registra cada objeto em publish_operations/publish_items
 *
 * Quem pode: administrador, gestor e operador com acesso ao cliente. A permissão do módulo e o acesso à conta são conferidos
 * NO BANCO com o login da pessoa (userClient): o token do Meta nunca sai do servidor e nunca vai para log.
 */
import { z } from "npm:zod@4";
import { adminClient, requireRole, userClient } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { buildCampaignFields, fetchAccountLists, fetchLeadForms, searchTargeting, uploadAdImage, uploadAdVideo, validateCampaign } from "../_shared/platforms/meta/builder.ts";
import { DriveClient, parseDriveFolderId } from "../_shared/google/drive.ts";
import { parseServiceAccount, SheetsError } from "../_shared/google/sheets.ts";
import { graphGet, graphPostRaw } from "../_shared/platforms/meta/client.ts";
import { buildPlan, type ItemResult, runPublish } from "../_shared/platforms/meta/publish.ts";
import { normalizeDraft } from "../../../packages/shared/src/campaign-builder/model.ts";
import { publishBlockers } from "../../../packages/shared/src/campaign-builder/publish.ts";

const id = z.guid("Identificador inválido.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("account_lists"), adAccountId: id }),
  z.object({ action: z.literal("validate"), draftId: id }),
  z.object({ action: z.literal("publish"), draftId: id, operationKey: z.string().min(8).max(80) }),
  z.object({ action: z.literal("targeting_search"), adAccountId: id, kind: z.enum(["interest", "city"]), q: z.string().trim().min(2, "Digite pelo menos 2 letras.").max(80) }),
  z.object({ action: z.literal("lead_forms"), adAccountId: id, pageId: z.string().regex(/^\d{5,30}$/, "ID da página inválido.") }),
  z.object({ action: z.literal("drive_list"), folder: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("drive_thumb"), fileId: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/, "Arquivo inválido.") }),
]);

interface AccountRow {
  id: string;
  external_id: string;
  currency: string;
  platform_id: string;
  connection_id: string | null;
  timezone: string;
  client_id: string;
}

async function loadAccount(req: Request, adAccountId: string): Promise<AccountRow> {
  // Pelo RLS: só enxerga a conta quem tem acesso ao cliente dela.
  const { data, error } = await userClient(req).from("ad_accounts")
    .select("id, external_id, currency, platform_id, connection_id, timezone, client_id").eq("id", adAccountId).is("unlinked_at", null).maybeSingle();
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

async function myPermissions(req: Request): Promise<{ ver: boolean; editar: boolean; publicar: boolean }> {
  const { data, error } = await userClient(req).rpc("builder_my_permissions");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos conferir a sua permissão.", error);
  const p = (data ?? {}) as { ver?: boolean; editar?: boolean; publicar?: boolean };
  return { ver: p.ver === true, editar: p.editar === true, publicar: p.publicar === true };
}

/** Cliente do Drive com a conta de serviço do Google que já existe (a das planilhas; chave no cofre). */
async function driveClient(): Promise<DriveClient> {
  const { data, error } = await adminClient().rpc("sheets_key_get");
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a chave do Google no cofre.", error);
  return new DriveClient(parseServiceAccount(data as string | null));
}

/** Erros do Google (SheetsError) viram erro amigável do CRM. */
const toApp = (err: unknown) => (err instanceof SheetsError ? new AppError(err.status, err.code, err.userMessage, err.technical) : err);

const PUBLISH_BLOCK_MINUTES = 10;

async function operationView(db: ReturnType<typeof adminClient>, operationId: string) {
  const { data: op } = await db.from("publish_operations").select("id, draft_id, status, summary, error_message, created_at, finished_at").eq("id", operationId).maybeSingle();
  const { data: items } = await db.from("publish_items")
    .select("kind, local_id, name, position, status, meta_id, confirmed, effective_status, error_code, error_message").eq("operation_id", operationId).order("position");
  return { operation: op, items: items ?? [] };
}

/** Fase B: cria tudo no Meta (PAUSADO), registrando cada passo. Chave de operação única: repetir o pedido devolve a mesma publicação. */
async function publish(req: Request, caller: { id: string }, input: { draftId: string; operationKey: string }) {
  const db = adminClient();
  const { data: draftRow, error } = await userClient(req).rpc("builder_draft_get", { p_id: input.draftId });
  if (error || !draftRow) throw new AppError(404, "NOT_FOUND", "Rascunho não encontrado ou sem acesso.", error);
  const row = draftRow as { ad_account_id: string | null; client_id: string; data: unknown; name: string };
  if (!row.ad_account_id) throw new AppError(400, "INVALID_STATE", "Escolha a conta de anúncio do rascunho antes de publicar.");

  // A mesma chave: devolve o que já existe (duplo clique, recarregar a página).
  const { data: sameKey } = await db.from("publish_operations").select("id, draft_id").eq("operation_key", input.operationKey).maybeSingle();
  if (sameKey) {
    if (sameKey.draft_id !== input.draftId) throw new AppError(400, "INVALID_STATE", "Esta chave de publicação pertence a outro rascunho.");
    return { ...(await operationView(db, sameKey.id as string)), repeated: true };
  }

  const draft = normalizeDraft(row.data);
  const blockers = publishBlockers(draft);
  if (blockers.length) {
    throw new AppError(400, "INVALID_STATE", `Ainda não dá para publicar: ${blockers.slice(0, 3).map((b) => b.message).join(" · ")}${blockers.length > 3 ? ` (e mais ${blockers.length - 3})` : ""}`);
  }
  const account = await loadAccount(req, row.ad_account_id);

  // Não publica de novo o que já foi publicado, nem enquanto outra publicação do mesmo rascunho está rodando.
  const { data: previous } = await db.from("publish_operations").select("id, status, created_at").eq("draft_id", input.draftId);
  const now = Date.now();
  for (const p of previous ?? []) {
    const age = (now - new Date(p.created_at as string).getTime()) / 60_000;
    if (p.status === "concluida" || p.status === "parcial") {
      throw new AppError(400, "INVALID_STATE", "Este rascunho já foi publicado. Confira no Gerenciador de Anúncios; para publicar de novo, duplique o rascunho.");
    }
    if (p.status === "processando" && age < PUBLISH_BLOCK_MINUTES) {
      throw new AppError(400, "INVALID_STATE", "Já há uma publicação deste rascunho em andamento. Aguarde alguns minutos.");
    }
  }

  const plan = buildPlan(draft);
  const { data: op, error: opError } = await db.from("publish_operations").insert({
    draft_id: input.draftId, client_id: row.client_id, ad_account_id: account.id, operation_key: input.operationKey, status: "processando",
    summary: { campanhas: 1, conjuntos: draft.adSets.length, anuncios: draft.ads.length }, created_by: caller.id,
  }).select("id").single();
  if (opError || !op) throw new AppError(500, "DB_ERROR", "Não conseguimos registrar a publicação. Nada foi criado no Meta.", opError);
  const operationId = op.id as string;
  const { error: itemsError } = await db.from("publish_items").insert(plan.map((p) => ({ operation_id: operationId, kind: p.kind, local_id: p.localId, name: p.name.slice(0, 300), position: p.position })));
  if (itemsError) {
    await db.from("publish_operations").update({ status: "falhou", error_message: "Não foi possível registrar os itens. Nada foi criado no Meta.", finished_at: new Date().toISOString() }).eq("id", operationId);
    throw new AppError(500, "DB_ERROR", "Não conseguimos registrar a publicação. Nada foi criado no Meta.", itemsError);
  }

  let outcome: "concluida" | "parcial" | "falhou" = "falhou";
  let errorMessage: string | null = null;
  try {
    const token = await tokenFor(account.connection_id!);
    // Imagens e vídeos do Drive: baixa e envia ao Meta ANTES de criar qualquer coisa. Se uma falhar, nada é criado.
    const imageHashes = new Map<string, string>();
    const videos = new Map<string, { id: string; thumbnail: string }>();
    const driveIds = [...new Set(draft.ads.map((a) => a.driveFileId).filter(Boolean))];
    if (driveIds.length) {
      const drive = await driveClient();
      for (const fileId of driveIds) {
        const media = await drive.downloadMedia(fileId);
        if (media.kind === "video") videos.set(fileId, await uploadAdVideo(token, account.external_id, media.bytes, media.name, media.mimeType));
        else imageHashes.set(fileId, await uploadAdImage(token, account.external_id, media.bytes, media.name));
      }
    }
    const lists = await fetchAccountLists(token, account.external_id);
    const used = new Set(draft.adSets.flatMap((s) => s.audienceIds));
    const saved = new Map<string, Record<string, unknown>>();
    for (const a of lists.savedAudiences.filter((x) => used.has(x.id))) {
      const got = await graphGet<{ targeting?: Record<string, unknown> }>(a.id, { fields: "targeting" }, token);
      if (got.targeting) saved.set(a.id, got.targeting);
    }
    outcome = await runPublish(
      { post: (path, fields) => graphPostRaw(path, fields, token), get: (path, params) => graphGet<Record<string, unknown>>(path, params, token) },
      { externalId: account.external_id, currency: account.currency, timezone: account.timezone || "UTC", draft, imageHashes, videos, audiences: { custom: new Set(lists.customAudiences.map((x) => x.id)), saved } },
      async (position, r: ItemResult) => {
        await db.from("publish_items").update({
          status: r.status, meta_id: r.metaId ?? null, confirmed: r.confirmed ?? false, effective_status: r.effectiveStatus ?? null,
          error_code: r.errorCode ?? null, error_message: r.errorMessage ?? null, updated_at: new Date().toISOString(),
        }).eq("operation_id", operationId).eq("position", position);
      },
    );
  } catch (err) {
    errorMessage = err instanceof AppError || err instanceof SheetsError ? err.userMessage : err instanceof Error && err.message.startsWith("O Meta") ? err.message : "A publicação foi interrompida por um erro do servidor. Confira no Gerenciador do Meta o que chegou a ser criado.";
    const { data: made } = await db.from("publish_items").select("id").eq("operation_id", operationId).eq("status", "criado").limit(1);
    outcome = made && made.length ? "parcial" : "falhou";
  }
  await db.from("publish_operations").update({ status: outcome, error_message: errorMessage, finished_at: new Date().toISOString() }).eq("id", operationId);
  await db.from("audit_logs").insert({
    actor_id: caller.id, action: "builder.publicar", target_type: "builder_draft", target_id: input.draftId,
    details: { operation: operationId, status: outcome, conjuntos: draft.adSets.length, anuncios: draft.ads.length },
  });
  return { ...(await operationView(db, operationId)), repeated: false };
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

  if (input.action === "targeting_search") {
    const account = await loadAccount(req, input.adAccountId);
    const token = await tokenFor(account.connection_id!);
    const results = input.kind === "interest" ? await searchTargeting(token, "interest", input.q) : await searchTargeting(token, "city", input.q);
    return json(req, 200, { data: { results } });
  }
  if (input.action === "lead_forms") {
    const account = await loadAccount(req, input.adAccountId);
    try {
      return json(req, 200, { data: { forms: await fetchLeadForms(await tokenFor(account.connection_id!), input.pageId) } });
    } catch (e) {
      // Sem acesso à página (ou sem formulários liberados): a tela cai para o campo manual em vez de travar.
      if (e instanceof AppError && (e.code === "PERMISSION_DENIED" || e.code === "PLATFORM_BAD_REQUEST")) {
        throw new AppError(400, "LEAD_FORMS_UNAVAILABLE", "O Meta não liberou a lista de formulários desta página para o CRM. Digite o ID do formulário.", e.technical);
      }
      throw e;
    }
  }

  if (input.action === "drive_list") {
    const folderId = parseDriveFolderId(input.folder);
    if (!folderId) throw new AppError(400, "INVALID_INPUT", "Cole o link da pasta do Google Drive (ou o ID dela).");
    try {
      const drive = await driveClient();
      const [folder, content] = await Promise.all([drive.meta(folderId), drive.list(folderId)]);
      return json(req, 200, { data: { folder: { id: folder.id, name: folder.name }, ...content } });
    } catch (e) { throw toApp(e); }
  }
  if (input.action === "drive_thumb") {
    try {
      return json(req, 200, { data: { thumbnail: await (await driveClient()).thumbnail(input.fileId) } });
    } catch (e) { throw toApp(e); }
  }

  if (input.action === "publish") {
    if (!perms.publicar) throw new AppError(403, "FORBIDDEN", "Você não tem permissão para publicar no Meta.");
    return json(req, 200, { data: await publish(req, caller, input) });
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
