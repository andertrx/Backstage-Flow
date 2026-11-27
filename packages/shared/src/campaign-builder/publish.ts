/**
 * Criador de campanhas, Fase B — o que o "Publicar" já sabe criar no Meta e a conferência que vale SÓ para publicar.
 * Tudo é criado PAUSADO. Nada aqui fala com o Meta (isso é do servidor).
 */
import { type AdCta, type OptimizationGoal } from "./catalog.ts";
import { checkDraft, type CheckItem } from "./checklist.ts";
import type { CampaignDraft } from "./model.ts";

/** Metas que exigem formulário ou destino de mensagem: o Publicar ainda não monta isso (crie no Gerenciador ou pelo Criador de Anúncios com o Claude). */
export const PUBLISH_UNSUPPORTED_GOALS: readonly OptimizationGoal[] = ["CONVERSATIONS", "LEAD_GENERATION", "QUALITY_LEAD"];
/** Botões que exigem destino de mensagem ou telefone. */
export const PUBLISH_UNSUPPORTED_CTAS: readonly AdCta[] = ["WHATSAPP_MESSAGE", "MESSAGE_PAGE", "CALL_NOW"];

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
      err("conjunto", `${label}: a meta "${s.optimizationGoal}" (mensagens ou formulário) ainda não é publicada por aqui. Escolha outra meta ou crie no Gerenciador.`, s.id);
    }
  }
  for (const a of d.ads) {
    const label = a.name.trim() || "Anúncio sem nome";
    if (!a.driveFileId) {
      if (!a.imageUrl.trim()) err("anuncio", `${label}: escolha a imagem no Google Drive (ou informe o endereço https:// dela).`, a.id);
      else if (!isHttps(a.imageUrl.trim())) err("anuncio", `${label}: o endereço da imagem precisa começar com https://.`, a.id);
    }
    if (a.cta && PUBLISH_UNSUPPORTED_CTAS.includes(a.cta)) err("anuncio", `${label}: o botão "${a.cta}" ainda não é publicado por aqui. Escolha outro botão.`, a.id);
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
