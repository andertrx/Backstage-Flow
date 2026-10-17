// Etapa 39 — Inteligência de Resultados: regras da planilha (Google Sheets).
// Usadas pela tela e pelo servidor: ID da planilha, campos internos,
// sugestão de mapeamento das colunas e normalização dos perfis comerciais.

/** Campos internos que podem ser ligados a uma coluna da planilha (igual a private.ri_mapping_fields). */
export const RI_FIELDS = [
  "record_id", "contact_date", "contact_key", "profile", "account_id", "campaign_id", "campaign_name",
  "adset_id", "adset_name", "ad_id", "ad_name", "status", "sale_date", "sale_value",
] as const;
export type RiField = (typeof RI_FIELDS)[number];
export type RiMapping = Partial<Record<RiField, string>>;

export const RI_FIELD_LABELS: Record<RiField, { label: string; hint: string; group: "Contato" | "Origem" | "Venda" }> = {
  record_id: { label: "ID do contato", hint: "Identificador único da linha (ID do lead). Evita contar o mesmo contato duas vezes.", group: "Contato" },
  contact_date: { label: "Data do contato", hint: "Data em que o contato chegou. É a data usada nos filtros de período.", group: "Contato" },
  contact_key: { label: "Telefone ou e-mail", hint: "Usado só para contar contatos únicos. O CRM não guarda o número legível.", group: "Contato" },
  profile: { label: "Perfil comercial", hint: "Coluna que diz se é lojista, sacoleiro ou consumidor final. Obrigatória.", group: "Contato" },
  account_id: { label: "ID da conta de anúncios", hint: "", group: "Origem" },
  campaign_id: { label: "ID da campanha", hint: "Mais seguro que o nome (o nome pode mudar).", group: "Origem" },
  campaign_name: { label: "Nome da campanha", hint: "", group: "Origem" },
  adset_id: { label: "ID do conjunto de anúncios", hint: "", group: "Origem" },
  adset_name: { label: "Nome do conjunto de anúncios", hint: "", group: "Origem" },
  ad_id: { label: "ID do anúncio", hint: "", group: "Origem" },
  ad_name: { label: "Nome do anúncio ou criativo", hint: "", group: "Origem" },
  status: { label: "Status comercial", hint: "", group: "Venda" },
  sale_date: { label: "Data da venda", hint: "", group: "Venda" },
  sale_value: { label: "Valor da venda", hint: "", group: "Venda" },
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
  record_id: ["id", "id do lead", "lead id", "id lead", "id do contato", "codigo", "código"],
  contact_date: ["data", "data do contato", "data de entrada", "data do lead", "created time", "created_time", "data de criacao", "date"],
  contact_key: ["telefone", "whatsapp", "celular", "phone", "phone number", "phone_number", "email", "e-mail"],
  profile: ["perfil", "tipo de cliente", "tipo", "perfil comercial", "categoria", "segmento", "tipo de contato"],
  account_id: ["id da conta", "account id", "account_id", "conta de anuncios"],
  campaign_id: ["id da campanha", "campaign id", "campaign_id"],
  campaign_name: ["campanha", "nome da campanha", "campaign name", "campaign_name", "campaign"],
  adset_id: ["id do conjunto", "id do conjunto de anuncios", "ad set id", "adset id", "adset_id", "ad_set_id"],
  adset_name: ["conjunto", "conjunto de anuncios", "nome do conjunto", "ad set name", "adset name", "adset_name", "ad_set_name", "ad set"],
  ad_id: ["id do anuncio", "ad id", "ad_id"],
  ad_name: ["anuncio", "nome do anuncio", "criativo", "ad name", "ad_name", "ad"],
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
