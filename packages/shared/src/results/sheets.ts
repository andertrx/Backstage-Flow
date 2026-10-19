// Etapa 39 — Inteligência de Resultados: regras da planilha (Google Sheets).
// Usadas pela tela e pelo servidor: ID da planilha, campos internos,
// sugestão de mapeamento das colunas e normalização dos perfis comerciais.

/**
 * Campos internos que podem ser ligados a uma coluna da planilha (igual a private.ri_mapping_fields),
 * na ordem da tela. Parâmetros refeitos a pedido do Ander (19/10/2026): Nome, Número, SQL, Data,
 * UTMs, IDs, gclid e fbclid; os demais ficam em "Outros".
 */
export const RI_FIELDS = [
  "contact_name", "contact_key", "profile", "contact_date",
  "utm_source", "utm_medium", "campaign_name", "ad_name", "adset_name", "campaign_id", "adset_id", "ad_id", "gclid", "fbclid",
  "record_id", "account_id", "status", "sale_date", "sale_value",
] as const;
export type RiField = (typeof RI_FIELDS)[number];
/** Parâmetro personalizado: chave "x:" + nome dado na tela (até 40 letras), valor = coluna da planilha. */
export type RiCustomKey = `x:${string}`;
export type RiMapping = Partial<Record<RiField, string>> & { [key: RiCustomKey]: string };
export const RI_CUSTOM_PREFIX = "x:";
export const RI_MAX_CUSTOM = 20;

/** Parâmetros personalizados do mapeamento, na ordem em que foram criados. */
export function customParams(mapping: RiMapping): { key: RiCustomKey; label: string; column: string }[] {
  return Object.entries(mapping)
    .filter(([k, v]) => k.startsWith(RI_CUSTOM_PREFIX) && v)
    .map(([k, v]) => ({ key: k as RiCustomKey, label: k.slice(RI_CUSTOM_PREFIX.length), column: v as string }));
}

/** Nome válido para um parâmetro personalizado (1 a 40 letras, sem começar com espaço). null = inválido. */
export function customKey(label: string): RiCustomKey | null {
  const name = label.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 40 ? `x:${name}` : null;
}

export type RiFieldGroup = "Contato" | "Origem" | "Outros";
export const RI_FIELD_LABELS: Record<RiField, { label: string; hint: string; group: RiFieldGroup }> = {
  contact_name: { label: "Nome", hint: "Só para reconhecer a coluna. O CRM não guarda o nome.", group: "Contato" },
  contact_key: { label: "Número", hint: "Telefone (ou e-mail). Usado só para contar contatos únicos; o CRM não guarda o número legível.", group: "Contato" },
  profile: { label: "SQL", hint: "Coluna que diz se é lojista, sacoleiro ou consumidor final. Obrigatória.", group: "Contato" },
  contact_date: { label: "Data", hint: "Data em que o contato chegou. É a data usada nos filtros de período.", group: "Contato" },
  utm_source: { label: "utm_source", hint: "Origem do tráfego (ex.: facebook, instagram).", group: "Origem" },
  utm_medium: { label: "utm_medium", hint: "Tipo de tráfego (ex.: paid_social).", group: "Origem" },
  campaign_name: { label: "utm_campaign", hint: "Nome da campanha.", group: "Origem" },
  ad_name: { label: "utm_content", hint: "Nome do anúncio.", group: "Origem" },
  adset_name: { label: "utm_term", hint: "Nome do conjunto de anúncios.", group: "Origem" },
  campaign_id: { label: "campaign_id", hint: "ID da campanha (mais seguro que o nome).", group: "Origem" },
  adset_id: { label: "adset_id", hint: "ID do conjunto de anúncios.", group: "Origem" },
  ad_id: { label: "ad_id", hint: "ID do anúncio (o jeito mais seguro de ligar a linha).", group: "Origem" },
  gclid: { label: "gclid", hint: "Clique do Google: marca a linha como vinda do Google.", group: "Origem" },
  fbclid: { label: "fbclid", hint: "Clique do Meta: marca a linha como vinda do Meta.", group: "Origem" },
  record_id: { label: "ID do contato", hint: "Identificador único da linha (ID do lead). Evita contar o mesmo contato duas vezes.", group: "Outros" },
  account_id: { label: "ID da conta de anúncios", hint: "", group: "Outros" },
  status: { label: "Status comercial", hint: "", group: "Outros" },
  sale_date: { label: "Data da venda", hint: "", group: "Outros" },
  sale_value: { label: "Valor da venda", hint: "", group: "Outros" },
};

export const RI_PROFILES = ["lojista", "sacoleiro", "consumidor_final", "nao_identificado"] as const;
export type RiProfile = (typeof RI_PROFILES)[number];
export const RI_PROFILE_LABELS: Record<RiProfile, string> = {
  lojista: "Lojista",
  sacoleiro: "Sacoleiro",
  consumidor_final: "Consumidor final",
  nao_identificado: "Não identificado",
};

/**
 * ID da planilha a partir do link (https://docs.google.com/spreadsheets/d/<ID>/edit...)
 * ou do próprio ID colado. null = não reconhecido.
 */
export function parseSpreadsheetId(input: string): string | null {
  const text = input.trim();
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/.exec(text);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{20,100}$/.test(text) ? text : null;
}

/** Minúsculas, sem acentos e sem espaços repetidos: "  Sacoleira " → "sacoleira". */
export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

// Nomes de coluna comuns → campo interno (a sugestão sempre pode ser trocada na tela).
const SYNONYMS: Record<RiField, string[]> = {
  contact_name: ["nome", "name", "nome completo", "full name", "full_name", "nome do cliente", "nome do contato"],
  contact_key: ["numero", "telefone", "whatsapp", "celular", "phone", "phone number", "phone_number", "email", "e-mail"],
  profile: ["sql", "perfil de lojista (sql)", "perfil de lojista", "perfil", "tipo de cliente", "tipo", "perfil comercial", "categoria", "segmento", "tipo de contato"],
  contact_date: ["data", "data do contato", "data de entrada", "data do lead", "created time", "created_time", "data de criacao", "date"],
  utm_source: ["utm_source", "utm source", "origem", "source"],
  utm_medium: ["utm_medium", "utm medium", "medium", "midia"],
  campaign_name: ["utm_campaign", "utm campaign", "campanha", "nome da campanha", "campaign name", "campaign_name", "campaign"],
  ad_name: ["utm_content", "utm content", "anuncio", "nome do anuncio", "criativo", "ad name", "ad_name", "ad"],
  adset_name: ["utm_term", "utm term", "conjunto", "conjunto de anuncios", "nome do conjunto", "ad set name", "adset name", "adset_name", "ad_set_name", "ad set"],
  campaign_id: ["campaign_id", "id da campanha", "campaign id"],
  adset_id: ["adset_id", "id do conjunto", "id do conjunto de anuncios", "ad set id", "adset id", "ad_set_id"],
  ad_id: ["ad_id", "id do anuncio", "ad id"],
  gclid: ["gclid"],
  fbclid: ["fbclid", "fclid"],
  record_id: ["id", "id do lead", "lead id", "id lead", "id do contato", "codigo", "código"],
  account_id: ["id da conta", "account id", "account_id", "conta de anuncios"],
  status: ["status", "status comercial", "situacao", "etapa"],
  sale_date: ["data da venda", "sale date", "data venda"],
  sale_value: ["valor", "valor da venda", "valor venda", "sale value", "receita"],
};

/** Sugere um campo para cada cabeçalho reconhecido (cada coluna e cada campo usados uma vez só). */
export function suggestMapping(headers: string[]): RiMapping {
  const out: RiMapping = {};
  const used = new Set<string>();
  for (const field of RI_FIELDS) {
    const names = SYNONYMS[field];
    const hit = headers.find((h) => h.trim() && !used.has(h) && names.includes(normalizeText(h)));
    if (hit) {
      out[field] = hit;
      used.add(hit);
    }
  }
  return out;
}

/**
 * Regra sugerida para um valor da coluna de perfil: só os nomes exatos
 * (lojista, sacoleiro, consumidor final). Variações ("sacoleira", "loja física")
 * ficam para a pessoa confirmar — nada é juntado sozinho.
 */
export function suggestProfile(value: string): RiProfile | null {
  const v = normalizeText(value);
  if (v === "lojista") return "lojista";
  if (v === "sacoleiro") return "sacoleiro";
  if (v === "consumidor final") return "consumidor_final";
  return null;
}

/** Perfil de uma linha pelas regras do cliente. Vazio ou sem regra = não identificado. */
export function classifyProfile(value: unknown, rules: Record<string, string>): RiProfile {
  const v = normalizeText(value);
  if (!v) return "nao_identificado";
  const p = rules[v];
  return (RI_PROFILES as readonly string[]).includes(p ?? "") ? (p as RiProfile) : "nao_identificado";
}

/** Valores distintos de uma coluna (normalizados), com quantas linhas e um exemplo como está na planilha. */
export function distinctValues(rows: string[][], columnIndex: number, limit = 200): { value: string; example: string; count: number }[] {
  const map = new Map<string, { value: string; example: string; count: number }>();
  for (const row of rows) {
    const raw = String(row[columnIndex] ?? "").trim();
    const key = normalizeText(raw);
    const item = map.get(key) ?? { value: key, example: raw, count: 0 };
    item.count++;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, limit);
}
