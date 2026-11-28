/**
 * Criador de campanhas, Fase B — o que o "Publicar" já sabe criar no Meta e a conferência que vale SÓ para publicar.
 * Tudo é criado PAUSADO. Nada aqui fala com o Meta (isso é do servidor).
 */
import { type AdCta, GOAL_LABELS, leadsToWebsite, type OptimizationGoal } from "./catalog.ts";
import { checkDraft, type CheckItem } from "./checklist.ts";
import type { CampaignDraft } from "./model.ts";

/**
 * Metas que o Meta oferece mas o Publicar ainda não monta (exigem vídeo, post existente, evento, ligação, perfil ou dados do CRM).
 * Conversas (WhatsApp, Messenger, Direct) e Geração de leads (formulário no anúncio) já são publicadas.
 * Para as demais, crie no Gerenciador ou pelo Criador de Anúncios com o Claude.
 */
export const PUBLISH_UNSUPPORTED_GOALS: readonly OptimizationGoal[] = [
  "QUALITY_LEAD", "QUALITY_CALL", "REMINDERS_SET", "EVENT_RESPONSES", "PAGE_LIKES", "PROFILE_VISIT", "VISIT_INSTAGRAM_PROFILE",
  "POST_ENGAGEMENT", "THRUPLAY", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS",
];
/** Botões que exigem telefone (o Meta monta os de mensagem e de formulário sozinho a partir do destino). */
export const PUBLISH_UNSUPPORTED_CTAS: readonly AdCta[] = ["CALL_NOW"];

export const PUBLISH_MAX_ADSETS = 10;
export const PUBLISH_MAX_ADS = 30;

function isHttps(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Erros que impedem PUBLICAR (além dos da conferência comum). Cada texto diz o que fazer. */
export function checkPublishable(d: CampaignDraft): CheckItem[] {
  const out: CheckItem[] = [];
  const err = (where: CheckItem["where"], message: string, refId?: string) => out.push({ level: "erro", where, message, refId });
  if (d.adSets.length > PUBLISH_MAX_ADSETS) err("campanha", `Publicar aceita até ${PUBLISH_MAX_ADSETS} conjuntos por vez.`);
  if (d.ads.length > PUBLISH_MAX_ADS) err("campanha", `Publicar aceita até ${PUBLISH_MAX_ADS} anúncios por vez.`);
  if (d.advancedJson.trim()) err("campanha", "O modo avançado (JSON) ainda não é enviado ao publicar. Esvazie o campo ou aplique no Gerenciador.");
  for (const s of d.adSets) {
    const label = s.name.trim() || "Conjunto sem nome";
    if (s.optimizationGoal && PUBLISH_UNSUPPORTED_GOALS.includes(s.optimizationGoal)) {
      err("conjunto", `${label}: a meta "${GOAL_LABELS[s.optimizationGoal]}" ainda não é publicada por aqui. Escolha outra meta ou crie no Gerenciador de Anúncios.`, s.id);
    }
  }
  for (const a of d.ads) {
    const label = a.name.trim() || "Anúncio sem nome";
    if (!a.driveFileId) {
      if (!a.imageUrl.trim()) err("anuncio", `${label}: escolha a imagem no Google Drive (ou informe o endereço https:// dela).`, a.id);
      else if (!isHttps(a.imageUrl.trim())) err("anuncio", `${label}: o endereço da imagem precisa começar com https://.`, a.id);
    }
    const toWebsite = leadsToWebsite(d.adSets.find((s) => s.id === a.adSetId)?.destinationType ?? "");
    if (toWebsite && a.cta && PUBLISH_UNSUPPORTED_CTAS.includes(a.cta)) err("anuncio", `${label}: o botão "${a.cta}" ainda não é publicado por aqui. Escolha outro botão.`, a.id);
  }
  return out;
}

export interface PublishPlanCounts {
  campaigns: number;
  adSets: number;
  ads: number;
}

export function publishCounts(d: CampaignDraft): PublishPlanCounts {
  return { campaigns: 1, adSets: d.adSets.length, ads: d.ads.length };
}

/** Tudo o que impede publicar: conferência comum + regras do publicar. */
export function publishBlockers(d: CampaignDraft): CheckItem[] {
  return [...checkDraft(d).filter((i) => i.level === "erro"), ...checkPublishable(d)];
}
