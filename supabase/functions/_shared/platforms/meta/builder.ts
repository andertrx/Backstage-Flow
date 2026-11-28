/**
 * Campaign Builder (Fase A): leituras da conta de anúncio e a VALIDAÇÃO da campanha no Meta.
 * Nada aqui cria ou altera algo no Meta: as leituras são GET e a validação usa `execution_options=["validate_only"]`
 * (o Meta confere a campanha e responde sem criar).
 */
import { graphGet, graphGetAll, graphPostFile, graphPostRaw, type MetaErrorBody } from "./client.ts";

export interface ListItem {
  id: string;
  name: string;
  detail?: string;
}

export interface AccountLists {
  pixels: ListItem[];
  customAudiences: ListItem[];
  savedAudiences: ListItem[];
  /** Listas que o Meta não devolveu (falta de permissão, por exemplo): a tela avisa em vez de fingir que está vazio. */
  failed: ("pixels" | "customAudiences" | "savedAudiences")[];
}

const act = (externalId: string) => `act_${externalId.replace(/^act_/, "")}`;
const text = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** Pixels, públicos personalizados e públicos salvos da conta (só id e nome). Uma lista que falha não derruba as outras. */
export async function fetchAccountLists(token: string, externalId: string, fetchImpl: typeof fetch = fetch): Promise<AccountLists> {
  const base = act(externalId);
  const failed: AccountLists["failed"] = [];
  const get = async <T>(key: AccountLists["failed"][number], path: string, fields: string): Promise<T[]> => {
    try {
      return await graphGetAll<T>(`${base}/${path}`, { fields, limit: "200" }, token, fetchImpl);
    } catch {
      failed.push(key);
      return [];
    }
  };
  const [pixels, custom, saved] = await Promise.all([
    get<{ id?: string; name?: string }>("pixels", "adspixels", "id,name"),
    get<{ id?: string; name?: string; subtype?: string; approximate_count_lower_bound?: number }>("customAudiences", "customaudiences", "id,name,subtype,approximate_count_lower_bound"),
    get<{ id?: string; name?: string }>("savedAudiences", "saved_audiences", "id,name"),
  ]);
  const clean = (list: { id?: string; name?: string; subtype?: string }[]): ListItem[] =>
    list.filter((x) => x.id).map((x) => ({ id: text(x.id, 40), name: text(x.name) || text(x.id, 40), ...(x.subtype ? { detail: text(x.subtype, 40) } : {}) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { pixels: clean(pixels), customAudiences: clean(custom), savedAudiences: clean(saved), failed };
}

/** Moedas sem centavos na Marketing API (o valor já é a unidade inteira). Demais: 100 (centavos). */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "VND", "ISK", "HUF", "TWD", "UGX", "PYG"]);
export function currencyOffset(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

export interface CampaignInput {
  name: string;
  objective: string;
  specialAdCategories: string[];
  budgetLevel: "campaign" | "adset";
  budgetType: "daily" | "lifetime";
  budgetAmount: number | null;
}

/** Campos da campanha no formato do Meta. O status é SEMPRE o informado (a validação usa PAUSED). Valor em unidades da moeda → menores unidades. */
export function buildCampaignFields(c: CampaignInput, currency: string, status: "PAUSED" | "ACTIVE"): Record<string, string> {
  const f: Record<string, string> = {
    name: c.name,
    objective: c.objective,
    status,
    special_ad_categories: JSON.stringify(c.specialAdCategories.length ? c.specialAdCategories : []),
  };
  if (c.budgetLevel === "campaign" && c.budgetAmount && c.budgetAmount > 0) {
    f[c.budgetType === "lifetime" ? "lifetime_budget" : "daily_budget"] = String(Math.round(c.budgetAmount * currencyOffset(currency)));
    f.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  } else {
    // Sem orçamento na campanha: o Meta exige dizer que o orçamento não é compartilhado entre os conjuntos.
    f.is_adset_budget_sharing_enabled = "false";
  }
  return f;
}

export interface ValidationResult {
  ok: boolean;
  /** Mensagem do Meta em linguagem dele (já sem token): o que ele recusou. */
  message: string | null;
  code: number | null;
  subcode: number | null;
  /** O token não tem permissão de criar/alterar (ads_management)? */
  permission: boolean;
}

/**
 * Pergunta ao Meta se a campanha seria aceita, SEM criar (`validate_only`).
 * Sucesso do Meta: `{"success": true}`. Recusa: objeto `error` com a mensagem e o motivo.
 */
export async function validateCampaign(token: string, externalId: string, fields: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<ValidationResult> {
  const { status, body } = await graphPostRaw(`${act(externalId)}/campaigns`, { ...fields, execution_options: JSON.stringify(["validate_only"]) }, token, fetchImpl);
  const err = (body as MetaErrorBody).error as (MetaErrorBody["error"] & { error_user_title?: string; error_user_msg?: string }) | undefined;
  if (status < 400 && !err) return { ok: true, message: null, code: null, subcode: null, permission: false };
  const code = err?.code ?? null;
  const user = [err?.error_user_title, err?.error_user_msg].filter(Boolean).join(": ");
  return {
    ok: false,
    message: (user || err?.message || "O Meta recusou a campanha sem dar o motivo.").slice(0, 600),
    code,
    subcode: err?.error_subcode ?? null,
    permission: code === 10 || code === 200 || (code !== null && code >= 200 && code <= 299),
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/**
 * Envia uma imagem à biblioteca da conta (`/adimages`, em base64) e devolve o hash que o Meta usa nos anúncios.
 * O Meta devolve o MESMO hash para a mesma imagem, então reenviar não duplica nada. Falha vira uma mensagem clara.
 */
export async function uploadAdImage(token: string, externalId: string, bytes: Uint8Array, name: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { status, body } = await graphPostRaw(`${act(externalId)}/adimages`, { bytes: toBase64(bytes), name: name.slice(0, 100) }, token, fetchImpl);
  const err = (body as MetaErrorBody).error as (MetaErrorBody["error"] & { error_user_msg?: string }) | undefined;
  if (status >= 400 || err) {
    throw new Error(`O Meta recusou a imagem "${name}": ${(err?.error_user_msg || err?.message || `HTTP ${status}`).slice(0, 300)}`);
  }
  const images = (body.images ?? {}) as Record<string, { hash?: string }>;
  const hash = Object.values(images)[0]?.hash;
  if (!hash) throw new Error(`O Meta não devolveu o código da imagem "${name}".`);
  return hash;
}

export interface InterestHit { id: string; name: string; detail?: string }
export interface CityHit { key: string; name: string; detail?: string }

/** Busca de interesses ou cidades pelo próprio Meta (só leitura). Devolve até 15 resultados já limpos. */
export async function searchTargeting(token: string, kind: "interest", q: string, fetchImpl?: typeof fetch): Promise<InterestHit[]>;
export async function searchTargeting(token: string, kind: "city", q: string, fetchImpl?: typeof fetch): Promise<CityHit[]>;
export async function searchTargeting(token: string, kind: "interest" | "city", q: string, fetchImpl: typeof fetch = fetch): Promise<(InterestHit | CityHit)[]> {
  const params: Record<string, string> = kind === "interest"
    ? { type: "adinterest", q, limit: "15", locale: "pt_BR" }
    : { type: "adgeolocation", q, location_types: JSON.stringify(["city"]), limit: "15", locale: "pt_BR" };
  const body = await graphGet<{ data?: Record<string, unknown>[] }>("search", params, token, fetchImpl);
  const rows = Array.isArray(body.data) ? body.data : [];
  if (kind === "interest") {
    return rows.filter((r) => typeof r.id === "string" && typeof r.name === "string").map((r) => ({
      id: String(r.id), name: text(r.name), ...(typeof r.audience_size_lower_bound === "number" ? { detail: `público de ${r.audience_size_lower_bound.toLocaleString("pt-BR")}+` } : {}),
    }));
  }
  return rows.filter((r) => typeof r.key === "string" && typeof r.name === "string").map((r) => ({
    key: String(r.key), name: text(r.name), detail: [r.region, r.country_name].filter((x) => typeof x === "string").join(", ") || undefined,
  }));
}

export interface LeadFormHit { id: string; name: string; status: string }

/** Formulários de cadastro (leadgen_forms) de uma página. O Meta pode recusar se o token não tem acesso à página. */
export async function fetchLeadForms(token: string, pageId: string, fetchImpl: typeof fetch = fetch): Promise<LeadFormHit[]> {
  const rows = await graphGetAll<{ id?: string; name?: string; status?: string }>(`${pageId}/leadgen_forms`, { fields: "id,name,status", limit: "100" }, token, fetchImpl);
  return rows.filter((r) => r.id).map((r) => ({ id: text(r.id, 40), name: text(r.name) || text(r.id, 40), status: text(r.status, 20) }));
}

export interface UploadedVideo { id: string; thumbnail: string }

/**
 * Envia um vídeo (MP4/MOV) à biblioteca da conta (`/advideos`) e ESPERA o Meta terminar de processar (até `maxWaitMs`).
 * Devolve o id do vídeo e a miniatura que o próprio Meta gerou (o anúncio de vídeo exige uma). Falhas viram mensagem clara.
 */
export async function uploadAdVideo(
  token: string, externalId: string, bytes: Uint8Array, name: string, mimeType: string,
  opts: { fetchImpl?: typeof fetch; maxWaitMs?: number; pollMs?: number } = {},
): Promise<UploadedVideo> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { status, body } = await graphPostFile(`${act(externalId)}/advideos`, { name: name.slice(0, 100) }, { field: "source", bytes, name, mimeType }, token, fetchImpl);
  const err = (body as MetaErrorBody).error as (MetaErrorBody["error"] & { error_user_msg?: string }) | undefined;
  if (status >= 400 || err) throw new Error(`O Meta recusou o vídeo "${name}": ${(err?.error_user_msg || err?.message || `HTTP ${status}`).slice(0, 300)}`);
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) throw new Error(`O Meta não devolveu o código do vídeo "${name}".`);
  const deadline = Date.now() + (opts.maxWaitMs ?? 90_000);
  for (;;) {
    const info = await graphGet<{ status?: { video_status?: string }; picture?: string }>(id, { fields: "status,picture" }, token, fetchImpl);
    const st = info.status?.video_status;
    if (st === "error") throw new Error(`O Meta não conseguiu processar o vídeo "${name}". Tente outro arquivo (MP4 com H.264).`);
    if (st === "ready") {
      if (!info.picture) throw new Error(`O Meta não gerou a miniatura do vídeo "${name}".`);
      return { id, thumbnail: info.picture };
    }
    if (Date.now() >= deadline) throw new Error(`O Meta ainda está processando o vídeo "${name}". Aguarde alguns minutos e publique de novo.`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 3000));
  }
}

export interface IgMediaHit { id: string; caption: string; type: string; permalink: string; date: string; thumbnail: string }

/** Posts recentes de uma conta de Instagram vinculada (só leitura; até 25). O Meta recusa se o token não tem acesso ao Instagram. */
export async function fetchIgMedia(token: string, igUserId: string, fetchImpl: typeof fetch = fetch): Promise<IgMediaHit[]> {
  const body = await graphGet<{ data?: Record<string, unknown>[] }>(`${igUserId}/media`, { fields: "id,caption,media_type,permalink,timestamp,thumbnail_url,media_url", limit: "25" }, token, fetchImpl);
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.filter((r) => typeof r.id === "string").map((r) => {
    const type = text(r.media_type, 20);
    const thumb = text(r.thumbnail_url, 800) || (type === "IMAGE" ? text(r.media_url, 800) : "");
    return { id: String(r.id), caption: text(r.caption, 120), type, permalink: text(r.permalink, 300), date: text(r.timestamp, 30), thumbnail: thumb.startsWith("https://") ? thumb : "" };
  });
}

/**
 * Fase J.4 — envio de vídeo EM PARTES (upload_phase start/transfer/finish) na conta de anúncio.
 * Cada função devolve o que o Meta respondeu; falhas viram mensagem clara (sem token).
 */
export function resumableVideoApi(token: string, externalId: string, name: string, fetchImpl: typeof fetch = fetch) {
  const path = `${act(externalId)}/advideos`;
  const fail = (body: Record<string, unknown>, status: number, what: string) => {
    const err = (body as MetaErrorBody).error as (MetaErrorBody["error"] & { error_user_msg?: string }) | undefined;
    return new Error(`O Meta recusou ${what} do vídeo "${name}": ${(err?.error_user_msg || err?.message || `HTTP ${status}`).slice(0, 300)}`);
  };
  const num = (v: unknown) => Number(typeof v === "string" || typeof v === "number" ? v : NaN);
  return {
    async start(fileSize: number) {
      const { status, body } = await graphPostRaw(path, { upload_phase: "start", file_size: String(fileSize) }, token, fetchImpl);
      if (status >= 400 || (body as MetaErrorBody).error) throw fail(body, status, "o início do envio");
      const r = { uploadSessionId: String(body.upload_session_id ?? ""), videoId: String(body.video_id ?? ""), startOffset: num(body.start_offset), endOffset: num(body.end_offset) };
      if (!r.uploadSessionId || !r.videoId || !Number.isFinite(r.startOffset) || !Number.isFinite(r.endOffset)) throw new Error(`O Meta não abriu o envio do vídeo "${name}".`);
      return r;
    },
    async transfer(uploadSessionId: string, startOffset: number, chunk: Uint8Array) {
      const { status, body } = await graphPostFile(path, { upload_phase: "transfer", upload_session_id: uploadSessionId, start_offset: String(startOffset) },
        { field: "video_file_chunk", bytes: chunk, name: "parte", mimeType: "application/octet-stream" }, token, fetchImpl);
      if (status >= 400 || (body as MetaErrorBody).error) throw fail(body, status, "uma parte");
      const r = { startOffset: num(body.start_offset), endOffset: num(body.end_offset) };
      if (!Number.isFinite(r.startOffset) || !Number.isFinite(r.endOffset)) throw new Error(`O Meta não confirmou a parte do vídeo "${name}".`);
      return r;
    },
    async finish(uploadSessionId: string) {
      const { status, body } = await graphPostRaw(path, { upload_phase: "finish", upload_session_id: uploadSessionId, title: name.slice(0, 100) }, token, fetchImpl);
      if (status >= 400 || (body as MetaErrorBody).error || body.success === false) throw fail(body, status, "o fim do envio");
    },
    async videoStatus(videoId: string) {
      const info = await graphGet<{ status?: { video_status?: string }; picture?: string }>(videoId, { fields: "status,picture" }, token, fetchImpl);
      return { status: info.status?.video_status ?? "", picture: typeof info.picture === "string" ? info.picture : "" };
    },
  };
}
