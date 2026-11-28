/**
 * Fase J.3 — Biblioteca de textos do Criador: "pacotes" por cliente (tabela builder_copy_sets).
 * A esteira usa um pacote para preencher os textos padrão de uma vez. Nada aqui fala com o Meta.
 */
import { urlTagsProblem } from "./automations.ts";
import { AD_CTAS, type AdCta } from "./catalog.ts";
import { type EsteiraDraft, esteiraToWebsite, filledTexts } from "./esteira.ts";

export const COPY_SET_MAX_TEXTS = 5;
export const COPY_SET_MAX_MESSAGES = 10;

export interface CopySet {
  id: string;
  client_id: string;
  name: string;
  bodies: string[];
  titles: string[];
  description: string;
  link: string;
  cta: string;
  url_tags: string;
  /** Mensagens de abordagem do WhatsApp (guardadas para copiar; ainda não vão ao Meta). */
  messages: string[];
  version: number;
  archived_at: string | null;
  updated_at: string;
}

export interface CopySetInput {
  name: string;
  bodies: string[];
  titles: string[];
  description: string;
  link: string;
  cta: string;
  url_tags: string;
  messages: string[];
}

export const emptyCopySet = (): CopySetInput => ({ name: "", bodies: ["", "", ""], titles: ["", "", ""], description: "", link: "", cta: "", url_tags: "", messages: [""] });

/** O que impede salvar o pacote (a mesma regra do banco, para avisar antes). */
export function copySetProblems(s: CopySetInput): string[] {
  const out: string[] = [];
  const name = s.name.trim();
  if (name.length < 2 || name.length > 120) out.push("Dê um nome ao pacote (2 a 120 letras).");
  if (filledTexts(s.bodies).length > COPY_SET_MAX_TEXTS) out.push(`Até ${COPY_SET_MAX_TEXTS} textos.`);
  if (filledTexts(s.titles).length > COPY_SET_MAX_TEXTS) out.push(`Até ${COPY_SET_MAX_TEXTS} títulos.`);
  if (filledTexts(s.messages).length > COPY_SET_MAX_MESSAGES) out.push(`Até ${COPY_SET_MAX_MESSAGES} mensagens de abordagem.`);
  if (s.link.trim() && !/^https:\/\//.test(s.link.trim())) out.push("O link precisa começar com https://.");
  const tags = urlTagsProblem(s.url_tags.trim());
  if (tags) out.push(tags);
  if (s.description.length > 400) out.push("A descrição pode ter até 400 letras.");
  return out;
}

/** O que vai para o banco (sem vazios). */
export function copySetPayload(s: CopySetInput) {
  return {
    bodies: filledTexts(s.bodies), titles: filledTexts(s.titles), description: s.description.trim(), link: s.link.trim(),
    cta: /^[A-Z_]{0,40}$/.test(s.cta) ? s.cta : "", url_tags: s.url_tags.trim(), messages: filledTexts(s.messages),
  };
}

/** Usa o pacote como textos padrão da esteira. Link e botão só valem para conjunto de site; a UTM só se for válida. */
export function applyCopySet(d: EsteiraDraft, s: Pick<CopySet, "bodies" | "titles" | "description" | "link" | "cta" | "url_tags">): EsteiraDraft {
  const website = !d.target || esteiraToWebsite(d.target.destinationType);
  const ctas = AD_CTAS.map((c) => c.id) as string[];
  return {
    ...d,
    defaults: { bodies: s.bodies.length ? [...s.bodies] : d.defaults.bodies, titles: s.titles.length ? [...s.titles] : d.defaults.titles, description: s.description },
    link: website && s.link ? s.link : d.link,
    cta: website && ctas.includes(s.cta) ? (s.cta as AdCta) : d.cta,
    control: s.url_tags && !urlTagsProblem(s.url_tags) ? { ...d.control, urlTags: s.url_tags } : d.control,
  };
}

/** Textos padrão da esteira viram um pacote novo. */
export function copySetFromEsteira(d: EsteiraDraft, name: string): CopySetInput {
  return {
    name, bodies: filledTexts(d.defaults.bodies), titles: filledTexts(d.defaults.titles), description: d.defaults.description.trim(),
    link: d.link.trim(), cta: d.cta, url_tags: d.control.urlTags, messages: [],
  };
}
