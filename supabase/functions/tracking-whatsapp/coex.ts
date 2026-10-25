/**
 * Tracking T4.2: ligar o WhatsApp do cliente pelo CADASTRO OFICIAL do Meta (Embedded Signup, Coexistence).
 * O número continua no app WhatsApp Business do celular. Fluxo por redirecionamento (sem o script do Meta no site):
 *   1. coex_start → endereço do login do Meta (app da agência + configuração + "whatsapp_business_app_onboarding");
 *   2. o Meta devolve um código para /configuracoes/integracoes/whatsapp/retorno;
 *   3. coex_complete → troca o código pelo token (só no servidor), acha a conta e o número, assina o webhook do app.
 * O token nunca vai para a tela nem para log: vai para o cofre (Vault).
 */
import { z } from "npm:zod@4";
import { AppError } from "../_shared/http.ts";

export const RETURN_PATH = "/configuracoes/integracoes/whatsapp/retorno";

const redirectUri = z.string().url().refine((u) => {
  const url = new URL(u);
  return url.pathname === RETURN_PATH && (url.protocol === "https:" || url.hostname === "localhost");
}, "Endereço de retorno inválido.");

export const coexSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("coex_start"), containerId: z.string().uuid("Site inválido."), redirectUri }),
  z.object({
    action: z.literal("coex_complete"),
    code: z.string().min(10).max(2000),
    state: z.string().regex(/^[0-9a-f]{64}$/, "Autorização inválida ou expirada. Tente ligar de novo."),
    redirectUri,
  }),
]);
export type CoexInput = z.infer<typeof coexSchema>;

export interface AppCredentials {
  app_id: string | null;
  config_id: string | null;
  graph_version: string;
  app_secret: string | null;
  verify_token: string | null;
}

export function credentialsReady(c: AppCredentials | null): c is AppCredentials & { app_id: string; config_id: string; app_secret: string } {
  return !!c?.app_id && !!c.config_id && !!c.app_secret;
}

/** Endereço do cadastro oficial do Meta para o número que já usa o app WhatsApp Business (Coexistence). */
export function buildCoexAuthorizeUrl(c: { app_id: string; config_id: string; graph_version: string }, redirect: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${c.graph_version}/dialog/oauth`);
  url.searchParams.set("client_id", c.app_id);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("state", state);
  url.searchParams.set("config_id", c.config_id);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("override_default_response_type", "true");
  url.searchParams.set("extras", JSON.stringify({ setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" }));
  return url.toString();
}

/** Contas do WhatsApp (WABA) que a pessoa liberou no cadastro (lidas do debug_token). */
export function wabaIdsFromDebugToken(body: unknown): string[] {
  const scopes = (body as { data?: { granular_scopes?: { scope?: string; target_ids?: string[] }[] } })?.data?.granular_scopes ?? [];
  const ids = scopes
    .filter((s) => s.scope === "whatsapp_business_management" || s.scope === "whatsapp_business_messaging")
    .flatMap((s) => s.target_ids ?? [])
    .filter((id) => /^\d{5,30}$/.test(id));
  return [...new Set(ids)];
}

const GRAPH = "https://graph.facebook.com";

async function graph(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    throw new AppError(502, "PLATFORM_UNAVAILABLE", "Não conseguimos falar com o Meta agora. Tente de novo em instantes.", err);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const e = (body.error ?? {}) as { message?: string; code?: number };
    throw new AppError(400, "PLATFORM_ERROR", "O Meta recusou o cadastro do WhatsApp. Confira o app da agência em Integrações e tente de novo.",
      { status: res.status, code: e.code, message: e.message });
  }
  return body;
}

export interface CoexResult {
  token: string;
  waba_id: string;
  phone_number_id: string;
  display_phone: string | null;
  verified_name: string | null;
  numbers: number;
}

/** Troca o código, acha a conta e o número, e assina o webhook do app da agência nessa conta. */
export async function completeCoex(
  c: AppCredentials & { app_id: string; app_secret: string },
  code: string,
  redirect: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CoexResult> {
  const v = c.graph_version;
  const tokenUrl = new URL(`${GRAPH}/${v}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", c.app_id);
  tokenUrl.searchParams.set("client_secret", c.app_secret);
  tokenUrl.searchParams.set("redirect_uri", redirect);
  tokenUrl.searchParams.set("code", code);
  const token = String((await graph(fetchImpl, tokenUrl.toString())).access_token ?? "");
  if (!token) throw new AppError(400, "PLATFORM_ERROR", "O Meta não devolveu a autorização. Tente ligar de novo.");

  const debugUrl = new URL(`${GRAPH}/${v}/debug_token`);
  debugUrl.searchParams.set("input_token", token);
  debugUrl.searchParams.set("access_token", `${c.app_id}|${c.app_secret}`);
  const [wabaId] = wabaIdsFromDebugToken(await graph(fetchImpl, debugUrl.toString()));
  if (!wabaId) throw new AppError(400, "PLATFORM_ERROR", "Nenhuma conta do WhatsApp Business foi liberada no cadastro. Tente de novo e escolha a conta.");

  const auth = { Authorization: `Bearer ${token}` };
  const phones = await graph(fetchImpl, `${GRAPH}/${v}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, { headers: auth });
  const list = ((phones.data ?? []) as { id?: string; display_phone_number?: string; verified_name?: string }[]).filter((p) => /^\d{5,30}$/.test(p.id ?? ""));
  if (!list.length) throw new AppError(400, "PLATFORM_ERROR", "A conta liberada não tem número de WhatsApp. Confira no Gerenciador do WhatsApp.");

  await graph(fetchImpl, `${GRAPH}/${v}/${wabaId}/subscribed_apps`, { method: "POST", headers: auth });
  return {
    token,
    waba_id: wabaId,
    phone_number_id: list[0].id!,
    display_phone: list[0].display_phone_number?.slice(0, 40) ?? null,
    verified_name: list[0].verified_name?.slice(0, 120) ?? null,
    numbers: list.length,
  };
}
