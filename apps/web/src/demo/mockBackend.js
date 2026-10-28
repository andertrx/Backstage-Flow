/**
 * Supabase SIMULADO, em memória (nenhum dado real é tocado).
 * Usado pelos testes de navegador (e2e/support.mjs) e pelo MODO DEMONSTRAÇÃO
 * do site (Etapa 27): as mesmas regras das funções do banco, em JavaScript.
 */
import { handleOpsEnvios, seedOpsEnvios } from "./mockOpsEnvios.js";
import { handleAdsBuilder, seedAdsBuilder } from "./mockAdsBuilder.js";
import { handleOpsTasks, seedOpsTasks } from "./mockOpsTasks.js";

export const USER_ID = "11111111-1111-1111-1111-111111111111";

const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Lê um filtro PostgREST simples da URL (ex.: id=eq.123 → "123"). */
const eqParam = (url, column) => new URL(url).searchParams.get(column)?.replace(/^eq\./, "");

/** Resposta do servidor simulado (corpo já em JSON, ou nenhum). */
const res = (status, body) => ({ status, body: body === undefined ? undefined : JSON.stringify(body) });

/** "Banco" vazio, com o usuário logado e dois usuários de exemplo. */
export function createMockDb({ role = "admin", userId = USER_ID, email = "ander@teste.local", fullName = "Ander Rodrigues" } = {}) {
  return {
    profiles: [
      { id: userId, email, full_name: fullName, role, active: true, created_at: "2026-09-23T23:10:00Z", updated_at: "" },
      { id: "22222222-2222-2222-2222-222222222222", email: "gestor@agencia.com", full_name: "Maria Gestora", role: "gestor", active: true, created_at: "2026-09-24T10:00:00Z", updated_at: "" },
      { id: "33333333-3333-3333-3333-333333333333", email: "cliente@excalibur.com", full_name: "Excalibur Fitness", role: "cliente", active: false, created_at: "2026-09-24T11:00:00Z", updated_at: "" },
    ],
    clients: [],
    access: [],
    connections: [],
    adAccounts: [],
    /** Contas que a "API do Meta" simulada devolve. */
    metaAccounts: [
      { externalId: "1001", name: "Excalibur - Principal", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: "BM Agência" },
      { externalId: "1002", name: "Excalibur - Remarketing", currency: "BRL", timezone: "America/Sao_Paulo", status: "pagamento_pendente", businessName: "BM Agência" },
    ],
    /** Contas que a "API do Google Ads" simulada devolve (uma via MCC, uma de teste). */
    googleAccounts: [
      { externalId: "1234567890", name: "Excalibur - Pesquisa", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: "MCC Agência", managerId: "9998887776", isTestAccount: false },
      { externalId: "5556667778", name: "Conta de Teste", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: null, managerId: null, isTestAccount: true },
    ],
    /** Segredos do Google que "faltam" no servidor simulado. */
    googleMissing: [],
    functionCalls: [],
    adAccountCalls: [],
    /** Campanhas e métricas diárias (como public.campaigns / public.metrics_daily). */
    campaigns: [],
    /** Conjuntos/grupos, anúncios e histórico de alterações. */
    adGroups: [],
    ads: [],
    entityChanges: [],
    metrics: [],
    rpcCalls: [],
    /** Última fotografia de saldo por conta; o que a "API" devolve ao atualizar; erros simulados. */
    snapshots: {},
    fundingApi: {},
    fundingErrors: {},
    /** Central de alertas (como public.alerts) e o que a próxima verificação encontra. */
    alerts: [],
    alertRefresh: null,
    /** Estado da sincronização por conta (como public.sync_state). */
    syncState: {},
    /** Log de sincronização (como public.sync_runs) e o que a próxima sincronização manual faz com cada conta. */
    syncRuns: [],
    syncOutcome: {},
    syncCalls: [],
    /** Auditoria (como public.audit_logs) e os logins/logouts registrados. */
    audit: [],
    authEvents: [],
    /** Cobertura do histórico por conta (como sync_state.history_from/to). */
    coverage: {},
    /** Erros técnicos (como public.error_logs) e respostas forçadas por função (Etapa 25). */
    errorLogs: [],
    rpcOverride: {},
    /** Tracking (Etapa 34): containers, chegadas com origem e eventos. */
    trackingContainers: [],
    trackingRules: [],
    contactProfiles: [],
    contactStages: [],
    contacts: [],
    contactHistory: [],
    contactQueue: [],
    salesWebhooks: [],
    salesLog: [],
    waTriggers: [],
    waTriggerLog: [],
    /** Central 36.17: lembrete de tarefas vencidas (o teste define o horário e as tarefas) e aparelhos. */
    dueSlot: null,
    dueDay: "2026-10-26",
    dueTasks: [],
    dueSeen: [],
    pushSubs: [],
    // Etapa 40: pedidos de autorização OAuth (programa de IA no MCP) e respostas dadas na tela.
    oauthRequests: {},
    oauthDecisions: [],
    /** T4.2: app do Meta da agência (o segredo fica "no cofre": a tela nunca recebe). */
    waApp: { app_id: null, config_id: null, graph_version: "v23.0", secret: null, verify_token: null },
    trackingRuleVersions: [],
    trackingTouchpoints: [],
    trackingEvents: [],
    /** Leads (com first_touch/last_touch já resumidos), compras e jornada por lead. */
    trackingLeads: [],
    trackingPurchases: [],
    trackingJourneys: {},
    /** Monitoramento (Etapa 37): regras de limite (como public.monitor_rules). null = cria os padrões na 1ª leitura. */
    monitorRules: null,
    /** Motor de alertas (37.3): alertas, avaliações, configuração e os alertas que a próxima "Avaliar agora" vai encontrar. */
    monitorAlerts: [],
    monitorRuns: [],
    monitorSettings: { enabled: true, eval_interval_minutes: 60, stale_hours: 3 },
    monitorNextAlerts: [],
    /** Tratar alertas (37.4): linha do tempo de cada alerta. */
    monitorEvents: [],
    /** Notificações (37.5): avisos no sistema, preferências por pessoa (sem linha = padrão) e histórico de envios. */
    monitorNotifications: [],
    monitorPrefs: {},
    monitorDeliveries: [],
    emailReady: true,
    /** Meta CAPI (34.3): destinos (o "token" fica só aqui no servidor simulado), resumo e registro. */
    trackingDestinations: [],
    trackingCapiLog: [],
    capiTokens: {},
    capiTestResult: { ok: true, eventsReceived: 1, message: null },
    /** WhatsApp (34.5-W): cliques com código de rastreio. */
    whatsappClicks: [],
    /** WhatsApp pela API oficial (34.5-W2): conexões (segredos só aqui), conversas recebidas. */
    whatsappConnections: [],
    whatsappConversations: [],
    waSecrets: {},
    /** Atribuição (34.4): linhas prontas por modelo e qualidade por site. */
    trackingAttribution: { last: [], first: [] },
    trackingQuality: [],
    /** Dashboard do cliente (Etapa 19): modelo por cliente (como public.client_report_settings). */
    reportSettings: [],
    /** Inteligência de Resultados (Etapa 39.1): conta do Google (a chave fica só aqui), planilhas por cliente
     *  e as planilhas "do Google" simuladas (id → título e abas com as linhas). */
    sheetsSettings: { service_account_email: null, has_key: false, key_updated_at: null, last_test_at: null, last_test_ok: null, last_test_error: null },
    sheetsKey: null,
    riSources: [],
    sheetsDemo: {},
    /** Planilhas que o Google recusa (não compartilhadas com a conta do CRM). */
    sheetsNotShared: [],
    /** Etapa 39.2: última leitura de cada planilha (id da planilha conectada → leitura). */
    riSnapshots: {},
    /** Acesso do cliente (Etapa 19.2): por cliente, e código do link → cliente (só no servidor). */
    portals: {},
    portalTokens: {},
    /** Divisões (Etapa 19.3): linhas por dia (como metrics_breakdown_daily) e cobertura por conta. */
    breakdowns: [],
    breakdownCoverage: [],
    /** Logo e e-mail semanal (Etapa 19.4): arquivos enviados, remetente (a chave fica só aqui), config e envios por cliente. */
    storageObjects: {},
    emailSettings: { from_name: "Backstage Flow", from_email: "relatorios@backstageflow.com.br", reply_to: null, has_key: false, key_updated_at: null,
      last_test_at: null, last_test_ok: null, last_test_error: null },
    emailKey: null,
    clientEmails: {},
    clientEmailLog: [],
    emailLinks: {},
    /** Resultado do "Resend" simulado: "ok" ou uma mensagem de erro. */
    emailResult: "ok",
    emailsSent: [],
    /** Central de Operações (Etapa 36): setores, pessoas (setores, cargo, permissões). */
    opsSectors: [
      ["Comercial", "#7C3AED"], ["Atendimento", "#06B6D4"], ["Account Manager", "#A855F7"], ["Operacional", "#10B981"],
      ["Design", "#F59E0B"], ["Copy", "#22D3EE"], ["Gestão de Tráfego", "#EF4444"], ["Social Media", "#EC4899"],
      ["Desenvolvimento (Dev)", "#3B82F6"], ["Áudio e Vídeo", "#64748B"],
    ].map(([name, color], i) => ({ id: `5ec70000-0000-4000-8000-0000000000${String(i + 10)}`, name, color, position: i + 1, status: "ativo" })),
    opsMembers: {},
    /** Tarefas da Central (Etapa 36.2). */
    ...seedOpsTasks(),
    /** Envios semanais (Etapa 41). */
    ...seedOpsEnvios(),
    ...seedAdsBuilder(),
  };
}

/**
 * Servidor simulado: recebe { url, method, body } e devolve { status, body }.
 * password = null aceita qualquer senha (modo demonstração); os testes informam a senha certa.
 */
/**
 * Etapa 39.3/39.4 — mesma regra do banco (private.ri_rows): perfil pelas regras do cliente;
 * origem pelo ID (anúncio → conjunto → campanha) ou pelo nome quando é único.
 */
function riRows(db, clientId) {
  const nm = (v) => (v ? String(v).toLowerCase().replace(/\s+/g, " ").trim() || null : null);
  const camps = db.campaigns.filter((c) => c.client_id === clientId);
  const sets = db.adGroups.filter((g) => g.client_id === clientId);
  const ads = db.ads.filter((a) => a.client_id === clientId);
  const byName = (list, name, f = () => true) => list.filter((x) => nm(x.name) === name && f(x));
  const out = [];
  for (const src of db.riSources.filter((x) => x.client_id === clientId)) {
    const snap = db.riSnapshots[src.id];
    for (const e of snap?.rows ?? []) {
      // ID colado na coluna do nome (utm_campaign={{campaign.id}}) vale como ID (correção 21/10/2026).
      const isId = (v) => /^[0-9]{6,}$/.test(String(v ?? "").trim());
      const [cn, sn, an] = [isId(e.cn) ? null : nm(e.cn), isId(e.sn) ? null : nm(e.sn), isId(e.an) ? null : nm(e.an)];
      const [aid, sid, cid] = [e.aid || (isId(e.an) ? e.an.trim() : null), e.sid || (isId(e.sn) ? e.sn.trim() : null), e.cid || (isId(e.cn) ? e.cn.trim() : null)];
      const ai = aid ? ads.find((a) => a.external_id === aid) : null;
      const si = sid ? sets.find((g) => g.external_id === sid) : null;
      const ci = cid ? camps.find((c) => c.external_id === cid) : null;
      let amb = false, campAmb = false;
      let c = ai?.campaign_id ?? si?.campaign_id ?? ci?.id ?? null;
      if (!c && cn) { const m = byName(camps, cn); if (m.length === 1) c = m[0].id; else if (m.length > 1) amb = campAmb = true; }
      let g = ai?.ad_group_id ?? si?.id ?? null;
      if (!g && sn) { const m = byName(sets, sn, (x) => !c || x.campaign_id === c); if (m.length === 1) { g = m[0].id; c = c ?? m[0].campaign_id; } else if (m.length > 1) amb = true; }
      let a = ai?.id ?? null;
      if (!a && an) {
        const m = byName(ads, an, (x) => (g ? x.ad_group_id === g : c ? x.campaign_id === c : true));
        if (m.length === 1) { a = m[0].id; g = g ?? m[0].ad_group_id; c = c ?? m[0].campaign_id; } else if (m.length > 1) amb = true;
      }
      const hasOrigin = Boolean(aid || sid || cid || cn || sn || an);
      const profile = ["lojista", "sacoleiro", "consumidor_final"].includes(src.profile_rules?.[e.p]) ? src.profile_rules[e.p] : "nao_identificado";
      out.push({
        source_id: src.id, row_number: e.n, record_key: e.k, contact: e.h || `${src.id}:${e.k}`, contact_date: e.d ?? null,
        profile_value: e.p || null, profile, sheet_campaign: e.cn?.trim() || e.cid || null, sheet_adset: e.sn?.trim() || e.sid || null, sheet_ad: e.an?.trim() || e.aid || null,
        campaign_id: c, ad_group_id: g, ad_id: a,
        match_level: a ? "anuncio" : g ? "conjunto" : c ? "campanha" : null,
        match_method: !a && !g && !c ? null : (ai || si || ci) ? "id" : "nome",
        match_issue: !hasOrigin ? "sem_origem" : !a && !g && !c ? ((cid || cn) && !campAmb ? "nao_encontrada" : amb ? "nome_ambiguo" : "nao_encontrada")
          : amb ? "nome_ambiguo" : null,
        sale_status: null, sale_date: null, sale_value: null,
      });
    }
  }
  return out;
}

export function createMockBackend(db, { role = "admin", password = null, userId = USER_ID, email = "ander@teste.local", fullName = "Ander Rodrigues" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, role: "authenticated", aud: "authenticated", exp: now + 3600 })}.sig`;
  const user = { id: userId, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

  /** Saldo PIX informado no CRM (mesma regra de private.manual_prepaid_state). */
  function manualState(accountId) {
    const e = (db.manualBalance ??= []).filter((x) => x.ad_account_id === accountId && !x.voided_at);
    const byTime = (x, y) => x.entered_at.localeCompare(y.entered_at) || x.id - y.id;
    const saldo = e.filter((x) => x.kind === "saldo").sort(byTime).at(-1);
    const anchor = saldo ?? e.filter((x) => x.kind === "recarga").sort(byTime)[0];
    if (!anchor) return { available_micros: null, base_micros: null, topups_micros: null, spent_micros: null, anchor_at: null, anchor_kind: null };
    const base = anchor.kind === "saldo" ? anchor.amount_micros : 0;
    const topups = e.filter((x) => x.kind === "recarga" && byTime(x, anchor) >= 0).reduce((t, x) => t + x.amount_micros, 0);
    const spentAll = db.metrics.filter((m) => m.ad_account_id === accountId && m.level === "account" && m.date >= anchor.account_day)
      .reduce((t, m) => t + m.spend_micros, 0);
    const spent = Math.max(spentAll - anchor.day_spend_before_micros, 0);
    return { available_micros: Math.max(base + topups - spent, 0), base_micros: base, topups_micros: topups, spent_micros: spent,
      anchor_at: anchor.entered_at, anchor_kind: anchor.kind };
  }

  /** Saldo de cada conta vinculada (mesma regra de public.account_balances). */
  function balanceRows(p) {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const shift = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const rows = db.adAccounts
        .filter((a) => !a.unlinked_at && !db.clients.find((c) => c.id === a.client_id)?.excluded_at && (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(a.platform_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id)))
        .map((a) => {
          const s = db.snapshots[a.id] ?? {};
          const manual = a.manual_prepaid ? manualState(a.id) : null;
          const spend = db.metrics.filter((m) => m.ad_account_id === a.id && m.level === "account" && m.date >= shift(-2) && m.date <= shift(-1));
          return {
            ad_account_id: a.id, client_id: a.client_id, client_name: db.clients.find((c) => c.id === a.client_id)?.name ?? "",
            platform_id: a.platform_id, external_id: a.external_id, name: a.name, currency: s.currency ?? a.currency, status: a.status ?? "ativa",
            is_prepay: a.is_prepay ?? null, low_balance_days: a.low_balance_days ?? 3, low_balance_amount_micros: a.low_balance_amount_micros ?? null,
            captured_at: s.captured_at ?? null,
            available_micros: a.manual_prepaid ? manual.available_micros : s.available_micros ?? null,
            available_basis: a.manual_prepaid ? "manual_prepaid" : s.available_basis ?? null,
            amount_spent_micros: s.amount_spent_micros ?? null, amount_due_micros: s.amount_due_micros ?? null,
            spend_cap_micros: s.spend_cap_micros ?? null, budget_micros: s.budget_micros ?? null, budget_end_at: s.budget_end_at ?? null,
            funding_description: s.funding_description ?? null,
            issues: a.manual_prepaid ? [...(s.issues ?? []).filter((i) => i !== "sem_saldo"), ...(manual.available_micros === 0 ? ["sem_saldo"] : [])] : s.issues ?? [],
            spend_last_7_days_micros: spend.length ? spend.reduce((t, m) => t + m.spend_micros, 0) : null, spend_days: spend.length,
          };
        });
      return rows;

  }


  /** Números do dashboard do cliente (mesmas regras das funções client_report_*). */
  function reportRpc(fn, p) {
      db.rpcCalls.push({ fn, ...p });
      const accts = db.adAccounts.filter((a) => a.client_id === p.p_client_id && !a.unlinked_at);
      const sumActions = (list) => {
        const out = {};
        for (const m of list) for (const a of m.raw_actions?.actions ?? []) out[a.action_type] = (out[a.action_type] ?? 0) + Number(a.value);
        return out;
      };
      const sum = (list, k) => (list.every((r) => r[k] == null) ? null : list.reduce((t, r) => t + (r[k] ?? 0), 0));
      const KEYS = ["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros", "video_views"];
      const inRange = (m, from, to) => m.date >= from && m.date <= to;
      if (fn === "client_report_accounts") {
        const days = Math.round((Date.parse(p.p_to) - Date.parse(p.p_from)) / 86_400_000) + 1;
        const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
        const pf = shift(p.p_from, -days), pt = shift(p.p_from, -1);
        const reach = (a, from, to) => (db.reachRows ?? []).find((r) => r.ad_account_id === a.id && r.level === "account" &&
          r.entity_external_id === a.external_id && r.period_start === from && r.period_end === to);
        const totals = (a, from, to) => {
          const list = db.metrics.filter((m) => m.ad_account_id === a.id && m.level === "account" && inRange(m, from, to));
          if (!list.length) return null;
          const r = reach(a, from, to);
          const withActions = list.filter((m) => m.raw_actions);
          return { ...Object.fromEntries(KEYS.map((k) => [k, sum(list, k)])), days: list.length, reach: r?.reach ?? null, frequency: r?.frequency ?? null,
            actions: withActions.length ? sumActions(withActions) : {} };
        };
        const out = accts.map((a) => ({
          ad_account_id: a.id, platform_id: a.platform_id, name: a.name, external_id: a.external_id, currency: a.currency,
          cur: totals(a, p.p_from, p.p_to), prev: totals(a, pf, pt), prev_from: pf, prev_to: pt, last_synced_at: db.lastSyncedAt ?? "2026-09-23T22:10:00Z",
        })).sort((x, y) => (y.cur?.spend_micros ?? 0) - (x.cur?.spend_micros ?? 0));
        return out;
      }
      if (fn === "client_report_daily") {
        const ids = new Set(accts.map((a) => a.id));
        return (db.metrics.filter((m) => ids.has(m.ad_account_id) && m.level === "account" && inRange(m, p.p_from, p.p_to))
          .map((m) => ({ ad_account_id: m.ad_account_id, date: m.date, ...Object.fromEntries(KEYS.slice(0, 8).map((k) => [k, m[k] ?? null])),
            actions: m.raw_actions ? sumActions([m]) : null }))
          .sort((x, y) => x.ad_account_id.localeCompare(y.ad_account_id) || x.date.localeCompare(y.date)));
      }
      if (fn === "client_report_campaigns") {
        const ids = new Set(accts.map((a) => a.id));
        const rows = db.metrics.filter((m) => ids.has(m.ad_account_id) && m.level === "campaign" && inRange(m, p.p_from, p.p_to));
        const out = [...Map.groupBy(rows, (m) => m.campaign_id)].map(([cid, list]) => {
          const c = db.campaigns.find((x) => x.id === cid);
          const withActions = list.filter((m) => m.raw_actions);
          return { campaign_id: cid, ad_account_id: c.ad_account_id, name: c.name, status: c.status, objective: c.objective,
            ...Object.fromEntries(KEYS.slice(0, 8).map((k) => [k, sum(list, k)])), actions: withActions.length ? sumActions(withActions) : null };
        }).filter((r) => r.spend_micros > 0 || r.leads > 0 || r.messages > 0 || r.conversions > 0)
          .sort((x, y) => (y.spend_micros ?? 0) - (x.spend_micros ?? 0)).slice(0, 200);
        return out;
      }
      if (fn === "client_report_breakdowns") {
        const ids = new Set(accts.map((a) => a.id));
        const rows = db.breakdowns.filter((b) => ids.has(b.ad_account_id) && inRange(b, p.p_from, p.p_to));
        return [...Map.groupBy(rows, (b) => `${b.ad_account_id}|${b.dimension}|${b.value}`).values()].map((list) => {
          const withActions = list.filter((b) => b.actions);
          const acts = {};
          for (const b of withActions) for (const [k, v] of Object.entries(b.actions)) acts[k] = (acts[k] ?? 0) + v;
          return {
            ad_account_id: list[0].ad_account_id, dimension: list[0].dimension, value: list[0].value,
            ...Object.fromEntries(KEYS.slice(0, 8).map((k) => [k, sum(list, k)])), actions: withActions.length ? acts : null,
          };
        });
      }
      if (fn === "client_report_breakdown_coverage") {
        const ids = new Set(accts.map((a) => a.id));
        return db.breakdownCoverage.filter((c) => ids.has(c.ad_account_id));
      }
      return [];
  }

  return async function handle({ url, method, body: rawBody }) {
    const parse = () => (rawBody ? JSON.parse(rawBody) : {});
    if (method === "OPTIONS") return res(200);

    // --- Respostas forçadas (Etapa 25: erro do banco, dado estranho)
    const forced = Object.entries(db.rpcOverride).find(([fn]) => url.includes(`/rest/v1/rpc/${fn}`));
    if (forced) return res(forced[1].status ?? 200, forced[1].body);

    // --- Auth
    if (url.includes("/auth/v1/token")) {
      // Link de recuperação (PKCE): troca o código por uma sessão.
      if (url.includes("grant_type=pkce")) {
        db.pkceExchanges = (db.pkceExchanges ?? 0) + 1;
        return res(200, { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r1", user });
      }
      if (password != null && parse().password !== password) {
        return res(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return res(200, { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r1", user });
    }
    if (url.includes("/auth/v1/logout")) return res(204);
    // Etapa 40: tela de autorização do OAuth (Supabase Auth como servidor de login do MCP).
    const oauthMatch = url.match(/\/auth\/v1\/oauth\/authorizations\/([^/?]+)(\/consent)?/);
    if (oauthMatch) {
      const reqo = db.oauthRequests[oauthMatch[1]];
      if (!reqo) return res(404, { code: 404, error_code: "oauth_authorization_not_found", msg: "authorization not found" });
      if (oauthMatch[2] && method === "POST") {
        const action = parse().action;
        db.oauthDecisions.push({ id: oauthMatch[1], action });
        reqo.decided = action;
        return res(200, { redirect_url: action === "approve" ? `${reqo.redirect_uri}?code=codigo-teste&state=s1` : `${reqo.redirect_uri}?error=access_denied&state=s1` });
      }
      if (reqo.decided === "approve") return res(200, { redirect_url: `${reqo.redirect_uri}?code=codigo-teste&state=s1` });
      return res(200, { authorization_id: oauthMatch[1], redirect_uri: reqo.redirect_uri, client: { id: "c1", name: reqo.client, uri: "", logo_uri: "" },
        user: { id: user.id, email: user.email }, scope: "openid email" });
    }
    if (url.includes("/auth/v1/user")) return res(200, user);

    // --- Perfis
    if (url.includes("/rest/v1/profiles")) {
      const id = eqParam(url, "id");
      return id ? res(200, db.profiles.find((p) => p.id === id)) : res(200, db.profiles);
    }

    // --- Inteligência de Resultados (Etapa 39.1): conta do Google, planilhas por cliente e leitura simulada
    if (url.includes("/rest/v1/sheets_settings")) return res(200, role === "cliente" || role === "equipe" ? null : db.sheetsSettings);
    if (url.includes("/rest/v1/rpc/sheets_settings_save")) {
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura o Google Sheets." });
      let key;
      try { key = JSON.parse(parse().p_key); } catch { key = null; }
      if (key?.type !== "service_account" || !/@.+\.iam\.gserviceaccount\.com$/.test(key?.client_email ?? "") || !String(key?.private_key ?? "").includes("BEGIN PRIVATE KEY")) {
        return res(400, { code: "22023", message: "Esta não é uma chave de conta de serviço do Google (faltam \"type\", \"client_email\" ou \"private_key\")." });
      }
      db.sheetsKey = key;
      Object.assign(db.sheetsSettings, { service_account_email: key.client_email.toLowerCase(), has_key: true, key_updated_at: new Date().toISOString(),
        last_test_at: null, last_test_ok: null, last_test_error: null });
      return res(200, key.client_email.toLowerCase());
    }
    if (url.includes("/rest/v1/rpc/sheets_settings_remove_key")) {
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura o Google Sheets." });
      db.sheetsKey = null;
      Object.assign(db.sheetsSettings, { has_key: false, key_updated_at: new Date().toISOString(), last_test_at: null, last_test_ok: null, last_test_error: null });
      return res(204);
    }
    if (url.includes("/rest/v1/ri_snapshots")) {
      const sourceId = eqParam(url, "source_id");
      const src = db.riSources.find((r) => r.id === sourceId);
      const visible = src && role !== "cliente" && role !== "equipe" && (role === "admin" || db.access.some((x) => x.user_id === userId && x.client_id === src.client_id));
      const snap = visible ? db.riSnapshots[sourceId] : null;
      return res(200, snap ? { read_at: snap.read_at, trigger: snap.trigger, row_count: snap.row_count, stats: snap.stats } : null);
    }
    if (url.includes("/rest/v1/rpc/ri_records_extra")) {
      const p = parse();
      const canView = ["admin", "gestor", "operador", "visualizador"].includes(role)
        && (role === "admin" || db.access.some((x) => x.user_id === userId && x.client_id === p.p_client_id));
      if (!canView) return res(403, { code: "42501", message: "Sem permissão para ver os resultados deste cliente." });
      const rows = db.riSources.filter((x) => x.client_id === p.p_client_id).flatMap((x) => db.riSnapshots[x.id]?.rows ?? []);
      return res(200, rows.filter((e) => p.p_rows.includes(e.n)).map((e) => ({
        row_number: e.n, utm_source: e.us ?? null, utm_medium: e.um ?? null, click: e.gc ? "google" : e.fb ? "meta" : null, custom: e.x ?? {},
      })));
    }
    if (url.includes("/rest/v1/rpc/ri_results") || url.includes("/rest/v1/rpc/ri_daily") || url.includes("/rest/v1/rpc/ri_records") || url.includes("/rest/v1/rpc/ri_quality")) {
      const p = parse();
      const canView = ["admin", "gestor", "operador", "visualizador"].includes(role)
        && (role === "admin" || db.access.some((x) => x.user_id === userId && x.client_id === p.p_client_id));
      if (!canView) return res(403, { code: "42501", message: "Sem permissão para ver os resultados deste cliente." });
      const all = riRows(db, p.p_client_id);
      const inPeriod = (r) => r.contact_date && r.contact_date >= p.p_from && r.contact_date <= p.p_to;
      const uniq = (list, f = () => true) => new Set(list.filter(f).map((r) => r.contact)).size;
      const PROFILES = ["lojista", "sacoleiro", "consumidor_final", "nao_identificado"];
      if (url.includes("/rpc/ri_daily")) {
        const list = all.filter((r) => inPeriod(r) && (!p.p_campaign_id || r.campaign_id === p.p_campaign_id) && (!p.p_ad_group_id || r.ad_group_id === p.p_ad_group_id));
        const days = [...new Set(list.map((r) => r.contact_date))].sort();
        return res(200, days.map((day) => {
          const d = list.filter((r) => r.contact_date === day);
          return { day, contacts: uniq(d), ...Object.fromEntries(PROFILES.map((pr) => [pr, uniq(d, (r) => r.profile === pr)])) };
        }));
      }
      if (url.includes("/rpc/ri_quality")) {
        const count = (f) => all.filter(f).length;
        const group = (list, key) => Object.values(list.reduce((acc, r) => {
          const k = key(r);
          (acc[k] ??= { r, rows: 0 }).rows++;
          return acc;
        }, {})).sort((a, b) => b.rows - a.rows);
        const rulesOf = (r) => db.riSources.find((x) => x.id === r.source_id)?.profile_rules ?? {};
        return res(200, {
          rows: all.length, contacts: uniq(all),
          origin_ad: count((r) => r.match_level === "anuncio"), origin_ad_group: count((r) => r.match_level === "conjunto"),
          origin_campaign: count((r) => r.match_level === "campanha"), origin_by_name: count((r) => r.match_method === "nome"),
          no_origin: count((r) => r.match_issue === "sem_origem"), not_found: count((r) => r.match_issue === "nao_encontrada"),
          ambiguous: count((r) => r.match_issue === "nome_ambiguo"), no_date: count((r) => !r.contact_date), empty_profile: count((r) => !r.profile_value),
          unknown_profiles: group(all.filter((r) => r.profile_value && !(r.profile_value in rulesOf(r))), (r) => r.profile_value)
            .map((g) => ({ value: g.r.profile_value, rows: g.rows })),
          unmatched_names: group(all.filter((r) => r.match_issue === "nao_encontrada" || r.match_issue === "nome_ambiguo"),
            (r) => [r.sheet_campaign, r.sheet_adset, r.sheet_ad, r.match_issue].join("|"))
            .map((g) => ({ campaign: g.r.sheet_campaign, adset: g.r.sheet_adset, ad: g.r.sheet_ad, issue: g.r.match_issue, rows: g.rows })),
          sources: db.riSources.filter((x) => x.client_id === p.p_client_id && db.riSnapshots[x.id])
            .map((x) => ({ source_id: x.id, read_at: db.riSnapshots[x.id].read_at, trigger: db.riSnapshots[x.id].trigger, row_count: db.riSnapshots[x.id].row_count, stats: db.riSnapshots[x.id].stats })),
        });
      }
      if (url.includes("/rpc/ri_records")) {
        const list = all.filter((r) => (p.p_issue === "sem_data" ? !r.contact_date : !p.p_from || inPeriod(r))
          && (!p.p_profile || r.profile === p.p_profile) && (!p.p_campaign_id || r.campaign_id === p.p_campaign_id)
          && (!p.p_ad_group_id || r.ad_group_id === p.p_ad_group_id) && (!p.p_ad_id || r.ad_id === p.p_ad_id)
          && (!p.p_issue || p.p_issue === "sem_data"
            || (p.p_issue === "sem_campanha" ? !r.sheet_campaign && !r.campaign_id
              : p.p_issue === "campanha_nao_ligada" ? Boolean(r.sheet_campaign) && !r.campaign_id : r.match_issue === p.p_issue)))
          .sort((a, b) => (b.contact_date ?? "").localeCompare(a.contact_date ?? "") || b.row_number - a.row_number);
        const name = (list2, id) => list2.find((x) => x.id === id)?.name ?? null;
        return res(200, list.slice(p.p_offset, p.p_offset + p.p_limit).map(({ contact, source_id, ...r }) => ({
          ...r, campaign_name: name(db.campaigns, r.campaign_id), ad_group_name: name(db.adGroups, r.ad_group_id), ad_name: name(db.ads, r.ad_id), total_count: list.length,
        })));
      }
      const pr = all.filter(inPeriod);
      const scope = pr.filter((r) => (!p.p_campaign_id || r.campaign_id === p.p_campaign_id) && (!p.p_ad_group_id || r.ad_group_id === p.p_ad_group_id));
      const entKey = { campaign: "campaign_id", ad_group: "ad_group_id", ad: "ad_id" }[p.p_level];
      const ids = [...new Set(scope.map((r) => r[entKey]).filter(Boolean))];
      const items = ids.map((id) => {
        const rows = scope.filter((r) => r[entKey] === id);
        const e = p.p_level === "campaign" ? db.campaigns.find((c) => c.id === id) : p.p_level === "ad_group" ? db.adGroups.find((g) => g.id === id) : db.ads.find((a) => a.id === id);
        const campaignId = p.p_level === "campaign" ? id : e?.campaign_id;
        const groupId = p.p_level === "ad_group" ? id : p.p_level === "ad" ? e?.ad_group_id : null;
        const spend = {};
        let leads = null, messages = null;
        for (const m of db.metrics) {
          if (m.client_id === p.p_client_id && m.level === p.p_level && m[entKey] === id && m.date >= p.p_from && m.date <= p.p_to && !m.superseded) {
            spend[m.currency] = (spend[m.currency] ?? 0) + m.spend_micros;
            if (m.leads != null) leads = (leads ?? 0) + m.leads;
            if (m.messages != null) messages = (messages ?? 0) + m.messages;
          }
        }
        return {
          id, name: e?.name ?? "—", status: e?.status ?? null, platform_id: e?.platform_id ?? null,
          campaign_id: campaignId ?? null, campaign_name: db.campaigns.find((c) => c.id === campaignId)?.name ?? null,
          ad_group_id: groupId ?? null, ad_group_name: db.adGroups.find((g) => g.id === groupId)?.name ?? null, thumbnail_url: e?.thumbnail_url ?? null,
          contacts: uniq(rows), ...Object.fromEntries(PROFILES.map((x) => [x, uniq(rows, (r) => r.profile === x)])),
          by_name: rows.filter((r) => r.match_method === "nome").length,
          leads, messages,
          spend: Object.keys(spend).sort().map((currency) => ({ currency, spend_micros: spend[currency] })),
        };
      }).sort((a, b) => b.contacts - a.contacts);
      const withEnt = uniq(scope, (r) => r[entKey]);
      const snaps = db.riSources.filter((x) => x.client_id === p.p_client_id).map((x) => db.riSnapshots[x.id]).filter(Boolean);
      return res(200, {
        read_at: snaps.map((x) => x.read_at).sort().at(-1) ?? null, sources: snaps.length, level: p.p_level,
        totals: {
          rows: pr.length, contacts: uniq(pr), ...Object.fromEntries(PROFILES.map((x) => [x, uniq(pr, (r) => r.profile === x)])),
          with_origin: uniq(pr, (r) => r.match_level), origin_ad: pr.filter((r) => r.match_level === "anuncio").length,
          origin_ad_group: pr.filter((r) => r.match_level === "conjunto").length, origin_campaign: pr.filter((r) => r.match_level === "campanha").length,
          origin_by_name: pr.filter((r) => r.match_method === "nome").length, no_origin: pr.filter((r) => r.match_issue === "sem_origem").length,
          not_found: pr.filter((r) => r.match_issue === "nao_encontrada").length, ambiguous: pr.filter((r) => r.match_issue === "nome_ambiguo").length,
        },
        gaps: Object.fromEntries(PROFILES.map((x) => [x, {
          no_campaign: uniq(pr, (r) => r.profile === x && !r.sheet_campaign && !r.campaign_id),
          not_linked: uniq(pr, (r) => r.profile === x && Boolean(r.sheet_campaign) && !r.campaign_id),
        }])),
        outside: { no_date: all.filter((r) => !r.contact_date).length, all_rows: all.length },
        scope_contacts: uniq(scope), scope_without_level: uniq(scope) - withEnt, items,
      });
    }
    if (url.includes("/rest/v1/rpc/ri_source_set_enabled")) {
      const p = parse();
      const src = db.riSources.find((r) => r.id === p.p_id);
      const canEdit = src && (role === "admin" || (role === "gestor" && db.access.some((x) => x.user_id === userId && x.client_id === src.client_id)));
      if (!canEdit) return res(403, { code: "42501", message: "Sem permissão para configurar a planilha deste cliente." });
      src.enabled = Boolean(p.p_enabled);
      return res(204);
    }
    if (url.includes("/rest/v1/ri_sources")) {
      const clientId = eqParam(url, "client_id");
      const visible = role !== "cliente" && role !== "equipe" && (role === "admin" || db.access.some((x) => x.user_id === userId && x.client_id === clientId));
      return res(200, visible ? db.riSources.filter((r) => r.client_id === clientId) : []);
    }
    if (url.includes("/rest/v1/rpc/ri_source_save")) {
      const p = parse();
      const old = db.riSources.find((r) => r.id === p.p_id);
      const clientId = old?.client_id ?? p.p_client_id;
      const canEdit = role === "admin" || (role === "gestor" && db.access.some((x) => x.user_id === userId && x.client_id === clientId));
      if (!canEdit) return res(403, { code: "42501", message: "Sem permissão para configurar a planilha deste cliente." });
      if (!p.p_mapping?.profile) return res(400, { code: "22023", message: "Escolha a coluna do perfil comercial." });
      if (!old && db.riSources.some((r) => r.client_id === clientId && r.spreadsheet_id === p.p_spreadsheet_id && r.sheet_name === p.p_sheet_name)) {
        return res(409, { code: "23505", message: "Esta aba desta planilha já está conectada a este cliente." });
      }
      const row = { client_id: clientId, spreadsheet_id: p.p_spreadsheet_id, spreadsheet_title: p.p_spreadsheet_title, sheet_name: p.p_sheet_name,
        header_row: p.p_header_row, mapping: p.p_mapping, profile_rules: p.p_profile_rules, enabled: old?.enabled ?? true, updated_at: new Date().toISOString(),
        ...(old ? {} : { read_status: "nunca", last_attempt_at: null, last_success_at: null, last_error: null, consecutive_failures: 0 }) };
      if (old) Object.assign(old, row);
      else db.riSources.push({ id: `51ee0000-0000-4000-8000-${String(db.riSources.length + 1).padStart(12, "0")}`, created_at: row.updated_at, ...row });
      return res(200, old?.id ?? db.riSources.at(-1).id);
    }
    if (url.includes("/functions/v1/sheets")) {
      const b = parse();
      db.rpcCalls.push({ fn: "sheets", ...b });
      const fail = (status, code, message) => res(status, { error: { code, message } });
      const allowed = b.action === "test_settings" ? ["admin"] : b.action === "read_now" ? ["admin", "gestor", "operador"] : ["admin", "gestor"];
      if (!allowed.includes(role)) return fail(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
      if (!db.sheetsKey) return fail(400, "SHEETS_NOT_CONFIGURED", "A conta do Google ainda não foi configurada (Configurações → Integrações → Google Sheets).");
      if (b.action === "test_settings") {
        Object.assign(db.sheetsSettings, { last_test_at: new Date().toISOString(), last_test_ok: true, last_test_error: null });
        return res(200, { data: { ok: true, serviceAccountEmail: db.sheetsSettings.service_account_email } });
      }
      if (b.action === "read_now") {
        const src = db.riSources.find((r) => r.id === b.sourceId);
        if (!src || (role !== "admin" && !db.access.some((x) => x.user_id === userId && x.client_id === src.client_id))) return fail(404, "NOT_FOUND", "Planilha não encontrada.");
        const now = new Date().toISOString();
        src.last_attempt_at = now;
        const error = db.sheetsNotShared.includes(src.spreadsheet_id)
          ? `A planilha não está compartilhada com o CRM. No Google Sheets, clique em Compartilhar e adicione ${db.sheetsSettings.service_account_email} como Leitor.`
          : !db.sheetsDemo[src.spreadsheet_id]?.tabs[src.sheet_name] ? "A aba escolhida não existe mais na planilha (pode ter sido renomeada). Escolha a aba de novo." : null;
        if (error) {
          Object.assign(src, { read_status: "erro", last_error: error, consecutive_failures: (src.consecutive_failures ?? 0) + 1 });
          return fail(400, "SHEETS_READ_FAILED", error);
        }
        const [head = [], ...rest] = db.sheetsDemo[src.spreadsheet_id].tabs[src.sheet_name].slice(src.header_row - 1);
        const body = rest.filter((r) => r.some((c) => String(c).trim()));
        const col = (f) => (src.mapping[f] ? head.map((h) => h.trim()).indexOf(src.mapping[f]) : -1);
        const cell = (r, f) => (col(f) >= 0 ? String(r[col(f)] ?? "").trim() : "");
        const stats = {
          total: body.length, stored: body.length, duplicates: 0, noDate: body.filter((r) => !cell(r, "contact_date")).length, invalidDates: 0,
          noProfile: body.filter((r) => !cell(r, "profile")).length,
          noOrigin: body.filter((r) => ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name"].every((f) => !cell(r, f))).length,
          invalidIds: 0, noContact: 0, missingColumns: Object.values(src.mapping).filter((h) => !head.map((x) => x.trim()).includes(h)),
        };
        const dmy = (v) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null); };
        const norm = (v) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
        // Modo CNPJ (22/10/2026): 14 números = "__cnpj__"; o resto fica vazio (o número nunca é guardado).
        const cnpjMode = src.profile_rules?.__cnpj__ === "lojista";
        const profileOf = (v) => (cnpjMode ? (/^[\d.\-/\s]+$/.test(v) && v.replace(/\D/g, "").length === 14 ? "__cnpj__" : "") : norm(v));
        const rows = body.map((r, i) => {
          const contact = cell(r, "contact_key").replace(/\D/g, "");
          return { n: src.header_row + 1 + i, k: cell(r, "record_id") ? `id:${cell(r, "record_id")}` : `L${src.header_row + 1 + i}`,
            h: contact ? `hash-${[...contact].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(16)}` : null, d: dmy(cell(r, "contact_date")), p: profileOf(cell(r, "profile")),
            cid: cell(r, "campaign_id") || null, cn: cell(r, "campaign_name") || null, sid: cell(r, "adset_id") || null, sn: cell(r, "adset_name") || null,
            aid: cell(r, "ad_id") || null, an: cell(r, "ad_name") || null,
            ...(cell(r, "utm_source") ? { us: cell(r, "utm_source") } : {}), ...(cell(r, "utm_medium") ? { um: cell(r, "utm_medium") } : {}),
            ...(cell(r, "gclid") ? { gc: true } : {}), ...(cell(r, "fbclid") ? { fb: true } : {}),
            ...(() => {
              // parâmetros personalizados ("x:<nome>" → coluna); o Nome nunca é guardado
              const x = Object.fromEntries(Object.entries(src.mapping).filter(([k]) => k.startsWith("x:"))
                .map(([k, col]) => [k.slice(2), String(r[head.map((h) => h.trim()).indexOf(col)] ?? "").trim()]).filter(([, v]) => v));
              return Object.keys(x).length ? { x } : {};
            })() };
        });
        db.riSnapshots[src.id] = { read_at: now, trigger: "manual", row_count: body.length, stats, rows };
        Object.assign(src, { read_status: "ok", last_success_at: now, last_error: null, consecutive_failures: 0 });
        return res(200, { data: { sourceId: src.id, status: "ok", rows: body.length } });
      }
      const id = b.action === "inspect" ? (/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/.exec(b.url)?.[1] ?? (/^[A-Za-z0-9_-]{20,100}$/.test(b.url.trim()) ? b.url.trim() : null)) : b.spreadsheetId;
      if (!id) return fail(400, "INVALID_INPUT", "Link da planilha não reconhecido. Copie o endereço da planilha aberta no navegador.");
      if (db.sheetsNotShared.includes(id)) {
        return fail(400, "SHEETS_NOT_SHARED", `A planilha não está compartilhada com o CRM. No Google Sheets, clique em Compartilhar e adicione ${db.sheetsSettings.service_account_email} como Leitor.`);
      }
      const book = db.sheetsDemo[id];
      if (!book) return fail(404, "SHEETS_NOT_FOUND", "Planilha não encontrada. Confira o link.");
      if (b.action === "inspect") {
        return res(200, { data: { spreadsheetId: id, title: book.title,
          tabs: Object.entries(book.tabs).map(([title, rows]) => ({ title, rowCount: Math.max(rows.length, 1000), columnCount: 26 })) } });
      }
      const rows = book.tabs[b.sheet];
      if (!rows) return fail(400, "SHEETS_TAB_NOT_FOUND", "A aba escolhida não existe mais na planilha (pode ter sido renomeada). Escolha a aba de novo.");
      const [head = [], ...rest] = rows.slice(b.headerRow - 1);
      const body = rest.filter((r) => r.some((c) => String(c).trim()));
      if (b.action === "preview") return res(200, { data: { headers: head.map((h) => h.trim()), rows: body.slice(0, 20) } });
      const idx = head.map((h) => h.trim()).indexOf(b.column);
      if (idx < 0) return fail(400, "SHEETS_COLUMN_NOT_FOUND", `A coluna "${b.column}" não existe no cabeçalho da planilha.`);
      const norm = (v) => String(v ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
      const map = new Map();
      for (const r of body) {
        const raw = String(r[idx] ?? "").trim();
        const k = norm(raw);
        const it = map.get(k) ?? { value: k, example: raw, count: 0 };
        it.count++;
        map.set(k, it);
      }
      return res(200, { data: { totalRows: body.length, values: [...map.values()].sort((x, y) => y.count - x.count || x.value.localeCompare(y.value)) } });
    }

    // --- Dashboard do cliente (Etapa 19; mesmas regras das funções client_report_*)
    if (url.includes("/rest/v1/client_report_settings")) {
      const clientId = eqParam(url, "client_id");
      if (method === "GET") return res(200, db.reportSettings.find((r) => r.client_id === clientId) ?? null);
      if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "new row violates row-level security policy" });
      if (method === "POST") {
        // upsert: só as colunas enviadas mudam (a logo continua)
        const row = parse();
        const old = db.reportSettings.find((r) => r.client_id === row.client_id);
        db.reportSettings = db.reportSettings.filter((r) => r.client_id !== row.client_id);
        db.reportSettings.push({ ...old, ...row, updated_at: new Date().toISOString() });
        return res(201);
      }
      if (method === "PATCH") {
        const row = db.reportSettings.find((r) => r.client_id === clientId);
        if (row) Object.assign(row, parse(), { updated_at: new Date().toISOString() });
        return res(204);
      }
    }
    // --- Logo (Storage público client-logos; só admin/gestor enviam e apagam)
    if (url.includes("/storage/v1/object") && !url.includes("/ops-files/")) {
      const path = decodeURIComponent(new URL(url).pathname.replace(/^.*\/storage\/v1\/object\/(public\/)?client-logos\/?/, ""));
      if (method === "GET") return db.storageObjects[path] ? { status: 200, body: undefined } : res(404, { message: "Object not found" });
      if (!["admin", "gestor"].includes(role)) return res(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      if (method === "POST" || method === "PUT") {
        db.storageObjects[path] = { size: rawBody?.length ?? 0 };
        return res(200, { Key: `client-logos/${path}` });
      }
      if (method === "DELETE") {
        const prefixes = parse().prefixes ?? [];
        for (const p of prefixes) delete db.storageObjects[p];
        return res(200, prefixes.map((name) => ({ name })));
      }
    }
    // --- Central de Operações (Etapa 36; mesmas regras de private.ops_can)
    const OPS_ALL = ["ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.tasks.archive", "ops.tasks.assign",
      "ops.tasks.sector", "ops.cards.move", "ops.clients.view", "ops.history.edit", "ops.meetings.manage", "ops.dashboard.view", "ops.commercial", "ops.envios"];
    const me = db.opsMembers[userId];
    const opsBase = role === "admin" ? [...OPS_ALL, "ops.admin"]
      : role !== "cliente" && me?.active && me.permissions.includes("ops.access") ? me.permissions : [];
    // "ops.am": Account Manager de algum cliente no fluxo (Etapa 36.3; vem do banco).
    const opsPerms = role !== "admin" && opsBase.length && Object.values(db.opsClientOps ?? {}).some((o) => o.am_user_id === userId)
      ? [...opsBase, "ops.am"] : opsBase;
    const opsDeny = (msg = "Só o administrador pode mudar a configuração da Central de Operações.") => res(403, { code: "42501", message: msg });
    const opsBad = (message) => res(400, { code: "22023", message });
    if (url.includes("/rest/v1/rpc/ops_my_permissions")) return res(200, opsPerms);
    // Central 36.17: lembrete de tarefas vencidas (8h/12h/17h) só para o responsável; "Vi" por dia e horário.
    if (url.includes("/rest/v1/rpc/ops_due_reminder_seen")) {
      if (!opsPerms.includes("ops.access")) return opsDeny("Sem acesso à Central de Operações.");
      const p = parse();
      if (p.p_day !== db.dueDay || Number(p.p_slot) !== db.dueSlot) return opsBad("Lembrete fora do horário atual.");
      db.dueSeen.push(`${userId}:${p.p_day}:${p.p_slot}`);
      return res(204);
    }
    if (url.includes("/rest/v1/rpc/ops_due_reminder")) {
      if (!opsPerms.includes("ops.access")) return res(200, { slot: null, seen: true, tasks: [] });
      const seen = db.dueSlot == null || db.dueSeen.includes(`${userId}:${db.dueDay}:${db.dueSlot}`);
      return res(200, { day: db.dueDay, slot: db.dueSlot, seen, tasks: db.dueTasks.filter((t) => t.principal === userId).map(({ principal: _p, ...t }) => t) });
    }
    if (url.includes("/rest/v1/rpc/ops_push_subscribe")) {
      if (!opsPerms.includes("ops.access")) return opsDeny("Sem acesso à Central de Operações.");
      const p = parse();
      if (!/^https:\/\//.test(p.p_endpoint ?? "")) return opsBad("Autorização do navegador inválida. Tente de novo.");
      const ex = db.pushSubs.find((x) => x.endpoint === p.p_endpoint);
      if (ex) Object.assign(ex, { user_id: userId, disabled_at: null });
      else db.pushSubs.push({ id: crypto.randomUUID(), user_id: userId, endpoint: p.p_endpoint, p256dh: p.p_p256dh, auth: p.p_auth, device: p.p_device,
        created_at: new Date().toISOString(), last_sent_at: null, last_error: null, disabled_at: null });
      return res(200, db.pushSubs.find((x) => x.endpoint === p.p_endpoint).id);
    }
    if (url.includes("/rest/v1/rpc/ops_push_unsubscribe")) {
      const p = parse();
      const ex = db.pushSubs.find((x) => x.endpoint === p.p_endpoint && x.user_id === userId);
      if (ex) ex.disabled_at = new Date().toISOString();
      return res(204);
    }
    if (url.includes("/rest/v1/ops_push_subscriptions")) {
      return res(200, db.pushSubs.filter((x) => x.user_id === userId).map(({ id, device, created_at, last_sent_at, last_error, disabled_at }) => ({ id, device, created_at, last_sent_at, last_error, disabled_at })));
    }
    const adsBuilder = handleAdsBuilder({ db, url, parse, userId, role, res });
    if (adsBuilder) return adsBuilder;
    const opsEnvio = handleOpsEnvios({ db, url, parse, userId, opsPerms, res });
    if (opsEnvio) return opsEnvio;
    const opsTask = handleOpsTasks({ db, url, method, parse, rawBody, role, userId, opsPerms, res });
    if (opsTask) return opsTask;
    if (url.includes("/rest/v1/ops_sectors")) {
      return res(200, opsPerms.includes("ops.access") ? [...db.opsSectors].sort((a, b) => a.position - b.position) : []);
    }
    if (url.includes("/rest/v1/rpc/ops_team")) {
      if (!opsPerms.includes("ops.access")) return res(200, []);
      return res(200, db.profiles.filter((p) => p.role !== "cliente" && (db.opsMembers[p.id] || role === "admin")).map((p) => {
        const m = db.opsMembers[p.id];
        return { user_id: p.id, full_name: p.full_name, email: p.email, role: p.role, profile_active: p.active, in_ops: Boolean(m),
          job_title: m?.job_title ?? null, member_active: m?.active ?? false, joins_meetings: m?.joins_meetings ?? false,
          primary_sector_id: m?.primary ?? null, secondary_sector_ids: m?.secondary ?? [], permissions: role === "admin" ? (m?.permissions ?? []) : null };
      }).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    }
    if (url.includes("/rest/v1/rpc/ops_sector_save")) {
      const p = parse();
      if (role !== "admin") return opsDeny();
      if (db.opsSectors.some((x) => x.status !== "arquivado" && x.name.toLowerCase() === p.p_name.trim().toLowerCase() && x.id !== p.p_id)) {
        return opsBad("Já existe um setor com esse nome.");
      }
      db.rpcCalls.push({ fn: "ops_sector_save", ...p });
      if (p.p_id) Object.assign(db.opsSectors.find((x) => x.id === p.p_id), { name: p.p_name.trim(), color: p.p_color });
      else {
        const id = crypto.randomUUID();
        db.opsSectors.push({ id, name: p.p_name.trim(), color: p.p_color, position: Math.max(0, ...db.opsSectors.map((x) => x.position)) + 1, status: "ativo" });
        return res(200, id);
      }
      return res(200, p.p_id);
    }
    if (url.includes("/rest/v1/rpc/ops_sector_reorder")) {
      if (role !== "admin") return opsDeny();
      parse().p_ids.forEach((id, i) => { const x = db.opsSectors.find((y) => y.id === id); if (x) x.position = i + 1; });
      return res(204);
    }
    if (url.includes("/rest/v1/rpc/ops_sector_set_status")) {
      const p = parse();
      if (role !== "admin") return opsDeny();
      const members = Object.values(db.opsMembers).filter((m) => m.primary === p.p_id || m.secondary.includes(p.p_id));
      if (p.p_status !== "ativo" && members.length) {
        if (!p.p_move_to) return opsBad(`Este setor tem ${members.length} pessoa(s). Escolha para qual setor elas vão antes de desativar.`);
        for (const m of members) {
          if (m.primary === p.p_id) { m.primary = p.p_move_to; m.secondary = m.secondary.filter((s) => s !== p.p_move_to); }
          else m.secondary = [...new Set(m.secondary.map((s) => (s === p.p_id ? p.p_move_to : s)))].filter((s) => s !== m.primary);
        }
      }
      db.opsSectors.find((x) => x.id === p.p_id).status = p.p_status;
      db.rpcCalls.push({ fn: "ops_sector_set_status", ...p });
      return res(204);
    }
    if (url.includes("/rest/v1/rpc/ops_member_save")) {
      const p = parse();
      if (role !== "admin") return opsDeny();
      const prof = db.profiles.find((x) => x.id === p.p_user_id);
      if (!prof) return opsBad("Usuário não encontrado.");
      if (prof.role === "cliente") return opsBad("Usuários com papel Cliente não entram na Central de Operações.");
      if (!p.p_primary_sector) return opsBad("Escolha o setor principal.");
      db.opsMembers[p.p_user_id] = { primary: p.p_primary_sector, secondary: (p.p_secondary ?? []).filter((s) => s !== p.p_primary_sector),
        job_title: p.p_job_title, active: p.p_active, joins_meetings: p.p_joins_meetings, permissions: p.p_permissions ?? [] };
      db.rpcCalls.push({ fn: "ops_member_save", ...p });
      return res(204);
    }
    // --- E-mail semanal (Etapa 19.4)
    const canEditEmail = ["admin", "gestor"].includes(role);
    if (url.includes("/rest/v1/email_settings")) return res(200, role === "admin" ? db.emailSettings : null);
    if (url.includes("/rest/v1/rpc/email_settings_save")) {
      const p = parse();
      db.rpcCalls.push({ fn: "email_settings_save", ...p, p_api_key: p.p_api_key ? "***" : null });
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura o envio de e-mails." });
      if (p.p_api_key != null && !/^re_[A-Za-z0-9_]{10,200}$/.test(p.p_api_key)) return res(400, { code: "22023", message: 'A chave do Resend começa com "re_". Confira e cole de novo.' });
      Object.assign(db.emailSettings, { from_name: p.p_from_name, from_email: p.p_from_email.toLowerCase(), reply_to: p.p_reply_to || null });
      if (p.p_api_key) {
        db.emailKey = p.p_api_key;
        Object.assign(db.emailSettings, { has_key: true, key_updated_at: new Date().toISOString(), last_test_at: null, last_test_ok: null, last_test_error: null });
      }
      return res(204);
    }
    if (url.includes("/rest/v1/rpc/email_settings_remove_key")) {
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura o envio de e-mails." });
      db.emailKey = null;
      Object.assign(db.emailSettings, { has_key: false, key_updated_at: new Date().toISOString(), last_test_at: null, last_test_ok: null, last_test_error: null });
      return res(204);
    }
    if (url.includes("/rest/v1/client_report_email_log")) {
      const clientId = eqParam(url, "client_id");
      return res(200, db.clientEmailLog.filter((l) => l.client_id === clientId).sort((a, b) => b.id - a.id).slice(0, 10));
    }
    if (url.includes("/rest/v1/client_report_email")) {
      const clientId = eqParam(url, "client_id");
      if (method === "GET") return res(200, role === "cliente" ? null : db.clientEmails[clientId] ?? null);
      if (!canEditEmail) return res(403, { code: "42501", message: "new row violates row-level security policy" });
      const row = parse();
      if ((row.recipients ?? []).length > 10) return res(400, { code: "23514", message: "violates check constraint" });
      if (method === "POST") db.clientEmails[row.client_id] = { last_sent_at: null, ...row };
      else Object.assign(db.clientEmails[clientId], row);
      return res(method === "POST" ? 201 : 204);
    }
    const currentLink = (clientId) => {
      const t = db.emailLinks[clientId];
      const portal = db.portals[clientId];
      return t && portal?.link_enabled && portal.link_token === t && (!portal.link_expires_at || Date.parse(portal.link_expires_at) > Date.now()) ? t : null;
    };
    if (url.includes("/rest/v1/rpc/client_report_email_link_status")) {
      const p = parse();
      return res(200, !db.emailLinks[p.p_client_id] ? "sem_link" : currentLink(p.p_client_id) ? "ok" : "desatualizado");
    }
    if (url.includes("/rest/v1/rpc/client_report_email_set_link")) {
      const p = parse();
      if (!canEditEmail) return res(403, { code: "42501", message: "Sem permissão para mudar o e-mail deste cliente." });
      const token = (p.p_link ?? "").match(/\/r\/([A-Za-z0-9_-]{43})(?:[/?#].*)?$/)?.[1];
      if (!token) return res(400, { code: "22023", message: "Cole o link completo (…/r/código)." });
      const portal = db.portals[p.p_client_id];
      if (!portal?.link_enabled || portal.link_token !== token) {
        return res(400, { code: "22023", message: 'Este não é o link atual do cliente (ou o link está desligado). Gere/copie o link no card "Acesso do cliente".' });
      }
      db.emailLinks[p.p_client_id] = token;
      return res(204);
    }
    if (url.includes("/functions/v1/client-report-email")) {
      const b = parse();
      db.rpcCalls.push({ fn: "client-report-email", ...b });
      const fail = (status, code, message) => res(status, { error: { code, message } });
      if (b.action === "test_settings" ? role !== "admin" : !canEditEmail) return fail(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
      if (!db.emailSettings.has_key) return fail(400, "EMAIL_NOT_CONFIGURED", "O envio de e-mails ainda não foi configurado (falta a chave do Resend em Configurações → Integrações).");
      const resend = (to, subject) => {
        if (db.emailResult !== "ok") return db.emailResult;
        db.emailsSent.push({ to, subject });
        return null;
      };
      if (b.action === "test_settings") {
        const err = resend(email, "Teste de envio · Backstage Flow");
        Object.assign(db.emailSettings, { last_test_at: new Date().toISOString(), last_test_ok: !err, last_test_error: err });
        return err ? fail(400, "EMAIL_SEND_FAILED", err) : res(200, { data: { sentTo: email } });
      }
      const client = db.clients.find((c) => c.id === b.clientId);
      if (!client) return fail(404, "NOT_FOUND", "Cliente não encontrado.");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: client.timezone }).format(new Date());
      const shift = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const week = { from: shift(-7), to: shift(-1) };
      const trigger = b.action === "test" ? "teste" : "manual";
      const log = (status, detail, n = 0) => {
        db.clientEmailLog.push({ id: db.clientEmailLog.length + 1, client_id: client.id, created_at: new Date().toISOString(), trigger, status,
          recipients: n, period_from: week.from, period_to: week.to, detail });
        return { status, detail, sent: n };
      };
      const cfg = db.clientEmails[client.id];
      const to = b.action === "test" ? [email] : (cfg?.recipients ?? []);
      if (!to.length) return res(200, { data: log("pulado", "Nenhum destinatário cadastrado.") });
      const hasData = reportRpc("client_report_accounts", { p_client_id: client.id, p_from: week.from, p_to: week.to }).some((a) => a.cur);
      if (!hasData) return res(200, { data: log("pulado", "Sem dados de anúncios nesta semana: nada foi enviado.") });
      const subject = `${b.action === "test" ? "[Teste] " : ""}${client.name}: resultados da semana`;
      const errors = to.map((t) => resend(t, subject)).filter(Boolean);
      const sent = to.length - errors.length;
      const r = log(sent ? "enviado" : "erro", errors.length ? `${sent} de ${to.length} enviados. ${errors[0]}` : `${sent} enviado(s).`, sent);
      return sent ? res(200, { data: r }) : fail(400, "EMAIL_SEND_FAILED", r.detail);
    }
    // Papel "cliente" só vê a empresa com o login ligado (Etapa 19.2).
    // Cliente excluído (23/10/2026) some para todos; o papel "cliente" também não vê o desativado.
    const clientVisible = (clientId) => !db.clients.find((c) => c.id === clientId)?.excluded_at && (role !== "cliente" ||
      (db.clients.find((c) => c.id === clientId)?.status !== "encerrado" && db.access.some((a) => a.user_id === userId && a.client_id === clientId) && Boolean(db.portals[clientId]?.login_enabled)));
    // Link secreto (Edge Function client-report-link → public.client_report_public)
    if (url.includes("/functions/v1/client-report-link")) {
      const b = parse();
      const p = { p_token: b.token, p_period: b.period ?? null, p_from: b.from ?? null, p_to: b.to ?? null };
      db.rpcCalls.push({ fn: "client_report_public", ...p, p_token: p.p_token ? "***" : null });
      const clientId = db.portalTokens[p.p_token];
      const portal = clientId && db.portals[clientId];
      if (!portal || !portal.link_enabled || (portal.link_expires_at && Date.parse(portal.link_expires_at) <= Date.now())) {
        return res(404, { error: { code: "LINK_INVALID", message: "Este link não existe mais ou foi desativado. Peça um novo link para a agência." } });
      }
      const client = db.clients.find((c) => c.id === clientId);
      const settings = db.reportSettings.find((r) => r.client_id === clientId) ?? null;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: client.timezone }).format(new Date());
      const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      let period, from, to;
      if (p.p_from || p.p_to) {
        if (!p.p_from || !p.p_to || p.p_to < p.p_from || p.p_to > today) {
          return res(400, { error: { code: "INVALID_PERIOD", message: "Período inválido (até 400 dias, sem datas futuras)." } });
        }
        period = "custom"; from = p.p_from; to = p.p_to;
      } else {
        period = p.p_period ?? settings?.default_period ?? "last_7_days";
        const month = `${today.slice(0, 7)}-01`;
        const prevMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
        [from, to] = { last_7_days: [shift(today, -7), shift(today, -1)], last_14_days: [shift(today, -14), shift(today, -1)],
          last_30_days: [shift(today, -30), shift(today, -1)], this_month: [month, today], last_month: [prevMonth, shift(month, -1)] }[period];
      }
      portal.link_uses += 1;
      portal.link_last_used_at = new Date().toISOString();
      const q = { p_client_id: clientId, p_from: from, p_to: to };
      const { client_id: _c, updated_by: _u, ...cleanSettings } = settings ?? {};
      return res(200, {
        client: { name: client.name, timezone: client.timezone }, settings: settings ? cleanSettings : null,
        period, from, to, today,
        accounts: reportRpc("client_report_accounts", q), daily: reportRpc("client_report_daily", q), campaigns: reportRpc("client_report_campaigns", q),
        breakdowns: reportRpc("client_report_breakdowns", q), breakdown_coverage: reportRpc("client_report_breakdown_coverage", { p_client_id: clientId }),
      });
    }
    if (url.includes("/rest/v1/rpc/client_report_")) {
      const p = parse();
      if (!clientVisible(p.p_client_id)) return res(200, []);
      return res(200, reportRpc(url.match(/rpc\/(client_report_\w+)/)[1], p));
    }
    if (url.includes("/rest/v1/client_portal")) {
      const clientId = eqParam(url, "client_id");
      if (role === "cliente") return res(200, null);
      const { link_token: _t, ...row } = db.portals[clientId] ?? {};
      return res(200, db.portals[clientId] ? row : null);
    }
    if (url.includes("/rest/v1/rpc/client_portal_set") || url.includes("/rest/v1/rpc/client_portal_new_link")) {
      const p = parse();
      if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "Sem permissão para mudar o acesso deste cliente." });
      const portal = db.portals[p.p_client_id] ??= { client_id: p.p_client_id, login_enabled: false, link_enabled: false,
        link_created_at: null, link_expires_at: null, link_last_used_at: null, link_uses: 0 };
      if (url.includes("client_portal_set")) {
        db.rpcCalls.push({ fn: "client_portal_set", ...p });
        if (p.p_link_enabled && !portal.link_token) return res(400, { code: "22023", message: "Gere o link antes de ligá-lo." });
        if (p.p_login_enabled != null) portal.login_enabled = p.p_login_enabled;
        if (p.p_link_enabled != null) portal.link_enabled = p.p_link_enabled;
        return res(204);
      }
      db.rpcCalls.push({ fn: "client_portal_new_link", ...p });
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      if (portal.link_token) delete db.portalTokens[portal.link_token];
      db.portalTokens[token] = p.p_client_id;
      Object.assign(portal, { link_token: token, link_enabled: true, link_created_at: new Date().toISOString(), link_uses: 0, link_last_used_at: null,
        link_expires_at: p.p_valid_days ? new Date(Date.now() + p.p_valid_days * 86_400_000).toISOString() : null });
      return res(200, token);
    }

    // Excluir cliente (mesma regra de private.client_exclude_impl): só admin, só desativado, nome confere.
    if (url.includes("/rest/v1/rpc/client_exclude")) {
      const p = parse();
      db.rpcCalls.push({ fn: "client_exclude", ...p });
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador pode excluir clientes." });
      const client = db.clients.find((c) => c.id === p.p_client_id && !c.excluded_at);
      if (!client) return res(404, { code: "P0002", message: "Cliente não encontrado." });
      if (client.status !== "encerrado") return res(400, { code: "22023", message: "Desative o cliente antes de excluir." });
      if ((p.p_name ?? "").trim().toLowerCase() !== client.name.trim().toLowerCase()) {
        return res(400, { code: "22023", message: "O nome digitado não confere com o nome do cliente." });
      }
      Object.assign(client, { excluded_at: new Date().toISOString(), excluded_by: userId });
      return res(204);
    }

    // --- Clientes
    if (url.includes("/rest/v1/clients")) {
      const id = eqParam(url, "id");
      if (method === "GET") {
        if (id) return res(200, clientVisible(id) ? db.clients.find((c) => c.id === id) ?? null : null);
        const status = eqParam(url, "status");
        return res(200, db.clients.filter((c) => clientVisible(c.id) && (!status || c.status === status)).sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (method === "POST") {
        const row = parse();
        if (row.cnpj && db.clients.some((c) => c.cnpj === row.cnpj)) {
          return res(409, { code: "23505", message: 'duplicate key value violates unique constraint "clients_cnpj_key"' });
        }
        db.clients.push({ is_demo: false, created_by: userId, created_at: new Date().toISOString(), updated_at: "", ...row });
        return res(201);
      }
      if (method === "PATCH") {
        const client = db.clients.find((c) => c.id === id);
        const patch = parse();
        // Mesma regra do gatilho do banco: só admin desativa ou reativa (23/10/2026).
        if ("status" in patch && patch.status !== client.status && [patch.status, client.status].includes("encerrado") && role !== "admin") {
          return res(403, { code: "42501", message: "Só o administrador pode desativar ou reativar um cliente." });
        }
        if (patch.status === "encerrado" && client.status !== "encerrado") {
          for (const a of db.monitorAlerts ?? []) {
            if (a.client_id === id && !a.resolved_at) Object.assign(a, { resolved_at: new Date().toISOString(), resolution: "automatica", status: "resolvido", details: { ...a.details, closed_reason: "cliente_desativado" } });
          }
        }
        Object.assign(client, patch);
        return res(204);
      }
    }

    // --- Acessos
    if (url.includes("/rest/v1/user_client_access")) {
      const clientId = eqParam(url, "client_id");
      if (method === "GET") {
        return res(200, db.access.filter((a) => a.client_id === clientId).map((a) => ({
          user_id: a.user_id,
          created_at: a.created_at,
          profile: db.profiles.find((p) => p.id === a.user_id) ?? null,
        })));
      }
      if (method === "POST") {
        db.access.push({ ...parse(), created_at: new Date().toISOString() });
        return res(201);
      }
      if (method === "DELETE") {
        const userId = eqParam(url, "user_id");
        db.access = db.access.filter((a) => !(a.user_id === userId && a.client_id === clientId));
        return res(204);
      }
    }

    // --- Conexões (o site só lê)
    if (url.includes("/rest/v1/platform_connections")) {
      const platform = eqParam(url, "platform_id");
      return res(200, db.connections.filter((c) => !platform || c.platform_id === platform));
    }

    // --- Monitoramento (Etapa 37): mesmas regras de private.monitor_*_impl
    if (url.includes("/rest/v1/rpc/monitor_")) {
      const p = parse();
      const fn = url.split("/rpc/")[1].split("?")[0];
      db.rpcCalls.push({ fn, ...p });
      const can = (what) => ({ view: ["admin", "gestor", "operador", "visualizador"], handle: ["admin", "gestor", "operador"], rules: ["admin", "gestor"], admin: ["admin"] })[what].includes(role);
      const visible = (clientId) => role === "admin" || db.access.some((a) => a.user_id === userId && a.client_id === clientId);
      const err = (code, message) => res(code === "42501" ? 403 : 400, { code, message });
      // Filtro de objetivo (mesma regra de private.monitor_objective_group).
      const OBJ = { OUTCOME_SALES: "vendas", CONVERSIONS: "vendas", PRODUCT_CATALOG_SALES: "vendas", OUTCOME_LEADS: "leads", LEAD_GENERATION: "leads",
        OUTCOME_ENGAGEMENT: "engajamento", MESSAGES: "engajamento", POST_ENGAGEMENT: "engajamento", PAGE_LIKES: "engajamento", EVENT_RESPONSES: "engajamento",
        VIDEO_VIEWS: "engajamento", OUTCOME_TRAFFIC: "trafego", LINK_CLICKS: "trafego", OUTCOME_AWARENESS: "reconhecimento", BRAND_AWARENESS: "reconhecimento",
        REACH: "reconhecimento", OUTCOME_APP_PROMOTION: "app", APP_INSTALLS: "app" };
      const objGroup = (o) => OBJ[String(o ?? "").trim().toUpperCase()] ?? "outros";
      const objFilter = Array.isArray(p.p_objectives) && p.p_objectives.length > 0 ? p.p_objectives : null;
      const campaignOk = (campaignId) => !objFilter || (campaignId != null && objFilter.includes(objGroup(db.campaigns.find((c) => c.id === campaignId)?.objective)));
      if (fn === "monitor_view_prefs_get") return res(200, { objectives: db.monitorViewPrefs?.[userId] ?? [] });
      if (fn === "monitor_view_prefs_save") {
        const v = [...new Set(p.p_objectives ?? [])].sort();
        if (v.some((o) => !["vendas", "leads", "engajamento", "trafego", "reconhecimento", "app", "outros"].includes(o))) return err("22023", "Objetivo inválido.");
        db.monitorViewPrefs = { ...(db.monitorViewPrefs ?? {}), [userId]: v };
        return res(204);
      }
      if (!db.monitorRules) {
        db.monitorRules = [["cost_per_result", "up", 20, 40], ["cpc", "up", 20, 40], ["cpm", "up", 20, 40], ["ctr", "down", 15, 30], ["results", "down", 20, 40], ["roas", "down", 20, 40]]
          .map(([metric, direction, a, c], i) => ({ id: `rule-g${i}`, scope: "global", scope_id: null, client_id: null, metric, direction, attention_pct: a, critical_pct: c,
            min_volume: null, active: true, note: null, replaces_id: null, archived_at: null, created_at: "2026-09-30T22:52:50Z", created_by: null }));
      }
      // Visão geral e histórico (37.6).
      if (fn === "monitor_summary" || fn === "monitor_history") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        if (p.p_platform && !["meta", "google"].includes(p.p_platform)) return err("22023", "Plataforma inválida.");
        const base = db.monitorAlerts.filter((a) => visible(a.client_id) && (!p.p_client || a.client_id === p.p_client) && (!p.p_platform || a.platform_id === p.p_platform)
          && campaignOk(a.campaign_id));
        const sev = (list) => ({ critico: list.filter((a) => a.severity === "critico").length, atencao: list.filter((a) => a.severity === "atencao").length,
          informativo: list.filter((a) => a.severity === "informativo").length });
        const clientName = (id) => db.clients.find((c) => c.id === id)?.name ?? null;
        if (fn === "monitor_summary") {
          const open = base.filter((a) => !a.resolved_at);
          const o = open.filter((a) => a.status !== "ignorado");
          const rank = { critico: 1, atencao: 2, informativo: 3 };
          const byClient = [...new Set(o.map((a) => a.client_id))].map((id) => {
            const l = o.filter((a) => a.client_id === id);
            return { client_id: id, client_name: clientName(id), ...sev(l), unassigned: l.filter((a) => !a.assigned_to).length, _t: l.length };
          }).sort((a, b) => b.critico - a.critico || b._t - a._t || a.client_name.localeCompare(b.client_name)).map(({ _t, ...r }) => r);
          const top = [...o].sort((a, b) => rank[a.severity] - rank[b.severity] || b.last_detected_at.localeCompare(a.last_detected_at)).slice(0, 5).map((a) => ({
            id: a.id, severity: a.severity, status: a.status, metric: a.metric, kind: a.kind, variation_pct: a.variation_pct, client_name: clientName(a.client_id),
            platform_id: a.platform_id, level: a.level, last_detected_at: a.last_detected_at,
            entity_name: db.ads?.find((x) => x.id === a.ad_id)?.name ?? db.campaigns.find((x) => x.id === a.campaign_id)?.name ?? db.adAccounts.find((x) => x.id === a.ad_account_id)?.name ?? null,
            assignee_name: db.profiles.find((x) => x.id === a.assigned_to)?.full_name ?? null,
          }));
          return res(200, { open: sev(o), ignored: open.length - o.length, new: o.filter((a) => a.status === "novo").length,
            unassigned: o.filter((a) => !a.assigned_to).length, mine: o.filter((a) => a.assigned_to === userId).length, by_client: byClient, top,
            last_run_at: db.monitorRuns.at(-1)?.finished_at ?? null });
        }
        const days = p.p_days ?? 30;
        if (days < 7 || days > 180) return err("22023", "Período inválido (7 a 180 dias).");
        const spDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
        const to = spDay(new Date().toISOString());
        const list = Array.from({ length: days }, (_, i) => new Date(Date.parse(`${to}T12:00:00Z`) - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
        const from = list[0];
        const c = base.filter((a) => spDay(a.first_detected_at) >= from);
        const r = base.filter((a) => a.resolved_at && spDay(a.resolved_at) >= from);
        const ids = new Set(base.map((a) => a.id));
        const f = db.monitorEvents.filter((e) => e.kind === "avaliacao" && ids.has(e.alert_id) && spDay(e.created_at) >= from);
        const hours = r.map((a) => (Date.parse(a.resolved_at) - Date.parse(a.first_detected_at)) / 3_600_000).sort((x, y) => x - y);
        const median = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null;
        const metrics = [...new Set(c.map((a) => a.metric))].map((m) => ({ metric: m, created: c.filter((a) => a.metric === m).length }))
          .sort((x, y) => y.created - x.created || x.metric.localeCompare(y.metric));
        return res(200, {
          from, to, days: list.map((d) => ({ day: d, created: c.filter((a) => spDay(a.first_detected_at) === d).length, resolved: r.filter((a) => spDay(a.resolved_at) === d).length })),
          created: c.length, created_by_severity: sev(c), still_open: c.filter((a) => !a.resolved_at).length, recurrences: c.filter((a) => a.recurrence_of).length,
          resolved: r.length, resolved_manual: r.filter((a) => a.resolution === "manual").length,
          resolved_auto: r.filter((a) => a.resolution === "automatica" && a.details?.closed_reason !== "inativo").length,
          resolved_inactive: r.filter((a) => a.details?.closed_reason === "inativo").length,
          median_hours: median == null ? null : Math.round(median * 10) / 10,
          followups: { melhorou: f.filter((e) => e.to_value === "melhorou").length, piorou: f.filter((e) => e.to_value === "piorou").length,
            igual: f.filter((e) => e.to_value === "igual").length, sem_dados: f.filter((e) => e.to_value === "sem_dados").length },
          by_metric: metrics,
        });
      }
      // Notificações (37.5).
      if (fn === "monitor_notifications_list" || fn === "monitor_notifications_read") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        const mine = db.monitorNotifications.filter((n) => n.user_id === userId);
        if (fn === "monitor_notifications_read") {
          const hit = mine.filter((n) => !n.read_at && (!p.p_ids || p.p_ids.includes(n.id)));
          hit.forEach((n) => { n.read_at = new Date().toISOString(); });
          return res(200, hit.length);
        }
        const sorted = [...mine].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
        const items = sorted.filter((n) => !p.p_unread || !n.read_at).slice(0, p.p_limit ?? 30)
          .map(({ id, kind, title, body, link, alert_id, created_at, read_at }) => ({ id, kind, title, body, link, alert_id, created_at, read_at }));
        return res(200, { unread: mine.filter((n) => !n.read_at).length, items });
      }
      if (fn === "monitor_prefs_get" || fn === "monitor_prefs_save") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        const target = p.p_user ?? userId;
        if (target !== userId && !can("admin")) return err("42501", "Só o administrador muda as notificações de outra pessoa");
        const person = db.profiles.find((x) => x.id === target && ["admin", "gestor", "operador", "visualizador"].includes(x.role));
        if (!person) return err("22023", "Pessoa não encontrada.");
        if (fn === "monitor_prefs_get") {
          const saved = db.monitorPrefs[target];
          const base = saved ?? { enabled: person.role !== "visualizador", internal: true, email: false, whatsapp: false, min_severity: "critico", client_ids: null,
            mode: "imediato", digest_hour: 8, quiet_start: null, quiet_end: null, notify_assigned: true, notify_followups: true };
          return res(200, { ...base, user_id: target, user_name: person.full_name, is_default: !saved, has_email: Boolean(person.email), email_ready: db.emailReady });
        }
        const v = p.p ?? {};
        if (!["critico", "atencao", "informativo"].includes(v.min_severity)) return err("22023", "Gravidade mínima inválida.");
        if (!["imediato", "resumo", "ambos"].includes(v.mode)) return err("22023", "Escolha quando receber: na hora, só resumo diário ou os dois.");
        if ((v.quiet_start == null) !== (v.quiet_end == null) || (v.quiet_start != null && v.quiet_start === v.quiet_end)) {
          return err("22023", "Horário de silêncio inválido: informe início e fim diferentes (0 a 23 h).");
        }
        db.monitorPrefs[target] = { enabled: v.enabled ?? true, internal: v.internal ?? true, email: Boolean(v.email), whatsapp: Boolean(v.whatsapp),
          min_severity: v.min_severity, client_ids: v.client_ids?.length ? v.client_ids : null, mode: v.mode, digest_hour: v.digest_hour,
          quiet_start: v.quiet_start ?? null, quiet_end: v.quiet_end ?? null, notify_assigned: v.notify_assigned ?? true, notify_followups: v.notify_followups ?? true };
        return res(204);
      }
      if (fn === "monitor_notify_people") {
        if (!can("admin")) return err("42501", "Só o administrador vê as notificações de outras pessoas");
        return res(200, db.profiles.filter((x) => x.active && ["admin", "gestor", "operador", "visualizador"].includes(x.role))
          .map((x) => ({ id: x.id, name: x.full_name, role: x.role })).sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (fn === "monitor_deliveries_list") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        return res(200, db.monitorDeliveries.filter((d) => d.user_id === userId || can("admin"))
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, p.p_limit ?? 100)
          .map((d) => ({ ...d, user_name: db.profiles.find((x) => x.id === d.user_id)?.full_name ?? null })));
      }
      const scopeClient = (scope, id) => scope === "client" ? db.clients.find((c) => c.id === id)?.id
        : scope === "account" ? db.adAccounts.find((a) => a.id === id)?.client_id
        : scope === "campaign" ? db.campaigns.find((c) => c.id === id)?.client_id
        : scope === "ad" ? db.ads.find((a) => a.id === id)?.client_id : null;
      const scopeName = (scope, id) => scope === "global" ? "Todos os clientes"
        : ({ client: db.clients, account: db.adAccounts, campaign: db.campaigns, ad: db.ads })[scope].find((x) => x.id === id)?.name ?? null;
      if (fn === "monitor_compare" || fn === "monitor_daily") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        const lvl = p.p_level;
        if (!["account", "campaign", "ad_group", "ad", "creative"].includes(lvl)) return err("22023", "Nível inválido.");
        const mLevel = lvl === "creative" ? "ad" : lvl === "account" && objFilter ? "campaign" : lvl;
        const adOf = (id) => db.ads.find((a) => a.id === id);
        const keyOf = (m) => lvl === "account" ? m.ad_account_id : lvl === "campaign" ? m.campaign_id : lvl === "ad_group" ? m.ad_group_id : lvl === "ad" ? m.ad_id
          : `${m.ad_account_id}:${adOf(m.ad_id)?.creative_external_id ?? `ad-${m.ad_id}`}`;
        const K = ["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"];
        const sum = (list, k) => (list.length && !list.every((m) => m[k] == null) ? list.reduce((t, m) => t + (m[k] ?? 0), 0) : null);
        const base = db.metrics.filter((m) => m.level === mLevel && !m.superseded && visible(m.client_id));
        if (fn === "monitor_daily") {
          const rows = base.filter((m) => String(keyOf(m)) === p.p_key && m.date >= p.p_from && m.date <= p.p_to);
          if (!rows.length && !base.some((m) => String(keyOf(m)) === p.p_key)) return res(200, []);
          const dates = [...new Set(rows.map((m) => m.date))].sort();
          return res(200, dates.map((d) => ({ date: d, ...Object.fromEntries(K.map((k) => [k, sum(rows.filter((m) => m.date === d), k)])) })));
        }
        if (p.p_prev_to >= p.p_from && p.p_prev_from <= p.p_to) return err("22023", "Os dois períodos não podem se sobrepor.");
        const inCur = (m) => m.date >= p.p_from && m.date <= p.p_to;
        const inPrev = (m) => m.date >= p.p_prev_from && m.date <= p.p_prev_to;
        const rows = base.filter((m) => (inCur(m) || inPrev(m)) && (!p.p_client_id || m.client_id === p.p_client_id) &&
          (!p.p_platform || m.platform_id === p.p_platform) && (!p.p_campaign_id || m.campaign_id === p.p_campaign_id) && campaignOk(m.campaign_id));
        const groups = new Map();
        for (const m of rows) { const k = String(keyOf(m)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
        const out = [...groups.entries()].map(([k, list]) => {
          const first = list[0];
          const acc = db.adAccounts.find((a) => a.id === first.ad_account_id) ?? {};
          const camp = db.campaigns.find((c) => c.id === first.campaign_id);
          const grp = db.adGroups.find((g) => g.id === first.ad_group_id);
          const lastAd = adOf([...list].sort((a, b) => b.date.localeCompare(a.date))[0].ad_id);
          const cur = list.filter(inCur), prev = list.filter(inPrev);
          const cov = db.coverage[first.ad_account_id];
          const ss = db.syncState[first.ad_account_id] ?? {};
          const entity = lvl === "account" ? acc : lvl === "campaign" ? camp : lvl === "ad_group" ? grp : lastAd;
          return {
            entity_key: k, level: lvl, entity_id: lvl === "creative" ? null : (entity?.id ?? null), name: entity?.name ?? null, status: entity?.status ?? null,
            client_id: first.client_id, client_name: db.clients.find((c) => c.id === first.client_id)?.name ?? "", platform_id: first.platform_id,
            ad_account_id: first.ad_account_id, account_name: acc.name ?? "", currency: acc.currency ?? first.currency, timezone: acc.timezone ?? null,
            campaign_id: first.campaign_id ?? null, campaign_name: camp?.name ?? null, objective: camp?.objective ?? null,
            ad_group_id: first.ad_group_id ?? null, ad_group_name: grp?.name ?? null,
            thumbnail_url: ["ad", "creative"].includes(lvl) ? (lastAd?.thumbnail_url ?? null) : null,
            creative_type: ["ad", "creative"].includes(lvl) ? (lastAd?.creative_type ?? null) : null,
            creative_external_id: ["ad", "creative"].includes(lvl) ? (lastAd?.creative_external_id ?? null) : null,
            preview_link: ["ad", "creative"].includes(lvl) ? (lastAd?.preview_link ?? null) : null,
            ads_count: lvl === "creative" ? new Set(list.map((m) => m.ad_id)).size : null, first_seen_at: null,
            ...Object.fromEntries(K.map((x) => [`cur_${x}`, sum(cur, x)])), cur_days: new Set(cur.map((m) => m.date)).size,
            ...Object.fromEntries(K.map((x) => [`prev_${x}`, sum(prev, x)])), prev_days: new Set(prev.map((m) => m.date)).size,
            coverage: !cov?.history_from ? "sem_historico" : cov.history_from <= p.p_prev_from && cov.history_to >= p.p_to ? "completa" : "parcial",
            sync_status: ss.status ?? null, last_success_at: ss.last_success_at ?? null,
          };
        }).sort((a, b) => ((b.cur_spend_micros ?? 0) + (b.prev_spend_micros ?? 0)) - ((a.cur_spend_micros ?? 0) + (a.prev_spend_micros ?? 0)));
        return res(200, out.slice(0, p.p_limit ?? 500));
      }
      if (fn === "monitor_status") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        const s = db.monitorSettings;
        const r = [...db.monitorRuns].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
        const open = db.monitorAlerts.filter((a) => !a.resolved_at && a.status !== "ignorado" && visible(a.client_id));
        return res(200, {
          enabled: s.enabled, eval_interval_minutes: s.eval_interval_minutes, stale_hours: s.stale_hours, min_severity: s.min_severity ?? "critico",
          last_run: r && { started_at: r.started_at, finished_at: r.finished_at, trigger: r.trigger, evaluated: r.evaluated, skipped: r.skipped,
            created: r.created, updated: r.updated, resolved: r.resolved, error: r.error ?? null },
          last_evaluated_at: db.monitorRuns.filter((x) => x.evaluated > 0).map((x) => x.started_at).sort().at(-1) ?? null,
          next_run_at: s.enabled ? new Date(Date.parse(r?.started_at ?? new Date().toISOString()) + s.eval_interval_minutes * 60_000).toISOString() : null,
          open: Object.fromEntries(["critico", "atencao", "informativo"].map((k) => [k, open.filter((a) => a.severity === k).length])),
        });
      }
      if (fn === "monitor_alerts_list") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        const limit = p.p_limit ?? 300;
        if (!(limit >= 1 && limit <= 1000)) return err("22023", "Quantidade inválida (1 a 1000).");
        const rank = { critico: 0, atencao: 1, informativo: 2 };
        return res(200, db.monitorAlerts
          .filter((a) => visible(a.client_id) && (p.p_open === false || !a.resolved_at))
          .sort((a, b) => Number(!!a.resolved_at) - Number(!!b.resolved_at) || rank[a.severity] - rank[b.severity] || b.last_detected_at.localeCompare(a.last_detected_at))
          .slice(0, limit)
          .map((a) => ({ ...a, client_name: db.clients.find((c) => c.id === a.client_id)?.name ?? "",
            account_name: db.adAccounts.find((x) => x.id === a.ad_account_id)?.name ?? "",
            campaign_name: db.campaigns.find((c) => c.id === a.campaign_id)?.name ?? null,
            ad_name: db.ads.find((x) => x.id === a.ad_id)?.name ?? null, thumbnail_url: db.ads.find((x) => x.id === a.ad_id)?.thumbnail_url ?? null })));
      }
      // --- 37.4: tratar alertas (mesmas regras de private.monitor_alert_*_impl)
      const handle = can("handle");
      const nameOf = (id) => db.profiles.find((x) => x.id === id)?.full_name ?? null;
      const alertJson = (a) => {
        const task = a.task_id ? db.opsTasks?.find((t) => t.id === a.task_id) : null;
        return { status: "novo", version: 1, assigned_to: null, task_id: null, ...a,
          client_name: db.clients.find((c) => c.id === a.client_id)?.name ?? "", account_name: db.adAccounts.find((x) => x.id === a.ad_account_id)?.name ?? "",
          campaign_name: db.campaigns.find((c) => c.id === a.campaign_id)?.name ?? null,
          campaign_objective: db.campaigns.find((c) => c.id === a.campaign_id)?.objective ?? null, ad_name: db.ads.find((x) => x.id === a.ad_id)?.name ?? null,
          thumbnail_url: db.ads.find((x) => x.id === a.ad_id)?.thumbnail_url ?? null, assignee_name: nameOf(a.assigned_to),
          task_number: task?.number ?? null, task_title: task?.title ?? null };
      };
      const ev = (a, kind, extra = {}) => db.monitorEvents.push({ id: db.monitorEvents.length + 1, alert_id: a.id, kind, from_value: null, to_value: null,
        note: null, data: {}, created_at: new Date().toISOString(), actor: userId, ...extra });
      const canHandleUser = (uid, clientId) => {
        const prof = db.profiles.find((x) => x.id === uid);
        return Boolean(prof?.active !== false && ["admin", "gestor", "operador"].includes(prof?.role)
          && (prof.role === "admin" || db.access.some((x) => x.user_id === uid && x.client_id === clientId)));
      };
      const lock = (id, version, openOnly = true) => {
        if (!handle) return { fail: err("42501", "Sem permissão para tratar alertas de desempenho") };
        const a = db.monitorAlerts.find((x) => x.id === Number(id));
        if (!a || !visible(a.client_id)) return { fail: err("22023", "Alerta não encontrado.") };
        if (version != null && (a.version ?? 1) !== Number(version)) return { fail: res(409, { code: "40001", message: "Alguém alterou este alerta antes de você. Recarregue para ver a versão atual." }) };
        if (openOnly && a.resolved_at) return { fail: err("22023", "Este alerta já foi encerrado.") };
        a.status ??= "novo"; a.version ??= 1;
        return { a };
      };
      if (fn === "monitor_alerts_query") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        const limit = p.p_limit ?? 500;
        if (!(limit >= 1 && limit <= 1000)) return err("22023", "Quantidade inválida (1 a 1000).");
        const rank = { critico: 0, atencao: 1, informativo: 2 };
        return res(200, db.monitorAlerts
          .filter((a) => visible(a.client_id) && (p.p_open === false || !a.resolved_at))
          .sort((a, b) => Number(!!a.resolved_at) - Number(!!b.resolved_at) || rank[a.severity] - rank[b.severity] || b.last_detected_at.localeCompare(a.last_detected_at))
          .slice(0, limit).map(alertJson));
      }
      if (fn === "monitor_alert_detail") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        const a = db.monitorAlerts.find((x) => x.id === Number(p.p_id));
        if (!a || !visible(a.client_id)) return err("22023", "Alerta não encontrado.");
        return res(200, { alert: alertJson(a), can_handle: handle,
          events: db.monitorEvents.filter((e) => e.alert_id === a.id).map((e) => ({ ...e, actor_name: nameOf(e.actor) })) });
      }
      if (fn === "monitor_alert_seen") {
        const a = db.monitorAlerts.find((x) => x.id === Number(p.p_id));
        if (handle && a && visible(a.client_id) && (a.status ?? "novo") === "novo" && !a.resolved_at) {
          Object.assign(a, { status: "visualizado", version: (a.version ?? 1) + 1 });
          ev(a, "estado", { from_value: "novo", to_value: "visualizado" });
        }
        return res(204);
      }
      if (fn === "monitor_alert_set_status") {
        if (!["visualizado", "em_analise", "aguardando_acao", "ignorado"].includes(p.p_status)) return err("22023", "Estado inválido.");
        const { a, fail } = lock(p.p_id, p.p_version);
        if (fail) return fail;
        if (a.status === p.p_status) return res(200, a.version);
        ev(a, "estado", { from_value: a.status, to_value: p.p_status });
        Object.assign(a, { status: p.p_status, version: a.version + 1 });
        return res(200, a.version);
      }
      if (fn === "monitor_alert_assignees") {
        if (!handle) return err("42501", "Sem permissão para tratar alertas de desempenho");
        const a = db.monitorAlerts.find((x) => x.id === Number(p.p_id));
        if (!a || !visible(a.client_id)) return err("22023", "Alerta não encontrado.");
        return res(200, db.profiles.filter((x) => canHandleUser(x.id, a.client_id)).map((x) => ({ id: x.id, name: x.full_name, role: x.role }))
          .sort((x, y) => x.name.localeCompare(y.name)));
      }
      if (fn === "monitor_alert_assign") {
        const { a, fail } = lock(p.p_id, p.p_version);
        if (fail) return fail;
        if (p.p_user && !canHandleUser(p.p_user, a.client_id)) return err("22023", "Essa pessoa não pode tratar alertas deste cliente.");
        if ((a.assigned_to ?? null) === (p.p_user ?? null)) return res(200, a.version);
        ev(a, "atribuido", { from_value: nameOf(a.assigned_to), to_value: nameOf(p.p_user) ?? "ninguém", data: { user_id: p.p_user ?? null } });
        Object.assign(a, { assigned_to: p.p_user ?? null, version: a.version + 1 });
        return res(200, a.version);
      }
      if (fn === "monitor_alert_comment" || fn === "monitor_alert_action") {
        const text = (p.p_text ?? "").trim();
        if (fn === "monitor_alert_comment" && !(text.length >= 1 && text.length <= 2000)) return err("22023", "Escreva o comentário (até 2.000 caracteres).");
        if (fn === "monitor_alert_action" && !(text.length >= 3 && text.length <= 2000)) return err("22023", "Descreva a providência (de 3 a 2.000 caracteres).");
        const { a, fail } = lock(p.p_id, null, false);
        if (fail) return fail;
        ev(a, fn === "monitor_alert_comment" ? "comentario" : "providencia", { note: text, data: fn === "monitor_alert_action" ? { metric: a.metric } : {} });
        return res(204);
      }
      if (fn === "monitor_alert_resolve") {
        const { a, fail } = lock(p.p_id, p.p_version);
        if (fail) return fail;
        ev(a, "estado", { from_value: a.status, to_value: "resolvido", note: p.p_note?.trim() || null });
        Object.assign(a, { status: "resolvido", resolved_at: new Date().toISOString(), resolution: "manual", resolved_by: userId, version: a.version + 1 });
        return res(204);
      }
      if (fn === "monitor_alert_to_task") {
        const { a, fail } = lock(p.p_id, p.p_version);
        if (fail) return fail;
        if (a.task_id) return err("22023", "Este alerta já virou tarefa.");
        if (!(opsPerms.includes("ops.admin") || (opsPerms.includes("ops.access") && opsPerms.includes("ops.tasks.create")))) {
          return err("42501", "Você não tem permissão para esta ação na Central de Operações.");
        }
        if (!db.opsSectors.some((x) => x.id === p.p_sector_id && x.status === "ativo")) return err("22023", "Escolha um setor ativo.");
        const metricName = { cost_per_result: "Custo por resultado", results: "Resultados", cpc: "CPC", cpm: "CPM", ctr: "CTR", roas: "ROAS" }[a.metric] ?? a.metric;
        const entity = a.level === "ad" ? db.ads.find((x) => x.id === a.ad_id)?.name : db.campaigns.find((x) => x.id === a.campaign_id)?.name;
        const now = new Date().toISOString();
        const memberOk = (uid) => uid && (db.opsMembers[uid]?.active || db.profiles.find((x) => x.id === uid)?.role === "admin");
        const principal = memberOk(a.assigned_to) ? a.assigned_to : memberOk(userId) ? userId : null;
        const t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, title: `Alerta: ${metricName} — ${entity ?? "item"}`.slice(0, 200),
          description: `${a.explanation}\n\nCriada a partir do alerta de desempenho nº ${a.id} (Monitoramento).`, client_id: a.client_id, sector_id: p.p_sector_id,
          priority: a.severity === "critico" ? "alta" : "media", start_date: null, due_date: p.p_due_date ?? null, effort_hours: null, visibility: "setor", tags: [],
          client_stage_id: null, mandatory: false, status_id: "nao_iniciado", people: principal ? [{ user_id: principal, role: "principal" }] : [], version: 1,
          created_by: userId, created_at: now, updated_at: now, completed_at: null, archived_at: null, demand_id: null, queue_column_id: null };
        db.opsTasks.push(t);
        ev(a, "tarefa", { note: t.title, data: { task_id: t.id, task_number: t.number } });
        Object.assign(a, { task_id: t.id, version: a.version + 1, status: ["novo", "visualizado"].includes(a.status) ? "em_analise" : a.status });
        return res(200, t.id);
      }
      if (fn === "monitor_evaluate_now") {
        if (!can("rules")) return err("42501", "Sem permissão para avaliar agora");
        const now = new Date();
        if (db.monitorRuns.some((r) => Date.parse(r.started_at) > now.getTime() - 120_000)) {
          return err("22023", "Uma avaliação acabou de rodar. Aguarde 2 minutos para avaliar de novo.");
        }
        // Simulação: os alertas preparados pelo teste "aparecem" nesta avaliação.
        const created = db.monitorNextAlerts.splice(0);
        db.monitorAlerts.push(...created);
        const run = { started_at: now.toISOString(), finished_at: now.toISOString(), trigger: "manual", evaluated: db.adAccounts.filter((a) => !a.unlinked_at).length,
          skipped: 0, created: created.length, updated: 0, resolved: 0, error: null };
        db.monitorRuns.push(run);
        return res(200, { run_id: db.monitorRuns.length, evaluated: run.evaluated, skipped: 0, created: run.created, updated: 0, resolved: 0, error: null });
      }
      if (fn === "monitor_min_severity_save") {
        if (!can("admin")) return err("42501", "Só o administrador muda quais alertas são gerados");
        if (!["critico", "atencao", "informativo"].includes(p.p_min_severity)) return err("22023", "Gravidade inválida.");
        db.monitorSettings.min_severity = p.p_min_severity;
        return res(204);
      }
      if (fn === "monitor_settings_save") {
        if (!can("admin")) return err("42501", "Só o administrador muda a frequência do monitoramento");
        if (![15, 30, 60, 180, 360, 1440].includes(Number(p.p_interval))) return err("22023", "Frequência inválida.");
        const h = Number(p.p_stale_hours ?? 3);
        if (!(Number.isInteger(h) && h >= 1 && h <= 48)) return err("22023", "O atraso tolerado precisa ser de 1 a 48 horas.");
        db.monitorSettings = { enabled: p.p_enabled !== false, eval_interval_minutes: Number(p.p_interval), stale_hours: h };
        return res(204);
      }
      if (fn === "monitor_rules_list") {
        if (!can("view")) return err("42501", "Sem permissão para ver o monitoramento");
        const order = ["global", "client", "account", "campaign", "ad"];
        return res(200, db.monitorRules
          .filter((r) => (!r.client_id || visible(r.client_id)) && (p.p_include_history || !r.archived_at))
          .sort((a, b) => order.indexOf(a.scope) - order.indexOf(b.scope) || b.created_at.localeCompare(a.created_at))
          .map((r) => ({ ...r, scope_name: scopeName(r.scope, r.scope_id), client_name: db.clients.find((c) => c.id === r.client_id)?.name ?? null,
            created_by_name: db.profiles.find((x) => x.id === r.created_by)?.full_name ?? null })));
      }
      if (fn === "monitor_rule_save") {
        if (!can("rules")) return err("42501", "Sem permissão para gerenciar as regras do monitoramento");
        const a = Number(p.p_attention), c = Number(p.p_critical);
        if (!(a > 0 && a <= 1000)) return err("22023", "O limite de atenção precisa ser maior que 0% e até 1000%.");
        if (!(c > 0 && c <= 1000)) return err("22023", "O limite crítico precisa ser maior que 0% e até 1000%.");
        if (c < a) return err("22023", "O limite crítico não pode ser menor que o de atenção.");
        let clientId = null;
        if (p.p_scope === "global") {
          if (!can("admin")) return err("42501", "Só o administrador muda as regras que valem para todos os clientes");
        } else {
          clientId = scopeClient(p.p_scope, p.p_scope_id);
          if (!clientId || !visible(clientId)) return err("22023", "Cliente, conta, campanha ou anúncio não encontrado");
        }
        const now = new Date().toISOString();
        if (p.p_replaces_id) {
          const old = db.monitorRules.find((r) => r.id === p.p_replaces_id);
          if (!old) return err("22023", "Regra não encontrada");
          if (old.archived_at) return res(409, { code: "40001", message: "Esta regra foi alterada por outra pessoa. Atualize a página." });
          if (old.scope !== p.p_scope || old.scope_id !== (p.p_scope_id ?? null) || old.metric !== p.p_metric) return err("22023", "Para mudar onde a regra vale ou a métrica, crie uma regra nova.");
          old.archived_at = now;
        } else if (db.monitorRules.some((r) => !r.archived_at && r.scope === p.p_scope && r.metric === p.p_metric && r.scope_id === (p.p_scope_id ?? null))) {
          return err("22023", "Já existe uma regra desta métrica neste lugar. Edite a existente.");
        }
        const id = `rule-${db.monitorRules.length + 1}`;
        db.monitorRules.push({ id, scope: p.p_scope, scope_id: p.p_scope_id ?? null, client_id: clientId, metric: p.p_metric, direction: p.p_direction,
          attention_pct: a, critical_pct: c, min_volume: p.p_min_volume ?? null, active: p.p_active !== false, note: p.p_note?.trim() || null,
          replaces_id: p.p_replaces_id ?? null, archived_at: null, created_at: now, created_by: userId });
        return res(200, id);
      }
      if (fn === "monitor_rule_archive") {
        if (!can("rules")) return err("42501", "Sem permissão para gerenciar as regras do monitoramento");
        const r = db.monitorRules.find((x) => x.id === p.p_id);
        if (!r || (r.client_id && !visible(r.client_id))) return err("22023", "Regra não encontrada");
        if (r.scope === "global") return err("22023", "A regra global não pode ser removida. Para parar de monitorar a métrica, desative-a.");
        r.archived_at = new Date().toISOString();
        return res(204);
      }
    }
    // --- Anúncios (o site só lê; o Monitoramento lista os de uma campanha)
    if (url.includes("/rest/v1/ads?")) {
      const campaignId = eqParam(url, "campaign_id");
      return res(200, db.ads.filter((a) => !campaignId || a.campaign_id === campaignId));
    }

    // --- Contas de anúncio (o site só lê)
    if (url.includes("/rest/v1/ad_accounts")) {
      const clientId = eqParam(url, "client_id");
      const platform = eqParam(url, "platform_id");
      return res(200, db.adAccounts.filter((a) => (!clientId || a.client_id === clientId) && (!platform || a.platform_id === platform) && !a.unlinked_at)
        .map((a) => (url.includes("clients(status)") || url.includes("clients%28status%29") ? { ...a, clients: { status: db.clients.find((c) => c.id === a.client_id)?.status ?? "ativo" } } : a)));
    }

    // --- Campanhas (o site só lê)
    if (url.includes("/rest/v1/campaigns")) {
      const id = eqParam(url, "id");
      if (id) return res(200, db.campaigns.find((c) => c.id === id) ?? null);
      const accountId = eqParam(url, "ad_account_id");
      const clientId = eqParam(url, "client_id");
      const platform = eqParam(url, "platform_id");
      return res(200, db.campaigns.filter((c) =>
        (!accountId || c.ad_account_id === accountId) && (!clientId || c.client_id === clientId) && (!platform || c.platform_id === platform)));
    }

    // --- Central de alertas
    if (url.includes("/rest/v1/rpc/refresh_alerts")) {
      db.rpcCalls.push({ fn: "refresh_alerts" });
      if (!["admin", "gestor", "operador"].includes(role)) return res(403, { code: "42501", message: "Sem permissão para verificar alertas" });
      const r = db.alertRefresh ? db.alertRefresh(db) : { created: 0, updated: db.alerts.filter((a) => a.status !== "resolvido").length, resolved: 0 };
      return res(200, { ...r, checked_at: new Date().toISOString() });
    }
    if (url.includes("/rest/v1/rpc/set_alert_status")) {
      const p = parse();
      db.rpcCalls.push({ fn: "set_alert_status", ...p });
      if (!["admin", "gestor", "operador"].includes(role)) return res(403, { code: "42501", message: "Sem permissão para alterar alertas" });
      const a = db.alerts.find((x) => x.id === p.p_id);
      if (!a) return res(404, { code: "P0002", message: "Alerta não encontrado" });
      if (a.status === "resolvido") return res(400, { code: "22023", message: "Alerta já resolvido" });
      const now = new Date().toISOString();
      if (p.p_status === "visto") Object.assign(a, { status: "visto", seen_at: now });
      if (p.p_status === "aberto") Object.assign(a, { status: "aberto", seen_at: null });
      if (p.p_status === "resolvido") Object.assign(a, { status: "resolvido", resolved_at: now, resolution: "manual" });
      return res(200, a);
    }
    if (url.includes("/rest/v1/alerts")) {
      const statusParam = new URL(url).searchParams.get("status");
      const allowed = !statusParam ? null : statusParam.startsWith("in.(") ? statusParam.slice(4, -1).split(",") : [statusParam.replace(/^eq\./, "")];
      const rows = db.alerts
        .filter((a) => !allowed || allowed.includes(a.status))
        .sort((x, y) => y.first_seen_at.localeCompare(x.first_seen_at))
        .map((a) => {
          const acc = db.adAccounts.find((x) => x.id === a.ad_account_id);
          return { ...a,
            clients: { name: db.clients.find((c) => c.id === a.client_id)?.name ?? "" },
            ad_accounts: acc ? { name: acc.name, external_id: acc.external_id } : null,
            campaigns: a.campaign_id ? { name: db.campaigns.find((c) => c.id === a.campaign_id)?.name ?? "" } : null };
        });
      return res(200, rows);
    }

    // --- Tracking (Etapa 34)
    if (url.includes("/rest/v1/tracking_containers")) {
      const withClient = (c) => ({ ...c, clients: { name: db.clients.find((x) => x.id === c.client_id)?.name ?? "" } });
      if (method === "GET") return res(200, db.trackingContainers.map(withClient));
      if (method === "POST") {
        const row = parse();
        if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "new row violates row-level security policy" });
        const id = crypto.randomUUID();
        const key = "bf_" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
        const created = { id, public_key: key, created_at: new Date().toISOString(), ...row };
        db.trackingContainers.push(created);
        db.rpcCalls.push({ fn: "tracking_containers.insert", ...row });
        return res(201, { id });
      }
      if (method === "PATCH") {
        const c = db.trackingContainers.find((x) => x.id === eqParam(url, "id"));
        Object.assign(c, parse());
        db.rpcCalls.push({ fn: "tracking_containers.update", id: c.id });
        return res(204);
      }
    }
    // Contatos dos clientes (Tracking T3.1): mesmas regras do banco (quem vê, quem marca, Meta uma vez por pessoa)
    const contactClientIds = () => db.clients.filter((c) => !c.excluded_at && (role === "admin"
      || (["gestor", "operador", "visualizador", "vendedor"].includes(role) && db.access.some((a) => a.user_id === userId && a.client_id === c.id)
        && (role !== "vendedor" || c.status !== "encerrado")))).map((c) => c.id);
    const contactSeed = (clientId) => {
      if (!db.contactStages.some((s) => s.client_id === clientId)) {
        [["Novo", "aberta", null], ["Qualificado", "aberta", null], ["Venda", "ganha", "Purchase"], ["Perdido", "perdida", null]].forEach(([name, kind, meta], i) =>
          db.contactStages.push({ id: `st-${clientId.slice(-4)}-${i}`, client_id: clientId, name, kind, meta_event: meta, position: i, archived_at: null }));
      }
      if (!db.contactProfiles.some((p) => p.client_id === clientId)) {
        [["Lojista", "LeadLojista"], ["Sacoleiro", null], ["Cliente final", null], ["Outro", null]].forEach(([name, meta], i) =>
          db.contactProfiles.push({ id: `pf-${clientId.slice(-4)}-${i}`, client_id: clientId, name, meta_event: meta, position: i, archived_at: null }));
      }
    };
    const canMarkContacts = (clientId) => ["admin", "gestor", "operador", "vendedor"].includes(role) && contactClientIds().includes(clientId)
      && db.clients.find((c) => c.id === clientId)?.status !== "encerrado";
    const contactRow = (k) => {
      const click = k.wa_click_id ? db.whatsappClicks.find((w) => w.id === k.wa_click_id) : null;
      return { id: k.id, origin: k.origin, created_at: k.created_at, last_change_at: k.last_change_at, ref_code: k.ref_code, stage_id: k.stage_id,
        profile_id: k.profile_id, sales: k.sales, has_phone: Boolean(k.ph_hash), has_email: Boolean(k.em_hash), channel: click?.touch?.channel ?? k.channel ?? null,
        campaign: click?.touch?.utm_campaign ?? k.campaign ?? null, site: db.trackingContainers.find((t) => t.id === k.container_id)?.name ?? null, archived: Boolean(k.archived_at) };
    };
    const contactLog = (k, entry) => db.contactHistory.push({ id: db.contactHistory.length + 1, contact_id: k.id, client_id: k.client_id,
      at: new Date(Date.now() + db.contactHistory.length).toISOString(), stage_id: null, profile_id: null, value_micros: null, currency: null,
      order_id: null, meta_event: null, meta_note: null, ...entry });
    if (url.includes("/rest/v1/rpc/contacts_clients")) {
      return res(200, db.clients.filter((c) => contactClientIds().includes(c.id)).sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => (contactSeed(c.id), { id: c.id, name: c.name, has_site: db.trackingContainers.some((t) => t.client_id === c.id) })));
    }
    if (url.includes("/rest/v1/rpc/contacts_list")) {
      const p = parse();
      if (!contactClientIds().includes(p.p_client)) return res(200, []);
      const code = p.p_code ? String(p.p_code).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^REF/, "") : null;
      return res(200, db.contacts.filter((k) => k.client_id === p.p_client && (!code || k.ref_code === code) && (!p.p_ph_hash || k.ph_hash === p.p_ph_hash)
        && (!p.p_stage || k.stage_id === p.p_stage)).sort((a, b) => b.last_change_at.localeCompare(a.last_change_at)).map(contactRow));
    }
    if (url.includes("/rest/v1/rpc/contact_create")) {
      const p = parse();
      if (!canMarkContacts(p.p_client)) return res(403, { code: "42501", message: "Sem permissão para marcar contatos deste cliente." });
      contactSeed(p.p_client);
      const code = p.p_code ? String(p.p_code).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^REF/, "") : null;
      if (p.p_code && !/^[2-9A-HJ-NP-Z]{6}$/.test(code ?? "")) return res(400, { code: "22023", message: "Código inválido. São 6 letras/números, como K7Q2M9." });
      let click = null;
      if (code) {
        click = db.whatsappClicks.find((w) => w.code === code && db.trackingContainers.find((t) => t.id === w.container_id)?.client_id === p.p_client);
        if (!click) return res(404, { code: "P0002", message: "Código não encontrado neste cliente." });
        const same = db.contacts.find((k) => k.wa_click_id === click.id);
        if (same) return res(200, same.id);
      }
      if (p.p_ph_hash) {
        const same = db.contacts.find((k) => k.client_id === p.p_client && k.ph_hash === p.p_ph_hash);
        if (same) return res(200, same.id);
      }
      const stage = db.contactStages.filter((st) => st.client_id === p.p_client && st.kind === "aberta" && !st.archived_at).sort((a, b) => a.position - b.position)[0];
      const now = new Date().toISOString();
      const k = { id: (db.contacts.at(-1)?.id ?? 100) + 1, client_id: p.p_client, origin: click ? "whatsapp" : "manual", ph_hash: p.p_ph_hash ?? null,
        em_hash: p.p_em_hash ?? null, wa_click_id: click?.id ?? null, ref_code: code, container_id: click?.container_id
          ?? db.trackingContainers.find((t) => t.client_id === p.p_client)?.id ?? null,
        stage_id: stage.id, profile_id: null, meta_sent: [], sales: 0, created_at: now, last_change_at: now, archived_at: null };
      db.contacts.push(k);
      contactLog(k, { kind: "criado", stage_id: stage.id });
      return res(200, k.id);
    }
    if (url.includes("/rest/v1/rpc/contact_update")) {
      const p = parse();
      const k = db.contacts.find((x) => x.id === p.p_id);
      if (!k || !canMarkContacts(k.client_id)) return res(403, { code: "42501", message: "Contato não encontrado ou sem permissão." });
      const out = {};
      const send = (name) => {
        if (!k.container_id) return "sem_site";
        db.contactQueue.push({ contact_id: k.id, event_name: name, ...(name === "Purchase" ? { value: p.p_value, currency: p.p_currency } : {}) });
        return "ok";
      };
      if (p.p_profile && p.p_profile !== k.profile_id) {
        const pf = db.contactProfiles.find((x) => x.id === p.p_profile && x.client_id === k.client_id);
        k.profile_id = pf.id;
        let r = null;
        if (pf.meta_event && !k.meta_sent.includes(pf.meta_event)) { r = send(pf.meta_event); if (r !== "sem_site") k.meta_sent.push(pf.meta_event); }
        contactLog(k, { kind: "perfil", profile_id: pf.id, meta_event: r && r !== "sem_site" ? pf.meta_event : null,
          meta_note: r === "sem_site" ? "Não enviado ao Meta: cliente sem site no Tracking." : pf.meta_event && !r ? "Já enviado antes ao Meta para esta pessoa." : null });
        Object.assign(out, { perfil: pf.name, perfil_meta: r });
      }
      if (p.p_stage && p.p_stage !== k.stage_id) {
        const st = db.contactStages.find((x) => x.id === p.p_stage && x.client_id === k.client_id);
        let r = null;
        if (st.kind === "ganha") {
          if (p.p_value == null || !/^[A-Z]{3}$/.test(p.p_currency ?? "")) return res(400, { code: "22023", message: "Informe o valor e a moeda da venda." });
          const order = p.p_order ?? `ct${k.id}-${k.sales + 1}`;
          if (db.contactHistory.some((h) => h.client_id === k.client_id && h.kind === "venda" && h.order_id === order)) {
            return res(409, { code: "23505", message: "Já existe uma venda com este nº de pedido." });
          }
          r = st.meta_event ? send("Purchase") : "ok";
          k.sales += 1;
          contactLog(k, { kind: "venda", stage_id: st.id, value_micros: Math.round(p.p_value * 1e6), currency: p.p_currency, order_id: order,
            meta_event: st.meta_event && r !== "sem_site" ? st.meta_event : null });
        } else contactLog(k, { kind: "etapa", stage_id: st.id });
        k.stage_id = st.id;
        Object.assign(out, { etapa: st.name, venda_meta: r });
      }
      k.last_change_at = new Date().toISOString();
      return res(200, out);
    }
    if (url.includes("/rest/v1/rpc/contact_archive")) {
      const k = db.contacts.find((x) => x.id === parse().p_id);
      if (!k || role === "vendedor" || !canMarkContacts(k.client_id)) return res(403, { code: "42501", message: "Só a equipe da agência arquiva contatos." });
      k.archived_at = new Date().toISOString();
      contactLog(k, { kind: "arquivado" });
      return res(204);
    }
    if (url.includes("/rest/v1/tracking_contact_history")) {
      const id = Number(eqParam(url, "contact_id"));
      return res(200, db.contactHistory.filter((h) => h.contact_id === id && contactClientIds().includes(h.client_id)).sort((a, b) => b.at.localeCompare(a.at)));
    }
    // App do Meta da agência para o WhatsApp (Tracking T4.2): só admin; o segredo nunca volta para a tela.
    const waAppView = () => ({ app_id: db.waApp.app_id, config_id: db.waApp.config_id, graph_version: db.waApp.graph_version,
      has_secret: Boolean(db.waApp.secret), verify_token: db.waApp.verify_token, ready: Boolean(db.waApp.app_id && db.waApp.config_id && db.waApp.secret) });
    if (url.includes("/rest/v1/rpc/wa_app_settings_get")) {
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura o app do Meta." });
      return res(200, waAppView());
    }
    if (url.includes("/rest/v1/rpc/wa_app_settings_save")) {
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura o app do Meta." });
      const p = parse();
      if (!/^\d{5,30}$/.test(p.p_app_id ?? "")) return res(400, { code: "22023", message: "ID do app inválido (só números)." });
      if (!/^\d{5,30}$/.test(p.p_config_id ?? "")) return res(400, { code: "22023", message: "ID da configuração inválido (só números)." });
      if (p.p_app_secret && !/^[0-9a-f]{32}$/.test(p.p_app_secret)) return res(400, { code: "22023", message: "Segredo do app inválido (são 32 letras e números)." });
      Object.assign(db.waApp, { app_id: p.p_app_id, config_id: p.p_config_id, ...(p.p_app_secret ? { secret: p.p_app_secret } : {}) });
      if (!db.waApp.verify_token) db.waApp.verify_token = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";
      return res(200, waAppView());
    }
    if (url.includes("/rest/v1/rpc/wa_app_ready")) {
      return res(200, ["admin", "gestor"].includes(role) && Boolean(db.waApp.app_id && db.waApp.config_id && db.waApp.secret));
    }
    // Frases do WhatsApp (Tracking T4.1): mesmas regras do banco (admin/gestor configuram; frase repetida recusada).
    if (url.includes("/rest/v1/tracking_wa_trigger_log")) {
      const cid = eqParam(url, "client_id");
      if (!contactClientIds().includes(cid) || role === "vendedor") return res(200, []);
      return res(200, db.waTriggerLog.filter((l) => l.client_id === cid).sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id).slice(0, 20));
    }
    if (url.includes("/rest/v1/tracking_wa_triggers")) {
      if (method === "GET") {
        const cid = eqParam(url, "client_id");
        if (!contactClientIds().includes(cid)) return res(200, []);
        return res(200, db.waTriggers.filter((t) => t.client_id === cid && !t.archived_at).sort((a, b) => a.position - b.position));
      }
      if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "new row violates row-level security policy" });
      const body = parse();
      if (body.phrase !== undefined) body.phrase = String(body.phrase).trim().replace(/\s+/g, " ");
      const clash = (cid, phrase, id) => db.waTriggers.some((t) => t.client_id === cid && !t.archived_at && t.id !== id && t.phrase.toLowerCase() === phrase.toLowerCase());
      if (method === "POST") {
        if (clash(body.client_id, body.phrase)) return res(409, { code: "23505", message: "duplicate key value violates unique constraint" });
        db.waTriggers.push({ id: crypto.randomUUID(), stage_id: null, profile_id: null, default_value: null, currency: "BRL", position: 0, enabled: true, archived_at: null, ...body });
        return res(201);
      }
      const t = db.waTriggers.find((x) => x.id === eqParam(url, "id"));
      if (body.phrase !== undefined && clash(t.client_id, body.phrase, t.id)) return res(409, { code: "23505", message: "duplicate key value violates unique constraint" });
      Object.assign(t, body);
      return res(204);
    }
    // Sistemas de venda (Tracking T3.2): endereço do webhook, chave só uma vez, mapeamento e registro dos avisos.
    const salesKey = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    const salesAdmin = (cid) => ["admin", "gestor"].includes(role) && contactClientIds().includes(cid);
    if (url.includes("/rest/v1/rpc/sales_webhook_create")) {
      const p = parse();
      if (!salesAdmin(p.p_client)) return res(403, { code: "42501", message: "Só administrador e gestor configuram sistemas de venda." });
      const key = salesKey();
      const now = new Date().toISOString();
      const w = { id: crypto.randomUUID(), client_id: p.p_client, name: String(p.p_name).trim(), key_hint: key.slice(-4), key, enabled: true, test_mode: true,
        mapping: {}, last_received_at: null, last_result: null, last_reason: null, last_keys: [], created_at: now, archived_at: null };
      db.salesWebhooks.push(w);
      return res(200, { id: w.id, key });
    }
    if (url.includes("/rest/v1/rpc/sales_webhook_new_key")) {
      const w = db.salesWebhooks.find((x) => x.id === parse().p_id);
      if (!w || !salesAdmin(w.client_id)) return res(403, { code: "42501", message: "Só administrador e gestor configuram sistemas de venda." });
      w.key = salesKey();
      w.key_hint = w.key.slice(-4);
      return res(200, w.key);
    }
    if (url.includes("/rest/v1/tracking_sales_webhook_log")) {
      const wid = eqParam(url, "webhook_id");
      return res(200, db.salesLog.filter((l) => l.webhook_id === wid && contactClientIds().includes(l.client_id) && role !== "vendedor")
        .sort((a, b) => b.received_at.localeCompare(a.received_at) || b.id - a.id).slice(0, 20));
    }
    if (url.includes("/rest/v1/tracking_sales_webhooks")) {
      if (method === "GET") {
        const cid = eqParam(url, "client_id");
        if (!contactClientIds().includes(cid) || role === "vendedor") return res(200, []);
        // A tela nunca recebe a chave (no banco, só o hash existe e a coluna não é liberada).
        return res(200, db.salesWebhooks.filter((w) => w.client_id === cid && !w.archived_at).map(({ key: _key, ...w }) => w));
      }
      const w = db.salesWebhooks.find((x) => x.id === eqParam(url, "id"));
      if (!w || !salesAdmin(w.client_id)) return res(403, { code: "42501", message: "new row violates row-level security policy" });
      Object.assign(w, parse());
      return res(204);
    }
    if (url.includes("/rest/v1/tracking_contact_profiles") || url.includes("/rest/v1/tracking_contact_stages")) {
      const list = url.includes("profiles") ? db.contactProfiles : db.contactStages;
      if (method === "GET") {
        const cid = eqParam(url, "client_id");
        if (!contactClientIds().includes(cid)) return res(200, []);
        contactSeed(cid);
        return res(200, list.filter((x) => x.client_id === cid).sort((a, b) => a.position - b.position));
      }
      if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "new row violates row-level security policy" });
      if (method === "POST") { list.push({ id: crypto.randomUUID(), archived_at: null, meta_event: null, ...parse() }); return res(201); }
      if (method === "PATCH") { Object.assign(list.find((x) => x.id === eqParam(url, "id")), parse()); return res(204); }
    }

    // Regras do site sem Tag Manager (Tracking T2): mesmas regras do banco (rascunho, publicar, voltar versão)
    if (url.includes("/rest/v1/tracking_rule_versions")) {
      const cid = eqParam(url, "container_id");
      return res(200, db.trackingRuleVersions.filter((v) => v.container_id === cid).sort((a, b) => b.version - a.version)
        .map(({ version, rules_count, restored_from, published_at }) => ({ version, rules_count, restored_from, published_at })));
    }
    // Relógio que sempre anda (no banco, cada mudança tem um horário maior que a anterior).
    const ruleClock = () => { db.ruleClock = Math.max(Date.now(), (db.ruleClock ?? 0) + 1); return new Date(db.ruleClock).toISOString(); };
    if (url.includes("/rest/v1/tracking_rules")) {
      const canEdit = ["admin", "gestor"].includes(role);
      if (method === "GET") {
        const cid = eqParam(url, "container_id");
        return res(200, db.trackingRules.filter((r) => r.container_id === cid).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)));
      }
      if (!canEdit) return res(403, { code: "42501", message: "new row violates row-level security policy" });
      const now = ruleClock();
      if (method === "POST") {
        const row = parse();
        const c = db.trackingContainers.find((x) => x.id === row.container_id);
        if (row.event_name === "Purchase" && row.value_mode === "nenhum") return res(400, { code: "23514", message: "violates check constraint tracking_rules_purchase" });
        db.trackingRules.push({ id: crypto.randomUUID(), enabled: true, archived_at: null, created_at: now, updated_at: now, ...row, client_id: c.client_id });
        return res(201);
      }
      if (method === "PATCH") {
        const r = db.trackingRules.find((x) => x.id === eqParam(url, "id"));
        Object.assign(r, parse(), { updated_at: now });
        return res(204);
      }
    }
    if (url.includes("/rest/v1/rpc/tracking_rules_publish") || url.includes("/rest/v1/rpc/tracking_rules_restore")) {
      const p = parse();
      if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "Só administrador e gestor publicam regras." });
      const c = db.trackingContainers.find((x) => x.id === p.p_container_id);
      const keys = ["id", "name", "kind", "match_op", "match_text", "click_by", "field_name", "field_values", "event_name", "meta_mode", "meta_event",
        "value_mode", "value_fixed", "value_selector", "currency", "order_param"];
      if (url.includes("tracking_rules_restore")) {
        const v = db.trackingRuleVersions.find((x) => x.container_id === c.id && x.version === p.p_version);
        if (!v) return res(404, { code: "P0002", message: "Versão não encontrada." });
        const now = ruleClock();
        for (const r of db.trackingRules) if (r.container_id === c.id && !r.archived_at) Object.assign(r, { archived_at: now, updated_at: now });
        v.rules.forEach((r, i) => db.trackingRules.push({ ...r, id: crypto.randomUUID(), container_id: c.id, client_id: c.client_id, position: i,
          enabled: true, archived_at: null, created_at: now, updated_at: now }));
      }
      const rules = db.trackingRules.filter((r) => r.container_id === c.id && !r.archived_at && r.enabled)
        .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
        .map((r) => Object.fromEntries(keys.filter((k) => r[k] != null).map((k) => [k, r[k]])));
      const version = Math.max(0, ...db.trackingRuleVersions.filter((x) => x.container_id === c.id).map((x) => x.version)) + 1;
      db.trackingRuleVersions.push({ container_id: c.id, version, rules, rules_count: rules.length,
        restored_from: url.includes("tracking_rules_restore") ? p.p_version : null, published_at: ruleClock() });
      c.rules_version = version;
      db.rpcCalls.push({ fn: url.includes("restore") ? "tracking_rules_restore" : "tracking_rules_publish", ...p });
      return res(200, version);
    }
    if (url.includes("/rest/v1/rpc/tracking_overview")) {
      const p = parse();
      const inRange = (t) => t >= p.p_from && t < p.p_to;
      return res(200, db.trackingContainers.map((c) => {
        const ev = db.trackingEvents.filter((e) => e.container_id === c.id);
        const sessions = new Map();
        for (const e of ev) if (!sessions.has(e.session_id)) sessions.set(e.session_id, e);
        const started = [...sessions.values()].filter((e) => inRange(e.occurred_at));
        const touchOf = (e) => db.trackingTouchpoints.find((t) => t.id === e.touchpoint_id);
        return {
          container_id: c.id,
          sessions: started.length,
          visitors: new Set(started.map((e) => e.visitor_id)).size,
          pageviews: ev.filter((e) => e.event_name === "PageView" && inRange(e.occurred_at)).length,
          events: ev.filter((e) => inRange(e.occurred_at)).length,
          paid_sessions: started.filter((e) => touchOf(e)?.paid === true).length,
          unknown_origin_sessions: started.filter((e) => !touchOf(e) || touchOf(e).evidence === "desconhecida").length,
          last_event_at: ev.length ? ev.map((e) => e.occurred_at).sort().at(-1) : null,
        };
      }));
    }
    if (url.includes("/rest/v1/rpc/tracking_conversions_summary")) {
      const p = parse();
      const inRange = (t) => t >= p.p_from && t < p.p_to;
      const conv = ["Lead", "CompleteRegistration", "SubmitApplication", "Schedule", "Purchase"];
      const rows = [];
      for (const c of db.trackingContainers) {
        const ev = db.trackingEvents.filter((e) => e.container_id === c.id && conv.includes(e.event_name) && inRange(e.occurred_at));
        if (ev.length) rows.push({ container_id: c.id, currency: null, leads: ev.filter((e) => e.event_name === "Lead").length, conversions: ev.length, purchases: 0, revenue_micros: 0 });
        const byCur = new Map();
        for (const pu of db.trackingPurchases.filter((x) => x.container_id === c.id && inRange(x.occurred_at))) {
          const r = byCur.get(pu.currency) ?? { container_id: c.id, currency: pu.currency, leads: 0, conversions: 0, purchases: 0, revenue_micros: 0 };
          r.purchases += 1;
          r.revenue_micros += pu.value_micros;
          byCur.set(pu.currency, r);
        }
        rows.push(...byCur.values());
      }
      return res(200, rows);
    }
    if (url.includes("/rest/v1/rpc/tracking_lead_journey")) {
      return res(200, db.trackingJourneys[parse().p_lead_id] ?? []);
    }
    if (url.includes("/rest/v1/tracking_destinations")) {
      return res(200, db.trackingDestinations.map(({ token: _t, ...d }) => ({ ...d, has_token: db.capiTokens[d.id] != null })));
    }
    if (url.includes("/rest/v1/rpc/tracking_capi_overview")) {
      return res(200, db.trackingDestinations.map((d) => ({ destination_id: d.id, pending: d.pending ?? 0, sent_24h: d.sent_24h ?? 0, errors_24h: d.errors_24h ?? 0, discarded_24h: 0, last_sent_at: d.last_success_at ?? null })));
    }
    if (url.includes("/rest/v1/tracking_capi_log")) {
      const dest = eqParam(url, "destination_id");
      return res(200, db.trackingCapiLog.filter((l) => l.destination_id === dest).sort((a, b) => b.requested_at.localeCompare(a.requested_at)).slice(0, 10));
    }
    if (url.includes("/rest/v1/tracking_whatsapp_clicks")) {
      return res(200, [...db.whatsappClicks].sort((a, b) => b.clicked_at.localeCompare(a.clicked_at)).map((c) => ({ ...c, touch: c.touch ?? null })));
    }
    if (url.includes("/rest/v1/tracking_whatsapp_connections")) {
      const cid = eqParam(url, "client_id");
      return res(200, db.whatsappConnections.filter((w) => !cid || w.client_id === cid).map((w) => ({ ...w, has_app_secret: db.waSecrets[w.id]?.app != null })));
    }
    if (url.includes("/rest/v1/tracking_whatsapp_conversations")) {
      return res(200, [...db.whatsappConversations].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)).map((c) => ({ ...c, touch: c.touch ?? null })));
    }
    if (url.includes("/rest/v1/rpc/tracking_attribution")) {
      const model = parse().p_model === "first" ? "first" : "last";
      return res(200, db.trackingAttribution[model] ?? []);
    }
    if (url.includes("/rest/v1/rpc/tracking_quality")) {
      return res(200, db.trackingQuality);
    }
    if (url.includes("/rest/v1/rpc/tracking_whatsapp_lookup")) {
      let code = String(parse().p_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length === 9 && code.startsWith("REF")) code = code.slice(3);
      const c = db.whatsappClicks.find((x) => x.code === code);
      if (!c) return res(200, []);
      const k = db.trackingContainers.find((x) => x.id === c.container_id);
      return res(200, [{ id: c.id, code: c.code, container_id: c.container_id, client_id: k?.client_id, container_name: k?.name ?? "", clicked_at: c.clicked_at,
        page_url: c.page_url ?? null, status: c.status, sales: c.sales, lead_marked_at: null, test: c.test,
        channel: c.touch?.channel ?? null, paid: c.touch?.paid ?? null, evidence: c.touch?.evidence ?? null, reason: c.touch?.reason ?? null, campaign: c.touch?.utm_campaign ?? null }]);
    }
    if (url.includes("/rest/v1/tracking_leads")) {
      return res(200, [...db.trackingLeads].sort((a, b) => b.last_converted_at.localeCompare(a.last_converted_at)).slice(0, 50));
    }
    if (url.includes("/rest/v1/tracking_touchpoints")) {
      return res(200, [...db.trackingTouchpoints].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 50));
    }
    if (url.includes("/rest/v1/tracking_events")) {
      return res(200, [...db.trackingEvents].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 50));
    }

    // --- Estrutura por plataforma (mesma regra de public.platform_structure)
    if (url.includes("/rest/v1/rpc/platform_structure")) {
      const p = parse();
      db.rpcCalls.push({ fn: "platform_structure", ...p });
      const accs = new Set(db.adAccounts.filter((a) => a.platform_id === p.p_platform && !a.unlinked_at &&
        (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id))).map((a) => a.id));
      const accountOf = (x) => x.ad_account_id ?? db.campaigns.find((c) => c.id === x.campaign_id)?.ad_account_id;
      const out = [];
      for (const [level, list] of [["campaign", db.campaigns], ["ad_group", db.adGroups], ["ad", db.ads]]) {
        const counts = {};
        for (const x of list) {
          const campaignId = level === "campaign" ? x.id : x.campaign_id;
          if (!accs.has(accountOf(x)) || (p.p_campaign_ids && !p.p_campaign_ids.includes(campaignId))) continue;
          counts[x.status] = (counts[x.status] ?? 0) + 1;
        }
        for (const [status, total] of Object.entries(counts)) out.push({ level, status, total });
      }
      return res(200, out);
    }

    // --- Alcance por período (tabela public.period_reach, lida direto com o RLS)
    if (url.includes("/rest/v1/period_reach")) {
      const f = (k) => eqParam(url, k);
      db.reachQueries = (db.reachQueries ?? 0) + 1;
      return res(200, (db.reachRows ?? []).filter((r) => r.ad_account_id === f("ad_account_id") && r.level === f("level") &&
        r.entity_external_id === f("entity_external_id") && r.period_start === f("period_start") && r.period_end === f("period_end")));
    }

    // --- Saldo das contas (mesma regra de public.account_balances)
    if (url.includes("/rest/v1/rpc/account_balances")) return res(200, balanceRows(parse()));
    // --- Saldo PIX informado no CRM (só contas marcadas)
    if (url.includes("/rest/v1/rpc/manual_balance_")) {
      const p = parse();
      const canEdit = role === "admin" || role === "gestor";
      const list = (db.manualBalance ??= []);
      if (url.includes("/rpc/manual_balance_status")) {
        const a = db.adAccounts.find((x) => x.id === p.p_ad_account_id);
        if (!a || role === "cliente") return res(403, { code: "42501", message: "Conta não encontrada." });
        const entries = list.filter((x) => x.ad_account_id === a.id).sort((x, y) => y.entered_at.localeCompare(x.entered_at) || y.id - x.id).slice(0, 50)
          .map((x) => ({ ...x, created_by_name: x.created_by === userId ? fullName : null }));
        return res(200, { enabled: !!a.manual_prepaid, currency: a.currency, ...manualState(a.id), can_edit: canEdit, entries });
      }
      if (url.includes("/rpc/manual_balance_add")) {
        const a = db.adAccounts.find((x) => x.id === p.p_ad_account_id);
        if (!a || !canEdit) return res(403, { code: "42501", message: "Sem permissão para informar saldo desta conta." });
        if (!a.manual_prepaid) return res(400, { code: "22023", message: "Esta conta não usa saldo informado no CRM." });
        if (!["recarga", "saldo"].includes(p.p_kind) || !(p.p_amount_micros >= 0) || (p.p_kind === "recarga" && p.p_amount_micros === 0)) {
          return res(400, { code: "22023", message: "Valor inválido." });
        }
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
        const before = db.metrics.filter((m) => m.ad_account_id === a.id && m.level === "account" && m.date === today).reduce((t, m) => t + m.spend_micros, 0);
        const id = list.length + 1;
        list.push({ id, ad_account_id: a.id, kind: p.p_kind, amount_micros: p.p_amount_micros, entered_at: new Date().toISOString(),
          account_day: today, day_spend_before_micros: before, note: p.p_note ?? null, created_by: userId, voided_at: null, void_reason: null });
        return res(200, id);
      }
      if (url.includes("/rpc/manual_balance_void")) {
        const e = list.find((x) => x.id === p.p_entry_id);
        if (!e || !canEdit) return res(403, { code: "42501", message: "Registro não encontrado." });
        if (e.voided_at) return res(400, { code: "22023", message: "Este registro já foi cancelado." });
        e.voided_at = new Date().toISOString();
        e.void_reason = p.p_reason ?? null;
        return res(204);
      }
    }

    // --- Saúde das contas (mesma regra de public.account_health)
    if (url.includes("/rest/v1/rpc/account_health")) {
      const p = parse();
      return res(200, balanceRows({ ...p, p_ad_account_ids: null }).map((b) => {
        const a = db.adAccounts.find((x) => x.id === b.ad_account_id);
        const sync = db.syncState[a.id] ?? { status: "pendente" };
        const conn = db.connections.find((c) => c.id === a.connection_id);
        return {
          ...b, raw_status: a.raw_status ?? null, status_reason: a.status_reason ?? null, is_test_account: a.is_test_account ?? null,
          details_updated_at: a.details_updated_at ?? null, sync_status: sync.status, last_attempt_at: sync.last_attempt_at ?? null,
          last_success_at: sync.last_success_at ?? null, last_error_message: sync.last_error_message ?? null,
          connection_id: a.connection_id ?? null, connection_status: conn?.status ?? null, connection_error: conn?.last_error ?? null,
        };
      }));
    }

    if (url.includes("/rest/v1/ad_groups")) {
      const id = eqParam(url, "id");
      const campaignId = eqParam(url, "campaign_id");
      if (campaignId) return res(200, db.adGroups.filter((g) => g.campaign_id === campaignId));
      return res(200, db.adGroups.find((g) => g.id === id) ?? null);
    }
    if (url.includes("/rest/v1/entity_changes")) {
      const level = eqParam(url, "entity_level");
      const id = eqParam(url, "entity_id");
      return res(200, db.entityChanges.filter((c) => c.entity_level === level && c.entity_id === id)
        .sort((a, b) => b.detected_at.localeCompare(a.detected_at)));
    }

    // --- Campanha, conjunto/grupo ou anúncio (mesma regra de public.entity_rows)
    if (url.includes("/rest/v1/rpc/entity_rows")) {
      const p = parse();
      db.rpcCalls.push({ fn: "entity_rows", ...p });
      const source = { campaign: db.campaigns, ad_group: db.adGroups, ad: db.ads }[p.p_level];
      const parentKey = { campaign: null, ad_group: "campaign_id", ad: "ad_group_id" }[p.p_level];
      const metricKey = { campaign: "campaign_id", ad_group: "ad_group_id", ad: "ad_id" }[p.p_level];
      const q = p.p_search?.trim().toLowerCase();
      const sum = (list, k) => (list.length && !list.every((m) => m[k] == null) ? list.reduce((t, m) => t + (m[k] ?? 0), 0) : null);
      const div = (a, b, f = 1) => (a != null && b ? (a * f) / b : null);
      let rows = source
        .filter((e) => (!p.p_ids || p.p_ids.includes(e.id)) && (!p.p_parent_id || e[parentKey] === p.p_parent_id) &&
          (!p.p_statuses || p.p_statuses.includes(e.status)) && (!q || e.name.toLowerCase().includes(q) || e.external_id === p.p_search.trim()))
        .map((e) => {
          const acc = db.adAccounts.find((a) => a.id === e.ad_account_id);
          const ms = db.metrics.filter((m) => m.level === p.p_level && m[metricKey] === e.id && m.date >= p.p_from && m.date <= p.p_to);
          const has = ms.length > 0;
          const t = Object.fromEntries(["spend_micros", "impressions", "clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, has ? sum(ms, k) : null]));
          return {
            id: e.id, level: p.p_level, name: e.name, external_id: e.external_id, parent_id: parentKey ? e[parentKey] : null,
            campaign_id: p.p_level === "campaign" ? e.id : e.campaign_id, client_id: e.client_id, platform_id: e.platform_id,
            ad_account_id: e.ad_account_id, currency: acc?.currency ?? null, status: e.status, raw_status: null,
            detail: e.objective ?? e.optimization_goal ?? e.creative_type ?? null, review_status: e.review_status ?? null,
            thumbnail_url: e.thumbnail_url ?? null, budget_micros: e.budget_micros ?? null, budget_period: e.budget_period ?? null,
            has_data: has, ...t, reach: null, frequency: null,
            ctr: div(t.clicks, t.impressions, 100), cpc_micros: div(t.spend_micros, t.clicks), cpm_micros: div(t.spend_micros, t.impressions, 1000),
            cpl_micros: div(t.spend_micros, t.leads), cpa_micros: div(t.spend_micros, t.conversions),
            roas: t.conversion_value_micros ? div(t.conversion_value_micros, t.spend_micros) : null,
          };
        });
      const keyOf = { name: "name", status: "status", budget: "budget_micros", spend: "spend_micros", impressions: "impressions", clicks: "clicks",
        ctr: "ctr", cpc: "cpc_micros", cpm: "cpm_micros", leads: "leads", conversions: "conversions", cpl: "cpl_micros", cpa: "cpa_micros", roas: "roas" }[p.p_sort] ?? "spend_micros";
      const desc = p.p_desc ?? true;
      rows.sort((a, b) => {
        const x = a[keyOf], y = b[keyOf];
        if (x == null && y == null) return a.name.localeCompare(b.name);
        if (x == null) return 1;
        if (y == null) return -1;
        const cmp = typeof x === "string" ? x.toLowerCase().localeCompare(y.toLowerCase()) : x - y;
        return (desc ? -cmp : cmp) || a.name.localeCompare(b.name);
      });
      const total = rows.length;
      rows = rows.slice(p.p_offset ?? 0, (p.p_offset ?? 0) + (p.p_limit ?? 50)).map((r) => ({ ...r, total_count: total }));
      return res(200, rows);
    }

    // --- Tabela de campanhas (mesma regra de public.campaign_table)
    if (url.includes("/rest/v1/rpc/campaign_table")) {
      const p = parse();
      db.rpcCalls.push({ fn: "campaign_table", ...p });
      const q = p.p_search?.trim().toLowerCase();
      const sum = (list, k) => (list.length && !list.every((m) => m[k] == null) ? list.reduce((t, m) => t + (m[k] ?? 0), 0) : null);
      const div = (a, b, f = 1) => (a != null && b ? (a * f) / b : null);
      let rows = db.campaigns
        .filter((c) => (!p.p_client_ids || p.p_client_ids.includes(c.client_id)) && (!p.p_platforms || p.p_platforms.includes(c.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(c.ad_account_id)) && (!p.p_statuses || p.p_statuses.includes(c.status)))
        .map((c) => {
          const acc = db.adAccounts.find((a) => a.id === c.ad_account_id);
          const client = db.clients.find((x) => x.id === c.client_id);
          const ms = db.metrics.filter((m) => m.level === "campaign" && m.campaign_id === c.id && m.date >= p.p_from && m.date <= p.p_to);
          const has = ms.length > 0;
          const t = Object.fromEntries(["spend_micros", "impressions", "clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, has ? sum(ms, k) : null]));
          const reach = (db.periodReach ?? []).find((r) => r.campaign_id === c.id && r.period_start === p.p_from && r.period_end === p.p_to)?.reach ?? null;
          return {
            campaign_id: c.id, name: c.name, external_id: c.external_id ?? c.id, client_id: c.client_id, client_name: client?.name ?? "",
            platform_id: c.platform_id, ad_account_id: c.ad_account_id, account_name: acc?.name ?? "", currency: acc?.currency ?? null,
            objective: c.objective ?? null, status: c.status, raw_status: null, budget_micros: c.budget_micros ?? null, budget_period: c.budget_period ?? null,
            has_data: has, ...t, reach, frequency: reach ? t.impressions / reach : null,
            ctr: div(t.clicks, t.impressions, 100), cpc_micros: div(t.spend_micros, t.clicks), cpm_micros: div(t.spend_micros, t.impressions, 1000),
            cpl_micros: div(t.spend_micros, t.leads), cpa_micros: div(t.spend_micros, t.conversions),
            roas: t.conversion_value_micros ? div(t.conversion_value_micros, t.spend_micros) : null,
          };
        })
        .filter((r) => !q || r.name.toLowerCase().includes(q) || r.client_name.toLowerCase().includes(q) || r.external_id === p.p_search.trim());
      const keyOf = { name: "name", platform: "platform_id", objective: "objective", status: "status", budget: "budget_micros", spend: "spend_micros",
        impressions: "impressions", reach: "reach", frequency: "frequency", clicks: "clicks", ctr: "ctr", cpc: "cpc_micros", cpm: "cpm_micros",
        leads: "leads", messages: "messages", conversions: "conversions", cpl: "cpl_micros", cpa: "cpa_micros", roas: "roas" }[p.p_sort];
      rows.sort((a, b) => {
        const x = a[keyOf], y = b[keyOf];
        if (x == null && y == null) return a.name.localeCompare(b.name);
        if (x == null) return 1;
        if (y == null) return -1;
        const cmp = typeof x === "string" ? x.toLowerCase().localeCompare(y.toLowerCase()) : x - y;
        return (p.p_desc ? -cmp : cmp) || a.name.localeCompare(b.name);
      });
      const total = rows.length;
      rows = rows.slice(p.p_offset, p.p_offset + p.p_limit).map((r) => ({ ...r, total_count: total }));
      return res(200, rows);
    }

    // --- Série no tempo do gráfico (mesma regra de public.dashboard_timeseries)
    if (url.includes("/rest/v1/rpc/dashboard_timeseries")) {
      const p = parse();
      db.rpcCalls.push({ fn: "dashboard_timeseries", ...p });
      const byCampaign = Boolean(p.p_campaign_ids || p.p_campaign_statuses);
      const monday = (d) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
      const bucketOf = (d) => (p.p_granularity === "day" ? d : p.p_granularity === "week" ? monday(d) : `${d.slice(0, 7)}-01`);
      const rows = db.metrics.filter((m) => {
        const campaign = db.campaigns.find((c) => c.id === m.campaign_id);
        return m.level === (byCampaign ? "campaign" : "account") && m.date >= p.p_from && m.date <= p.p_to &&
          (!p.p_client_ids || p.p_client_ids.includes(m.client_id)) && (!p.p_platforms || p.p_platforms.includes(m.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(m.ad_account_id)) && (!p.p_campaign_ids || p.p_campaign_ids.includes(m.campaign_id)) &&
          (!p.p_campaign_statuses || p.p_campaign_statuses.includes(campaign?.status));
      });
      const groups = Map.groupBy(rows, (m) => `${bucketOf(m.date)}|${p.p_by_platform ? m.platform_id : ""}|${m.currency}`);
      const sum = (list, k) => (list.every((r) => r[k] == null) ? null : list.reduce((t, r) => t + (r[k] ?? 0), 0));
      const out = [...groups].map(([key, list]) => {
        const [bucket, platform, currency] = key.split("|");
        const entities = new Set(list.map((m) => (byCampaign ? m.campaign_id : m.ad_account_id)));
        return {
          bucket, platform_id: platform || null, currency,
          ...Object.fromEntries(["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, sum(list, k)])),
          reach: p.p_granularity === "day" && entities.size === 1 ? sum(list, "reach") : null,
          days_with_data: new Set(list.map((m) => m.date)).size,
        };
      }).sort((a, b) => a.bucket.localeCompare(b.bucket));
      return res(200, out);
    }

    // --- Resumo do dashboard (mesma regra de public.dashboard_summary)
    if (url.includes("/rest/v1/rpc/dashboard_summary")) {
      const p = parse();
      db.rpcCalls.push(p);
      const byCampaign = Boolean(p.p_campaign_ids || p.p_campaign_statuses);
      const rows = db.metrics.filter((m) => {
        const campaign = db.campaigns.find((c) => c.id === m.campaign_id);
        return m.level === (byCampaign ? "campaign" : "account") && m.date >= p.p_from && m.date <= p.p_to &&
          (!p.p_client_ids || p.p_client_ids.includes(m.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(m.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(m.ad_account_id)) &&
          (!p.p_campaign_ids || p.p_campaign_ids.includes(m.campaign_id)) &&
          (!p.p_campaign_statuses || p.p_campaign_statuses.includes(campaign?.status));
      });
      const sum = (list, key) => (list.every((r) => r[key] == null) ? null : list.reduce((t, r) => t + (r[key] ?? 0), 0));
      const groups = Map.groupBy(rows, (r) => r.currency);
      const out = [...groups].map(([currency, list]) => ({
        currency, source_level: byCampaign ? "campaign" : "account",
        ...Object.fromEntries(["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, sum(list, k)])),
        accounts: new Set(list.map((r) => r.ad_account_id)).size,
        campaigns: new Set(list.map((r) => r.campaign_id).filter(Boolean)).size,
        days_with_data: new Set(list.map((r) => r.date)).size,
        last_synced_at: db.lastSyncedAt ?? "2026-09-23T22:10:00Z",
      })).sort((a, b) => b.spend_micros - a.spend_micros);
      return res(200, out);
    }

    // --- Visão executiva (mesma regra de public.executive_breakdown)
    if (url.includes("/rest/v1/rpc/executive_breakdown")) {
      const p = parse();
      db.rpcCalls.push({ fn: "executive_breakdown", ...p });
      const rows = db.metrics.filter((m) => m.level === "account" && m.date >= p.p_from && m.date <= p.p_to &&
        (!p.p_client_ids || p.p_client_ids.includes(m.client_id)) &&
        (!p.p_platforms || p.p_platforms.includes(m.platform_id)));
      const sum = (list, key) => (list.every((r) => r[key] == null) ? null : list.reduce((t, r) => t + (r[key] ?? 0), 0));
      const groups = Map.groupBy(rows, (r) => `${r.client_id}|${r.platform_id}|${r.currency}`);
      const out = [...groups.values()].map((list) => ({
        client_id: list[0].client_id,
        client_name: db.clients.find((c) => c.id === list[0].client_id)?.name ?? "",
        platform_id: list[0].platform_id,
        currency: list[0].currency,
        ...Object.fromEntries(["spend_micros", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, sum(list, k)])),
        accounts: new Set(list.map((r) => r.ad_account_id)).size,
      })).sort((a, b) => b.spend_micros - a.spend_micros);
      return res(200, out);
    }

    // --- Sincronização
    if (url.includes("/rest/v1/rpc/sync_overview")) {
      db.rpcCalls.push({ fn: "sync_overview" });
      const rows = db.adAccounts.filter((a) => !a.unlinked_at).map((a) => {
        const s = db.syncState[a.id] ?? {};
        const r = db.syncRuns.filter((x) => x.ad_account_id === a.id).sort((x, y) => y.started_at.localeCompare(x.started_at))[0];
        return {
          ad_account_id: a.id, client_id: a.client_id, client_name: db.clients.find((c) => c.id === a.client_id)?.name ?? "",
          platform_id: a.platform_id, external_id: a.external_id, name: a.name,
          is_test_account: !!a.is_test_account, has_connection: !!a.connection_id,
          status: s.status ?? "pendente", last_attempt_at: s.last_attempt_at ?? null, last_success_at: s.last_success_at ?? null,
          next_run_at: s.next_run_at ?? null, last_error_message: s.last_error_message ?? null, running: !!s.running,
          run_status: r?.status ?? null, run_started_at: r?.started_at ?? null, run_finished_at: r?.finished_at ?? null,
          run_duration_ms: r?.duration_ms ?? null, run_records: r?.records_updated ?? null, run_trigger: r?.trigger ?? null, run_error: r?.error_message ?? null,
        };
      }).sort((x, y) => x.client_name.localeCompare(y.client_name) || x.platform_id.localeCompare(y.platform_id) || x.name.localeCompare(y.name));
      return res(200, rows);
    }
    if (url.includes("/rest/v1/sync_runs")) {
      const q = new URL(url).searchParams;
      const val = (k) => q.get(k)?.replace(/^(eq|gte|lt)\./, "");
      const limit = Number(q.get("limit") ?? 50);
      const byId = q.get("order")?.startsWith("id");
      const rows = [...db.syncRuns]
        .filter((x) => (!q.get("status") || x.status === val("status")) && (!q.get("client_id") || x.client_id === val("client_id")) &&
          (!q.get("started_at") || x.started_at >= val("started_at")) && (!q.get("id") || x.id < Number(val("id"))))
        .sort((x, y) => (byId ? y.id - x.id : y.started_at.localeCompare(x.started_at)))
        .slice(0, limit)
        .map((x) => {
          const acc = db.adAccounts.find((a) => a.id === x.ad_account_id);
          return { ...x, ad_accounts: acc ? { name: acc.name, external_id: acc.external_id } : null, clients: { name: db.clients.find((c) => c.id === x.client_id)?.name ?? "" } };
        });
      return res(200, rows);
    }
    // --- Logs (Etapa 17)
    if (url.includes("/rest/v1/rpc/log_auth_event")) {
      db.authEvents.push(parse().p_event);
      return res(200, null);
    }
    // --- Erros técnicos (Etapa 25): o site registra; só o administrador lê
    if (url.includes("/rest/v1/rpc/log_client_error")) {
      const p = parse();
      db.errorLogs.push({ id: 1000 + db.errorLogs.length, occurred_at: new Date().toISOString(), source: "site", code: p.p_code, user_message: p.p_user_message,
        technical: p.p_technical, context: p.p_context ?? {}, user_id: userId, user_name: fullName, ad_account_id: null, account_name: null, client_id: null, client_name: null });
      return res(200, true);
    }
    if (url.includes("/rest/v1/rpc/error_log_list")) {
      const p = parse();
      db.rpcCalls.push({ fn: "error_log_list", ...p });
      if (role !== "admin") return res(200, []);
      const rows = [...db.errorLogs]
        .filter((l) => (!p.p_from || l.occurred_at >= p.p_from) && (!p.p_source || l.source === p.p_source) && (!p.p_before_id || l.id < p.p_before_id))
        .sort((x, y) => y.id - x.id)
        .slice(0, p.p_limit ?? 100);
      return res(200, rows);
    }
    // --- Histórico (Etapa 23): até onde vai o histórico de cada conta
    if (url.includes("/rest/v1/rpc/history_coverage")) {
      const p = parse();
      db.rpcCalls.push({ fn: "history_coverage", ...p });
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const [y, mo] = today.split("-").map(Number);
      const t = y * 12 + (mo - 1) - 12;
      const target = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
      const rows = db.adAccounts
        .filter((a) => !a.unlinked_at && (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(a.platform_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id)))
        .map((a) => {
          const c = db.coverage[a.id] ?? {};
          return {
            ad_account_id: a.id, name: a.name, client_id: a.client_id, client_name: db.clients.find((x) => x.id === a.client_id)?.name ?? "",
            platform_id: a.platform_id, currency: a.currency, history_from: c.history_from ?? null, history_to: c.history_to ?? null,
            target, importing: c.importing ?? false, backfill_error: c.backfill_error ?? null,
          };
        });
      return res(200, rows);
    }
    // --- Busca global (Etapa 22): mesma regra de public.global_search
    if (url.includes("/rest/v1/rpc/global_search")) {
      const p = parse();
      db.rpcCalls.push({ fn: "global_search", ...p });
      if (role === "cliente") return res(200, []);
      const norm = (t) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const q = norm(p.p_query.trim());
      if (q.length < 2) return res(200, []);
      const id = p.p_query.trim().replace(/^act_/, "");
      const lim = Math.min(Math.max(p.p_limit ?? 5, 1), 20);
      const hit = (x) => norm(x.name).includes(q) || x.external_id === id;
      const clientName = (cid) => db.clients.find((c) => c.id === cid)?.name ?? "";
      const pick = (list) => list.filter(hit).slice(0, lim);
      const rows = [
        ...db.clients.filter((c) => norm(c.name).includes(q) || norm(c.company).includes(q)).slice(0, lim)
          .map((c) => ({ kind: "cliente", id: c.id, name: c.name, external_id: null, platform_id: null, client_id: c.id, client_name: c.name, parent_name: c.company, status: c.status })),
        ...pick(db.adAccounts.filter((a) => !a.unlinked_at))
          .map((a) => ({ kind: "conta", id: a.id, name: a.name, external_id: a.external_id, platform_id: a.platform_id, client_id: a.client_id, client_name: clientName(a.client_id), parent_name: null, status: a.status ?? "ativa" })),
        ...pick(db.campaigns)
          .map((x) => ({ kind: "campanha", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.adAccounts.find((a) => a.id === x.ad_account_id)?.name ?? null, status: x.status })),
        ...pick(db.adGroups)
          .map((x) => ({ kind: "conjunto", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.campaigns.find((c) => c.id === x.campaign_id)?.name ?? null, status: x.status })),
        ...pick(db.ads)
          .map((x) => ({ kind: "anuncio", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.campaigns.find((c) => c.id === x.campaign_id)?.name ?? null, status: x.status })),
      ];
      return res(200, rows);
    }
    if (url.includes("/rest/v1/rpc/audit_log_list")) {
      const p = parse();
      db.rpcCalls.push({ fn: "audit_log_list", ...p });
      if (role !== "admin") return res(200, []);
      const rows = [...db.audit]
        .filter((l) => (!p.p_from || l.created_at >= p.p_from) && (!p.p_actor || l.actor_id === p.p_actor) &&
          (!p.p_before_id || l.id < p.p_before_id) &&
          (!p.p_category || (p.p_category === "auth" ? l.action.startsWith("auth.") : l.target_type === p.p_category && !l.action.startsWith("auth."))))
        .sort((x, y) => y.id - x.id)
        .slice(0, p.p_limit ?? 100)
        .map((l) => {
          const actor = db.profiles.find((x) => x.id === l.actor_id);
          return { ...l, actor_name: actor?.full_name || null, actor_email: actor?.email ?? null };
        });
      return res(200, rows);
    }
    if (url.includes("/functions/v1/sync")) {
      const body = parse();
      db.syncCalls.push(body);
      if (!["admin", "gestor", "operador"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
      const visible = db.adAccounts.filter((a) => !a.unlinked_at && a.connection_id && (!body.adAccountIds || body.adAccountIds.includes(a.id)));
      if (!visible.length) return res(404, { error: { code: "NOT_FOUND", message: "Nenhuma conta com conexão ativa para sincronizar." } });
      // Cache (mesma regra do servidor): < 10 min = recente; onlyStale = só > 90 min ou nunca.
      const age = (a) => { const t = db.syncState[a.id]?.last_success_at; return t ? (Date.now() - Date.parse(t)) / 60_000 : null; };
      const skip = (a) => (body.onlyStale ? age(a) != null && age(a) <= 90 : age(a) != null && age(a) < 10);
      const wanted = visible.filter((a) => !skip(a));
      const fresh = visible.length - wanted.length;
      const results = [];
      let runId = db.syncRuns.reduce((m, x) => Math.max(m, x.id), 0);
      for (const a of wanted) {
        const o = db.syncOutcome[a.id] ?? { status: "sucesso", records: 100, durationMs: 4000 };
        const end = new Date();
        const start = new Date(end.getTime() - o.durationMs).toISOString();
        db.syncRuns.push({ id: ++runId, ad_account_id: a.id, client_id: a.client_id, platform_id: a.platform_id, trigger: "manual", status: o.status,
          started_at: start, finished_at: end.toISOString(), duration_ms: o.durationMs, records_updated: o.records, error_message: o.error ?? null });
        const prev = db.syncState[a.id] ?? {};
        db.syncState[a.id] = { ...prev, status: o.status, running: false, last_attempt_at: start,
          last_success_at: o.status === "sucesso" ? end.toISOString() : prev.last_success_at ?? null,
          next_run_at: new Date(end.getTime() + (o.status === "sucesso" ? 60 : 30) * 60_000).toISOString(), last_error_message: o.error ?? null };
        results.push({ adAccountId: a.id, status: o.status, records: o.records, durationMs: o.durationMs, error: o.error ?? null });
      }
      return res(200, { data: { results, queued: 0, alreadyRunning: 0, fresh } });
    }

    // --- Edge Function ad-accounts (simula o servidor + API do Meta)
    if (url.includes("/functions/v1/ad-accounts")) {
      const body = parse();
      db.adAccountCalls.push(body);
      const now = new Date().toISOString();
      switch (body.action) {
        case "connect": {
          if (!body.accessToken.startsWith("EAA")) {
            return res(400, { error: { code: "AUTH_EXPIRED", message: "O token do Meta é inválido ou expirou. Gere um novo token e conecte novamente." } });
          }
          const connection = { id: "c0000000-0000-4000-8000-000000000001", platform_id: "meta", label: body.label, status: "ativa", external_user_id: "su1", external_user_name: "Backstage Flow (sistema)", last_checked_at: now, last_error: null, created_at: now };
          db.connections.push(connection);
          return res(200, { data: { connectionId: connection.id, ownerName: connection.external_user_name, renewed: false } });
        }
        case "google_status":
          return res(200, { data: { missing: db.googleMissing, callbackPath: "/configuracoes/integracoes/google/callback" } });
        case "google_start":
          return res(200, { data: { url: `https://accounts.google.com/o/oauth2/v2/auth?state=${"a".repeat(64)}&redirect_uri=${encodeURIComponent(body.redirectUri)}` } });
        case "google_complete": {
          if (body.code !== "codigo-valido") {
            return res(400, { error: { code: "INVALID_STATE", message: "Autorização inválida ou expirada. Tente conectar de novo." } });
          }
          const connection = { id: "c0000000-0000-4000-8000-000000000002", platform_id: "google", label: body.label, status: "ativa", external_user_id: "g1", external_user_name: "agencia@gmail.com", last_checked_at: now, last_error: null, created_at: now };
          db.connections.push(connection);
          return res(200, { data: { connectionId: connection.id, ownerName: connection.external_user_name, renewed: false } });
        }
        case "disconnect": {
          db.connections.find((c) => c.id === body.connectionId).status = "revogada";
          return res(200, { data: { connectionId: body.connectionId } });
        }
        case "list_available": {
          const platform = db.connections.find((c) => c.id === body.connectionId)?.platform_id;
          const source = platform === "google" ? db.googleAccounts : db.metaAccounts;
          return res(200, { data: { accounts: source.map((a) => ({ managerId: null, isTestAccount: null, ...a, linkedClientId: db.adAccounts.find((x) => x.external_id === a.externalId && !x.unlinked_at)?.client_id ?? null })) } });
        }
        case "link": {
          const platform = db.connections.find((c) => c.id === body.connectionId)?.platform_id ?? "meta";
          const found = (platform === "google" ? db.googleAccounts : db.metaAccounts).find((a) => a.externalId === body.externalId);
          const id = `a0000000-0000-4000-8000-${body.externalId.padStart(12, "0").slice(-12)}`;
          db.adAccounts.push({
            id, platform_id: platform, external_id: found.externalId, client_id: body.clientId, connection_id: body.connectionId,
            name: found.name, currency: found.currency, timezone: found.timezone, status: found.status,
            raw_status: platform === "google" ? "customer.status=ENABLED" : "account_status=1",
            status_reason: null, business_name: found.businessName, is_prepay: null,
            manager_customer_id: body.managerCustomerId ?? null, is_test_account: found.isTestAccount ?? null,
            linked_at: now, details_updated_at: now, unlinked_at: null,
            assets: platform === "meta"
              ? [{ asset_type: "page", external_id: "p1", name: "Excalibur Fitness" }, { asset_type: "instagram", external_id: "ig1", name: "@excaliburfitness" }]
              : [],
          });
          return res(200, { data: { adAccountId: id, warning: null } });
        }
        case "refresh":
          return res(200, { data: { adAccountId: body.adAccountId, warning: null } });
        case "refresh_balance": {
          const results = body.adAccountIds.map((id) => {
            // Cache: fotografia de menos de 10 minutos já responde.
            const snapAt = db.snapshots[id]?.captured_at;
            if (snapAt && Date.now() - Date.parse(snapAt) < 10 * 60_000) return { adAccountId: id, ok: true, cached: true };
            if (db.fundingErrors[id]) return { adAccountId: id, ok: false, error: db.fundingErrors[id] };
            db.snapshots[id] = { ...db.fundingApi[id], captured_at: now };
            const acc = db.adAccounts.find((a) => a.id === id);
            if (acc && db.fundingApi[id]?.status) acc.status = db.fundingApi[id].status;
            return { adAccountId: id, ok: true };
          });
          return res(200, { data: { results } });
        }
        case "balance_settings": {
          const account = db.adAccounts.find((a) => a.id === body.adAccountId);
          account.low_balance_days = body.lowBalanceDays;
          account.low_balance_amount_micros = body.lowBalanceAmount == null ? null : Math.round(body.lowBalanceAmount * 1_000_000);
          return res(200, { data: { adAccountId: body.adAccountId } });
        }
        case "unlink": {
          db.adAccounts.find((a) => a.id === body.adAccountId).unlinked_at = now;
          return res(200, { data: { adAccountId: body.adAccountId } });
        }
      }
    }

    // --- Edge Function tracking-destinations (Meta CAPI)
    if (url.includes("/functions/v1/tracking-destinations")) {
      const body = parse();
      db.functionCalls.push({ fn: "tracking-destinations", ...body });
      if (!["admin", "gestor"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
      let dest = db.trackingDestinations.find((d) => d.container_id === body.containerId);
      if (body.action === "save") {
        if (!dest) {
          dest = { id: crypto.randomUUID(), container_id: body.containerId, last_success_at: null, last_error_at: null, last_error_message: null };
          db.trackingDestinations.push(dest);
        }
        Object.assign(dest, { pixel_id: body.pixelId, test_event_code: body.testEventCode, send_events: body.sendEvents });
        if (body.token) db.capiTokens[dest.id] = body.token;
        if (body.enabled && !db.capiTokens[dest.id]) {
          return res(400, { error: { code: "INVALID_STATE", message: "Cole o token da API de Conversões antes de ligar o envio." } });
        }
        dest.enabled = body.enabled;
        return res(200, { data: { id: dest.id, hasToken: db.capiTokens[dest.id] != null, enabled: dest.enabled } });
      }
      if (body.action === "remove_token") {
        delete db.capiTokens[dest.id];
        dest.enabled = false;
        return res(200, { data: { removed: true } });
      }
      if (body.action === "test") {
        if (!dest?.test_event_code) return res(400, { error: { code: "INVALID_STATE", message: "Informe o código de teste do Meta (Gerenciador de Eventos → Testar eventos) para enviar um evento de teste." } });
        const r = db.capiTestResult;
        db.trackingCapiLog.push({ id: db.trackingCapiLog.length + 1, destination_id: dest.id, requested_at: new Date().toISOString(), kind: "teste", events_count: 1, test: true, http_status: r.ok ? 200 : 400, events_received: r.ok ? 1 : null, error_message: r.ok ? null : r.message });
        return res(200, { data: { ok: r.ok, eventsReceived: r.ok ? 1 : null, message: r.message, fbtraceId: "demo" } });
      }
    }

    // --- Edge Function tracking-whatsapp (marcar Lead/Venda)
    if (url.includes("/functions/v1/tracking-whatsapp")) {
      const body = parse();
      db.functionCalls.push({ fn: "tracking-whatsapp", ...body });
      // T4.2: cadastro oficial do Meta (Coexistence). O "Meta" aqui é simulado: devolve um código para o retorno.
      if (String(body.action).startsWith("coex_")) {
        if (!["admin", "gestor"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
        const a = db.waApp;
        if (!(a.app_id && a.config_id && a.secret)) {
          return res(400, { error: { code: "INVALID_STATE", message: "O administrador precisa configurar o app do Meta da agência em Integrações → WhatsApp (Coexistence)." } });
        }
        if (body.action === "coex_start") {
          const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
          db.coexStates = [...(db.coexStates ?? []), { state, containerId: body.containerId, redirectUri: body.redirectUri }];
          // Em vez do Facebook, o simulador volta direto para o retorno do CRM com um código.
          return res(200, { data: { url: `${body.redirectUri}?code=codigo-simulado-do-meta&state=${state}` } });
        }
        const st = (db.coexStates ?? []).find((x) => x.state === body.state);
        db.coexStates = (db.coexStates ?? []).filter((x) => x.state !== body.state);
        if (!st || st.redirectUri !== body.redirectUri) return res(400, { error: { code: "INVALID_STATE", message: "Autorização inválida ou expirada. Tente ligar de novo." } });
        const ct = db.trackingContainers.find((t) => t.id === st.containerId);
        let conn = db.whatsappConnections.find((w) => w.container_id === st.containerId);
        if (!conn) {
          conn = { id: crypto.randomUUID(), container_id: st.containerId, client_id: ct?.client_id, has_app_secret: false, last_webhook_at: null, last_error_at: null, last_error_message: null };
          db.whatsappConnections.push(conn);
        }
        Object.assign(conn, { phone_number_id: "990000000042001", waba_id: "880000000042001", enabled: true, mode: "coexistencia",
          display_phone: "+55 45 3000-4242", verified_name: "Loja Atacado" });
        return res(200, { data: { containerId: st.containerId, displayPhone: conn.display_phone, verifiedName: conn.verified_name, numbers: 1 } });
      }
      if (String(body.action).startsWith("connection_")) {
        if (!["admin", "gestor"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
        let conn = db.whatsappConnections.find((w) => w.container_id === body.containerId);
        const webhookUrl = (id) => `https://demo.supabase.co/functions/v1/whatsapp-webhook?c=${id}`;
        if (body.action === "connection_save") {
          if (!/^\d{5,30}$/.test(body.phoneNumberId ?? "") || !/^\d{5,30}$/.test(body.wabaId ?? "")) {
            return res(400, { error: { code: "INVALID_INPUT", message: "O ID do número de telefone tem só números (fica em WhatsApp → Configuração da API)." } });
          }
          if (db.whatsappConnections.some((w) => w.phone_number_id === body.phoneNumberId && w.container_id !== body.containerId)) {
            return res(409, { error: { code: "INVALID_STATE", message: "Este número já está ligado a outro site." } });
          }
          if (!conn) {
            conn = { id: crypto.randomUUID(), container_id: body.containerId, enabled: false, last_webhook_at: null, last_error_at: null, last_error_message: null };
            db.whatsappConnections.push(conn);
            db.waSecrets[conn.id] = { verify: "demo" + conn.id.replace(/-/g, "").slice(0, 20) };
          }
          Object.assign(conn, { phone_number_id: body.phoneNumberId, waba_id: body.wabaId });
          if (body.appSecret) db.waSecrets[conn.id].app = body.appSecret;
          if (body.enabled && !db.waSecrets[conn.id].app) {
            return res(400, { error: { code: "INVALID_STATE", message: "Cole o segredo do app do Meta antes de ligar (sem ele não dá para conferir que o aviso veio mesmo do Meta)." } });
          }
          conn.enabled = body.enabled;
          return res(200, { data: { id: conn.id, enabled: conn.enabled, hasAppSecret: true, webhookUrl: webhookUrl(conn.id) } });
        }
        if (!conn) return res(404, { error: { code: "NOT_FOUND", message: "Salve a conexão primeiro." } });
        if (body.action === "connection_reveal") return res(200, { data: { webhookUrl: webhookUrl(conn.id), verifyToken: db.waSecrets[conn.id]?.verify ?? null } });
        db.waSecrets[conn.id] = {};
        conn.enabled = false;
        return res(200, { data: { removed: true } });
      }
      if (!["admin", "gestor", "operador"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
      const c = body.conversationId != null
        ? db.whatsappConversations.find((x) => x.id === body.conversationId)
        : db.whatsappClicks.find((x) => x.code === body.code);
      if (!c) return res(404, { error: { code: "NOT_FOUND", message: body.conversationId != null ? "Conversa não encontrada." : "Código não encontrado." } });
      if (body.kind === "lead") {
        if (c.status === "lead" || c.status === "venda") return res(200, { data: { status: "ja_marcado" } });
        c.status = "lead";
      } else {
        if (body.orderId && (c.orders ?? []).includes(body.orderId)) {
          return res(409, { error: { code: "INVALID_STATE", message: "Este nº de pedido já foi registrado para este site." } });
        }
        c.orders = [...(c.orders ?? []), body.orderId].filter(Boolean);
        c.status = "venda";
        c.sales = (c.sales ?? 0) + 1;
      }
      return res(200, { data: { status: "ok", leadId: 1 } });
    }

    // --- Edge Function admin-users
    if (url.includes("/functions/v1/ops-push")) {
      const body = parse();
      db.functionCalls.push({ fn: "ops-push", ...body });
      if (body.action === "public_key") return res(200, { data: { publicKey: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4" } });
      if (body.action === "test") {
        const mine = db.pushSubs.filter((x) => x.user_id === userId && !x.disabled_at);
        if (!mine.length) return res(400, { error: { code: "INVALID_STATE", message: 'Nenhum aparelho ativado. Clique em "Ativar neste aparelho" primeiro.' } });
        for (const x of mine) x.last_sent_at = new Date().toISOString();
        return res(200, { data: { sent: mine.length, failed: 0 } });
      }
      return res(401, { error: { code: "UNAUTHENTICATED", message: "Acesso negado." } });
    }
    if (url.includes("/functions/v1/admin-users")) {
      const body = parse();
      db.functionCalls.push(body);
      if (body.email === "repetido@agencia.com") {
        return res(409, { error: { code: "EMAIL_IN_USE", message: "Já existe um usuário com este e-mail." } });
      }
      if (body.action === "create") {
        const id = crypto.randomUUID();
        db.profiles.push({ id, email: body.email, full_name: body.fullName, role: body.role, active: true, created_at: new Date().toISOString(), updated_at: "" });
        return res(200, { data: { id } });
      }
      if (body.action === "update") {
        const p = db.profiles.find((x) => x.id === body.userId);
        if (p) Object.assign(p, body.fullName !== undefined ? { full_name: body.fullName } : {}, body.role ? { role: body.role } : {},
          body.active !== undefined ? { active: body.active } : {});
      }
      return res(200, { data: { id: body.userId ?? "x" } });
    }

    return res(404, {});
  };
}

