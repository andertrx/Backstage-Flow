import { normalizeDomain } from "@backstage/shared";
import { formatDataCurta } from "@/lib/format.ts";

/** Endereço público do script (fica no site do CRM, na Vercel). */
export const TRACKING_SCRIPT_URL = "https://www.backstageflow.com.br/t.js";

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
  opts: { forms: boolean; pixelId?: string | null; waCode?: boolean; clicks?: boolean; fields?: boolean },
  scriptUrl = TRACKING_SCRIPT_URL,
): string {
  let extra = "";
  if (opts.forms) extra += ' data-forms="lead"';
  if (opts.pixelId && /^\d{5,20}$/.test(opts.pixelId)) extra += ` data-pixel="${opts.pixelId}"`;
  if (opts.waCode) extra += ' data-wa-code="1"';
  if (opts.clicks) extra += ' data-clicks="on"';
  if (opts.fields) extra += ' data-fields="on"';
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
  conn: {
    has_app_secret: boolean; enabled: boolean; last_webhook_at: string | null; last_error_at: string | null; last_error_message: string | null;
    mode?: "manual" | "coexistencia" | "nao_oficial";
    has_inbound_key?: boolean;
  } | null | undefined,
): { tone: CapiTone; label: string; detail: string } {
  if (!conn) return { tone: "neutral", label: "Não configurado", detail: "Para quem usa a API oficial do WhatsApp (WhatsApp Business Platform)." };
  // T4.2: ligado pelo cadastro oficial (Coexistence) usa o segredo do app da agência, não um por número.
  // T5.3: servidor não oficial usa a chave do endereço, não o segredo do app do Meta.
  if (conn.mode === "nao_oficial" && !conn.enabled) return { tone: "neutral", label: "Servidor: desligado", detail: "As mensagens recebidas não estão sendo registradas." };
  if (conn.mode === "nao_oficial" && !conn.last_webhook_at) return { tone: "warning", label: "Servidor: aguardando mensagem", detail: "Ligado. Aguardando a primeira mensagem do servidor de WhatsApp." };
  if (conn.mode === "nao_oficial") return { tone: "success", label: "Servidor: funcionando", detail: "Mensagens chegando pelo servidor de WhatsApp (não oficial)." };
  if (!conn.has_app_secret && conn.mode !== "coexistencia") return { tone: "warning", label: "Falta o segredo do app", detail: "Cole o segredo do app do Meta para poder ligar." };
  if (!conn.enabled) return { tone: "neutral", label: "Desligado", detail: "As mensagens recebidas não estão sendo registradas." };
  const failing = conn.last_error_at != null && (conn.last_webhook_at == null || conn.last_error_at > conn.last_webhook_at);
  if (failing) return { tone: "danger", label: "Com erro", detail: conn.last_error_message ?? "O último aviso do Meta foi recusado." };
  if (!conn.last_webhook_at) return { tone: "warning", label: "Ligado, sem mensagem ainda", detail: "Aguardando a primeira mensagem. Confira se o webhook foi cadastrado no app do Meta." };
  return { tone: "success", label: "Funcionando", detail: conn.mode === "coexistencia" ? "Mensagens chegando pelo cadastro oficial (Coexistence)." : "Mensagens chegando pela API oficial." };
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

// -----------------------------------------------------------------------------
// Lista "pronto para cliente" (T5.5): o que já está certo em cada site e o que falta
// -----------------------------------------------------------------------------

export type ReadinessState = "ok" | "warn" | "fail" | "na";
export interface ReadinessItem { id: string; label: string; state: ReadinessState; detail: string }

export interface ReadinessInput {
  container: { status: string; test_mode: boolean; consent_mode: string; rules_version: number | null };
  nowMs: number;
  lastEventAt: string | null;
  quality: QualityInput | undefined;
  leads: number;
  destination: { has_token: boolean; enabled: boolean; last_error_message: string | null; test_event_code: string | null } | undefined;
  capi: { pending: number; sent_24h: number; errors_24h: number; last_sent_at: string | null } | undefined;
  whatsapp: Parameters<typeof waConnectionStatus>[0];
}

const DAY_MS = 24 * 3600 * 1000;

/** Itens da lista de um site. Só fatos do que já está gravado: nada é estimado. */
export function siteReadiness(i: ReadinessInput): { items: ReadinessItem[]; summary: "pronto" | "quase" | "faltam" } {
  const items: ReadinessItem[] = [];
  const add = (id: string, label: string, state: ReadinessState, detail: string) => items.push({ id, label, state, detail });

  add("site", "Site ativo", i.container.status === "ativo" ? "ok" : "fail", i.container.status === "ativo" ? "Recebendo eventos." : "O site está pausado: nenhum evento é gravado.");
  add("teste", "Fora do modo teste", i.container.test_mode ? "warn" : "ok",
    i.container.test_mode ? "Modo teste: os eventos ficam marcados como teste e só vão ao Meta com o código de teste." : "Eventos reais.");

  const last = i.lastEventAt ? Date.parse(i.lastEventAt) : null;
  if (last == null) add("codigo", "Código instalado e eventos chegando", "fail", "Nenhum evento recebido ainda. Cole o código de instalação no site.");
  else if (i.nowMs - last > DAY_MS) add("codigo", "Código instalado e eventos chegando", "warn", `O último evento chegou em ${formatDataCurta(i.lastEventAt!)}, há mais de 24 horas. Confira se o código continua no site.`);
  else add("codigo", "Código instalado e eventos chegando", "ok", `Evento recebido em ${formatDataCurta(i.lastEventAt!)}.`);

  if (!i.quality) add("origem", "Origem dos anúncios", "na", "Sem visitas no período escolhido.");
  else {
    const q = qualityReport(i.quality);
    const first = q.reasons[0]?.text;
    if (q.level === "sem_dados") add("origem", "Origem dos anúncios", "na", "Sem visitas no período escolhido.");
    else if (q.level === "boa") add("origem", "Origem dos anúncios", "ok", "As visitas chegam com a origem identificada.");
    else add("origem", "Origem dos anúncios", q.level === "fraca" ? "fail" : "warn", first ?? "Confira os parâmetros dos links dos anúncios.");
  }

  add("lead", "Lead chegando", i.leads > 0 ? "ok" : "warn", i.leads > 0 ? `${i.leads} lead(s) recente(s).` : "Nenhum lead ainda. Envie um formulário de teste.");

  if (!i.destination) add("pixel", "Pixel do Meta configurado", "fail", "Configure o Pixel no botão Meta CAPI.");
  else if (!i.destination.has_token) add("pixel", "Pixel do Meta configurado", "fail", "Falta o token de acesso (cole no campo do CRM).");
  else if (!i.destination.enabled) add("pixel", "Pixel do Meta configurado", "warn", "Configurado, mas o envio está desligado.");
  else add("pixel", "Pixel do Meta configurado", "ok", i.destination.test_event_code ? "Ligado, com código de teste." : "Ligado.");

  if (!i.destination) add("envio", "Envio ao Meta aceito", "na", "Depende do Pixel.");
  else if (i.capi && i.capi.errors_24h > 0) add("envio", "Envio ao Meta aceito", "fail", i.destination.last_error_message ?? "O Meta recusou envios nas últimas 24 horas.");
  else if (i.capi && i.capi.sent_24h > 0) add("envio", "Envio ao Meta aceito", "ok", `${i.capi.sent_24h} evento(s) enviado(s) nas últimas 24 horas.`);
  else if (i.capi && i.capi.pending > 0) add("envio", "Envio ao Meta aceito", "warn", `${i.capi.pending} evento(s) na fila, ainda não enviados.`);
  else add("envio", "Envio ao Meta aceito", "warn", "Nenhum envio ainda. Faça um teste e confira em “Testar eventos” no Meta.");

  add("consentimento", "Consentimento", "na",
    i.container.consent_mode === "aguardar_consentimento" ? "Só coleta depois do aceite do visitante." : "Coleta assim que a página abre (não espera aceite).");

  if (!i.whatsapp) add("whatsapp", "WhatsApp", "na", "Não ligado (só é preciso se o cliente atende pelo WhatsApp).");
  else {
    const w = waConnectionStatus(i.whatsapp);
    add("whatsapp", "WhatsApp", w.tone === "success" ? "ok" : w.tone === "danger" ? "fail" : "warn", w.detail);
  }

  const states = items.map((x) => x.state);
  return { items, summary: states.includes("fail") ? "faltam" : states.includes("warn") ? "quase" : "pronto" };
}

// -----------------------------------------------------------------------------
// T5.35 (etapa 4): visão de marketing — de onde veio cada venda
// -----------------------------------------------------------------------------

/** Uma campanha da atribuição, já juntada (o investimento é o mesmo em todas as linhas da campanha). */
export interface MarketingCampaign {
  campaign_id: string | null;
  label: string;
  channel: string | null;
  leads: number;
  purchases: number;
  revenue: Record<string, number>;
  spend_micros: number | null;
  spend_currency: string | null;
  costPerLeadMicros: number | null;
  roas: number | null;
  /** Gastou no período e nenhum lead chegou no site. */
  sem_lead: boolean;
}

/**
 * Junta as linhas da atribuição por campanha.
 *
 * O investimento NÃO é somado linha a linha: a mesma campanha aparece em mais de uma
 * linha quando a pessoa chegou por origens diferentes, e o banco repete o investimento
 * da campanha em cada uma delas. Aqui ele é contado uma vez só.
 */
export function marketingCampaigns(rows: AttributionRowInput[]): MarketingCampaign[] {
  const map = new Map<string, MarketingCampaign>();
  for (const r of rows) {
    const key = r.campaign_id ?? `sem-campanha:${r.campaign_label ?? ""}`;
    const acc = map.get(key) ?? {
      campaign_id: r.campaign_id,
      label: r.campaign_label ?? (r.channel ? "Campanha não identificada" : "Sem origem identificada"),
      channel: r.channel,
      leads: 0,
      purchases: 0,
      revenue: {},
      spend_micros: null,
      spend_currency: r.spend_currency,
      costPerLeadMicros: null,
      roas: null,
      sem_lead: false,
    };
    acc.leads += r.leads;
    acc.purchases += r.purchases;
    for (const [cur, v] of Object.entries(r.revenue)) acc.revenue[cur] = (acc.revenue[cur] ?? 0) + Number(v);
    // O investimento da campanha é o mesmo em todas as linhas dela: guarda o primeiro que vier.
    if (acc.spend_micros == null && r.spend_micros != null) {
      acc.spend_micros = Number(r.spend_micros);
      acc.spend_currency = r.spend_currency;
    }
    map.set(key, acc);
  }
  const out = [...map.values()].map((c) => {
    const m = attributionMetrics({
      ...c,
      campaign_label: c.label,
      match: null,
      client_id: "",
      confirmed: 0,
      platform_leads: null,
      platform_conversions: null,
      platform_value_micros: null,
    });
    return { ...c, costPerLeadMicros: m.costPerLeadMicros, roas: m.roas, sem_lead: (c.spend_micros ?? 0) > 0 && c.leads === 0 };
  });
  return out.sort((a, b) => (b.spend_micros ?? 0) - (a.spend_micros ?? 0) || b.leads - a.leads);
}

export interface MarketingTotals {
  leads: number;
  purchases: number;
  /** Receita por moeda (nunca somada entre moedas). */
  revenue: Record<string, number>;
  /** Investimento por moeda, contado uma vez por campanha. */
  spend: Record<string, number>;
  /** Só quando há uma moeda só: lead / investimento. */
  costPerLeadMicros: number | null;
  /** Por moeda: receita ÷ investimento da mesma moeda. */
  roas: Record<string, number | null>;
  /** Campanhas que gastaram e não trouxeram lead. */
  sem_lead: MarketingCampaign[];
}

/** Totais do período. Receita e investimento sempre separados por moeda. */
export function marketingTotals(rows: AttributionRowInput[]): MarketingTotals {
  const leads = rows.reduce((s, r) => s + r.leads, 0);
  const purchases = rows.reduce((s, r) => s + r.purchases, 0);
  const revenue: Record<string, number> = {};
  for (const r of rows) for (const [cur, v] of Object.entries(r.revenue)) revenue[cur] = (revenue[cur] ?? 0) + Number(v);

  const campaigns = marketingCampaigns(rows);
  const spend: Record<string, number> = {};
  for (const c of campaigns) {
    if (c.spend_micros == null || !c.spend_currency) continue;
    spend[c.spend_currency] = (spend[c.spend_currency] ?? 0) + c.spend_micros;
  }

  const moedas = Object.keys(spend);
  const costPerLeadMicros = moedas.length === 1 && leads > 0 ? Math.round(spend[moedas[0]] / leads) : null;
  const roas: Record<string, number | null> = {};
  for (const cur of new Set([...Object.keys(revenue), ...moedas])) {
    const s = spend[cur] ?? 0;
    roas[cur] = s > 0 ? Math.round(((revenue[cur] ?? 0) / s) * 100) / 100 : null;
  }

  return { leads, purchases, revenue, spend, costPerLeadMicros, roas, sem_lead: campaigns.filter((c) => c.sem_lead) };
}

/** Cada canal com a parte dele dos leads (para o gestor ver o peso de cada origem). */
export function marketingOrigins(rows: AttributionRowInput[]) {
  const base = summarizeByChannel(rows);
  const total = base.reduce((s, c) => s + c.leads + c.purchases, 0);
  return base.map((c) => ({ ...c, share: total > 0 ? Math.round(((c.leads + c.purchases) * 100) / total) : 0 }));
}

export interface JourneySummaryInput {
  leads: number;
  purchases: number;
  toques_0: number;
  toques_1: number;
  toques_2_3: number;
  toques_4p: number;
  media_toques: number | null;
  media_dias: number | null;
  mais_rapido_dias: number | null;
  origem_paga: number;
}

/**
 * Junta o resumo de vários clientes num número só.
 * A média de toques e a de dias são ponderadas pelo número de leads que tiveram
 * origem — isso devolve exatamente a média de todos os leads juntos, sem inventar.
 */
export function mergeJourneySummaries(rows: JourneySummaryInput[]): JourneySummaryInput {
  const soma = (f: (r: JourneySummaryInput) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const comToque = soma((r) => r.toques_1 + r.toques_2_3 + r.toques_4p);
  const peso = (r: JourneySummaryInput) => r.toques_1 + r.toques_2_3 + r.toques_4p;
  const media = (f: (r: JourneySummaryInput) => number | null) => {
    if (comToque === 0) return null;
    let acc = 0;
    for (const r of rows) {
      const v = f(r);
      if (v == null) continue;
      acc += v * peso(r);
    }
    return Math.round((acc / comToque) * 10) / 10;
  };
  const maisRapido = rows.map((r) => r.mais_rapido_dias).filter((v): v is number => v != null);
  return {
    leads: soma((r) => r.leads),
    purchases: soma((r) => r.purchases),
    toques_0: soma((r) => r.toques_0),
    toques_1: soma((r) => r.toques_1),
    toques_2_3: soma((r) => r.toques_2_3),
    toques_4p: soma((r) => r.toques_4p),
    media_toques: media((r) => r.media_toques),
    media_dias: media((r) => r.media_dias),
    mais_rapido_dias: maisRapido.length ? Math.min(...maisRapido) : null,
    origem_paga: soma((r) => r.origem_paga),
  };
}

// -----------------------------------------------------------------------------
// T5.35 (etapa 5): acabamento — o que está sem uso
// -----------------------------------------------------------------------------

/** Dias sem nenhum evento para o site (ou a conexão) ser considerado "sem uso". */
export const USO_LIMITE_DIAS = 7;
export type UsoLevel = "ok" | "atencao" | "nunca";

/**
 * Há quanto tempo o site (ou a conexão) não manda nada.
 * "nunca" = nunca chegou evento; "atencao" = está parado há mais de 7 dias.
 */
export function usoRecente(lastAt: string | null, nowMs: number, limiteDias = USO_LIMITE_DIAS): { level: UsoLevel; dias: number | null } {
  if (!lastAt) return { level: "nunca", dias: null };
  const t = Date.parse(lastAt);
  if (Number.isNaN(t)) return { level: "nunca", dias: null };
  const dias = Math.max(0, Math.floor((nowMs - t) / DAY_MS));
  return { level: dias >= limiteDias ? "atencao" : "ok", dias };
}

/**
 * Site recém-criado (menos de 2 dias): ainda não dá para dizer que está "sem uso" —
 * o código pode ter acabado de ser colado no site.
 */
export function siteRecemCriado(createdAt: string | null, nowMs: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return nowMs - t < 2 * DAY_MS;
}
