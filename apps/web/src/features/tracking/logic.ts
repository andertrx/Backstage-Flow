import { normalizeDomain } from "@backstage/shared";

/** Endereço público do script (fica no site do CRM, na Vercel). */
export const TRACKING_SCRIPT_URL = "https://web-ivory-three-49.vercel.app/t.js";

export type ContainerStatus = "ativo" | "pausado";
export type ConsentMode = "nao_exigir" | "aguardar_consentimento";

export const CONSENT_LABELS: Record<ConsentMode, string> = {
  nao_exigir: "Não exigir (coleta logo ao abrir o site)",
  aguardar_consentimento: "Aguardar o aceite de cookies do site",
};
export const RETENTION_OPTIONS = [90, 180, 365, 730] as const;
export const RETENTION_LABELS: Record<(typeof RETENTION_OPTIONS)[number], string> = {
  90: "3 meses",
  180: "6 meses",
  365: "1 ano",
  730: "2 anos",
};

export interface ContainerFormValues {
  client_id: string;
  name: string;
  domains: string;
  status: ContainerStatus;
  test_mode: boolean;
  consent_mode: ConsentMode;
  retention_days: number;
}

export interface ContainerInput {
  client_id: string;
  name: string;
  allowed_domains: string[];
  status: ContainerStatus;
  test_mode: boolean;
  consent_mode: ConsentMode;
  retention_days: number;
}

export const emptyContainerForm: ContainerFormValues = {
  client_id: "",
  name: "",
  domains: "",
  status: "ativo",
  test_mode: true,
  consent_mode: "nao_exigir",
  retention_days: 180,
};

/** Um domínio por linha (ou separados por vírgula). Limpa "https://", "www." é mantido. */
export function parseDomains(text: string): { domains: string[]; invalid: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\n,;\s]+/)) {
    if (!raw.trim()) continue;
    const d = normalizeDomain(raw);
    if (!d) invalid.push(raw.trim());
    else if (!domains.includes(d)) domains.push(d);
  }
  return { domains, invalid };
}

export function parseContainerForm(v: ContainerFormValues): { data: ContainerInput } | { error: string } {
  if (!v.client_id) return { error: "Escolha o cliente." };
  const name = v.name.trim();
  if (name.length < 2 || name.length > 80) return { error: "Informe o nome do site (2 a 80 caracteres)." };
  const { domains, invalid } = parseDomains(v.domains);
  if (invalid.length) return { error: `Domínio inválido: ${invalid.join(", ")}. Use só o endereço, ex.: loja.com.br` };
  if (domains.length === 0) return { error: "Informe pelo menos um domínio autorizado (ex.: loja.com.br)." };
  if (domains.length > 20) return { error: "No máximo 20 domínios por container." };
  return {
    data: {
      client_id: v.client_id,
      name,
      allowed_domains: domains,
      status: v.status,
      test_mode: v.test_mode,
      consent_mode: v.consent_mode,
      retention_days: v.retention_days,
    },
  };
}

/** Código para colar no site, antes de </head>. */
export function installSnippet(publicKey: string, consentMode: ConsentMode, scriptUrl = TRACKING_SCRIPT_URL): string {
  const consent = consentMode === "aguardar_consentimento" ? ' data-consent="aguardar"' : "";
  return `<script async src="${scriptUrl}" data-key="${publicKey}"${consent}></script>`;
}

export const EVENT_EXAMPLE = `<script>\n  window.bf = window.bf || function () { (window.bf.q = window.bf.q || []).push(arguments); };\n  bf("track", "Lead", { formulario: "contato" });\n</script>`;
export const CONSENT_EXAMPLE = `bf("consent", true);  // quando a pessoa aceitar os cookies`;

/**
 * Parâmetros de URL para colar nos anúncios. Os IDs do anúncio (bf_c, bf_s,
 * bf_a) permitem ligar a visita à campanha com certeza.
 */
export const META_URL_PARAMS =
  "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&bf_c={{campaign.id}}&bf_s={{adset.id}}&bf_a={{ad.id}}";
export const GOOGLE_TRACKING_TEMPLATE =
  "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&bf_c={campaignid}&bf_s={adgroupid}&bf_a={creative}";

export type PeriodPreset = "hoje" | "7d" | "30d";
export const PERIOD_LABELS: Record<PeriodPreset, string> = { hoje: "Hoje", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias" };

/** Período em horário local do navegador: de 00:00 do primeiro dia até agora. */
export function periodRange(preset: PeriodPreset, now = new Date()): { from: string; to: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (preset === "7d") start.setDate(start.getDate() - 6);
  if (preset === "30d") start.setDate(start.getDate() - 29);
  const end = new Date(now.getTime() + 60_000);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Soma as conversões dos sites visíveis. Receita fica separada por moeda (nunca somar BRL com USD). */
export function summarizeConversions(
  rows: { container_id: string; currency: string | null; leads: number; conversions: number; purchases: number; revenue_micros: number }[],
  visible: ReadonlySet<string>,
) {
  let leads = 0;
  let conversions = 0;
  let purchases = 0;
  const revenue = new Map<string, number>();
  for (const r of rows) {
    if (!visible.has(r.container_id)) continue;
    leads += Number(r.leads);
    conversions += Number(r.conversions);
    purchases += Number(r.purchases);
    if (r.currency) revenue.set(r.currency, (revenue.get(r.currency) ?? 0) + Number(r.revenue_micros));
  }
  return {
    leads,
    conversions,
    purchases,
    revenue: [...revenue.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, micros]) => ({ currency, micros })),
  };
}

/** Exemplos para a janela de instalação. */
export const PURCHASE_EXAMPLE = `bf("track", "Purchase", { value: 199.90, currency: "BRL", transaction_id: "PEDIDO-123" });`;
export const IDENTIFY_EXAMPLE =
  `bf("track", "Lead", { formulario: "orcamento" }, { email: "ana@exemplo.com", phone: "(45) 99999-8888", name: "Ana Souza" });\n` +
  `// O e-mail, o telefone e o nome são cifrados no navegador: só o código (hash) é enviado.`;

export function installSnippetWithOptions(
  publicKey: string,
  consentMode: ConsentMode,
  opts: { forms: boolean; pixelId?: string | null; waCode?: boolean },
  scriptUrl = TRACKING_SCRIPT_URL,
): string {
  let extra = "";
  if (opts.forms) extra += ' data-forms="lead"';
  if (opts.pixelId && /^\d{5,20}$/.test(opts.pixelId)) extra += ` data-pixel="${opts.pixelId}"`;
  if (opts.waCode) extra += ' data-wa-code="1"';
  return installSnippet(publicKey, consentMode, scriptUrl).replace("></script>", `${extra}></script>`);
}

// -----------------------------------------------------------------------------
// Meta CAPI (34.3)
// -----------------------------------------------------------------------------

export const CAPI_EVENT_OPTIONS = [
  "Lead", "CompleteRegistration", "SubmitApplication", "Schedule", "Purchase", "Contact", "ViewContent", "AddToCart", "InitiateCheckout", "PageView",
] as const;
export const DEFAULT_CAPI_EVENTS = ["Lead", "CompleteRegistration", "SubmitApplication", "Schedule", "Purchase", "Contact"];

export type CapiTone = "neutral" | "warning" | "danger" | "success";

/** Situação do envio ao Meta de um site, em português, para o card e a janela. */
export function capiStatus(
  dest: { has_token: boolean; enabled: boolean; test_event_code: string | null; last_success_at: string | null; last_error_at: string | null; last_error_message: string | null } | null | undefined,
  overview?: { pending: number; errors_24h: number } | null,
): { tone: CapiTone; label: string; detail: string } {
  if (!dest) return { tone: "neutral", label: "Não configurado", detail: "Informe o ID do Pixel e o token da API de Conversões." };
  if (!dest.has_token) return { tone: "warning", label: "Falta o token", detail: "Cole o token da API de Conversões para poder ligar o envio." };
  if (!dest.enabled) return { tone: "neutral", label: "Desligado", detail: "Os eventos não estão sendo enviados ao Meta." };
  const failing = dest.last_error_at != null && (dest.last_success_at == null || dest.last_error_at > dest.last_success_at);
  if (failing) return { tone: "danger", label: "Com erro", detail: dest.last_error_message ?? "O último envio falhou." };
  if (dest.test_event_code) {
    return { tone: "warning", label: "Ligado (teste)", detail: "Com código de teste: os eventos aparecem só em “Testar eventos” do Meta. Apague o código para valer de verdade." };
  }
  if (!dest.last_success_at) {
    return { tone: "warning", label: "Ligado, sem envio ainda", detail: overview && overview.pending > 0 ? "Há eventos na fila; o envio roda a cada minuto." : "Aguardando o primeiro evento do site." };
  }
  return { tone: "success", label: "Funcionando", detail: "Eventos chegando ao Meta pela API de Conversões." };
}

// -----------------------------------------------------------------------------
// WhatsApp (34.5-W)
// -----------------------------------------------------------------------------

export const WA_STATUS_LABELS = { clicado: "Só clicou", lead: "Lead", venda: "Venda" } as const;

/** "ref. k7q-2m9" → "K7Q2M9" (mesma regra do servidor). Inválido → null. */
export function normalizeWaCode(input: string): string | null {
  let c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length === 9 && c.startsWith("REF")) c = c.slice(3);
  return /^[2-9A-HJ-NP-Z]{6}$/.test(c) ? c : null;
}

/** Valor digitado ("1.234,56" ou "1234.56") → número. Inválido → null. */
export function parseMoneyInput(text: string): number | null {
  const t = text.trim().replace(/\s|R\$|US\$/g, "");
  if (!t) return null;
  const normalized = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// -----------------------------------------------------------------------------
// WhatsApp pela API oficial (34.5-W2)
// -----------------------------------------------------------------------------

export const WA_ORIGIN_LABELS = { anuncio_whatsapp: "Anúncio de WhatsApp", site: "Botão do site", desconhecida: "Direto no WhatsApp" } as const;
export const WA_CONVERSATION_STATUS_LABELS = { conversa: "Conversa", lead: "Lead", venda: "Venda" } as const;

/** Situação da conexão com a API oficial, em português. */
export function waConnectionStatus(
  conn: { has_app_secret: boolean; enabled: boolean; last_webhook_at: string | null; last_error_at: string | null; last_error_message: string | null } | null | undefined,
): { tone: CapiTone; label: string; detail: string } {
  if (!conn) return { tone: "neutral", label: "Não configurado", detail: "Para quem usa a API oficial do WhatsApp (WhatsApp Business Platform)." };
  if (!conn.has_app_secret) return { tone: "warning", label: "Falta o segredo do app", detail: "Cole o segredo do app do Meta para poder ligar." };
  if (!conn.enabled) return { tone: "neutral", label: "Desligado", detail: "As mensagens recebidas não estão sendo registradas." };
  const failing = conn.last_error_at != null && (conn.last_webhook_at == null || conn.last_error_at > conn.last_webhook_at);
  if (failing) return { tone: "danger", label: "Com erro", detail: conn.last_error_message ?? "O último aviso do Meta foi recusado." };
  if (!conn.last_webhook_at) return { tone: "warning", label: "Ligado, sem mensagem ainda", detail: "Aguardando a primeira mensagem. Confira se o webhook foi cadastrado no app do Meta." };
  return { tone: "success", label: "Funcionando", detail: "Mensagens chegando pela API oficial." };
}

/** IDs do Meta: só números. Devolve o erro em português ou null. */
export function validateWaIds(phoneNumberId: string, wabaId: string, appSecret: string, needsSecret: boolean): string | null {
  if (!/^\d{5,30}$/.test(phoneNumberId.trim())) return "O ID do número de telefone tem só números (WhatsApp → Configuração da API, abaixo do número).";
  if (!/^\d{5,30}$/.test(wabaId.trim())) return "O ID da conta do WhatsApp Business tem só números (WhatsApp → Configuração da API).";
  if (appSecret.trim() && !/^[A-Za-z0-9]{16,128}$/.test(appSecret.trim())) return "O segredo do app parece incompleto (Configurações do app → Básico → Chave secreta do app).";
  if (needsSecret && !appSecret.trim()) return "Cole o segredo do app do Meta antes de ligar (sem ele não dá para conferir que o aviso veio mesmo do Meta).";
  return null;
}

// -----------------------------------------------------------------------------
// Atribuição e qualidade (34.4)
// -----------------------------------------------------------------------------

export type AttributionModel = "last" | "first";
export const ATTRIBUTION_MODEL_LABELS: Record<AttributionModel, string> = { last: "Último contato", first: "Primeiro contato" };

export interface AttributionRowInput {
  client_id: string;
  channel: string | null;
  campaign_id: string | null;
  campaign_label: string | null;
  match: "id" | "nome" | "sem_conversao" | null;
  leads: number;
  purchases: number;
  confirmed: number;
  revenue: Record<string, number>;
  spend_currency: string | null;
  spend_micros: number | null;
  platform_leads: number | null;
  platform_conversions: number | null;
  platform_value_micros: number | null;
}

/** Custo por lead e ROAS só quando dá para calcular sem misturar moedas. */
export function attributionMetrics(r: AttributionRowInput): { costPerLeadMicros: number | null; roas: number | null } {
  const spend = Number(r.spend_micros ?? 0);
  const costPerLeadMicros = spend > 0 && r.leads > 0 ? Math.round(spend / r.leads) : null;
  const sameCurrencyRevenue = r.spend_currency ? Number(r.revenue[r.spend_currency] ?? 0) : 0;
  const roas = spend > 0 && sameCurrencyRevenue > 0 ? Math.round((sameCurrencyRevenue / spend) * 100) / 100 : null;
  return { costPerLeadMicros, roas };
}

/** Totais por canal. Receita separada por moeda (nunca soma BRL com USD). */
export function summarizeByChannel(rows: AttributionRowInput[]) {
  const map = new Map<string, { channel: string | null; leads: number; purchases: number; revenue: Record<string, number> }>();
  for (const r of rows) {
    if (r.leads === 0 && r.purchases === 0) continue;
    const key = r.channel ?? "";
    const acc = map.get(key) ?? { channel: r.channel, leads: 0, purchases: 0, revenue: {} };
    acc.leads += r.leads;
    acc.purchases += r.purchases;
    for (const [cur, v] of Object.entries(r.revenue)) acc.revenue[cur] = (acc.revenue[cur] ?? 0) + Number(v);
    map.set(key, acc);
  }
  return [...map.values()].sort((a, b) => b.leads + b.purchases - (a.leads + a.purchases));
}

export interface QualityInput {
  sessions: number;
  sessions_unknown: number;
  paid_sessions: number;
  paid_without_campaign_id: number;
  leads: number;
  leads_without_origin: number;
  leads_with_contact: number;
  purchases: number;
  purchases_without_order: number;
  purchases_without_lead: number;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part * 100) / total) : 0);

/**
 * Qualidade do tracking de um site, com os motivos em português.
 * Sem nota inventada: só "Boa", "Atenção" ou "Fraca", sempre com o porquê.
 */
export function qualityReport(q: QualityInput): { level: "sem_dados" | "boa" | "atencao" | "fraca"; label: string; reasons: { tone: "warning" | "danger" | "info"; text: string }[] } {
  const n = (v: number) => Number(v ?? 0);
  if (n(q.sessions) === 0 && n(q.leads) === 0 && n(q.purchases) === 0) {
    return { level: "sem_dados", label: "Sem dados no período", reasons: [{ tone: "info", text: "Nenhuma visita registrada no período. Confira se o código está instalado no site." }] };
  }
  const reasons: { tone: "warning" | "danger" | "info"; text: string }[] = [];
  const unknown = pct(n(q.sessions_unknown), n(q.sessions));
  if (unknown >= 50) reasons.push({ tone: "danger", text: `${unknown}% das visitas chegaram sem origem identificada.` });
  else if (unknown >= 25) reasons.push({ tone: "warning", text: `${unknown}% das visitas chegaram sem origem identificada.` });
  if (n(q.paid_without_campaign_id) > 0) {
    reasons.push({
      tone: pct(n(q.paid_without_campaign_id), n(q.paid_sessions)) >= 50 ? "danger" : "warning",
      text: `${n(q.paid_without_campaign_id)} de ${n(q.paid_sessions)} visitas de anúncio vieram sem o ID da campanha. Adicione bf_c={{campaign.id}} (Meta) ou bf_c={campaignid} (Google) no link do anúncio.`,
    });
  }
  if (n(q.leads_without_origin) > 0) {
    reasons.push({ tone: pct(n(q.leads_without_origin), n(q.leads)) >= 50 ? "danger" : "warning", text: `${n(q.leads_without_origin)} de ${n(q.leads)} leads sem origem identificada.` });
  }
  if (n(q.leads) > 0 && pct(n(q.leads_with_contact), n(q.leads)) < 50) {
    reasons.push({ tone: "warning", text: `Só ${pct(n(q.leads_with_contact), n(q.leads))}% dos leads têm e-mail ou telefone (cifrados). Com menos contato, o Meta reconhece menos pessoas.` });
  }
  if (n(q.purchases_without_order) > 0) {
    reasons.push({ tone: "warning", text: `${n(q.purchases_without_order)} de ${n(q.purchases)} compras sem nº do pedido (não dá para evitar contar duas vezes).` });
  }
  if (n(q.purchases_without_lead) > 0) {
    reasons.push({ tone: "info", text: `${n(q.purchases_without_lead)} compras sem lead identificado antes (a jornada fica incompleta).` });
  }
  const level = reasons.some((r) => r.tone === "danger") ? "fraca" : reasons.some((r) => r.tone === "warning") ? "atencao" : "boa";
  return { level, label: level === "fraca" ? "Fraca" : level === "atencao" ? "Atenção" : "Boa", reasons };
}
