/**
 * Edge Function: tracking-destinations (Etapa 34.3)
 *
 * Configura o envio de conversões ao Meta (API de Conversões) de um site.
 * Só admin e gestor, e só para sites de clientes que a pessoa enxerga.
 *
 * Ações (POST com JSON):
 *   save { containerId, pixelId, token?, testEventCode?, sendEvents, enabled }
 *        → token (se enviado) vai direto para o Vault; nunca volta para o site.
 *   remove_token { containerId } → apaga o token do Vault e desliga o envio.
 *   test { containerId } → manda 1 evento de teste (exige o código de teste do Meta).
 *
 * Toda ação é registrada em audit_logs (sem o token).
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, type Caller, requireRole, userClient } from "../_shared/auth.ts";
import { looksLikeToken, sha256Hex } from "../_shared/capi/meta.ts";
import { postToMeta } from "../_shared/capi/sender.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";

const MANAGERS = ["admin", "gestor"] as const;
const EVENTS = ["PageView", "ViewContent", "Contact", "Lead", "CompleteRegistration", "SubmitApplication", "Schedule", "AddToCart", "InitiateCheckout", "Purchase"] as const;

const containerId = z.string().uuid("Site inválido.");
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    containerId,
    pixelId: z.string().trim().regex(/^\d{5,20}$/, "O ID do Pixel tem só números (5 a 20)."),
    token: z.string().trim().optional(),
    testEventCode: z.string().trim().regex(/^[A-Za-z0-9]{3,40}$/, "Código de teste inválido (ex.: TEST12345).").nullable().optional(),
    sendEvents: z.array(z.enum(EVENTS)).min(1, "Escolha pelo menos um evento para enviar.").max(EVENTS.length),
    enabled: z.boolean(),
  }),
  z.object({ action: z.literal("remove_token"), containerId }),
  z.object({ action: z.literal("test"), containerId }),
]);
type Input = z.infer<typeof schema>;

async function audit(db: SupabaseClient, caller: Caller, action: string, clientId: string, details: Record<string, unknown>) {
  const { error } = await db.from("audit_logs").insert({ actor_id: caller.id, action, target_type: "tracking_destination", target_id: clientId, details });
  if (error) await recordError({ source: "servidor", code: "AUDIT_FAILED", technical: error, context: { funcao: "tracking-destinations", acao: action }, userId: caller.id });
}

/** O site existe e a pessoa enxerga o cliente dele (confere com o RLS de quem pede). */
async function visibleContainer(req: Request, id: string): Promise<{ id: string; client_id: string; test_mode: boolean }> {
  const { data, error } = await userClient(req).from("tracking_containers").select("id, client_id, test_mode").eq("id", id).maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos verificar o site.", error);
  if (!data) throw new AppError(404, "NOT_FOUND", "Site não encontrado.");
  return data;
}

async function destinationOf(db: SupabaseClient, containerId: string) {
  const { data, error } = await db.from("tracking_destinations")
    .select("id, client_id, pixel_id, has_token, enabled, test_event_code").eq("container_id", containerId).maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos ler a configuração do Meta.", error);
  return data as { id: string; client_id: string; pixel_id: string; has_token: boolean; enabled: boolean; test_event_code: string | null } | null;
}

async function save(db: SupabaseClient, req: Request, caller: Caller, input: Extract<Input, { action: "save" }>) {
  const container = await visibleContainer(req, input.containerId);
  const token = input.token ?? "";
  if (token && !looksLikeToken(token)) {
    throw new AppError(400, "INVALID_INPUT", "O token não parece um token do Meta. Copie de novo do Gerenciador de Eventos (Configurações → API de Conversões → Gerar token).");
  }
  let dest = await destinationOf(db, container.id);
  const fields = { pixel_id: input.pixelId, test_event_code: input.testEventCode ?? null, send_events: input.sendEvents, updated_by: caller.id };
  if (!dest) {
    const { data, error } = await db.from("tracking_destinations")
      .insert({ ...fields, container_id: container.id, client_id: container.client_id, enabled: false, created_by: caller.id })
      .select("id, client_id, pixel_id, has_token, enabled, test_event_code").single();
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos salvar a configuração do Meta.", error);
    dest = data;
  } else {
    const { error } = await db.from("tracking_destinations").update(fields).eq("id", dest.id);
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos salvar a configuração do Meta.", error);
  }
  if (token) {
    const { error } = await db.rpc("tracking_destination_secret_set", { p_destination_id: dest!.id, p_secret: token });
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos guardar o token com segurança.", error);
  }
  const hasToken = dest!.has_token || !!token;
  if (input.enabled && !hasToken) throw new AppError(400, "INVALID_STATE", "Cole o token da API de Conversões antes de ligar o envio.");
  const { error: enableError } = await db.from("tracking_destinations").update({ enabled: input.enabled }).eq("id", dest!.id);
  if (enableError) throw new AppError(500, "DB_ERROR", "Não conseguimos ligar/desligar o envio.", enableError);
  await audit(db, caller, "tracking_destination.save", container.client_id, {
    pixel_id: input.pixelId, enabled: input.enabled, send_events: input.sendEvents,
    test_event_code: input.testEventCode ? "definido" : "nenhum", token: token ? "alterado (guardado no Vault)" : "sem alteração",
  });
  return { id: dest!.id, hasToken, enabled: input.enabled };
}

async function removeToken(db: SupabaseClient, req: Request, caller: Caller, input: Extract<Input, { action: "remove_token" }>) {
  const container = await visibleContainer(req, input.containerId);
  const dest = await destinationOf(db, container.id);
  if (!dest) throw new AppError(404, "NOT_FOUND", "Este site ainda não tem o Meta configurado.");
  const { error } = await db.rpc("tracking_destination_secret_delete", { p_destination_id: dest.id });
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos apagar o token.", error);
  await audit(db, caller, "tracking_destination.remove_token", container.client_id, { pixel_id: dest.pixel_id });
  return { removed: true };
}

async function sendTest(db: SupabaseClient, req: Request, caller: Caller, input: Extract<Input, { action: "test" }>) {
  const container = await visibleContainer(req, input.containerId);
  const dest = await destinationOf(db, container.id);
  if (!dest || !dest.has_token) throw new AppError(400, "INVALID_STATE", "Salve o ID do Pixel e o token antes de testar.");
  if (!dest.test_event_code) {
    throw new AppError(400, "INVALID_STATE", "Informe o código de teste do Meta (Gerenciador de Eventos → Testar eventos) para enviar um evento de teste.");
  }
  const { data: token } = await db.rpc("tracking_destination_secret_get", { p_destination_id: dest.id });
  if (typeof token !== "string" || !token) throw new AppError(400, "INVALID_STATE", "Token não encontrado. Cole o token de novo.");
  const event = {
    event_name: "PageView",
    event_time: Math.floor(Date.now() / 1000),
    event_id: `bf_teste_${crypto.randomUUID()}`,
    action_source: "website",
    user_data: {
      external_id: [await sha256Hex(`teste-crm-${caller.id}`)],
      client_user_agent: req.headers.get("user-agent") ?? "Backstage Flow (teste)",
    },
  };
  const res = await postToMeta(db, fetch, dest.id, dest.pixel_id, token, dest.test_event_code, [event], "teste");
  await audit(db, caller, "tracking_destination.test", container.client_id, { pixel_id: dest.pixel_id, ok: res.ok, fbtrace_id: res.fbtraceId });
  return { ok: res.ok, eventsReceived: res.eventsReceived, message: res.message, fbtraceId: res.fbtraceId };
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await requireRole(req, db, MANAGERS);
    throw new AppError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.message);
  }
  const input = parsed.data;
  const caller = await requireRole(req, db, MANAGERS);
  await enforceRateLimit(db, "tracking.manage", caller.id);
  const data = input.action === "save"
    ? await save(db, req, caller, input)
    : input.action === "remove_token"
    ? await removeToken(db, req, caller, input)
    : await sendTest(db, req, caller, input);
  return json(req, 200, { data });
}, "tracking-destinations"));
