/**
 * Fase 35.2 — lista de conferência do rascunho. Só LÊ o rascunho: não fala com o Meta.
 * "erro" impede de seguir para o Validar; "aviso" só chama atenção. O Meta ainda confirma tudo no Validar (passo 3).
 */
import { billingFor, DESTINATION_LABELS, destinationsFor, GOAL_REQUIRES, GOALS_BY_OBJECTIVE, leadsToWebsite, SPECIAL_AGE_MAX, SPECIAL_AGE_MIN } from "./catalog.ts";
import type { CampaignDraft } from "./model.ts";

export type CheckLevel = "erro" | "aviso";
export interface CheckItem {
  level: CheckLevel;
  /** Onde o problema está: "campanha", ou o id do conjunto/anúncio. */
  where: "campanha" | "conjunto" | "anuncio";
  refId?: string;
  message: string;
}

const secret = /EAA[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.|(senha|password|token|secret|api[_-]?key)\s*[:=]\s*\S{4,}/i;

function isHttps(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function checkDraft(d: CampaignDraft): CheckItem[] {
  const out: CheckItem[] = [];
  const err = (where: CheckItem["where"], message: string, refId?: string) => out.push({ level: "erro", where, message, refId });
  const warn = (where: CheckItem["where"], message: string, refId?: string) => out.push({ level: "aviso", where, message, refId });
  const c = d.campaign;

  if (c.name.trim().length < 2) err("campanha", "Dê um nome à campanha.");
  if (!c.objective) err("campanha", "Escolha o objetivo da campanha.");
  if (!c.status) err("campanha", "Escolha o status: Pausada ou Ativa. Não vem preenchido porque publicar gasta verba.");
  const budgetOnCampaign = c.budgetLevel === "campaign";
  if (budgetOnCampaign && !(c.budgetAmount && c.budgetAmount > 0)) err("campanha", "Informe o orçamento da campanha (maior que zero).");
  const special = c.specialAdCategories.length > 0;
  if (special) warn("campanha", "Categoria especial: o Meta trava idade (18–65), gênero e outros campos de público. O Validar confirma.");
  if (secret.test(JSON.stringify(d))) err("campanha", "Parece que há uma senha, token ou chave em algum campo. Retire antes de seguir.");
  if (d.advancedJson.trim()) {
    try {
      const v = JSON.parse(d.advancedJson);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("não é objeto");
    } catch {
      err("campanha", "O modo avançado precisa ser um JSON válido (um objeto).");
    }
  }

  if (d.adSets.length === 0) err("campanha", "Adicione pelo menos um conjunto de anúncios.");

  for (const s of d.adSets) {
    const label = s.name.trim() || "Conjunto sem nome";
    if (s.name.trim().length < 2) err("conjunto", `${label}: dê um nome ao conjunto.`, s.id);
    if (!s.optimizationGoal) err("conjunto", `${label}: escolha a meta de otimização.`, s.id);
    else {
      if (c.objective && !GOALS_BY_OBJECTIVE[c.objective].includes(s.optimizationGoal)) err("conjunto", `${label}: essa meta não combina com o objetivo escolhido.`, s.id);
      if (s.billingEvent && !billingFor(s.optimizationGoal).includes(s.billingEvent)) err("conjunto", `${label}: essa cobrança não combina com a meta.`, s.id);
      const need = GOAL_REQUIRES[s.optimizationGoal];
      if (need?.pixel && !s.pixelId.trim()) err("conjunto", `${label}: informe o pixel (ID) para essa meta.`, s.id);
      if (need?.customEvent && !s.customEvent) err("conjunto", `${label}: escolha o evento de conversão.`, s.id);
      if (need?.page && !s.pageId.trim()) err("conjunto", `${label}: informe a página (ID) para essa meta.`, s.id);
      const options = destinationsFor(s.optimizationGoal, c.objective);
      if (options.length && !options.includes(s.destinationType as never)) err("conjunto", `${label}: escolha para onde o anúncio leva (${options.map((o) => DESTINATION_LABELS[o]).join(", ")}).`, s.id);
    }
    if (!budgetOnCampaign && !(s.budgetAmount && s.budgetAmount > 0)) err("conjunto", `${label}: informe o orçamento do conjunto (maior que zero).`, s.id);
    if (budgetOnCampaign && s.budgetAmount) warn("conjunto", `${label}: o orçamento está na campanha; o do conjunto será ignorado.`, s.id);
    if (s.countries.length === 0) err("conjunto", `${label}: escolha pelo menos um país.`, s.id);
    if (s.ageMin < SPECIAL_AGE_MIN || s.ageMax > SPECIAL_AGE_MAX || s.ageMin > s.ageMax) err("conjunto", `${label}: idade deve ficar entre ${SPECIAL_AGE_MIN} e ${SPECIAL_AGE_MAX}, e a mínima não pode passar da máxima.`, s.id);
    if (special && (s.ageMin !== SPECIAL_AGE_MIN || s.ageMax !== SPECIAL_AGE_MAX || s.gender !== "all")) {
      err("conjunto", `${label}: com categoria especial, idade fica 18–65 e gênero "todos".`, s.id);
    }
    if (c.budgetType === "lifetime" && (budgetOnCampaign || s.budgetAmount)) {
      if (!s.endDate) err("conjunto", `${label}: orçamento vitalício exige data de término.`, s.id);
    }
    if (s.startDate && s.endDate && s.endDate < s.startDate) err("conjunto", `${label}: o término não pode ser antes do início.`, s.id);
    const ads = d.ads.filter((a) => a.adSetId === s.id);
    if (ads.length === 0) err("conjunto", `${label}: adicione pelo menos um anúncio.`, s.id);
  }

  for (const a of d.ads) {
    const set = d.adSets.find((s) => s.id === a.adSetId);
    const label = `${a.name.trim() || "Anúncio sem nome"}${set?.name ? ` (${set.name})` : ""}`;
    if (a.name.trim().length < 2) err("anuncio", `${label}: dê um nome ao anúncio.`, a.id);
    if (!a.pageId.trim()) err("anuncio", `${label}: informe a página (ID) que publica o anúncio.`, a.id);
    if (!a.primaryText.trim()) err("anuncio", `${label}: escreva o texto principal.`, a.id);
    const website = leadsToWebsite(set?.destinationType ?? "");
    if (website && !a.cta) err("anuncio", `${label}: escolha o botão (CTA).`, a.id);
    if (website) {
      if (!a.link.trim()) err("anuncio", `${label}: informe o link de destino.`, a.id);
      else if (!isHttps(a.link.trim())) err("anuncio", `${label}: o link precisa começar com https://.`, a.id);
    } else if (set?.destinationType === "ON_AD" && !a.leadFormId.trim()) {
      err("anuncio", `${label}: informe o ID do formulário de cadastro (o botão e o link o Meta monta).`, a.id);
    }
    if (a.headline.length > 40) warn("anuncio", `${label}: título com mais de 40 letras pode ser cortado.`, a.id);
    if (a.primaryText.length > 125) warn("anuncio", `${label}: texto principal acima de 125 letras será cortado com "ver mais".`, a.id);
    if (!a.instagramId.trim()) warn("anuncio", `${label}: sem Instagram, o anúncio sai só no Facebook.`, a.id);
  }
  return out;
}

export function checkSummary(items: CheckItem[]): { errors: number; warnings: number; ready: boolean } {
  const errors = items.filter((i) => i.level === "erro").length;
  return { errors, warnings: items.length - errors, ready: errors === 0 };
}
