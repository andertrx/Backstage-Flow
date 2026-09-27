/**
 * Dados FICTÍCIOS do modo demonstração (Etapa 27). Nada aqui existe de verdade:
 * nomes terminam em "(Demo)", ids começam com "de000000" e nenhum dado vai para
 * o banco real. Gerados sempre iguais (semente fixa) a partir da data de hoje.
 */
import type { MockDb } from "./mockBackend.js";
import { createMockDb } from "./mockBackend.js";
import { DEMO_EMAIL } from "./constants.ts";

export const DEMO_USER = {
  id: "de000000-0000-4000-8000-000000000001",
  email: DEMO_EMAIL,
  name: "Usuário de demonstração",
} as const;

export const DEMO_SUFFIX = "(Demo)";

const M = 1_000_000;
const TZ = "America/Sao_Paulo";
const DAY = 86_400_000;

/** Id fictício reconhecível: de000000-0000-4000-8000-<tipo><número>. */
const did = (kind: string, n: number) => `de000000-0000-4000-8000-${kind}${String(n).padStart(12 - kind.length, "0")}`;

/** Sorteio com semente fixa (os mesmos números a cada visita). */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

type Objective = "leads" | "mensagens" | "vendas" | "trafego" | "pesquisa";

interface CampaignSpec {
  name: string;
  objective: Objective;
  status: "ativa" | "pausada" | "encerrada";
  dailyBudget: number;
  /** Dias atrás em que parou (pausada/encerrada). */
  stoppedDaysAgo?: number;
}

interface AccountSpec {
  platform: "meta" | "google";
  name: string;
  currency: "BRL" | "USD";
  status: string;
  available: number | null;
  issues?: string[];
  campaigns: CampaignSpec[];
}

interface ClientSpec {
  name: string;
  company: string;
  status: "ativo" | "pausado";
  accounts: AccountSpec[];
}

const OBJECTIVE_API: Record<Objective, string> = {
  leads: "OUTCOME_LEADS",
  mensagens: "OUTCOME_ENGAGEMENT",
  vendas: "OUTCOME_SALES",
  trafego: "OUTCOME_TRAFFIC",
  pesquisa: "SEARCH",
};

const CLIENTS: ClientSpec[] = [
  {
    name: `Academia Movimento ${DEMO_SUFFIX}`, company: "Academia Fictícia Ltda", status: "ativo",
    accounts: [
      {
        platform: "meta", name: `Movimento - Meta ${DEMO_SUFFIX}`, currency: "BRL", status: "ativa", available: 1_850,
        campaigns: [
          { name: "Matrículas - Leads", objective: "leads", status: "ativa", dailyBudget: 120 },
          { name: "Aula experimental - WhatsApp", objective: "mensagens", status: "ativa", dailyBudget: 80 },
          { name: "Promoção de verão", objective: "leads", status: "encerrada", dailyBudget: 150, stoppedDaysAgo: 150 },
        ],
      },
      {
        platform: "google", name: `Movimento - Google ${DEMO_SUFFIX}`, currency: "BRL", status: "ativa", available: 2_400,
        campaigns: [
          { name: "Pesquisa - Academia perto de mim", objective: "pesquisa", status: "ativa", dailyBudget: 90 },
          { name: "Pesquisa - Marca", objective: "pesquisa", status: "ativa", dailyBudget: 25 },
        ],
      },
    ],
  },
  {
    name: `Clínica Sorriso ${DEMO_SUFFIX}`, company: "Clínica Odontológica Exemplo", status: "ativo",
    accounts: [
      {
        platform: "meta", name: `Sorriso - Meta ${DEMO_SUFFIX}`, currency: "BRL", status: "ativa", available: 95,
        campaigns: [
          { name: "Avaliação gratuita - Leads", objective: "leads", status: "ativa", dailyBudget: 70 },
          { name: "Clareamento - Mensagens", objective: "mensagens", status: "pausada", dailyBudget: 50, stoppedDaysAgo: 12 },
        ],
      },
    ],
  },
  {
    name: `Imobiliária Horizonte ${DEMO_SUFFIX}`, company: "Horizonte Imóveis Fictícios", status: "ativo",
    accounts: [
      {
        platform: "meta", name: `Horizonte - Meta ${DEMO_SUFFIX}`, currency: "BRL", status: "pagamento_pendente", available: null,
        issues: ["pagamento_pendente"],
        campaigns: [
          { name: "Lançamento Residencial Aurora", objective: "leads", status: "ativa", dailyBudget: 200 },
          { name: "Remarketing - Visitas ao site", objective: "trafego", status: "ativa", dailyBudget: 60 },
        ],
      },
      {
        platform: "google", name: `Horizonte - Google ${DEMO_SUFFIX}`, currency: "BRL", status: "ativa", available: 3_100,
        campaigns: [
          { name: "Pesquisa - Apartamento 2 quartos", objective: "pesquisa", status: "ativa", dailyBudget: 110 },
        ],
      },
    ],
  },
  {
    name: `Loja Aurora Internacional ${DEMO_SUFFIX}`, company: "Aurora Store (fictícia)", status: "ativo",
    accounts: [
      {
        platform: "meta", name: `Aurora Store - Meta US ${DEMO_SUFFIX}`, currency: "USD", status: "ativa", available: 640,
        campaigns: [
          { name: "Catalog Sales - US", objective: "vendas", status: "ativa", dailyBudget: 45 },
          { name: "Retargeting - Cart", objective: "vendas", status: "ativa", dailyBudget: 20 },
        ],
      },
    ],
  },
  {
    name: `Pet Shop Amigo Fiel ${DEMO_SUFFIX}`, company: "Pet Exemplo ME", status: "pausado",
    accounts: [
      {
        platform: "meta", name: `Amigo Fiel - Meta ${DEMO_SUFFIX}`, currency: "BRL", status: "ativa", available: 0, issues: ["sem_saldo"],
        campaigns: [
          { name: "Banho e tosa - Mensagens", objective: "mensagens", status: "pausada", dailyBudget: 40, stoppedDaysAgo: 45 },
        ],
      },
    ],
  },
];

/** Custo por mil impressões, taxa de clique e taxa de resultado de cada objetivo. */
const PROFILE: Record<Objective, { cpm: number; ctr: number; result: number; ticket?: number }> = {
  leads: { cpm: 22, ctr: 0.013, result: 0.09 },
  mensagens: { cpm: 18, ctr: 0.011, result: 0.14 },
  vendas: { cpm: 14, ctr: 0.016, result: 0.035, ticket: 68 },
  trafego: { cpm: 9, ctr: 0.021, result: 0.02 },
  pesquisa: { cpm: 95, ctr: 0.065, result: 0.08 },
};

const METRIC_KEYS = ["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"] as const;

/** Monta o "banco" simulado com 13 meses de dados fictícios. */
export function seedDemo(): MockDb {
  const db = createMockDb({ role: "admin", userId: DEMO_USER.id, email: DEMO_USER.email, fullName: DEMO_USER.name });
  const rnd = random(20260927);
  const end = today();
  const [y, mo] = end.split("-").map(Number);
  const monthIndex = y * 12 + (mo - 1) - 12;
  const start = `${Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, "0")}-01`;
  const days: string[] = [];
  for (let d = start; d <= end; d = shift(d, 1)) days.push(d);

  db.profiles = [
    { id: DEMO_USER.id, email: DEMO_USER.email, full_name: DEMO_USER.name, role: "admin", active: true, created_at: ago(60 * 24 * 400), updated_at: "" },
    { id: did("9", 2), email: "gestora@demo.local", full_name: `Gestora ${DEMO_SUFFIX}`, role: "gestor", active: true, created_at: ago(60 * 24 * 300), updated_at: "" },
    { id: did("9", 3), email: "cliente@demo.local", full_name: `Cliente ${DEMO_SUFFIX}`, role: "cliente", active: true, created_at: ago(60 * 24 * 200), updated_at: "" },
  ];
  db.connections = [
    { id: did("c", 1), platform_id: "meta", label: `BM da agência ${DEMO_SUFFIX}`, status: "ativa", external_user_id: "demo", external_user_name: "Usuário do sistema (Demo)", last_checked_at: ago(20), last_error: null, created_at: ago(60 * 24 * 400) },
    { id: did("c", 2), platform_id: "google", label: `MCC da agência ${DEMO_SUFFIX}`, status: "ativa", external_user_id: "demo", external_user_name: "demo@exemplo.local", last_checked_at: ago(20), last_error: null, created_at: ago(60 * 24 * 400) },
  ];
  db.metaAccounts = [];
  db.googleAccounts = [];

  let accountN = 0, campaignN = 0, groupN = 0, adN = 0;
  CLIENTS.forEach((spec, ci) => {
    const clientId = did("a", ci + 1);
    db.clients.push({
      id: clientId, name: spec.name, company: spec.company, cnpj: null, owner_name: null, phone: null, email: null,
      notes: "Cliente fictício do modo demonstração.", status: spec.status, timezone: TZ, is_demo: true,
      created_at: ago(60 * 24 * 400), updated_at: "", created_by: DEMO_USER.id,
    });
    for (const acc of spec.accounts) {
      const accountId = did("b", ++accountN);
      const externalId = acc.platform === "google" ? `90000000${String(accountN).padStart(2, "0")}` : `9000000${accountN}`;
      db.adAccounts.push({
        id: accountId, platform_id: acc.platform, external_id: externalId, client_id: clientId,
        connection_id: acc.platform === "meta" ? did("c", 1) : did("c", 2), name: acc.name, currency: acc.currency, timezone: TZ,
        status: acc.status, raw_status: null, status_reason: null, business_name: acc.platform === "meta" ? "BM da agência (Demo)" : "MCC da agência (Demo)",
        is_prepay: acc.platform === "meta", is_test_account: false, is_demo: true, linked_at: ago(60 * 24 * 400), details_updated_at: ago(20), unlinked_at: null, assets: [],
      });
      const account: Record<string, number> = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0]));
      const accountDaily = new Map<string, Record<string, number>>();

      for (const c of acc.campaigns) {
        const campaignId = did("d", ++campaignN);
        db.campaigns.push({
          id: campaignId, ad_account_id: accountId, client_id: clientId, platform_id: acc.platform, external_id: `9100${campaignN}`,
          name: c.name, objective: OBJECTIVE_API[c.objective], status: c.status,
          budget_micros: Math.round(c.dailyBudget * M), budget_period: "diario",
        });
        const groups = acc.platform === "google" ? ["Palavras exatas", "Palavras amplas"] : ["Público amplo", "Remarketing 30 dias"];
        const groupIds = groups.map((g, gi) => {
          const id = did("e", ++groupN);
          db.adGroups.push({
            id, campaign_id: campaignId, ad_account_id: accountId, client_id: clientId, platform_id: acc.platform, external_id: `9200${groupN}`,
            name: g, status: gi === 1 && c.status === "ativa" && campaignN % 3 === 0 ? "pausada" : c.status,
            optimization_goal: acc.platform === "google" ? "SEARCH_STANDARD" : "OFFSITE_CONVERSIONS", budget_micros: null, budget_period: null,
          });
          const adIds = (acc.platform === "google" ? ["Anúncio responsivo A", "Anúncio responsivo B"] : ["Vídeo depoimento", "Carrossel de fotos"]).map((a, ai) => {
            const adId = did("f", ++adN);
            db.ads.push({
              id: adId, ad_group_id: id, campaign_id: campaignId, ad_account_id: accountId, client_id: clientId, platform_id: acc.platform,
              external_id: `9300${adN}`, name: a, status: c.status, creative_type: acc.platform === "google" ? "RESPONSIVE_SEARCH_AD" : ai === 0 ? "VIDEO" : "IMAGE",
              review_status: "APPROVED", thumbnail_url: null,
            });
            return adId;
          });
          return { id, adIds };
        });

        const p = PROFILE[c.objective];
        const stopDate = c.stoppedDaysAgo != null ? shift(end, -c.stoppedDaysAgo) : null;
        days.forEach((date, i) => {
          if (stopDate && date > stopDate) return;
          if (date === end) return; // hoje ainda em andamento: sem dados fechados
          const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
          const season = 1 + 0.18 * Math.sin((i / 365) * 2 * Math.PI) + (weekday === 0 || weekday === 6 ? -0.15 : 0.05);
          const spend = c.dailyBudget * season * (0.8 + rnd() * 0.35);
          const impressions = Math.round((spend / p.cpm) * 1000);
          const clicks = Math.round(impressions * p.ctr * (0.85 + rnd() * 0.3));
          const results = Math.round(clicks * p.result * (0.7 + rnd() * 0.6));
          const row: Record<string, number | null> = {
            spend_micros: Math.round(spend * M), impressions, clicks, link_clicks: acc.platform === "meta" ? Math.round(clicks * 0.8) : null,
            leads: c.objective === "leads" ? results : acc.platform === "meta" ? 0 : null,
            messages: c.objective === "mensagens" ? results : acc.platform === "meta" ? 0 : null,
            conversions: c.objective === "vendas" || c.objective === "pesquisa" || c.objective === "trafego" ? results : 0,
            conversion_value_micros: p.ticket ? Math.round(results * p.ticket * (0.8 + rnd() * 0.4) * M) : 0,
          };
          const base = { date, ad_account_id: accountId, client_id: clientId, platform_id: acc.platform, currency: acc.currency, reach: null };
          db.metrics.push({ ...base, level: "campaign", campaign_id: campaignId, ad_group_id: null, ad_id: null, ...row });
          // Divide o dia da campanha entre conjuntos e anúncios (a soma confere).
          const split = (value: number | null, parts: number, idx: number) => {
            if (value == null) return null;
            const share = Math.floor(value / parts);
            return idx === parts - 1 ? value - share * (parts - 1) : share;
          };
          groupIds.forEach((g, gi) => {
            const gRow = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, split(v, groupIds.length, gi)]));
            db.metrics.push({ ...base, level: "ad_group", campaign_id: campaignId, ad_group_id: g.id, ad_id: null, ...gRow });
            g.adIds.forEach((adId, ai) => {
              const aRow = Object.fromEntries(Object.entries(gRow).map(([k, v]) => [k, split(v as number | null, g.adIds.length, ai)]));
              db.metrics.push({ ...base, level: "ad", campaign_id: campaignId, ad_group_id: g.id, ad_id: adId, ...aRow });
            });
          });
          const daily = accountDaily.get(date) ?? Object.fromEntries(METRIC_KEYS.map((k) => [k, 0]));
          for (const k of METRIC_KEYS) daily[k] += (row[k] as number | null) ?? 0;
          accountDaily.set(date, daily);
        });
      }
      for (const [date, daily] of accountDaily) {
        db.metrics.push({
          date, level: "account", ad_account_id: accountId, client_id: clientId, platform_id: acc.platform, currency: acc.currency,
          campaign_id: null, ad_group_id: null, ad_id: null, reach: null, ...daily,
          link_clicks: acc.platform === "meta" ? daily.link_clicks : null,
          leads: acc.platform === "meta" ? daily.leads : null, messages: acc.platform === "meta" ? daily.messages : null,
        });
        for (const k of METRIC_KEYS) account[k] += daily[k];
      }

      const spent = account.spend_micros;
      db.snapshots[accountId] = {
        captured_at: ago(25), currency: acc.currency,
        available_micros: acc.available == null ? null : Math.round(acc.available * M),
        available_basis: acc.available == null ? null : acc.platform === "meta" ? "meta_spend_cap" : "google_account_budget",
        amount_spent_micros: spent, spend_cap_micros: acc.available == null ? null : spent + Math.round(acc.available * M),
        issues: acc.issues ?? [], funding_description: acc.platform === "meta" ? "Cartão fictício final 0000" : null,
      };
      db.fundingApi[accountId] = { ...db.snapshots[accountId] };
      db.syncState[accountId] = { status: "sucesso", last_attempt_at: ago(35), last_success_at: ago(35), next_run_at: ago(-25) };
      db.coverage[accountId] = { history_from: start, history_to: end };
      for (let h = 1; h <= 24; h++) {
        const failed = accountN === 3 && h === 5;
        db.syncRuns.push({
          id: accountN * 100 + h, ad_account_id: accountId, client_id: clientId, platform_id: acc.platform, trigger: "agendada",
          status: failed ? "erro" : "sucesso", started_at: ago(h * 60 + 35), finished_at: ago(h * 60 + 34), duration_ms: 20_000 + Math.round(rnd() * 40_000),
          records_updated: failed ? 0 : 150 + Math.round(rnd() * 400),
          error_message: failed ? "Não conseguimos falar com o Meta agora. Tente novamente em instantes." : null,
        });
      }
    }
  });

  const accountOf = (name: string) => db.adAccounts.find((a) => String(a.name).startsWith(name)) as Record<string, string>;
  const alert = (id: number, type: string, severity: string, status: string, acc: Record<string, string>, description: string, recommended: string | null, hours: number, extra: Record<string, unknown> = {}) => ({
    id, alert_key: `${type}:${acc.id}`, type, severity, status, client_id: acc.client_id, platform_id: acc.platform_id, ad_account_id: acc.id, campaign_id: null,
    description, recommended_action: recommended, details: {}, first_seen_at: ago(hours * 60), last_seen_at: ago(10),
    seen_at: status === "visto" ? ago(60) : null, resolved_at: status === "resolvido" ? ago(60 * 3) : null, resolution: status === "resolvido" ? "automatica" : null, ...extra,
  });
  const sorriso = accountOf("Sorriso - Meta");
  const horizonte = accountOf("Horizonte - Meta");
  const amigo = accountOf("Amigo Fiel");
  const movimento = accountOf("Movimento - Google");
  db.alerts = [
    alert(1, "sem_saldo", "critica", "aberto", amigo, "Conta sem saldo: o limite de gastos foi atingido e os anúncios param de rodar.", "Adicionar saldo ou aumentar o limite de gastos da conta na plataforma.", 6),
    alert(2, "saldo_baixo", "alta", "aberto", sorriso, "Saldo baixo: R$ 95,00 disponíveis, cerca de 1 dia no ritmo atual de gasto.", "Adicionar saldo ou aumentar o limite de gastos antes que acabe.", 3),
    alert(3, "pagamento_pendente", "critica", "visto", horizonte, "Problema de pagamento: a plataforma recusou a última cobrança.", "Conferir a forma de pagamento da conta na plataforma.", 20),
    alert(4, "queda_resultados", "media", "aberto", movimento, "Conversões caíram 38% nos últimos 7 dias em relação aos 7 dias anteriores.", null, 30),
    alert(5, "erro_api", "alta", "resolvido", horizonte, "A última sincronização falhou: não conseguimos falar com o Meta agora.", null, 50),
  ];
  db.audit = [
    { id: 1, created_at: ago(60 * 26), actor_id: DEMO_USER.id, action: "auth.login", target_type: "user", target_id: DEMO_USER.id, target_label: DEMO_USER.name, details: {} },
    { id: 2, created_at: ago(60 * 25), actor_id: DEMO_USER.id, action: "client.update", target_type: "client", target_id: did("a", 2), target_label: CLIENTS[1].name, details: { notes: { before: null, after: "Cliente fictício do modo demonstração." } } },
    { id: 3, created_at: ago(60 * 5), actor_id: null, action: "ad_account.update", target_type: "ad_account", target_id: horizonte.id, target_label: horizonte.name, details: { status: { before: "ativa", after: "pagamento_pendente" } } },
    { id: 4, created_at: ago(30), actor_id: DEMO_USER.id, action: "auth.login", target_type: "user", target_id: DEMO_USER.id, target_label: DEMO_USER.name, details: {} },
  ];
  db.errorLogs = [
    { id: 1, occurred_at: ago(60 * 4), source: "sincronizacao", code: "PLATFORM_UNAVAILABLE", user_message: "Não conseguimos atualizar os dados desta conta. Não conseguimos falar com o Meta agora.",
      technical: "PLATFORM_UNAVAILABLE — exemplo fictício do modo demonstração", context: { etapa: "metricas" }, user_id: null, user_name: null,
      ad_account_id: horizonte.id, account_name: horizonte.name, client_id: horizonte.client_id, client_name: CLIENTS[2].name },
  ];
  db.entityChanges = [
    { id: 1, entity_level: "campaign", entity_id: did("d", 1), field: "budget_micros", old_value: 100 * M, new_value: 120 * M, source: "sync", changed_at: null, detected_at: ago(60 * 30) },
  ];
  // Tracking (Etapa 34): um site fictício com algumas chegadas e eventos.
  const trackingContainer = did("f", 1);
  db.trackingContainers = [{
    id: trackingContainer, client_id: did("a", 1), name: `Site Academia ${DEMO_SUFFIX}`, public_key: "bf_de0000000000000000000d3e",
    allowed_domains: ["academia-demo.example"], status: "ativo", test_mode: true, consent_mode: "nao_exigir", retention_days: 180, created_at: ago(60 * 48),
  }];
  const touches: [string, boolean | null, string, string, string | null, number][] = [
    ["meta", true, "confirmada", "IDs do anúncio do Meta na URL.", "Matrículas - Leads", 12],
    ["google", true, "confirmada", "Clique em anúncio do Google (identificador de clique do Google Ads).", null, 45],
    ["busca_organica", false, "provavel", "Veio de um buscador (www.google.com).", null, 90],
    ["meta", null, "provavel", "fbclid presente (pode ser anúncio ou link orgânico do Facebook/Instagram).", null, 150],
    ["direto", null, "desconhecida", "Sem parâmetros nem site de origem (acesso direto ou origem perdida).", null, 240],
  ];
  db.trackingTouchpoints = touches.map(([channel, paid, evidence, reason, campaign, minutes], i) => ({
    id: i + 1, container_id: trackingContainer, occurred_at: ago(minutes), channel, paid, evidence, reason,
    utm_source: channel === "meta" && campaign ? "facebook" : null, utm_medium: campaign ? "paid_social" : null, utm_campaign: campaign,
    fbclid: channel === "meta" ? "IwDemo" : null, gclid: channel === "google" ? "GDemo" : null, ad_campaign_id: campaign ? "120000000000001" : null, landing_url: null,
  }));
  db.trackingEvents = db.trackingTouchpoints.flatMap((t, i) => [
    { event_id: `demo.${i}.1`, container_id: trackingContainer, event_name: "PageView", occurred_at: t.occurred_at, page_path: "/", test: true, touchpoint_id: t.id, session_id: `s${i}`, visitor_id: `v${i}` },
    { event_id: `demo.${i}.2`, container_id: trackingContainer, event_name: i === 0 ? "Lead" : "PageView", occurred_at: ago(Number(touches[i][5]) - 2), page_path: i === 0 ? "/obrigado" : "/planos", test: true, touchpoint_id: null, session_id: `s${i}`, visitor_id: `v${i}` },
  ]);

  // Um lead fictício: chegou pelo Meta, enviou o formulário e comprou.
  const metaTouch = db.trackingTouchpoints[0] as Record<string, unknown>;
  const touchSummary = { channel: "meta", evidence: "confirmada", paid: true, utm_campaign: "Matrículas - Leads", ad_campaign_id: "120000000000001" };
  db.trackingEvents.push({ event_id: "demo.0.3", container_id: trackingContainer, event_name: "Purchase", occurred_at: ago(8), page_path: "/pedido", test: true, touchpoint_id: null, session_id: "s0", visitor_id: "v0" });
  db.trackingPurchases = [{ id: 1, container_id: trackingContainer, occurred_at: ago(8), value_micros: 149_900_000, currency: "BRL", transaction_id: "DEMO-1" }];
  db.trackingLeads = [{
    id: 1, container_id: trackingContainer, first_event_name: "Lead", first_converted_at: ago(10), last_converted_at: ago(8), conversions: 2, purchases: 1, test: true,
    em_hash: "d".repeat(64), ph_hash: null, first_touch: touchSummary, last_touch: touchSummary,
  }];
  db.trackingJourneys = {
    1: [
      { kind: "origem", occurred_at: String(metaTouch.occurred_at), name: null, channel: "meta", paid: true, evidence: "confirmada", reason: "IDs do anúncio do Meta na URL.", campaign: "Matrículas - Leads", page_path: null, value_micros: null, currency: null, transaction_id: null, visitor_id: "v0", test: false },
      { kind: "evento", occurred_at: String(metaTouch.occurred_at), name: "PageView", channel: null, paid: null, evidence: null, reason: null, campaign: null, page_path: "/", value_micros: null, currency: null, transaction_id: null, visitor_id: "v0", test: true },
      { kind: "evento", occurred_at: ago(10), name: "Lead", channel: null, paid: null, evidence: null, reason: null, campaign: null, page_path: "/obrigado", value_micros: null, currency: null, transaction_id: null, visitor_id: "v0", test: true },
      { kind: "compra", occurred_at: ago(8), name: "Purchase", channel: null, paid: null, evidence: null, reason: null, campaign: null, page_path: null, value_micros: 149_900_000, currency: "BRL", transaction_id: "DEMO-1", visitor_id: "v0", test: true },
    ],
  };

  // Meta CAPI fictício: ligado em modo de teste, com 3 envios nas últimas 24 h.
  const demoDest = did("f", 2);
  db.trackingDestinations = [{
    id: demoDest, container_id: trackingContainer, pixel_id: "100000000000001", test_event_code: "TEST0000", enabled: true,
    send_events: ["Lead", "CompleteRegistration", "SubmitApplication", "Schedule", "Purchase", "Contact"],
    last_success_at: ago(8), last_error_at: null, last_error_message: null, sent_24h: 3,
  }];
  db.capiTokens = { [demoDest]: "token-ficticio-do-modo-demonstracao" };
  db.trackingCapiLog = [
    { id: 1, destination_id: demoDest, requested_at: ago(8), kind: "envio", events_count: 2, test: true, http_status: 200, events_received: 2, error_message: null },
    { id: 2, destination_id: demoDest, requested_at: ago(10), kind: "envio", events_count: 1, test: true, http_status: 200, events_received: 1, error_message: null },
  ];

  // WhatsApp fictício: dois cliques com código (um já virou venda).
  db.whatsappClicks = [
    { id: 1, container_id: trackingContainer, code: "D3M0K7", clicked_at: ago(30), status: "venda", sales: 1, test: true,
      touch: { channel: "meta", evidence: "confirmada", paid: true, utm_campaign: "Aula experimental - WhatsApp", ad_campaign_id: null, reason: "IDs do anúncio do Meta na URL." } },
    { id: 2, container_id: trackingContainer, code: "D3M0Q9", clicked_at: ago(12), status: "clicado", sales: 0, test: true,
      touch: { channel: "busca_organica", evidence: "provavel", paid: false, utm_campaign: null, ad_campaign_id: null, reason: "Veio de um buscador (www.google.com)." } },
  ];

  db.lastSyncedAt = ago(35);
  return db;
}
