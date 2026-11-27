/**
 * Criador de campanhas, Fase B — PUBLICAR no Meta: monta e cria, em ordem, campanha → conjuntos → (criativo + anúncio) de cada anúncio.
 * Tudo é criado PAUSADO. Para no primeiro erro (o que já foi criado fica registrado e continua pausado) e, no fim, RELÊ cada objeto no Meta
 * para confirmar o que existe. Sem banco aqui: quem chama grava o andamento (`onItem`), o que permite testar com um Meta simulado.
 */
import type { CampaignDraft, DraftAd, DraftAdSet } from "../../../../../packages/shared/src/campaign-builder/model.ts";
import { currencyOffset } from "./builder.ts";

export type ItemKind = "campanha" | "conjunto" | "criativo" | "anuncio";
export interface PlanItem {
  kind: ItemKind;
  localId: string;
  name: string;
  position: number;
}

/** Ordem de criação: a campanha, os conjuntos e, para cada anúncio, o criativo e o anúncio. */
export function buildPlan(d: CampaignDraft): PlanItem[] {
  const items: Omit<PlanItem, "position">[] = [{ kind: "campanha", localId: "campaign", name: d.campaign.name }];
  for (const s of d.adSets) items.push({ kind: "conjunto", localId: s.id, name: s.name });
  for (const a of d.ads) {
    items.push({ kind: "criativo", localId: a.id, name: a.name });
    items.push({ kind: "anuncio", localId: a.id, name: a.name });
  }
  return items.map((x, i) => ({ ...x, position: i }));
}

export interface ItemResult {
  status: "criado" | "falhou" | "pulado";
  metaId?: string;
  errorCode?: number | null;
  errorMessage?: string;
  confirmed?: boolean;
  effectiveStatus?: string | null;
}

export interface PublishDeps {
  post(path: string, fields: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }>;
  get(path: string, params: Record<string, string>): Promise<Record<string, unknown>>;
}

export interface Audiences {
  /** IDs de públicos personalizados da conta. */
  custom: Set<string>;
  /** Públicos salvos: id → a segmentação dele (lida do Meta). */
  saved: Map<string, Record<string, unknown>>;
}

export interface PublishCtx {
  externalId: string;
  currency: string;
  timezone: string;
  draft: CampaignDraft;
  audiences: Audiences;
  /** Imagens do Drive já enviadas ao Meta: id do arquivo no Drive → hash da imagem no Meta. */
  imageHashes?: Map<string, string>;
}

const act = (externalId: string) => `act_${externalId.replace(/^act_/, "")}`;

/** "2026-12-01" + hora → ISO com o deslocamento do fuso da conta (o Meta lê o horário no fuso informado). */
export function zonedIso(date: string, time: string, timeZone: string): string {
  let offset = "+00:00";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date(`${date}T12:00:00Z`));
    const v = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(v);
    if (m) offset = `${m[1]}:${m[2] ?? "00"}`;
  } catch {
    /* fuso desconhecido: segue em UTC */
  }
  return `${date}T${time}${offset}`;
}

const minor = (amount: number, currency: string) => String(Math.round(amount * currencyOffset(currency)));

export function campaignFields(d: CampaignDraft, currency: string): Record<string, string> {
  const c = d.campaign;
  const f: Record<string, string> = {
    name: c.name, objective: c.objective, status: "PAUSED", special_ad_categories: JSON.stringify(c.specialAdCategories),
  };
  if (c.budgetLevel === "campaign" && c.budgetAmount && c.budgetAmount > 0) {
    f[c.budgetType === "lifetime" ? "lifetime_budget" : "daily_budget"] = minor(c.budgetAmount, currency);
    f.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  } else {
    f.is_adset_budget_sharing_enabled = "false";
  }
  return f;
}

export function adSetFields(s: DraftAdSet, campaignId: string, ctx: PublishCtx): Record<string, string> {
  const d = ctx.draft;
  const c = d.campaign;
  const f: Record<string, string> = {
    name: s.name, campaign_id: campaignId, optimization_goal: s.optimizationGoal, billing_event: s.billingEvent || "IMPRESSIONS", status: "PAUSED",
  };
  if (c.budgetLevel === "adset" && s.budgetAmount && s.budgetAmount > 0) {
    f[c.budgetType === "lifetime" ? "lifetime_budget" : "daily_budget"] = minor(s.budgetAmount, ctx.currency);
    f.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }
  if (s.startDate) f.start_time = zonedIso(s.startDate, "00:00:00", ctx.timezone);
  if (s.endDate) f.end_time = zonedIso(s.endDate, "23:59:59", ctx.timezone);

  // Públicos: personalizados entram como `custom_audiences`; um público SALVO entra como a segmentação base dele (só um por conjunto).
  const saved = s.audienceIds.filter((id) => ctx.audiences.saved.has(id));
  if (saved.length > 1) throw new Error("Escolha no máximo um público salvo por conjunto.");
  const customIds = s.audienceIds.filter((id) => ctx.audiences.custom.has(id));
  const unknown = s.audienceIds.filter((id) => !ctx.audiences.custom.has(id) && !ctx.audiences.saved.has(id));
  if (unknown.length) throw new Error("Um dos públicos escolhidos não existe mais na conta. Atualize a lista e escolha de novo.");
  const targeting: Record<string, unknown> = { ...(saved[0] ? ctx.audiences.saved.get(saved[0])! : {}) };
  targeting.geo_locations = { countries: s.countries };
  targeting.age_min = s.ageMin;
  targeting.age_max = s.ageMax;
  if (s.gender === "male") targeting.genders = [1];
  else if (s.gender === "female") targeting.genders = [2];
  else delete targeting.genders;
  if (customIds.length) targeting.custom_audiences = customIds.map((id) => ({ id }));
  targeting.targeting_automation = { advantage_audience: 0 };
  f.targeting = JSON.stringify(targeting);

  if ((s.optimizationGoal === "OFFSITE_CONVERSIONS" || s.optimizationGoal === "VALUE") && s.pixelId) {
    f.promoted_object = JSON.stringify({ pixel_id: s.pixelId, custom_event_type: s.customEvent || "OTHER" });
  } else if (s.optimizationGoal === "POST_ENGAGEMENT") {
    const page = d.ads.find((a) => a.adSetId === s.id)?.pageId || s.pageId;
    if (page) f.promoted_object = JSON.stringify({ page_id: page });
  }
  return f;
}

export function creativeFields(a: DraftAd, imageHash?: string): Record<string, string> {
  const link: Record<string, unknown> = { message: a.primaryText, link: a.link };
  if (imageHash) link.image_hash = imageHash;
  else link.picture = a.imageUrl;
  if (a.headline) link.name = a.headline;
  if (a.description) link.description = a.description;
  if (a.cta && a.cta !== "NO_BUTTON") link.call_to_action = { type: a.cta, value: { link: a.link } };
  const story: Record<string, unknown> = { page_id: a.pageId, link_data: link };
  if (a.instagramId) story.instagram_user_id = a.instagramId;
  return { name: a.name, object_story_spec: JSON.stringify(story) };
}

export function adFields(a: DraftAd, adSetId: string, creativeId: string): Record<string, string> {
  return { name: a.name, adset_id: adSetId, creative: JSON.stringify({ creative_id: creativeId }), status: "PAUSED" };
}

type MetaErr = { message?: string; code?: number; error_user_title?: string; error_user_msg?: string };
function failure(body: Record<string, unknown>, status: number): { message: string; code: number | null } {
  const e = (body.error ?? {}) as MetaErr;
  const user = [e.error_user_title, e.error_user_msg].filter(Boolean).join(": ");
  return { message: (user || e.message || `O Meta recusou (HTTP ${status}).`).slice(0, 600), code: typeof e.code === "number" ? e.code : null };
}

export type PublishOutcome = "concluida" | "parcial" | "falhou";

/**
 * Cria tudo em ordem. `onItem(posição, resultado)` é chamado a cada passo (quem chama grava no banco).
 * Para no primeiro erro: o resto vira "pulado". No fim relê cada objeto criado.
 */
export async function runPublish(deps: PublishDeps, ctx: PublishCtx, onItem: (position: number, r: ItemResult) => Promise<void>): Promise<PublishOutcome> {
  const d = ctx.draft;
  const plan = buildPlan(d);
  const base = act(ctx.externalId);
  const created = new Map<number, string>();
  const adSetIds = new Map<string, string>();
  const creativeIds = new Map<string, string>();
  let stopped = false;

  for (const item of plan) {
    if (stopped) { await onItem(item.position, { status: "pulado" }); continue; }
    try {
      let path: string;
      let fields: Record<string, string>;
      if (item.kind === "campanha") {
        path = `${base}/campaigns`;
        fields = campaignFields(d, ctx.currency);
      } else if (item.kind === "conjunto") {
        const s = d.adSets.find((x) => x.id === item.localId)!;
        path = `${base}/adsets`;
        fields = adSetFields(s, created.get(0)!, ctx);
      } else if (item.kind === "criativo") {
        const a = d.ads.find((x) => x.id === item.localId)!;
        path = `${base}/adcreatives`;
        const hash = a.driveFileId ? ctx.imageHashes?.get(a.driveFileId) : undefined;
        if (a.driveFileId && !hash) throw new Error("A imagem do Drive deste anúncio não foi enviada ao Meta.");
        fields = creativeFields(a, hash);
      } else {
        const a = d.ads.find((x) => x.id === item.localId)!;
        path = `${base}/ads`;
        fields = adFields(a, adSetIds.get(a.adSetId)!, creativeIds.get(a.id)!);
      }
      const r = await deps.post(path, fields);
      const id = typeof r.body.id === "string" ? r.body.id : "";
      if (r.status >= 400 || !id) {
        const f = failure(r.body, r.status);
        await onItem(item.position, { status: "falhou", errorCode: f.code, errorMessage: f.message });
        stopped = true;
        continue;
      }
      created.set(item.position, id);
      if (item.kind === "conjunto") adSetIds.set(item.localId, id);
      if (item.kind === "criativo") creativeIds.set(item.localId, id);
      await onItem(item.position, { status: "criado", metaId: id });
    } catch (err) {
      await onItem(item.position, { status: "falhou", errorCode: null, errorMessage: (err instanceof Error ? err.message : "Erro ao montar este item.").slice(0, 600) });
      stopped = true;
    }
  }

  // Confirmação por releitura: o que o Meta diz que existe agora.
  for (const item of plan) {
    const id = created.get(item.position);
    if (!id) continue;
    try {
      const got = await deps.get(id, { fields: "id,name,status,effective_status" });
      const status = typeof got.status === "string" ? got.status : null;
      const confirmed = got.id === id && (item.kind === "criativo" || status === "PAUSED");
      await onItem(item.position, { status: "criado", metaId: id, confirmed, effectiveStatus: typeof got.effective_status === "string" ? got.effective_status : status });
    } catch {
      await onItem(item.position, { status: "criado", metaId: id, confirmed: false });
    }
  }

  if (created.size === 0) return "falhou";
  return created.size === plan.length ? "concluida" : "parcial";
}
