/**
 * Fase J.2 — Esteira de criativos: cria criativo + anúncio (PAUSADO) dentro de um conjunto que JÁ EXISTE no Meta.
 * O conjunto e a campanha nunca são alterados. Sem banco aqui: quem chama grava o andamento (`onItem`), o que permite testar com um Meta simulado.
 *
 * Formatos (todos lidos de anúncios reais do Ander):
 *  - 1 arquivo e 1 texto: object_story_spec com video_data/link_data (o de sempre).
 *  - 1 arquivo e vários textos: object_story_spec + asset_feed_spec { bodies, titles, optimization_type: "DEGREES_OF_FREEDOM" }.
 *  - 2 arquivos (Feed + vertical): asset_feed_spec com os dois vídeos (ou imagens), os textos e títulos, e regras por posicionamento
 *    (optimization_type: "PLACEMENT"): o vertical em Stories/Reels, o outro no resto. Igual ao criativo "Moda Masculina no Atacado" (Vonks).
 */
import {
  type AutomationsCheck, enabledFeatures, VERTICAL_PLACEMENTS,
} from "../../../../../packages/shared/src/campaign-builder/automations.ts";
import { esteiraPlan, esteiraToWebsite, type EsteiraDraft, type EsteiraItem, type EsteiraMedia, filledTexts } from "../../../../../packages/shared/src/campaign-builder/esteira.ts";
import { controlFields, failure, type ItemResult, type PublishDeps, type PublishOutcome } from "./publish.ts";

export const WHATSAPP_LINK = "https://api.whatsapp.com/send";

/** Plataformas da regra "resto" quando o conjunto usa posicionamentos automáticos. */
export const FALLBACK_PLATFORMS = ["facebook", "instagram", "audience_network", "messenger"];

interface Cta { type: string; value?: Record<string, string> }

/** Botão e link de cada destino. WhatsApp segue o formato dos anúncios reais do Ander (link api.whatsapp.com/send). */
export function destinationCta(d: EsteiraDraft): { cta: Cta; link: string } {
  const dest = d.target?.destinationType ?? "";
  if (dest === "WHATSAPP") return { cta: { type: "WHATSAPP_MESSAGE", value: { link: WHATSAPP_LINK } }, link: WHATSAPP_LINK };
  if (dest === "MESSENGER") return { cta: { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER" } }, link: "https://fb.me/" };
  if (dest === "INSTAGRAM_DIRECT") return { cta: { type: "INSTAGRAM_MESSAGE", value: { app_destination: "INSTAGRAM_DIRECT" } }, link: "https://fb.me/" };
  if (!esteiraToWebsite(dest)) throw new Error(`O destino "${dest}" do conjunto não é aceito pela esteira.`);
  return { cta: { type: d.cta || "LEARN_MORE", value: { link: d.link.trim() } }, link: d.link.trim() };
}

function mediaOf(m: EsteiraMedia): string {
  if (m.kind === "video" ? !m.metaVideoId || !m.metaThumb : !m.metaHash) throw new Error(`O arquivo "${m.name}" ainda não foi enviado ao Meta.`);
  return m.kind;
}

/** Campos do criativo de um item da esteira. `restPlatforms`: plataformas da regra "resto" (as do conjunto, ou todas se forem automáticas). */
export function esteiraCreativeFields(d: EsteiraDraft, item: EsteiraItem, restPlatforms: string[] = FALLBACK_PLATFORMS): Record<string, string> {
  const { cta, link } = destinationCta(d);
  const bodies = filledTexts(item.bodies);
  const titles = filledTexts(item.titles);
  const description = item.description.trim();
  if (!bodies.length) throw new Error(`"${item.name}": escreva pelo menos um texto principal.`);
  const identity: Record<string, string> = { page_id: d.pageId };
  if (d.instagramId) identity.instagram_user_id = d.instagramId;
  const base = { name: item.name.slice(0, 255), ...controlFields(d.control) };

  if (item.feed && item.vertical) {
    // Dois arquivos: um criativo só, com regras por posicionamento. Cada texto, título e link vale nas duas regras (rótulos V e R).
    const kind = mediaOf(item.feed);
    if (mediaOf(item.vertical) !== kind) throw new Error(`"${item.name}": os dois arquivos precisam ser do mesmo tipo.`);
    const both = [{ name: "bf_vertical" }, { name: "bf_resto" }];
    const asset = (m: EsteiraMedia, label: string) => (kind === "video"
      ? { video_id: m.metaVideoId, thumbnail_url: m.metaThumb, adlabels: [{ name: label }] }
      : { hash: m.metaHash, adlabels: [{ name: label }] });
    const spec: Record<string, unknown> = {
      [kind === "video" ? "videos" : "images"]: [asset(item.vertical, "bf_m_vertical"), asset(item.feed, "bf_m_resto")],
      bodies: bodies.map((text) => ({ text, adlabels: both.map((l) => ({ name: `${l.name}_texto` })) })),
      titles: titles.map((text) => ({ text, adlabels: both.map((l) => ({ name: `${l.name}_titulo` })) })),
      link_urls: [{ website_url: link, adlabels: both.map((l) => ({ name: `${l.name}_link` })) }],
      call_to_action_types: [cta.type],
      ad_formats: [kind === "video" ? "SINGLE_VIDEO" : "SINGLE_IMAGE"],
      optimization_type: "PLACEMENT",
      asset_customization_rules: [
        rule(1, { publisher_platforms: [...VERTICAL_PLACEMENTS.publisher_platforms], facebook_positions: [...VERTICAL_PLACEMENTS.facebook_positions], instagram_positions: [...VERTICAL_PLACEMENTS.instagram_positions] }, kind, "bf_vertical", "bf_m_vertical", titles.length > 0),
        rule(2, { publisher_platforms: restPlatforms }, kind, "bf_resto", "bf_m_resto", titles.length > 0),
      ],
    };
    // Descrição fica de fora com dois arquivos: o formato que o Meta aceitou (anúncio real da Vonks) não tem descrição. A conferência avisa.
    if (!titles.length) delete spec.titles;
    return { ...base, object_story_spec: JSON.stringify(identity), asset_feed_spec: JSON.stringify(spec) };
  }

  // Um arquivo: o formato de sempre, com a primeira opção de texto; as outras vão em asset_feed_spec (várias opções de texto).
  const m = (item.feed ?? item.vertical)!;
  const kind = mediaOf(m);
  const story: Record<string, unknown> = { ...identity };
  if (kind === "video") {
    const v: Record<string, unknown> = { video_id: m.metaVideoId, image_url: m.metaThumb, message: bodies[0], call_to_action: cta };
    if (titles[0]) v.title = titles[0];
    if (description) v.link_description = description;
    story.video_data = v;
  } else {
    const l: Record<string, unknown> = { image_hash: m.metaHash, link, message: bodies[0], call_to_action: cta };
    if (titles[0]) l.name = titles[0];
    if (description) l.description = description;
    story.link_data = l;
  }
  const out: Record<string, string> = { ...base, object_story_spec: JSON.stringify(story) };
  if (bodies.length > 1 || titles.length > 1) {
    const spec: Record<string, unknown> = { bodies: bodies.map((text) => ({ text })), optimization_type: "DEGREES_OF_FREEDOM" };
    if (titles.length) spec.titles = titles.map((text) => ({ text }));
    out.asset_feed_spec = JSON.stringify(spec);
  }
  return out;
}

function rule(priority: number, placements: Record<string, string[]>, kind: string, label: string, mediaLabel: string, hasTitles: boolean) {
  const r: Record<string, unknown> = {
    priority,
    customization_spec: placements,
    [kind === "video" ? "video_label" : "image_label"]: { name: mediaLabel },
    body_label: { name: `${label}_texto` },
    link_url_label: { name: `${label}_link` },
  };
  if (hasTitles) r.title_label = { name: `${label}_titulo` };
  return r;
}

export interface EsteiraCtx {
  externalId: string;
  draft: EsteiraDraft;
  /** Plataformas do conjunto (lidas do Meta). Vazio = posicionamentos automáticos. */
  adSetPlatforms: string[];
}

const act = (externalId: string) => `act_${externalId.replace(/^act_/, "")}`;

/** Cria criativo e anúncio de cada item, em ordem. Para no primeiro erro; no fim relê cada objeto no Meta. */
export async function runEsteira(deps: PublishDeps, ctx: EsteiraCtx, onItem: (position: number, r: ItemResult) => Promise<void>): Promise<PublishOutcome> {
  const d = ctx.draft;
  const adSetId = d.target?.adSetId;
  if (!adSetId) throw new Error("Escolha o conjunto antes de subir.");
  const plan = esteiraPlan(d);
  const base = act(ctx.externalId);
  const created = new Map<number, string>();
  const creativeIds = new Map<string, string>();
  const rest = ctx.adSetPlatforms.length ? ctx.adSetPlatforms : FALLBACK_PLATFORMS;
  let stopped = false;

  for (const p of plan) {
    if (stopped) { await onItem(p.position, { status: "pulado" }); continue; }
    const item = d.items.find((x) => x.id === p.localId)!;
    try {
      const fields = p.kind === "criativo"
        ? esteiraCreativeFields(d, item, rest)
        : { name: item.name.slice(0, 255), adset_id: adSetId, creative: JSON.stringify({ creative_id: creativeIds.get(item.id) }), status: "PAUSED" };
      const r = await deps.post(`${base}/${p.kind === "criativo" ? "adcreatives" : "ads"}`, fields);
      const id = typeof r.body.id === "string" ? r.body.id : "";
      if (r.status >= 400 || !id) {
        const f = failure(r.body, r.status);
        await onItem(p.position, { status: "falhou", errorCode: f.code, errorMessage: f.message });
        stopped = true;
        continue;
      }
      created.set(p.position, id);
      if (p.kind === "criativo") creativeIds.set(item.id, id);
      await onItem(p.position, { status: "criado", metaId: id });
    } catch (err) {
      await onItem(p.position, { status: "falhou", errorCode: null, errorMessage: (err instanceof Error ? err.message : "Erro ao montar este item.").slice(0, 600) });
      stopped = true;
    }
  }

  for (const p of plan) {
    const id = created.get(p.position);
    if (!id) continue;
    try {
      const got = await deps.get(id, { fields: `id,name,status,effective_status${p.kind === "criativo" ? ",degrees_of_freedom_spec" : ""}` });
      const status = typeof got.status === "string" ? got.status : null;
      const automations: AutomationsCheck | undefined = p.kind === "criativo" ? { kind: "criativo", ligadas: enabledFeatures(got.degrees_of_freedom_spec) } : undefined;
      await onItem(p.position, {
        status: "criado", metaId: id, confirmed: got.id === id && (p.kind === "criativo" || status === "PAUSED"),
        effectiveStatus: typeof got.effective_status === "string" ? got.effective_status : status, automations,
      });
    } catch {
      await onItem(p.position, { status: "criado", metaId: id, confirmed: false });
    }
  }
  if (created.size === 0) return "falhou";
  return created.size === plan.length ? "concluida" : "parcial";
}

/** Anúncio-modelo: tira do criativo de um anúncio que já existe a página, o Instagram, os textos, os títulos, o link e o botão. */
export function templateFromCreative(creative: Record<string, unknown>) {
  const oss = (creative.object_story_spec ?? {}) as Record<string, unknown>;
  const afs = (creative.asset_feed_spec ?? {}) as Record<string, unknown>;
  const ld = (oss.link_data ?? {}) as Record<string, unknown>;
  const vd = (oss.video_data ?? {}) as Record<string, unknown>;
  const s = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => s((x as { text?: unknown })?.text, max)).filter(Boolean) : []);
  const ctaObj = ((ld.call_to_action ?? vd.call_to_action) ?? {}) as { type?: unknown; value?: { link?: unknown } };
  const bodies = list(afs.bodies, 2000);
  const titles = list(afs.titles, 255);
  const descriptions = list(afs.descriptions, 400);
  const linkUrls = Array.isArray(afs.link_urls) ? (afs.link_urls as { website_url?: unknown }[]).map((x) => s(x?.website_url)).filter(Boolean) : [];
  const ctaTypes = Array.isArray(afs.call_to_action_types) ? (afs.call_to_action_types as unknown[]).map((x) => s(x, 40)) : [];
  return {
    pageId: s(oss.page_id, 40),
    instagramId: s(oss.instagram_user_id, 40),
    bodies: (bodies.length ? bodies : [s(ld.message) || s(vd.message)].filter(Boolean)).slice(0, 5),
    titles: (titles.length ? titles : [s(ld.name, 255) || s(vd.title, 255)].filter(Boolean)).slice(0, 5),
    description: descriptions[0] ?? (s(ld.description, 400) || s(vd.link_description, 400)),
    link: s(ld.link) || s(ctaObj.value?.link) || linkUrls[0] || "",
    cta: s(ctaObj.type, 40) || ctaTypes[0] || "",
    urlTags: s(creative.url_tags, 500),
  };
}
